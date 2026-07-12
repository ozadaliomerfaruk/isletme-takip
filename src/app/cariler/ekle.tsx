import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Building2, User } from 'lucide-react-native';
import { Text, Input, Button, Card, BalanceDirectionSelector, type BalanceDirection } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useCreateCari } from '@/hooks/useCariler';
import { CariType, Currency } from '@/types/database';
import { getLocalizedCurrencies } from '@/constants/currencies';
import { toErrorMessage } from '@/lib/errors';
import { useSaveSuccessFeedback } from '@/hooks/useSaveSuccessFeedback';
import { parseCurrency } from '@/lib/currency';
import { usePagePermission } from '@/hooks/usePagePermission';

export default function CariEklePage() {
  const router = useRouter();
  const notifySaved = useSaveSuccessFeedback();
  const params = useLocalSearchParams<{
    prefillName?: string;
    prefillType?: string;
    prefillTaxNumber?: string;
  }>();
  const { t, i18n } = useTranslation(['clients', 'common', 'errors']);
  usePagePermission({ module: 'cariler', action: 'create' });
  const createCari = useCreateCari();

  // Dile göre varsayılan para birimi
  const defaultCurrency: Currency = i18n.language.startsWith('en') ? 'USD' : 'TRY';
  const currencies = getLocalizedCurrencies(i18n.language);

  const cariTypes: { type: CariType; label: string; icon: React.ReactNode }[] = [
    { type: 'tedarikci', label: t('clients:types.tedarikci'), icon: <Building2 size={24} color={colors.warning} /> },
    { type: 'musteri', label: t('clients:types.musteri'), icon: <User size={24} color={colors.info} /> },
  ];

  const [name, setName] = useState(params.prefillName || '');
  const [type, setType] = useState<CariType>((params.prefillType as CariType) || 'tedarikci');
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState('');
  const [balanceDirection, setBalanceDirection] = useState<BalanceDirection>('credit');
  const [notes, setNotes] = useState(params.prefillTaxNumber ? `VKN: ${params.prefillTaxNumber}` : '');
  const [errors, setErrors] = useState<{ name?: string }>({});

  // Cari tipi değiştiğinde varsayılan yönü güncelle
  useEffect(() => {
    // Tedarikçi: genelde biz borçlu oluruz (credit = bize alacak)
    // Müşteri: genelde onlar borçlu olur (debt = bize borç)
    setBalanceDirection(type === 'tedarikci' ? 'credit' : 'debt');
  }, [type]);

  const validate = () => {
    const newErrors: { name?: string } = {};

    if (!name.trim()) {
      newErrors.name = t('clients:validation.nameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      // Bakiye mantığı:
      // debt (bize borç) = onların bize borcu var = pozitif bakiye (alacağımız var)
      // credit (bize alacak) = bizim onlara borcumuz var = negatif bakiye
      let finalBalance = balance ? parseCurrency(balance) : 0;
      if (balanceDirection === 'credit' && finalBalance > 0) {
        finalBalance = -finalBalance; // Bize alacak = bizim borcumuz, negatif
      }
      // debt durumunda pozitif kalır (bize borç = alacağımız var)

      await createCari.mutateAsync({
        name: name.trim(),
        type,
        currency,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        balance: finalBalance,
        notes: notes.trim() || null,
      });

      notifySaved(t('clients:messages.createSuccess'));
      router.back();
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:cari.createFailed'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
          {/* Header */}
          <View style={styles.header}>
            <Text variant="h2">{t('clients:titles.addClient')}</Text>
          </View>

          {/* Cari Tipi Seçimi */}
          <View style={styles.section}>
            <Text variant="label" color="secondary" style={styles.sectionTitle}>
              {t('clients:form.type')}
            </Text>
            <View style={styles.typeGrid}>
              {cariTypes.map((item) => (
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
            <Text variant="label" color="secondary" style={styles.sectionTitle}>
              {t('clients:form.currency')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.currencyGrid}
            >
              {currencies.map((curr) => (
                <Card
                  key={curr.code}
                  variant={currency === curr.code ? 'elevated' : 'outlined'}
                  padding="sm"
                  onPress={() => setCurrency(curr.code as Currency)}
                  style={[
                    styles.currencyCard,
                    currency === curr.code && styles.currencyCardActive,
                  ]}
                >
                  <Text
                    variant="body"
                    style={{
                      color: currency === curr.code ? colors.primary : colors.text,
                      fontWeight: currency === curr.code ? '600' : '400',
                    }}
                  >
                    {curr.symbol} {curr.code}
                  </Text>
                </Card>
              ))}
            </ScrollView>
          </View>

          {/* Form */}
          <View style={styles.section}>
            <Input
              label={t('clients:form.name')}
              placeholder={type === 'tedarikci' ? t('clients:form.nameSupplierPlaceholder') : t('clients:form.nameCustomerPlaceholder')}
              value={name}
              onChangeText={setName}
              error={errors.name}
            />

            <Input
              label={t('clients:form.phoneOptional')}
              placeholder={t('clients:form.phoneExample')}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />

            <Input
              label={t('clients:form.emailOptional')}
              placeholder={t('clients:form.emailExample')}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            <Input
              label={t('clients:form.addressOptional')}
              placeholder={t('clients:form.addressDetailPlaceholder')}
              multiline
              numberOfLines={2}
              value={address}
              onChangeText={setAddress}
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
                  {t('clients:balanceDirection.label')}
                </Text>
                <BalanceDirectionSelector
                  value={balanceDirection}
                  onChange={setBalanceDirection}
                  variant={type === 'tedarikci' ? 'supplier' : 'customer'}
                />
              </View>
            )}

            <Input
              label={t('clients:form.noteOptional')}
              placeholder={t('clients:form.noteDetailPlaceholder')}
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
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
              loading={createCari.isPending}
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
    gap: spacing.md,
  },
  typeCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  typeCardActive: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  currencyGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  currencyCard: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  currencyCardActive: {
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
