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
  KeyboardEvent,
  Easing,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar,
  Bell,
  X,
  ChevronDown,
  Building2,
  UserCheck,
  Wallet,
  Search,
  Check,
  CreditCard,
  ArrowRight,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { Text, CategoryPicker } from '@/components/ui';
import { TransactionTypeTabs, TransactionType, getTransactionTypeColor } from './TransactionTypeTabs';
import { colors } from '@/constants/colors';
import { TAB_BAR_HEIGHT } from '@/constants/spacing';
import { Hesap, IslemType, IslemInsert, IleriTarihliIslemInsert } from '@/types/database';
import { parseCurrency, formatCurrency, isValidAmount } from '@/lib/currency';
import { formatDateForDB, formatDateTimeForDB, isToday } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { useCreateIslem } from '@/hooks/useIslemler';
import { useCreateIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import DateTimePickerRN from '@react-native-community/datetimepicker';

// Ödeme hedef tipi
type OdemeHedefType = 'tedarikci' | 'staff';

export interface CreditCardTransactionBarProps {
  visible: boolean;
  onDismiss: () => void;
  creditCard: Hesap;
  onSuccess?: () => void;
}

export function CreditCardTransactionBar({
  visible,
  onDismiss,
  creditCard,
  onSuccess,
}: CreditCardTransactionBarProps) {
  const { t } = useTranslation(['transactions', 'common', 'clients', 'staff', 'accounts']);
  const { formatDateMedium, locale } = useDateFormat();
  const insets = useSafeAreaInsets();

  // Form state
  const [type, setType] = useState<TransactionType>('kredi_karti_gider');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Additional IDs for different transaction types
  const [sourceHesapId, setSourceHesapId] = useState<string | null>(null);
  const [cariId, setCariId] = useState<string | null>(null);
  const [personelId, setPersonelId] = useState<string | null>(null);
  const [odemeHedefType, setOdemeHedefType] = useState<OdemeHedefType>('tedarikci');

  // Pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showHesapPicker, setShowHesapPicker] = useState(false);
  const [showCariPicker, setShowCariPicker] = useState(false);
  const [showPersonelPicker, setShowPersonelPicker] = useState(false);
  const [showOdemeHedefTypePicker, setShowOdemeHedefTypePicker] = useState(false);

  // Search queries
  const [hesapSearchQuery, setHesapSearchQuery] = useState('');
  const [cariSearchQuery, setCariSearchQuery] = useState('');
  const [personelSearchQuery, setPersonelSearchQuery] = useState('');

  // Auto-open modal state
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categorySkipped, setCategorySkipped] = useState(false);
  const [selectedCategoryType, setSelectedCategoryType] = useState<'gelir' | 'gider' | null>(null);

  // Window dimensions for bottom sheet
  const windowHeight = Dimensions.get('window').height;

  // Animation
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(100)).current;
  const isAnimatingRef = useRef(false);

  // Keyboard
  const keyboardHeightRef = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Data
  const { data: hesaplar } = useHesaplar();
  const { data: tedarikciCariler } = useCariler('tedarikci');
  const { data: personelList } = usePersonelList();
  const createIslem = useCreateIslem();
  const createIleriTarihliIslem = useCreateIleriTarihliIslem();

  // Refs
  const amountInputRef = useRef<TextInput>(null);

  // Nakit hesaplar (kredi kartı hariç)
  const nakitHesaplar = useMemo(() => {
    return hesaplar?.filter(h => h.type !== 'kredi_karti') || [];
  }, [hesaplar]);

  // Get selected entities
  const selectedSourceHesap = nakitHesaplar.find(h => h.id === sourceHesapId);
  const selectedCari = tedarikciCariler?.find(c => c.id === cariId);
  const selectedPersonel = personelList?.find(p => p.id === personelId);

  // Filtered lists for search
  const filteredHesaplar = useMemo(() => {
    if (!hesapSearchQuery.trim()) return nakitHesaplar;
    const query = hesapSearchQuery.toLowerCase().trim();
    return nakitHesaplar.filter(h => h.name.toLowerCase().includes(query));
  }, [nakitHesaplar, hesapSearchQuery]);

  const filteredCariler = useMemo(() => {
    if (!tedarikciCariler) return [];
    if (!cariSearchQuery.trim()) return tedarikciCariler;
    const query = cariSearchQuery.toLowerCase().trim();
    return tedarikciCariler.filter(c => c.name.toLowerCase().includes(query));
  }, [tedarikciCariler, cariSearchQuery]);

  const filteredPersonel = useMemo(() => {
    if (!personelList) return [];
    if (!personelSearchQuery.trim()) return personelList;
    const query = personelSearchQuery.toLowerCase().trim();
    return personelList.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(query)
    );
  }, [personelList, personelSearchQuery]);

  // Kredi kartı limit bilgileri
  const creditLimit = creditCard.credit_limit || 0;
  const usedCredit = Math.abs(Number(creditCard.balance)); // Bakiye negatif olduğunda kullanılan limit
  const availableCredit = creditLimit > 0 ? creditLimit - usedCredit : 0;

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(() => {
        setAmount('');
        setDescription('');
        setDate(new Date());
        setKategoriId(null);
        setIsScheduled(false);
        setIsSaving(false);
        setSourceHesapId(null);
        setCariId(null);
        setPersonelId(null);
        setOdemeHedefType('tedarikci');
        setHesapSearchQuery('');
        setCariSearchQuery('');
        setPersonelSearchQuery('');
        setCategoryPickerOpen(false);
        setCategorySkipped(false);
        setSelectedCategoryType(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Update type when modal opens
  useEffect(() => {
    if (visible) {
      setType('kredi_karti_gider');
      // Ekstre ödemesi için varsayılan hesap seçme - kullanıcı seçmeli
      setSourceHesapId(null);
    }
  }, [visible]);

  // Reset related fields when type changes
  useEffect(() => {
    setCariId(null);
    setPersonelId(null);
    setOdemeHedefType('tedarikci');
  }, [type]);

  // Keyboard listeners
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleShow = (e: KeyboardEvent) => {
      const height = e.endCoordinates.height;
      keyboardHeightRef.current = height;
      setKeyboardHeight(height);
      setIsKeyboardVisible(true);
    };

    const handleHide = () => {
      setIsKeyboardVisible(false);
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
      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 100);
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

  // Handle save
  const handleSave = useCallback(async () => {
    if (!isValidAmount(amount)) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    // Auto-open modals for missing required data
    if ((type === 'kredi_karti_gider' || type === 'kredi_karti_odeme') && !kategoriId && !categorySkipped) {
      setCategoryPickerOpen(true);
      return;
    }
    if (type === 'kredi_karti_ekstre' && !sourceHesapId) {
      setShowHesapPicker(true);
      return;
    }

    // Validasyonlar
    if (type === 'kredi_karti_odeme') {
      if (odemeHedefType === 'tedarikci' && !cariId) {
        Alert.alert(t('common:status.error'), t('clients:transactionForm.selectSupplier'));
        return;
      }
      if (odemeHedefType === 'staff' && !personelId) {
        Alert.alert(t('common:status.error'), t('staff:transactionForm.selectPersonel'));
        return;
      }
    }

    if (type === 'kredi_karti_ekstre' && !sourceHesapId) {
      Alert.alert(t('common:status.error'), t('accounts:creditCard.selectSourceAccount'));
      return;
    }

    setIsSaving(true);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const parsedAmount = parseCurrency(amount);

      // İşlem tipine göre API tipi belirleme
      let apiType: IslemType;
      let hesapId: string | null = null;
      let hedefHesapId: string | null = null;
      let cariIdValue: string | null = null;
      let personelIdValue: string | null = null;

      if (type === 'kredi_karti_gider') {
        // Kredi kartı harcaması - gider olarak kaydedilir, hesap_id kredi kartı
        apiType = 'gider';
        hesapId = creditCard.id;
      } else if (type === 'kredi_karti_odeme') {
        // Tedarikçi/personel ödemesi - kredi kartından
        if (odemeHedefType === 'tedarikci') {
          apiType = 'cari_odeme';
          hesapId = creditCard.id;
          cariIdValue = cariId;
        } else {
          apiType = 'personel_odeme';
          hesapId = creditCard.id;
          personelIdValue = personelId;
        }
      } else if (type === 'kredi_karti_ekstre') {
        // Ekstre ödemesi - transfer olarak kaydedilir (kaynak hesaptan kredi kartına)
        apiType = 'transfer';
        hesapId = sourceHesapId;
        hedefHesapId = creditCard.id;
      } else {
        apiType = 'gider';
        hesapId = creditCard.id;
      }

      if (isScheduled) {
        const scheduledData: Omit<IleriTarihliIslemInsert, 'isletme_id'> = {
          type: apiType,
          amount: parsedAmount,
          description: description.trim() || null,
          kategori_id: kategoriId,
          hesap_id: hesapId,
          hedef_hesap_id: hedefHesapId,
          cari_id: cariIdValue,
          personel_id: personelIdValue,
          scheduled_date: formatDateForDB(date),
        };
        await createIleriTarihliIslem.mutateAsync(scheduledData);
      } else {
        const islemData: Omit<IslemInsert, 'isletme_id'> = {
          type: apiType,
          amount: parsedAmount,
          description: description.trim() || null,
          kategori_id: kategoriId,
          hesap_id: hesapId,
          hedef_hesap_id: hedefHesapId,
          cari_id: cariIdValue,
          personel_id: personelIdValue,
          date: formatDateTimeForDB(date),
        };
        await createIslem.mutateAsync(islemData);
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      onSuccess?.();
      handleDismiss();
    } catch (error) {
      if (__DEV__) {
        console.error('Transaction error:', error);
      }
      setIsSaving(false);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(t('common:status.error'), t('transactions:messages.saveFailed'));
    }
  }, [
    t,
    amount,
    type,
    description,
    date,
    kategoriId,
    categorySkipped,
    isScheduled,
    sourceHesapId,
    cariId,
    personelId,
    odemeHedefType,
    creditCard,
    createIslem,
    createIleriTarihliIslem,
    onSuccess,
    handleDismiss,
  ]);

  // Format amount for display
  const handleAmountChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9,.]/g, '');
    setAmount(cleaned);
  }, []);

  if (!visible) return null;

  const buttonColor = getTransactionTypeColor(type);
  const buttonLabels: Record<string, string> = {
    kredi_karti_gider: t('transactions:tabs.kredi_karti_gider'),
    kredi_karti_odeme: t('transactions:tabs.kredi_karti_odeme'),
    kredi_karti_ekstre: t('transactions:tabs.kredi_karti_ekstre'),
  };
  const buttonLabel = buttonLabels[type] || t('common:buttons.save');

  // Category picker type - kredi kartı işlemleri için gider kategorisi
  const getCategoryType = (): 'gelir' | 'gider' | undefined => {
    if (type === 'kredi_karti_ekstre') return undefined; // Transfer için kategori yok
    return 'gider';
  };
  // Kategori seçiliyse, seçim anındaki tipi kullan (sekme değişse bile görünür kalsın)
  const categoryType = selectedCategoryType || getCategoryType();

  // Position card above keyboard and tab bar
  const cardBottom = keyboardHeight > 0
    ? keyboardHeight
    : insets.bottom + TAB_BAR_HEIGHT + 10;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Card */}
      <Animated.View
        style={[
          styles.card,
          {
            bottom: cardBottom,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Scheduled transaction label */}
        {isScheduled && (
          <View style={styles.scheduledLabel}>
            <Bell size={14} color={colors.warning} />
            <Text style={styles.scheduledLabelText}>{t('transactions:scheduled.title')}</Text>
          </View>
        )}

        {isScheduled && (
          <Text style={styles.dateLabel}>{t('transactions:future.scheduled')}:</Text>
        )}

        {/* Kredi Kartı Bilgisi */}
        <View style={styles.creditCardInfo}>
          <View style={styles.creditCardHeader}>
            <CreditCard size={20} color={colors.warning} />
            <Text style={styles.creditCardName}>{creditCard.name}</Text>
          </View>
          {creditLimit > 0 ? (
            <View style={styles.creditLimitRow}>
              <View style={styles.creditLimitItem}>
                <Text style={styles.creditLimitLabel}>{t('accounts:creditCard.creditLimit')}</Text>
                <Text style={styles.creditLimitValue}>{formatCurrency(creditLimit)}</Text>
              </View>
              <View style={styles.creditLimitItem}>
                <Text style={styles.creditLimitLabel}>{t('accounts:creditCard.usedCredit')}</Text>
                <Text style={[styles.creditLimitValue, { color: colors.error }]}>{formatCurrency(usedCredit)}</Text>
              </View>
              <View style={styles.creditLimitItem}>
                <Text style={styles.creditLimitLabel}>{t('accounts:creditCard.availableCredit')}</Text>
                <Text style={[styles.creditLimitValue, { color: colors.success }]}>{formatCurrency(availableCredit)}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.noLimitText}>{t('accounts:creditCard.noLimit')}</Text>
          )}
        </View>

        {/* Row 1: Date + Bell + Close */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={[styles.dateButton, isScheduled && styles.dateButtonScheduled]}
            onPress={() => setShowDatePicker(true)}
          >
            <Calendar size={18} color={isScheduled ? colors.warning : colors.textMuted} />
            <Text style={[styles.dateText, isScheduled && styles.dateTextScheduled]}>
              {isToday(date) ? t('common:date.today') : formatDateMedium(date)}
            </Text>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <TouchableOpacity
              style={[styles.bellButton, isScheduled && styles.iconButtonActive]}
              onPress={() => setIsScheduled(!isScheduled)}
            >
              <Bell size={18} color={isScheduled ? colors.warning : colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Ödeme: Tedarikçi/Personel Seçimi */}
        {type === 'kredi_karti_odeme' && (
          <>
            {/* Hedef Tip Seçici */}
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowOdemeHedefTypePicker(true)}
            >
              {odemeHedefType === 'tedarikci' ? (
                <Building2 size={18} color={colors.orange} />
              ) : (
                <UserCheck size={18} color={colors.orange} />
              )}
              <Text style={styles.pickerButtonText}>
                {odemeHedefType === 'tedarikci'
                  ? t('clients:transactionTitles.supplierPayment')
                  : t('staff:transactionTitles.payment')}
              </Text>
              <ChevronDown size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Tedarikçi/Personel Seçici */}
            {odemeHedefType === 'tedarikci' ? (
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowCariPicker(true)}
              >
                <Building2 size={18} color={colors.orange} />
                <Text style={styles.pickerButtonText}>
                  {selectedCari ? selectedCari.name : t('clients:transactionForm.selectSupplier')}
                </Text>
                <ChevronDown size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowPersonelPicker(true)}
              >
                <UserCheck size={18} color={colors.orange} />
                <Text style={styles.pickerButtonText}>
                  {selectedPersonel ? `${selectedPersonel.first_name} ${selectedPersonel.last_name}` : t('staff:transactionForm.selectPersonel')}
                </Text>
                <ChevronDown size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Ekstre Ödemesi: Kaynak Hesap Seçimi */}
        {type === 'kredi_karti_ekstre' && (
          <TouchableOpacity
            style={styles.sourceAccountRow}
            onPress={() => setShowHesapPicker(true)}
          >
            <Wallet size={16} color={colors.textMuted} />
            <Text style={styles.sourceAccountText}>
              {selectedSourceHesap?.name || t('accounts:titles.selectAccount')}
            </Text>
            <ArrowRight size={16} color={colors.info} />
            <View style={styles.targetAccountLabel}>
              <CreditCard size={16} color={colors.warning} />
              <Text style={styles.targetAccountText}>{creditCard.name}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Category Picker - harcama ve ödeme için */}
        {categoryType && (
          <View style={styles.categoryWrapper}>
            <CategoryPicker
              value={kategoriId}
              onChange={(newKategoriId) => {
                setKategoriId(newKategoriId);
                // Kategori seçildiğinde mevcut tipi sakla (sekme değişse bile görünür kalsın)
                if (newKategoriId) {
                  setSelectedCategoryType(categoryType);
                } else {
                  // Kategori temizlendiğinde tipi de temizle
                  setSelectedCategoryType(null);
                }
              }}
              type={categoryType}
              label=""
              placeholder={t('common:select.selectCategory')}
              onNavigateAway={onDismiss}
              open={categoryPickerOpen}
              onOpenChange={(open) => {
                setCategoryPickerOpen(open);
                // Modal kapandı ve kategori seçilmedi ise, atlama olarak işaretle
                if (!open && !kategoriId) {
                  setCategorySkipped(true);
                }
              }}
            />
          </View>
        )}

        {/* Description */}
        <TextInput
          style={styles.descriptionInput}
          placeholder={t('common:placeholders.enterNote')}
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          maxLength={100}
        />

        {/* Amount + Save */}
        <View style={styles.amountRow}>
          <TextInput
            ref={amountInputRef}
            style={styles.amountInput}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            value={amount}
            onChangeText={handleAmountChange}
            keyboardType="decimal-pad"
            maxLength={15}
          />

          {isScheduled && (
            <View style={styles.scheduledBellIcon}>
              <Bell size={20} color={colors.warning} />
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: buttonColor },
              isSaving && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Text style={styles.saveButtonText}>
              {isSaving ? '...' : buttonLabel}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Type Tabs */}
        <TransactionTypeTabs
          value={type}
          onChange={setType}
          mode="kredi_karti"
        />
      </Animated.View>

      {/* DateTime Picker Modal */}
      {showDatePicker && (
        <Modal visible transparent animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowDatePicker(false)}>
            <View style={styles.pickerBackdrop}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerTitle}>{t('transactions:form.dateTime')}</Text>

                  {/* Date Picker */}
                  <View style={styles.pickerSection}>
                    <Text style={styles.pickerSectionTitle}>{t('common:date.date')}</Text>
                    <DateTimePickerRN
                      value={date}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(event, selectedDate) => {
                        if (Platform.OS === 'android') {
                          if (event.type === 'set' && selectedDate) {
                            const newDate = new Date(date);
                            newDate.setFullYear(selectedDate.getFullYear());
                            newDate.setMonth(selectedDate.getMonth());
                            newDate.setDate(selectedDate.getDate());
                            setDate(newDate);
                          }
                        } else if (selectedDate) {
                          const newDate = new Date(date);
                          newDate.setFullYear(selectedDate.getFullYear());
                          newDate.setMonth(selectedDate.getMonth());
                          newDate.setDate(selectedDate.getDate());
                          setDate(newDate);
                        }
                      }}
                      locale={locale}
                      textColor={colors.text}
                      themeVariant="light"
                      style={styles.datePickerStyle}
                    />
                  </View>

                  {/* Time Picker */}
                  <View style={styles.pickerSection}>
                    <Text style={styles.pickerSectionTitle}>{t('common:date.time')}</Text>
                    <DateTimePickerRN
                      value={date}
                      mode="time"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      is24Hour={true}
                      onChange={(event, selectedDate) => {
                        if (Platform.OS === 'android') {
                          if (event.type === 'set' && selectedDate) {
                            const newDate = new Date(date);
                            newDate.setHours(selectedDate.getHours());
                            newDate.setMinutes(selectedDate.getMinutes());
                            setDate(newDate);
                          }
                        } else if (selectedDate) {
                          const newDate = new Date(date);
                          newDate.setHours(selectedDate.getHours());
                          newDate.setMinutes(selectedDate.getMinutes());
                          setDate(newDate);
                        }
                      }}
                      locale={locale}
                      textColor={colors.text}
                      themeVariant="light"
                      style={styles.timePickerStyle}
                    />
                  </View>

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

      {/* Hesap Picker Modal - Bottom Sheet */}
      {showHesapPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowHesapPicker(false); setHesapSearchQuery(''); }}>
          <TouchableWithoutFeedback onPress={() => { setShowHesapPicker(false); setHesapSearchQuery(''); }}>
            <View style={styles.bottomSheetOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
                  <View style={styles.bottomSheetHeader}>
                    <Text style={styles.bottomSheetTitle}>{t('accounts:titles.selectAccount')}</Text>
                    <TouchableOpacity onPress={() => { setShowHesapPicker(false); setHesapSearchQuery(''); }} style={styles.bottomSheetCloseBtn}>
                      <X size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>

                  {/* Search Bar */}
                  <View style={styles.searchContainer}>
                <Search size={20} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t('common:search.searchPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  value={hesapSearchQuery}
                  onChangeText={setHesapSearchQuery}
                  autoCorrect={false}
                />
                {hesapSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setHesapSearchQuery('')}>
                    <X size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView style={styles.bottomSheetList} contentContainerStyle={styles.bottomSheetListContent} keyboardShouldPersistTaps="handled">
                {filteredHesaplar.map((hesap) => {
                  const isSelected = sourceHesapId === hesap.id;
                  return (
                    <TouchableOpacity
                      key={hesap.id}
                      style={[styles.bottomSheetItem, isSelected && styles.bottomSheetItemSelected]}
                      onPress={() => {
                        setSourceHesapId(hesap.id);
                        setShowHesapPicker(false);
                        setHesapSearchQuery('');
                      }}
                    >
                      <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.infoLight }]}>
                        <Wallet size={20} color={colors.info} />
                      </View>
                      <Text style={[styles.bottomSheetItemText, isSelected && { color: colors.primary }]}>{hesap.name}</Text>
                      {isSelected && (
                        <View style={[styles.checkIcon, { backgroundColor: colors.info }]}>
                          <Check size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {filteredHesaplar.length === 0 && hesapSearchQuery.trim() && (
                  <View style={styles.emptySearchState}>
                    <Search size={48} color={colors.textMuted} />
                    <Text style={styles.emptySearchText}>{t('common:search.noResults')}</Text>
                  </View>
                )}
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Cari Picker Modal - Bottom Sheet */}
      {showCariPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowCariPicker(false); setCariSearchQuery(''); }}>
          <TouchableWithoutFeedback onPress={() => { setShowCariPicker(false); setCariSearchQuery(''); }}>
            <View style={styles.bottomSheetOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
                  <View style={styles.bottomSheetHeader}>
                    <Text style={styles.bottomSheetTitle}>{t('clients:transactionForm.selectSupplier')}</Text>
                    <TouchableOpacity onPress={() => { setShowCariPicker(false); setCariSearchQuery(''); }} style={styles.bottomSheetCloseBtn}>
                      <X size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>

                  {/* Search Bar */}
                  <View style={styles.searchContainer}>
                    <Search size={20} color={colors.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder={t('clients:search.searchSuppliers')}
                  placeholderTextColor={colors.textMuted}
                  value={cariSearchQuery}
                  onChangeText={setCariSearchQuery}
                  autoCorrect={false}
                />
                {cariSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setCariSearchQuery('')}>
                    <X size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView style={styles.bottomSheetList} contentContainerStyle={styles.bottomSheetListContent} keyboardShouldPersistTaps="handled">
                {filteredCariler.map((cari) => {
                  const isSelected = cariId === cari.id;
                  return (
                    <TouchableOpacity
                      key={cari.id}
                      style={[styles.bottomSheetItem, isSelected && styles.bottomSheetItemSelected]}
                      onPress={() => {
                        setCariId(cari.id);
                        setShowCariPicker(false);
                        setCariSearchQuery('');
                      }}
                    >
                      <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.orangeLight }]}>
                        <Building2 size={20} color={colors.orange} />
                      </View>
                      <Text style={[styles.bottomSheetItemText, isSelected && { color: colors.primary }]}>{cari.name}</Text>
                      {isSelected && (
                        <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
                          <Check size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {filteredCariler.length === 0 && cariSearchQuery.trim() && (
                  <View style={styles.emptySearchState}>
                    <Search size={48} color={colors.textMuted} />
                    <Text style={styles.emptySearchText}>{t('common:search.noResults')}</Text>
                  </View>
                )}
                {filteredCariler.length === 0 && !cariSearchQuery.trim() && (
                  <View style={styles.emptySearchState}>
                    <Building2 size={48} color={colors.textMuted} />
                    <Text style={styles.emptySearchText}>{t('clients:messages.noSuppliers')}</Text>
                  </View>
                )}
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Ödeme Hedef Tipi Picker Modal - Bottom Sheet */}
      {showOdemeHedefTypePicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowOdemeHedefTypePicker(false)}>
          <TouchableWithoutFeedback onPress={() => setShowOdemeHedefTypePicker(false)}>
            <View style={styles.bottomSheetOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.bottomSheetContent, { paddingBottom: insets.bottom + 16 }]}>
                  <View style={styles.bottomSheetHeader}>
                    <Text style={styles.bottomSheetTitle}>{t('transactions:form.selectPaymentType')}</Text>
                    <TouchableOpacity onPress={() => setShowOdemeHedefTypePicker(false)} style={styles.bottomSheetCloseBtn}>
                      <X size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.bottomSheetListContent}>
                <TouchableOpacity
                  style={[styles.odemeTypeItem, odemeHedefType === 'tedarikci' && styles.odemeTypeItemSelected]}
                  onPress={() => {
                    setOdemeHedefType('tedarikci');
                    setCariId(null);
                    setPersonelId(null);
                    setShowOdemeHedefTypePicker(false);
                  }}
                >
                  <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.orangeLight }]}>
                    <Building2 size={24} color={colors.orange} />
                  </View>
                  <View style={styles.odemeTypeContent}>
                    <Text style={[styles.odemeTypeTitle, odemeHedefType === 'tedarikci' && { color: colors.orange }]}>
                      {t('clients:transactionTitles.supplierPayment')}
                    </Text>
                    <Text style={styles.odemeTypeSubtext}>{t('clients:transactionDescriptions.supplierPayment')}</Text>
                  </View>
                  {odemeHedefType === 'tedarikci' && (
                    <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
                      <Check size={14} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.odemeTypeItem, odemeHedefType === 'staff' && styles.odemeTypeItemSelected]}
                  onPress={() => {
                    setOdemeHedefType('staff');
                    setCariId(null);
                    setPersonelId(null);
                    setShowOdemeHedefTypePicker(false);
                  }}
                >
                  <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.orangeLight }]}>
                    <UserCheck size={24} color={colors.orange} />
                  </View>
                  <View style={styles.odemeTypeContent}>
                    <Text style={[styles.odemeTypeTitle, odemeHedefType === 'staff' && { color: colors.orange }]}>
                      {t('staff:transactionTitles.payment')}
                    </Text>
                    <Text style={styles.odemeTypeSubtext}>{t('staff:transactionDescriptions.personnelPayment')}</Text>
                  </View>
                  {odemeHedefType === 'staff' && (
                    <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
                      <Check size={14} color="#FFFFFF" />
                    </View>
                  )}
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Personel Picker Modal - Bottom Sheet */}
      {showPersonelPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowPersonelPicker(false); setPersonelSearchQuery(''); }}>
          <TouchableWithoutFeedback onPress={() => { setShowPersonelPicker(false); setPersonelSearchQuery(''); }}>
            <View style={styles.bottomSheetOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
                  <View style={styles.bottomSheetHeader}>
                    <Text style={styles.bottomSheetTitle}>{t('staff:transactionForm.selectPersonel')}</Text>
                    <TouchableOpacity onPress={() => { setShowPersonelPicker(false); setPersonelSearchQuery(''); }} style={styles.bottomSheetCloseBtn}>
                      <X size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>

                  {/* Search Bar */}
                  <View style={styles.searchContainer}>
                <Search size={20} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t('staff:search.searchPersonnel')}
                  placeholderTextColor={colors.textMuted}
                  value={personelSearchQuery}
                  onChangeText={setPersonelSearchQuery}
                  autoCorrect={false}
                />
                {personelSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setPersonelSearchQuery('')}>
                    <X size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView style={styles.bottomSheetList} contentContainerStyle={styles.bottomSheetListContent} keyboardShouldPersistTaps="handled">
                {filteredPersonel.map((personel) => {
                  const isSelected = personelId === personel.id;
                  return (
                    <TouchableOpacity
                      key={personel.id}
                      style={[styles.bottomSheetItem, isSelected && styles.bottomSheetItemSelected]}
                      onPress={() => {
                        setPersonelId(personel.id);
                        setShowPersonelPicker(false);
                        setPersonelSearchQuery('');
                      }}
                    >
                      <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.orangeLight }]}>
                        <UserCheck size={20} color={colors.orange} />
                      </View>
                      <Text style={[styles.bottomSheetItemText, isSelected && { color: colors.primary }]}>
                        {personel.first_name} {personel.last_name}
                      </Text>
                      {isSelected && (
                        <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
                          <Check size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {filteredPersonel.length === 0 && personelSearchQuery.trim() && (
                  <View style={styles.emptySearchState}>
                    <Search size={48} color={colors.textMuted} />
                    <Text style={styles.emptySearchText}>{t('common:search.noResults')}</Text>
                  </View>
                )}
                {filteredPersonel.length === 0 && !personelSearchQuery.trim() && (
                  <View style={styles.emptySearchState}>
                    <UserCheck size={48} color={colors.textMuted} />
                    <Text style={styles.emptySearchText}>{t('staff:messages.noPersonnel')}</Text>
                  </View>
                )}
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
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
  scheduledLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warningLight,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  scheduledLabelText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.warning,
  },
  dateLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
  },
  creditCardInfo: {
    backgroundColor: colors.warningLight + '40',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  creditCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  creditCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  creditLimitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  creditLimitItem: {
    alignItems: 'center',
  },
  creditLimitLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  creditLimitValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  noLimitText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    marginRight: 12,
  },
  dateText: {
    fontSize: 14,
    color: colors.text,
  },
  dateButtonScheduled: {
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  dateTextScheduled: {
    color: colors.warning,
    fontWeight: '500',
  },
  headerCenter: {
    marginRight: 12,
  },
  bellButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  closeButton: {
    padding: 6,
  },
  iconButtonActive: {
    backgroundColor: colors.warningLight,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    marginBottom: 8,
  },
  pickerButtonText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  sourceAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.infoLight,
    borderRadius: 8,
    marginBottom: 8,
  },
  sourceAccountText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  targetAccountLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  targetAccountText: {
    fontSize: 14,
    color: colors.warning,
    fontWeight: '500',
  },
  categoryWrapper: {
    marginBottom: 4,
  },
  descriptionInput: {
    fontSize: 15,
    color: colors.text,
    paddingVertical: 10,
    paddingHorizontal: 0,
    marginBottom: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 56,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  scheduledBellIcon: {
    padding: 8,
    backgroundColor: colors.warningLight,
    borderRadius: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'left',
    paddingVertical: 8,
  },
  saveButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  pickerSection: {
    marginBottom: 8,
  },
  pickerSectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textMuted,
    marginBottom: 4,
    textAlign: 'center',
  },
  datePickerStyle: {
    height: 150,
  },
  timePickerStyle: {
    height: 120,
  },
  pickerDoneButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
  },
  pickerDoneText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Bottom Sheet Styles
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheetContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  bottomSheetCloseBtn: {
    padding: 4,
  },
  bottomSheetList: {
    flex: 1,
  },
  bottomSheetListContent: {
    padding: 12,
    paddingBottom: 24,
  },
  bottomSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.surfaceLighter,
    borderRadius: 12,
    marginBottom: 8,
  },
  bottomSheetItemSelected: {
    backgroundColor: colors.primaryLight + '30',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  bottomSheetItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bottomSheetItemText: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 4,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySearchState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptySearchText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },
  // Ödeme Türü Seçici
  odemeTypeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.surfaceLighter,
    borderRadius: 12,
    marginBottom: 12,
  },
  odemeTypeItemSelected: {
    backgroundColor: colors.orangeLight + '30',
    borderWidth: 1,
    borderColor: colors.orange,
  },
  odemeTypeContent: {
    flex: 1,
  },
  odemeTypeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  odemeTypeSubtext: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
});
