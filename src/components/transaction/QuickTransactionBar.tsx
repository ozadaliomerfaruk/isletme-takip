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
  Users,
  Wallet,
  UserCheck,
  ArrowRight,
  Search,
  Check,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { Text, CategoryPicker } from '@/components/ui';
import { TransactionTypeTabs, TransactionType, TransactionTabMode, getTransactionTypeColor } from './TransactionTypeTabs';
import { colors } from '@/constants/colors';
import { CariType } from '@/types/database';
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

const CARD_HEIGHT = 200;

export interface QuickTransactionBarProps {
  visible: boolean;
  onDismiss: () => void;
  defaultType?: TransactionType;
  defaultHesapId?: string;
  defaultCariId?: string;
  defaultCariType?: CariType;
  defaultPersonelId?: string;
  onSuccess?: () => void;
}

export function QuickTransactionBar({
  visible,
  onDismiss,
  defaultType = 'gelir',
  defaultHesapId,
  defaultCariId,
  defaultCariType,
  defaultPersonelId,
  onSuccess,
}: QuickTransactionBarProps) {
  const { t } = useTranslation(['transactions', 'common', 'clients', 'staff', 'accounts']);
  const { formatDateMedium, locale } = useDateFormat();
  const insets = useSafeAreaInsets();

  // Cari modu: defaultCariId verilmişse aktif
  const isCariMode = !!defaultCariId;
  // Personel modu: defaultPersonelId verilmişse aktif
  const isPersonelMode = !!defaultPersonelId;

  // Tab modunu belirle
  const tabMode: TransactionTabMode = isPersonelMode
    ? 'personel'
    : isCariMode
    ? (defaultCariType === 'tedarikci' ? 'tedarikci' : 'musteri')
    : 'normal';

  // Form state
  const [type, setType] = useState<TransactionType>(defaultType);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Additional IDs for different transaction types
  const [hedefHesapId, setHedefHesapId] = useState<string | null>(null);
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
  const { data: musteriCariler } = useCariler('musteri');
  const { data: personelList } = usePersonelList();
  const createIslem = useCreateIslem();
  const createIleriTarihliIslem = useCreateIleriTarihliIslem();

  // Refs
  const amountInputRef = useRef<TextInput>(null);

  // Auto-select hesap
  const hesapId = defaultHesapId || hesaplar?.[0]?.id;

  // Get selected entities
  const selectedHesap = hesaplar?.find(h => h.id === hesapId);
  const selectedHedefHesap = hesaplar?.find(h => h.id === hedefHesapId);

  // Cari listesi: cari modunda cari tipine göre, normal modda işlem tipine göre
  const carilerForType = useMemo(() => {
    if (isCariMode) {
      return defaultCariType === 'tedarikci' ? tedarikciCariler : musteriCariler;
    }
    // Normal mod: odeme için tedarikçi, tahsilat için müşteri
    return type === 'odeme' ? tedarikciCariler : musteriCariler;
  }, [isCariMode, defaultCariType, type, tedarikciCariler, musteriCariler]);

  const selectedCari = carilerForType?.find(c => c.id === cariId);
  const selectedPersonel = personelList?.find(p => p.id === personelId);

  // Filtered lists for search
  const filteredHesaplar = useMemo(() => {
    const list = hesaplar?.filter(h => h.id !== hesapId) || [];
    if (!hesapSearchQuery.trim()) return list;
    const query = hesapSearchQuery.toLowerCase().trim();
    return list.filter(h => h.name.toLowerCase().includes(query));
  }, [hesaplar, hesapId, hesapSearchQuery]);

  const filteredCariler = useMemo(() => {
    if (!carilerForType) return [];
    if (!cariSearchQuery.trim()) return carilerForType;
    const query = cariSearchQuery.toLowerCase().trim();
    return carilerForType.filter(c => c.name.toLowerCase().includes(query));
  }, [carilerForType, cariSearchQuery]);

  const filteredPersonel = useMemo(() => {
    if (!personelList) return [];
    if (!personelSearchQuery.trim()) return personelList;
    const query = personelSearchQuery.toLowerCase().trim();
    return personelList.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(query)
    );
  }, [personelList, personelSearchQuery]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      // Reset after close animation
      const timer = setTimeout(() => {
        setAmount('');
        setDescription('');
        setDate(new Date());
        setKategoriId(null);
        setIsScheduled(false);
        setIsSaving(false);
        setHedefHesapId(null);
        setCariId(null);
        setPersonelId(null);
        setOdemeHedefType('tedarikci');
        setHesapSearchQuery('');
        setCariSearchQuery('');
        setPersonelSearchQuery('');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Update type and cari/personel when modal opens
  useEffect(() => {
    if (visible) {
      // Personel modu için varsayılan tip ve personel ayarla
      if (isPersonelMode && defaultPersonelId) {
        setPersonelId(defaultPersonelId);
        setType('personel_odeme_tab');
      }
      // Cari modu için varsayılan tip ve cari ayarla
      else if (isCariMode && defaultCariId) {
        setCariId(defaultCariId);
        // Cari tipine göre varsayılan işlem tipi
        if (defaultCariType === 'tedarikci') {
          setType('odeme');
          setOdemeHedefType('tedarikci');
        } else {
          setType('tahsilat');
        }
      } else {
        setType(defaultType);
      }
    }
  }, [visible, isPersonelMode, defaultPersonelId, isCariMode, defaultCariId, defaultCariType, defaultType]);

  // Reset cariId and personelId when type changes (only in normal mode)
  useEffect(() => {
    if (!isCariMode && !isPersonelMode) {
      setCariId(null);
      setPersonelId(null);
      setOdemeHedefType('tedarikci');
    }
  }, [type, isCariMode, isPersonelMode]);

  // Keyboard listeners - capture height ONCE
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
      // Don't reset height - keep the last known height for positioning
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

    // Reset values
    opacity.setValue(0);
    translateY.setValue(100);

    // Smooth open animation
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
      // Focus amount input after animation
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

  // Handle backdrop press - two-step dismiss
  const handleBackdropPress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (isKeyboardVisible) {
      // First tap: just dismiss keyboard, keep bar open
      Keyboard.dismiss();
    } else {
      // Second tap: dismiss the bar
      handleDismiss();
    }
  }, [handleDismiss, isKeyboardVisible]);

  // Handle save
  const handleSave = useCallback(async () => {
    // Alış/Satış/İade ve Personel Gider işlemlerinde hesap gerekmez
    const needsHesap = !['alis', 'satis', 'alis_iade', 'satis_iade', 'personel_gider_tab'].includes(type);
    if (needsHesap && !hesapId) {
      Alert.alert(t('common:status.error'), t('accounts:messages.noAccounts'));
      return;
    }

    if (!isValidAmount(amount)) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    // Validate additional fields based on type
    if (type === 'transfer' && !hedefHesapId) {
      Alert.alert(t('common:status.error'), t('transactions:validation.selectTargetAccount'));
      return;
    }

    if (type === 'odeme') {
      if (odemeHedefType === 'tedarikci' && !cariId) {
        Alert.alert(t('common:status.error'), t('clients:transactionForm.selectSupplier'));
        return;
      }
      if (odemeHedefType === 'staff' && !personelId) {
        Alert.alert(t('common:status.error'), t('staff:transactionForm.selectPersonel'));
        return;
      }
    }

    if (type === 'tahsilat' && !cariId) {
      Alert.alert(t('common:status.error'), t('clients:transactionForm.selectCustomer'));
      return;
    }

    // Cari modu validasyonları
    if ((type === 'alis' || type === 'alis_iade') && !cariId) {
      Alert.alert(t('common:status.error'), t('clients:transactionForm.selectSupplier'));
      return;
    }

    if ((type === 'satis' || type === 'satis_iade') && !cariId) {
      Alert.alert(t('common:status.error'), t('clients:transactionForm.selectCustomer'));
      return;
    }

    // Personel modu validasyonları
    if (['personel_odeme_tab', 'personel_gider_tab', 'personel_tahsilat_tab'].includes(type) && !personelId) {
      Alert.alert(t('common:status.error'), t('staff:transactionForm.selectPersonel'));
      return;
    }

    setIsSaving(true);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const parsedAmount = parseCurrency(amount);

      // Determine actual type for API
      let apiType: string = type;
      if (type === 'odeme') {
        apiType = odemeHedefType === 'staff' ? 'personel_odeme' : 'cari_odeme';
      }
      if (type === 'tahsilat') apiType = 'cari_tahsilat';
      if (type === 'alis') apiType = 'cari_alis';
      if (type === 'satis') apiType = 'cari_satis';
      if (type === 'alis_iade') apiType = 'cari_alis_iade';
      if (type === 'satis_iade') apiType = 'cari_satis_iade';
      // Personel tab type mappings
      if (type === 'personel_odeme_tab') apiType = 'personel_odeme';
      if (type === 'personel_gider_tab') apiType = 'personel_gider';
      if (type === 'personel_tahsilat_tab') apiType = 'personel_tahsilat';

      // Build transaction data
      // Alış/Satış/İade ve Personel Gider işlemlerinde hesap_id gerekmez (nakit akışı yok)
      const needsHesapForData = !['alis', 'satis', 'alis_iade', 'satis_iade', 'personel_gider_tab'].includes(type);
      const transactionData: any = {
        type: apiType,
        amount: parsedAmount,
        description: description.trim() || null,
        hesap_id: needsHesapForData ? hesapId : null,
        kategori_id: kategoriId,
      };

      // Add type-specific fields
      if (type === 'transfer') {
        transactionData.hedef_hesap_id = hedefHesapId;
      }
      if (type === 'odeme') {
        if (odemeHedefType === 'tedarikci') {
          transactionData.cari_id = cariId;
        } else {
          transactionData.personel_id = personelId;
        }
      }
      if (type === 'tahsilat') {
        transactionData.cari_id = cariId;
      }
      // Cari modu işlem tipleri
      if (type === 'alis' || type === 'satis' || type === 'alis_iade' || type === 'satis_iade') {
        transactionData.cari_id = cariId;
      }
      // Personel modu işlem tipleri
      if (['personel_odeme_tab', 'personel_gider_tab', 'personel_tahsilat_tab'].includes(type)) {
        transactionData.personel_id = personelId;
      }

      if (isScheduled) {
        // İleri tarihli işlem - sadece kullanıcı bilerek seçtiyse
        await createIleriTarihliIslem.mutateAsync({
          ...transactionData,
          scheduled_date: formatDateForDB(date),
        });
      } else {
        // Normal işlem - tarih ve saat dahil
        await createIslem.mutateAsync({
          ...transactionData,
          date: formatDateTimeForDB(date),
        });
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      onSuccess?.();
      handleDismiss();
    } catch (error) {
      console.error('Transaction error:', error);
      setIsSaving(false);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(t('common:status.error'), t('transactions:messages.saveFailed'));
    }
  }, [
    t,
    hesapId,
    amount,
    type,
    description,
    date,
    kategoriId,
    isScheduled,
    hedefHesapId,
    cariId,
    personelId,
    odemeHedefType,
    createIslem,
    createIleriTarihliIslem,
    onSuccess,
    handleDismiss,
  ]);

  // Format amount for display
  const handleAmountChange = useCallback((text: string) => {
    // Remove non-numeric except comma and dot
    const cleaned = text.replace(/[^0-9,.]/g, '');
    setAmount(cleaned);
  }, []);

  if (!visible) return null;

  const buttonColor = getTransactionTypeColor(type);
  const buttonLabels: Record<TransactionType, string> = {
    gelir: t('transactions:tabs.gelir'),
    gider: t('transactions:tabs.gider'),
    transfer: t('transactions:tabs.transfer'),
    odeme: t('transactions:tabs.odeme'),
    tahsilat: t('transactions:tabs.tahsilat'),
    alis: t('transactions:tabs.alis'),
    satis: t('transactions:tabs.satis'),
    alis_iade: t('clients:actions.return'),
    satis_iade: t('clients:actions.return'),
    personel_odeme_tab: t('transactions:tabs.odeme'),
    personel_gider_tab: t('transactions:tabs.gider'),
    personel_tahsilat_tab: t('transactions:tabs.tahsilat'),
  };
  const buttonLabel = buttonLabels[type];

  // Category picker type mapping
  const getCategoryType = (): 'gelir' | 'gider' | undefined => {
    if (type === 'gelir' || type === 'tahsilat' || type === 'satis') return 'gelir';
    if (type === 'gider' || type === 'odeme' || type === 'transfer' || type === 'alis') return 'gider';
    // İade tipleri için kategori
    if (type === 'satis_iade') return 'gelir';
    if (type === 'alis_iade') return 'gider';
    // Personel tipleri için kategori
    if (type === 'personel_odeme_tab' || type === 'personel_tahsilat_tab') return 'gelir';
    if (type === 'personel_gider_tab') return 'gider';
    return undefined;
  };
  const categoryType = getCategoryType();

  // Position card above keyboard
  const cardBottom = keyboardHeight > 0 ? keyboardHeight : insets.bottom + 10;

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

        {/* Cari Modu: Seçili cari bilgisi */}
        {isCariMode && selectedCari && (
          <View style={[styles.sourceAccountRow, { backgroundColor: defaultCariType === 'tedarikci' ? colors.orangeLight : colors.primaryLight }]}>
            {defaultCariType === 'tedarikci' ? (
              <Building2 size={16} color={colors.orange} />
            ) : (
              <Users size={16} color={colors.primary} />
            )}
            <Text style={styles.sourceAccountText}>
              {selectedCari.name}
            </Text>
          </View>
        )}

        {/* Personel Modu: Seçili personel bilgisi */}
        {isPersonelMode && selectedPersonel && (
          <View style={[styles.sourceAccountRow, { backgroundColor: colors.successLight }]}>
            <UserCheck size={16} color={colors.success} />
            <Text style={styles.sourceAccountText}>
              {selectedPersonel.first_name} {selectedPersonel.last_name}
            </Text>
          </View>
        )}

        {/* Transfer: Kaynak ve Hedef Hesap */}
        {type === 'transfer' && (
          <>
            {/* Kaynak Hesap Gösterimi */}
            <View style={styles.sourceAccountRow}>
              <Wallet size={16} color={colors.textMuted} />
              <Text style={styles.sourceAccountText}>
                {selectedHesap?.name || t('accounts:titles.accounts')}
              </Text>
              <ArrowRight size={16} color={colors.info} />
              <TouchableOpacity
                style={styles.targetAccountButton}
                onPress={() => setShowHesapPicker(true)}
              >
                <Text style={styles.targetAccountText}>
                  {selectedHedefHesap ? selectedHedefHesap.name : t('transactions:form.targetAccount')}
                </Text>
                <ChevronDown size={16} color={colors.info} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Ödeme: Tedarikçi/Personel Seçimi (sadece normal modda) */}
        {type === 'odeme' && !isCariMode && (
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
                {odemeHedefType === 'tedarikci' ? t('clients:transactionTitles.supplierPayment') : t('staff:transactionTitles.payment')}
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

        {/* Tahsilat: Müşteri Seçici (sadece normal modda) */}
        {type === 'tahsilat' && !isCariMode && (
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowCariPicker(true)}
          >
            <Users size={18} color={colors.primary} />
            <Text style={styles.pickerButtonText}>
              {selectedCari ? selectedCari.name : t('clients:transactionForm.selectCustomer')}
            </Text>
            <ChevronDown size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Category Picker - tüm işlem tiplerinde */}
        {categoryType && (
          <View style={styles.categoryWrapper}>
            <CategoryPicker
              value={kategoriId}
              onChange={setKategoriId}
              type={categoryType}
              label=""
              placeholder={t('common:select.selectCategory')}
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
          mode={tabMode}
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

      {/* Hesap Picker Modal (for transfer) - Bottom Sheet */}
      {showHesapPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowHesapPicker(false); setHesapSearchQuery(''); }}>
          <View style={styles.bottomSheetOverlay}>
            <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
              <View style={styles.bottomSheetHeader}>
                <Text style={styles.bottomSheetTitle}>{t('transactions:form.targetAccount')}</Text>
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
                  const isSelected = hedefHesapId === hesap.id;
                  return (
                    <TouchableOpacity
                      key={hesap.id}
                      style={[styles.bottomSheetItem, isSelected && styles.bottomSheetItemSelected]}
                      onPress={() => {
                        setHedefHesapId(hesap.id);
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
          </View>
        </Modal>
      )}

      {/* Cari Picker Modal (for ödeme tedarikçi/tahsilat) - Bottom Sheet */}
      {showCariPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowCariPicker(false); setCariSearchQuery(''); }}>
          <View style={styles.bottomSheetOverlay}>
            <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
              <View style={styles.bottomSheetHeader}>
                <Text style={styles.bottomSheetTitle}>
                  {type === 'tahsilat' ? t('clients:transactionForm.selectCustomer') : t('clients:transactionForm.selectSupplier')}
                </Text>
                <TouchableOpacity onPress={() => { setShowCariPicker(false); setCariSearchQuery(''); }} style={styles.bottomSheetCloseBtn}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Search Bar */}
              <View style={styles.searchContainer}>
                <Search size={20} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={type === 'tahsilat' ? t('clients:search.searchCustomers') : t('clients:search.searchSuppliers')}
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
                  const iconColor = type === 'tahsilat' ? colors.primary : colors.orange;
                  const iconBgColor = type === 'tahsilat' ? colors.primaryLight : colors.orangeLight;
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
                      <View style={[styles.bottomSheetItemIcon, { backgroundColor: iconBgColor }]}>
                        {type === 'tahsilat' ? (
                          <Users size={20} color={iconColor} />
                        ) : (
                          <Building2 size={20} color={iconColor} />
                        )}
                      </View>
                      <Text style={[styles.bottomSheetItemText, isSelected && { color: colors.primary }]}>{cari.name}</Text>
                      {isSelected && (
                        <View style={[styles.checkIcon, { backgroundColor: iconColor }]}>
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
                    {type === 'tahsilat' ? (
                      <Users size={48} color={colors.textMuted} />
                    ) : (
                      <Building2 size={48} color={colors.textMuted} />
                    )}
                    <Text style={styles.emptySearchText}>
                      {type === 'tahsilat' ? t('clients:messages.noCustomers') : t('clients:messages.noSuppliers')}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Ödeme Hedef Tipi Picker Modal - Bottom Sheet */}
      {showOdemeHedefTypePicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowOdemeHedefTypePicker(false)}>
          <View style={styles.bottomSheetOverlay}>
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
          </View>
        </Modal>
      )}

      {/* Personel Picker Modal - Bottom Sheet */}
      {showPersonelPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowPersonelPicker(false); setPersonelSearchQuery(''); }}>
          <View style={styles.bottomSheetOverlay}>
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
          </View>
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
  listPickerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    maxHeight: '70%',
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
  pickerCancelButton: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pickerCancelText: {
    color: colors.textMuted,
    fontSize: 16,
  },
  listScroll: {
    maxHeight: 300,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  listItemSelected: {
    backgroundColor: colors.primaryLight,
  },
  listItemText: {
    fontSize: 16,
    color: colors.text,
  },
  listItemContent: {
    flex: 1,
  },
  listItemSubtext: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyListText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
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
  targetAccountButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  targetAccountText: {
    fontSize: 14,
    color: colors.info,
    fontWeight: '500',
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
