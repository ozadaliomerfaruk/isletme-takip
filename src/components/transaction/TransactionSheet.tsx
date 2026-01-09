import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Keyboard,
  Animated,
  Alert,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Wallet,
  Calendar,
  FileText,
  Bell,
  X,
  TrendingUp,
  TrendingDown,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { AmountInput } from '@/components/ui/AmountInput';
import { OptionRow } from '@/components/ui/OptionRow';
import { Text, Button, CategoryPicker, ReminderSettings } from '@/components/ui';
import type { ReminderConfig } from '@/components/ui/ReminderSettings';
import { DateTimePicker } from '@/components/ui/DateTimePicker';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { parseCurrency, isValidAmount, formatCurrency } from '@/lib/currency';
import { formatDateForDB, formatDateLong, isToday } from '@/lib/date';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCreateIslem } from '@/hooks/useIslemler';
import { useCreateIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import {
  scheduleTransactionReminder,
  calculateReminderDate,
} from '@/lib/notifications';
import { Hesap } from '@/types/database';

// State Machine
type SheetState = 'amount' | 'details' | 'saving';

export interface TransactionSheetProps {
  visible: boolean;
  onDismiss: () => void;
  type: 'gelir' | 'gider';
  defaultHesapId?: string;
  onSuccess?: () => void;
}

export function TransactionSheet({
  visible,
  onDismiss,
  type,
  defaultHesapId,
  onSuccess,
}: TransactionSheetProps) {
  console.log('TransactionSheet render, visible:', visible);
  const { t } = useTranslation(['transactions', 'common']);
  const insets = useSafeAreaInsets();

  // State Machine
  const [state, setState] = useState<SheetState>('amount');

  // Form State
  const [amount, setAmount] = useState('');
  const [selectedHesapId, setSelectedHesapId] = useState<string | null>(
    defaultHesapId || null
  );
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedKategoriId, setSelectedKategoriId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [reminderConfig, setReminderConfig] = useState<ReminderConfig>({
    enabled: false,
    daysBefore: 1,
    time: '09:00',
  });

  // Pickers
  const [showHesapPicker, setShowHesapPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Data
  const { data: hesaplar } = useHesaplar();
  const createIslem = useCreateIslem();
  const createIleriTarihliIslem = useCreateIleriTarihliIslem();

  // Animations
  const detailsOpacity = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  // Selected hesap
  const selectedHesap = hesaplar?.find((h) => h.id === selectedHesapId);

  // Auto-select first hesap if not set
  useEffect(() => {
    if (!selectedHesapId && hesaplar && hesaplar.length > 0) {
      setSelectedHesapId(hesaplar[0].id);
    }
  }, [hesaplar, selectedHesapId]);

  // Reset state when sheet closes
  useEffect(() => {
    if (!visible) {
      setTimeout(() => {
        setState('amount');
        setAmount('');
        setSelectedDate(new Date());
        setSelectedKategoriId(null);
        setDescription('');
        setIsScheduled(false);
        setReminderConfig({ enabled: false, daysBefore: 1, time: '09:00' });
        detailsOpacity.setValue(0);
      }, 300);
    }
  }, [visible]);

  // Animate to details state
  const animateToDetails = useCallback(() => {
    Keyboard.dismiss();
    setState('details');

    Animated.timing(detailsOpacity, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [detailsOpacity]);

  // Go back to amount
  const goBackToAmount = useCallback(() => {
    setState('amount');
    Animated.timing(detailsOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [detailsOpacity]);

  // Handle continue button
  const handleContinue = useCallback(() => {
    if (!isValidAmount(amount)) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      // Shake animation would go here
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    animateToDetails();
  }, [amount, animateToDetails]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!selectedHesapId) {
      Alert.alert(t('common:status.error'), t('transactions:messages.selectAccountRequired'));
      return;
    }

    setState('saving');

    // Animate button
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const parsedAmount = parseCurrency(amount);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selected = new Date(selectedDate);
      selected.setHours(0, 0, 0, 0);
      const isFutureDate = selected > today;

      if (isFutureDate || isScheduled) {
        // Create scheduled transaction
        const result = await createIleriTarihliIslem.mutateAsync({
          type,
          amount: parsedAmount,
          description: description.trim() || null,
          hesap_id: selectedHesapId,
          kategori_id: selectedKategoriId,
          scheduled_date: formatDateForDB(selectedDate),
        });

        // Schedule reminder if enabled
        if (reminderConfig.enabled && result) {
          const reminderDate = calculateReminderDate(
            formatDateForDB(selectedDate),
            reminderConfig.daysBefore,
            reminderConfig.time
          );

          if (reminderDate > new Date()) {
            await scheduleTransactionReminder(
              result.id,
              type === 'gelir' ? t('transactions:notifications.incomeReminderTitle') : t('transactions:notifications.expenseReminderTitle'),
              t('transactions:notifications.scheduledTransactionBody', { amount: formatCurrency(parsedAmount), type }),
              reminderDate,
              {
                type,
                transaction_id: result.id,
                hesap_id: selectedHesapId,
              }
            );
          }
        }
      } else {
        // Create normal transaction
        await createIslem.mutateAsync({
          type,
          amount: parsedAmount,
          description: description.trim() || null,
          hesap_id: selectedHesapId,
          kategori_id: selectedKategoriId,
          date: formatDateForDB(selectedDate),
        });
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      onSuccess?.();
      onDismiss();
    } catch (error) {
      console.error('Transaction error:', error);
      setState('details');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(t('common:status.error'), t('transactions:messages.saveFailedRetry'));
    }
  }, [
    selectedHesapId,
    amount,
    type,
    description,
    selectedKategoriId,
    selectedDate,
    isScheduled,
    reminderConfig,
    createIslem,
    createIleriTarihliIslem,
    onSuccess,
    onDismiss,
  ]);

  // Determine snap points based on state
  // Use 0.5 for amount phase so there's enough space above keyboard
  const snapPoints = state === 'amount' ? [0.5] : [0.85];

  const isGelir = type === 'gelir';
  const accentColor = isGelir ? colors.success : colors.error;

  return (
    <>
      <BottomSheet
        visible={visible}
        onDismiss={onDismiss}
        snapPoints={snapPoints}
        enablePanDownToClose
        enableBackdropDismiss
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onDismiss}
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={24} color="#86868B" />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <View
                style={[styles.headerIcon, { backgroundColor: accentColor + '15' }]}
              >
                {isGelir ? (
                  <TrendingUp size={20} color={accentColor} />
                ) : (
                  <TrendingDown size={20} color={accentColor} />
                )}
              </View>
              <Text style={styles.headerTitle}>
                {isGelir ? t('transactions:titles.addIncome') : t('transactions:titles.addExpense')}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setIsScheduled(!isScheduled)}
              style={[
                styles.scheduleButton,
                isScheduled && styles.scheduleButtonActive,
              ]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Bell
                size={20}
                color={isScheduled ? colors.warning : '#86868B'}
              />
            </TouchableOpacity>
          </View>

          {/* Content Area */}
          <View style={styles.contentArea}>
            {state === 'amount' ? (
              /* Amount Phase - Amount at bottom, above button */
              <View style={styles.amountPhaseContainer}>
                <View style={styles.amountFlexSpacer} />
                <View style={styles.amountSection}>
                  <AmountInput
                    value={amount}
                    onChange={setAmount}
                    autoFocus
                    size="large"
                    editable
                  />
                  <Text style={styles.hint}>
                    {isGelir ? t('transactions:messages.addAsIncome') : t('transactions:messages.addAsExpense')}
                  </Text>
                </View>
              </View>
            ) : (
              /* Details Phase - Scroll area with amount at top */
              <Animated.View
                style={[styles.detailsSection, { opacity: detailsOpacity }]}
              >
                <ScrollView
                  style={styles.detailsScroll}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* Amount Display (tappable to edit) */}
                  <TouchableOpacity
                    style={styles.amountDisplayRow}
                    onPress={goBackToAmount}
                    activeOpacity={0.7}
                  >
                    <AmountInput
                      value={amount}
                      onChange={setAmount}
                      autoFocus={false}
                      size="medium"
                      editable={false}
                    />
                  </TouchableOpacity>

                  {/* Account Selection */}
                  <OptionRow
                    icon={<Wallet size={22} color="#86868B" />}
                    label={t('transactions:form.account')}
                    value={selectedHesap?.name}
                    placeholder={t('transactions:form.accountPlaceholder')}
                    onPress={() => setShowHesapPicker(true)}
                    showChevron
                  />

                  {/* Date Selection */}
                  <OptionRow
                    icon={<Calendar size={22} color="#86868B" />}
                    label={t('transactions:form.date')}
                    value={
                      isToday(selectedDate)
                        ? t('common:date.today')
                        : formatDateLong(selectedDate)
                    }
                    onPress={() => setShowDatePicker(true)}
                    showChevron
                  />

                  {/* Category Selection */}
                  <CategoryPicker
                    value={selectedKategoriId}
                    onChange={setSelectedKategoriId}
                    type={type}
                    label={t('transactions:form.category')}
                    placeholder={t('transactions:form.categoryPlaceholder')}
                    optional
                  />

                  {/* Description */}
                  <View style={styles.descriptionContainer}>
                    <View style={styles.descriptionIcon}>
                      <FileText size={22} color="#86868B" />
                    </View>
                    <TextInput
                      style={styles.descriptionInput}
                      placeholder={t('transactions:form.notePlaceholder')}
                      placeholderTextColor="#C7C7CC"
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      maxLength={200}
                    />
                  </View>

                  {/* Reminder Settings (for scheduled) */}
                  {isScheduled && (
                    <View style={styles.reminderSection}>
                      <ReminderSettings
                        value={reminderConfig}
                        onChange={setReminderConfig}
                      />
                    </View>
                  )}
                </ScrollView>
              </Animated.View>
            )}
          </View>

          {/* Footer */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            {state === 'amount' ? (
              <Animated.View style={{ width: '100%' }}>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    !isValidAmount(amount) && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleContinue}
                  disabled={!isValidAmount(amount)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryButtonText}>{t('common:buttons.continue')}</Text>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <Animated.View
                style={[styles.buttonRow, { transform: [{ scale: buttonScale }] }]}
              >
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={goBackToAmount}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryButtonText}>{t('common:buttons.back')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    styles.saveButton,
                    state === 'saving' && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={state === 'saving'}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryButtonText}>
                    {state === 'saving' ? t('common:status.saving') : t('common:buttons.save')}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        </View>
      </BottomSheet>

      {/* Hesap Picker Modal */}
      {showHesapPicker && (
        <HesapPickerModal
          visible={showHesapPicker}
          hesaplar={hesaplar || []}
          selectedId={selectedHesapId}
          onSelect={(hesap) => {
            setSelectedHesapId(hesap.id);
            setShowHesapPicker(false);
          }}
          onClose={() => setShowHesapPicker(false)}
          t={t}
        />
      )}

      {/* Date Picker Modal */}
      {showDatePicker && (
        <DatePickerModal
          visible={showDatePicker}
          value={selectedDate}
          onChange={(date) => {
            setSelectedDate(date);
            setShowDatePicker(false);
          }}
          onClose={() => setShowDatePicker(false)}
          t={t}
        />
      )}
    </>
  );
}

// Hesap Picker Modal
interface HesapPickerModalProps {
  visible: boolean;
  hesaplar: Hesap[];
  selectedId: string | null;
  onSelect: (hesap: Hesap) => void;
  onClose: () => void;
  t: (key: string, options?: any) => any;
}

function HesapPickerModal({
  visible,
  hesaplar,
  selectedId,
  onSelect,
  onClose,
  t,
}: HesapPickerModalProps) {
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onClose}
      snapPoints={[0.5]}
      enablePanDownToClose
      enableBackdropDismiss
    >
      <View style={pickerStyles.container}>
        <View style={pickerStyles.header}>
          <Text style={pickerStyles.title}>{t('common:select.selectAccount')}</Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color="#86868B" />
          </TouchableOpacity>
        </View>

        <ScrollView style={pickerStyles.list}>
          {hesaplar.map((hesap) => (
            <TouchableOpacity
              key={hesap.id}
              style={[
                pickerStyles.item,
                selectedId === hesap.id && pickerStyles.itemSelected,
              ]}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                onSelect(hesap);
              }}
              activeOpacity={0.7}
            >
              <View style={pickerStyles.itemIcon}>
                <Wallet size={20} color={colors.primary} />
              </View>
              <View style={pickerStyles.itemContent}>
                <Text style={pickerStyles.itemTitle}>{hesap.name}</Text>
                <Text style={pickerStyles.itemSubtitle}>
                  {formatCurrency(Number(hesap.balance))}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

// Date Picker Modal
interface DatePickerModalProps {
  visible: boolean;
  value: Date;
  onChange: (date: Date) => void;
  onClose: () => void;
  t: (key: string, options?: any) => any;
}

function DatePickerModal({
  visible,
  value,
  onChange,
  onClose,
  t,
}: DatePickerModalProps) {
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onClose}
      snapPoints={[0.45]}
      enablePanDownToClose
      enableBackdropDismiss
    >
      <View style={pickerStyles.container}>
        <View style={pickerStyles.header}>
          <Text style={pickerStyles.title}>{t('common:date.selectDate')}</Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color="#86868B" />
          </TouchableOpacity>
        </View>

        <View style={pickerStyles.datePickerWrapper}>
          <DateTimePicker
            value={value}
            onChange={(date) => {
              onChange(date);
            }}
            mode="date"
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  scheduleButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
    borderRadius: 20,
  },
  scheduleButtonActive: {
    backgroundColor: colors.warningLight,
  },
  contentArea: {
    flex: 1,
  },
  amountPhaseContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  amountFlexSpacer: {
    flex: 1,
  },
  amountSection: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  amountDisplayRow: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#F5F5F7',
  },
  hint: {
    fontSize: 14,
    color: '#86868B',
    marginTop: 8,
  },
  detailsSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  detailsScroll: {
    flex: 1,
  },
  descriptionContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    minHeight: 56,
  },
  descriptionIcon: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  descriptionInput: {
    flex: 1,
    fontSize: 17,
    color: '#1D1D1F',
    padding: 0,
    minHeight: 24,
    maxHeight: 80,
  },
  reminderSection: {
    marginTop: 8,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#E5E5E5',
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.primary,
  },
  saveButton: {
    flex: 2,
  },
});

const pickerStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  list: {
    flex: 1,
    marginTop: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  itemSelected: {
    backgroundColor: colors.primaryLight,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 17,
    fontWeight: '500',
    color: '#1D1D1F',
  },
  itemSubtitle: {
    fontSize: 14,
    color: '#86868B',
    marginTop: 2,
  },
  datePickerWrapper: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
