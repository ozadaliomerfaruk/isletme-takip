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
import { useTranslation } from 'react-i18next';
import { Building2, User } from 'lucide-react-native';
import { Text, Input, Button, Card, Collapsible } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useCari, useUpdateCari } from '@/hooks/useCariler';
import { Currency } from '@/types/database';
import { getLocalizedCurrencies } from '@/constants/currencies';
import { toErrorMessage } from '@/lib/errors';
import { useSaveSuccessFeedback } from '@/hooks/useSaveSuccessFeedback';
import { usePagePermission } from '@/hooks/usePagePermission';

export default function CariDuzenlePage() {
  const router = useRouter();
  const notifySaved = useSaveSuccessFeedback();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation(['clients', 'common', 'errors']);
  const currencies = getLocalizedCurrencies(i18n.language);

  const { data: cari, isLoading } = useCari(id);
  usePagePermission({ module: 'cariler', action: 'update', createdBy: cari?.created_by });
  const updateCari = useUpdateCari();

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<{ name?: string }>({});

  useEffect(() => {
    if (cari) {
      setName(cari.name);
      setCurrency(cari.currency || 'TRY');
      setPhone(cari.phone || '');
      setEmail(cari.email || '');
      setAddress(cari.address || '');
      setNotes(cari.notes || '');
      setIsActive(cari.is_active ?? true);
    }
  }, [cari]);

  const validate = () => {
    const newErrors: { name?: string } = {};

    if (!name.trim()) {
      newErrors.name = t('clients:validation.nameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !id) return;

    try {
      await updateCari.mutateAsync({
        id,
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        is_active: isActive,
      });

      notifySaved(t('clients:messages.updateSuccess'));
      router.back();
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:cari.updateFailed'));
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!cari) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>{t('errors:cari.notFound')}</Text>
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
            {/* Cari Tipi (Salt Okunur) */}
            <View style={styles.section}>
              <Text variant="label" color="secondary" style={styles.sectionTitle}>
                {t('clients:form.type')}
              </Text>
              <View style={styles.typeDisplay}>
                {cari.type === 'tedarikci' ? (
                  <Building2 size={20} color={colors.warning} />
                ) : (
                  <User size={20} color={colors.info} />
                )}
                <Text variant="body" style={{ marginLeft: spacing.sm }}>
                  {t(`clients:types.${cari.type}`)}
                </Text>
              </View>
            </View>

            {/* Para Birimi (düzenlemede salt okunur) */}
            <View style={styles.section}>
              <Text variant="label" color="secondary" style={styles.sectionTitle}>
                {t('clients:form.currency')}
              </Text>
              <View style={styles.currencyGrid}>
                {currencies.filter((curr) => curr.code === currency).map((curr) => (
                  <Card
                    key={curr.code}
                    variant="elevated"
                    padding="sm"
                    style={[styles.currencyCard, styles.currencyCardActive]}
                  >
                    <Text
                      variant="body"
                      style={{ color: colors.primary, fontWeight: '600' }}
                    >
                      {curr.symbol} {curr.code}
                    </Text>
                  </Card>
                ))}
              </View>
            </View>

            {/* Form — üst (sık-yol): Ad + Notlar. Telefon/e-posta/adres akordeonda (Dilim 1 #2/#4). */}
            <View style={styles.section}>
              <Input
                label={t('clients:form.name')}
                placeholder={cari.type === 'tedarikci' ? t('clients:form.nameSupplierPlaceholder') : t('clients:form.nameCustomerPlaceholder')}
                value={name}
                onChangeText={setName}
                error={errors.name}
              />

              <Input
                label={t('clients:form.noteOptional')}
                placeholder={t('clients:form.noteDetailPlaceholder')}
                multiline
                numberOfLines={3}
                value={notes}
                onChangeText={setNotes}
              />

              {/* Detaylar — GUARDRAIL: dolu alan varsa açık başlar (kullanıcı verisini
                  görmeden üstüne yazmasın). defaultOpen kaynak kayıttan hesaplanır (mount'ta cari yüklü). */}
              <Collapsible
                title={t('clients:form.detailsSection')}
                defaultOpen={!!(cari.phone || cari.email || cari.address)}
              >
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
              loading={updateCari.isPending}
              onPress={handleSubmit}
              style={styles.button}
            >
              {t('common:buttons.update')}
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
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
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
