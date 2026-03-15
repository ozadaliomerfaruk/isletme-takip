import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Linking from 'expo-linking';
import { Text } from '@/components/ui';
import { useAuthContext } from '@/contexts/AuthContext';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { supabase } from '@/lib/supabase';
import { toErrorMessage } from '@/lib/errors';

/**
 * Reset password deep link handler.
 * Bu sayfa deep link'ten gelen şifre sıfırlama akışını işler:
 * 1. URL'den access_token ve refresh_token'ı çıkarır
 * 2. Session oluşturur
 * 3. needsPasswordReset bayrağını açar
 * 4. /(tabs)'a yönlendirir - ChangePasswordModal orada gösterilir
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useTranslation(['auth', 'common', 'errors']);
  const { triggerPasswordReset } = useAuthContext();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleDeepLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeepLink = async () => {
    try {
      // URL'den hash fragment'ı al
      const url = await Linking.getInitialURL();
      let accessToken: string | null = null;
      let refreshToken: string | null = null;

      if (url) {
        // Hash fragment'tan token'ları çıkar
        const hashIndex = url.indexOf('#');
        if (hashIndex !== -1) {
          const hash = url.substring(hashIndex + 1);
          const params = new URLSearchParams(hash);
          accessToken = params.get('access_token');
          refreshToken = params.get('refresh_token');
        }

        // Query params'tan da kontrol et
        if (!accessToken) {
          const queryIndex = url.indexOf('?');
          if (queryIndex !== -1) {
            const query = url.substring(queryIndex + 1);
            const queryParams = new URLSearchParams(query);
            accessToken = queryParams.get('access_token');
            refreshToken = queryParams.get('refresh_token');
          }
        }
      }

      if (accessToken && refreshToken) {
        // Bu bir şifre sıfırlama akışı - bayrağı aç
        triggerPasswordReset();

        // Session'ı ayarla
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) throw sessionError;

        // Ana sayfaya yönlendir - ChangePasswordModal orada gösterilecek
        router.replace('/(tabs)');
      } else {
        // Token bulunamadı, mevcut session'ı kontrol et
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          // Mevcut session var - bu sayfaya doğrudan gelindi, recovery akışı
          triggerPasswordReset();
          router.replace('/(tabs)');
        } else {
          throw new Error(t('errors:auth.linkExpired'));
        }
      }
    } catch (err) {
      if (__DEV__) {
        console.error('Deep link error:', err);
      }
      setError(toErrorMessage(err) || t('errors:general.generic'));
      // 3 saniye sonra forgot-password'a yönlendir
      setTimeout(() => router.replace('/(auth)/forgot-password'), 3000);
    }
  };

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text variant="h2" color="error" style={styles.errorTitle}>
            {t('common:status.error')}
          </Text>
          <Text variant="body" color="secondary" center style={styles.errorMessage}>
            {error}
          </Text>
          <Text variant="caption" color="secondary">
            {t('auth:forgotPassword.backToLogin')}...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text variant="body" style={styles.loadingText}>
          {t('common:status.loading')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.lg,
  },
  errorTitle: {
    marginBottom: spacing.md,
  },
  errorMessage: {
    marginBottom: spacing.lg,
  },
});
