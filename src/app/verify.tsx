import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { supabase } from '@/lib/supabase';

export default function VerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t } = useTranslation(['auth', 'common', 'errors']);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleVerification();
  }, []);

  const handleVerification = async () => {
    try {
      // URL'den parametreleri al
      const url = await Linking.getInitialURL();
      let accessToken = params.access_token as string;
      let refreshToken = params.refresh_token as string;

      // Hash'ten de kontrol et (Supabase bazen hash ile gönderir)
      if (url && !accessToken) {
        const hashIndex = url.indexOf('#');
        if (hashIndex !== -1) {
          const hash = url.substring(hashIndex + 1);
          const hashParams = new URLSearchParams(hash);
          accessToken = hashParams.get('access_token') || '';
          refreshToken = hashParams.get('refresh_token') || '';
        }
      }

      // Query params'tan da kontrol et
      if (url && !accessToken) {
        const queryIndex = url.indexOf('?');
        if (queryIndex !== -1) {
          const query = url.substring(queryIndex + 1);
          const queryParams = new URLSearchParams(query);
          accessToken = queryParams.get('access_token') || '';
          refreshToken = queryParams.get('refresh_token') || '';
        }
      }

      if (accessToken) {
        // Session oluştur
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        });

        if (sessionError) throw sessionError;

        // Başarılı - ana sayfaya yönlendir
        router.replace('/(tabs)');
      } else {
        throw new Error(t('errors:auth.linkExpired'));
      }
    } catch (err: any) {
      if (__DEV__) {
        console.error('Verification error:', err);
      }
      setError(err.message || t('errors:general.generic'));
      // 3 saniye sonra login'e yönlendir
      setTimeout(() => router.replace('/(auth)/login'), 3000);
    }
  };

  if (error) {
    return (
      <View style={styles.container}>
        <Text variant="h2" color="error" style={styles.errorTitle}>
          {t('common:status.error')}
        </Text>
        <Text variant="body" color="secondary" center style={styles.errorMessage}>
          {error}
        </Text>
        <Text variant="caption" color="secondary" style={styles.redirectText}>
          {t('auth:forgotPassword.backToLogin')}...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text variant="body" style={styles.loadingText}>
        {t('common:status.loading')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
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
  redirectText: {
    marginTop: spacing.md,
  },
});
