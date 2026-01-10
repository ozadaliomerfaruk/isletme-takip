import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Lock, CheckCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import * as Linking from 'expo-linking';
import { Text, Input, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t } = useTranslation(['auth', 'common', 'errors']);

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<{
    password?: string;
    passwordConfirm?: string;
  }>({});
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    handleDeepLink();
  }, []);

  const handleDeepLink = async () => {
    try {
      // URL'den hash fragment'ı al
      const url = await Linking.getInitialURL();

      if (url) {
        // Hash fragment'tan token'ları çıkar
        const hashIndex = url.indexOf('#');
        if (hashIndex !== -1) {
          const hash = url.substring(hashIndex + 1);
          const params = new URLSearchParams(hash);

          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            // Session'ı ayarla
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              if (__DEV__) {
                console.error('Session error:', error);
              }
              Alert.alert(
                t('common:status.error'),
                t('errors:auth.linkExpired'),
                [{ text: t('common:actions.ok'), onPress: () => router.replace('/(auth)/forgot-password') }]
              );
              return;
            }
          }
        }
      }

      // Supabase auth state'ini kontrol et
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        Alert.alert(
          t('common:status.error'),
          t('errors:auth.linkExpired'),
          [{ text: t('common:actions.ok'), onPress: () => router.replace('/(auth)/forgot-password') }]
        );
        return;
      }
    } catch (error) {
      if (__DEV__) {
        console.error('Deep link error:', error);
      }
    } finally {
      setInitializing(false);
    }
  };

  const validate = () => {
    const newErrors: typeof errors = {};

    if (!password) {
      newErrors.password = t('errors:validation.required');
    } else if (password.length < 6) {
      newErrors.password = t('errors:auth.invalidPassword');
    }

    if (!passwordConfirm) {
      newErrors.passwordConfirm = t('errors:validation.required');
    } else if (password !== passwordConfirm) {
      newErrors.passwordConfirm = t('errors:auth.passwordMismatch');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleResetPassword = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setSuccess(true);
    } catch (err: any) {
      Alert.alert(
        t('common:status.error'),
        err.message || t('errors:general.generic')
      );
    } finally {
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text variant="body" color="secondary">
            {t('common:status.loading')}...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (success) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <CheckCircle size={64} color={colors.success} style={styles.successIcon} />
          <Text variant="h2" center style={styles.successTitle}>
            {t('auth:resetPassword.success')}
          </Text>
          <Text variant="body" color="secondary" center style={styles.successText}>
            {t('auth:resetPassword.successMessage')}
          </Text>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => router.replace('/(auth)/login')}
            style={styles.loginButton}
          >
            {t('auth:login.loginButton')}
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Başlık */}
          <View style={styles.header}>
            <Text variant="h1" style={styles.title}>
              {t('auth:resetPassword.title')}
            </Text>
            <Text variant="body" color="secondary" center>
              {t('auth:resetPassword.subtitle')}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label={t('auth:resetPassword.newPassword')}
              placeholder={t('auth:resetPassword.newPasswordPlaceholder')}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              leftIcon={<Lock size={20} color={colors.textMuted} />}
            />

            <Input
              label={t('auth:resetPassword.confirmPassword')}
              placeholder={t('auth:resetPassword.confirmPasswordPlaceholder')}
              secureTextEntry
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              error={errors.passwordConfirm}
              leftIcon={<Lock size={20} color={colors.textMuted} />}
            />

            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              onPress={handleResetPassword}
              style={styles.submitButton}
            >
              {t('auth:resetPassword.resetButton')}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  form: {
    marginBottom: spacing.xl,
  },
  submitButton: {
    marginTop: spacing.lg,
  },
  successIcon: {
    marginBottom: spacing.lg,
  },
  successTitle: {
    marginBottom: spacing.md,
  },
  successText: {
    marginBottom: spacing.xl,
  },
  loginButton: {
    marginTop: spacing.lg,
  },
});
