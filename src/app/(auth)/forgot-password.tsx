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
import { Mail, ArrowLeft, KeyRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Input, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { supabase } from '@/lib/supabase';

type Step = 'email' | 'otp';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { t } = useTranslation(['auth', 'common', 'errors']);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    otp?: string;
  }>({});

  // Email validation
  const validateEmail = () => {
    if (!email) {
      setErrors({ email: t('errors:validation.required') });
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setErrors({ email: t('errors:auth.invalidEmail') });
      return false;
    }
    setErrors({});
    return true;
  };

  // OTP validation
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

  // Step 1: Send OTP
  const handleSendOtp = async () => {
    if (!validateEmail()) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);

      if (error) throw error;

      setStep('otp');
    } catch (err: any) {
      Alert.alert(t('common:status.error'), err.message || t('errors:general.generic'));
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP - sonra ChangePasswordModal açılacak
  const handleVerifyOtp = async () => {
    if (!validateOtp()) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'recovery',
      });

      if (error) throw error;

      // OTP doğrulandı, kullanıcı giriş yaptı
      // PASSWORD_RECOVERY event'i needsPasswordReset'i true yapar
      // _layout.tsx ChangePasswordModal'ı gösterecek
      // Ana sayfaya yönlendir - modal orada açılacak
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert(t('common:status.error'), err.message || t('errors:auth.invalidOtp'));
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);

      if (error) throw error;

      Alert.alert(t('common:status.success'), t('auth:forgotPassword.otpResent'));
    } catch (err: any) {
      Alert.alert(t('common:status.error'), err.message || t('errors:general.generic'));
    } finally {
      setLoading(false);
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
          {/* Geri Butonu */}
          <TouchableOpacity
            onPress={() => {
              if (step === 'email') {
                router.back();
              } else if (step === 'otp') {
                setStep('email');
                setOtp('');
              }
            }}
            style={styles.backArrow}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          {/* Step 1: Email */}
          {step === 'email' && (
            <>
              <View style={styles.header}>
                <Text variant="h1" style={styles.title}>
                  {t('auth:forgotPassword.title')}
                </Text>
                <Text variant="body" color="secondary" center>
                  {t('auth:forgotPassword.subtitle')}
                </Text>
              </View>

              <View style={styles.form}>
                <Input
                  label={t('auth:forgotPassword.email')}
                  placeholder={t('auth:forgotPassword.emailPlaceholder')}
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

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={loading}
                  onPress={handleSendOtp}
                  style={styles.button}
                >
                  {t('auth:forgotPassword.sendCode')}
                </Button>
              </View>
            </>
          )}

          {/* Step 2: OTP */}
          {step === 'otp' && (
            <>
              <View style={styles.header}>
                <Text variant="h1" style={styles.title}>
                  {t('auth:forgotPassword.enterCode')}
                </Text>
                <Text variant="body" color="secondary" center>
                  {t('auth:forgotPassword.codeSent', { email })}
                </Text>
              </View>

              <View style={styles.form}>
                <Input
                  label={t('auth:forgotPassword.verificationCode')}
                  placeholder="000000"
                  keyboardType="number-pad"
                  maxLength={6}
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
                  {t('auth:forgotPassword.verifyCode')}
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
    padding: spacing.xl,
  },
  backArrow: {
    marginBottom: spacing.lg,
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
  button: {
    marginTop: spacing.lg,
  },
  resendLink: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
});
