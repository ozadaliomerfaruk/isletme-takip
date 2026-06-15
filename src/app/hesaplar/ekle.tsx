import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Wallet, Building2, CreditCard, Vault } from 'lucide-react-native';
import { Text, Input, Button, Card, BalanceDirectionSelector, CurrencyPicker, type BalanceDirection } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useCreateHesap } from '@/hooks/useHesaplar';
import { HesapType, Currency } from '@/types/database';
import { DEFAULT_CURRENCY } from '@/constants/currencies';
import { useTranslation } from 'react-i18next';
import { toErrorMessage } from '@/lib/errors';
import { usePagePermission } from '@/hooks/usePagePermission';
import { usePermissions } from '@/hooks/usePermissions';

export default function HesapEklePage() {
  const router = useRouter();
  const { t } = useTranslation(['accounts', 'common', 'errors']);
  usePagePermission({ module: 'hesaplar', action: 'create' });
  const createHesap = useCreateHesap();
  const insets = useSafeAreaInsets();
  const { canUseBirikim } = usePermissions();

  // Birikim tipi yalnızca birikim iznine sahip kullanıcıya gösterilir (RLS ile uyumlu).
  const allHesapTypes: { type: HesapType; label: string; icon: React.ReactNode }[] = [
    { type: 'nakit', label: t('accounts:typeLabels.nakit'), icon: <Wallet size={24} color={colors.primary} /> },
    { type: 'banka', label: t('accounts:typeLabels.banka'), icon: <Building2 size={24} color={colors.info} /> },
    { type: 'kredi_karti', label: t('accounts:typeLabels.kredi_karti'), icon: <CreditCard size={24} color={colors.warning} /> },
    { type: 'birikim', label: t('accounts:typeLabels.birikim'), icon: <Vault size={24} color={colors.textSecondary} /> },
  ];
  const hesapTypes = allHesapTypes.filter((item) => item.type !== 'birikim' || canUseBirikim);

  const [name, setName] = useState('');
  const [type, setType] = useState<HesapType>('nakit');
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY);
  const [balance, setBalance] = useState('');
  const [balanceDirection, setBalanceDirection] = useState<BalanceDirection>('debt');
  const [creditLimit, setCreditLimit] = useState('');
  const [paymentDueDay, setPaymentDueDay] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ name?: string }>({});

  const validate = () => {
    const newErrors: { name?: string } = {};

    if (!name.trim()) {
      newErrors.name = t('accounts:validation.nameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    // Bakiye hesaplama
    // debt (artı bakiye) = pozitif
    // credit (eksi bakiye) = negatif
    let finalBalance = balance ? parseFloat(balance.replace(',', '.')) : 0;
    if (balanceDirection === 'credit' && finalBalance > 0) {
      finalBalance = -finalBalance;
    }

    try {
      await createHesap.mutateAsync({
        name: name.trim(),
        type,
        currency,
        balance: finalBalance,
        initial_balance: finalBalance, // Açılış bakiyesi olarak kaydet
        description: description.trim() || null,
        credit_limit: type === 'kredi_karti' && creditLimit
          ? parseFloat(creditLimit.replace(',', '.'))
          : null,
        payment_due_day: type === 'kredi_karti' && paymentDueDay
          ? parseInt(paymentDueDay, 10)
          : null,
      });

      Alert.alert(t('common:status.success'), t('accounts:messages.createSuccess'), [
        { text: t('common:buttons.ok'), onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:account.createFailed'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, spacing['3xl']) + spacing.xl }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text variant="h2">{t('accounts:titles.addAccount')}</Text>
          </View>

          {/* Hesap Tipi Seçimi */}
          <View style={styles.section}>
            <Text variant="label" color="secondary" style={styles.sectionTitle}>
              {t('accounts:form.type')}
            </Text>
            <View style={styles.typeGrid}>
              {hesapTypes.map((item) => (
                <Card
                  key={item.type}
                  variant={type === item.type ? 'elevated' : 'outlined'}
                  padding="md"
                  onPress={() => setType(item.type)}
                  style={[
                    styles.typeCard,
                    type === item.type && styles.typeCardActive,
                  ]}
                >
                  {item.icon}
                  <Text
                    variant="label"
                    style={{
                      color: type === item.type ? colors.primary : colors.text,
                      marginTop: spacing.sm,
                    }}
                  >
                    {item.label}
                  </Text>
                </Card>
              ))}
            </View>
          </View>

          {/* Para Birimi Seçimi */}
          <View style={styles.section}>
            <CurrencyPicker
              value={currency}
              onChange={setCurrency}
            />
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

            <Input
              label={t('accounts:form.openingBalanceOptional')}
              placeholder="0"
              keyboardType="decimal-pad"
              value={balance}
              onChangeText={setBalance}
            />

            {/* Bakiye Yönü - sadece bakiye girilmişse göster */}
            {balance.trim() !== '' && (
              <View style={styles.balanceDirectionContainer}>
                <Text variant="label" style={styles.balanceDirectionLabel}>
                  {t('accounts:balanceDirection.label')}
                </Text>
                <BalanceDirectionSelector
                  value={balanceDirection}
                  onChange={setBalanceDirection}
                  variant="account"
                />
              </View>
            )}

            {/* Kredi Limiti - sadece kredi kartı seçiliyse göster */}
            {type === 'kredi_karti' && (
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
              loading={createHesap.isPending}
              onPress={handleSubmit}
              style={styles.button}
            >
              {t('common:buttons.save')}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing['3xl'],
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  typeCard: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  typeCardActive: {
    borderColor: colors.primary,
    borderWidth: 2,
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
  // Balance direction styles
  balanceDirectionContainer: {
    marginBottom: spacing.md,
  },
  balanceDirectionLabel: {
    marginBottom: spacing.xs,
    color: colors.text,
  },
});
