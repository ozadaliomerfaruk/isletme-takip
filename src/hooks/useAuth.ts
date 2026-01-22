import { useEffect, useState, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { Isletme } from '@/types/database';

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
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    isletme: null,
    loading: true,
    initialized: false,
    isletmeLoading: true,
    needsPasswordReset: false,
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
        if (error.message?.includes('refresh_token') || error.message?.includes('Invalid')) {
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
              || (userName ? `${userName}'in İşletmesi` : 'İşletmem');

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

            return newIsletme as Isletme;
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

    const requestPromise = executeRequest();
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
          });
          return;
        }

        if (session?.user) {
          // Önce session/user'ı hemen set et ki routing çalışsın
          setState({
            session,
            user: session.user,
            isletme: null,
            loading: false,
            initialized: true,
            isletmeLoading: true,
            needsPasswordReset: false,
          });

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

      // PASSWORD_RECOVERY event'ini özel olarak ele al
      // Kullanıcı şifremi unuttum akışından geldiğinde şifre değiştirme modal'ı göster
      if (event === 'PASSWORD_RECOVERY') {
        setState((prev) => ({
          ...prev,
          session,
          user: session?.user ?? null,
          needsPasswordReset: true,
          loading: false,
          initialized: true,
        }));
        return;
      }

      // TOKEN_REFRESHED eventinde sadece session'ı güncelle, isletme'yi tekrar çekme
      if (event === 'TOKEN_REFRESHED') {
        lastRefreshTime.current = Date.now();
        setState((prev) => ({
          ...prev,
          session,
          user: session?.user ?? null,
        }));
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
      }

      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [state.session, refreshSession]);

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
      email,
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
      email,
      password,
    });

    if (authError) {
      setState((prev) => ({ ...prev, loading: false }));
      throw authError;
    }

    if (!authData.user) {
      setState((prev) => ({ ...prev, loading: false }));
      throw new Error('Kullanıcı oluşturulamadı');
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
      throw new Error('İşletme oluşturulamadı. Lütfen tekrar deneyin.');
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

    setState({
      session: null,
      user: null,
      isletme: null,
      loading: false,
      initialized: true,
      isletmeLoading: false,
      needsPasswordReset: false,
    });
  };

  // Şifre değiştirme bayrağını temizle
  const clearPasswordReset = useCallback(() => {
    setState((prev) => ({ ...prev, needsPasswordReset: false }));
  }, []);

  // İşletme bilgisini yenile
  const refreshIsletme = async () => {
    if (!state.user) return;

    const isletme = await fetchIsletme(state.user.id);
    setState((prev) => ({ ...prev, isletme }));
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
        throw new Error('Apple kimlik doğrulama başarısız');
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
    } catch (error: any) {
      setState((prev) => ({ ...prev, loading: false }));

      if (error.code === 'ERR_REQUEST_CANCELED') {
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
    if (!state.user || !state.isletme) {
      throw new Error('Kullanıcı bulunamadı');
    }

    setState((prev) => ({ ...prev, loading: true }));

    try {
      const isletmeId = state.isletme.id;

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

      setState({
        session: null,
        user: null,
        isletme: null,
        loading: false,
        initialized: true,
        isletmeLoading: false,
        needsPasswordReset: false,
      });
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    }
  };

  // Hesap silme isteğini iptal et
  const cancelAccountDeletion = async () => {
    if (!state.user || !state.isletme) {
      throw new Error('Kullanıcı bulunamadı');
    }

    setState((prev) => ({ ...prev, loading: true }));

    try {
      const isletmeId = state.isletme.id;

      // Silme tarihini kaldır
      const { error } = await supabase
        .from('isletmeler')
        .update({ scheduled_deletion_at: null })
        .eq('id', isletmeId);

      if (error) throw error;

      // State'i güncelle
      setState((prev) => ({
        ...prev,
        isletme: prev.isletme ? { ...prev.isletme, scheduled_deletion_at: null } : null,
        loading: false,
      }));
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    }
  };

  // Şifre değiştir
  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!state.user?.email) {
      throw new Error('Kullanıcı bulunamadı');
    }

    // 1. Mevcut şifreyi doğrula (email + currentPassword ile sign in)
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: state.user.email,
      password: currentPassword,
    });

    if (verifyError) {
      throw new Error('WRONG_PASSWORD');
    }

    // 2. Yeni şifreyi güncelle
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) throw updateError;
  };

  // Apple Sign-In kullanılabilir mi kontrol et
  const isAppleSignInAvailable = Platform.OS === 'ios';

  return {
    ...state,
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
  };
}
