import { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, KeyRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Input, Button, PasswordStrengthIndicator, type PasswordStrength } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { supabase } from '@/lib/supabase';

interface ChangePasswordModalProps {
  visible: boolean;
  onSuccess: () => void;
}

export function ChangePasswordModal({ visible, onSuccess }: ChangePasswordModalProps) {
  const { t } = useTranslation(['auth', 'common', 'errors']);

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>('weak');
  const [errors, setErrors] = useState<{
    password?: string;
    passwordConfirm?: string;
  }>({});

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
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      Alert.alert(
        t('common:status.success'),
        t('auth:resetPassword.success'),
        [
          {
            text: t('common:buttons.ok'),
            onPress: () => {
              // Reset form
              setPassword('');
              setPasswordConfirm('');
              setPasswordStrength('weak');
              setErrors({});
              onSuccess();
            },
          },
        ]
      );
    } catch (err: any) {
      let errorMessage = err.message || t('errors:general.generic');

      // Translate Supabase error messages
      if (err.message?.includes('weak and easy to guess') || err.message?.includes('leaked')) {
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
      onRequestClose={() => {
        // Android back button - do nothing, user must change password
      }}
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
});
