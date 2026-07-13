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
import { Text, Input, Button, Card, DateTimePicker, CategoryPicker, CurrencyInput, ReminderSettings } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { usePersonelList } from '@/hooks/usePersonel';
import { useCreateIslem } from '@/hooks/useIslemler';
import { useCreateIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import { formatCurrency, parseCurrency } from '@/lib/currency';
import { formatDateForDB, formatDateTimeForDB } from '@/lib/date';
import { scheduleTransactionReminder, calculateReminderDate } from '@/lib/notifications';
import { useTranslation } from 'react-i18next';
import { toErrorMessage } from '@/lib/errors';
import { useSaveSuccessFeedback } from '@/hooks/useSaveSuccessFeedback';
import { usePagePermission } from '@/hooks/usePagePermission';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { personelGiderSchema, type PersonelGiderFormData } from '@/lib/schemas/paymentForm';

const errorKeyMap: Record<string, string> = {
  invalidAmount: 'errors:validation.invalidAmount',
  selectPersonel: 'errors:personel.selectPersonel',
  futureDateRequired: 'errors:transaction.futureDateRequired',
};

export default function PersonelGiderPage() {
  const router = useRouter();
  const notifySaved = useSaveSuccessFeedback();
  const { t } = useTranslation(['transactions', 'common', 'errors', 'staff']);
  usePagePermission({ module: 'islemler', action: 'create' });
  const params = useLocalSearchParams<{ personel_id?: string }>();
  const createIslem = useCreateIslem();
  const createIleriTarihliIslem = useCreateIleriTarihliIslem();

  const { data: personelList } = usePersonelList();

  const [showPersonelPicker, setShowPersonelPicker] = useState(false);

  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<PersonelGiderFormData>({
    resolver: zodResolver(personelGiderSchema),
    defaultValues: {
      amount: '',
      description: '',
      selectedDate: new Date(),
      personelId: params.personel_id || null,
      kategoriId: null,
      isIleriTarihli: false,
      reminderConfig: { enabled: false, daysBefore: 0, time: '09:00' },
    },
  });

  const personelId = watch('personelId');
  const isIleriTarihli = watch('isIleriTarihli');

  const getErrorMessage = (field: keyof PersonelGiderFormData) => {
    const msg = errors[field]?.message;
    if (!msg) return undefined;
    return t(errorKeyMap[msg] || msg);
  };

  useEffect(() => {
    if (!personelId && personelList && personelList.length > 0 && !params.personel_id) {
      setValue('personelId', personelList[0].id);
    }
  }, [personelList, personelId, params.personel_id, setValue]);

  const selectedPersonel = personelList?.find((p) => p.id === personelId);

  const onSubmit = async (data: PersonelGiderFormData) => {
    try {
      if (data.isIleriTarihli) {
        const scheduledDate = formatDateForDB(data.selectedDate);
        const result = await createIleriTarihliIslem.mutateAsync({
          type: 'personel_gider',
          amount: parseCurrency(data.amount),
          description: data.description.trim() || null,
          personel_id: data.personelId,
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
            `${t('transactions:types.personel_gider')}: ${formatCurrency(parseCurrency(data.amount))}${data.description ? ` - ${data.description}` : ''}`,
            reminderDate,
            {
              type: 'scheduled_transaction_reminder',
              transaction_id: result.id,
              personel_id: data.personelId,
            }
          );
        }

        notifySaved(t('staff:messages.scheduledExpenseCreated'));
        router.back();
      } else {
        await createIslem.mutateAsync({
          type: 'personel_gider',
          amount: parseCurrency(data.amount),
          description: data.description.trim() || null,
          personel_id: data.personelId,
          kategori_id: data.kategoriId,
          date: formatDateTimeForDB(data.selectedDate),
        });

        notifySaved(t('staff:messages.expenseRecorded'));
        router.back();
      }
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:transaction.addFailed'));
    }
  };

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
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View style={styles.headerTitleContainer}>
                <Text variant="h2">{t('staff:transactionTitles.expense')}</Text>
                <Text variant="body" color="secondary">
                  {t('staff:transactionDescriptions.expense')}
                </Text>
              </View>
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
            <View style={[styles.pickerContainer, { zIndex: 20 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                {t('staff:transactionForm.personel')}
              </Text>
              <TouchableOpacity
                style={[styles.picker, errors.personelId && styles.pickerError]}
                onPress={() => setShowPersonelPicker(!showPersonelPicker)}
              >
                <View>
                  <Text variant="body">
                    {selectedPersonel
                      ? `${selectedPersonel.first_name} ${selectedPersonel.last_name}`
                      : t('staff:transactionForm.selectPersonel')}
                  </Text>
                  {selectedPersonel && (
                    <Text variant="caption" color={Number(selectedPersonel.balance) < 0 ? 'error' : 'secondary'}>
                      {t('staff:balance.weOwe')}: {formatCurrency(Math.abs(Number(selectedPersonel.balance)), selectedPersonel.currency)}
                    </Text>
                  )}
                </View>
                <ChevronDown size={20} color={colors.textMuted} />
              </TouchableOpacity>
              {errors.personelId && (
                <Text variant="caption" color="error" style={styles.errorText}>
                  {getErrorMessage('personelId')}
                </Text>
              )}
              {showPersonelPicker && (
                <Card style={styles.pickerDropdown}>
                  {personelList?.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.pickerOption}
                      onPress={() => {
                        setValue('personelId', p.id, { shouldValidate: true });
                        setShowPersonelPicker(false);
                      }}
                    >
                      <Text variant="body" style={p.id === personelId && { color: colors.primary }}>
                        {p.first_name} {p.last_name}
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
                  type="gider"
                  label={t('transactions:form.category')}
                />
              )}
            />

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

            <Controller
              control={control}
              name="selectedDate"
              render={({ field: { value, onChange } }) => (
                <DateTimePicker
                  label={isIleriTarihli ? t('transactions:form.transactionDate') : t('transactions:form.dateTime')}
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
                  label={t('staff:transactionForm.descriptionOptional')}
                  placeholder={t('staff:transactionForm.expenseNote')}
                  multiline
                  numberOfLines={3}
                  value={value}
                  onChangeText={onChange}
                />
              )}
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
