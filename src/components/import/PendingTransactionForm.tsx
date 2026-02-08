/**
 * PendingTransactionForm
 *
 * QuickTransactionBar-style form for editing pending (skipped) transactions from import.
 * Pre-fills detected values and shows "Algılanamadı" badge for missing required fields.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
  X,
  ChevronDown,
  Building2,
  Users,
  Wallet,
  UserCheck,
  ArrowRight,
  Search,
  Check,
  AlertTriangle,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import DateTimePickerRN from '@react-native-community/datetimepicker';

import { Text, CategoryPicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { parseCurrency, formatCurrency } from '@/lib/currency';
import { formatDateTimeForDB, ensureValidDate } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import {
  useSavePendingAsIslem,
  useDismissPendingIslem,
  buildIslemFromPending,
} from '@/hooks/usePendingIslemler';
import { supabase } from '@/lib/supabase';
import type { PendingIslem, IslemType, KategoriType } from '@/types/database';

// Başlangıç bakiyesi dahil genişletilmiş işlem tipi
type ExtendedIslemType = IslemType | 'baslangic_bakiyesi';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// İşlem tipi seçenekleri - database IslemType değerleri
// Gruplandırılmış: Temel, Cari, Personel
// isCustomerVariant: cari_alis'in müşteri versiyonu için (müşteriden alış)
// isSpecial: özel işlem (işlem oluşturmaz, entity bakiyesi günceller)
type IslemTypeOption = {
  value: IslemType | 'baslangic_bakiyesi';
  labelKey: string;
  color: string;
  group: string;
  isCustomerVariant?: boolean;
  isSpecial?: boolean;
};
const ISLEM_TYPES: IslemTypeOption[] = [
  // Temel işlemler
  { value: 'gelir', labelKey: 'transactions:tabs.gelir', color: colors.success, group: 'basic' },
  { value: 'gider', labelKey: 'transactions:tabs.gider', color: colors.error, group: 'basic' },
  { value: 'transfer', labelKey: 'transactions:tabs.transfer', color: colors.info, group: 'basic' },
  // Başlangıç Bakiyesi - özel işlem (entity bakiyesi günceller)
  { value: 'baslangic_bakiyesi', labelKey: 'transactions:types.baslangic_bakiyesi', color: colors.warning, group: 'basic', isSpecial: true },
  // Cari işlemleri (Tedarikçi)
  { value: 'cari_alis', labelKey: 'transactions:types.cari_alis', color: colors.error, group: 'supplier' },
  { value: 'cari_alis_iade', labelKey: 'transactions:types.cari_alis_iade', color: colors.success, group: 'supplier' },
  { value: 'cari_odeme', labelKey: 'transactions:types.cari_odeme', color: colors.orange, group: 'supplier' },
  // Cari işlemleri (Müşteri)
  { value: 'cari_alis', labelKey: 'transactions:types.musteri_alis', color: colors.error, group: 'customer', isCustomerVariant: true },
  { value: 'cari_satis', labelKey: 'transactions:types.cari_satis', color: colors.success, group: 'customer' },
  { value: 'cari_satis_iade', labelKey: 'transactions:types.cari_satis_iade', color: colors.error, group: 'customer' },
  { value: 'cari_tahsilat', labelKey: 'transactions:types.cari_tahsilat', color: colors.primary, group: 'customer' },
  // Personel işlemleri
  { value: 'personel_gider', labelKey: 'transactions:types.personel_gider', color: colors.error, group: 'staff' },
  { value: 'personel_odeme', labelKey: 'transactions:types.personel_odeme', color: colors.orange, group: 'staff' },
  { value: 'personel_tahsilat', labelKey: 'transactions:types.personel_tahsilat', color: colors.primary, group: 'staff' },
  { value: 'personel_satis', labelKey: 'transactions:types.personel_satis', color: colors.success, group: 'staff' },
];

export interface PendingTransactionFormProps {
  visible: boolean;
  onDismiss: () => void;
  pendingIslem: PendingIslem | null;
  onSuccess?: () => void;
}

export function PendingTransactionForm({
  visible,
  onDismiss,
  pendingIslem,
  onSuccess,
}: PendingTransactionFormProps) {
  const { t } = useTranslation(['transactions', 'common', 'settings', 'accounts', 'clients', 'staff']);
  const { formatDateMedium, locale } = useDateFormat();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const windowHeight = Dimensions.get('window').height;

  // Data hooks
  const { data: hesaplar } = useHesaplar();
  const { data: tedarikciCariler } = useCariler('tedarikci');
  const { data: musteriCariler } = useCariler('musteri');
  const { data: personelList } = usePersonelList();

  // Mutations
  const savePendingAsIslem = useSavePendingAsIslem();
  const dismissPending = useDismissPendingIslem();

  // Form state
  const [type, setType] = useState<ExtendedIslemType>('gider');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [hesapId, setHesapId] = useState<string | null>(null);
  const [hedefHesapId, setHedefHesapId] = useState<string | null>(null);
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [cariId, setCariId] = useState<string | null>(null);
  const [personelId, setPersonelId] = useState<string | null>(null);

  // Track if customer variant of cari_alis is selected (müşteriden alış)
  const [isCustomerVariantSelected, setIsCustomerVariantSelected] = useState(false);

  // Picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showHesapPicker, setShowHesapPicker] = useState(false);
  const [showHedefHesapPicker, setShowHedefHesapPicker] = useState(false);
  const [showCariPicker, setShowCariPicker] = useState(false);
  const [showPersonelPicker, setShowPersonelPicker] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  // Search states
  const [hesapSearch, setHesapSearch] = useState('');
  const [cariSearch, setCariSearch] = useState('');
  const [personelSearch, setPersonelSearch] = useState('');

  // Loading state
  const [isSaving, setIsSaving] = useState(false);

  // Animation
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(100)).current;
  const isAnimatingRef = useRef(false);

  // Keyboard
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Refs
  const amountInputRef = useRef<TextInput>(null);

  // Memoized safe date
  const safeDate = useMemo(() => ensureValidDate(date), [date]);

  // Initialize form when pendingIslem changes
  useEffect(() => {
    if (pendingIslem && visible) {
      const raw = pendingIslem.raw_data;
      const corrections = pendingIslem.corrections || {};

      // Type
      const mappedType = (corrections.type || raw.mappedType || 'gider') as IslemType;
      setType(mappedType);

      // Amount
      const amountVal = corrections.amount ?? raw.amount;
      setAmount(amountVal?.toString() || '');

      // Description
      setDescription(corrections.description ?? raw.description ?? '');

      // Date
      const dateStr = corrections.date ?? raw.date;
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          setDate(parsed);
        }
      }

      // IDs from corrections
      setHesapId(corrections.hesap_id ?? null);
      setHedefHesapId(corrections.hedef_hesap_id ?? null);
      setKategoriId(corrections.kategori_id ?? null);
      setCariId(corrections.cari_id ?? null);
      setPersonelId(corrections.personel_id ?? null);
    }
  }, [pendingIslem, visible]);

  // Reset form
  const resetForm = useCallback(() => {
    setType('gider');
    setAmount('');
    setDescription('');
    setDate(new Date());
    setHesapId(null);
    setHedefHesapId(null);
    setKategoriId(null);
    setCariId(null);
    setPersonelId(null);
    setIsCustomerVariantSelected(false);
    setHesapSearch('');
    setCariSearch('');
    setPersonelSearch('');
  }, []);

  // Keyboard listeners
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleShow = (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates.height);
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
      resetForm();
      onDismiss();
    });
  }, [animateClose, resetForm, onDismiss]);

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

  // Check if a field was detected from import
  const isDetected = useCallback(
    (field: keyof PendingIslem['raw_data']) => {
      if (!pendingIslem) return false;
      const value = pendingIslem.raw_data[field];
      return value !== null && value !== undefined && value !== '';
    },
    [pendingIslem]
  );

  // Check if a field needs correction (missing required data)
  const needsCorrection = useMemo(() => {
    if (!pendingIslem) return { hesap: false, cari: false, personel: false };

    const skipReason = pendingIslem.skip_reason.toLowerCase();

    return {
      hesap: skipReason.includes('hesap') || skipReason.includes('account'),
      cari:
        skipReason.includes('cari') ||
        skipReason.includes('tedarik') ||
        skipReason.includes('müşteri') ||
        skipReason.includes('customer') ||
        skipReason.includes('supplier'),
      personel: skipReason.includes('personel') || skipReason.includes('staff'),
    };
  }, [pendingIslem]);

  // Get selected entities
  const selectedHesap = useMemo(
    () => hesaplar?.find((h) => h.id === hesapId),
    [hesaplar, hesapId]
  );

  const selectedHedefHesap = useMemo(
    () => hesaplar?.find((h) => h.id === hedefHesapId),
    [hesaplar, hedefHesapId]
  );

  // Combine cari lists
  const allCariler = useMemo(() => {
    const combined = [...(tedarikciCariler || []), ...(musteriCariler || [])];
    return combined.filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
  }, [tedarikciCariler, musteriCariler]);

  const selectedCari = useMemo(
    () => allCariler?.find((c) => c.id === cariId),
    [allCariler, cariId]
  );

  const selectedPersonel = useMemo(
    () => personelList?.find((p) => p.id === personelId),
    [personelList, personelId]
  );

  // Filtered lists for search
  const filteredHesaplar = useMemo(() => {
    if (!hesaplar || !hesapSearch.trim()) return hesaplar;
    const query = hesapSearch.toLowerCase();
    return hesaplar.filter((h) => h.name.toLowerCase().includes(query));
  }, [hesaplar, hesapSearch]);

  const filteredCariler = useMemo(() => {
    if (!allCariler || !cariSearch.trim()) return allCariler;
    const query = cariSearch.toLowerCase();
    return allCariler.filter((c) => c.name.toLowerCase().includes(query));
  }, [allCariler, cariSearch]);

  const filteredPersonel = useMemo(() => {
    if (!personelList || !personelSearch.trim()) return personelList;
    const query = personelSearch.toLowerCase();
    return personelList.filter((p) => {
      const fullName = `${p.first_name} ${p.last_name || ''}`.toLowerCase();
      return fullName.includes(query);
    });
  }, [personelList, personelSearch]);

  // Determine category type based on transaction type
  const categoryType: KategoriType | undefined = useMemo(() => {
    switch (type) {
      case 'gelir':
      case 'cari_tahsilat':
      case 'cari_satis':
      case 'cari_alis_iade': // İade from supplier = income for us
      case 'personel_tahsilat':
      case 'personel_satis':
        return 'gelir';
      case 'gider':
      case 'cari_odeme':
      case 'cari_alis':
      case 'cari_satis_iade': // İade to customer = expense for us
      case 'personel_gider':
      case 'personel_odeme':
      case 'transfer':
        return 'gider';
      default:
        return undefined;
    }
  }, [type]);

  // Get type color
  const getTypeColor = (typeValue: ExtendedIslemType, isCustomerVar: boolean = false) => {
    // For cari_alis, consider the variant
    if (typeValue === 'cari_alis') {
      const matchingType = ISLEM_TYPES.find((t) =>
        t.value === typeValue && t.isCustomerVariant === isCustomerVar
      );
      return matchingType?.color || colors.primary;
    }
    return ISLEM_TYPES.find((t) => t.value === typeValue)?.color || colors.primary;
  };

  // Handle amount change
  const handleAmountChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9,.]/g, '');
    setAmount(cleaned);
  }, []);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!pendingIslem) return;

    // Validate amount
    const parsedAmount = parseCurrency(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(t('common:status.error'), t('transactions:validation.invalidAmount'));
      return;
    }

    // =====================================================
    // BAŞLANGIÇ BAKİYESİ - Özel İşlem
    // İşlem oluşturmaz, entity bakiyesini günceller
    // =====================================================
    if (type === 'baslangic_bakiyesi') {
      // En az bir entity seçilmiş olmalı
      if (!hesapId && !cariId && !personelId) {
        Alert.alert(
          t('common:status.error'),
          'Başlangıç bakiyesi için hesap, cari veya personel seçmelisiniz.'
        );
        return;
      }

      setIsSaving(true);

      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      try {
        // İşaretli tutarı belirle: isExpense ise negatif, değilse pozitif
        const signedBalance = pendingIslem.raw_data.isExpense ? -parsedAmount : parsedAmount;

        // Seçilen entity'nin bakiyesini güncelle (mevcut işlem etkilerini koruyarak)
        if (hesapId) {
          // Hesap: initial_balance alanı var, mevcut bakiye ve işlem etkisini hesapla
          const { data: hesapData } = await supabase
            .from('hesaplar')
            .select('balance, initial_balance')
            .eq('id', hesapId)
            .single();
          const currentInitial = hesapData?.initial_balance ?? 0;
          const txEffect = (hesapData?.balance ?? 0) - currentInitial;
          const newBalance = signedBalance + txEffect;
          const { error } = await supabase
            .from('hesaplar')
            .update({ balance: newBalance, initial_balance: signedBalance })
            .eq('id', hesapId);
          if (error) throw error;
        }

        if (cariId) {
          // Cari: işlem etkilerini hesaplayarak gerçek başlangıç bakiyesini ayarla
          const { data: cariTxs } = await supabase
            .from('islemler').select('type, amount').eq('cari_id', cariId);
          let cariTxEffect = 0;
          cariTxs?.forEach(tx => {
            const amt = Number(tx.amount) || 0;
            if (tx.type === 'cari_alis') cariTxEffect -= amt;
            else if (tx.type === 'cari_odeme') cariTxEffect += amt;
            else if (tx.type === 'cari_satis') cariTxEffect += amt;
            else if (tx.type === 'cari_tahsilat') cariTxEffect -= amt;
            else if (tx.type === 'cari_alis_iade') cariTxEffect += amt;
            else if (tx.type === 'cari_satis_iade') cariTxEffect -= amt;
          });
          const newBalance = signedBalance + cariTxEffect;
          const { error } = await supabase
            .from('cariler')
            .update({ balance: newBalance })
            .eq('id', cariId);
          if (error) throw error;
        }

        if (personelId) {
          // Personel: işlem etkilerini hesaplayarak gerçek başlangıç bakiyesini ayarla
          const { data: personelTxs } = await supabase
            .from('islemler').select('type, amount').eq('personel_id', personelId);
          let personelTxEffect = 0;
          personelTxs?.forEach(tx => {
            const amt = Number(tx.amount) || 0;
            if (tx.type === 'personel_gider') personelTxEffect -= amt;
            else if (tx.type === 'personel_odeme') personelTxEffect += amt;
            else if (tx.type === 'personel_tahsilat') personelTxEffect -= amt;
            else if (tx.type === 'personel_satis') personelTxEffect += amt;
          });
          const newBalance = signedBalance + personelTxEffect;
          const { error } = await supabase
            .from('personel')
            .update({ balance: newBalance })
            .eq('id', personelId);
          if (error) throw error;
        }

        // Pending işlemi sil (dismiss)
        await dismissPending.mutateAsync(pendingIslem.id);

        // Invalidate caches for entities whose balances were directly updated
        if (hesapId) queryClient.invalidateQueries({ queryKey: ['hesaplar'] });
        if (cariId) queryClient.invalidateQueries({ queryKey: ['cariler'] });
        if (personelId) queryClient.invalidateQueries({ queryKey: ['personel'] });

        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        handleDismiss();
        onSuccess?.();
      } catch (error: any) {
        console.error('Error applying opening balance:', error);
        Alert.alert(t('common:status.error'), error.message || t('common:status.error'));
      } finally {
        setIsSaving(false);
      }
      return; // Başlangıç bakiyesi işlemi burada biter
    }

    // =====================================================
    // Normal İşlemler
    // =====================================================

    // Validate required fields based on type
    // personel_gider: Sadece personel bakiyesini günceller, hesap gerekmez
    // cari işlemleri ve iadeler: Cari bakiyesini günceller, hesap opsiyonel
    const hesapGerekmeyenTipler = ['cari_alis', 'cari_satis', 'cari_alis_iade', 'cari_satis_iade', 'personel_gider'];
    const needsHesap = !hesapGerekmeyenTipler.includes(type);
    if (needsHesap && !hesapId) {
      Alert.alert(t('common:status.error'), t('accounts:messages.noAccounts'));
      return;
    }

    if (type === 'transfer' && !hedefHesapId) {
      Alert.alert(t('common:status.error'), t('transactions:validation.selectTargetAccount'));
      return;
    }

    if (type === 'cari_odeme' && !cariId) {
      Alert.alert(t('common:status.error'), t('clients:transactionForm.selectSupplier'));
      return;
    }

    if (type === 'personel_odeme' && !personelId) {
      Alert.alert(t('common:status.error'), t('staff:transactionForm.selectPersonel'));
      return;
    }

    if (type === 'cari_tahsilat' && !cariId) {
      Alert.alert(t('common:status.error'), t('clients:transactionForm.selectCustomer'));
      return;
    }

    if (['cari_alis', 'cari_satis', 'cari_alis_iade', 'cari_satis_iade'].includes(type) && !cariId) {
      const isSupplierType = ['cari_alis', 'cari_alis_iade'].includes(type);
      const msg = isSupplierType
        ? t('clients:transactionForm.selectSupplier')
        : t('clients:transactionForm.selectCustomer');
      Alert.alert(t('common:status.error'), msg);
      return;
    }

    // Personel transactions need personel
    if (['personel_gider', 'personel_tahsilat', 'personel_satis'].includes(type) && !personelId) {
      Alert.alert(t('common:status.error'), t('staff:transactionForm.selectPersonel'));
      return;
    }

    setIsSaving(true);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const corrections = {
        type: type as IslemType, // baslangic_bakiyesi zaten yukarıda işlendi
        amount: parsedAmount,
        description: description || null,
        date: formatDateTimeForDB(safeDate),
        hesap_id: hesapId,
        hedef_hesap_id: hedefHesapId,
        kategori_id: kategoriId,
        cari_id: cariId,
        personel_id: personelId,
      };

      const islemData = buildIslemFromPending(pendingIslem, corrections);

      await savePendingAsIslem.mutateAsync({
        pendingId: pendingIslem.id,
        islemData,
      });

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      handleDismiss();
      onSuccess?.();
    } catch (error: any) {
      console.error('Error saving pending transaction:', error);
      Alert.alert(t('common:status.error'), error.message || t('common:status.error'));
    } finally {
      setIsSaving(false);
    }
  }, [
    pendingIslem,
    amount,
    type,
    hesapId,
    hedefHesapId,
    cariId,
    personelId,
    description,
    safeDate,
    kategoriId,
    savePendingAsIslem,
    dismissPending,
    handleDismiss,
    onSuccess,
    t,
  ]);

  // Handle skip
  const handleSkip = useCallback(async () => {
    if (!pendingIslem) return;

    Alert.alert(
      t('settings:dataImport.pendingForm.skipTitle'),
      t('settings:dataImport.pendingForm.skipMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.skip'),
          style: 'destructive',
          onPress: async () => {
            try {
              await dismissPending.mutateAsync(pendingIslem.id);
              if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              handleDismiss();
              onSuccess?.();
            } catch (error: any) {
              console.error('Error dismissing pending transaction:', error);
              Alert.alert(t('common:status.error'), error.message);
            }
          },
        },
      ]
    );
  }, [pendingIslem, dismissPending, handleDismiss, onSuccess, t]);

  // Not detected badge component
  const NotDetectedBadge = () => (
    <View style={styles.notDetectedBadge}>
      <AlertTriangle size={10} color={colors.warning} />
      <Text style={styles.notDetectedText}>
        {t('settings:dataImport.pendingForm.notDetected')}
      </Text>
    </View>
  );

  if (!visible || !pendingIslem) return null;

  const buttonColor = getTypeColor(type, isCustomerVariantSelected);
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
        {/* Skip reason banner */}
        <View style={styles.skipReasonBanner}>
          <AlertTriangle size={14} color={colors.warning} />
          <Text style={styles.skipReasonText} numberOfLines={1}>
            {t('settings:dataImport.labels.row')} {pendingIslem.row_number}: {pendingIslem.skip_reason}
          </Text>
          <TouchableOpacity onPress={handleDismiss} style={styles.closeButton}>
            <X size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Row 1: Date + Type */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Calendar size={18} color={colors.textMuted} />
            <Text style={styles.dateText}>
              {formatDateMedium(safeDate)}
            </Text>
            {!isDetected('date') && <NotDetectedBadge />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.typeButton, { borderColor: buttonColor }]}
            onPress={() => setShowTypePicker(true)}
          >
            <Text style={[styles.typeText, { color: buttonColor }]}>
              {(() => {
                // For cari_alis, check if customer variant is selected
                if (type === 'cari_alis') {
                  const matchingType = ISLEM_TYPES.find((item) =>
                    item.value === type && item.isCustomerVariant === isCustomerVariantSelected
                  );
                  return matchingType?.labelKey ? t(matchingType.labelKey) : type;
                }
                // For other types, just find by value
                const matchingType = ISLEM_TYPES.find((item) => item.value === type);
                return matchingType?.labelKey ? t(matchingType.labelKey) : type;
              })()}
            </Text>
            <ChevronDown size={16} color={buttonColor} />
          </TouchableOpacity>
        </View>

        {/* Hesap Picker */}
        <TouchableOpacity
          style={[
            styles.pickerButton,
            needsCorrection.hesap && !hesapId && styles.pickerButtonWarning,
          ]}
          onPress={() => setShowHesapPicker(true)}
        >
          <Wallet size={18} color={selectedHesap ? colors.primary : colors.textMuted} />
          <Text style={[styles.pickerButtonText, !selectedHesap && { color: colors.textMuted }]}>
            {selectedHesap?.name || t('transactions:form.accountPlaceholder')}
          </Text>
          {needsCorrection.hesap && !hesapId && <NotDetectedBadge />}
          <ChevronDown size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Hedef Hesap - only for transfer */}
        {type === 'transfer' && (
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowHedefHesapPicker(true)}
          >
            <ArrowRight size={18} color={colors.info} />
            <Text style={[styles.pickerButtonText, !selectedHedefHesap && { color: colors.textMuted }]}>
              {selectedHedefHesap?.name || t('transactions:form.targetAccount')}
            </Text>
            <ChevronDown size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Cari Picker - for cari transactions and başlangıç bakiyesi */}
        {['cari_odeme', 'cari_tahsilat', 'cari_alis', 'cari_satis', 'cari_alis_iade', 'cari_satis_iade', 'baslangic_bakiyesi'].includes(type) && (
          <TouchableOpacity
            style={[
              styles.pickerButton,
              needsCorrection.cari && !cariId && styles.pickerButtonWarning,
            ]}
            onPress={() => setShowCariPicker(true)}
          >
            {/* Customer types: cari_satis, cari_satis_iade, cari_tahsilat, OR cari_alis with customer variant */}
            {['cari_satis', 'cari_satis_iade', 'cari_tahsilat'].includes(type) || (type === 'cari_alis' && isCustomerVariantSelected) ? (
              <Users size={18} color={selectedCari ? colors.primary : colors.textMuted} />
            ) : (
              <Building2 size={18} color={selectedCari ? colors.orange : colors.textMuted} />
            )}
            <Text style={[styles.pickerButtonText, !selectedCari && { color: colors.textMuted }]}>
              {selectedCari?.name ||
                (['cari_satis', 'cari_satis_iade', 'cari_tahsilat'].includes(type) || (type === 'cari_alis' && isCustomerVariantSelected)
                  ? t('clients:transactionForm.selectCustomer')
                  : t('clients:transactionForm.selectSupplier'))}
            </Text>
            {needsCorrection.cari && !cariId && <NotDetectedBadge />}
            <ChevronDown size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Personel Picker - for personel transactions and başlangıç bakiyesi */}
        {['personel_gider', 'personel_odeme', 'personel_tahsilat', 'personel_satis', 'baslangic_bakiyesi'].includes(type) && (
          <TouchableOpacity
            style={[
              styles.pickerButton,
              needsCorrection.personel && !personelId && styles.pickerButtonWarning,
            ]}
            onPress={() => setShowPersonelPicker(true)}
          >
            <UserCheck size={18} color={selectedPersonel ? colors.success : colors.textMuted} />
            <Text style={[styles.pickerButtonText, !selectedPersonel && { color: colors.textMuted }]}>
              {selectedPersonel
                ? `${selectedPersonel.first_name} ${selectedPersonel.last_name || ''}`.trim()
                : t('staff:transactionForm.selectPersonel')}
            </Text>
            {needsCorrection.personel && !personelId && <NotDetectedBadge />}
            <ChevronDown size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Category Picker */}
        {categoryType && (
          <View style={styles.categoryWrapper}>
            <CategoryPicker
              value={kategoriId}
              onChange={setKategoriId}
              type={categoryType}
              label=""
              placeholder={t('common:select.selectCategory')}
              open={categoryPickerOpen}
              onOpenChange={setCategoryPickerOpen}
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

          <TouchableOpacity
            style={styles.skipButtonSmall}
            onPress={handleSkip}
          >
            <Text style={styles.skipButtonText}>{t('common:buttons.skip')}</Text>
          </TouchableOpacity>

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
              {isSaving ? '...' : t('common:buttons.save')}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <Modal visible transparent animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowDatePicker(false)}>
            <View style={styles.pickerBackdrop}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerTitle}>{t('transactions:form.dateTime')}</Text>
                  <DateTimePickerRN
                    value={safeDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selectedDate) => {
                      if (Platform.OS === 'android') {
                        setShowDatePicker(false);
                        if (event.type === 'set' && selectedDate) {
                          setDate(selectedDate);
                        }
                      } else if (selectedDate) {
                        setDate(selectedDate);
                      }
                    }}
                    locale={locale}
                    textColor={colors.text}
                    themeVariant="light"
                    style={styles.datePickerStyle}
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

      {/* Type Picker Modal */}
      {showTypePicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowTypePicker(false)}>
          <TouchableWithoutFeedback onPress={() => setShowTypePicker(false)}>
            <View style={styles.bottomSheetOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.bottomSheetContent, { height: windowHeight * 0.75, paddingBottom: insets.bottom }]}>
                  <View style={styles.bottomSheetHeader}>
                    <Text style={styles.bottomSheetTitle}>{t('transactions:titles.selectType')}</Text>
                    <TouchableOpacity onPress={() => setShowTypePicker(false)} style={styles.bottomSheetCloseBtn}>
                      <X size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    style={styles.bottomSheetList}
                    contentContainerStyle={styles.typeListContent}
                    showsVerticalScrollIndicator={false}
                  >
                    {/* Temel İşlemler */}
                    <Text style={styles.typeGroupHeader}>{t('transactions:groups.basic')}</Text>
                    {ISLEM_TYPES.filter(item => item.group === 'basic').map((item) => {
                      const isSelected = type === item.value;
                      return (
                        <TouchableOpacity
                          key={item.value}
                          style={[styles.typeItem, isSelected && styles.typeItemSelected]}
                          onPress={() => {
                            setType(item.value);
                            setIsCustomerVariantSelected(false);
                            setShowTypePicker(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={styles.typeItemLeft}>
                            <View style={[styles.typeIconContainer, { backgroundColor: item.color + '20' }]}>
                              <View style={[styles.typeIconDot, { backgroundColor: item.color }]} />
                            </View>
                            <Text style={[styles.typeItemText, isSelected && { color: item.color, fontWeight: '600' }]}>
                              {t(item.labelKey)}
                            </Text>
                          </View>
                          {isSelected && (
                            <View style={[styles.checkIcon, { backgroundColor: item.color }]}>
                              <Check size={14} color="#FFFFFF" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}

                    {/* Tedarikçi İşlemleri */}
                    <Text style={styles.typeGroupHeader}>{t('transactions:groups.supplier')}</Text>
                    {ISLEM_TYPES.filter(item => item.group === 'supplier').map((item) => {
                      const isSelected = type === item.value && !isCustomerVariantSelected;
                      return (
                        <TouchableOpacity
                          key={item.value}
                          style={[styles.typeItem, isSelected && styles.typeItemSelected]}
                          onPress={() => {
                            setType(item.value);
                            setIsCustomerVariantSelected(false);
                            setShowTypePicker(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={styles.typeItemLeft}>
                            <View style={[styles.typeIconContainer, { backgroundColor: item.color + '20' }]}>
                              <Building2 size={20} color={item.color} />
                            </View>
                            <Text style={[styles.typeItemText, isSelected && { color: item.color, fontWeight: '600' }]}>
                              {t(item.labelKey)}
                            </Text>
                          </View>
                          {isSelected && (
                            <View style={[styles.checkIcon, { backgroundColor: item.color }]}>
                              <Check size={14} color="#FFFFFF" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}

                    {/* Müşteri İşlemleri */}
                    <Text style={styles.typeGroupHeader}>{t('transactions:groups.customer')}</Text>
                    {ISLEM_TYPES.filter(item => item.group === 'customer').map((item, index) => {
                      const isSelected = type === item.value && (item.isCustomerVariant === isCustomerVariantSelected || !item.isCustomerVariant);
                      return (
                        <TouchableOpacity
                          key={`customer-${item.value}-${index}`}
                          style={[styles.typeItem, isSelected && styles.typeItemSelected]}
                          onPress={() => {
                            setType(item.value);
                            setIsCustomerVariantSelected(item.isCustomerVariant === true);
                            setShowTypePicker(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={styles.typeItemLeft}>
                            <View style={[styles.typeIconContainer, { backgroundColor: item.color + '20' }]}>
                              <Users size={20} color={item.color} />
                            </View>
                            <Text style={[styles.typeItemText, isSelected && { color: item.color, fontWeight: '600' }]}>
                              {t(item.labelKey)}
                            </Text>
                          </View>
                          {isSelected && (
                            <View style={[styles.checkIcon, { backgroundColor: item.color }]}>
                              <Check size={14} color="#FFFFFF" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}

                    {/* Personel İşlemleri */}
                    <Text style={styles.typeGroupHeader}>{t('transactions:groups.staff')}</Text>
                    {ISLEM_TYPES.filter(item => item.group === 'staff').map((item) => {
                      const isSelected = type === item.value;
                      return (
                        <TouchableOpacity
                          key={item.value}
                          style={[styles.typeItem, isSelected && styles.typeItemSelected]}
                          onPress={() => {
                            setType(item.value);
                            setIsCustomerVariantSelected(false);
                            setShowTypePicker(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={styles.typeItemLeft}>
                            <View style={[styles.typeIconContainer, { backgroundColor: item.color + '20' }]}>
                              <UserCheck size={20} color={item.color} />
                            </View>
                            <Text style={[styles.typeItemText, isSelected && { color: item.color, fontWeight: '600' }]}>
                              {t(item.labelKey)}
                            </Text>
                          </View>
                          {isSelected && (
                            <View style={[styles.checkIcon, { backgroundColor: item.color }]}>
                              <Check size={14} color="#FFFFFF" />
                            </View>
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

      {/* Hesap Picker Modal */}
      {showHesapPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowHesapPicker(false); setHesapSearch(''); }}>
          <TouchableWithoutFeedback onPress={() => { setShowHesapPicker(false); setHesapSearch(''); }}>
            <View style={styles.bottomSheetOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
                  <View style={styles.bottomSheetHeader}>
                    <Text style={styles.bottomSheetTitle}>{t('transactions:form.accountPlaceholder')}</Text>
                    <TouchableOpacity onPress={() => { setShowHesapPicker(false); setHesapSearch(''); }} style={styles.bottomSheetCloseBtn}>
                      <X size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.searchContainer}>
                    <Search size={20} color={colors.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder={t('common:search.searchPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      value={hesapSearch}
                      onChangeText={setHesapSearch}
                      autoCorrect={false}
                    />
                    {hesapSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setHesapSearch('')}>
                        <X size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <ScrollView style={styles.bottomSheetList} contentContainerStyle={styles.bottomSheetListContent} keyboardShouldPersistTaps="handled">
                    {filteredHesaplar?.map((hesap) => {
                      const isSelected = hesapId === hesap.id;
                      return (
                        <TouchableOpacity
                          key={hesap.id}
                          style={[styles.bottomSheetItem, isSelected && styles.bottomSheetItemSelected]}
                          onPress={() => {
                            setHesapId(hesap.id);
                            setShowHesapPicker(false);
                            setHesapSearch('');
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
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Hedef Hesap Picker Modal */}
      {showHedefHesapPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowHedefHesapPicker(false); setHesapSearch(''); }}>
          <TouchableWithoutFeedback onPress={() => { setShowHedefHesapPicker(false); setHesapSearch(''); }}>
            <View style={styles.bottomSheetOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
                  <View style={styles.bottomSheetHeader}>
                    <Text style={styles.bottomSheetTitle}>{t('transactions:form.targetAccount')}</Text>
                    <TouchableOpacity onPress={() => { setShowHedefHesapPicker(false); setHesapSearch(''); }} style={styles.bottomSheetCloseBtn}>
                      <X size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.searchContainer}>
                    <Search size={20} color={colors.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder={t('common:search.searchPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      value={hesapSearch}
                      onChangeText={setHesapSearch}
                      autoCorrect={false}
                    />
                    {hesapSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setHesapSearch('')}>
                        <X size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <ScrollView style={styles.bottomSheetList} contentContainerStyle={styles.bottomSheetListContent} keyboardShouldPersistTaps="handled">
                    {filteredHesaplar?.filter(h => h.id !== hesapId).map((hesap) => {
                      const isSelected = hedefHesapId === hesap.id;
                      return (
                        <TouchableOpacity
                          key={hesap.id}
                          style={[styles.bottomSheetItem, isSelected && styles.bottomSheetItemSelected]}
                          onPress={() => {
                            setHedefHesapId(hesap.id);
                            setShowHedefHesapPicker(false);
                            setHesapSearch('');
                          }}
                        >
                          <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.infoLight }]}>
                            <ArrowRight size={20} color={colors.info} />
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
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Cari Picker Modal */}
      {showCariPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowCariPicker(false); setCariSearch(''); }}>
          <TouchableWithoutFeedback onPress={() => { setShowCariPicker(false); setCariSearch(''); }}>
            <View style={styles.bottomSheetOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
                  <View style={styles.bottomSheetHeader}>
                    <Text style={styles.bottomSheetTitle}>
                      {['cari_satis', 'cari_satis_iade', 'cari_tahsilat'].includes(type) || (type === 'cari_alis' && isCustomerVariantSelected)
                        ? t('clients:transactionForm.selectCustomer')
                        : t('clients:transactionForm.selectSupplier')}
                    </Text>
                    <TouchableOpacity onPress={() => { setShowCariPicker(false); setCariSearch(''); }} style={styles.bottomSheetCloseBtn}>
                      <X size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.searchContainer}>
                    <Search size={20} color={colors.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder={t('common:search.searchPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      value={cariSearch}
                      onChangeText={setCariSearch}
                      autoCorrect={false}
                    />
                    {cariSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setCariSearch('')}>
                        <X size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <ScrollView style={styles.bottomSheetList} contentContainerStyle={styles.bottomSheetListContent} keyboardShouldPersistTaps="handled">
                    {filteredCariler?.map((cari) => {
                      const isSelected = cariId === cari.id;
                      const isCustomerType = ['cari_satis', 'cari_satis_iade', 'cari_tahsilat'].includes(type) || (type === 'cari_alis' && isCustomerVariantSelected);
                      const iconColor = isCustomerType ? colors.primary : colors.orange;
                      const iconBgColor = isCustomerType ? colors.primaryLight : colors.orangeLight;
                      return (
                        <TouchableOpacity
                          key={cari.id}
                          style={[styles.bottomSheetItem, isSelected && styles.bottomSheetItemSelected]}
                          onPress={() => {
                            setCariId(cari.id);
                            setShowCariPicker(false);
                            setCariSearch('');
                          }}
                        >
                          <View style={[styles.bottomSheetItemIcon, { backgroundColor: iconBgColor }]}>
                            {isCustomerType ? (
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
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Personel Picker Modal */}
      {showPersonelPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowPersonelPicker(false); setPersonelSearch(''); }}>
          <TouchableWithoutFeedback onPress={() => { setShowPersonelPicker(false); setPersonelSearch(''); }}>
            <View style={styles.bottomSheetOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
                  <View style={styles.bottomSheetHeader}>
                    <Text style={styles.bottomSheetTitle}>{t('staff:transactionForm.selectPersonel')}</Text>
                    <TouchableOpacity onPress={() => { setShowPersonelPicker(false); setPersonelSearch(''); }} style={styles.bottomSheetCloseBtn}>
                      <X size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.searchContainer}>
                    <Search size={20} color={colors.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder={t('common:search.searchPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      value={personelSearch}
                      onChangeText={setPersonelSearch}
                      autoCorrect={false}
                    />
                    {personelSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setPersonelSearch('')}>
                        <X size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <ScrollView style={styles.bottomSheetList} contentContainerStyle={styles.bottomSheetListContent} keyboardShouldPersistTaps="handled">
                    {filteredPersonel?.map((p) => {
                      const isSelected = personelId === p.id;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.bottomSheetItem, isSelected && styles.bottomSheetItemSelected]}
                          onPress={() => {
                            setPersonelId(p.id);
                            setShowPersonelPicker(false);
                            setPersonelSearch('');
                          }}
                        >
                          <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.successLight }]}>
                            <UserCheck size={20} color={colors.success} />
                          </View>
                          <Text style={[styles.bottomSheetItemText, isSelected && { color: colors.primary }]}>
                            {`${p.first_name} ${p.last_name || ''}`.trim()}
                          </Text>
                          {isSelected && (
                            <View style={[styles.checkIcon, { backgroundColor: colors.success }]}>
                              <Check size={14} color="#FFFFFF" />
                            </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
  skipReasonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  skipReasonText: {
    flex: 1,
    fontSize: 12,
    color: colors.warning,
    fontWeight: '500',
  },
  closeButton: {
    padding: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
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
  },
  dateText: {
    fontSize: 14,
    color: colors.text,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeText: {
    fontSize: 14,
    fontWeight: '600',
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
  pickerButtonWarning: {
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningLight + '30',
  },
  pickerButtonText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  notDetectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningLight,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  notDetectedText: {
    fontSize: 10,
    color: colors.warning,
    fontWeight: '600',
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
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'left',
    paddingVertical: 8,
  },
  skipButtonSmall: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  skipButtonText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  saveButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 80,
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
  // Picker Modal Styles
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
  datePickerStyle: {
    height: 150,
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
  bottomSheetItemBalance: {
    fontSize: 16,
    color: colors.textSecondary,
    marginRight: 8,
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
  // Type Picker Styles (CategoryPicker-like)
  typeListContent: {
    padding: 16,
    paddingBottom: 32,
  },
  typeGroupHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  typeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: colors.surfaceLighter,
    borderRadius: 12,
    marginBottom: 8,
  },
  typeItemSelected: {
    backgroundColor: colors.primaryLight + '30',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  typeItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  typeIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  typeIconDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  typeItemText: {
    fontSize: 15,
    color: colors.text,
    flex: 1,
  },
});
