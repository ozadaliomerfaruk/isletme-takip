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
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    isletme: null,
    loading: true,
    initialized: false,
    isletmeLoading: true,
  });

  // AppState için ref - arka plan/ön plan takibi
  const appState = useRef(AppState.currentState);
  const lastRefreshTime = useRef<number>(Date.now());

  // Race condition önleme - eşzamanlı fetchIsletme çağrılarını engelle
  const fetchIsletmeInProgress = useRef<string | null>(null);

  // Session'ı yenile - arka plandan dönüşte veya token süresi dolmak üzereyken çağrılır
  const refreshSession = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession();

      if (error) {
        console.error('Session yenileme hatası:', error);
        // Refresh token da geçersizse kullanıcıyı çıkış yaptır
        if (error.message?.includes('refresh_token') || error.message?.includes('Invalid')) {
          console.log('Refresh token geçersiz, çıkış yapılıyor...');
          setState({
            session: null,
            user: null,
            isletme: null,
            loading: false,
            initialized: true,
            isletmeLoading: false,
          });
        }
        return null;
      }

      lastRefreshTime.current = Date.now();
      return session;
    } catch (error) {
      console.error('Session yenileme exception:', error);
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

  // İşletme bilgisini getir - race condition korumalı
  const fetchIsletme = useCallback(async (userId: string): Promise<Isletme | null> => {
    // Aynı userId için zaten bir istek varsa, bekle ve sonucu paylaş
    if (fetchIsletmeInProgress.current === userId) {
      // Zaten devam eden bir istek var, null döndür (state zaten güncellenecek)
      return null;
    }

    fetchIsletmeInProgress.current = userId;

    try {
      const { data, error } = await supabase
        .from('isletmeler')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('İşletme getirme hatası:', error);
      }

      return data as Isletme | null;
    } finally {
      fetchIsletmeInProgress.current = null;
    }
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
          console.error('Session getirme hatası:', error);
          setState({
            session: null,
            user: null,
            isletme: null,
            loading: false,
            initialized: true,
            isletmeLoading: false,
          });
          return;
        }

        let isletme: Isletme | null = null;
        if (session?.user) {
          try {
            isletme = await fetchIsletme(session.user.id);
          } catch (e) {
            console.error('İşletme getirme hatası:', e);
          }
        }

        if (!isMounted) return;

        setState({
          session,
          user: session?.user ?? null,
          isletme,
          loading: false,
          initialized: true,
          isletmeLoading: false,
        });
      } catch (error) {
        console.error('Auth başlatma hatası:', error);
        if (isMounted) {
          setState({
            session: null,
            user: null,
            isletme: null,
            loading: false,
            initialized: true,
            isletmeLoading: false,
          });
        }
      }
    };

    // Timeout ref - initializeAuth tamamlandığında iptal edilecek
    let timeoutId: NodeJS.Timeout | null = null;
    let authInitialized = false;

    const initWithTimeout = async () => {
      // Timeout'u başlat - 30 saniye
      timeoutId = setTimeout(() => {
        if (isMounted && !authInitialized) {
          console.warn('Auth başlatma zaman aşımı');
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
        });
        return;
      }

      // SIGNED_IN, INITIAL_SESSION, USER_UPDATED eventlerinde isletme'yi çek
      let isletme: Isletme | null = null;
      if (session?.user) {
        try {
          isletme = await fetchIsletme(session.user.id);
        } catch (e) {
          console.error('İşletme getirme hatası:', e);
        }
      }

      if (!isMounted) return;

      setState((prev) => ({
        ...prev,
        session,
        user: session?.user ?? null,
        isletme: isletme ?? prev.isletme,
        loading: false,
        isletmeLoading: false,
      }));
    });

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      subscription.unsubscribe();
    };
  }, [fetchIsletme]);

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
      console.error('İşletme oluşturma hatası:', isletmeError);
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

    if (error) {
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
    });
  };

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
        let isletme = await fetchIsletme(data.user.id);

        if (!isletme) {
          // İlk giriş - işletme oluştur
          const userName = credential.fullName?.givenName || 'İşletmem';
          const { data: newIsletme } = await supabase
            .from('isletmeler')
            .insert({
              user_id: data.user.id,
              name: `${userName}'in İşletmesi`,
            })
            .select()
            .single();

          isletme = newIsletme;
        }

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

      // Kullanıcı için işletme var mı kontrol et, yoksa oluştur
      if (data.user) {
        let isletme = await fetchIsletme(data.user.id);

        if (!isletme) {
          // İlk giriş - işletme oluştur
          const userName = data.user.user_metadata?.full_name?.split(' ')[0] || 'İşletmem';
          const { data: newIsletme } = await supabase
            .from('isletmeler')
            .insert({
              user_id: data.user.id,
              name: `${userName}'in İşletmesi`,
            })
            .select()
            .single();

          isletme = newIsletme;
        }

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
  };
}
