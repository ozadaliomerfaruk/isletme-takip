import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Building2, Lock, X } from 'lucide-react-native';
import { Text, Input, Button, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useAuthContext } from '@/contexts/AuthContext';
import { useUpdateIsletme } from '@/hooks/useIsletme';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useAuth } from '@/hooks/useAuth';

export default function IsletmeBilgileriPage() {
  const router = useRouter();
  const { t } = useTranslation(['settings', 'common', 'errors']);
  const { formatDateLong } = useDateFormat();
  const { isletme, user } = useAuthContext();
  const updateIsletme = useUpdateIsletme();
  const { changePassword } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [errors, setErrors] = useState<{ name?: string }>({});

  // Şifre değiştirme modal state'leri
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  useEffect(() => {
    if (isletme) {
      setName(isletme.name);
      setPhone(isletme.phone || '');
      setAddress(isletme.address || '');
      setTaxNumber(isletme.tax_number || '');
    }
  }, [isletme]);

  const validate = () => {
    const newErrors: { name?: string } = {};

    if (!name.trim()) {
      newErrors.name = t('settings:validation.businessNameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      await updateIsletme.mutateAsync({
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        tax_number: taxNumber.trim() || null,
      });

      Alert.alert(t('common:status.success'), t('settings:messages.businessInfoUpdated'), [
        { text: t('common:buttons.ok'), onPress: () => router.back() },
      ]);
    } catch (error: unknown) {
      Alert.alert(t('common:status.error'), error instanceof Error ? error.message : t('settings:messages.businessUpdateFailed'));
    }
  };

  // Şifre değiştirme validasyonu
  const validatePassword = () => {
    const newErrors: typeof passwordErrors = {};

    if (!currentPassword) {
      newErrors.currentPassword = t('errors:validation.required');
    }

    if (!newPassword) {
      newErrors.newPassword = t('errors:validation.required');
    } else if (newPassword.length < 6) {
      newErrors.newPassword = t('errors:auth.invalidPassword');
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = t('errors:validation.required');
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = t('errors:auth.passwordMismatch');
    }

    setPasswordErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Şifre değiştirme submit
  const handlePasswordSubmit = async () => {
    if (!validatePassword()) return;

    setPasswordLoading(true);
    try {
      await changePassword(currentPassword, newPassword);

      // Başarılı - modal'ı kapat ve formu temizle
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordErrors({});

      Alert.alert(t('common:status.success'), t('settings:messages.passwordChanged'));
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'WRONG_PASSWORD') {
        setPasswordErrors({ currentPassword: t('errors:auth.wrongPassword') });
      } else {
        Alert.alert(t('common:status.error'), t('errors:general.generic'));
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  // Şifre modal'ını kapat ve temizle
  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordErrors({});
  };

  if (!isletme) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* İşletme Icon */}
            <View style={styles.iconContainer}>
              <View style={styles.iconCircle}>
                <Building2 size={48} color={colors.primary} />
              </View>
            </View>

            {/* Hesap Bilgisi */}
            <Card style={styles.infoCard}>
              <Text variant="label" color="secondary">{t('settings:business.accountEmail')}</Text>
              <Text variant="body">{user?.email}</Text>
              <Text variant="caption" color="muted" style={{ marginTop: spacing.xs }}>
                {t('settings:business.emailCannotChange')}
              </Text>
            </Card>

            {/* Form */}
            <View style={styles.section}>
              <Text variant="h3" style={styles.sectionTitle}>
                {t('settings:business.title')}
              </Text>

              <Input
                label={t('settings:business.businessName')}
                placeholder={t('settings:business.businessNamePlaceholder')}
                value={name}
                onChangeText={setName}
                error={errors.name}
              />

              <Input
                label={t('settings:business.phone')}
                placeholder={t('settings:business.phonePlaceholder')}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />

              <Input
                label={t('settings:business.address')}
                placeholder={t('settings:business.addressPlaceholder')}
                value={address}
                onChangeText={setAddress}
                multiline
                numberOfLines={3}
              />

              <Input
                label={t('settings:business.taxNumber')}
                placeholder={t('settings:business.taxNumberPlaceholder')}
                keyboardType="number-pad"
                value={taxNumber}
                onChangeText={setTaxNumber}
              />
            </View>

            {/* Kayıt Bilgisi */}
            <Card style={styles.infoCard}>
              <Text variant="label" color="secondary">{t('settings:business.registrationDate')}</Text>
              <Text variant="body">
                {formatDateLong(isletme.created_at)}
              </Text>
            </Card>

            {/* Şifre Değiştir */}
            <TouchableOpacity
              style={styles.passwordButton}
              onPress={() => setShowPasswordModal(true)}
              activeOpacity={0.7}
            >
              <View style={styles.passwordButtonContent}>
                <View style={styles.passwordIconContainer}>
                  <Lock size={20} color={colors.primary} />
                </View>
                <Text variant="body" style={styles.passwordButtonText}>
                  {t('settings:profile.changePassword')}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Buttons */}
            <View style={styles.buttons}>
              <Button
                variant="outline"
                size="lg"
                onPress={() => router.back()}
                style={styles.button}
              >
                {t('common:buttons.cancel')}
              </Button>
              <Button
                variant="primary"
                size="lg"
                loading={updateIsletme.isPending}
                onPress={handleSubmit}
                style={styles.button}
              >
                {t('common:buttons.save')}
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Şifre Değiştirme Modal */}
        <Modal visible={showPasswordModal} transparent animationType="slide">
          <Pressable style={styles.modalOverlay} onPress={closePasswordModal}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalKeyboardView}
            >
              <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                {/* Header */}
                <View style={styles.modalHeader}>
                  <Text variant="h3">{t('settings:profile.changePassword')}</Text>
                  <TouchableOpacity onPress={closePasswordModal}>
                    <X size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Form */}
                <View style={styles.modalForm}>
                  {/* Mevcut Şifre */}
                  <Input
                    label={t('settings:profile.currentPassword')}
                    placeholder="••••••••"
                    secureTextEntry
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    error={passwordErrors.currentPassword}
                  />

                  {/* Yeni Şifre */}
                  <Input
                    label={`${t('settings:profile.newPassword')} (${t('errors:auth.passwordMinLength')})`}
                    placeholder="••••••••"
                    secureTextEntry
                    value={newPassword}
                    onChangeText={setNewPassword}
                    error={passwordErrors.newPassword}
                  />

                  {/* Şifre Tekrar */}
                  <Input
                    label={t('settings:profile.confirmPassword')}
                    placeholder="••••••••"
                    secureTextEntry
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    error={passwordErrors.confirmPassword}
                  />
                </View>

                {/* Submit Button */}
                <Button
                  variant="primary"
                  size="lg"
                  loading={passwordLoading}
                  onPress={handlePasswordSubmit}
                  style={styles.modalButton}
                >
                  {t('settings:profile.changePassword')}
                </Button>
              </Pressable>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryLight + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  buttons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
  },
  // Şifre değiştir butonu stilleri
  passwordButton: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  passwordButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  passwordButtonText: {
    color: colors.text,
  },
  // Modal stilleri
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalKeyboardView: {
    width: '100%',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalForm: {
    gap: spacing.sm,
  },
  modalButton: {
    marginTop: spacing.lg,
  },
});
