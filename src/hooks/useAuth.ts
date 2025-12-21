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
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    isletme: null,
    loading: true,
    initialized: false,
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
    // Mevcut session'ı al
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      let isletme: Isletme | null = null;

      if (session?.user) {
        isletme = await fetchIsletme(session.user.id);
      }

      setState({
        session,
        user: session?.user ?? null,
        isletme,
        loading: false,
        initialized: true,
      });
    });

    // Auth değişikliklerini dinle
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      let isletme: Isletme | null = null;

      if (session?.user) {
        isletme = await fetchIsletme(session.user.id);
      }

      setState((prev) => ({
        ...prev,
        session,
        user: session?.user ?? null,
        isletme,
        loading: false,
      }));
    });

    return () => subscription.unsubscribe();
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
        const existingIsletme = await fetchIsletme(data.user.id);

        if (!existingIsletme) {
          // İlk giriş - işletme oluştur
          const userName = credential.fullName?.givenName || 'İşletmem';
          await supabase
            .from('isletmeler')
            .insert({
              user_id: data.user.id,
              name: `${userName}'in İşletmesi`,
            });
        }
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
        const existingIsletme = await fetchIsletme(data.user.id);

        if (!existingIsletme) {
          // İlk giriş - işletme oluştur
          const userName = data.user.user_metadata?.full_name?.split(' ')[0] || 'İşletmem';
          await supabase
            .from('isletmeler')
            .insert({
              user_id: data.user.id,
              name: `${userName}'in İşletmesi`,
            });
        }
      }

      return data;
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
    refreshIsletme,
    signInWithApple,
    signInWithGoogle,
    isAppleSignInAvailable,
  };
}
