import { useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
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

  // İşletme bilgisini getir
  const fetchIsletme = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('isletmeler')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('İşletme getirme hatası:', error);
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

    // Timeout ile koruma - 10 saniye içinde başlatılamazsa devam et
    const timeout = setTimeout(() => {
      if (isMounted && !state.initialized) {
        console.warn('Auth başlatma zaman aşımı');
        setState({
          session: null,
          user: null,
          isletme: null,
          loading: false,
          initialized: true,
          isletmeLoading: false,
        });
      }
    }, 10000);

    initializeAuth();

    // Auth değişikliklerini dinle
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

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
        isletme,
        loading: false,
        isletmeLoading: false,
      }));
    });

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchIsletme]);

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
