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
  CreditCard,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { Text, CategoryPicker } from '@/components/ui';
import { TransactionTypeTabs, TransactionType, TransactionTabMode, getTransactionTypeColor } from './TransactionTypeTabs';
import { ExchangeRateBar } from './ExchangeRateBar';
import { colors } from '@/constants/colors';
import { CariType, Currency } from '@/types/database';
import { isCrossCurrency } from '@/constants/currencies';
import { parseCurrency, formatCurrency, isValidAmount } from '@/lib/currency';
import { formatDateForDB, formatDateTimeForDB, isToday, ensureValidDate } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { useCreateIslem } from '@/hooks/useIslemler';
import { useCreateIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import DateTimePickerRN from '@react-native-community/datetimepicker';

// Ödeme hedef tipi
type OdemeHedefType = 'tedarikci' | 'staff' | 'kredi_karti' | null;

// Hesap picker modu
type HesapPickerTarget = 'source' | 'hedef';

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
  // Geçersiz tarih koruması - 1970 ve benzeri sorunları önle
  const safeDate = useMemo(() => ensureValidDate(date), [date]);
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Additional IDs for different transaction types
  const [hedefHesapId, setHedefHesapId] = useState<string | null>(null);
  const [sourceHesapId, setSourceHesapId] = useState<string | null>(null);
  const [cariId, setCariId] = useState<string | null>(null);
  const [personelId, setPersonelId] = useState<string | null>(null);
  const [odemeHedefType, setOdemeHedefType] = useState<OdemeHedefType>(null);
  const [hesapPickerTarget, setHesapPickerTarget] = useState<HesapPickerTarget>('hedef');

  // Pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showHesapPicker, setShowHesapPicker] = useState(false);
  const [showCariPicker, setShowCariPicker] = useState(false);
  const [showPersonelPicker, setShowPersonelPicker] = useState(false);
  const [showOdemeHedefTypePicker, setShowOdemeHedefTypePicker] = useState(false);
  const [showKrediKartiPicker, setShowKrediKartiPicker] = useState(false);
  const [showExchangeRateBar, setShowExchangeRateBar] = useState(false);

  // Exchange rate state
  const [pendingExchangeData, setPendingExchangeData] = useState<{
    sourceCurrency: Currency;
    targetCurrency: Currency;
    sourceAmount: number;
  } | null>(null);

  // Search queries
  const [hesapSearchQuery, setHesapSearchQuery] = useState('');
  const [cariSearchQuery, setCariSearchQuery] = useState('');
  const [personelSearchQuery, setPersonelSearchQuery] = useState('');

  // Auto-open modal states
  const [pendingModal, setPendingModal] = useState<'category' | 'kredi_karti' | 'cari' | 'personel' | null>(null);
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
  const { data: musteriCariler } = useCariler('musteri');
  const { data: personelList } = usePersonelList();
  const createIslem = useCreateIslem();
  const createIleriTarihliIslem = useCreateIleriTarihliIslem();

  // Refs
  const amountInputRef = useRef<TextInput>(null);

  // Auto-select hesap (fallback)
  const hesapId = sourceHesapId || defaultHesapId || hesaplar?.[0]?.id;

  // Get selected entities - memoized to prevent unnecessary re-renders
  const selectedHesap = useMemo(() =>
    hesaplar?.find(h => h.id === hesapId),
    [hesaplar, hesapId]
  );
  const selectedSourceHesap = useMemo(() =>
    hesaplar?.find(h => h.id === sourceHesapId),
    [hesaplar, sourceHesapId]
  );
  const selectedHedefHesap = useMemo(() =>
    hesaplar?.find(h => h.id === hedefHesapId),
    [hesaplar, hedefHesapId]
  );

  // Cari listesi: cari modunda cari tipine göre, normal modda işlem tipine göre
  const carilerForType = useMemo(() => {
    if (isCariMode) {
      return defaultCariType === 'tedarikci' ? tedarikciCariler : musteriCariler;
    }
    // Normal mod: odeme için tedarikçi, tahsilat için müşteri
    return type === 'odeme' ? tedarikciCariler : musteriCariler;
  }, [isCariMode, defaultCariType, type, tedarikciCariler, musteriCariler]);

  const selectedCari = useMemo(() =>
    carilerForType?.find(c => c.id === cariId),
    [carilerForType, cariId]
  );
  const selectedPersonel = useMemo(() =>
    personelList?.find(p => p.id === personelId),
    [personelList, personelId]
  );

  // Filtered lists for search
  const filteredHesaplar = useMemo(() => {
    // Kaynak hesap seçimi için tüm hesaplar, hedef için kaynak hariç
    const list = hesapPickerTarget === 'source'
      ? (hesaplar || [])
      : (hesaplar?.filter(h => h.id !== hesapId) || []);
    if (!hesapSearchQuery.trim()) return list;
    const query = hesapSearchQuery.toLowerCase().trim();
    return list.filter(h => h.name.toLowerCase().includes(query));
  }, [hesaplar, hesapId, hesapSearchQuery, hesapPickerTarget]);

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

  // Kredi kartı hesapları
  const krediKartiHesaplari = useMemo(() => {
    return hesaplar?.filter(h => h.type === 'kredi_karti') || [];
  }, [hesaplar]);

  // Seçilen kredi kartı hesabı
  const selectedKrediKarti = useMemo(() =>
    hesaplar?.find(h => h.id === hedefHesapId && h.type === 'kredi_karti'),
    [hesaplar, hedefHesapId]
  );

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
        setSourceHesapId(null);
        setCariId(null);
        setPersonelId(null);
        setOdemeHedefType(null);
        setHesapPickerTarget('hedef');
        setHesapSearchQuery('');
        setCariSearchQuery('');
        setPersonelSearchQuery('');
        setPendingModal(null);
        setCategoryPickerOpen(false);
        setCategorySkipped(false);
        setSelectedCategoryType(null);
        setShowExchangeRateBar(false);
        setPendingExchangeData(null);
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
        setType('personel_gider_tab');
        // Personel modunda hesap otomatik seçilmesin (ödeme/tahsilat için kullanıcı seçecek)
      }
      // Cari modu için varsayılan tip ve cari ayarla
      else if (isCariMode && defaultCariId) {
        setCariId(defaultCariId);
        // Cari tipine göre varsayılan işlem tipi
        if (defaultCariType === 'tedarikci') {
          setType('alis');
          setOdemeHedefType('tedarikci');
        } else {
          setType('satis');
        }
        // Cari modunda hesap otomatik seçilmesin (ödeme/tahsilat için kullanıcı seçecek)
      } else {
        // Normal mod - kaynak hesap ayarla
        if (hesaplar && hesaplar.length > 0) {
          setSourceHesapId(defaultHesapId || hesaplar[0].id);
        }
        setType(defaultType);
      }
    }
  }, [visible, isPersonelMode, defaultPersonelId, isCariMode, defaultCariId, defaultCariType, defaultType, hesaplar, defaultHesapId]);

  // Reset cariId and personelId when type changes (only in normal mode)
  // NOT: kategoriId, selectedCategoryType ve categorySkipped sıfırlanmaz - seçilen kategori sekmeler arası kalır
  useEffect(() => {
    if (!isCariMode && !isPersonelMode) {
      setCariId(null);
      setPersonelId(null);
      setOdemeHedefType(null);
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
    if (!isValidAmount(amount)) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    // Auto-open modals for missing required data (before validation alerts)
    // Normal Mode
    if (!isCariMode && !isPersonelMode) {
      if (type === 'transfer' && !hedefHesapId) {
        setHesapPickerTarget('hedef');
        setShowHesapPicker(true);
        return;
      }

      // Ödeme için sıralı modal akışı
      if (type === 'odeme') {
        // Önce ödeme türü seçilmeli
        if (!odemeHedefType) {
          setShowOdemeHedefTypePicker(true);
          return;
        }
        if (odemeHedefType === 'tedarikci') {
          if (!cariId) {
            // Kategori seçili değilse, cari seçildikten sonra kategori açılsın
            if (!kategoriId && !categorySkipped) {
              setPendingModal('category');
            }
            setShowCariPicker(true);
            return;
          }
          if (!kategoriId && !categorySkipped) {
            setCategoryPickerOpen(true);
            return;
          }
        } else if (odemeHedefType === 'staff') {
          if (!personelId) {
            // Kategori seçili değilse, personel seçildikten sonra kategori açılsın
            if (!kategoriId && !categorySkipped) {
              setPendingModal('category');
            }
            setShowPersonelPicker(true);
            return;
          }
          if (!kategoriId && !categorySkipped) {
            setCategoryPickerOpen(true);
            return;
          }
        } else if (odemeHedefType === 'kredi_karti') {
          if (!sourceHesapId) {
            setPendingModal('kredi_karti');
            setHesapPickerTarget('source');
            setShowHesapPicker(true);
            return;
          }
          if (!hedefHesapId) {
            setShowKrediKartiPicker(true);
            return;
          }
          // Kredi kartı ödemesi için kategori gerekmiyor
        }
        return;
      }

      // Tahsilat için sıralı modal akışı (müşteri → kategori)
      if (type === 'tahsilat') {
        if (!cariId) {
          // Kategori seçili değilse, cari seçildikten sonra kategori açılsın
          if (!kategoriId && !categorySkipped) {
            setPendingModal('category');
          }
          setShowCariPicker(true);
          return;
        }
        if (!kategoriId && !categorySkipped) {
          setCategoryPickerOpen(true);
          return;
        }
      }

      // Gelir/Gider için sadece kategori
      if (['gelir', 'gider'].includes(type) && !kategoriId && !categorySkipped) {
        setCategoryPickerOpen(true);
        return;
      }
    }

    // Cari Mode
    if (isCariMode) {
      // Ödeme ve Tahsilat için hesap + kategori gerekli
      if (type === 'odeme' || type === 'tahsilat') {
        if (!sourceHesapId) {
          // Kategori seçili değilse, hesap seçildikten sonra kategori açılsın
          if (!kategoriId && !categorySkipped) {
            setPendingModal('category');
          }
          setHesapPickerTarget('source');
          setShowHesapPicker(true);
          return;
        }
        if (!kategoriId && !categorySkipped) {
          setCategoryPickerOpen(true);
          return;
        }
      }
      // Alış, Satış, İadeler için sadece kategori gerekli
      if (['alis', 'satis', 'alis_iade', 'satis_iade'].includes(type) && !kategoriId && !categorySkipped) {
        setCategoryPickerOpen(true);
        return;
      }
    }

    // Personel Mode
    if (isPersonelMode) {
      if (['personel_odeme_tab', 'personel_tahsilat_tab'].includes(type)) {
        if (!sourceHesapId) {
          // Kategori seçili değilse, hesap seçildikten sonra kategori açılsın
          if (!kategoriId && !categorySkipped) {
            setPendingModal('category');
          }
          setHesapPickerTarget('source');
          setShowHesapPicker(true);
          return;
        }
        if (!kategoriId && !categorySkipped) {
          setCategoryPickerOpen(true);
          return;
        }
      }
      if (type === 'personel_gider_tab' && !kategoriId && !categorySkipped) {
        setCategoryPickerOpen(true);
        return;
      }
    }

    // Hesap kontrolü (modal açma logicinden sonra)
    // Alış/Satış/İade ve Personel Gider işlemlerinde hesap gerekmez
    // Ödeme için de hesap kontrolü burada yapılmaz (ödeme türüne göre değişir)
    const needsHesap = !['alis', 'satis', 'alis_iade', 'satis_iade', 'personel_gider_tab', 'odeme'].includes(type);
    if (needsHesap && !hesapId) {
      Alert.alert(t('common:status.error'), t('accounts:messages.noAccounts'));
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
      if (odemeHedefType === 'kredi_karti') {
        if (!sourceHesapId) {
          Alert.alert(t('common:status.error'), t('accounts:titles.selectAccount'));
          return;
        }
        if (!hedefHesapId) {
          Alert.alert(t('common:status.error'), t('accounts:titles.selectCreditCard'));
          return;
        }
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

    // Parse amount early for exchange rate check
    const parsedAmount = parseCurrency(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    // Cross-currency check for transfers
    // Use hesaplar array directly to avoid stale memoized values
    if (type === 'transfer' && hesapId && hedefHesapId) {
      const sourceAcc = hesaplar?.find(h => h.id === hesapId);
      const targetAcc = hesaplar?.find(h => h.id === hedefHesapId);
      const sourceCurr = sourceAcc?.currency || 'TRY';
      const targetCurr = targetAcc?.currency || 'TRY';
      if (isCrossCurrency(sourceCurr, targetCurr)) {
        setPendingExchangeData({
          sourceCurrency: sourceCurr as Currency,
          targetCurrency: targetCurr as Currency,
          sourceAmount: parsedAmount,
        });
        setShowExchangeRateBar(true);
        return;
      }
    }

    // Cross-currency check for ödeme/tahsilat (cari/personel balances are always TRY)
    // Use hesaplar array directly
    if (['odeme', 'tahsilat'].includes(type) && sourceHesapId) {
      const sourceAcc = hesaplar?.find(h => h.id === sourceHesapId);
      const sourceCurr = sourceAcc?.currency || 'TRY';
      if (isCrossCurrency(sourceCurr, 'TRY')) {
        setPendingExchangeData({
          sourceCurrency: sourceCurr as Currency,
          targetCurrency: 'TRY',
          sourceAmount: parsedAmount,
        });
        setShowExchangeRateBar(true);
        return;
      }
    }

    // Cross-currency check for cari mode ödeme/tahsilat
    if (isCariMode && ['odeme', 'tahsilat'].includes(type) && sourceHesapId) {
      const sourceAcc = hesaplar?.find(h => h.id === sourceHesapId);
      const sourceCurr = sourceAcc?.currency || 'TRY';
      if (isCrossCurrency(sourceCurr, 'TRY')) {
        setPendingExchangeData({
          sourceCurrency: sourceCurr as Currency,
          targetCurrency: 'TRY',
          sourceAmount: parsedAmount,
        });
        setShowExchangeRateBar(true);
        return;
      }
    }

    // Cross-currency check for personel mode ödeme/tahsilat
    if (isPersonelMode && ['personel_odeme_tab', 'personel_tahsilat_tab'].includes(type) && sourceHesapId) {
      const sourceAcc = hesaplar?.find(h => h.id === sourceHesapId);
      const sourceCurr = sourceAcc?.currency || 'TRY';
      if (isCrossCurrency(sourceCurr, 'TRY')) {
        setPendingExchangeData({
          sourceCurrency: sourceCurr as Currency,
          targetCurrency: 'TRY',
          sourceAmount: parsedAmount,
        });
        setShowExchangeRateBar(true);
        return;
      }
    }

    setIsSaving(true);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      // Determine actual type for API
      let apiType: string = type;
      if (type === 'odeme') {
        if (odemeHedefType === 'staff') {
          apiType = 'personel_odeme';
        } else if (odemeHedefType === 'kredi_karti') {
          apiType = 'transfer'; // Kredi kartına ödeme transfer olarak kaydedilir
        } else {
          apiType = 'cari_odeme';
        }
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
        } else if (odemeHedefType === 'kredi_karti') {
          // Kredi kartı ödemesi transfer olarak kaydedilir
          transactionData.hedef_hesap_id = hedefHesapId;
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
          scheduled_date: formatDateForDB(safeDate),
        });
      } else {
        // Normal işlem - tarih ve saat dahil
        await createIslem.mutateAsync({
          ...transactionData,
          date: formatDateTimeForDB(safeDate),
        });
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
    hesapId,
    amount,
    type,
    description,
    date,
    kategoriId,
    isScheduled,
    hedefHesapId,
    sourceHesapId,
    cariId,
    personelId,
    odemeHedefType,
    isCariMode,
    isPersonelMode,
    createIslem,
    createIleriTarihliIslem,
    onSuccess,
    handleDismiss,
    hesaplar,
  ]);

  // Handle exchange rate confirmation
  const handleExchangeRateConfirm = useCallback(async (exchangeRate: number, targetAmount: number) => {
    if (!pendingExchangeData) return;

    setShowExchangeRateBar(false);
    setIsSaving(true);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const parsedAmount = pendingExchangeData.sourceAmount;

      // Determine actual type for API
      let apiType: string = type;
      if (type === 'odeme') {
        if (odemeHedefType === 'staff') {
          apiType = 'personel_odeme';
        } else if (odemeHedefType === 'kredi_karti') {
          apiType = 'transfer';
        } else {
          apiType = 'cari_odeme';
        }
      }
      if (type === 'tahsilat') apiType = 'cari_tahsilat';
      if (type === 'alis') apiType = 'cari_alis';
      if (type === 'satis') apiType = 'cari_satis';
      if (type === 'alis_iade') apiType = 'cari_alis_iade';
      if (type === 'satis_iade') apiType = 'cari_satis_iade';
      if (type === 'personel_odeme_tab') apiType = 'personel_odeme';
      if (type === 'personel_gider_tab') apiType = 'personel_gider';
      if (type === 'personel_tahsilat_tab') apiType = 'personel_tahsilat';

      // Build transaction data with exchange rate info
      const needsHesapForData = !['alis', 'satis', 'alis_iade', 'satis_iade', 'personel_gider_tab'].includes(type);
      const transactionData: any = {
        type: apiType,
        amount: parsedAmount,
        description: description.trim() || null,
        hesap_id: needsHesapForData ? hesapId : null,
        kategori_id: kategoriId,
        // Exchange rate info
        source_currency: pendingExchangeData.sourceCurrency,
        target_currency: pendingExchangeData.targetCurrency,
        exchange_rate: exchangeRate,
      };

      // Add type-specific fields
      if (type === 'transfer') {
        transactionData.hedef_hesap_id = hedefHesapId;
      }
      if (type === 'odeme') {
        if (odemeHedefType === 'tedarikci') {
          transactionData.cari_id = cariId;
        } else if (odemeHedefType === 'kredi_karti') {
          transactionData.hedef_hesap_id = hedefHesapId;
        } else {
          transactionData.personel_id = personelId;
        }
      }
      if (type === 'tahsilat') {
        transactionData.cari_id = cariId;
      }
      if (type === 'alis' || type === 'satis' || type === 'alis_iade' || type === 'satis_iade') {
        transactionData.cari_id = cariId;
      }
      if (['personel_odeme_tab', 'personel_gider_tab', 'personel_tahsilat_tab'].includes(type)) {
        transactionData.personel_id = personelId;
      }

      if (isScheduled) {
        await createIleriTarihliIslem.mutateAsync({
          ...transactionData,
          scheduled_date: formatDateForDB(safeDate),
        });
      } else {
        await createIslem.mutateAsync({
          ...transactionData,
          date: formatDateTimeForDB(safeDate),
        });
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      setPendingExchangeData(null);
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
    pendingExchangeData,
    type,
    odemeHedefType,
    description,
    hesapId,
    kategoriId,
    hedefHesapId,
    cariId,
    personelId,
    isScheduled,
    date,
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
    kredi_karti_gider: t('transactions:tabs.kredi_karti_gider'),
    kredi_karti_odeme: t('transactions:tabs.kredi_karti_odeme'),
    kredi_karti_ekstre: t('transactions:tabs.kredi_karti_ekstre'),
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
    if (type === 'personel_tahsilat_tab') return 'gelir';
    if (type === 'personel_odeme_tab' || type === 'personel_gider_tab') return 'gider';
    return undefined;
  };
  // Kategori seçiliyse, seçim anındaki tipi kullan (sekme değişse bile görünür kalsın)
  const categoryType = selectedCategoryType || getCategoryType();

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
              {isToday(safeDate) ? t('common:date.today') : formatDateMedium(safeDate)}
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

        {/* Cari Modunda Ödeme/Tahsilat için Hesap Seçimi */}
        {isCariMode && (type === 'odeme' || type === 'tahsilat') && (
          <TouchableOpacity
            style={styles.sourceAccountRow}
            onPress={() => {
              setHesapPickerTarget('source');
              setShowHesapPicker(true);
            }}
          >
            <Wallet size={16} color={colors.textMuted} />
            <Text style={styles.sourceAccountText}>
              {selectedSourceHesap?.name || t('accounts:titles.selectAccount')}
            </Text>
            <ChevronDown size={16} color={colors.info} />
          </TouchableOpacity>
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

        {/* Personel Modunda Ödeme/Tahsilat için Hesap Seçimi */}
        {isPersonelMode && (type === 'personel_odeme_tab' || type === 'personel_tahsilat_tab') && (
          <TouchableOpacity
            style={styles.sourceAccountRow}
            onPress={() => {
              setHesapPickerTarget('source');
              setShowHesapPicker(true);
            }}
          >
            <Wallet size={16} color={colors.textMuted} />
            <Text style={styles.sourceAccountText}>
              {selectedSourceHesap?.name || t('accounts:titles.selectAccount')}
            </Text>
            <ChevronDown size={16} color={colors.info} />
          </TouchableOpacity>
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
                onPress={() => {
                  setHesapPickerTarget('hedef');
                  setShowHesapPicker(true);
                }}
              >
                <Text style={styles.targetAccountText}>
                  {selectedHedefHesap ? selectedHedefHesap.name : t('transactions:form.targetAccount')}
                </Text>
                <ChevronDown size={16} color={colors.info} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Ödeme: Tedarikçi/Personel/Kredi Kartı Seçimi (sadece normal modda) */}
        {type === 'odeme' && !isCariMode && (
          <>
            {/* Hedef Tip Seçici */}
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowOdemeHedefTypePicker(true)}
            >
              {odemeHedefType === 'tedarikci' ? (
                <Building2 size={18} color={colors.orange} />
              ) : odemeHedefType === 'staff' ? (
                <UserCheck size={18} color={colors.orange} />
              ) : odemeHedefType === 'kredi_karti' ? (
                <CreditCard size={18} color={colors.orange} />
              ) : (
                <ChevronDown size={18} color={colors.textMuted} />
              )}
              <Text style={[styles.pickerButtonText, !odemeHedefType && { color: colors.textMuted }]}>
                {odemeHedefType === 'tedarikci'
                  ? t('clients:transactionTitles.supplierPayment')
                  : odemeHedefType === 'staff'
                  ? t('staff:transactionTitles.payment')
                  : odemeHedefType === 'kredi_karti'
                  ? t('accounts:transactionTitles.creditCardPayment')
                  : t('transactions:form.selectPaymentType')}
              </Text>
              <ChevronDown size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Tedarikçi/Personel/Kredi Kartı Seçici - sadece tür seçiliyse göster */}
            {odemeHedefType === 'tedarikci' && (
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
            )}
            {odemeHedefType === 'staff' && (
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
            {odemeHedefType === 'kredi_karti' && (
              <>
                {/* Kaynak Hesap Seçici (kredi kartı ödemesi için) */}
                <TouchableOpacity
                  style={styles.sourceAccountRow}
                  onPress={() => {
                    setHesapPickerTarget('source');
                    setShowHesapPicker(true);
                  }}
                >
                  <Wallet size={16} color={colors.textMuted} />
                  <Text style={styles.sourceAccountText}>
                    {selectedSourceHesap?.name || t('accounts:titles.selectAccount')}
                  </Text>
                  <ArrowRight size={16} color={colors.info} />
                  <TouchableOpacity
                    style={styles.targetAccountButton}
                    onPress={() => setShowKrediKartiPicker(true)}
                  >
                    <Text style={styles.targetAccountText}>
                      {selectedKrediKarti ? selectedKrediKarti.name : t('accounts:titles.selectCreditCard')}
                    </Text>
                    <ChevronDown size={16} color={colors.info} />
                  </TouchableOpacity>
                </TouchableOpacity>
              </>
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
                      value={safeDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(event, selectedDate) => {
                        if (Platform.OS === 'android') {
                          if (event.type === 'set' && selectedDate) {
                            const newDate = new Date(safeDate);
                            newDate.setFullYear(selectedDate.getFullYear());
                            newDate.setMonth(selectedDate.getMonth());
                            newDate.setDate(selectedDate.getDate());
                            setDate(newDate);
                          }
                        } else if (selectedDate) {
                          const newDate = new Date(safeDate);
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
                      value={safeDate}
                      mode="time"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      is24Hour={true}
                      onChange={(event, selectedDate) => {
                        if (Platform.OS === 'android') {
                          if (event.type === 'set' && selectedDate) {
                            const newDate = new Date(safeDate);
                            newDate.setHours(selectedDate.getHours());
                            newDate.setMinutes(selectedDate.getMinutes());
                            setDate(newDate);
                          }
                        } else if (selectedDate) {
                          const newDate = new Date(safeDate);
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
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowHesapPicker(false); setHesapSearchQuery(''); setPendingModal(null); }}>
          <TouchableWithoutFeedback onPress={() => { setShowHesapPicker(false); setHesapSearchQuery(''); setPendingModal(null); }}>
            <View style={styles.bottomSheetOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
              <View style={styles.bottomSheetHeader}>
                <Text style={styles.bottomSheetTitle}>
                  {hesapPickerTarget === 'source' ? t('accounts:titles.selectAccount') : t('transactions:form.targetAccount')}
                </Text>
                <TouchableOpacity onPress={() => { setShowHesapPicker(false); setHesapSearchQuery(''); setPendingModal(null); }} style={styles.bottomSheetCloseBtn}>
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
                  const isSelected = hesapPickerTarget === 'source'
                    ? sourceHesapId === hesap.id
                    : hedefHesapId === hesap.id;
                  return (
                    <TouchableOpacity
                      key={hesap.id}
                      style={[styles.bottomSheetItem, isSelected && styles.bottomSheetItemSelected]}
                      onPress={() => {
                        if (hesapPickerTarget === 'source') {
                          setSourceHesapId(hesap.id);
                        } else {
                          setHedefHesapId(hesap.id);
                        }
                        setShowHesapPicker(false);
                        setHesapSearchQuery('');

                        // Handle sequential modal opening
                        if (pendingModal === 'category' && !kategoriId && !categorySkipped) {
                          setTimeout(() => {
                            setCategoryPickerOpen(true);
                            setPendingModal(null);
                          }, 250);
                        } else if (pendingModal === 'category') {
                          // Kategori zaten seçili, pending'i temizle
                          setPendingModal(null);
                        } else if (pendingModal === 'kredi_karti') {
                          setTimeout(() => {
                            setShowKrediKartiPicker(true);
                            setPendingModal(null);
                          }, 250);
                        }
                      }}
                    >
                      <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.infoLight }]}>
                        <Wallet size={20} color={colors.info} />
                      </View>
                      <Text style={[styles.bottomSheetItemText, isSelected && { color: colors.primary }]}>{hesap.name}</Text>
                      <Text style={[styles.bottomSheetItemBalance, isSelected && { color: colors.primary }]}>{formatCurrency(hesap.balance)}</Text>
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

      {/* Cari Picker Modal (for ödeme tedarikçi/tahsilat) - Bottom Sheet */}
      {showCariPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowCariPicker(false); setCariSearchQuery(''); setPendingModal(null); }}>
          <TouchableWithoutFeedback onPress={() => { setShowCariPicker(false); setCariSearchQuery(''); setPendingModal(null); }}>
            <View style={styles.bottomSheetOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
                  <View style={styles.bottomSheetHeader}>
                    <Text style={styles.bottomSheetTitle}>
                      {type === 'tahsilat' ? t('clients:transactionForm.selectCustomer') : t('clients:transactionForm.selectSupplier')}
                    </Text>
                    <TouchableOpacity onPress={() => { setShowCariPicker(false); setCariSearchQuery(''); setPendingModal(null); }} style={styles.bottomSheetCloseBtn}>
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

                        // Handle sequential modal opening
                        if (pendingModal === 'category' && !kategoriId && !categorySkipped) {
                          setTimeout(() => {
                            setCategoryPickerOpen(true);
                            setPendingModal(null);
                          }, 250);
                        } else if (pendingModal === 'category') {
                          // Kategori zaten seçili, pending'i temizle
                          setPendingModal(null);
                        }
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
                      <Text style={[styles.bottomSheetItemBalance, isSelected && { color: colors.primary }]}>{formatCurrency(cari.balance)}</Text>
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
                    // Otomatik tedarikçi picker aç
                    setTimeout(() => {
                      // Kategori seçili değilse, cari seçildikten sonra kategori açılsın
                      if (!kategoriId && !categorySkipped) {
                        setPendingModal('category');
                      }
                      setShowCariPicker(true);
                    }, 250);
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
                    // Otomatik personel picker aç
                    setTimeout(() => {
                      // Kategori seçili değilse, personel seçildikten sonra kategori açılsın
                      if (!kategoriId && !categorySkipped) {
                        setPendingModal('category');
                      }
                      setShowPersonelPicker(true);
                    }, 250);
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

                <TouchableOpacity
                  style={[styles.odemeTypeItem, odemeHedefType === 'kredi_karti' && styles.odemeTypeItemSelected]}
                  onPress={() => {
                    setOdemeHedefType('kredi_karti');
                    setCariId(null);
                    setPersonelId(null);
                    setHedefHesapId(null);
                    setShowOdemeHedefTypePicker(false);
                    // Otomatik kaynak hesap picker aç, sonra kredi kartı picker
                    setTimeout(() => {
                      setPendingModal('kredi_karti');
                      setHesapPickerTarget('source');
                      setShowHesapPicker(true);
                    }, 250);
                  }}
                >
                  <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.orangeLight }]}>
                    <CreditCard size={24} color={colors.orange} />
                  </View>
                  <View style={styles.odemeTypeContent}>
                    <Text style={[styles.odemeTypeTitle, odemeHedefType === 'kredi_karti' && { color: colors.orange }]}>
                      {t('accounts:transactionTitles.creditCardPayment')}
                    </Text>
                    <Text style={styles.odemeTypeSubtext}>{t('accounts:transactionDescriptions.creditCardPayment')}</Text>
                  </View>
                  {odemeHedefType === 'kredi_karti' && (
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

      {/* Kredi Kartı Picker Modal - Bottom Sheet */}
      {showKrediKartiPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowKrediKartiPicker(false)}>
          <TouchableWithoutFeedback onPress={() => setShowKrediKartiPicker(false)}>
            <View style={styles.bottomSheetOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.bottomSheetContent, { height: windowHeight * 0.5, paddingBottom: insets.bottom }]}>
                  <View style={styles.bottomSheetHeader}>
                    <Text style={styles.bottomSheetTitle}>{t('accounts:titles.selectCreditCard')}</Text>
                    <TouchableOpacity onPress={() => setShowKrediKartiPicker(false)} style={styles.bottomSheetCloseBtn}>
                      <X size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.bottomSheetList} contentContainerStyle={styles.bottomSheetListContent} keyboardShouldPersistTaps="handled">
                {krediKartiHesaplari.map((hesap) => {
                  const isSelected = hedefHesapId === hesap.id;
                  return (
                    <TouchableOpacity
                      key={hesap.id}
                      style={[styles.bottomSheetItem, isSelected && styles.bottomSheetItemSelected]}
                      onPress={() => {
                        setHedefHesapId(hesap.id);
                        setShowKrediKartiPicker(false);
                      }}
                    >
                      <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.orangeLight }]}>
                        <CreditCard size={20} color={colors.orange} />
                      </View>
                      <Text style={[styles.bottomSheetItemText, isSelected && { color: colors.primary }]}>{hesap.name}</Text>
                      <Text style={[styles.bottomSheetItemBalance, isSelected && { color: colors.primary }]}>{formatCurrency(hesap.balance)}</Text>
                      {isSelected && (
                        <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
                          <Check size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {krediKartiHesaplari.length === 0 && (
                  <View style={styles.emptySearchState}>
                    <CreditCard size={48} color={colors.textMuted} />
                    <Text style={styles.emptySearchText}>{t('accounts:messages.noCreditCards')}</Text>
                  </View>
                )}
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Personel Picker Modal - Bottom Sheet */}
      {showPersonelPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowPersonelPicker(false); setPersonelSearchQuery(''); setPendingModal(null); }}>
          <TouchableWithoutFeedback onPress={() => { setShowPersonelPicker(false); setPersonelSearchQuery(''); setPendingModal(null); }}>
            <View style={styles.bottomSheetOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
                  <View style={styles.bottomSheetHeader}>
                    <Text style={styles.bottomSheetTitle}>{t('staff:transactionForm.selectPersonel')}</Text>
                    <TouchableOpacity onPress={() => { setShowPersonelPicker(false); setPersonelSearchQuery(''); setPendingModal(null); }} style={styles.bottomSheetCloseBtn}>
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

                        // Handle sequential modal opening
                        if (pendingModal === 'category' && !kategoriId && !categorySkipped) {
                          setTimeout(() => {
                            setCategoryPickerOpen(true);
                            setPendingModal(null);
                          }, 250);
                        } else if (pendingModal === 'category') {
                          // Kategori zaten seçili, pending'i temizle
                          setPendingModal(null);
                        }
                      }}
                    >
                      <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.orangeLight }]}>
                        <UserCheck size={20} color={colors.orange} />
                      </View>
                      <Text style={[styles.bottomSheetItemText, isSelected && { color: colors.primary }]}>
                        {personel.first_name} {personel.last_name}
                      </Text>
                      <Text style={[styles.bottomSheetItemBalance, isSelected && { color: colors.primary }]}>{formatCurrency(personel.balance)}</Text>
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

      {/* Exchange Rate Bar */}
      {pendingExchangeData && (
        <ExchangeRateBar
          visible={showExchangeRateBar}
          onDismiss={() => {
            setShowExchangeRateBar(false);
            setPendingExchangeData(null);
          }}
          sourceAmount={pendingExchangeData.sourceAmount}
          sourceCurrency={pendingExchangeData.sourceCurrency}
          targetCurrency={pendingExchangeData.targetCurrency}
          onConfirm={handleExchangeRateConfirm}
        />
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
  bottomSheetItemContent: {
    flex: 1,
  },
  bottomSheetItemText: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  bottomSheetItemBalance: {
    fontSize: 16,
    color: colors.textSecondary,
    marginRight: 8,
  },
  bottomSheetItemSubtext: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
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
