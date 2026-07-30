import { useState, type ReactNode } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, TouchableOpacity, Pressable } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Calendar, X } from 'lucide-react-native';
import { Text, Input, Button, CurrencyPicker, BalanceDirectionSelector, type BalanceDirection, Screen, Modal } from '@/components/ui';
import { useFooterBottomPadding } from '@/hooks/useFooterBottomPadding';
import { colors } from '@/constants/colors';
import { spacing, HIT_SLOP } from '@/constants/spacing';
import { useCreatePersonel, usePersonelList } from '@/hooks/usePersonel';
import { useCariler } from '@/hooks/useCariler';
import { formatDateForDB, ensureValidDate } from '@/lib/date';
import { parseCurrency } from '@/lib/currency';
import { useDateFormat } from '@/hooks/useDateFormat';
import { Currency } from '@/types/database';
import { toErrorMessage } from '@/lib/errors';
import { useSaveSuccessFeedback } from '@/hooks/useSaveSuccessFeedback';
import { usePagePermission } from '@/hooks/usePagePermission';
import { DeviceContactPickerButton } from '@/components/contacts/DeviceContactPickerButton';
import {
  findPhoneDuplicateMatches,
  getPhoneDuplicateWarningCopy,
  getPhoneValidationMessageKey,
  preparePhoneForSave,
} from '@/lib/phone';

/**
 * Tarih seçici alt sayfası — AYRI BİLEŞEN, çünkü güvenli alan Modal'ın İÇİNDE
 * okunmalı: ModalInsets yalnız modal ağacının içindeki useSafeAreaInsets'i
 * gerçek değere düzeltir. Alt boşluk verilmezse 'Tamam' butonu home
 * indicator'ın altında kalıyor.
 */
function DatePickerSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Pressable style={styles.datePickerModalOverlay} onPress={onClose}>
      <Pressable
        style={[styles.datePickerModalContent, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
        onPress={(e) => e.stopPropagation()}
      >
        <View style={styles.datePickerModalHeader}>
          <Text variant="h3">{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        {children}
      </Pressable>
    </Pressable>
  );
}

export default function PersonelEklePage() {
  const router = useRouter();
  const notifySaved = useSaveSuccessFeedback();
  const { t, i18n } = useTranslation(['staff', 'common', 'errors']);
  usePagePermission({ module: 'personel', action: 'create' });
  const { locale, formatDateNative } = useDateFormat();
  const createPersonel = useCreatePersonel();
  const { data: visibleCariler } = useCariler(undefined, true, true);
  const { data: visiblePersoneller } = usePersonelList(true, true);
  const insets = useSafeAreaInsets();
  const footerInset = useFooterBottomPadding();

  // Dile göre varsayılan para birimi
  const defaultCurrency: Currency = i18n.language.startsWith('en') ? 'USD' : 'TRY';

  const [firstName, setFirstName] = useState('');
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [salary, setSalary] = useState('');
  const [notes, setNotes] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [balance, setBalance] = useState('');
  const [balanceDirection, setBalanceDirection] = useState<BalanceDirection>('credit');
  const [errors, setErrors] = useState<{ firstName?: string; phone?: string }>({});

  const validate = () => {
    const newErrors: { firstName?: string; phone?: string } = {};
    const phoneResult = preparePhoneForSave(phone);

    if (!firstName.trim()) {
      newErrors.firstName = t('staff:validation.firstNameRequired');
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

  const persistPersonel = async (normalizedPhone: string | null) => {
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
        phone: normalizedPhone,
        position: position.trim() || null,
        salary: salary ? parseCurrency(salary) : null,
        start_date: startDate ? formatDateForDB(startDate) : null,
        end_date: endDate ? formatDateForDB(endDate) : null,
        notes: notes.trim() || null,
        balance: finalBalance !== 0 ? finalBalance : undefined,
      });

      notifySaved(t('staff:messages.createSuccess'));
      router.back();
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:personel.createFailed'));
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
          onPress: () => void persistPersonel(validation.normalizedPhone),
        },
      ]);
      return;
    }

    await persistPersonel(validation.normalizedPhone);
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
          {/* Sayfa-içi başlık kaldırıldı — native header aynı başlığı zaten yazıyor
              (cariler/hesaplar ekle formlarıyla aynı temizlik) */}

          {/* Para Birimi — cari/hesap ekle ile aynı: CurrencyPicker (dropdown + modal) */}
          <View style={styles.section}>
            <CurrencyPicker
              value={currency}
              onChange={setCurrency}
              label={t('staff:form.currency')}
            />
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
              error={errors.phone}
              rightIcon={(
                <DeviceContactPickerButton
                  onSelect={(selection) => {
                    setPhone(selection.phone);
                    if (!firstName.trim() && selection.firstName) {
                      setFirstName(selection.firstName);
                    }
                    if (!lastName.trim() && selection.lastName) {
                      setLastName(selection.lastName);
                    }
                  }}
                />
              )}
            />

            <Input
              label={t('staff:form.positionOptional')}
              placeholder={t('staff:form.positionPlaceholder')}
              value={position}
              onChangeText={setPosition}
            />

            <Input
              label={t('staff:form.note')}
              placeholder={t('staff:form.notePlaceholder')}
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
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
                <DatePickerSheet
                  title={t('staff:form.startDate')}
                  onClose={() => setShowDatePicker(false)}
                >
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
                </DatePickerSheet>
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
                <DatePickerSheet
                  title={t('staff:form.endDate')}
                  onClose={() => setShowEndDatePicker(false)}
                >
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
                </DatePickerSheet>
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

        </ScrollView>

        {/* Sticky footer — kaydet butonu klavyenin altında kalmasın */}
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
            loading={createPersonel.isPending}
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
    // Sayfa-içi başlık kaldırıldı; üst boşluk artık içeriğin kendisinde (cariler/ekle deseni)
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
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
