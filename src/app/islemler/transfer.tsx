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
import { useRouter } from 'expo-router';
import { ChevronDown, ArrowRight, Bell } from 'lucide-react-native';
import { Text, Input, Button, Card, DateTimePicker, CurrencyInput, ReminderSettings } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCreateIslem } from '@/hooks/useIslemler';
import { useCreateIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import { formatCurrency, parseCurrency } from '@/lib/currency';
import { formatDateForDB, formatDateTimeForDB } from '@/lib/date';
import { scheduleTransactionReminder, calculateReminderDate } from '@/lib/notifications';
import { useTranslation } from 'react-i18next';
import { toErrorMessage } from '@/lib/errors';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { transferSchema, type TransferFormData } from '@/lib/schemas/paymentForm';

const errorKeyMap: Record<string, string> = {
  invalidAmount: 'errors:validation.invalidAmount',
  selectSourceAccount: 'errors:account.selectSourceAccount',
  selectTargetAccount: 'errors:account.selectTargetAccount',
  sameAccountError: 'errors:account.sameAccountError',
  futureDateRequired: 'errors:transaction.futureDateRequired',
};

export default function TransferPage() {
  const router = useRouter();
  const { t } = useTranslation(['transactions', 'common', 'errors']);
  const createIslem = useCreateIslem();
  const createIleriTarihliIslem = useCreateIleriTarihliIslem();

  const { data: hesaplar } = useHesaplar();

  const [showKaynakPicker, setShowKaynakPicker] = useState(false);
  const [showHedefPicker, setShowHedefPicker] = useState(false);

  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      amount: '',
      description: '',
      selectedDate: new Date(),
      kaynakHesapId: null,
      hedefHesapId: null,
      isIleriTarihli: false,
      reminderConfig: { enabled: false, daysBefore: 0, time: '09:00' },
    },
  });

  const kaynakHesapId = watch('kaynakHesapId');
  const hedefHesapId = watch('hedefHesapId');
  const isIleriTarihli = watch('isIleriTarihli');

  const getErrorMessage = (field: keyof TransferFormData) => {
    const msg = errors[field]?.message;
    if (!msg) return undefined;
    return t(errorKeyMap[msg] || msg);
  };

  useEffect(() => {
    if (hesaplar && hesaplar.length >= 2 && !kaynakHesapId && !hedefHesapId) {
      setValue('kaynakHesapId', hesaplar[0].id);
      setValue('hedefHesapId', hesaplar[1].id);
    }
  }, [hesaplar, kaynakHesapId, hedefHesapId, setValue]);

  const kaynakHesap = hesaplar?.find((h) => h.id === kaynakHesapId);
  const hedefHesap = hesaplar?.find((h) => h.id === hedefHesapId);

  const onSubmit = async (data: TransferFormData) => {
    try {
      if (data.isIleriTarihli) {
        const scheduledDate = formatDateForDB(data.selectedDate);
        const result = await createIleriTarihliIslem.mutateAsync({
          type: 'transfer',
          amount: parseCurrency(data.amount),
          description: data.description.trim() || null,
          hesap_id: data.kaynakHesapId,
          hedef_hesap_id: data.hedefHesapId,
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
            `${t('transactions:types.transfer')}: ${formatCurrency(parseCurrency(data.amount))}${data.description ? ` - ${data.description}` : ''}`,
            reminderDate,
            {
              type: 'scheduled_transaction_reminder',
              transaction_id: result.id,
              hesap_id: data.kaynakHesapId,
            }
          );
        }

        Alert.alert(t('common:status.success'), t('transactions:messages.scheduledCreated'), [
          { text: t('common:buttons.ok'), onPress: () => router.back() },
        ]);
      } else {
        await createIslem.mutateAsync({
          type: 'transfer',
          amount: parseCurrency(data.amount),
          description: data.description.trim() || null,
          hesap_id: data.kaynakHesapId,
          hedef_hesap_id: data.hedefHesapId,
          date: formatDateTimeForDB(data.selectedDate),
        });

        Alert.alert(t('common:status.success'), t('transactions:messages.transferCompleted'), [
          { text: t('common:buttons.ok'), onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:account.transferFailed'));
    }
  };

  const closeAllPickers = () => {
    setShowKaynakPicker(false);
    setShowHedefPicker(false);
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
              <Text variant="h2" style={styles.headerTitle}>{t('transactions:titles.transferBetweenAccounts')}</Text>
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

            {/* Kaynak Hesap */}
            <View style={[styles.pickerContainer, { zIndex: 20 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                {t('transactions:form.sourceAccount')}
              </Text>
              <TouchableOpacity
                style={[styles.picker, errors.kaynakHesapId && styles.pickerError]}
                onPress={() => {
                  closeAllPickers();
                  setShowKaynakPicker(!showKaynakPicker);
                }}
              >
                <View>
                  <Text variant="body">{kaynakHesap?.name || t('transactions:form.accountPlaceholder')}</Text>
                  {kaynakHesap && (
                    <Text variant="caption" color="secondary">
                      {t('common:currency.balance')}: {formatCurrency(Number(kaynakHesap.balance))}
                    </Text>
                  )}
                </View>
                <ChevronDown size={20} color={colors.textMuted} />
              </TouchableOpacity>
              {errors.kaynakHesapId && (
                <Text variant="caption" color="error" style={styles.errorText}>
                  {getErrorMessage('kaynakHesapId')}
                </Text>
              )}
              {showKaynakPicker && (
                <Card style={styles.pickerDropdown}>
                  {hesaplar?.filter(h => h.id !== hedefHesapId).map((hesap) => (
                    <TouchableOpacity
                      key={hesap.id}
                      style={styles.pickerOption}
                      onPress={() => {
                        setValue('kaynakHesapId', hesap.id, { shouldValidate: true });
                        setShowKaynakPicker(false);
                      }}
                    >
                      <Text
                        variant="body"
                        style={hesap.id === kaynakHesapId && { color: colors.primary }}
                      >
                        {hesap.name}
                      </Text>
                      <Text variant="caption" color="secondary">
                        {formatCurrency(Number(hesap.balance))}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </Card>
              )}
            </View>

            {/* Transfer Arrow */}
            <View style={styles.arrowContainer}>
              <ArrowRight size={24} color={colors.primary} />
            </View>

            {/* Hedef Hesap */}
            <View style={[styles.pickerContainer, { zIndex: 10 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                {t('transactions:form.targetAccount')}
              </Text>
              <TouchableOpacity
                style={[styles.picker, errors.hedefHesapId && styles.pickerError]}
                onPress={() => {
                  closeAllPickers();
                  setShowHedefPicker(!showHedefPicker);
                }}
              >
                <View>
                  <Text variant="body">{hedefHesap?.name || t('transactions:form.accountPlaceholder')}</Text>
                  {hedefHesap && (
                    <Text variant="caption" color="secondary">
                      {t('common:currency.balance')}: {formatCurrency(Number(hedefHesap.balance))}
                    </Text>
                  )}
                </View>
                <ChevronDown size={20} color={colors.textMuted} />
              </TouchableOpacity>
              {errors.hedefHesapId && (
                <Text variant="caption" color="error" style={styles.errorText}>
                  {getErrorMessage('hedefHesapId')}
                </Text>
              )}
              {showHedefPicker && (
                <Card style={styles.pickerDropdown}>
                  {hesaplar?.filter(h => h.id !== kaynakHesapId).map((hesap) => (
                    <TouchableOpacity
                      key={hesap.id}
                      style={styles.pickerOption}
                      onPress={() => {
                        setValue('hedefHesapId', hesap.id, { shouldValidate: true });
                        setShowHedefPicker(false);
                      }}
                    >
                      <Text
                        variant="body"
                        style={hesap.id === hedefHesapId && { color: colors.primary }}
                      >
                        {hesap.name}
                      </Text>
                      <Text variant="caption" color="secondary">
                        {formatCurrency(Number(hesap.balance))}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </Card>
              )}
            </View>

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
                  placeholder={t('transactions:form.notePlaceholder')}
                  multiline
                  numberOfLines={2}
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
              {isIleriTarihli ? t('transactions:form.schedule') : t('transactions:titles.doTransfer')}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
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
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  pickerContainer: {
    marginBottom: spacing.md,
    zIndex: 1,
  },
  pickerLabel: {
    marginBottom: spacing.sm,
  },
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
  pickerError: {
    borderColor: colors.error,
  },
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
  errorText: {
    marginTop: spacing.xs,
  },
  arrowContainer: {
    alignItems: 'center',
    marginVertical: spacing.sm,
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
  buttonIleriTarihli: {
    backgroundColor: colors.warning,
  },
});
