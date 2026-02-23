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
import { Mail, Lock, Building2, KeyRound, CheckCircle, ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Input, Button, PasswordStrengthIndicator, type PasswordStrength } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { supabase } from '@/lib/supabase';
import { toErrorMessage } from '@/lib/errors';

type Step = 'register' | 'otp' | 'success';

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useTranslation(['auth', 'common', 'errors']);

  const [step, setStep] = useState<Step>('register');
  const [isletmeName, setIsletmeName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>('weak');
  const [errors, setErrors] = useState<{
    isletmeName?: string;
    email?: string;
    password?: string;
    passwordConfirm?: string;
    otp?: string;
  }>({});

  const validateRegister = () => {
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
      newErrors.password = t('errors:validation.minLength', { min: 6 });
    } else if (passwordStrength === 'weak') {
      newErrors.password = t('errors:auth.passwordWeak');
    }

    if (!passwordConfirm) {
      newErrors.passwordConfirm = t('errors:validation.required');
    } else if (password !== passwordConfirm) {
      newErrors.passwordConfirm = t('errors:auth.passwordMismatch');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateOtp = () => {
    if (!otp) {
      setErrors({ otp: t('errors:validation.required') });
      return false;
    }
    if (otp.length < 6) {
      setErrors({ otp: t('errors:auth.invalidOtp') });
      return false;
    }
    setErrors({});
    return true;
  };

  // Step 1: Register
  const handleRegister = async () => {
    if (!validateRegister()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            isletme_name: isletmeName,
          },
        },
      });

      if (error) throw error;

      // Email confirmation required
      if (data.user && !data.session) {
        setStep('otp');
      } else if (data.session) {
        // Email confirmation disabled, directly logged in
        router.replace('/(tabs)');
      }
    } catch (error) {
      let errorMessage = toErrorMessage(error) || t('errors:general.generic');

      // Translate Supabase error messages
      if (toErrorMessage(error)?.includes('weak and easy to guess') || toErrorMessage(error)?.includes('leaked')) {
        errorMessage = t('errors:auth.leakedPassword');
      } else if (toErrorMessage(error) === 'User already registered') {
        errorMessage = t('errors:auth.emailInUse');
      }

      Alert.alert(t('common:status.error'), errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async () => {
    if (!validateOtp()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'signup',
      });

      if (error) throw error;

      if (data.session) {
        setStep('success');
      }
    } catch (err) {
      Alert.alert(t('common:status.error'), toErrorMessage(err) || t('errors:auth.invalidOtp'));
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });

      if (error) throw error;

      Alert.alert(t('common:status.success'), t('auth:register.otpResent'));
    } catch (err) {
      Alert.alert(t('common:status.error'), toErrorMessage(err) || t('errors:general.generic'));
    } finally {
      setLoading(false);
    }
  };

  // Success screen
  if (step === 'success') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <CheckCircle size={64} color={colors.success} style={styles.icon} />
          <Text variant="h2" center style={styles.title}>
            {t('auth:register.successTitle')}
          </Text>
          <Text variant="body" color="secondary" center style={styles.subtitle}>
            {t('auth:register.successMessage')}
          </Text>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => router.replace('/(tabs)')}
            style={styles.button}
          >
            {t('auth:register.continue')}
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
          {/* Back Button for OTP step */}
          {step === 'otp' && (
            <TouchableOpacity
              onPress={() => {
                setStep('register');
                setOtp('');
              }}
              style={styles.backArrow}
            >
              <ArrowLeft size={24} color={colors.text} />
            </TouchableOpacity>
          )}

          {/* Step 1: Register Form */}
          {step === 'register' && (
            <>
              <View style={styles.header}>
                <Text variant="h1" style={styles.logo}>
                  {t('common:appName')}
                </Text>
                <Text variant="body" color="secondary" center>
                  {t('auth:register.subtitle')}
                </Text>
              </View>

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
                  textContentType="emailAddress"
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                  error={errors.email}
                  leftIcon={<Mail size={20} color={colors.textMuted} />}
                />

                <Input
                  label={t('auth:login.password')}
                  placeholder={t('auth:login.passwordPlaceholder')}
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="password-new"
                  value={password}
                  onChangeText={setPassword}
                  error={errors.password}
                  leftIcon={<Lock size={20} color={colors.textMuted} />}
                />
                {password.length > 0 && (
                  <PasswordStrengthIndicator
                    password={password}
                    onStrengthChange={setPasswordStrength}
                  />
                )}

                <Input
                  label={t('auth:register.confirmPassword')}
                  placeholder={t('auth:register.confirmPasswordPlaceholder')}
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="password-new"
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
            </>
          )}

          {/* Step 2: OTP Verification */}
          {step === 'otp' && (
            <>
              <View style={styles.header}>
                <Text variant="h1" style={styles.title}>
                  {t('auth:register.verifyEmail')}
                </Text>
                <Text variant="body" color="secondary" center>
                  {t('auth:register.otpSent', { email })}
                </Text>
              </View>

              <View style={styles.form}>
                <Input
                  label={t('auth:forgotPassword.verificationCode')}
                  placeholder="000000"
                  keyboardType="number-pad"
                  maxLength={8}
                  value={otp}
                  onChangeText={setOtp}
                  error={errors.otp}
                  leftIcon={<KeyRound size={20} color={colors.textMuted} />}
                />

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={loading}
                  onPress={handleVerifyOtp}
                  style={styles.button}
                >
                  {t('auth:register.verifyButton')}
                </Button>

                <TouchableOpacity
                  onPress={handleResendOtp}
                  disabled={loading}
                  style={styles.resendLink}
                >
                  <Text variant="body" style={{ color: colors.primary }}>
                    {t('auth:forgotPassword.resendCode')}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
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
  backArrow: {
    marginBottom: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
  },
  logo: {
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  title: {
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: spacing.xl,
  },
  form: {
    marginBottom: spacing.xl,
  },
  registerButton: {
    marginTop: spacing.md,
  },
  button: {
    marginTop: spacing.lg,
  },
  icon: {
    marginBottom: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resendLink: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
});
