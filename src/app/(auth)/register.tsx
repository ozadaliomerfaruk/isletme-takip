import { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Mail, Lock, Building2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Input, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useAuthContext } from '@/contexts/AuthContext';

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useTranslation(['auth', 'common', 'errors']);
  const { signUp, loading } = useAuthContext();

  const [isletmeName, setIsletmeName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [errors, setErrors] = useState<{
    isletmeName?: string;
    email?: string;
    password?: string;
    passwordConfirm?: string;
  }>({});

  const validate = () => {
    const newErrors: typeof errors = {};

    if (!isletmeName) {
      newErrors.isletmeName = t('errors:validation.required');
    } else if (isletmeName.length < 2) {
      newErrors.isletmeName = t('errors:validation.minLength', { min: 2 });
    }

    if (!email) {
      newErrors.email = t('errors:validation.required');
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = t('errors:auth.invalidEmail');
    }

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

  const handleRegister = async () => {
    if (!validate()) return;

    try {
      await signUp(email, password, isletmeName);
      // Auth context router'ı yönlendirecek
    } catch (error: any) {
      Alert.alert(
        t('common:status.error'),
        error.message === 'User already registered'
          ? t('errors:auth.emailInUse')
          : error.message || t('errors:general.generic')
      );
    }
  };

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
          {/* Logo / Başlık */}
          <View style={styles.header}>
            <Text variant="h1" style={styles.logo}>
              Defter
            </Text>
            <Text variant="body" color="secondary" center>
              {t('auth:register.subtitle')}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label={t('auth:register.businessName')}
              placeholder={t('auth:register.businessNamePlaceholder')}
              autoCapitalize="words"
              value={isletmeName}
              onChangeText={setIsletmeName}
              error={errors.isletmeName}
              leftIcon={<Building2 size={20} color={colors.textMuted} />}
            />

            <Input
              label={t('auth:login.email')}
              placeholder={t('auth:login.emailPlaceholder')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              leftIcon={<Mail size={20} color={colors.textMuted} />}
            />

            <Input
              label={t('auth:login.password')}
              placeholder={t('auth:login.passwordPlaceholder')}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              leftIcon={<Lock size={20} color={colors.textMuted} />}
            />

            <Input
              label={t('auth:register.confirmPassword')}
              placeholder={t('auth:register.confirmPasswordPlaceholder')}
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
              onPress={handleRegister}
              style={styles.registerButton}
            >
              {t('auth:register.registerButton')}
            </Button>
          </View>

          {/* Giriş Yap */}
          <View style={styles.footer}>
            <Text variant="body" color="secondary">
              {t('auth:register.hasAccount')}{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text variant="body" style={{ color: colors.primary }}>
                {t('auth:login.loginButton')}
              </Text>
            </TouchableOpacity>
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
  header: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
  },
  logo: {
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  form: {
    marginBottom: spacing.xl,
  },
  registerButton: {
    marginTop: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
