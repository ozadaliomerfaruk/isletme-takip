import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Animated,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
  Keyboard,
  KeyboardEvent,
  Easing,
  Alert,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Wallet, CreditCard, ArrowRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Text, Modal } from '@/components/ui';
import { TransactionType, getTransactionTypeColor } from '../TransactionTypeTabs';
import { colors } from '@/constants/colors';
import { TAB_BAR_HEIGHT, HIT_SLOP } from '@/constants/spacing';
import {
  Hesap,
  Islem,
  IslemType,
  IslemInsert,
  IleriTarihliIslemInsert,
  Urun,
  Currency,
} from '@/types/database';
import {
  parseCurrency,
  formatCurrency,
  isValidAmount,
  roundCurrency,
  cleanAmountInput,
  formatAmountForInput,
} from '@/lib/currency';
import { resolveIslemLegs } from '@/lib/crossCurrency';
import { formatDateForDB, formatDateTimeForDB } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { useCreateIslem, useCreateIslemWithUrun, useUpdateIslem } from '@/hooks/useIslemler';
import { useCreateIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import { supabase } from '@/lib/supabase';
import { usePickImage, useTakePhoto, useUploadIslemPhoto } from '@/hooks/useIslemPhoto';
import { useAuthContext } from '@/contexts/AuthContext';
import { PhotoViewerModal } from '../PhotoViewerModal';
import { ExchangeRateBar } from '../ExchangeRateBar';
import {
  CariPickerSheet,
  HesapPickerSheet,
  PersonelPickerSheet,
  UrunPickerModal,
} from '../QuickTransactionBar/components';
import { HeaderSection, OdemeSection, AmountInputSection } from '../QuickTransactionBar/sections';
import { styles as qtbStyles } from '../QuickTransactionBar/styles';
import type { UrunItem } from '../QuickTransactionBar/types';
import { useUrunler, useCreateUrun } from '@/hooks/useUrunler';
import {
  classifyMutationError,
  getTransactionMutationMessageKey,
  MutationRetryPayloadChangedError,
} from '@/lib/errors';
import { usePermissions } from '@/hooks/usePermissions';
import { buildMutationFingerprint, isSameRegularCreate } from '@/lib/mutationIdentity';
import { hasUnsupportedQuickTransactionProducts } from '@/lib/productSelectionGuard';
import { consumePendingCategorySelection } from '@/lib/pendingCategorySelection';

import { CreditCardDatePicker } from './CreditCardDatePicker';
import { OdemeHedefTypePicker } from './CreditCardPickerSheets';
import { styles as creditCardStyles } from './styles';

type OdemeHedefType = 'tedarikci' | 'staff';
const PRODUCT_CREATE_PROBE_TIMEOUT_MS = 5000;

async function probeCreatedCreditCardTransaction(
  islemId: string,
  isletmeId: string,
  expected: Omit<IslemInsert, 'isletme_id'>
): Promise<Islem | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRODUCT_CREATE_PROBE_TIMEOUT_MS);

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
  const { height: windowHeight } = useWindowDimensions();
  const { isOwner, canAccessModule, canCreate, canCreateTransactionType } = usePermissions();
  const canCreateExpense = canCreateTransactionType('gider');
  const canCreateStatementPayment = canCreateTransactionType('transfer');
  const canCreateSupplierPayment = canCreateTransactionType('cari_odeme');
  const canCreatePersonelPayment = canCreateTransactionType('personel_odeme');
  const canCreatePayment = canCreateSupplierPayment || canCreatePersonelPayment;
  const canUseProducts = canCreateExpense && canAccessModule('urunler') && canCreate('urunler');
  const allowedTypes = useMemo<TransactionType[]>(() => {
    const result: TransactionType[] = [];
    if (canCreateExpense) result.push('kredi_karti_gider');
    if (canCreatePayment) result.push('kredi_karti_odeme');
    if (canCreateStatementPayment) result.push('kredi_karti_ekstre');
    return result;
  }, [canCreateExpense, canCreatePayment, canCreateStatementPayment]);

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
  // Bütün create yolları aynı istemci UUID'sini taşır. Böylece hem hızlı çift
  // dokunuş hem de "sunucuda commit + HTTP cevabı kayıp" tekrarı ikinci bir
  // finansal satır oluşturamaz.
  const createMutationIdRef = useRef<string | null>(null);
  const createMutationFingerprintRef = useRef<string | null>(null);
  const submitInFlightRef = useRef(false);
  const hasProductExpense = type === 'kredi_karti_gider' && urunItems.length > 0;
  const hasUnsupportedProductSelection = hasUnsupportedQuickTransactionProducts(type, urunItems.length);

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
  const [categoryNavigatedAway, setCategoryNavigatedAway] = useState(false);
  const categoryNavigationPendingRef = useRef(false);

  // Animation
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(100)).current;
  const isAnimatingRef = useRef(false);

  // Keyboard
  const keyboardHeightRef = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Data
  const { data: hesaplar } = useHesaplar(false, false, canAccessModule('hesaplar'));
  const { data: tedarikciCariler } = useCariler(
    'tedarikci',
    false,
    false,
    canCreateSupplierPayment
  );
  const { data: personelList } = usePersonelList(false, false, canCreatePersonelPayment);
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
          // Kredi kartı harcamasının gerçek para birimi kart hesabından gelir.
          // Global görüntüleme tercihini kullanmak TRY ürünü USD harcamaya
          // uyarısız ve çevrilmeden yazabiliyordu.
          currency: creditCard.currency,
        });
      } catch {
        return undefined;
      }
    },
    [createUrun, creditCard.currency]
  );

  const amountInputRef = useRef<TextInput>(null);

  const nakitHesaplar = useMemo(() => {
    return hesaplar?.filter((h) => h.type !== 'kredi_karti') || [];
  }, [hesaplar]);

  const selectedSourceHesap = nakitHesaplar.find((h) => h.id === sourceHesapId);
  const selectedCari = tedarikciCariler?.find((c) => c.id === cariId);
  const selectedPersonel = personelList?.find((p) => p.id === personelId);

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
        setCategoryPickerOpen(false);
        setCategorySkipped(false);
        setSelectedCategoryType(null);
        setCategoryNavigatedAway(false);
        categoryNavigationPendingRef.current = false;
        setPhotoUri(null);
        setShowPhotoViewer(false);
        setUrunItems([]);
        setShowUrunPicker(false);
        setUrunSearchQuery('');
        createMutationIdRef.current = null;
        createMutationFingerprintRef.current = null;
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
  }, [canCreatePersonelPayment, canCreateSupplierPayment, odemeHedefType, type, visible]);

  useEffect(() => {
    setCariId(null);
    setPersonelId(null);
    setOdemeHedefType(canCreateSupplierPayment ? 'tedarikci' : 'staff');
    // urunItems tür değişince temizlenmez; kullanıcı geri döndüğünde kalemler
    // korunur. Desteklenmeyen tipte düğme görünür kalır ve kaydetme fail-closed.
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

  const animateClose = useCallback(
    (callback?: () => void) => {
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
    },
    [opacity, translateY]
  );

  useEffect(() => {
    if (visible) {
      animateOpen();
    }
  }, [visible, animateOpen]);

  const dismissModal = useCallback(() => {
    animateClose(() => {
      onDismiss();
    });
  }, [animateClose, onDismiss]);

  const handleDismiss = useCallback(() => {
    // Kullanıcı yazma sürerken modalı kapatıp 300 ms sonra yeni UUID ile tekrar
    // açamasın. Başarılı kayıt kendi kontrollü dismiss yolunu kullanır.
    if (submitInFlightRef.current) return;
    dismissModal();
  }, [dismissModal]);

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
  }, [
    type,
    odemeHedefType,
    cariId,
    personelId,
    sourceHesapId,
    creditCard,
    hesaplar,
    tedarikciCariler,
    personelList,
  ]);

  /** Asıl kayıt. exchange verilirse source/target/exchange_rate üçlüsü DB'ye yazılır. */
  const persistIslem = useCallback(
    async (
      parsedAmount: number,
      exchange?: { sourceCurrency: Currency; targetCurrency: Currency; exchangeRate: number }
    ) => {
      if (isScheduled && hasProductExpense) {
        Alert.alert(
          t('transactions:validation.scheduledNoProductsTitle'),
          t('transactions:validation.scheduledNoProductsMessage')
        );
        return;
      }

      setIsSaving(true);

      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      try {
        const { apiType, hesapId, hedefHesapId, cariIdValue, personelIdValue } = resolveLegs();
        const clientMutationId = createMutationIdRef.current ?? Crypto.randomUUID();
        createMutationIdRef.current = clientMutationId;

        if (isScheduled) {
          const scheduledData: Omit<IleriTarihliIslemInsert, 'isletme_id'> = {
            id: clientMutationId,
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
          const fingerprint = buildMutationFingerprint({
            kind: 'scheduled',
            input: scheduledData,
          });
          if (
            createMutationFingerprintRef.current &&
            createMutationFingerprintRef.current !== fingerprint
          ) {
            throw new MutationRetryPayloadChangedError();
          }
          createMutationFingerprintRef.current = fingerprint;
          await createIleriTarihliIslem.mutateAsync(scheduledData);
        } else {
          const islemData: Omit<IslemInsert, 'isletme_id'> = {
            id: clientMutationId,
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
          const items = hasProductExpense
            ? urunItems.map((item) => ({
                urun_id: item.urunId,
                hareket_tipi: 'giris' as const,
                miktar: item.miktar,
                birim_fiyat: item.birimFiyat,
                kdv_orani: item.kdvOrani,
                aciklama: description.trim() || null,
              }))
            : [];
          const fingerprint = buildMutationFingerprint({
            kind: 'regular',
            input: islemData,
            items,
          });
          if (
            createMutationFingerprintRef.current &&
            createMutationFingerprintRef.current !== fingerprint
          ) {
            throw new MutationRetryPayloadChangedError();
          }
          createMutationFingerprintRef.current = fingerprint;

          let newIslem: Islem;
          try {
            if (hasProductExpense) {
              newIslem = await createIslemWithUrun.mutateAsync({
                input: islemData,
                items,
              });
            } else {
              newIslem = await createIslem.mutateAsync(islemData);
            }
          } catch (rpcError) {
            if (classifyMutationError(rpcError) !== 'network_unknown' || !isletme?.id) {
              throw rpcError;
            }

            const landed = await probeCreatedCreditCardTransaction(
              clientMutationId,
              isletme.id,
              islemData
            );
            if (!landed) throw rpcError;
            newIslem = landed;
          }

          // Foto varsa yükle → photo_path set et (ana bar ile aynı akış; scheduled hariç)
          if (isOwner && photoUri && isletme?.id && newIslem?.id) {
            try {
              const photoPath = await uploadPhoto.mutateAsync({
                uri: photoUri,
                isletmeId: isletme.id,
                islemId: newIslem.id,
              });
              await updateIslem.mutateAsync({
                id: newIslem.id,
                updates: { photo_path: photoPath },
              });
            } catch (photoError) {
              if (__DEV__) console.error('[PhotoUpload] Error:', photoError);
              Alert.alert(t('common:status.warning'), t('transactions:messages.photoUploadFailed'));
            }
          }
        }

        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        createMutationIdRef.current = null;
        createMutationFingerprintRef.current = null;
        onSuccess?.();
        dismissModal();
      } catch (error) {
        if (__DEV__) {
          console.error('Transaction error:', error);
        }
        setIsSaving(false);
        const errorKind = classifyMutationError(error);
        // Bu sınıflarda finansal yazının başlamadığı kesindir; kullanıcı alanı
        // düzeltip yeni bir idempotency anahtarıyla yeniden deneyebilir.
        if (
          errorKind === 'permission' ||
          errorKind === 'validation' ||
          errorKind === 'network_not_sent'
        ) {
          createMutationIdRef.current = null;
          createMutationFingerprintRef.current = null;
        }
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        const messageKey = getTransactionMutationMessageKey(error, 'create');
        Alert.alert(
          t('common:status.error'),
          messageKey ? t(messageKey) : t('transactions:messages.saveFailed')
        );
      }
    },
    [
      t,
      description,
      date,
      kategoriId,
      isScheduled,
      resolveLegs,
      createIslem,
      createIleriTarihliIslem,
      onSuccess,
      dismissModal,
      isOwner,
      photoUri,
      uploadPhoto,
      updateIslem,
      isletme,
      urunItems,
      hasProductExpense,
      createIslemWithUrun,
    ]
  );

  const handleExchangeRateConfirm = useCallback(
    async (exchangeRate: number) => {
      if (!pendingExchange) return;
      if (submitInFlightRef.current) return;
      submitInFlightRef.current = true;
      try {
        const { sourceCurrency, targetCurrency, sourceAmount } = pendingExchange;
        setShowExchangeRateBar(false);
        setPendingExchange(null);
        await persistIslem(sourceAmount, {
          sourceCurrency,
          targetCurrency,
          exchangeRate,
        });
      } finally {
        submitInFlightRef.current = false;
      }
    },
    [pendingExchange, persistIslem]
  );

  const handleSave = useCallback(async () => {
    // React state ancak sonraki render'da butonu disabled yapar. Ref aynı JS
    // frame'inde ikinci onPress'i keserek iki ayrı finansal mutation'ı engeller.
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    try {
      if (!isValidAmount(amount)) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        return;
      }

      if (hasUnsupportedProductSelection) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        Alert.alert(
          t('transactions:validation.productsUnsupportedTypeTitle'),
          t('transactions:validation.productsUnsupportedTypeMessage')
        );
        return;
      }

      if (isScheduled && hasProductExpense) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        Alert.alert(
          t('transactions:validation.scheduledNoProductsTitle'),
          t('transactions:validation.scheduledNoProductsMessage')
        );
        return;
      }

      if (
        (type === 'kredi_karti_gider' || type === 'kredi_karti_odeme') &&
        !kategoriId &&
        !categorySkipped &&
        !hasProductExpense
      ) {
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
      const productModules = hasProductExpense ? (['urunler'] as const) : [];
      if (
        !allowedTypes.includes(type) ||
        !canCreateTransactionType(permissionApiType, productModules) ||
        (hasProductExpense && !canCreate('urunler'))
      ) {
        Alert.alert(t('common:status.error'), t('common:errors.permissionDenied'));
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
    } finally {
      submitInFlightRef.current = false;
    }
  }, [
    t,
    amount,
    type,
    kategoriId,
    categorySkipped,
    isScheduled,
    sourceHesapId,
    cariId,
    personelId,
    odemeHedefType,
    allowedTypes,
    canCreate,
    canCreateTransactionType,
    hasProductExpense,
    hasUnsupportedProductSelection,
    resolveLegs,
    persistIslem,
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
        t('transactions:validation.scheduledNoProductsMessage')
      );
      return;
    }
    setIsScheduled((current) => !current);
  }, [hasProductExpense, isScheduled, t]);

  const handleHesapSelect = useCallback((id: string) => {
    setSourceHesapId(id);
    setShowHesapPicker(false);
  }, []);

  const handleCariSelect = useCallback((id: string) => {
    setCariId(id);
    setShowCariPicker(false);
  }, []);

  const handlePersonelSelect = useCallback((id: string) => {
    setPersonelId(id);
    setShowPersonelPicker(false);
  }, []);

  const handleOdemeHedefTypeSelect = useCallback((newType: 'tedarikci' | 'staff') => {
    setOdemeHedefType(newType);
    setCariId(null);
    setPersonelId(null);
    setShowOdemeHedefTypePicker(false);
  }, []);

  const handleHesapPickerDismiss = useCallback(() => {
    setShowHesapPicker(false);
  }, []);

  const handleCariPickerDismiss = useCallback(() => {
    setShowCariPicker(false);
  }, []);

  const handlePersonelPickerDismiss = useCallback(() => {
    setShowPersonelPicker(false);
  }, []);

  // Kategori ekleme tam ekran bir route'a gider. Parent `visible` değerini kapatmak
  // formu sıfırladığı için kartı yalnız geçici olarak gizle; route geri odaklandığında
  // taslağı koruyup yeni kategoriyi otomatik seç.
  useFocusEffect(
    useCallback(() => {
      if (!visible || !categoryNavigationPendingRef.current) return;

      categoryNavigationPendingRef.current = false;
      setCategoryNavigatedAway(false);
      const pending = consumePendingCategorySelection();
      if (pending?.type === 'gider') {
        setKategoriId(pending.id);
        setSelectedCategoryType('gider');
      }
      setCategoryPickerOpen(false);
    }, [visible])
  );

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
  const categoryType = selectedCategoryType || getCategoryType() || null;

  const cardBottom = keyboardHeight > 0 ? keyboardHeight : insets.bottom + TAB_BAR_HEIGHT + 10;

  // Ana QTB gibi kart + dış kapatma düğmesi ekrana sığar. İçerik uzarsa yalnız
  // üst bölüm kayar; kategori/not/tutar/kaydet/sekme alanı görünür kalır.
  const cardMaxHeight = Math.max(280, windowHeight - cardBottom - insets.top - 44 - 8);

  // Desteklenmeyen sekmede seçili kalem varsa düğmeyi görünür tut; kullanıcı
  // kalemleri kaldırabilsin ve sessiz veri kaybı yaşanmasın.
  const hasUrunler = (urunler?.length ?? 0) > 0;
  const showUrunButton =
    canUseProducts
    && hasUrunler
    && (type === 'kredi_karti_gider' || urunItems.length > 0)
    && !isScheduled;

  return (
    <Modal
      visible={visible && !categoryNavigatedAway}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={qtbStyles.backdrop} />
      </TouchableWithoutFeedback>

      <Animated.View
        pointerEvents="box-none"
        style={[
          qtbStyles.cardWrapper,
          {
            bottom: cardBottom,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <TouchableOpacity
          style={qtbStyles.floatingClose}
          onPress={handleDismiss}
          hitSlop={HIT_SLOP.md}
        >
          <X size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={[qtbStyles.card, { maxHeight: cardMaxHeight }]}>
          <ScrollView
            style={localStyles.topScroll}
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <HeaderSection
              date={date}
              isScheduled={isScheduled}
              formatDateMedium={formatDateMedium}
              onDatePress={() => setShowDatePicker(true)}
              onScheduledToggle={handleScheduledToggle}
              onResetToNow={() => setDate(new Date())}
              showScheduledToggle
            />

            {/* Credit Card Info */}
            <View style={creditCardStyles.creditCardInfo}>
              <View style={creditCardStyles.creditCardHeader}>
                <CreditCard size={20} color={colors.warning} />
                <Text style={creditCardStyles.creditCardName} numberOfLines={1}>
                  {creditCard.name}
                </Text>
              </View>
              {creditLimit > 0 ? (
                <View style={creditCardStyles.creditLimitRow}>
                  <View style={creditCardStyles.creditLimitItem}>
                    <Text style={creditCardStyles.creditLimitLabel}>
                      {t('accounts:creditCard.creditLimit')}
                    </Text>
                    <Text style={creditCardStyles.creditLimitValue}>
                      {formatCurrency(creditLimit, creditCard.currency)}
                    </Text>
                  </View>
                  <View style={creditCardStyles.creditLimitItem}>
                    <Text style={creditCardStyles.creditLimitLabel}>
                      {t('accounts:creditCard.usedCredit')}
                    </Text>
                    <Text style={[creditCardStyles.creditLimitValue, { color: colors.error }]}>
                      {formatCurrency(usedCredit, creditCard.currency)}
                    </Text>
                  </View>
                  <View style={creditCardStyles.creditLimitItem}>
                    <Text style={creditCardStyles.creditLimitLabel}>
                      {t('accounts:creditCard.availableCredit')}
                    </Text>
                    <Text style={[creditCardStyles.creditLimitValue, { color: colors.success }]}>
                      {formatCurrency(availableCredit, creditCard.currency)}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={creditCardStyles.noLimitText}>{t('accounts:creditCard.noLimit')}</Text>
              )}
            </View>

            {/* Payment: Supplier/Personnel Selection */}
            {type === 'kredi_karti_odeme' && (
              <OdemeSection
                selectedHesap={creditCard}
                selectedCari={selectedCari}
                selectedPersonel={selectedPersonel}
                odemeHedefType={odemeHedefType}
                onOpenOdemeTypePicker={() => setShowOdemeHedefTypePicker(true)}
                onOpenCariPicker={() => setShowCariPicker(true)}
                onOpenPersonelPicker={() => setShowPersonelPicker(true)}
                sourceKind="kredi_karti"
              />
            )}

            {/* Statement Payment: Source Account Selection */}
            {type === 'kredi_karti_ekstre' && (
              <TouchableOpacity
                style={qtbStyles.sourceAccountRow}
                onPress={() => setShowHesapPicker(true)}
              >
                <Wallet size={16} color={colors.textMuted} />
                <Text style={qtbStyles.sourceAccountText} numberOfLines={1}>
                  {selectedSourceHesap?.name || t('accounts:titles.selectAccount')}
                </Text>
                {selectedSourceHesap && (
                  <Text
                    style={[
                      qtbStyles.balanceTextSmall,
                      {
                        color:
                          Number(selectedSourceHesap.balance) >= 0 ? colors.success : colors.error,
                      },
                    ]}
                  >
                    {formatCurrency(
                      Number(selectedSourceHesap.balance),
                      selectedSourceHesap.currency
                    )}
                  </Text>
                )}
                <ArrowRight size={16} color={colors.info} />
                <View style={localStyles.targetAccountLabel}>
                  <CreditCard size={16} color={colors.warning} />
                  <Text style={localStyles.targetAccountText} numberOfLines={1}>
                    {creditCard.name}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </ScrollView>

          <AmountInputSection
            amount={amount}
            onAmountChange={handleAmountChange}
            amountInputRef={amountInputRef}
            description={description}
            onDescriptionChange={setDescription}
            kategoriId={kategoriId}
            onKategoriChange={(newKategoriId) => {
              setKategoriId(newKategoriId);
              setSelectedCategoryType(newKategoriId ? categoryType : null);
            }}
            categoryType={categoryType}
            categoryPickerOpen={categoryPickerOpen}
            onCategoryPickerOpenChange={(open) => {
              setCategoryPickerOpen(open);
              if (!open && !kategoriId) setCategorySkipped(true);
            }}
            onNavigateAway={() => {
              categoryNavigationPendingRef.current = true;
              setCategoryNavigatedAway(true);
            }}
            hasPhoto={!!photoUri}
            onPickImage={handlePickImage}
            onTakePhoto={handleTakePhoto}
            onRemovePhoto={handleRemovePhoto}
            onViewPhoto={handleViewPhoto}
            photoLoading={pickImage.isPending || takePhoto.isPending}
            isScheduled={isScheduled}
            isSaving={isSaving}
            buttonColor={buttonColor}
            buttonLabel={buttonLabel}
            onSave={handleSave}
            type={type}
            onTypeChange={setType}
            tabMode="kredi_karti"
            allowedTypes={allowedTypes}
            showUrunButton={showUrunButton}
            urunItemCount={urunItems.length}
            onUrunButtonPress={() => setShowUrunPicker(true)}
            showPhotoButton={isOwner}
          />
        </View>
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
        onSelect={handleHesapSelect}
        hesaplar={nakitHesaplar}
        selectedId={sourceHesapId}
        target="source"
        showBalances={canAccessModule('hesaplar')}
      />

      <CariPickerSheet
        visible={showCariPicker && canCreateSupplierPayment}
        onDismiss={handleCariPickerDismiss}
        onSelect={handleCariSelect}
        cariler={tedarikciCariler || []}
        selectedId={cariId}
        mode="supplier"
      />

      <PersonelPickerSheet
        visible={showPersonelPicker && canCreatePersonelPayment}
        onDismiss={handlePersonelPickerDismiss}
        onSelect={handlePersonelSelect}
        personelList={personelList || []}
        selectedId={personelId}
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
        currency={creditCard.currency}
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
  topScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  targetAccountLabel: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  targetAccountText: {
    flexShrink: 1,
    fontSize: 14,
    color: colors.warning,
    fontWeight: '500',
  },
});
