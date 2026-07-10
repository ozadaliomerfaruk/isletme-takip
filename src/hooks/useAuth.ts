import { useEffect, useState, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import * as AppleAuthentication from 'expo-apple-authentication';
import type * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { wipePersistedCache } from '@/lib/queryClient';
import { logEvent, setEventContext } from '@/lib/appEvents';
import { markNeedsSetup } from '@/lib/setupFlow';
import { Isletme } from '@/types/database';
import { toErrorMessage } from '@/lib/errors';
import type { Permissions, UserRole } from '@/types/multiUser';
import i18n from '@/i18n';

// Google auth session için gerekli
WebBrowser.maybeCompleteAuthSession();

interface AuthState {
  session: Session | null;
  user: User | null;
  isletme: Isletme | null;
  loading: boolean;
  initialized: boolean;
  isletmeLoading: boolean;
  needsPasswordReset: boolean;
  // Multi-user fields
  ownIsletme: Isletme | null;  // Kullanıcının kendi işletmesi (her zaman saklanır)
  isOwner: boolean;             // Aktif işletmenin sahibi mi?
  currentPermissions: Permissions | null;  // Paylaşılan işletmedeki yetkiler
  currentUserRole: UserRole | 'owner' | null;  // Aktif rol
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    isletme: null,
    loading: true,
    initialized: false,
    isletmeLoading: true,
    needsPasswordReset: false,
    ownIsletme: null,
    isOwner: true,
    currentPermissions: null,
    currentUserRole: null,
  });

  // AppState için ref - arka plan/ön plan takibi
  const appState = useRef(AppState.currentState);
  const lastRefreshTime = useRef<number>(Date.now());

  // Race condition önleme - eşzamanlı fetchIsletme çağrılarını engelle
  // Map kullanarak her userId için ayrı promise takibi yapıyoruz
  const pendingRequests = useRef<Map<string, Promise<Isletme | null>>>(new Map());
  // İşletme oluşturma lock'u - duplicate oluşturmayı engelle (global lock)
  const createIsletmeLock = useRef<Promise<Isletme | null> | null>(null);

  // Session'ı yenile - arka plandan dönüşte veya token süresi dolmak üzereyken çağrılır
  const refreshSession = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession();

      if (error) {
        if (__DEV__) {
          console.error('Session yenileme hatası:', error);
        }
        // Refresh token da geçersizse kullanıcıyı çıkış yaptır
        if (toErrorMessage(error)?.includes('refresh_token') || toErrorMessage(error)?.includes('Invalid')) {
          if (__DEV__) {
            console.log('Refresh token geçersiz, çıkış yapılıyor...');
          }
          setState({
            session: null,
            user: null,
            isletme: null,
            loading: false,
            initialized: true,
            isletmeLoading: false,
            needsPasswordReset: false,
            ownIsletme: null,
            isOwner: true,
            currentPermissions: null,
            currentUserRole: null,
          });
        }
        return null;
      }

      lastRefreshTime.current = Date.now();
      return session;
    } catch (error) {
      if (__DEV__) {
        console.error('Session yenileme exception:', error);
      }
      return null;
    }
  }, []);

  // Token'ın süresinin dolup dolmadığını veya dolmak üzere olduğunu kontrol et
  const checkAndRefreshToken = useCallback(async () => {
    // Güncel session'ı Supabase'den al (stale state sorununu önler)
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession) return;

    const expiresAt = currentSession.expires_at;
    if (!expiresAt) return;

    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = expiresAt - now;

    // Token 5 dakika içinde dolacaksa veya zaten dolmuşsa yenile
    if (timeUntilExpiry < 300) {
      await refreshSession();
    }
  }, [refreshSession]);

  // İşletme bilgisini getir veya oluştur - race condition korumalı
  const fetchOrCreateIsletme = useCallback(async (
    userId: string,
    userName?: string | null,
    isletmeName?: string | null
  ): Promise<Isletme | null> => {
    // Aynı userId için zaten bir istek varsa, mevcut Promise'i bekle
    const existingRequest = pendingRequests.current.get(userId);
    if (existingRequest) {
      return existingRequest;
    }

    // Yeni bir istek oluştur ve hemen Map'e ekle (senkron işlem - race condition yok)
    const executeRequest = async (): Promise<Isletme | null> => {
      try {
        // Önce mevcut işletmeyi kontrol et
        const { data, error } = await supabase
          .from('isletmeler')
          .select('*')
          .eq('user_id', userId)
          .limit(1)
          .single();

        if (data) {
          return data as Isletme;
        }

        // İşletme bulunamadı (PGRST116 = no rows)
        if (error && error.code !== 'PGRST116') {
          if (__DEV__) {
            console.error('İşletme getirme hatası:', error);
          }
          return null;
        }

        // İşletme yoksa oluştur
        // Eğer başka bir oluşturma işlemi varsa, onu bekle
        if (createIsletmeLock.current) {
          await createIsletmeLock.current;
          // Oluşturma bittikten sonra tekrar kontrol et
          const { data: retryData } = await supabase
            .from('isletmeler')
            .select('*')
            .eq('user_id', userId)
            .limit(1)
            .single();
          if (retryData) {
            return retryData as Isletme;
          }
        }

        // Oluşturma işlemi için yeni bir lock oluştur
        const createPromise = (async (): Promise<Isletme | null> => {
          try {
            const finalIsletmeName = isletmeName
              || (userName ? `${userName}'s Business` : 'My Business');

            // Upsert kullan - conflict durumunda mevcut kaydı döndür
            const { data: newIsletme, error: insertError } = await supabase
              .from('isletmeler')
              .upsert(
                {
                  user_id: userId,
                  name: finalIsletmeName,
                },
                {
                  onConflict: 'user_id',
                  ignoreDuplicates: true,
                }
              )
              .select()
              .single();

            if (insertError) {
              // Duplicate key hatası veya başka hata - mevcut kaydı getir
              if (__DEV__) {
                console.log('İşletme oluşturma/upsert hatası, mevcut kaydı getiriliyor:', insertError);
              }
              const { data: existingIsletme } = await supabase
                .from('isletmeler')
                .select('*')
                .eq('user_id', userId)
                .limit(1)
                .single();
              return existingIsletme as Isletme | null;
            }

            const created = newIsletme as Isletme;
            // Olay bağlamını garanti et (ilk kayıtta AuthContext henüz set etmemiş olabilir)
            setEventContext(userId, created.id);
            logEvent('business_created');
            // Yeni işletme → kurulum akışını (sektör + ilk kayıt) tetikle.
            // YALNIZCA create yolunda set edilir; mevcut kullanıcılar etkilenmez.
            markNeedsSetup();
            return created;
          } finally {
            createIsletmeLock.current = null;
          }
        })();

        createIsletmeLock.current = createPromise;
        return createPromise;
      } finally {
        // Bu userId için pending request'i temizle
        pendingRequests.current.delete(userId);
      }
    };

    const requestPromise = executeRequest().catch((err) => {
      pendingRequests.current.delete(userId);
      throw err;
    });
    pendingRequests.current.set(userId, requestPromise);
    return requestPromise;
  }, []);

  // Sadece işletme getir (oluşturma yapma) - read-only işlemler için
  const fetchIsletme = useCallback(async (userId: string): Promise<Isletme | null> => {
    const { data, error } = await supabase
      .from('isletmeler')
      .select('*')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      if (__DEV__) {
        console.error('İşletme getirme hatası:', error);
      }
    }

    return data as Isletme | null;
  }, []);

  // Auth state değişikliklerini dinle
  useEffect(() => {
    let isMounted = true;

    // Mevcut session'ı al
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (error) {
          if (__DEV__) {
            console.error('Session getirme hatası:', error);
          }
          setState({
            session: null,
            user: null,
            isletme: null,
            loading: false,
            initialized: true,
            isletmeLoading: false,
            needsPasswordReset: false,
            ownIsletme: null,
            isOwner: true,
            currentPermissions: null,
            currentUserRole: null,
          });
          return;
        }

        if (session?.user) {
          // Önce session/user'ı hemen set et ki routing çalışsın
          setState((prev) => ({
            ...prev,
            session,
            user: session.user,
            isletme: null,
            loading: false,
            initialized: true,
            isletmeLoading: true,
            needsPasswordReset: false,
          }));

          // Sonra işletmeyi arka planda getir
          try {
            const userName = session.user.user_metadata?.full_name?.split(' ')[0]
              || session.user.user_metadata?.name?.split(' ')[0]
              || null;
            const isletmeName = session.user.user_metadata?.isletme_name || null;
            const isletme = await fetchOrCreateIsletme(session.user.id, userName, isletmeName);

            if (!isMounted) return;

            setState((prev) => ({
              ...prev,
              isletme,
              ownIsletme: isletme,
              isOwner: true,
              currentPermissions: null,
              currentUserRole: isletme ? 'owner' : null,
              isletmeLoading: false,
            }));
          } catch (e) {
            if (__DEV__) {
              console.error('İşletme getirme/oluşturma hatası:', e);
            }
            if (!isMounted) return;
            setState((prev) => ({
              ...prev,
              isletmeLoading: false,
            }));
          }
        } else {
          if (!isMounted) return;
          setState({
            session: null,
            user: null,
            isletme: null,
            loading: false,
            initialized: true,
            isletmeLoading: false,
            needsPasswordReset: false,
            ownIsletme: null,
            isOwner: true,
            currentPermissions: null,
            currentUserRole: null,
          });
        }
      } catch (error) {
        if (__DEV__) {
          console.error('Auth başlatma hatası:', error);
        }
        if (isMounted) {
          setState({
            session: null,
            user: null,
            isletme: null,
            loading: false,
            initialized: true,
            isletmeLoading: false,
            needsPasswordReset: false,
            ownIsletme: null,
            isOwner: true,
            currentPermissions: null,
            currentUserRole: null,
          });
        }
      }
    };

    // Timeout ref - initializeAuth tamamlandığında iptal edilecek
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let authInitialized = false;

    const initWithTimeout = async () => {
      // Timeout'u başlat - 30 saniye
      timeoutId = setTimeout(() => {
        if (isMounted && !authInitialized) {
          if (__DEV__) {
            console.warn('Auth başlatma zaman aşımı');
          }
          // Session'ı sıfırlamak yerine, sadece loading'i kapat
          // Mevcut session varsa koruyalım
          setState((prev) => ({
            ...prev,
            loading: false,
            initialized: true,
            isletmeLoading: false,
          }));
        }
      }, 30000);

      await initializeAuth();

      // Başarıyla tamamlandı, timeout'u iptal et
      authInitialized = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    initWithTimeout();

    // Auth değişikliklerini dinle
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      // PASSWORD_RECOVERY event'i: Kullanıcı şifremi unuttum akışından geldi
      // needsPasswordReset'i set et ki ChangePasswordModal gösterilsin
      if (event === 'PASSWORD_RECOVERY') {
        setState((prev) => ({ ...prev, needsPasswordReset: true }));
        // Aşağıdaki kod bloğu session/user güncellemesini yapacak
      }

      // TOKEN_REFRESHED: token yenilenir ama user KİMLİĞİ değişmez (aynı user, yalnız yeni erişim token'ı).
      // PERF (P1 — kimlik koruma): state'i GÜNCELLEMİYORUZ. Gerekçe: (a) context'ten session/token OKUYAN
      // tüketici YOK (grep doğrulandı — API çağrıları supabase client'ının kendi tazelenmiş token'ını kullanır,
      // iç effect'ler yalnız session TRUTHINESS'ine bakar); (b) güncellersek her yenilemede (2 dk'da bir +
      // her foreground'da refreshSession sonrası) YENİ user/session nesnesi → useAuthContext'in 75 tüketicisi
      // gereksiz re-render + AppState/token-check effect'leri gereksiz re-subscribe olurdu. Gerçek user
      // değişiklikleri (metadata/e-posta) ayrı bir event'tir (USER_UPDATED → aşağıdaki dal user'ı günceller).
      if (event === 'TOKEN_REFRESHED') {
        lastRefreshTime.current = Date.now();
        return;
      }

      // SIGNED_OUT eventinde state'i temizle
      if (event === 'SIGNED_OUT') {
        setState({
          session: null,
          user: null,
          isletme: null,
          loading: false,
          initialized: true,
          isletmeLoading: false,
          needsPasswordReset: false,
          ownIsletme: null,
          isOwner: true,
          currentPermissions: null,
          currentUserRole: null,
        });
        return;
      }

      // SIGNED_IN, INITIAL_SESSION, USER_UPDATED eventlerinde
      // Önce session/user'ı hemen güncelle ki routing çalışsın
      if (session?.user) {
        setState((prev) => ({
          ...prev,
          session,
          user: session.user,
          loading: false,
          initialized: true,
          isletmeLoading: true, // İşletme yükleniyor
        }));

        // Sonra işletmeyi arka planda getir/oluştur
        try {
          const userName = session.user.user_metadata?.full_name?.split(' ')[0]
            || session.user.user_metadata?.name?.split(' ')[0]
            || null;
          const isletmeName = session.user.user_metadata?.isletme_name || null;
          const isletme = await fetchOrCreateIsletme(session.user.id, userName, isletmeName);

          if (!isMounted) return;

          setState((prev) => ({
            ...prev,
            isletme: isletme ?? prev.isletme,
            ownIsletme: isletme ?? prev.ownIsletme,
            isOwner: true,
            currentPermissions: null,
            currentUserRole: isletme ? 'owner' : prev.currentUserRole,
            isletmeLoading: false,
          }));
        } catch (e) {
          if (__DEV__) {
            console.error('İşletme getirme/oluşturma hatası:', e);
          }
          if (!isMounted) return;
          setState((prev) => ({
            ...prev,
            isletmeLoading: false,
          }));
        }
      } else {
        // Session yok
        if (!isMounted) return;
        setState((prev) => ({
          ...prev,
          session: null,
          user: null,
          loading: false,
          initialized: true,
          isletmeLoading: false,
        }));
      }
    });

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      subscription.unsubscribe();
    };
  }, [fetchOrCreateIsletme]);

  // AppState değişikliklerini dinle - arka plandan dönüşte session yenile
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      // Arka plandan ön plana geçiş
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // Son yenilemeden bu yana en az 1 dakika geçtiyse session'ı yenile
        const timeSinceLastRefresh = Date.now() - lastRefreshTime.current;
        const ONE_MINUTE = 60 * 1000;

        if (timeSinceLastRefresh > ONE_MINUTE && state.session) {
          await refreshSession();
        }

        // Paylaşılan moddayken yetkileri de yenile
        if (!state.isOwner && state.isletme && state.user) {
          try {
            const { data, error } = await supabase
              .from('isletme_users')
              .select('permissions, role, status')
              .eq('isletme_id', state.isletme.id)
              .eq('user_id', state.user.id)
              .eq('status', 'active')
              .single();

            if (error || !data) {
              // Kullanıcı artık bu işletmede aktif değil
              setState((prev) => {
                if (!prev.ownIsletme) return prev;
                return { ...prev, isletme: prev.ownIsletme, isOwner: true, currentPermissions: null, currentUserRole: 'owner' };
              });
            } else {
              setState((prev) => ({
                ...prev,
                currentPermissions: data.permissions as Permissions,
                currentUserRole: data.role as UserRole,
              }));
            }
          } catch {
            // Sessizce hata yut
          }
        }
      }

      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [state.session, state.isOwner, state.isletme, state.user, refreshSession]);

  // Periyodik token kontrolü - her 2 dakikada bir token süresini kontrol et
  useEffect(() => {
    if (!state.session) return;

    // İlk kontrolü hemen yap
    checkAndRefreshToken();

    const interval = setInterval(() => {
      checkAndRefreshToken();
    }, 2 * 60 * 1000); // 2 dakika

    return () => clearInterval(interval);
  }, [state.session, checkAndRefreshToken]);

  // Giriş yap
  const signIn = async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true }));

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    }

    return data;
  };

  // Kayıt ol
  const signUp = async (email: string, password: string, isletmeName: string) => {
    setState((prev) => ({ ...prev, loading: true }));

    // Kullanıcı oluştur
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          isletme_name: isletmeName,
        },
      },
    });

    if (authError) {
      setState((prev) => ({ ...prev, loading: false }));
      throw authError;
    }

    if (!authData.user) {
      setState((prev) => ({ ...prev, loading: false }));
      throw new Error(i18n.t('common:errors.userCreationFailed'));
    }

    // İşletme oluştur
    const { data: isletmeData, error: isletmeError } = await supabase
      .from('isletmeler')
      .insert({
        user_id: authData.user.id,
        name: isletmeName,
      })
      .select()
      .single();

    if (isletmeError) {
      if (__DEV__) {
        console.error('İşletme oluşturma hatası:', isletmeError);
      }
      // Auth'u geri almak zor, bu yüzden kullanıcıya hata göster
      setState((prev) => ({ ...prev, loading: false }));
      throw new Error(i18n.t('common:errors.businessCreationFailed'));
    }

    setState((prev) => ({
      ...prev,
      isletme: isletmeData,
      loading: false,
    }));

    return { user: authData.user, isletme: isletmeData };
  };

  // Çıkış yap
  const signOut = async () => {
    setState((prev) => ({ ...prev, loading: true }));

    const { error } = await supabase.auth.signOut();

    // AuthSessionMissingError durumunda da çıkış başarılı sayılmalı
    // Çünkü session zaten yok, kullanıcı fiilen çıkış yapmış
    if (error && error.name !== 'AuthSessionMissingError') {
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    }

    // Önceki kullanıcının verilerinin sızmaması için query cache'i BELLEKTEN VE
    // DİSKTEN temizle (persist read-cache açık; disk temizlenmezse sonraki
    // kullanıcı soğuk açılışta öncekinin verisini görürdü).
    await wipePersistedCache();

    setState({
      session: null,
      user: null,
      isletme: null,
      loading: false,
      initialized: true,
      isletmeLoading: false,
      needsPasswordReset: false,
      ownIsletme: null,
      isOwner: true,
      currentPermissions: null,
      currentUserRole: null,
    });
  };

  // Şifre değiştirme bayrağını temizle
  const clearPasswordReset = useCallback(() => {
    setState((prev) => ({ ...prev, needsPasswordReset: false }));
  }, []);

  // Şifre sıfırlama bayrağını aç (deep link'ten gelen recovery akışı için)
  const triggerPasswordReset = useCallback(() => {
    setState((prev) => ({ ...prev, needsPasswordReset: true }));
  }, []);

  // İşletme bilgisini yenile
  const refreshIsletme = async () => {
    if (!state.user) return;

    const isletme = await fetchIsletme(state.user.id);
    setState((prev) => ({
      ...prev,
      ownIsletme: isletme,
      // Sadece kendi işletmesindeyse güncelle, paylaşılan moddaysa dokunma
      isletme: prev.isOwner ? isletme : prev.isletme,
    }));
  };

  // Apple ile giriş yap
  const signInWithApple = async () => {
    try {
      setState((prev) => ({ ...prev, loading: true }));

      // Apple authentication
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error(i18n.t('common:errors.appleAuthFailed'));
      }

      // Supabase ile oturum aç
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) {
        throw error;
      }

      // Kullanıcı için işletme var mı kontrol et, yoksa oluştur
      if (data.user) {
        const userName = credential.fullName?.givenName || null;
        const isletme = await fetchOrCreateIsletme(data.user.id, userName);

        // State'i güncelle
        setState((prev) => ({
          ...prev,
          session: data.session,
          user: data.user,
          isletme,
          loading: false,
        }));
      }

      return data;
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false }));

      if (error instanceof Error && (error as Error & { code?: string }).code === 'ERR_REQUEST_CANCELED') {
        // Kullanıcı iptal etti
        return null;
      }

      throw error;
    }
  };

  // Google ile giriş yap
  const signInWithGoogle = async (idToken: string) => {
    try {
      setState((prev) => ({ ...prev, loading: true }));

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      if (error) {
        throw error;
      }

      // NOT: İşletme oluşturma/getirme işlemini burada yapmıyoruz.
      // onAuthStateChange listener'ı SIGNED_IN event'inde bunu zaten yapacak.
      // Bu sayede race condition ve duplicate çağrılar önleniyor.
      // State güncellemesi de onAuthStateChange tarafından yapılacak.

      return data;
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    }
  };

  // Hesap silme isteği (7 gün sonra silinecek)
  const deleteAccount = async () => {
    if (!state.user || !state.ownIsletme) {
      throw new Error(i18n.t('common:errors.userNotFound'));
    }

    setState((prev) => ({ ...prev, loading: true }));

    try {
      const isletmeId = state.ownIsletme.id;

      // 7 gün sonrası için silme tarihi ayarla
      const deletionDate = new Date();
      deletionDate.setDate(deletionDate.getDate() + 7);

      // İşletmeye silme tarihi ekle
      const { error } = await supabase
        .from('isletmeler')
        .update({ scheduled_deletion_at: deletionDate.toISOString() })
        .eq('id', isletmeId);

      if (error) throw error;

      // Kullanıcıyı çıkış yaptır
      await supabase.auth.signOut();

      // Persist read-cache'i bellek + diskten sil (veri sızmasın)
      await wipePersistedCache();

      setState({
        session: null,
        user: null,
        isletme: null,
        loading: false,
        initialized: true,
        isletmeLoading: false,
        needsPasswordReset: false,
        ownIsletme: null,
        isOwner: true,
        currentPermissions: null,
        currentUserRole: null,
      });
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    }
  };

  // Hesap silme isteğini iptal et
  const cancelAccountDeletion = async () => {
    if (!state.user || !state.ownIsletme) {
      throw new Error(i18n.t('common:errors.userNotFound'));
    }

    setState((prev) => ({ ...prev, loading: true }));

    try {
      const isletmeId = state.ownIsletme.id;

      // Silme tarihini kaldır
      const { error } = await supabase
        .from('isletmeler')
        .update({ scheduled_deletion_at: null })
        .eq('id', isletmeId);

      if (error) throw error;

      // State'i güncelle
      setState((prev) => ({
        ...prev,
        ownIsletme: prev.ownIsletme ? { ...prev.ownIsletme, scheduled_deletion_at: null } : null,
        isletme: prev.isOwner && prev.isletme ? { ...prev.isletme, scheduled_deletion_at: null } : prev.isletme,
        loading: false,
      }));
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    }
  };

  // Şifre değiştir (mevcut şifre doğrulaması yok - kullanıcı zaten giriş yapmış)
  const changePassword = async (newPassword: string) => {
    if (!state.user?.email) {
      throw new Error(i18n.t('common:errors.userNotFound'));
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) throw updateError;
  };

  // Apple Sign-In kullanılabilir mi kontrol et
  const isAppleSignInAvailable = Platform.OS === 'ios';

  // Paylaşılan işletmeye geçiş
  const switchToSharedIsletme = useCallback(async (
    sharedIsletme: Isletme,
    permissions: Permissions,
    role: UserRole,
  ) => {
    // Önce bekleyen sorguları iptal et ve cache'i stale olarak işaretle
    await queryClient.cancelQueries();
    queryClient.invalidateQueries();

    setState((prev) => ({
      ...prev,
      isletme: sharedIsletme,
      isOwner: false,
      currentPermissions: permissions,
      currentUserRole: role,
    }));
  }, [queryClient]);

  // Kendi işletmesine geri dön
  const switchToOwnIsletme = useCallback(() => {
    // Bekleyen sorguları iptal et ve cache'i stale olarak işaretle
    queryClient.cancelQueries();
    queryClient.invalidateQueries();

    setState((prev) => {
      if (!prev.ownIsletme) return prev;
      return {
        ...prev,
        isletme: prev.ownIsletme,
        isOwner: true,
        currentPermissions: null,
        currentUserRole: 'owner',
      };
    });
  }, [queryClient]);

  // Paylaşılan modda mıyız?
  const isSharedMode = !state.isOwner;

  // Paylaşılan moddayken yetkileri yeniden yükle
  const refreshPermissions = useCallback(async () => {
    if (state.isOwner || !state.user || !state.isletme) return;
    try {
      const { data, error } = await supabase
        .from('isletme_users')
        .select('permissions, role, status')
        .eq('isletme_id', state.isletme.id)
        .eq('user_id', state.user.id)
        .eq('status', 'active')
        .single();

      if (error || !data) {
        // Kullanıcı artık bu işletmede aktif değil, kendi işletmesine dön
        switchToOwnIsletme();
        return;
      }

      setState((prev) => ({
        ...prev,
        currentPermissions: data.permissions as Permissions,
        currentUserRole: data.role as UserRole,
      }));
    } catch {
      // Sessizce hata yut - bir sonraki refresh'te tekrar dener
    }
  }, [state.isOwner, state.user, state.isletme, switchToOwnIsletme]);

  return {
    ...state,
    isSharedMode,
    signIn,
    signUp,
    signOut,
    deleteAccount,
    cancelAccountDeletion,
    refreshIsletme,
    signInWithApple,
    signInWithGoogle,
    isAppleSignInAvailable,
    changePassword,
    clearPasswordReset,
    triggerPasswordReset,
    switchToSharedIsletme,
    switchToOwnIsletme,
    refreshPermissions,
  };
}
