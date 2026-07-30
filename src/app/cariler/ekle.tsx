import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Building2, User } from 'lucide-react-native';
import { Text, Input, Button, Card, Collapsible, CurrencyPicker, Screen } from '@/components/ui';
import { useFooterBottomPadding } from '@/hooks/useFooterBottomPadding';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useCariler, useCreateCari } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { CariType, Currency } from '@/types/database';
import { toErrorMessage } from '@/lib/errors';
import { getNeedsSetupSync } from '@/lib/setupFlow';
import { useSaveSuccessFeedback } from '@/hooks/useSaveSuccessFeedback';
import { usePagePermission } from '@/hooks/usePagePermission';
import { DeviceContactPickerButton } from '@/components/contacts/DeviceContactPickerButton';
import {
  findPhoneDuplicateMatches,
  getPhoneDuplicateWarningCopy,
  getPhoneValidationMessageKey,
  preparePhoneForSave,
} from '@/lib/phone';

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
  // Bu iki hook tenant + modül görünürlüğünü kendi içinde uygular. Arşiv/pasif
  // dahil edilse bile kullanıcıya kapalı kayıtlar sorgu sonucuna girmez.
  const { data: visibleCariler } = useCariler(undefined, true, true);
  const { data: visiblePersoneller } = usePersonelList(true, true);
  const insets = useSafeAreaInsets();
  const footerInset = useFooterBottomPadding();

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
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  const validate = () => {
    const newErrors: { name?: string; phone?: string } = {};
    const phoneResult = preparePhoneForSave(phone);

    if (!name.trim()) {
      newErrors.name = t('clients:validation.nameRequired');
    }
    if (!phoneResult.ok) {
      newErrors.phone = t(`common:${getPhoneValidationMessageKey(phoneResult.reason)}`);
    }

    setErrors(newErrors);
    return {
      isValid: Object.keys(newErrors).length === 0,
      normalizedPhone: phoneResult.ok ? phoneResult.value : null,
    };
  };

  const persistCari = async (normalizedPhone: string | null) => {
    try {
      // Açılış bakiyesi artık formda YOK (Dilim 1 #3): cari 0 bakiye ile oluşur;
      // açılış bakiyesi, işlem girilmeden önce cari DETAY sayfasından (yön'lü,
      // düzenlenebilir/silinebilir) girilir. İlk işlemle birlikte orada kilitlenir.
      const created = await createCari.mutateAsync({
        name: name.trim(),
        type,
        currency,
        phone: normalizedPhone,
        email: email.trim() || null,
        address: address.trim() || null,
        balance: 0,
        notes: notes.trim() || null,
      });

      notifySaved(t('clients:messages.createSuccess'));
      // Kayıt sonrası oluşturulan cari detayına git (geri tuşu = liste). (Dilim 1 #6)
      // İSTİSNA: prefill'le gelindiyse (foto-import tedarikçi oluşturma akışı) çağıran
      // ekrana geri dön — o akış router.back() ile import'a devam etmeyi bekliyor.
      // İSTİSNA 2: kurulum akışı sürüyorsa (rehberli oluşturma adımı) detaya GİTME.
      // _layout'un kapısı kurulum bitmeden 'cariler/ekle' dışına çıkışa izin vermiyor;
      // detaya replace edilince kapı devreye girip kullanıcıyı sektör ekranına
      // (/kurulum) geri atıyordu. back() → rehberli oluşturma listesine döner.
      const cameFromPrefillFlow = !!(params.prefillName || params.prefillType || params.prefillTaxNumber);
      if (cameFromPrefillFlow || getNeedsSetupSync()) {
        router.back();
      } else {
        router.replace({ pathname: '/cariler/[id]', params: { id: created.id } });
      }
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:cari.createFailed'));
    }
  };

  const handleSubmit = async () => {
    const validation = validate();
    if (!validation.isValid) return;

    const duplicateMatches = findPhoneDuplicateMatches(validation.normalizedPhone, {
      cariler: visibleCariler,
      personeller: visiblePersoneller,
    });
    if (duplicateMatches.length > 0) {
      const warning = getPhoneDuplicateWarningCopy(duplicateMatches, i18n.language);
      Alert.alert(warning.title, warning.message, [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: warning.confirmLabel,
          onPress: () => void persistCari(validation.normalizedPhone),
        },
      ]);
      return;
    }

    await persistCari(validation.normalizedPhone);
  };

  return (
    <Screen>
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
                error={errors.phone}
                rightIcon={(
                  <DeviceContactPickerButton
                    onSelect={(selection) => {
                      setPhone(selection.phone);
                      if (!name.trim()) {
                        setName(selection.name || selection.company);
                      }
                    }}
                  />
                )}
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
        <View style={[styles.footer, { paddingBottom: spacing.md + footerInset }]}>
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
    </Screen>
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
