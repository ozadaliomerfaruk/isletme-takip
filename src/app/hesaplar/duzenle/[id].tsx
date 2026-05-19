import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Wallet, Building2, CreditCard, Vault } from 'lucide-react-native';
import { Text, Input, Button, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useHesap, useUpdateHesap } from '@/hooks/useHesaplar';
import { HesapType } from '@/types/database';
import { useTranslation } from 'react-i18next';
import { toErrorMessage } from '@/lib/errors';
import { usePagePermission } from '@/hooks/usePagePermission';

// Hesap tipi için ikon ve renk
const getHesapTypeConfig = (type: HesapType) => {
  switch (type) {
    case 'nakit':
      return { icon: <Wallet size={20} color={colors.primary} />, color: colors.primary };
    case 'banka':
      return { icon: <Building2 size={20} color={colors.info} />, color: colors.info };
    case 'kredi_karti':
      return { icon: <CreditCard size={20} color={colors.warning} />, color: colors.warning };
    case 'birikim':
    case 'diger':
      return { icon: <Vault size={20} color={colors.textSecondary} />, color: colors.textSecondary };
    default:
      return { icon: <Wallet size={20} color={colors.primary} />, color: colors.primary };
  }
};

export default function HesapDuzenlePage() {
  const router = useRouter();
  const { t } = useTranslation(['accounts', 'common', 'errors']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: hesap, isLoading } = useHesap(id);
  usePagePermission({ module: 'hesaplar', action: 'update', createdBy: hesap?.created_by });
  const updateHesap = useUpdateHesap();

  const [name, setName] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [paymentDueDay, setPaymentDueDay] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<{ name?: string }>({});

  useEffect(() => {
    if (hesap) {
      setName(hesap.name);
      setCreditLimit(hesap.credit_limit?.toString() || '');
      setPaymentDueDay(hesap.payment_due_day?.toString() || '');
      setDescription(hesap.description || '');
      setIsActive(hesap.is_active ?? true);
    }
  }, [hesap]);

  const validate = () => {
    const newErrors: { name?: string } = {};

    if (!name.trim()) {
      newErrors.name = t('accounts:validation.nameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !id || !hesap) return;

    try {
      await updateHesap.mutateAsync({
        id,
        name: name.trim(),
        description: description.trim() || null,
        credit_limit: hesap.type === 'kredi_karti' && creditLimit
          ? parseFloat(creditLimit.replace(',', '.'))
          : null,
        payment_due_day: hesap.type === 'kredi_karti' && paymentDueDay
          ? parseInt(paymentDueDay, 10)
          : null,
        is_active: isActive,
      });

      Alert.alert(t('common:status.success'), t('accounts:messages.updateSuccess'), [
        { text: t('common:buttons.ok'), onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:account.updateFailed'));
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text>{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hesap) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text>{t('errors:account.notFound')}</Text>
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
            {/* Hesap Tipi (Salt Okunur) */}
            <View style={styles.section}>
              <Text variant="label" color="secondary" style={styles.sectionTitle}>
                {t('accounts:form.type')}
              </Text>
              <View style={styles.typeDisplay}>
                <View style={[styles.typeIconContainer, { backgroundColor: getHesapTypeConfig(hesap.type).color + '20' }]}>
                  {getHesapTypeConfig(hesap.type).icon}
                </View>
                <Text variant="body" style={{ color: getHesapTypeConfig(hesap.type).color }}>
                  {t(`accounts:typeLabels.${hesap.type}`)}
                </Text>
              </View>
            </View>

            {/* Form */}
            <View style={styles.section}>
              <Input
                label={t('accounts:form.name')}
                placeholder={t('accounts:form.namePlaceholder')}
                value={name}
                onChangeText={setName}
                error={errors.name}
              />

              {/* Kredi Limiti ve Son Ödeme Günü - sadece kredi kartı ise göster */}
              {hesap.type === 'kredi_karti' && (
                <>
                  <Input
                    label={t('accounts:form.creditLimitOptional')}
                    placeholder={t('accounts:form.creditLimitPlaceholder')}
                    keyboardType="decimal-pad"
                    value={creditLimit}
                    onChangeText={setCreditLimit}
                  />
                  <Input
                    label={t('accounts:creditCard.paymentDueDayOptional')}
                    placeholder={t('accounts:creditCard.paymentDueDayPlaceholder')}
                    keyboardType="number-pad"
                    value={paymentDueDay}
                    onChangeText={(text) => {
                      const num = text.replace(/[^0-9]/g, '');
                      if (num === '' || (parseInt(num, 10) >= 1 && parseInt(num, 10) <= 31)) {
                        setPaymentDueDay(num);
                      }
                    }}
                    maxLength={2}
                  />
                </>
              )}

              <Input
                label={t('accounts:form.descriptionOptional')}
                placeholder={t('accounts:form.descriptionPlaceholder')}
                multiline
                numberOfLines={3}
                value={description}
                onChangeText={setDescription}
              />
            </View>

            {/* Pasif Mod */}
            <View style={styles.section}>
              <View style={styles.passiveModeContainer}>
                <View style={styles.passiveModeHeader}>
                  <Text variant="body">{t('common:passiveMode.title')}</Text>
                  <Switch
                    value={!isActive}
                    onValueChange={(value) => setIsActive(!value)}
                    trackColor={{ false: colors.border, true: colors.warning }}
                    thumbColor={colors.surface}
                  />
                </View>
                <Text variant="caption" color="muted" style={styles.passiveModeDescription}>
                  {t('common:passiveMode.description')}
                </Text>
              </View>
            </View>

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
                loading={updateHesap.isPending}
                onPress={handleSubmit}
                style={styles.button}
              >
                {t('common:buttons.update')}
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
    paddingTop: spacing['3xl'],
    paddingBottom: spacing['3xl'],
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  typeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  typeIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
  passiveModeContainer: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  passiveModeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  passiveModeDescription: {
    marginTop: spacing.xs,
  },
});
