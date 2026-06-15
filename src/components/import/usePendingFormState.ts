/**
 * usePendingFormState
 *
 * Manages all form state, initialization from pendingIslem,
 * keyboard handling, animation, and derived/filtered entity lists.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  TextInput,
  Platform,
  Keyboard,
  KeyboardEvent,
  Easing,
} from 'react-native';
import { roundCurrency } from '@/lib/currency';
import { ensureValidDate } from '@/lib/date';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import type { PendingIslem, IslemType, KategoriType } from '@/types/database';
import type { ExtendedIslemType } from './PendingTransactionForm.types';

export interface PendingFormStateOptions {
  pendingIslem: PendingIslem | null;
  visible: boolean;
  onDismiss: () => void;
}

export function usePendingFormState({ pendingIslem, visible, onDismiss }: PendingFormStateOptions) {
  // Data hooks
  const { data: hesaplar } = useHesaplar();
  const { data: tedarikciCariler } = useCariler('tedarikci');
  const { data: musteriCariler } = useCariler('musteri');
  const { data: personelList } = usePersonelList();

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
  const [isCustomerVariantSelected, setIsCustomerVariantSelected] = useState(false);

  // Picker visibility states
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

      setType((corrections.type || raw.mappedType || 'gider') as IslemType);

      const amountVal = corrections.amount ?? raw.amount;
      // Tutar 3+ ondalık olabilir (OCR); 2 ondalığa yuvarla ki parseCurrency TR
      // locale'de noktayı binlik ayracı sanıp ~1000x şişirmesin.
      setAmount(amountVal != null ? roundCurrency(amountVal).toString() : '');

      setDescription(corrections.description ?? raw.description ?? '');

      const dateStr = corrections.date ?? raw.date;
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          setDate(parsed);
        }
      }

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

  // Check which fields need correction
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

  // Selected entities
  const selectedHesap = useMemo(
    () => hesaplar?.find((h) => h.id === hesapId),
    [hesaplar, hesapId]
  );

  const selectedHedefHesap = useMemo(
    () => hesaplar?.find((h) => h.id === hedefHesapId),
    [hesaplar, hedefHesapId]
  );

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

  // Category type based on transaction type
  const categoryType: KategoriType | undefined = useMemo(() => {
    switch (type) {
      case 'gelir':
      case 'cari_tahsilat':
      case 'cari_satis':
      case 'cari_alis_iade':
      case 'personel_tahsilat':
      case 'personel_satis':
        return 'gelir';
      case 'gider':
      case 'cari_odeme':
      case 'cari_alis':
      case 'cari_satis_iade':
      case 'personel_gider':
      case 'personel_odeme':
      case 'transfer':
        return 'gider';
      default:
        return undefined;
    }
  }, [type]);

  // Amount change handler
  const handleAmountChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9,.]/g, '');
    setAmount(cleaned);
  }, []);

  return {
    // Form state
    type, setType,
    amount, setAmount,
    description, setDescription,
    date, setDate,
    hesapId, setHesapId,
    hedefHesapId, setHedefHesapId,
    kategoriId, setKategoriId,
    cariId, setCariId,
    personelId, setPersonelId,
    isCustomerVariantSelected, setIsCustomerVariantSelected,

    // Picker visibility
    showDatePicker, setShowDatePicker,
    showTypePicker, setShowTypePicker,
    showHesapPicker, setShowHesapPicker,
    showHedefHesapPicker, setShowHedefHesapPicker,
    showCariPicker, setShowCariPicker,
    showPersonelPicker, setShowPersonelPicker,
    categoryPickerOpen, setCategoryPickerOpen,

    // Search
    hesapSearch, setHesapSearch,
    cariSearch, setCariSearch,
    personelSearch, setPersonelSearch,

    // Loading
    isSaving, setIsSaving,

    // Animation
    opacity,
    translateY,

    // Keyboard
    keyboardHeight,
    isKeyboardVisible,

    // Refs
    amountInputRef,

    // Derived
    safeDate,
    categoryType,
    needsCorrection,
    isDetected,
    selectedHesap,
    selectedHedefHesap,
    allCariler,
    selectedCari,
    selectedPersonel,
    filteredHesaplar,
    filteredCariler,
    filteredPersonel,

    // Handlers
    handleAmountChange,
    handleDismiss,
    handleBackdropPress,
    resetForm,
  };
}
