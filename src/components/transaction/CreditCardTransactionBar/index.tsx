import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
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
  CreditCard,
  ArrowRight,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { Text, CategoryPicker } from '@/components/ui';
import { TransactionTypeTabs, TransactionType, getTransactionTypeColor } from '../TransactionTypeTabs';
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
import { textIncludes } from '@/lib/turkishTextUtils';

import { CreditCardDatePicker } from './CreditCardDatePicker';
import { HesapPickerSheet, CariPickerSheet, PersonelPickerSheet, OdemeHedefTypePicker } from './CreditCardPickerSheets';
import { styles } from './styles';

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

  // Category state
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categorySkipped, setCategorySkipped] = useState(false);
  const [selectedCategoryType, setSelectedCategoryType] = useState<'gelir' | 'gider' | null>(null);

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

  const amountInputRef = useRef<TextInput>(null);

  const nakitHesaplar = useMemo(() => {
    return hesaplar?.filter(h => h.type !== 'kredi_karti') || [];
  }, [hesaplar]);

  const selectedSourceHesap = nakitHesaplar.find(h => h.id === sourceHesapId);
  const selectedCari = tedarikciCariler?.find(c => c.id === cariId);
  const selectedPersonel = personelList?.find(p => p.id === personelId);

  const filteredHesaplar = useMemo(() => {
    if (!hesapSearchQuery.trim()) return nakitHesaplar;
    return nakitHesaplar.filter(h => textIncludes(h.name, hesapSearchQuery));
  }, [nakitHesaplar, hesapSearchQuery]);

  const filteredCariler = useMemo(() => {
    if (!tedarikciCariler) return [];
    if (!cariSearchQuery.trim()) return tedarikciCariler;
    return tedarikciCariler.filter(c => textIncludes(c.name, cariSearchQuery));
  }, [tedarikciCariler, cariSearchQuery]);

  const filteredPersonel = useMemo(() => {
    if (!personelList) return [];
    if (!personelSearchQuery.trim()) return personelList;
    return personelList.filter(p =>
      textIncludes(`${p.first_name} ${p.last_name}`, personelSearchQuery)
    );
  }, [personelList, personelSearchQuery]);

  const creditLimit = creditCard.credit_limit || 0;
  const usedCredit = Math.abs(Number(creditCard.balance));
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

  useEffect(() => {
    if (visible) {
      setType('kredi_karti_gider');
      setSourceHesapId(null);
    }
  }, [visible]);

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

  useEffect(() => {
    if (visible) {
      animateOpen();
    }
  }, [visible, animateOpen]);

  const handleDismiss = useCallback(() => {
    animateClose(() => {
      onDismiss();
    });
  }, [animateClose, onDismiss]);

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

  const handleSave = useCallback(async () => {
    if (!isValidAmount(amount)) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    if ((type === 'kredi_karti_gider' || type === 'kredi_karti_odeme') && !kategoriId && !categorySkipped) {
      setCategoryPickerOpen(true);
      return;
    }
    if (type === 'kredi_karti_ekstre' && !sourceHesapId) {
      setShowHesapPicker(true);
      return;
    }

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

      let apiType: IslemType;
      let hesapId: string | null = null;
      let hedefHesapId: string | null = null;
      let cariIdValue: string | null = null;
      let personelIdValue: string | null = null;

      if (type === 'kredi_karti_gider') {
        apiType = 'gider';
        hesapId = creditCard.id;
      } else if (type === 'kredi_karti_odeme') {
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
    t, amount, type, description, date, kategoriId, categorySkipped,
    isScheduled, sourceHesapId, cariId, personelId, odemeHedefType,
    creditCard, createIslem, createIleriTarihliIslem, onSuccess, handleDismiss,
  ]);

  const handleAmountChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9,.]/g, '');
    setAmount(cleaned);
  }, []);

  const handleHesapSelect = useCallback((id: string) => {
    setSourceHesapId(id);
    setShowHesapPicker(false);
    setHesapSearchQuery('');
  }, []);

  const handleCariSelect = useCallback((id: string) => {
    setCariId(id);
    setShowCariPicker(false);
    setCariSearchQuery('');
  }, []);

  const handlePersonelSelect = useCallback((id: string) => {
    setPersonelId(id);
    setShowPersonelPicker(false);
    setPersonelSearchQuery('');
  }, []);

  const handleOdemeHedefTypeSelect = useCallback((newType: 'tedarikci' | 'staff') => {
    setOdemeHedefType(newType);
    setCariId(null);
    setPersonelId(null);
    setShowOdemeHedefTypePicker(false);
  }, []);

  const handleHesapPickerDismiss = useCallback(() => {
    setShowHesapPicker(false);
    setHesapSearchQuery('');
  }, []);

  const handleCariPickerDismiss = useCallback(() => {
    setShowCariPicker(false);
    setCariSearchQuery('');
  }, []);

  const handlePersonelPickerDismiss = useCallback(() => {
    setShowPersonelPicker(false);
    setPersonelSearchQuery('');
  }, []);

  if (!visible) return null;

  const buttonColor = getTransactionTypeColor(type);
  const buttonLabels: Record<string, string> = {
    kredi_karti_gider: t('transactions:tabs.kredi_karti_gider'),
    kredi_karti_odeme: t('transactions:tabs.kredi_karti_odeme'),
    kredi_karti_ekstre: t('transactions:tabs.kredi_karti_ekstre'),
  };
  const buttonLabel = buttonLabels[type] || t('common:buttons.save');

  const getCategoryType = (): 'gelir' | 'gider' | undefined => {
    if (type === 'kredi_karti_ekstre') return undefined;
    return 'gider';
  };
  const categoryType = selectedCategoryType || getCategoryType();

  const cardBottom = keyboardHeight > 0
    ? keyboardHeight
    : insets.bottom + TAB_BAR_HEIGHT + 10;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

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
        {isScheduled && (
          <View style={styles.scheduledLabel}>
            <Bell size={14} color={colors.warning} />
            <Text style={styles.scheduledLabelText}>{t('transactions:scheduled.title')}</Text>
          </View>
        )}

        {isScheduled && (
          <Text style={styles.dateLabel}>{t('transactions:future.scheduled')}:</Text>
        )}

        {/* Credit Card Info */}
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

        {/* Header Row */}
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

        {/* Payment: Supplier/Personnel Selection */}
        {type === 'kredi_karti_odeme' && (
          <>
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

        {/* Statement Payment: Source Account Selection */}
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

        {/* Category Picker */}
        {categoryType && (
          <View style={styles.categoryWrapper}>
            <CategoryPicker
              value={kategoriId}
              onChange={(newKategoriId) => {
                setKategoriId(newKategoriId);
                if (newKategoriId) {
                  setSelectedCategoryType(categoryType);
                } else {
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
          maxLength={500}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
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

      {/* Picker Modals */}
      <CreditCardDatePicker
        visible={showDatePicker}
        date={date}
        onDateChange={setDate}
        onDismiss={() => setShowDatePicker(false)}
        locale={locale}
        t={t}
      />

      <HesapPickerSheet
        visible={showHesapPicker}
        onDismiss={handleHesapPickerDismiss}
        searchQuery={hesapSearchQuery}
        onSearchChange={setHesapSearchQuery}
        filteredHesaplar={filteredHesaplar}
        selectedId={sourceHesapId}
        onSelect={handleHesapSelect}
        t={t}
      />

      <CariPickerSheet
        visible={showCariPicker}
        onDismiss={handleCariPickerDismiss}
        searchQuery={cariSearchQuery}
        onSearchChange={setCariSearchQuery}
        filteredCariler={filteredCariler}
        selectedId={cariId}
        onSelect={handleCariSelect}
        t={t}
      />

      <PersonelPickerSheet
        visible={showPersonelPicker}
        onDismiss={handlePersonelPickerDismiss}
        searchQuery={personelSearchQuery}
        onSearchChange={setPersonelSearchQuery}
        filteredPersonel={filteredPersonel}
        selectedId={personelId}
        onSelect={handlePersonelSelect}
        t={t}
      />

      <OdemeHedefTypePicker
        visible={showOdemeHedefTypePicker}
        onDismiss={() => setShowOdemeHedefTypePicker(false)}
        odemeHedefType={odemeHedefType}
        onSelect={handleOdemeHedefTypeSelect}
        t={t}
      />
    </Modal>
  );
}
