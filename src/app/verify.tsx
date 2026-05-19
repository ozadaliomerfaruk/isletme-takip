import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { useAuthContext } from '@/contexts/AuthContext';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { supabase } from '@/lib/supabase';
import { toErrorMessage } from '@/lib/errors';

export default function VerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t } = useTranslation(['auth', 'common', 'errors']);
  const { triggerPasswordReset } = useAuthContext();
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
      let tokenType = (params.type as string) || '';

      // Hash'ten de kontrol et (Supabase bazen hash ile gönderir)
      if (url && !accessToken) {
        const hashIndex = url.indexOf('#');
        if (hashIndex !== -1) {
          const hash = url.substring(hashIndex + 1);
          const hashParams = new URLSearchParams(hash);
          accessToken = hashParams.get('access_token') || '';
          refreshToken = hashParams.get('refresh_token') || '';
          if (!tokenType) tokenType = hashParams.get('type') || '';
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
          if (!tokenType) tokenType = queryParams.get('type') || '';
        }
      }

      // URL'den type parametresini de al (hash veya query'de olmayabilir)
      if (!tokenType && url) {
        // URL'nin tamamında type=recovery ara
        const typeMatch = url.match(/[?&#]type=([^&#]*)/);
        if (typeMatch) tokenType = typeMatch[1];
      }

      if (accessToken && refreshToken) {
        // Şifre sıfırlama akışı - session'dan önce bayrağı aç
        // setSession SIGNED_IN event'i tetikler (PASSWORD_RECOVERY değil),
        // bu yüzden bayrağı burada açmamız gerekiyor
        const isRecovery = tokenType === 'recovery';
        if (isRecovery) {
          triggerPasswordReset();
        }

        // Session oluştur
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) throw sessionError;

        // Başarılı - ana sayfaya yönlendir
        // Eğer recovery ise, ChangePasswordModal _layout.tsx'te otomatik gösterilecek
        router.replace('/(tabs)');
      } else {
        throw new Error(t('errors:auth.linkExpired'));
      }
    } catch (err) {
      if (__DEV__) {
        console.error('Verification error:', err);
      }
      setError(toErrorMessage(err) || t('errors:general.generic'));
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
