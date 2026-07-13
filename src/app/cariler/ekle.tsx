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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Building2, User } from 'lucide-react-native';
import { Text, Input, Button, Card, Collapsible, CurrencyPicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useCreateCari } from '@/hooks/useCariler';
import { CariType, Currency } from '@/types/database';
import { toErrorMessage } from '@/lib/errors';
import { useSaveSuccessFeedback } from '@/hooks/useSaveSuccessFeedback';
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
  const insets = useSafeAreaInsets();

  // Dile göre varsayılan para birimi
  const defaultCurrency: Currency = i18n.language.startsWith('en') ? 'USD' : 'TRY';

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
  const [notes, setNotes] = useState(params.prefillTaxNumber ? `VKN: ${params.prefillTaxNumber}` : '');
  const [errors, setErrors] = useState<{ name?: string }>({});

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
      // Açılış bakiyesi artık formda YOK (Dilim 1 #3): cari 0 bakiye ile oluşur;
      // açılış bakiyesi, işlem girilmeden önce cari DETAY sayfasından (yön'lü,
      // düzenlenebilir/silinebilir) girilir. İlk işlemle birlikte orada kilitlenir.
      const created = await createCari.mutateAsync({
        name: name.trim(),
        type,
        currency,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        balance: 0,
        notes: notes.trim() || null,
      });

      notifySaved(t('clients:messages.createSuccess'));
      // Kayıt sonrası oluşturulan cari detayına git (geri tuşu = liste). (Dilim 1 #6)
      // İSTİSNA: prefill'le gelindiyse (foto-import tedarikçi oluşturma akışı) çağıran
      // ekrana geri dön — o akış router.back() ile import'a devam etmeyi bekliyor.
      const cameFromPrefillFlow = !!(params.prefillName || params.prefillType || params.prefillTaxNumber);
      if (cameFromPrefillFlow) {
        router.back();
      } else {
        router.replace({ pathname: '/cariler/[id]', params: { id: created.id } });
      }
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:cari.createFailed'));
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
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Cari Tipi Seçimi — başlık kaldırıldı, kutular yukarı dayalı */}
          <View style={styles.section}>
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

          {/* Para Birimi — hesap ekle ile aynı: CurrencyPicker (dropdown + modal) */}
          <View style={styles.section}>
            <CurrencyPicker value={currency} onChange={setCurrency} />
          </View>

          {/* Form — üst (sık-yol): Ad + Notlar. Telefon/e-posta/adres "Detaylar"
              akordeonunda. Açılış bakiyesi formdan çıktı → cari detayında (Dilim 1 #3/#4). */}
          <View style={styles.section}>
            <Input
              label={t('clients:form.name')}
              placeholder={type === 'tedarikci' ? t('clients:form.nameSupplierPlaceholder') : t('clients:form.nameCustomerPlaceholder')}
              value={name}
              onChangeText={setName}
              error={errors.name}
              autoFocus
            />

            {/* Notlar — üst kısımda (Dilim 1 #4) */}
            <Input
              label={t('clients:form.noteOptional')}
              placeholder={t('clients:form.noteDetailPlaceholder')}
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
            />

            {/* Detaylar — nadir kullanılan alanlar (telefon/e-posta/adres), default kapalı */}
            <Collapsible title={t('clients:form.detailsSection')}>
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
            </Collapsible>
          </View>
        </ScrollView>

        {/* Sticky footer — kaydet butonu klavyenin altında kalmasın (Dilim 1 #5) */}
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
            loading={createCari.isPending}
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
