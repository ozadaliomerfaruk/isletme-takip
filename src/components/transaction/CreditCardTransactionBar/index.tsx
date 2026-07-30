import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Animated, TextInput, TouchableOpacity, TouchableWithoutFeedback, Platform, Keyboard, KeyboardEvent, Easing, Alert, StyleSheet } from 'react-native';
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
  Package,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';

import { Text, CategoryPicker, Modal } from '@/components/ui';
import { TransactionTypeTabs, TransactionType, getTransactionTypeColor } from '../TransactionTypeTabs';
import { colors } from '@/constants/colors';
import { TAB_BAR_HEIGHT, HIT_SLOP } from '@/constants/spacing';
import { Hesap, Islem, IslemType, IslemInsert, IleriTarihliIslemInsert, Urun, Currency } from '@/types/database';
import { parseCurrency, formatCurrency, isValidAmount, roundCurrency, cleanAmountInput, formatAmountForInput } from '@/lib/currency';
import { resolveIslemLegs } from '@/lib/crossCurrency';
import { formatDateForDB, formatDateTimeForDB, isToday } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { useCreateIslem, useCreateIslemWithUrun, useUpdateIslem } from '@/hooks/useIslemler';
import { useCreateIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import { searchMatchesTr } from '@/lib/turkishTextUtils';
import { supabase } from '@/lib/supabase';
import { usePickImage, useTakePhoto, useUploadIslemPhoto } from '@/hooks/useIslemPhoto';
import { useAuthContext } from '@/contexts/AuthContext';
import { PhotoButton } from '../PhotoButton';
import { PhotoViewerModal } from '../PhotoViewerModal';
import { ExchangeRateBar } from '../ExchangeRateBar';
import { UrunPickerModal } from '../QuickTransactionBar/components';
import type { UrunItem } from '../QuickTransactionBar/types';
import { useUrunler, useCreateUrun } from '@/hooks/useUrunler';
import { useSettings } from '@/hooks/useSettings';
import {
  classifyMutationError,
  getTransactionMutationMessageKey,
  MutationRetryPayloadChangedError,
} from '@/lib/errors';
import { usePermissions } from '@/hooks/usePermissions';
import {
  buildMutationFingerprint,
  isSameRegularCreate,
} from '@/lib/mutationIdentity';

import { CreditCardDatePicker } from './CreditCardDatePicker';
import { HesapPickerSheet, CariPickerSheet, PersonelPickerSheet, OdemeHedefTypePicker } from './CreditCardPickerSheets';
import { styles } from './styles';

type OdemeHedefType = 'tedarikci' | 'staff';
const PRODUCT_CREATE_PROBE_TIMEOUT_MS = 5000;

async function probeCreatedProductExpense(
  islemId: string,
  isletmeId: string,
  expected: Omit<IslemInsert, 'isletme_id'>,
): Promise<Islem | null> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    PRODUCT_CREATE_PROBE_TIMEOUT_MS,
  );

  try {
    const { data, error } = await supabase
      .from('islemler')
      .select('*')
      .eq('id', islemId)
      .eq('isletme_id', isletmeId)
      .abortSignal(controller.signal)
      .maybeSingle();

    if (error || !data) return null;
    if (!isSameRegularCreate(data as Islem, expected, isletmeId)) {
      throw new MutationRetryPayloadChangedError();
    }
    return data as Islem;
  } catch (error) {
    if (error instanceof MutationRetryPayloadChangedError) throw error;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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
  const {
    isOwner,
    canAccessModule,
    canCreate,
    canCreateTransactionType,
  } = usePermissions();
  const canCreateExpense = canCreateTransactionType('gider');
  const canCreateStatementPayment = canCreateTransactionType('transfer');
  const canCreateSupplierPayment = canCreateTransactionType('cari_odeme');
  const canCreatePersonelPayment = canCreateTransactionType('personel_odeme');
  const canCreatePayment =
    canCreateSupplierPayment || canCreatePersonelPayment;
  const canUseProducts =
    canCreateExpense
    && canAccessModule('urunler')
    && canCreate('urunler');
  const allowedTypes = useMemo<TransactionType[]>(() => {
    const result: TransactionType[] = [];
    if (canCreateExpense) result.push('kredi_karti_gider');
    if (canCreatePayment) result.push('kredi_karti_odeme');
    if (canCreateStatementPayment) result.push('kredi_karti_ekstre');
    return result;
  }, [
    canCreateExpense,
    canCreatePayment,
    canCreateStatementPayment,
  ]);

  // Form state
  const [type, setType] = useState<TransactionType>('kredi_karti_gider');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  // Ürün (yalnız kredi kartı HARCAMA'da) — ana bar ile aynı UrunPickerModal reuse
  const [urunItems, setUrunItems] = useState<UrunItem[]>([]);
  const [showUrunPicker, setShowUrunPicker] = useState(false);
  const [urunSearchQuery, setUrunSearchQuery] = useState('');
  const productExpenseMutationIdRef = useRef<string | null>(null);
  const productExpenseMutationFingerprintRef = useRef<string | null>(null);
  const hasProductExpense =
    type === 'kredi_karti_gider' && urunItems.length > 0;

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

  // Çapraz-kur: kart/hesap ile karşı tarafın para birimi farklıysa kur SORULUR.
  // (Eskiden bu bar'da tek satır kur kontrolü yoktu → tutar karşı tarafa 1:1
  // uygulanıp bakiye kalıcı bozuluyordu; kayıtta kur olmadığı için sonradan
  // düzeltmek de mümkün olmuyordu.)
  const [pendingExchange, setPendingExchange] = useState<{
    sourceCurrency: Currency;
    targetCurrency: Currency;
    sourceAmount: number;
  } | null>(null);
  const [showExchangeRateBar, setShowExchangeRateBar] = useState(false);

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
  const { data: hesaplar } = useHesaplar(
    false,
    false,
    canAccessModule('hesaplar'),
  );
  const { data: tedarikciCariler } = useCariler(
    'tedarikci',
    false,
    false,
    canCreateSupplierPayment,
  );
  const { data: personelList } = usePersonelList(
    false,
    false,
    canCreatePersonelPayment,
  );
  const createIslem = useCreateIslem();
  const createIslemWithUrun = useCreateIslemWithUrun();
  const updateIslem = useUpdateIslem();
  const createIleriTarihliIslem = useCreateIleriTarihliIslem();

  // Foto (fiş/makbuz) — ana bar ile aynı hook'lar
  const pickImage = usePickImage();
  const takePhoto = useTakePhoto();
  const uploadPhoto = useUploadIslemPhoto();
  const { isletme } = useAuthContext();

  const handlePickImage = useCallback(async () => {
    const uri = await pickImage.mutateAsync();
    if (uri) setPhotoUri(uri);
  }, [pickImage]);
  const handleTakePhoto = useCallback(async () => {
    const uri = await takePhoto.mutateAsync();
    if (uri) setPhotoUri(uri);
  }, [takePhoto]);
  const handleRemovePhoto = useCallback(() => setPhotoUri(null), []);
  const handleViewPhoto = useCallback(() => {
    if (photoUri) setShowPhotoViewer(true);
  }, [photoUri]);

  // Ürün — ana bar ile aynı hook'lar (reuse)
  const { data: urunler } = useUrunler(false, canUseProducts);
  const createUrun = useCreateUrun();
  const { currency: userCurrency } = useSettings();

  // Inline ürün oluşturma (aranan ürün yoksa oluştur + otomatik seç). Tam ekran /urunler/ekle
  // yolu (onAddFullProduct) burada VERİLMEZ — bu bar'da navigasyon/veri-kaybı karmaşasına
  // girmemek için; kullanıcı yeni ürünü inline oluşturur ya da mevcut ürünü seçer.
  const handleUrunCreateNew = useCallback(
    async (name: string): Promise<Urun | undefined> => {
      try {
        return await createUrun.mutateAsync({
          ad: name.trim(),
          birim: 'adet',
          kdv_orani: 0,
          alis_fiyati: 0,
          satis_fiyati: 0,
          currency: userCurrency as Currency,
        });
      } catch {
        return undefined;
      }
    },
    [createUrun, userCurrency]
  );

  const amountInputRef = useRef<TextInput>(null);

  const nakitHesaplar = useMemo(() => {
    return hesaplar?.filter(h => h.type !== 'kredi_karti') || [];
  }, [hesaplar]);

  const selectedSourceHesap = nakitHesaplar.find(h => h.id === sourceHesapId);
  const selectedCari = tedarikciCariler?.find(c => c.id === cariId);
  const selectedPersonel = personelList?.find(p => p.id === personelId);

  const filteredHesaplar = useMemo(() => {
    if (!hesapSearchQuery.trim()) return nakitHesaplar;
    return nakitHesaplar.filter(h => searchMatchesTr(h.name, hesapSearchQuery));
  }, [nakitHesaplar, hesapSearchQuery]);

  const filteredCariler = useMemo(() => {
    if (!tedarikciCariler) return [];
    if (!cariSearchQuery.trim()) return tedarikciCariler;
    return tedarikciCariler.filter(c => searchMatchesTr(c.name, cariSearchQuery));
  }, [tedarikciCariler, cariSearchQuery]);

  const filteredPersonel = useMemo(() => {
    if (!personelList) return [];
    if (!personelSearchQuery.trim()) return personelList;
    return personelList.filter(p =>
      searchMatchesTr(`${p.first_name} ${p.last_name}`, personelSearchQuery)
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
        setPhotoUri(null);
        setShowPhotoViewer(false);
        setUrunItems([]);
        setShowUrunPicker(false);
        setUrunSearchQuery('');
        productExpenseMutationIdRef.current = null;
        productExpenseMutationFingerprintRef.current = null;
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      const firstAllowedType = allowedTypes[0];
      if (!firstAllowedType) return;
      setType(firstAllowedType);
      setSourceHesapId(null);
    }
  }, [allowedTypes, visible]);

  useEffect(() => {
    if (!visible || type !== 'kredi_karti_odeme') return;

    if (odemeHedefType === 'tedarikci' && !canCreateSupplierPayment) {
      setOdemeHedefType('staff');
      setCariId(null);
    } else if (odemeHedefType === 'staff' && !canCreatePersonelPayment) {
      setOdemeHedefType('tedarikci');
      setPersonelId(null);
    }
  }, [
    canCreatePersonelPayment,
    canCreateSupplierPayment,
    odemeHedefType,
    type,
    visible,
  ]);

  useEffect(() => {
    setCariId(null);
    setPersonelId(null);
    setOdemeHedefType(
      canCreateSupplierPayment ? 'tedarikci' : 'staff',
    );
    // NOT: urunItems tür değişince TEMİZLENMEZ — kullanıcı sekme değiştirip geri gelince
    // ürünler durur (ana bar ile aynı UX). Kayıtta yalnız kredi_karti_gider'de stok
    // hareketi oluşur (aşağıdaki tip guard'ı); Ürün butonu da yalnız o tipte görünür.
  }, [canCreateSupplierPayment, type]);

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

  /**
   * Sekme tipini API tipine + bacak id'lerine + İKİ TARAFIN PARA BİRİMİNE çevirir.
   * Kayıt ve kur kontrolü aynı kaynaktan beslenmeli; ayrı hesaplanırsa biri kur
   * sorar diğeri başka bacağa yazar.
   */
  const resolveLegs = useCallback(() => {
    let apiType: IslemType;
    let hesapId: string | null = null;
    let hedefHesapId: string | null = null;
    let cariIdValue: string | null = null;
    let personelIdValue: string | null = null;

    if (type === 'kredi_karti_odeme') {
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
      // kredi_karti_gider (ve bilinmeyen) → kart hesabından gider
      apiType = 'gider';
      hesapId = creditCard.id;
    }

    const currencyOf = (id: string | null) =>
      id === creditCard.id ? creditCard.currency : hesaplar?.find((h) => h.id === id)?.currency;

    const legs = resolveIslemLegs(apiType, {
      hesapCurrency: currencyOf(hesapId),
      hedefHesapCurrency: currencyOf(hedefHesapId),
      cariCurrency: tedarikciCariler?.find((c) => c.id === cariIdValue)?.currency,
      personelCurrency: personelList?.find((p) => p.id === personelIdValue)?.currency,
    });

    return { apiType, hesapId, hedefHesapId, cariIdValue, personelIdValue, ...legs };
  }, [type, odemeHedefType, cariId, personelId, sourceHesapId, creditCard, hesaplar, tedarikciCariler, personelList]);

  /** Asıl kayıt. exchange verilirse source/target/exchange_rate üçlüsü DB'ye yazılır. */
  const persistIslem = useCallback(
    async (
      parsedAmount: number,
      exchange?: { sourceCurrency: Currency; targetCurrency: Currency; exchangeRate: number }
    ) => {
      if (isScheduled && hasProductExpense) {
        Alert.alert(
          t('transactions:validation.scheduledNoProductsTitle'),
          t('transactions:validation.scheduledNoProductsMessage'),
        );
        return;
      }

      setIsSaving(true);

      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      try {
        if (
          !hasProductExpense
          && productExpenseMutationFingerprintRef.current
        ) {
          throw new MutationRetryPayloadChangedError();
        }

        const { apiType, hesapId, hedefHesapId, cariIdValue, personelIdValue } = resolveLegs();

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
          const clientIslemId = hasProductExpense
            ? productExpenseMutationIdRef.current ?? Crypto.randomUUID()
            : null;
          if (clientIslemId) {
            productExpenseMutationIdRef.current = clientIslemId;
          }

          const islemData: Omit<IslemInsert, 'isletme_id'> = {
            ...(clientIslemId ? { id: clientIslemId } : {}),
            type: apiType,
            amount: parsedAmount,
            description: description.trim() || null,
            kategori_id: hasProductExpense ? null : kategoriId,
            hesap_id: hesapId,
            hedef_hesap_id: hedefHesapId,
            cari_id: cariIdValue,
            personel_id: personelIdValue,
            date: formatDateTimeForDB(date),
            ...(exchange
              ? {
                  source_currency: exchange.sourceCurrency,
                  target_currency: exchange.targetCurrency,
                  exchange_rate: exchange.exchangeRate,
                }
              : {}),
          };
          let newIslem: Islem;
          if (hasProductExpense && clientIslemId) {
            const items = urunItems.map((item) => ({
              urun_id: item.urunId,
              hareket_tipi: 'giris' as const,
              miktar: item.miktar,
              birim_fiyat: item.birimFiyat,
              kdv_orani: item.kdvOrani,
              aciklama: description.trim() || null,
            }));
            const fingerprint = buildMutationFingerprint({
              input: islemData,
              items,
            });
            if (
              productExpenseMutationFingerprintRef.current
              && productExpenseMutationFingerprintRef.current !== fingerprint
            ) {
              throw new MutationRetryPayloadChangedError();
            }
            productExpenseMutationFingerprintRef.current = fingerprint;

            try {
              newIslem = await createIslemWithUrun.mutateAsync({
                input: islemData,
                items,
              });
            } catch (rpcError) {
              if (
                classifyMutationError(rpcError) !== 'network_unknown'
                || !isletme?.id
              ) {
                throw rpcError;
              }

              const landed = await probeCreatedProductExpense(
                clientIslemId,
                isletme.id,
                islemData,
              );
              if (!landed) throw rpcError;
              newIslem = landed;
            }
          } else {
            newIslem = await createIslem.mutateAsync(islemData);
          }

          // Foto varsa yükle → photo_path set et (ana bar ile aynı akış; scheduled hariç)
          if (isOwner && photoUri && isletme?.id && newIslem?.id) {
            try {
              const photoPath = await uploadPhoto.mutateAsync({
                uri: photoUri,
                isletmeId: isletme.id,
                islemId: newIslem.id,
              });
              await updateIslem.mutateAsync({ id: newIslem.id, updates: { photo_path: photoPath } });
            } catch (photoError) {
              if (__DEV__) console.error('[PhotoUpload] Error:', photoError);
              Alert.alert(t('common:status.warning'), t('transactions:messages.photoUploadFailed'));
            }
          }
        }

        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        productExpenseMutationIdRef.current = null;
        productExpenseMutationFingerprintRef.current = null;
        onSuccess?.();
        handleDismiss();
      } catch (error) {
        if (__DEV__) {
          console.error('Transaction error:', error);
        }
        setIsSaving(false);
        const errorKind = classifyMutationError(error);
        // Bu sınıflarda finansal yazının başlamadığı kesindir; kullanıcı alanı
        // düzeltip yeni bir idempotency anahtarıyla yeniden deneyebilir.
        if (
          errorKind === 'permission'
          || errorKind === 'validation'
          || errorKind === 'network_not_sent'
        ) {
          productExpenseMutationIdRef.current = null;
          productExpenseMutationFingerprintRef.current = null;
        }
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        const messageKey = getTransactionMutationMessageKey(error, 'create');
        Alert.alert(
          t('common:status.error'),
          messageKey
            ? t(messageKey)
            : t('transactions:messages.saveFailed'),
        );
      }
    },
    [
      t, description, date, kategoriId, isScheduled, resolveLegs,
      createIslem, createIleriTarihliIslem, onSuccess, handleDismiss,
      isOwner, photoUri, uploadPhoto, updateIslem, isletme,
      urunItems, hasProductExpense, createIslemWithUrun,
    ]
  );

  const handleExchangeRateConfirm = useCallback(
    (exchangeRate: number) => {
      if (!pendingExchange) return;
      const { sourceCurrency, targetCurrency, sourceAmount } = pendingExchange;
      setShowExchangeRateBar(false);
      setPendingExchange(null);
      void persistIslem(sourceAmount, { sourceCurrency, targetCurrency, exchangeRate });
    },
    [pendingExchange, persistIslem]
  );

  const handleSave = useCallback(async () => {
    if (!isValidAmount(amount)) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    if (isScheduled && hasProductExpense) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(
        t('transactions:validation.scheduledNoProductsTitle'),
        t('transactions:validation.scheduledNoProductsMessage'),
      );
      return;
    }

    if ((type === 'kredi_karti_gider' || type === 'kredi_karti_odeme') && !kategoriId && !categorySkipped && !hasProductExpense) {
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

    const permissionApiType: IslemType =
      type === 'kredi_karti_odeme'
        ? odemeHedefType === 'tedarikci'
          ? 'cari_odeme'
          : 'personel_odeme'
        : type === 'kredi_karti_ekstre'
          ? 'transfer'
          : 'gider';
    const productModules = hasProductExpense
      ? (['urunler'] as const)
      : [];
    if (
      !allowedTypes.includes(type)
      || !canCreateTransactionType(permissionApiType, productModules)
      || (hasProductExpense && !canCreate('urunler'))
    ) {
      Alert.alert(
        t('common:status.error'),
        t('common:errors.permissionDenied'),
      );
      return;
    }

    const parsedAmount = roundCurrency(parseCurrency(amount));
    const legs = resolveLegs();

    // ÇAPRAZ-KUR: kart/hesap ile karşı taraf farklı para birimindeyse kur ZORUNLU.
    if (legs.isCross) {
      // İleri tarihli satırda kur SAKLANAMIYOR (ileri_tarihli_islemler tablosunda kur
      // kolonu yok) → planlama anında kur alsak bile kaybolurdu. Sessiz 1:1 yerine
      // kullanıcıyı açıkça engelle: bugün kaydetsin ya da aynı para biriminden hesap seçsin.
      if (isScheduled) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        Alert.alert(
          t('common:status.warning'),
          t('transactions:exchangeRate.scheduledCrossCurrencyBlocked')
        );
        return;
      }
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setPendingExchange({
        sourceCurrency: legs.sourceCurrency,
        targetCurrency: legs.targetCurrency,
        sourceAmount: parsedAmount,
      });
      setShowExchangeRateBar(true);
      return;
    }

    await persistIslem(parsedAmount);
  }, [
    t, amount, type, kategoriId, categorySkipped,
    isScheduled, sourceHesapId, cariId, personelId, odemeHedefType,
    allowedTypes, canCreate, canCreateTransactionType, hasProductExpense,
    resolveLegs, persistIslem,
  ]);

  const handleAmountChange = useCallback((text: string) => {
    // Merkezî temizleyici: locale'e göre binliği atar, ondalığı 2 haneye kısar ve tek
    // ayraç bırakır. Ham regex (birden çok ayraç + sınırsız ondalık) parseCurrency'nin
    // "3-ondalık" tuzağına düşüp tutarı ~1000x şişirebiliyordu.
    setAmount(cleanAmountInput(text));
  }, []);

  const handleScheduledToggle = useCallback(() => {
    if (!isScheduled && hasProductExpense) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(
        t('transactions:validation.scheduledNoProductsTitle'),
        t('transactions:validation.scheduledNoProductsMessage'),
      );
      return;
    }
    setIsScheduled((current) => !current);
  }, [hasProductExpense, isScheduled, t]);

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

  if (!visible || allowedTypes.length === 0) return null;

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

  // Hero tutar: uzun sayılarda fontu yumuşat (RN TextInput otomatik küçültmez)
  const amtFontSize = amount.length > 12 ? 22 : amount.length > 9 ? 26 : 30;

  // Ürün butonu: yalnızca ürün varsa VE kredi kartı HARCAMA tipinde (mal alımı)
  const hasUrunler = (urunler?.length ?? 0) > 0;
  const showUrunButton =
    canUseProducts
    && hasUrunler
    && type === 'kredi_karti_gider'
    && !isScheduled;

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
                <Text style={styles.creditLimitValue}>{formatCurrency(creditLimit, creditCard.currency)}</Text>
              </View>
              <View style={styles.creditLimitItem}>
                <Text style={styles.creditLimitLabel}>{t('accounts:creditCard.usedCredit')}</Text>
                <Text style={[styles.creditLimitValue, { color: colors.error }]}>{formatCurrency(usedCredit, creditCard.currency)}</Text>
              </View>
              <View style={styles.creditLimitItem}>
                <Text style={styles.creditLimitLabel}>{t('accounts:creditCard.availableCredit')}</Text>
                <Text style={[styles.creditLimitValue, { color: colors.success }]}>{formatCurrency(availableCredit, creditCard.currency)}</Text>
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
              onPress={handleScheduledToggle}
            >
              <Bell size={18} color={isScheduled ? colors.warning : colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleDismiss}
            hitSlop={HIT_SLOP.md}
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
              value={hasProductExpense ? null : kategoriId}
              disabled={hasProductExpense}
              disabledMessage={t('transactions:stock.categoryDisabledByProducts')}
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

        {/* Not/Açıklama + foto (fiş/makbuz) — tutar satırını ferahlatmak için foto sağa alındı */}
        <View style={localStyles.noteRow}>
          <TextInput
            style={[styles.descriptionInput, localStyles.noteInput]}
            placeholder={t('common:placeholders.enterNote')}
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            maxLength={500}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />

          <View style={localStyles.noteActions}>
            {isOwner && (
              <PhotoButton
                hasPhoto={!!photoUri}
                onPickImage={handlePickImage}
                onTakePhoto={handleTakePhoto}
                onRemovePhoto={handleRemovePhoto}
                onViewPhoto={handleViewPhoto}
                loading={pickImage.isPending || takePhoto.isPending}
                disabled={isSaving}
                size="small"
              />
            )}

            {/* Ürün butonu — yalnız kredi kartı harcamasında (ikon + adet rozeti) */}
            {showUrunButton && (
              <TouchableOpacity
                style={localStyles.urunButton}
                onPress={() => setShowUrunPicker(true)}
                disabled={isSaving}
                accessibilityRole="button"
                accessibilityLabel={t('transactions:stock.stockButton')}
              >
                <Package size={20} color={colors.primary} />
                {urunItems.length > 0 && (
                  <View style={localStyles.urunBadge}>
                    <Text style={localStyles.urunBadgeText}>{urunItems.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Amount + Save — HERO tutar (sağa hizalı + adaptif font) */}
        <View style={styles.amountRow}>
          {isScheduled && (
            <View style={styles.scheduledBellIcon}>
              <Bell size={20} color={colors.warning} />
            </View>
          )}

          <TextInput
            ref={amountInputRef}
            style={[styles.amountInput, { textAlign: 'right', fontSize: amtFontSize }]}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            value={amount}
            onChangeText={handleAmountChange}
            keyboardType="decimal-pad"
            maxLength={15}
          />

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
          allowedTypes={allowedTypes}
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
        visible={showCariPicker && canCreateSupplierPayment}
        onDismiss={handleCariPickerDismiss}
        searchQuery={cariSearchQuery}
        onSearchChange={setCariSearchQuery}
        filteredCariler={filteredCariler}
        selectedId={cariId}
        onSelect={handleCariSelect}
        t={t}
      />

      <PersonelPickerSheet
        visible={showPersonelPicker && canCreatePersonelPayment}
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
        allowedTypes={[
          ...(canCreateSupplierPayment ? ['tedarikci' as const] : []),
          ...(canCreatePersonelPayment ? ['staff' as const] : []),
        ]}
        t={t}
      />

      {/* Ürün seçici — yalnız kredi kartı harcamasında; ana bar ile aynı bileşen (reuse) */}
      <UrunPickerModal
        visible={showUrunPicker && canUseProducts && !isScheduled}
        onDismiss={() => {
          setShowUrunPicker(false);
          setUrunSearchQuery('');
        }}
        urunler={urunler || []}
        urunItems={urunItems}
        onUrunItemsChange={setUrunItems}
        searchQuery={urunSearchQuery}
        onSearchQueryChange={setUrunSearchQuery}
        onTotalChange={(total) => {
          // NOKTA yazmak yasak: alan cleanAmountInput'tan geçiyor ve locale ondalığı
          // dışındaki ayracı siler (TR'de "489.65" → "48965", 100x şişme).
          if (total > 0) setAmount(formatAmountForInput(roundCurrency(total)));
        }}
        currency={userCurrency}
        islemYonu="alis"
        onCreateNew={handleUrunCreateNew}
        creating={createUrun.isPending}
      />

      {/* Foto önizleme */}
      <PhotoViewerModal
        visible={showPhotoViewer}
        photoPath={photoUri}
        onClose={() => setShowPhotoViewer(false)}
      />

      {/* Çapraz-kur barı — ana bar ile AYNI bileşen (tek kur giriş dili) */}
      {pendingExchange && (
        <ExchangeRateBar
          visible={showExchangeRateBar}
          presentation="inline"
          onDismiss={() => {
            setShowExchangeRateBar(false);
            setPendingExchange(null);
            setIsSaving(false);
          }}
          sourceAmount={pendingExchange.sourceAmount}
          sourceCurrency={pendingExchange.sourceCurrency}
          targetCurrency={pendingExchange.targetCurrency}
          onConfirm={handleExchangeRateConfirm}
        />
      )}
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  noteInput: {
    flex: 1,
    marginBottom: 0,
  },
  noteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  urunButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 40,
    height: 40,
    paddingHorizontal: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  urunBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  urunBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
