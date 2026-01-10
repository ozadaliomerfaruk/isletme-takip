import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
  Keyboard,
  Easing,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar,
  X,
  Banknote,
  Wallet,
  CreditCard,
  Check,
  Minus,
  Plus,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import DateTimePickerRN from '@react-native-community/datetimepicker';

import { Text, Button, CategoryPicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { parseCurrency, formatCurrency } from '@/lib/currency';
import { getCurrentCurrency } from '@/hooks/useSettings';
import { formatDateForDB, addMonths, formatDateShort } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCreateNakitAvans, useUpdateNakitAvans } from '@/hooks/useNakitAvans';
import { getHesapIconConfig } from '@/lib/icons';
import type { Hesap, NakitAvansWithRelations } from '@/types/database';

export interface NakitAvansSheetProps {
  visible: boolean;
  onDismiss: () => void;
  creditCard: Hesap;
  editingAvans?: NakitAvansWithRelations | null;
  onSuccess?: () => void;
}

export function NakitAvansSheet({
  visible,
  onDismiss,
  creditCard,
  editingAvans,
  onSuccess,
}: NakitAvansSheetProps) {
  const { t } = useTranslation(['accounts', 'common']);
  const { formatDateMedium, locale } = useDateFormat();
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  // Form State
  const [amount, setAmount] = useState('');
  const [repaymentAmount, setRepaymentAmount] = useState('');
  const [selectedTargetHesapId, setSelectedTargetHesapId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedKategoriId, setSelectedKategoriId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [taksitSayisi, setTaksitSayisi] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  // Picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showHesapPicker, setShowHesapPicker] = useState(false);

  // Animation
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(100)).current;
  const isAnimatingRef = useRef(false);

  // Keyboard
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Data
  const { data: hesaplar } = useHesaplar();
  const createNakitAvans = useCreateNakitAvans();
  const updateNakitAvans = useUpdateNakitAvans();

  // Is editing mode
  const isEditing = !!editingAvans;

  // Filter out credit cards from target accounts
  const targetHesaplar = hesaplar?.filter((h) => h.type !== 'kredi_karti') || [];
  const selectedTargetHesap = targetHesaplar.find((h) => h.id === selectedTargetHesapId);

  // Calculate available credit limit
  const availableLimit = creditCard.credit_limit
    ? creditCard.credit_limit - Math.abs(Number(creditCard.balance))
    : null;

  // Parse amounts
  const parsedAmount = parseCurrency(amount);
  const parsedRepayment = parseCurrency(repaymentAmount);

  // Calculate taksit amounts
  const taksitTutar = useMemo(() => {
    if (taksitSayisi <= 1 || parsedRepayment <= 0) return parsedRepayment;
    return Math.ceil(parsedRepayment / taksitSayisi);
  }, [parsedRepayment, taksitSayisi]);

  // Generate taksit preview
  const taksitPreview = useMemo(() => {
    if (taksitSayisi <= 1) return [];
    const taksitler = [];
    for (let i = 0; i < taksitSayisi; i++) {
      const isLast = i === taksitSayisi - 1;
      const tutar = isLast
        ? parsedRepayment - taksitTutar * (taksitSayisi - 1)
        : taksitTutar;
      taksitler.push({
        siraNo: i + 1,
        tutar,
        tarih: addMonths(selectedDate, i + 1),
      });
    }
    return taksitler;
  }, [taksitSayisi, parsedRepayment, taksitTutar, selectedDate]);

  // Populate form when editing
  useEffect(() => {
    if (editingAvans && visible) {
      setAmount(String(editingAvans.tutar));
      setRepaymentAmount(String(editingAvans.geri_odeme_tutari));
      setSelectedTargetHesapId(editingAvans.hedef_hesap_id);
      setSelectedDate(new Date(editingAvans.tarih));
      setSelectedKategoriId(editingAvans.kategori_id || null);
      setDescription(editingAvans.aciklama || '');
      setTaksitSayisi(editingAvans.taksit_sayisi || 1);
    }
  }, [editingAvans, visible]);

  // Auto-select first non-credit card hesap (only when not editing)
  useEffect(() => {
    if (!isEditing && !selectedTargetHesapId && targetHesaplar.length > 0) {
      setSelectedTargetHesapId(targetHesaplar[0].id);
    }
  }, [targetHesaplar, selectedTargetHesapId, isEditing]);

  // Auto-calculate repayment amount when amount changes (only if repayment is empty)
  useEffect(() => {
    if (amount && repaymentAmount === '') {
      setRepaymentAmount(amount);
    }
  }, [amount]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(() => {
        setAmount('');
        setRepaymentAmount('');
        setSelectedDate(new Date());
        setSelectedKategoriId(null);
        setDescription('');
        setTaksitSayisi(1);
        setIsSaving(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Keyboard listeners
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleShow = (e: any) => {
      setIsKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    };

    const handleHide = () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    };

    const showSub = Keyboard.addListener(showEvent, handleShow);
    const hideSub = Keyboard.addListener(hideEvent, handleHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Open animation
  const animateOpen = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    opacity.setValue(0);
    translateY.setValue(100);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      isAnimatingRef.current = false;
    });
  }, [opacity, translateY]);

  // Close animation
  const animateClose = useCallback((callback?: () => void) => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    Keyboard.dismiss();

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 100,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isAnimatingRef.current = false;
      callback?.();
    });
  }, [opacity, translateY]);

  // Handle visibility
  useEffect(() => {
    if (visible) {
      animateOpen();
    }
  }, [visible, animateOpen]);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    animateClose(() => {
      onDismiss();
    });
  }, [animateClose, onDismiss]);

  // Handle backdrop press
  const handleBackdropPress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (isKeyboardVisible) {
      Keyboard.dismiss();
    } else {
      handleDismiss();
    }
  }, [handleDismiss, isKeyboardVisible]);

  // Handle date change
  const handleDateChange = useCallback((event: any, selectedDateValue?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }

    if (selectedDateValue) {
      setSelectedDate(selectedDateValue);
    }
  }, []);

  // Handle amount input
  const handleAmountChange = (text: string) => {
    const cleaned = text.replace(/[^0-9,.]/g, '');
    setAmount(cleaned);
  };

  // Handle repayment amount input
  const handleRepaymentChange = (text: string) => {
    const cleaned = text.replace(/[^0-9,.]/g, '');
    setRepaymentAmount(cleaned);
  };

  // Handle save
  const handleSave = useCallback(async () => {
    if (parsedAmount <= 0) {
      Alert.alert(t('common:status.error'), t('accounts:nakitAvans.amountPlaceholder'));
      return;
    }

    if (!selectedTargetHesapId) {
      Alert.alert(t('common:status.error'), t('accounts:nakitAvans.targetAccountPlaceholder'));
      return;
    }

    if (repaymentAmount === '' || repaymentAmount === undefined) {
      Alert.alert(t('common:status.error'), t('accounts:nakitAvans.repaymentAmountRequired'));
      return;
    }

    // Check credit limit
    if (availableLimit !== null && parsedAmount > availableLimit) {
      Alert.alert(
        t('common:status.warning'),
        t('accounts:nakitAvans.messages.creditLimitExceeded')
      );
      return;
    }

    setIsSaving(true);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      if (isEditing && editingAvans) {
        // Update existing avans (sadece temel bilgiler - taksitler değişmez)
        await updateNakitAvans.mutateAsync({
          id: editingAvans.id,
          kategori_id: selectedKategoriId,
          aciklama: description.trim() || null,
          tarih: formatDateForDB(selectedDate),
        });
      } else {
        // Create new avans
        const isTaksitli = taksitSayisi > 1;

        // Generate taksitler for backend
        const taksitler = isTaksitli
          ? taksitPreview.map((t) => ({
              sira_no: t.siraNo,
              tutar: t.tutar,
              odeme_tarihi: formatDateForDB(t.tarih),
              reminder_enabled: false,
              reminder_days_before: 1,
              reminder_time: '09:00',
            }))
          : undefined;

        await createNakitAvans.mutateAsync({
          kredi_karti_id: creditCard.id,
          hedef_hesap_id: selectedTargetHesapId,
          tutar: parsedAmount,
          geri_odeme_tutari: parsedRepayment,
          kategori_id: selectedKategoriId,
          aciklama: description.trim() || null,
          tarih: formatDateForDB(selectedDate),
          is_taksitli: isTaksitli,
          taksit_sayisi: taksitSayisi,
          taksitler,
        });
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      onSuccess?.();
      handleDismiss();
    } catch (error: any) {
      console.error('NakitAvans error:', error);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
    } finally {
      setIsSaving(false);
    }
  }, [
    parsedAmount,
    parsedRepayment,
    repaymentAmount,
    selectedTargetHesapId,
    selectedKategoriId,
    description,
    selectedDate,
    taksitSayisi,
    taksitPreview,
    availableLimit,
    creditCard.id,
    isEditing,
    editingAvans,
    createNakitAvans,
    updateNakitAvans,
    onSuccess,
    handleDismiss,
    t,
  ]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Card */}
      <View style={[styles.cardContainer, { bottom: keyboardHeight }]}>
        <Animated.View
          style={[
            styles.card,
            {
              maxHeight: windowHeight * (isKeyboardVisible ? 0.7 : 0.85),
              paddingBottom: isKeyboardVisible ? spacing.md : insets.bottom + spacing.md,
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Banknote size={18} color={colors.warning} />
              </View>
              <Text variant="body" style={styles.headerTitle}>
                {isEditing ? t('accounts:nakitAvans.editTitle') : t('accounts:nakitAvans.addTitle')}
              </Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Calendar size={14} color={colors.primary} />
                <Text variant="caption" style={styles.dateText}>
                  {formatDateMedium(selectedDate)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={handleDismiss}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Credit Card Info */}
          <View style={styles.creditCardInfo}>
            <CreditCard size={14} color={colors.warning} />
            <Text variant="caption" color="secondary">{creditCard.name}</Text>
            {availableLimit !== null && (
              <Text variant="caption" color="secondary">
                • {formatCurrency(availableLimit)} {t('accounts:creditCard.availableCredit')}
              </Text>
            )}
          </View>

          {/* Form */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Amount Row - Compact */}
            <View style={styles.amountRow}>
              {/* Avans Tutarı */}
              <View style={styles.amountField}>
                <Text variant="caption" color="secondary">{t('accounts:nakitAvans.amount')}</Text>
                <View style={styles.compactAmountInput}>
                  <Text style={styles.currencySymbol}>{getCurrentCurrency().symbol}</Text>
                  <TextInput
                    style={styles.amountTextInput}
                    value={amount}
                    onChangeText={handleAmountChange}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                </View>
              </View>

              {/* Geri Ödeme Tutarı */}
              <View style={styles.amountField}>
                <Text variant="caption" color="secondary">{t('accounts:nakitAvans.repaymentAmount')}</Text>
                <View style={[styles.compactAmountInput, styles.repaymentInput]}>
                  <Text style={[styles.currencySymbol, { color: colors.error }]}>{getCurrentCurrency().symbol}</Text>
                  <TextInput
                    style={[styles.amountTextInput, { color: colors.error }]}
                    value={repaymentAmount}
                    onChangeText={handleRepaymentChange}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            </View>

            {/* Taksit Sayısı */}
            <View style={styles.taksitRow}>
              <Text variant="body">{t('accounts:nakitAvans.installmentCount')}</Text>
              <View style={styles.taksitControls}>
                <TouchableOpacity
                  style={styles.taksitBtn}
                  onPress={() => setTaksitSayisi(Math.max(1, taksitSayisi - 1))}
                  disabled={taksitSayisi <= 1}
                >
                  <Minus size={16} color={taksitSayisi <= 1 ? colors.textMuted : colors.text} />
                </TouchableOpacity>
                <Text variant="h3" style={styles.taksitCount}>{taksitSayisi}</Text>
                <TouchableOpacity
                  style={styles.taksitBtn}
                  onPress={() => setTaksitSayisi(Math.min(24, taksitSayisi + 1))}
                >
                  <Plus size={16} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Taksit Preview */}
            {taksitSayisi > 1 && parsedRepayment > 0 && (
              <View style={styles.taksitPreview}>
                <Text variant="caption" color="secondary" style={styles.taksitPreviewTitle}>
                  {t('accounts:nakitAvans.totalInstallments', { count: taksitSayisi })}
                </Text>
                <View style={styles.taksitList}>
                  {taksitPreview.slice(0, 3).map((t) => (
                    <View key={t.siraNo} style={styles.taksitItem}>
                      <Text variant="caption" color="secondary">
                        {t.siraNo}/{taksitSayisi}
                      </Text>
                      <Text variant="caption" style={styles.taksitAmount}>
                        {formatCurrency(t.tutar)}
                      </Text>
                      <Text variant="caption" color="secondary">
                        {formatDateShort(t.tarih)}
                      </Text>
                    </View>
                  ))}
                  {taksitSayisi > 3 && (
                    <Text variant="caption" color="secondary" style={styles.taksitMore}>
                      +{taksitSayisi - 3} {t('accounts:nakitAvans.installment')}...
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Hedef Hesap */}
            <View style={styles.fieldGroup}>
              <Text variant="caption" color="secondary" style={styles.fieldLabel}>
                {t('accounts:nakitAvans.targetAccount')}
              </Text>
              <TouchableOpacity
                style={styles.hesapSelector}
                onPress={() => setShowHesapPicker(true)}
              >
                {selectedTargetHesap ? (
                  <View style={styles.selectedHesap}>
                    <View style={[
                      styles.hesapIcon,
                      { backgroundColor: getHesapIconConfig(selectedTargetHesap.type, 16).backgroundColor }
                    ]}>
                      {getHesapIconConfig(selectedTargetHesap.type, 16).icon}
                    </View>
                    <Text variant="body">{selectedTargetHesap.name}</Text>
                  </View>
                ) : (
                  <Text variant="body" color="secondary">
                    {t('accounts:nakitAvans.targetAccountPlaceholder')}
                  </Text>
                )}
                <Wallet size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Kategori */}
            <View style={styles.fieldGroup}>
              <CategoryPicker
                value={selectedKategoriId}
                onChange={setSelectedKategoriId}
                type="gider"
                label={t('accounts:nakitAvans.category')}
                placeholder={t('accounts:nakitAvans.categoryPlaceholder')}
                optional
              />
            </View>

            {/* Açıklama */}
            <View style={styles.fieldGroup}>
              <Text variant="caption" color="secondary" style={styles.fieldLabel}>
                {t('accounts:nakitAvans.description')} ({t('common:fields.optional')})
              </Text>
              <TextInput
                style={styles.descriptionInput}
                placeholder={t('accounts:nakitAvans.descriptionPlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={200}
              />
            </View>
          </ScrollView>

          {/* Save Button */}
          <View style={styles.footer}>
            <Button
              variant="primary"
              size="md"
              loading={isSaving}
              onPress={handleSave}
              disabled={parsedAmount <= 0 || !selectedTargetHesapId || repaymentAmount === ''}
              style={styles.saveButton}
            >
              {isSaving ? t('common:status.saving') : isEditing ? t('common:buttons.save') : t('accounts:nakitAvans.actions.add')}
            </Button>
          </View>
        </Animated.View>
      </View>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <Modal visible transparent animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowDatePicker(false)}>
            <View style={styles.pickerBackdrop}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerTitle}>{t('common:date.selectDate')}</Text>
                  <DateTimePickerRN
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleDateChange}
                    locale={locale}
                    textColor={colors.text}
                    themeVariant="light"
                    style={styles.datePicker}
                  />
                  <TouchableOpacity
                    style={styles.pickerDoneButton}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <Text style={styles.pickerDoneText}>{t('common:buttons.done')}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Hesap Picker Modal */}
      {showHesapPicker && (
        <Modal visible transparent animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowHesapPicker(false)}>
            <View style={styles.pickerBackdrop}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.hesapPickerContainer}>
                  <View style={styles.hesapPickerHeader}>
                    <Text style={styles.pickerTitle}>{t('accounts:nakitAvans.targetAccount')}</Text>
                    <TouchableOpacity onPress={() => setShowHesapPicker(false)}>
                      <X size={24} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={styles.hesapPickerList}>
                    {targetHesaplar.map((hesap) => {
                      const iconConfig = getHesapIconConfig(hesap.type, 18);
                      const isSelected = selectedTargetHesapId === hesap.id;

                      return (
                        <TouchableOpacity
                          key={hesap.id}
                          style={[
                            styles.hesapPickerItem,
                            isSelected && styles.hesapPickerItemSelected,
                          ]}
                          onPress={() => {
                            if (Platform.OS !== 'web') {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }
                            setSelectedTargetHesapId(hesap.id);
                            setShowHesapPicker(false);
                          }}
                        >
                          <View style={[styles.hesapPickerIcon, { backgroundColor: iconConfig.backgroundColor }]}>
                            {iconConfig.icon}
                          </View>
                          <View style={styles.hesapPickerInfo}>
                            <Text variant="body" style={isSelected && styles.selectedText}>
                              {hesap.name}
                            </Text>
                            <Text variant="caption" color="secondary">
                              {formatCurrency(Number(hesap.balance))}
                            </Text>
                          </View>
                          {isSelected && (
                            <Check size={20} color={colors.primary} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  cardContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.warning + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  closeButton: {
    padding: spacing.xs,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  dateText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 12,
  },
  creditCardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  amountField: {
    flex: 1,
  },
  compactAmountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: 4,
  },
  repaymentInput: {
    backgroundColor: colors.errorLight + '30',
    borderWidth: 1,
    borderColor: colors.error + '30',
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.success,
    marginRight: 4,
  },
  amountTextInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.success,
    padding: 0,
  },
  taksitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  taksitControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  taksitBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  taksitCount: {
    minWidth: 30,
    textAlign: 'center',
  },
  taksitPreview: {
    backgroundColor: colors.primaryLight + '30',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    minHeight: 90,
    maxHeight: 110,
  },
  taksitPreviewTitle: {
    marginBottom: spacing.xs,
  },
  taksitList: {
    gap: 4,
    maxHeight: 70,
  },
  taksitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  taksitAmount: {
    fontWeight: '600',
    color: colors.primary,
  },
  taksitMore: {
    marginTop: 4,
    fontStyle: 'italic',
  },
  fieldGroup: {
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    marginBottom: 4,
  },
  hesapSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  selectedHesap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hesapIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  descriptionInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  saveButton: {
    width: '100%',
  },
  // Picker Styles
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '90%',
    maxWidth: 400,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  datePicker: {
    height: 200,
  },
  pickerDoneButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  pickerDoneText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
  // Hesap Picker
  hesapPickerContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '90%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  hesapPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hesapPickerList: {
    flexGrow: 0,
  },
  hesapPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  hesapPickerItemSelected: {
    backgroundColor: colors.primaryLight,
  },
  hesapPickerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  hesapPickerInfo: {
    flex: 1,
  },
  selectedText: {
    color: colors.primary,
    fontWeight: '600',
  },
});
