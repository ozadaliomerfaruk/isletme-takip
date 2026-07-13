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
import { Text, Input, Button, Card, CurrencyPicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useCreateHesap } from '@/hooks/useHesaplar';
import { HesapType, Currency } from '@/types/database';
import { DEFAULT_CURRENCY } from '@/constants/currencies';
import { useTranslation } from 'react-i18next';
import { toErrorMessage } from '@/lib/errors';
import { useSaveSuccessFeedback } from '@/hooks/useSaveSuccessFeedback';
import { parseCurrency } from '@/lib/currency';
import { usePagePermission } from '@/hooks/usePagePermission';
import { usePermissions } from '@/hooks/usePermissions';

export default function HesapEklePage() {
  const router = useRouter();
  const notifySaved = useSaveSuccessFeedback();
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

    try {
      // Açılış bakiyesi artık formda YOK (cari deseni): hesap 0 bakiye ile oluşur;
      // açılış bakiyesi, işlem girilmeden önce hesap DETAY sayfasından (yön'lü,
      // düzenlenebilir) girilir. İlk işlemle orada kilitlenir.
      const created = await createHesap.mutateAsync({
        name: name.trim(),
        type,
        currency,
        balance: 0,
        initial_balance: 0,
        description: description.trim() || null,
        credit_limit: type === 'kredi_karti' && creditLimit
          ? parseCurrency(creditLimit)
          : null,
        payment_due_day: type === 'kredi_karti' && paymentDueDay
          ? parseInt(paymentDueDay, 10)
          : null,
      });

      notifySaved(t('accounts:messages.createSuccess'));
      // Kayıt sonrası oluşturulan hesabın detayına git (geri = liste).
      router.replace({ pathname: '/hesaplar/[id]', params: { id: created.id } });
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:account.createFailed'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
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
          {/* Hesap Tipi — sayfa-içi başlık (native header ile çift) ve "Hesap Tipi"
              etiketi kaldırıldı, kutular yukarı dayalı */}
          <View style={styles.section}>
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
              autoFocus
            />

            {/* Açılış bakiyesi formdan çıkarıldı → hesap DETAY sayfasından girilir (cari deseni) */}

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

        </ScrollView>

        {/* Sticky footer — kaydet butonu klavyenin altında kalmasın */}
        <View style={styles.footer}>
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
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
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
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  button: {
    flex: 1,
  },
});
