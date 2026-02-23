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
import { useTranslation } from 'react-i18next';
import { Text, Input, Button, Card, DateTimePicker, CategoryPicker, CurrencyInput, ReminderSettings } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCreateIslem } from '@/hooks/useIslemler';
import { useCreateIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import { parseCurrency, formatCurrency } from '@/lib/currency';
import { formatDateForDB, formatDateTimeForDB } from '@/lib/date';
import { scheduleTransactionReminder, calculateReminderDate } from '@/lib/notifications';
import { toErrorMessage } from '@/lib/errors';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { gelirSchema, type GelirFormData } from '@/lib/schemas/paymentForm';

const errorKeyMap: Record<string, string> = {
  invalidAmount: 'errors:validation.invalidAmount',
  selectAccount: 'errors:account.selectAccount',
  futureDateRequired: 'errors:transaction.futureDateRequired',
};

export default function GelirEklePage() {
  const router = useRouter();
  const { t } = useTranslation(['transactions', 'common', 'errors']);
  const params = useLocalSearchParams<{ hesap_id?: string }>();
  const createIslem = useCreateIslem();
  const createIleriTarihliIslem = useCreateIleriTarihliIslem();

  const { data: hesaplar } = useHesaplar();

  const [showHesapPicker, setShowHesapPicker] = useState(false);

  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<GelirFormData>({
    resolver: zodResolver(gelirSchema),
    defaultValues: {
      amount: '',
      description: '',
      selectedDate: new Date(),
      hesapId: params.hesap_id || null,
      kategoriId: null,
      isIleriTarihli: false,
      reminderConfig: { enabled: false, daysBefore: 0, time: '09:00' },
    },
  });

  const hesapId = watch('hesapId');
  const isIleriTarihli = watch('isIleriTarihli');

  const getErrorMessage = (field: keyof GelirFormData) => {
    const msg = errors[field]?.message;
    if (!msg) return undefined;
    return t(errorKeyMap[msg] || msg);
  };

  useEffect(() => {
    if (!hesapId && hesaplar && hesaplar.length > 0 && !params.hesap_id) {
      setValue('hesapId', hesaplar[0].id);
    }
  }, [hesaplar, hesapId, params.hesap_id, setValue]);

  const selectedHesap = hesaplar?.find((h) => h.id === hesapId);

  const onSubmit = async (data: GelirFormData) => {
    try {
      if (data.isIleriTarihli) {
        const scheduledDate = formatDateForDB(data.selectedDate);
        const result = await createIleriTarihliIslem.mutateAsync({
          type: 'gelir',
          amount: parseCurrency(data.amount),
          description: data.description.trim() || null,
          hesap_id: data.hesapId,
          kategori_id: data.kategoriId,
          scheduled_date: scheduledDate,
        });

        if (data.reminderConfig.enabled && result?.id) {
          const reminderDate = calculateReminderDate(
            scheduledDate,
            data.reminderConfig.daysBefore,
            data.reminderConfig.time
          );

          await scheduleTransactionReminder(
            result.id,
            t('transactions:notifications.reminderTitle'),
            `${t('transactions:types.gelir')}: ${formatCurrency(parseCurrency(data.amount))}${data.description ? ` - ${data.description}` : ''}`,
            reminderDate,
            {
              type: 'scheduled_transaction_reminder',
              transaction_id: result.id,
              hesap_id: data.hesapId,
            }
          );
        }

        Alert.alert(t('common:status.success'), t('transactions:messages.scheduledCreated'), [
          { text: t('common:buttons.ok'), onPress: () => router.back() },
        ]);
      } else {
        await createIslem.mutateAsync({
          type: 'gelir',
          amount: parseCurrency(data.amount),
          description: data.description.trim() || null,
          hesap_id: data.hesapId,
          kategori_id: data.kategoriId,
          date: formatDateTimeForDB(data.selectedDate),
        });

        Alert.alert(t('common:status.success'), t('transactions:messages.incomeAdded'), [
          { text: t('common:buttons.ok'), onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:transaction.addFailed'));
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
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text variant="h2" style={styles.headerTitle}>{t('transactions:titles.addIncome')}</Text>
              <TouchableOpacity
                style={[styles.bellButton, isIleriTarihli && styles.bellButtonActive]}
                onPress={() => {
                  const next = !isIleriTarihli;
                  setValue('isIleriTarihli', next);
                  if (next) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    setValue('selectedDate', tomorrow);
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
            <Controller
              control={control}
              name="amount"
              render={({ field: { value, onChange } }) => (
                <CurrencyInput
                  label={t('transactions:form.amount')}
                  value={value}
                  onChangeText={onChange}
                  error={getErrorMessage('amount')}
                />
              )}
            />

            <View style={[styles.pickerContainer, { zIndex: 20 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                {t('transactions:form.account')}
              </Text>
              <TouchableOpacity
                style={[styles.picker, errors.hesapId && styles.pickerError]}
                onPress={() => setShowHesapPicker(!showHesapPicker)}
              >
                <Text variant="body">
                  {selectedHesap?.name || t('transactions:form.accountPlaceholder')}
                </Text>
                <ChevronDown size={20} color={colors.textMuted} />
              </TouchableOpacity>
              {errors.hesapId && (
                <Text variant="caption" color="error" style={styles.errorText}>
                  {getErrorMessage('hesapId')}
                </Text>
              )}
              {showHesapPicker && (
                <Card style={styles.pickerDropdown}>
                  {hesaplar?.map((hesap) => (
                    <TouchableOpacity
                      key={hesap.id}
                      style={styles.pickerOption}
                      onPress={() => {
                        setValue('hesapId', hesap.id, { shouldValidate: true });
                        setShowHesapPicker(false);
                      }}
                    >
                      <Text
                        variant="body"
                        style={hesap.id === hesapId && { color: colors.primary }}
                      >
                        {hesap.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </Card>
              )}
            </View>

            <Controller
              control={control}
              name="kategoriId"
              render={({ field: { value, onChange } }) => (
                <CategoryPicker
                  value={value}
                  onChange={onChange}
                  type="gelir"
                  label={t('transactions:form.category')}
                />
              )}
            />

            <Controller
              control={control}
              name="selectedDate"
              render={({ field: { value, onChange } }) => (
                <DateTimePicker
                  label={isIleriTarihli ? t('transactions:form.date') : t('common:labels.date')}
                  value={value}
                  onChange={onChange}
                  mode={isIleriTarihli ? "date" : "datetime"}
                  error={getErrorMessage('selectedDate')}
                />
              )}
            />

            {isIleriTarihli && (
              <Controller
                control={control}
                name="reminderConfig"
                render={({ field: { value, onChange } }) => (
                  <ReminderSettings
                    value={value}
                    onChange={onChange}
                  />
                )}
              />
            )}

            <Controller
              control={control}
              name="description"
              render={({ field: { value, onChange } }) => (
                <Input
                  label={t('transactions:form.description')}
                  placeholder={t('transactions:form.descriptionPlaceholder')}
                  multiline
                  numberOfLines={3}
                  value={value}
                  onChangeText={onChange}
                />
              )}
            />
          </View>

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
              loading={createIslem.isPending || createIleriTarihliIslem.isPending}
              onPress={handleSubmit(onSubmit)}
              style={[styles.button, isIleriTarihli && styles.buttonIleriTarihli]}
            >
              {isIleriTarihli ? t('transactions:form.schedule') : t('common:buttons.save')}
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
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { flex: 1 },
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
