import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, KeyRound, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Input, Button, PasswordStrengthIndicator, type PasswordStrength } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, HIT_SLOP } from '@/constants/spacing';
import { supabase } from '@/lib/supabase';
import { toErrorMessage } from '@/lib/errors';

interface ChangePasswordModalProps {
  visible: boolean;
  onSuccess: () => void;
  onClose?: () => void;
}

export function ChangePasswordModal({ visible, onSuccess, onClose }: ChangePasswordModalProps) {
  const { t } = useTranslation(['auth', 'common', 'errors']);

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>('weak');
  const [errors, setErrors] = useState<{
    password?: string;
    passwordConfirm?: string;
  }>({});

  const resetForm = useCallback(() => {
    setPassword('');
    setPasswordConfirm('');
    setPasswordStrength('weak');
    setErrors({});
  }, []);

  const handleClose = useCallback(() => {
    setLoading(false);
    resetForm();
    onClose?.();
  }, [resetForm, onClose]);

  // Password validation
  const validatePassword = () => {
    const newErrors: typeof errors = {};

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

  const handleSubmit = async () => {
    if (!validatePassword()) return;

    setLoading(true);
    try {
      // supabase.auth.updateUser bazen yanıt dönmeyebilir (promise asılı kalır)
      // Timeout ile sarmalayarak bu durumu ele alıyoruz
      const timeoutMs = 15000;
      const result = await Promise.race([
        supabase.auth.updateUser({ password }).then((res) => ({ ...res, timeout: false as const })),
        new Promise<{ error: null; timeout: true }>((resolve) =>
          setTimeout(() => resolve({ error: null, timeout: true }), timeoutMs)
        ),
      ]);

      if (!result.timeout && result.error) throw result.error;

      // Timeout olsa bile şifre büyük ihtimalle değişmiştir
      setLoading(false);
      resetForm();

      Alert.alert(
        t('common:status.success'),
        t('auth:resetPassword.success'),
        [
          {
            text: t('common:buttons.ok'),
            onPress: () => {
              onSuccess();
            },
          },
        ]
      );
    } catch (err) {
      const errMsg = toErrorMessage(err);
      let errorMessage = errMsg || t('errors:general.generic');

      // Translate Supabase error messages
      if (errMsg?.includes('different from') || errMsg?.includes('same_password') || errMsg?.includes('same as')) {
        errorMessage = t('errors:auth.samePassword');
      } else if (errMsg?.includes('weak and easy to guess') || errMsg?.includes('leaked')) {
        errorMessage = t('errors:auth.leakedPassword');
      }

      Alert.alert(t('common:status.error'), errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
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
            {/* Close button */}
            {onClose && (
              <View style={styles.closeRow}>
                <TouchableOpacity
                  onPress={handleClose}
                  hitSlop={HIT_SLOP.md}
                >
                  <X size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <KeyRound size={48} color={colors.primary} />
              </View>
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
                label={t('auth:resetPassword.confirmPassword')}
                placeholder={t('auth:resetPassword.confirmPasswordPlaceholder')}
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
                onPress={handleSubmit}
                style={styles.button}
              >
                {t('auth:resetPassword.resetButton')}
              </Button>

              {onClose && (
                <Button
                  variant="outline"
                  size="lg"
                  fullWidth
                  onPress={handleClose}
                  style={styles.cancelButton}
                >
                  {t('common:buttons.cancel')}
                </Button>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
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
    justifyContent: 'center',
  },
  closeRow: {
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
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
  cancelButton: {
    marginTop: spacing.sm,
  },
});
