import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Calendar, X } from 'lucide-react-native';
import { Text, Input, Button, Card, BalanceDirectionSelector, type BalanceDirection } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, HIT_SLOP } from '@/constants/spacing';
import { useCreatePersonel } from '@/hooks/usePersonel';
import { formatDateForDB, ensureValidDate } from '@/lib/date';
import { parseCurrency } from '@/lib/currency';
import { useDateFormat } from '@/hooks/useDateFormat';
import { Currency } from '@/types/database';
import { getLocalizedCurrencies } from '@/constants/currencies';
import { toErrorMessage } from '@/lib/errors';
import { useSaveSuccessFeedback } from '@/hooks/useSaveSuccessFeedback';
import { usePagePermission } from '@/hooks/usePagePermission';

export default function PersonelEklePage() {
  const router = useRouter();
  const notifySaved = useSaveSuccessFeedback();
  const { t, i18n } = useTranslation(['staff', 'common', 'errors']);
  usePagePermission({ module: 'personel', action: 'create' });
  const { locale, formatDateNative } = useDateFormat();
  const createPersonel = useCreatePersonel();

  // Dile göre varsayılan para birimi
  const defaultCurrency: Currency = i18n.language.startsWith('en') ? 'USD' : 'TRY';
  const currencies = getLocalizedCurrencies(i18n.language);

  const [firstName, setFirstName] = useState('');
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [salary, setSalary] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [balance, setBalance] = useState('');
  const [balanceDirection, setBalanceDirection] = useState<BalanceDirection>('credit');
  const [errors, setErrors] = useState<{ firstName?: string }>({});

  const validate = () => {
    const newErrors: { firstName?: string } = {};

    if (!firstName.trim()) {
      newErrors.firstName = t('staff:validation.firstNameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    // Bakiye hesaplama
    // debt (bize borç) = personelin bize borcu var = pozitif bakiye (alacağımız var)
    // credit (bize alacak) = bizim personele borcumuz var = negatif bakiye
    let finalBalance = balance ? parseCurrency(balance) : 0;
    if (balanceDirection === 'credit' && finalBalance > 0) {
      finalBalance = -finalBalance; // Bize alacak = bizim borcumuz, negatif
    }
    // debt durumunda pozitif kalır (bize borç = alacağımız var)

    try {
      await createPersonel.mutateAsync({
        first_name: firstName.trim(),
        last_name: lastName.trim() || '',
        currency,
        phone: phone.trim() || null,
        position: position.trim() || null,
        salary: salary ? parseCurrency(salary) : null,
        start_date: startDate ? formatDateForDB(startDate) : null,
        end_date: endDate ? formatDateForDB(endDate) : null,
        balance: finalBalance !== 0 ? finalBalance : undefined,
      });

      notifySaved(t('staff:messages.createSuccess'));
      router.back();
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:personel.createFailed'));
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
            <Text variant="h2">{t('staff:titles.addPersonnel')}</Text>
          </View>

          {/* Para Birimi Seçimi */}
          <View style={styles.section}>
            <Text variant="label" color="secondary" style={styles.sectionTitle}>
              {t('staff:form.currency')}
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
              label={t('staff:form.firstName')}
              placeholder={t('staff:form.firstNamePlaceholder')}
              value={firstName}
              onChangeText={setFirstName}
              error={errors.firstName}
            />

            <Input
              label={t('staff:form.lastNameOptional')}
              placeholder={t('staff:form.lastNamePlaceholder')}
              value={lastName}
              onChangeText={setLastName}
            />

            <Input
              label={t('staff:form.phoneOptional')}
              placeholder={t('staff:form.phoneExample')}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />

            <Input
              label={t('staff:form.positionOptional')}
              placeholder={t('staff:form.positionPlaceholder')}
              value={position}
              onChangeText={setPosition}
            />

            <Input
              label={t('staff:form.salaryOptional')}
              placeholder={t('staff:form.salaryPlaceholder')}
              keyboardType="decimal-pad"
              value={salary}
              onChangeText={setSalary}
            />

            {/* Açılış Bakiyesi */}
            <Input
              label={t('staff:form.openingBalanceOptional')}
              placeholder={t('staff:form.initialBalancePlaceholder')}
              keyboardType="decimal-pad"
              value={balance}
              onChangeText={setBalance}
            />

            {/* Bakiye Yönü - sadece bakiye girilmişse göster */}
            {balance.trim() !== '' && (
              <View style={styles.balanceDirectionContainer}>
                <Text variant="label" style={styles.balanceDirectionLabel}>
                  {t('staff:form.balanceDirection.label')}
                </Text>
                <BalanceDirectionSelector
                  value={balanceDirection}
                  onChange={setBalanceDirection}
                  variant="staff"
                />
              </View>
            )}

            {/* İşe Başlama Tarihi */}
            <View style={styles.dateField}>
              <Text variant="label" style={styles.dateLabel}>
                {t('staff:form.startDateOptional')}
              </Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Calendar size={20} color={colors.textMuted} />
                <Text
                  variant="body"
                  color={startDate ? 'primary' : 'secondary'}
                  style={styles.dateText}
                >
                  {startDate
                    ? formatDateNative(startDate)
                    : t('staff:form.selectDate')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* iOS için DateTimePicker Modal */}
            {Platform.OS === 'ios' && showDatePicker && (
              <Modal visible={showDatePicker} transparent animationType="slide">
                <Pressable
                  style={styles.datePickerModalOverlay}
                  onPress={() => setShowDatePicker(false)}
                >
                  <Pressable
                    style={styles.datePickerModalContent}
                    onPress={(e) => e.stopPropagation()}
                  >
                    <View style={styles.datePickerModalHeader}>
                      <Text variant="h3">{t('staff:form.startDate')}</Text>
                      <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                        <X size={24} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={ensureValidDate(startDate || new Date())}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      onChange={(event, date) => {
                        if (date) {
                          setStartDate(date);
                        }
                      }}
                      maximumDate={new Date()}
                      locale={locale}
                      themeVariant="light"
                      accentColor={colors.primary}
                      style={{ height: 350 }}
                    />
                    <Button
                      variant="primary"
                      onPress={() => setShowDatePicker(false)}
                      style={{ marginTop: spacing.md }}
                    >
                      {t('common:buttons.ok')}
                    </Button>
                  </Pressable>
                </Pressable>
              </Modal>
            )}

            {/* Android için DateTimePicker */}
            {Platform.OS === 'android' && showDatePicker && (
              <DateTimePicker
                value={ensureValidDate(startDate || new Date())}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowDatePicker(false);
                  if (event.type === 'set' && date) {
                    setStartDate(date);
                  }
                }}
                maximumDate={new Date()}
              />
            )}

            {/* İşten Çıkış Tarihi */}
            <View style={styles.dateField}>
              <Text variant="label" style={styles.dateLabel}>
                {t('staff:form.endDateOptional')}
              </Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowEndDatePicker(true)}
              >
                <Calendar size={20} color={endDate ? colors.error : colors.textMuted} />
                <Text
                  variant="body"
                  color={endDate ? 'error' : 'secondary'}
                  style={styles.dateText}
                >
                  {endDate
                    ? formatDateNative(endDate)
                    : t('staff:form.selectDate')}
                </Text>
                {endDate && (
                  <TouchableOpacity
                    onPress={() => setEndDate(null)}
                    hitSlop={HIT_SLOP.md}
                  >
                    <X size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </View>

            {/* iOS için End Date DateTimePicker Modal */}
            {Platform.OS === 'ios' && showEndDatePicker && (
              <Modal visible={showEndDatePicker} transparent animationType="slide">
                <Pressable
                  style={styles.datePickerModalOverlay}
                  onPress={() => setShowEndDatePicker(false)}
                >
                  <Pressable
                    style={styles.datePickerModalContent}
                    onPress={(e) => e.stopPropagation()}
                  >
                    <View style={styles.datePickerModalHeader}>
                      <Text variant="h3">{t('staff:form.endDate')}</Text>
                      <TouchableOpacity onPress={() => setShowEndDatePicker(false)}>
                        <X size={24} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={ensureValidDate(endDate || new Date())}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      onChange={(event, date) => {
                        if (date) {
                          setEndDate(date);
                        }
                      }}
                      maximumDate={new Date()}
                      locale={locale}
                      themeVariant="light"
                      accentColor={colors.primary}
                      style={{ height: 350 }}
                    />
                    <Button
                      variant="primary"
                      onPress={() => setShowEndDatePicker(false)}
                      style={{ marginTop: spacing.md }}
                    >
                      {t('common:buttons.ok')}
                    </Button>
                  </Pressable>
                </Pressable>
              </Modal>
            )}

            {/* Android için End Date DateTimePicker */}
            {Platform.OS === 'android' && showEndDatePicker && (
              <DateTimePicker
                value={ensureValidDate(endDate || new Date())}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowEndDatePicker(false);
                  if (event.type === 'set' && date) {
                    setEndDate(date);
                  }
                }}
                maximumDate={new Date()}
              />
            )}
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
              loading={createPersonel.isPending}
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
  // Date picker styles
  dateField: {
    marginBottom: spacing.md,
  },
  dateLabel: {
    marginBottom: spacing.xs,
    color: colors.text,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  dateText: {
    flex: 1,
  },
  datePickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
  },
  datePickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
});
