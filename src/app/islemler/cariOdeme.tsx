import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronDown, Bell } from 'lucide-react-native';
import { Text, Input, Button, Card, DateTimePicker, CategoryPicker, CurrencyInput, ReminderSettings, type ReminderConfig } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useCariler } from '@/hooks/useCariler';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCreateIslem } from '@/hooks/useIslemler';
import { useCreateIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import { formatCurrency, parseCurrency, isValidAmount } from '@/lib/currency';
import { formatDateForDB, formatDateTimeForDB } from '@/lib/date';
import { scheduleTransactionReminder, calculateReminderDate } from '@/lib/notifications';
import { useTranslation } from 'react-i18next';

export default function CariOdemePage() {
  const router = useRouter();
  const { t } = useTranslation(['transactions', 'common', 'errors', 'clients']);
  const params = useLocalSearchParams<{ cari_id?: string; hesap_id?: string }>();
  const createIslem = useCreateIslem();
  const createIleriTarihliIslem = useCreateIleriTarihliIslem();

  const { data: cariler } = useCariler('tedarikci');
  const { data: hesaplar } = useHesaplar();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [cariId, setCariId] = useState<string | null>(params.cari_id || null);
  const [hesapId, setHesapId] = useState<string | null>(params.hesap_id || null);
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [showCariPicker, setShowCariPicker] = useState(false);
  const [showHesapPicker, setShowHesapPicker] = useState(false);
  const [isIleriTarihli, setIsIleriTarihli] = useState(false);
  const [reminderConfig, setReminderConfig] = useState<ReminderConfig>({
    enabled: false,
    daysBefore: 0,
    time: '09:00',
  });
  const [errors, setErrors] = useState<{ amount?: string; cari?: string; hesap?: string; date?: string }>({});

  useEffect(() => {
    if (!cariId && cariler && cariler.length > 0 && !params.cari_id) {
      setCariId(cariler[0].id);
    }
    if (!hesapId && hesaplar && hesaplar.length > 0 && !params.hesap_id) {
      setHesapId(hesaplar[0].id);
    }
  }, [cariler, hesaplar, cariId, hesapId, params.cari_id, params.hesap_id]);

  const selectedCari = cariler?.find((c) => c.id === cariId);
  const selectedHesap = hesaplar?.find((h) => h.id === hesapId);

  const validate = () => {
    const newErrors: { amount?: string; cari?: string; hesap?: string; date?: string } = {};

    if (!isValidAmount(amount)) {
      newErrors.amount = t('errors:validation.invalidAmount');
    }

    if (!cariId) {
      newErrors.cari = t('errors:cari.selectSupplier');
    }

    if (!hesapId) {
      newErrors.hesap = t('errors:cari.selectPaymentAccount');
    }

    if (isIleriTarihli) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selected = new Date(selectedDate);
      selected.setHours(0, 0, 0, 0);

      if (selected <= today) {
        newErrors.date = t('errors:transaction.futureDateRequired');
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      if (isIleriTarihli) {
        const scheduledDate = formatDateForDB(selectedDate);
        const result = await createIleriTarihliIslem.mutateAsync({
          type: 'cari_odeme',
          amount: parseCurrency(amount),
          description: description.trim() || null,
          cari_id: cariId,
          hesap_id: hesapId,
          kategori_id: kategoriId,
          scheduled_date: scheduledDate,
        });

        if (reminderConfig.enabled && result?.id) {
          const reminderDate = calculateReminderDate(
            scheduledDate,
            reminderConfig.daysBefore,
            reminderConfig.time
          );

          await scheduleTransactionReminder(
            result.id,
            t('transactions:notifications.reminderTitle'),
            `${t('transactions:types.cari_odeme')}: ${formatCurrency(parseCurrency(amount))}${description ? ` - ${description}` : ''}`,
            reminderDate,
            {
              type: 'scheduled_transaction_reminder',
              transaction_id: result.id,
              cari_id: cariId,
            }
          );
        }

        Alert.alert(t('common:status.success'), t('clients:messages.scheduledPaymentCreated'), [
          { text: t('common:buttons.ok'), onPress: () => router.back() },
        ]);
      } else {
        await createIslem.mutateAsync({
          type: 'cari_odeme',
          amount: parseCurrency(amount),
          description: description.trim() || null,
          cari_id: cariId,
          hesap_id: hesapId,
          kategori_id: kategoriId,
          date: formatDateTimeForDB(selectedDate),
        });

        Alert.alert(t('common:status.success'), t('clients:messages.paymentRecorded'), [
          { text: t('common:buttons.ok'), onPress: () => router.back() },
        ]);
      }
    } catch (error: any) {
      Alert.alert(t('common:status.error'), error.message || t('errors:transaction.addFailed'));
    }
  };

  const closeAllPickers = () => {
    setShowCariPicker(false);
    setShowHesapPicker(false);
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
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View style={styles.headerTitleContainer}>
                <Text variant="h2">{t('clients:transactionTitles.supplierPayment')}</Text>
                <Text variant="body" color="secondary">
                  {t('clients:transactionDescriptions.payment')}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.bellButton, isIleriTarihli && styles.bellButtonActive]}
                onPress={() => {
                  setIsIleriTarihli(!isIleriTarihli);
                  if (!isIleriTarihli) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    setSelectedDate(tomorrow);
                  }
                }}
              >
                <Bell size={22} color={isIleriTarihli ? colors.warning : colors.textMuted} />
              </TouchableOpacity>
            </View>
            {isIleriTarihli && (
              <View style={styles.ileriTarihliIndicator}>
                <Text variant="caption" style={styles.ileriTarihliText}>
                  {t('transactions:scheduled.title')}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={[styles.pickerContainer, { zIndex: 30 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                {t('clients:transactionForm.supplier')}
              </Text>
              <TouchableOpacity
                style={[styles.picker, errors.cari && styles.pickerError]}
                onPress={() => {
                  closeAllPickers();
                  setShowCariPicker(!showCariPicker);
                }}
              >
                <View>
                  <Text variant="body">{selectedCari?.name || t('clients:transactionForm.selectSupplier')}</Text>
                  {selectedCari && (
                    <Text variant="caption" color={Number(selectedCari.balance) < 0 ? 'error' : 'success'}>
                      {t('clients:balance.payable')}: {formatCurrency(Math.abs(Number(selectedCari.balance)), selectedCari.currency)}
                    </Text>
                  )}
                </View>
                <ChevronDown size={20} color={colors.textMuted} />
              </TouchableOpacity>
              {errors.cari && (
                <Text variant="caption" color="error" style={styles.errorText}>
                  {errors.cari}
                </Text>
              )}
              {showCariPicker && (
                <Card style={styles.pickerDropdown}>
                  {cariler?.map((cari) => (
                    <TouchableOpacity
                      key={cari.id}
                      style={styles.pickerOption}
                      onPress={() => {
                        setCariId(cari.id);
                        setShowCariPicker(false);
                      }}
                    >
                      <Text variant="body" style={cari.id === cariId && { color: colors.primary }}>
                        {cari.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </Card>
              )}
            </View>

            <View style={[styles.pickerContainer, { zIndex: 20 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                {t('clients:transactionForm.paymentAccount')}
              </Text>
              <TouchableOpacity
                style={[styles.picker, errors.hesap && styles.pickerError]}
                onPress={() => {
                  closeAllPickers();
                  setShowHesapPicker(!showHesapPicker);
                }}
              >
                <View>
                  <Text variant="body">{selectedHesap?.name || t('transactions:form.accountPlaceholder')}</Text>
                  {selectedHesap && (
                    <Text variant="caption" color="secondary">
                      {t('common:currency.balance')}: {formatCurrency(Number(selectedHesap.balance))}
                    </Text>
                  )}
                </View>
                <ChevronDown size={20} color={colors.textMuted} />
              </TouchableOpacity>
              {errors.hesap && (
                <Text variant="caption" color="error" style={styles.errorText}>
                  {errors.hesap}
                </Text>
              )}
              {showHesapPicker && (
                <Card style={styles.pickerDropdown}>
                  {hesaplar?.map((hesap) => (
                    <TouchableOpacity
                      key={hesap.id}
                      style={styles.pickerOption}
                      onPress={() => {
                        setHesapId(hesap.id);
                        setShowHesapPicker(false);
                      }}
                    >
                      <Text variant="body" style={hesap.id === hesapId && { color: colors.primary }}>
                        {hesap.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </Card>
              )}
            </View>

            <CategoryPicker
              value={kategoriId}
              onChange={setKategoriId}
              type="gider"
              label={t('transactions:form.category')}
            />

            <CurrencyInput
              label={t('transactions:form.amount')}
              value={amount}
              onChangeText={setAmount}
              error={errors.amount}
            />

            <DateTimePicker
              label={isIleriTarihli ? t('transactions:form.transactionDate') : t('transactions:form.dateTime')}
              value={selectedDate}
              onChange={setSelectedDate}
              mode={isIleriTarihli ? "date" : "datetime"}
              error={errors.date}
            />

            {isIleriTarihli && (
              <ReminderSettings
                value={reminderConfig}
                onChange={setReminderConfig}
              />
            )}

            <Input
              label={t('clients:transactionForm.descriptionOptional')}
              placeholder={t('clients:transactionForm.paymentNote')}
              multiline
              numberOfLines={3}
              value={description}
              onChangeText={setDescription}
            />
          </View>

          <View style={styles.buttons}>
            <Button variant="outline" size="lg" onPress={() => router.back()} style={styles.button}>
              {t('common:buttons.cancel')}
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={createIslem.isPending || createIleriTarihliIslem.isPending}
              onPress={handleSubmit}
              style={[styles.button, isIleriTarihli && styles.buttonIleriTarihli]}
            >
              {isIleriTarihli ? t('transactions:form.schedule') : t('clients:transactionButtons.makePayment')}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  keyboardView: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: spacing['3xl'] },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerTitleContainer: {
    flex: 1,
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  bellButtonActive: {
    backgroundColor: colors.warning + '20',
    borderColor: colors.warning,
  },
  ileriTarihliIndicator: {
    marginTop: spacing.sm,
    backgroundColor: colors.warning + '20',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  ileriTarihliText: {
    color: colors.warning,
    fontWeight: '600',
  },
  section: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  pickerContainer: { marginBottom: spacing.lg, zIndex: 1 },
  pickerLabel: { marginBottom: spacing.sm },
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pickerError: { borderColor: colors.error },
  pickerDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing.xs,
    zIndex: 10,
  },
  pickerOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  errorText: { marginTop: spacing.xs },
  buttons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  button: { flex: 1 },
  buttonIleriTarihli: {
    backgroundColor: colors.warning,
  },
});
