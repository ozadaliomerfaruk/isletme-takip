import { useRef, useCallback, useMemo, useEffect, useState } from 'react';
import { View, Animated, TextInput, TouchableOpacity, TouchableWithoutFeedback, Platform, Keyboard, StyleSheet, Alert, ScrollView, FlatList, useWindowDimensions } from 'react-native';
import { X, Lock, Unlock } from 'lucide-react-native';
import DateTimePickerRN from '@react-native-community/datetimepicker';
import { Text, Modal } from '@/components/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRouter, useFocusEffect, type Href } from 'expo-router';

import { TAB_BAR_HEIGHT, HIT_SLOP } from '@/constants/spacing';
import { colors } from '@/constants/colors';
import { roundCurrency, parseCurrency, formatAmountForInput, cleanAmountInput } from '@/lib/currency';
import { addDays, addMonths, formatDateForDB } from '@/lib/date';
import {
  MAX_INSTALLMENT_COUNT,
  MIN_INSTALLMENT_COUNT,
  amountToCents,
  buildInstallmentPlan,
  type InstallmentDateOverride,
  type InstallmentPlan,
  type InstallmentPlanErrorCode,
  type InstallmentRpcRow,
  type LockedInstallmentRow,
} from '@/lib/installmentDistribution';

import { getTransactionTypeColor } from '../TransactionTypeTabs';
import { ExchangeRateBar } from '../ExchangeRateBar';
import { PhotoViewerModal } from '../PhotoViewerModal';
import { styles } from './styles';
import type {
  QuickTransactionBarProps,
  TransactionType,
  TransactionTabMode,
} from './types';
import {
  DateTimePickerModal,
  HesapPickerSheet,
  CariPickerSheet,
  PersonelPickerSheet,
  OdemeHedefTypePicker,
  TahsilatHedefTypePicker,
  KrediKartiPickerSheet,
  UrunPickerModal,
} from './components';
import {
  HeaderSection,
  EntityDisplaySection,
  TransferSection,
  OdemeSection,
  TahsilatSection,
  AmountInputSection,
} from './sections';
import {
  useQuickTransactionAnimation,
  useQuickTransactionModals,
  useQuickTransactionForm,
  useQuickTransactionEntities,
  useTransactionSubmit,
  useLastUsedSelections,
} from './hooks';
import { getCategoryType as resolveCategoryFamily } from './utils/categoryTypeMapper';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useKategoriSecimReferanslari } from '@/hooks/useKategoriSecimReferanslari';
import { usePickImage, useTakePhoto } from '@/hooks/useIslemPhoto';
import { useCreateCari } from '@/hooks/useCariler';
import { useCreateUrun } from '@/hooks/useUrunler';
import { useSettings } from '@/hooks/useSettings';
import { useIslemTaksitliMi } from '@/hooks/useTaksit';
import { usePermissions } from '@/hooks/usePermissions';
import { useUrunKalemlerByIslemIds } from '@/hooks/useUrunHareketler';
import { consumePendingCategorySelection } from '@/lib/pendingCategorySelection';
import {
  canUseMinimalAccountRefs,
  getAllowedHesapOdemeHedefTypes,
  getAllowedHesapTahsilatHedefTypes,
  getAllowedScopedQuickTransactionTypes,
} from '@/lib/quickTransactionCreateScope';
import { canAccessTransactionSources } from '@/lib/transactionSourceModules';
import { supportsQuickTransactionProducts } from '@/lib/productSelectionGuard';
import { checkBackendConnectivity } from '@/lib/supabase';
import {
  getTransactionMutationMessageKey,
  toErrorMessage,
} from '@/lib/errors';
import {
  canSubmitThroughInstallmentEditGuard,
  getInstallmentEditGuardReason,
} from '@/lib/installmentEditGuard';
import type { Currency, Urun } from '@/types/database';

export function QuickTransactionBar({
  visible,
  onDismiss,
  defaultType = 'gelir',
  defaultHesapId,
  defaultCariId,
  defaultCariType,
  defaultPersonelId,
  defaultAmount,
  defaultDate,
  defaultDescription,
  hedefIslemId,
  onSuccess,
  isViewer,
  suppressLastUsed,
  mode = 'create',
  transactionId,
  isScheduledTransaction = false,
  copySourceId,
  tabModeOverride,
  createScope,
  minimalAccountReferenceMode,
  cariMinimalAccountMode = false,
}: QuickTransactionBarProps) {
  const { t } = useTranslation(['transactions', 'common', 'clients', 'staff', 'accounts']);
  const { formatDateMedium, locale } = useDateFormat();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const router = useRouter();
  const {
    canAccessModule,
    canCreateTransactionType,
    isOwner,
  } = usePermissions();
  const requestedAccountReferenceScope =
    minimalAccountReferenceMode
    ?? (cariMinimalAccountMode ? 'cari' : undefined);
  // Bakiye-siz hesap referanslari hem yeni kayitta hem de ayni isletmedeki normal
  // cari/personel odeme-tahsilat duzenlemesinde kullanilabilir. Copy, linked viewer ve
  // ileri-tarihli edit bu dar hesaba erisim baglamina opt-in olamaz.
  const minimalAccountRefsAllowed = canUseMinimalAccountRefs({
    requestedScope: requestedAccountReferenceScope,
    mode,
    transactionId,
    copySourceId,
    defaultCariId,
    defaultPersonelId,
    isViewer,
    isScheduledTransaction,
  });
  const scopedCreateRequested =
    !copySourceId
    && !isViewer
    && (
      (mode === 'create' && !transactionId)
      || (
        mode === 'edit'
        && !!transactionId
        && !isScheduledTransaction
      )
    )
      ? createScope
      : undefined;
  const scopedCreateContext =
    scopedCreateRequested
    && (
      scopedCreateRequested === 'hesap'
      || (mode === 'edit' && !!transactionId)
      || (scopedCreateRequested === 'cari' && !!defaultCariId)
      || (scopedCreateRequested === 'personel' && !!defaultPersonelId)
    )
      ? scopedCreateRequested
      : undefined;
  const initialAllowedTypes = useMemo(
    () => scopedCreateContext
      ? getAllowedScopedQuickTransactionTypes({
          scope: scopedCreateContext,
          cariType: defaultCariType,
          canCreateTransactionType: (apiType) =>
            mode === 'edit'
              ? canAccessTransactionSources(
                  [apiType],
                  canAccessModule,
                )
              : canCreateTransactionType(apiType),
        })
      : undefined,
    [
      canAccessModule,
      canCreateTransactionType,
      defaultCariType,
      mode,
      scopedCreateContext,
    ],
  );
  const effectiveDefaultType: TransactionType =
    initialAllowedTypes && !initialAllowedTypes.includes(defaultType)
      ? (initialAllowedTypes[0] ?? defaultType)
      : defaultType;

  // Refs
  const amountInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  const datePickerFocusTargetRef = useRef<'amount' | 'description' | null>(null);
  const transactionLoadErrorShownRef = useRef<string | null>(null);
  const installmentEditWarningShownRef = useRef<string | null>(null);

  // Modals hook
  const modals = useQuickTransactionModals();

  // A1: son-kullanılan hesap/kategori belleği (aktif isletme.id ile namespace'li)
  const lastUsed = useLastUsedSelections();

  // Form hook - needs modals.resetModalStates and hesaplar
  // We need to get hesaplar first for form initialization
  const tempEntities = useQuickTransactionEntities({
    isCariMode: !!defaultCariId,
    minimalAccountReferenceMode:
      minimalAccountRefsAllowed ? requestedAccountReferenceScope : undefined,
    createScope: scopedCreateRequested,
    defaultCariType,
    type: effectiveDefaultType,
    tahsilatHedefType: null,
    hesapId: undefined,
    sourceHesapId: null,
    hedefHesapId: null,
    cariId: null,
    personelId: null,
    hesapPickerTarget: modals.hesapPickerTarget,
    hesapSearchQuery: modals.hesapSearchQuery,
    cariSearchQuery: modals.cariSearchQuery,
    personelSearchQuery: modals.personelSearchQuery,
    urunSearchQuery: modals.urunSearchQuery,
  });

  // Form hook
  const form = useQuickTransactionForm({
    visible,
    defaultType: effectiveDefaultType,
    defaultHesapId,
    defaultCariId,
    defaultCariType,
    defaultPersonelId,
    defaultAmount,
    defaultDate,
    defaultDescription,
    hesaplar: tempEntities.hesaplar,
    resetModalStates: modals.resetModalStates,
    // Edit mode props
    mode,
    transactionId,
    isScheduledTransaction,
    copySourceId,
    // A1: son-kullanılan hesap ön-doldurma getter'ı (doğrulama form hook'unda)
    getLastUsedHesapId: lastUsed.getHesapId,
  });
  const inferredScopedCariType =
    form.type === 'odeme' || form.type === 'alis_iade'
      ? 'tedarikci'
      : form.type === 'tahsilat' || form.type === 'satis_iade'
        ? 'musteri'
        : undefined;
  const effectiveScopedCariType =
    defaultCariType
    ?? form.loadedCariType
    ?? inferredScopedCariType;
  const allowedTypes = useMemo(() => {
    if (
      !initialAllowedTypes
      || mode !== 'edit'
      || scopedCreateContext !== 'cari'
    ) {
      return initialAllowedTypes;
    }

    if (!effectiveScopedCariType) {
      // Alis/satis iki cari tipinde de vardir. Cari tipi projeksiyonda
      // bulunmuyorsa karsi yonde odeme/iade sekmesi tahmin ederek yetki
      // yukseltmek yerine yalniz ortak iki sekmeyi goster.
      return initialAllowedTypes.filter(
        (candidate) => candidate === 'alis' || candidate === 'satis',
      );
    }

    return getAllowedScopedQuickTransactionTypes({
      scope: 'cari',
      cariType: effectiveScopedCariType,
      canCreateTransactionType: (apiType) =>
        canAccessTransactionSources([apiType], canAccessModule),
    });
  }, [
    canAccessModule,
    effectiveScopedCariType,
    form.type,
    initialAllowedTypes,
    mode,
    scopedCreateContext,
  ]);
  const visibleTransactionTypes = allowedTypes;
  const allowedOdemeHedefTypes = useMemo(() => {
    return scopedCreateContext === 'hesap'
      ? getAllowedHesapOdemeHedefTypes({
          canCreateTransactionType,
          isOwner,
        })
      : undefined;
  }, [canCreateTransactionType, isOwner, scopedCreateContext]);
  const allowedTahsilatHedefTypes = useMemo(() => {
    return scopedCreateContext === 'hesap'
      ? getAllowedHesapTahsilatHedefTypes({ canCreateTransactionType })
      : undefined;
  }, [canCreateTransactionType, scopedCreateContext]);
  const productPresenceIds = useMemo(
    () => (
      visible
      && mode === 'edit'
      && !!transactionId
      && !isScheduledTransaction
        ? [transactionId]
        : []
    ),
    [isScheduledTransaction, mode, transactionId, visible],
  );
  const {
    getProductItemCount: getPersistedProductItemCount,
    isProductItemsResolved,
    error: productPresenceError,
  } = useUrunKalemlerByIslemIds(productPresenceIds, true);
  const persistedProductItemCount =
    transactionId ? getPersistedProductItemCount(transactionId) : 0;

  // Tab mode
  const tabMode: TransactionTabMode = tabModeOverride
    ?? (
      form.isPersonelMode
        ? 'personel'
        : form.isCariMode
          ? effectiveScopedCariType === 'tedarikci'
            ? (isViewer ? 'tedarikci_viewer' : 'tedarikci')
            : (isViewer ? 'musteri_viewer' : 'musteri')
          : 'normal'
    );

  const resetScopedModalStates = modals.resetModalStates;
  const resetScopedType = form.setType;
  const resetScopedSourceHesap = form.setSourceHesapId;
  const resetScopedHedefHesap = form.setHedefHesapId;
  const resetScopedExchange = form.setPendingExchangeData;
  const resetScopedProducts = form.setUrunItems;

  // Permission can narrow while QTB is open. Keep the fixed cari/personel id,
  // but remove account/product/modal state from a type that is no longer legal.
  useEffect(() => {
    if (!visible || !allowedTypes) return;
    const nextType = allowedTypes[0];
    if (!nextType) {
      resetScopedModalStates();
      onDismiss();
      return;
    }
    if (allowedTypes.includes(form.type)) return;

    resetScopedModalStates();
    resetScopedSourceHesap(null);
    resetScopedHedefHesap(null);
    resetScopedExchange(null);
    resetScopedProducts([]);
    resetScopedType(nextType);
  }, [
    allowedTypes,
    form.type,
    onDismiss,
    resetScopedExchange,
    resetScopedHedefHesap,
    resetScopedModalStates,
    resetScopedProducts,
    resetScopedSourceHesap,
    resetScopedType,
    visible,
  ]);

  // Leave usage type flag
  const isLeaveUsageType = form.type === 'personel_izin_kullanimi_tab';

  // Auto-calculate day count from date range for leave usage.
  // Gün başına (yerel 00:00) normalize edilir: saat farkı / DST kenarı gün sayısını bozmasın
  // (ham getTime() farklı saatlerde ±1 gün hatalı sayıyordu). Round, DST gün-uzunluğu
  // sapmasını da tolere eder. Ters aralık burada 1'e kelepçelenir ama kayıt anında
  // "geçersiz aralık" ile engellenir (useTransactionSubmit).
  useEffect(() => {
    if (isLeaveUsageType && form.dateEnd) {
      const s = form.safeDate;
      const e = form.dateEnd;
      const startDay = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
      const endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
      const diffDays = Math.max(1, Math.round((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1);
      form.setAmount(diffDays.toString());
    }
  }, [isLeaveUsageType, form.safeDate, form.dateEnd]);

  // Initialize dateEnd to today when switching to leave usage type.
  // EDIT modda BUGÜN'e OTOMATİK set ETME: date_end'i NULL olan legacy izin-kullanımı kaydı
  // düzenlenince dateEnd=bugün olur, yukarıdaki recompute effect'i tetikler ve saklı amount'ı
  // (ör. 2 gün) başlangıç→bugün gün sayısına ŞİŞİRİR (sessiz veri bozulması). Edit modda
  // dateEnd yalnız kayıttan (yükleme effect'i) veya kullanıcının manuel seçiminden gelmeli.
  useEffect(() => {
    if (isLeaveUsageType && !form.dateEnd && !form.isEditMode) {
      form.setDateEnd(new Date());
    } else if (!isLeaveUsageType && form.dateEnd) {
      form.setDateEnd(null);
    }
  }, [isLeaveUsageType, form.isEditMode]);

  // Entities hook - with actual form values
  const entities = useQuickTransactionEntities({
    isCariMode: form.isCariMode,
    minimalAccountReferenceMode:
      minimalAccountRefsAllowed ? requestedAccountReferenceScope : undefined,
    createScope: scopedCreateRequested,
    defaultCariType: effectiveScopedCariType,
    type: form.type,
    tahsilatHedefType: form.tahsilatHedefType,
    hesapId: form.hesapId,
    sourceHesapId: form.sourceHesapId,
    hedefHesapId: form.hedefHesapId,
    cariId: form.cariId,
    personelId: form.personelId,
    hesapPickerTarget: modals.hesapPickerTarget,
    hesapSearchQuery: modals.hesapSearchQuery,
    cariSearchQuery: modals.cariSearchQuery,
    personelSearchQuery: modals.personelSearchQuery,
    urunSearchQuery: modals.urunSearchQuery,
  });

  // Animation hook
  const animation = useQuickTransactionAnimation({
    visible,
    amountInputRef,
  });

  const suspendKeyboardForDatePicker = useCallback(() => {
    datePickerFocusTargetRef.current = amountInputRef.current?.isFocused()
      ? 'amount'
      : descriptionInputRef.current?.isFocused()
        ? 'description'
        : null;
    Keyboard.dismiss();
  }, []);

  const restoreKeyboardAfterDatePicker = useCallback(() => {
    const target = datePickerFocusTargetRef.current;
    datePickerFocusTargetRef.current = null;
    if (!target) return;

    requestAnimationFrame(() => {
      if (target === 'amount') {
        amountInputRef.current?.focus();
      } else {
        descriptionInputRef.current?.focus();
      }
    });
  }, []);

  const restoreAmountKeyboardAfterCategoryPicker = useCallback(() => {
    if (!visible || modals.navigatedAway) return;
    requestAnimationFrame(() => amountInputRef.current?.focus());
  }, [modals.navigatedAway, visible]);

  // Photo hooks
  const pickImage = usePickImage();
  const takePhoto = useTakePhoto();

  // Photo handlers
  const handlePickImage = useCallback(async () => {
    const uri = await pickImage.mutateAsync();
    if (uri) {
      form.setPhotoUri(uri);
    }
  }, [pickImage, form]);

  const handleTakePhoto = useCallback(async () => {
    const uri = await takePhoto.mutateAsync();
    if (uri) {
      form.setPhotoUri(uri);
    }
  }, [takePhoto, form]);

  const handleRemovePhoto = useCallback(() => {
    form.setPhotoUri(null);
  }, [form]);

  // Photo viewer state
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  // Vade (ödeme tarihi) picker görünürlüğü — ileri-tarihli (Bell) picker'ından ayrı.
  const [showVadePicker, setShowVadePicker] = useState(false);

  // FAZ 3 — taksit planı (yalnız alış/satış + non-scheduled + ürünsüz create).
  // Vade ile karşılıklı münhasır: taksit seçilince vade temizlenir (ve tersi).
  const [taksitPlan, setTaksitPlan] = useState<InstallmentPlan | null>(null);
  const [showTaksitConfig, setShowTaksitConfig] = useState(false);
  const [taksitAdetDraft, setTaksitAdetDraft] = useState(3);
  const [taksitIlkVadeDraft, setTaksitIlkVadeDraft] = useState<Date>(() => addMonths(new Date(), 1));
  const [taksitPreviewPlan, setTaksitPreviewPlan] = useState<InstallmentPlan | null>(null);
  const [taksitDraftLocks, setTaksitDraftLocks] = useState<LockedInstallmentRow[]>([]);
  const [taksitDraftError, setTaksitDraftError] = useState<InstallmentPlanErrorCode | null>(null);
  const [taksitDraftWasStale, setTaksitDraftWasStale] = useState(false);
  const [editingTaksitIndex, setEditingTaksitIndex] = useState<number | null>(null);
  const [editingTaksitText, setEditingTaksitText] = useState('');
  const [showTaksitVadePicker, setShowTaksitVadePicker] = useState(false);
  // Taksit sayısı elle yazılırken geçici metin; null = yazım modunda değil.
  const [taksitAdetInput, setTaksitAdetInput] = useState<string | null>(null);
  // Satır bazında elle seçilmiş vadeler + hangi satırın tarih seçicisi açık.
  const [taksitDraftDateOverrides, setTaksitDraftDateOverrides] = useState<
    InstallmentDateOverride[]
  >([]);
  const [editingVadeIndex, setEditingVadeIndex] = useState<number | null>(null);

  const currentTaksitTotalCents = useMemo(
    () => amountToCents(parseCurrency(form.amount)),
    [form.amount]
  );
  const taksitPlanDateStale =
    !!taksitPlan &&
    formatDateForDB(taksitPlan.ilkVade) < formatDateForDB(form.safeDate);
  const taksitPlanStale =
    !!taksitPlan &&
    (currentTaksitTotalCents === null ||
      taksitPlan.totalCents !== currentTaksitTotalCents ||
      taksitPlanDateStale);

  // Taksit modalı kapanınca satır-içi tarih seçici de kapanır (yeniden açılışta temiz)
  useEffect(() => {
    if (!showTaksitConfig) {
      setShowTaksitVadePicker(false);
      setEditingTaksitIndex(null);
      setEditingTaksitText('');
      setTaksitAdetInput(null);
      setEditingVadeIndex(null);
    }
  }, [showTaksitConfig]);

  // Ödeme/tahsilat dağıtımı SAF FIFO (en eski borç önce) — sunucu otomatik yapar.
  // "Nereye sayılsın?" hedeflemesi kaldırıldı (kullanıcı kararı): date-FIFO görünümüyle
  // çelişiyordu (hedef seçimi ekrana yansımıyordu) + esnaf normu zaten en-eski-önce.

  const installmentEditQuery = useIslemTaksitliMi(
    mode === 'edit' ? transactionId : undefined,
  );
  const installmentEditRequired =
    visible
    && form.isEditMode
    && !isScheduledTransaction
    && !!transactionId;
  const installmentEditGuardReason = getInstallmentEditGuardReason({
    required: installmentEditRequired,
    data: installmentEditQuery.data,
    isSuccess: installmentEditQuery.isSuccess,
    isFetching: installmentEditQuery.isFetching,
    isError:
      installmentEditQuery.isError
      || installmentEditQuery.isRefetchError,
  });

  // Bar kapanınca / tip taksit-dışına dönünce / scheduled açılınca / ürün eklenince
  // / edit moduna girince taksit sıfırlanır (yalnız yeni-kayıt yolu destekli).
  useEffect(() => {
    if (!visible) {
      setTaksitPlan(null);
      setShowTaksitConfig(false);
      setTaksitPreviewPlan(null);
      setTaksitDraftLocks([]);
      setTaksitDraftError(null);
      setTaksitDraftWasStale(false);
      setEditingTaksitIndex(null);
      setEditingTaksitText('');
      setShowTaksitVadePicker(false);
    }
  }, [visible]);
  useEffect(() => {
    if (
      taksitPlan &&
      (form.isScheduled || (form.type !== 'satis' && form.type !== 'alis') ||
        form.urunItems.length > 0 || form.isEditMode)
    ) {
      setTaksitPlan(null);
    }
  }, [taksitPlan, form.isScheduled, form.type, form.urunItems.length, form.isEditMode]);

  const handleViewPhoto = useCallback(() => {
    if (form.photoUri) {
      setShowPhotoViewer(true);
    }
  }, [form.photoUri]);

  // Handle dismiss with animation
  const handleDismiss = useCallback(() => {
    animation.animateClose(() => {
      onDismiss();
    });
  }, [animation, onDismiss]);

  const dismissForInstallmentEditGuard = useCallback((
    reason: 'installment' | 'query_error',
    error?: unknown,
  ) => {
    if (!transactionId) return;
    const messageKey = `${transactionId}:${reason}`;
    if (installmentEditWarningShownRef.current === messageKey) return;
    installmentEditWarningShownRef.current = messageKey;

    if (reason === 'installment') {
      Alert.alert(
        t('transactions:taksit.configTitle'),
        t('transactions:taksit.editEngel'),
      );
    } else {
      Alert.alert(
        t('common:status.error'),
        toErrorMessage(error, t('errors:general.tryAgain')),
      );
    }
    handleDismiss();
  }, [handleDismiss, t, transactionId]);

  useEffect(() => {
    if (!visible) {
      installmentEditWarningShownRef.current = null;
      return;
    }
    if (form.transactionLoadError || productPresenceError) return;
    if (installmentEditGuardReason === 'installment') {
      dismissForInstallmentEditGuard('installment');
    } else if (installmentEditGuardReason === 'query_error') {
      dismissForInstallmentEditGuard(
        'query_error',
        installmentEditQuery.error,
      );
    }
  }, [
    dismissForInstallmentEditGuard,
    form.transactionLoadError,
    installmentEditGuardReason,
    installmentEditQuery.error,
    productPresenceError,
    visible,
  ]);

  useEffect(() => {
    if (!visible) {
      transactionLoadErrorShownRef.current = null;
      return;
    }
    const editLoadError =
      form.transactionLoadError
      ?? (
        form.isEditMode && !isScheduledTransaction
          ? productPresenceError
          : null
      );
    if (
      (!form.isEditMode && !form.isCopyMode)
      || !editLoadError
    ) return;

    const errorKey = `${transactionId ?? copySourceId ?? ''}:${toErrorMessage(
      editLoadError,
      'transaction-load-error',
    )}`;
    if (transactionLoadErrorShownRef.current === errorKey) return;
    transactionLoadErrorShownRef.current = errorKey;

    const messageKey = getTransactionMutationMessageKey(
      editLoadError,
      form.isEditMode ? 'update' : 'create',
    );
    Alert.alert(
      t('common:status.error'),
      messageKey
        ? t(messageKey)
        : toErrorMessage(
          editLoadError,
          t('common:errors.transactionNotFound'),
        ),
    );
    handleDismiss();
  }, [
    copySourceId,
    form.isEditMode,
    form.isCopyMode,
    form.transactionLoadError,
    handleDismiss,
    isScheduledTransaction,
    productPresenceError,
    t,
    transactionId,
    visible,
  ]);

  // Tam ekran bir sayfaya (ör. /urunler/ekle) gidip geri dönünce, navigatedAway ile GİZLENEN
  // bar'ı geri getir. `visible`'a hiç dokunulmadığı için form/urunItems korunmuştur → kullanıcı
  // eklediği ürünlerle işlem çubuğuna döner (Ürün butonunda adet görünür). İç ürün seçici
  // onAddFullProduct'ta kapatıldığı için burada otomatik açılmaz; kullanıcı Ürün'e dokunup devam eder.
  useFocusEffect(
    useCallback(() => {
      modals.setNavigatedAway(false);
      // Kategori-ekle sayfasından dönüş: yeni kategori otomatik SEÇİLİR (kullanıcı
      // isteği — eskiden QTB kapanıyordu). Yalnız görünür instance tüketir; aile
      // uyuşmazsa (ekle sayfasında tip değiştirildiyse) seçim atlanır.
      if (visible) {
        const pending = consumePendingCategorySelection();
        if (pending && (pending.type === 'gelir' || pending.type === 'gider')) {
          const family = resolveCategoryFamily(form.type);
          if (family === pending.type) {
            form.setKategoriId(pending.id);
            modals.setSelectedCategoryType(pending.type);
            modals.setCategoryPickerOpen(false);
          }
        }
      }
    }, [modals.setNavigatedAway, visible, form.type, form.setKategoriId, modals.setSelectedCategoryType, modals.setCategoryPickerOpen])
  );

  // Handle backdrop press - two-step dismiss
  const handleBackdropPress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (animation.isKeyboardVisible) {
      Keyboard.dismiss();
    } else {
      handleDismiss();
    }
  }, [handleDismiss, animation.isKeyboardVisible]);

  // Submit hook
  const submit = useTransactionSubmit({
    visible,
    enableScopedV2Create:
      mode === 'create' && !transactionId && !!scopedCreateContext,
    isViewer,
    isCariMode: form.isCariMode,
    isPersonelMode: form.isPersonelMode,
    isEditMode: form.isEditMode,
    suppressLastUsed,
    // Edit mode props
    mode,
    transactionId,
    isScheduledTransaction,
    // Form state
    type: form.type,
    amount: form.amount,
    description: form.description,
    safeDate: form.safeDate,
    safeDateEnd: form.safeDateEnd,
    vadeTarihi: form.safeVadeTarihi,
    taksitPlan,
    kategoriId: form.kategoriId,
    isScheduled: form.isScheduled,
    odemeHedefType: form.odemeHedefType,
    tahsilatHedefType: form.tahsilatHedefType,
    categorySkipped: modals.categorySkipped,
    // DB'den yüklenen mevcut storage path yeni yerel fotoğraf değildir; editte tekrar
    // sıkıştırılıp upload edilmesin. Yalnız kullanıcı gerçekten yeni fotoğraf seçtiyse gönder.
    photoUri: !isOwner
      ? null
      : form.photoUri && form.photoUri !== form.originalPhotoPath
        ? form.photoUri
        : null,
    originalPhotoPath:
      isOwner && form.isEditMode
        ? form.originalPhotoPath
        : null,
    removeOriginalPhoto:
      isOwner
      && form.isEditMode
      && !!form.originalPhotoPath
      && form.photoUri === null,
    hesapId: form.hesapId,
    hedefHesapId: form.hedefHesapId,
    sourceHesapId: form.sourceHesapId,
    cariId: form.cariId,
    personelId: form.personelId,
    hedefIslemId,
    hesaplar: entities.hesaplar,
    cariler: entities.carilerForType,
    personelList: entities.personelList,
    urunItems: form.urunItems,
    productItemsResolved: isProductItemsResolved,
    persistedProductItemCount,
    productEditDataResolved: form.productEditDataResolved,
    editableProductItemCount: form.editableProductItemCount,
    editTransactionCreatedBy: form.editTransactionCreatedBy,
    setIsSaving: form.setIsSaving,
    setHesapPickerTarget: modals.setHesapPickerTarget,
    setShowHesapPicker: modals.setShowHesapPicker,
    setShowCariPicker: modals.setShowCariPicker,
    setShowPersonelPicker: modals.setShowPersonelPicker,
    setShowOdemeHedefTypePicker: modals.setShowOdemeHedefTypePicker,
    setShowTahsilatHedefTypePicker: modals.setShowTahsilatHedefTypePicker,
    setShowKrediKartiPicker: modals.setShowKrediKartiPicker,
    setCategoryPickerOpen: modals.setCategoryPickerOpen,
    setPendingModal: modals.setPendingModal,
    setShowExchangeRateBar: modals.setShowExchangeRateBar,
    setPendingExchangeData: form.setPendingExchangeData,
    pendingExchangeData: form.pendingExchangeData,
    editOriginal: form.editOriginal,
    onSuccess,
    handleDismiss,
  });

  const handleInstallmentGuardedSave = useCallback(async () => {
    if (!installmentEditRequired) {
      submit.handleSave();
      return;
    }
    if (!canSubmitThroughInstallmentEditGuard(installmentEditGuardReason)) {
      if (installmentEditGuardReason === 'installment') {
        dismissForInstallmentEditGuard('installment');
      } else if (installmentEditGuardReason === 'query_error') {
        dismissForInstallmentEditGuard(
          'query_error',
          installmentEditQuery.error,
        );
      }
      return;
    }

    // Mount kontrolünden sonra başka cihazda plan oluşturulmuş olabilir. Edit
    // yazısından hemen önce bir kez daha sunucuyu doğrula; hata/plan sonucu
    // fail-closed kalır ve finansal mutation hiç başlamaz.
    const refreshed = await installmentEditQuery.refetch();
    const refreshedReason = getInstallmentEditGuardReason({
      required: true,
      data: refreshed.data,
      isSuccess: refreshed.isSuccess,
      isFetching: false,
      isError: refreshed.isError || refreshed.isRefetchError,
    });
    if (refreshedReason === 'installment') {
      dismissForInstallmentEditGuard('installment');
      return;
    }
    if (refreshedReason === 'query_error') {
      dismissForInstallmentEditGuard('query_error', refreshed.error);
      return;
    }
    if (refreshedReason !== 'allowed') return;
    submit.handleSave();
  }, [
    dismissForInstallmentEditGuard,
    installmentEditGuardReason,
    installmentEditQuery,
    installmentEditRequired,
    submit,
  ]);

  // ── A1: son-kullanılan hesap/kategori ön-doldurma ──────────────────────────
  // Bar her açılışında belleği diskten tazele (aynı oturumda yapılan kayıtlar yansısın;
  // kayıt useTransactionSubmit içinde fire-and-forget diske yazılır).
  useEffect(() => {
    if (visible) {
      lastUsed.reload();
      // SOKET ISITMA (kaydet-asılması fix'i): bayat idle keep-alive soketi kayıt anında
      // 3-5sn stall yapıyordu (app_events teşhisi: backend-health maks 5sn, submit ort ~9sn,
      // ~2-3dk hareketsizlik sonrası). Bar açılınca hafif bir sağlık isteği (fire-and-forget)
      // soketi TAZELER; bayat-soket cezası kullanıcı formu doldururken arka planda yutulur →
      // Kaydet'e basıldığında doğrudan RPC sıcak sokette hızlı biter.
      void checkBackendConnectivity();
    }
  }, [visible, lastUsed.reload]);

  // Mevcut işlem tipinin kategori ailesi (gelir/gider) — doğrulama + prefill anahtarı.
  const currentCategoryFamily = resolveCategoryFamily(form.type);
  // Doğrulama listesi: CategoryPicker ile AYNI sorgu anahtarı → cache isabeti (ek ağ yok).
  const { data: kategorilerForFamily } = useKategoriSecimReferanslari(
    currentCategoryFamily,
    true,
  );

  // selectedCategoryType override'ını mevcut aileyle senkron tut → tip değişince bayat
  // override CategoryPicker'ı yanlış ailede göstermesin (mis-tag guard; latent bug fix).
  useEffect(() => {
    if (modals.selectedCategoryType && modals.selectedCategoryType !== currentCategoryFamily) {
      modals.setSelectedCategoryType(currentCategoryFamily ?? null);
    }
  }, [currentCategoryFamily, modals.selectedCategoryType, modals.setSelectedCategoryType]);

  // Kategori OTOMATİK ön-doldurma BİLİNÇLİ OLARAK kaldırıldı (Dilim 1, #4).
  // Neden: son-kullanılan kategoriyi sessizce doldurmak, kullanıcının fark etmeden yanlış
  // kategoriyle kaydetmesine yol açıyordu (mis-tag riski; cihaz geri bildirimi). Kategori
  // görünmez bir varsayılan değil, bilinçli bir seçim olmalı → save-gate kullanıcıya seçtirir.
  // "Son 3 kategori" ÖNERİSİ aşağıdaki görünür chip satırı olarak KALIR (dokununca seçilir).
  // Hesap ön-doldurma da KALIR (form hook'unda; seçim kutusunda görünür, yanlışsa bariz).

  // A1: "son kullanılan" kategori chip'leri için çözümlenmiş liste (canlı listeye karşı
  // doğrulanmış → silinmiş id'ler otomatik düşer; en fazla 3).
  const recentKategoriIds = lastUsed.getRecentKategoriIds(currentCategoryFamily);
  const recentCategories = useMemo(() => {
    // #4b: chip satırı artık cari/personel modda da görünür (persist o modlara genişletildi;
    // kaynak mutabakat kuyruğu suppressLastUsed ile hariç tutuldu). Aile eşlemesi chip ile
    // persist'te aynı fonksiyondur (getCategoryType) → chip'ler cari işlemlerinden dolar.
    // Viewer (salt-görüntüleme linkli cari) modunda gizli: kategori bağlamı belirsiz.
    if (isViewer) return [];
    if (!kategorilerForFamily || recentKategoriIds.length === 0) return [];
    return recentKategoriIds
      .map((id) => kategorilerForFamily.find((k) => k.id === id))
      .filter((k): k is NonNullable<typeof k> => !!k)
      .slice(0, 3)
      .map((k) => ({ id: k.id, name: k.name, color: k.color }));
  }, [isViewer, kategorilerForFamily, recentKategoriIds]);

  // Handle hesap selection from picker
  const handleHesapSelect = useCallback(
    (hesapId: string) => {
      if (modals.hesapPickerTarget === 'source') {
        form.setSourceHesapId(hesapId);
      } else {
        form.setHedefHesapId(hesapId);
      }
      modals.setShowHesapPicker(false);
      modals.setHesapSearchQuery('');
    },
    [modals, form]
  );

  // Handle cari selection from picker
  const handleCariSelect = useCallback(
    (selectedCariId: string) => {
      form.setCariId(selectedCariId);
      modals.setShowCariPicker(false);
      modals.setCariSearchQuery('');
    },
    [form, modals]
  );

  // Picker'ın müşteri/tedarikçi bağlamı: cari modunda defaultCariType belirler,
  // normal modda tahsilat hedefi (tedarikçi tahsilatı -> tedarikçi), aksi halde
  // müşteri; ödeme -> tedarikçi. Bu, picker başlığı/ikonu + inline cari oluşturma
  // tipinin (müşteri/tedarikçi) doğru olmasını sağlar.
  const cariPickerMode: 'customer' | 'supplier' = form.isCariMode
    ? effectiveScopedCariType === 'tedarikci'
      ? 'supplier'
      : 'customer'
    : form.type === 'tahsilat'
      ? form.tahsilatHedefType === 'tedarikci'
        ? 'supplier'
        : 'customer'
      : form.type === 'satis'
        ? 'customer'
        : 'supplier';

  // Inline cari oluşturma (v1.5): picker'da aranan isim yoksa "+ ekle" ile
  // formdan çıkmadan cari yaratılır ve otomatik seçilir.
  const createCari = useCreateCari();
  const handleCariCreateNew = useCallback(
    (name: string) => {
      createCari.mutate(
        { name, type: cariPickerMode === 'customer' ? 'musteri' : 'tedarikci' },
        { onSuccess: (yeniCari) => handleCariSelect(yeniCari.id) }
      );
    },
    [createCari, cariPickerMode, handleCariSelect]
  );

  // Inline ürün oluşturma: picker'da aranan ürün yoksa "+ yeni ekle" ile oluştur + otomatik seç.
  const createUrun = useCreateUrun();
  const { currency: userCurrency } = useSettings();
  // Ürün fiyatları, uygulamanın yalnızca gösterim tercihiyle değil işlemin gerçek
  // para birimiyle gösterilip kaydedilmeli. Cari alış/satışlarında gerçek bacak
  // caridir; gelir/giderde hesaptır. Hedef henüz seçilmediyse mevcut davranışın
  // güvenli varsayılanı olarak kullanıcının gösterim para birimine düşeriz.
  const productTransactionCurrency = useMemo(() => {
    if (['alis', 'satis', 'alis_iade', 'satis_iade'].includes(form.type)) {
      return (entities.selectedCari?.currency ?? userCurrency) as Currency;
    }
    if (form.type === 'kredi_karti_gider') {
      return (
        entities.selectedKrediKarti?.currency
        ?? entities.selectedHesap?.currency
        ?? userCurrency
      ) as Currency;
    }
    return (entities.selectedHesap?.currency ?? userCurrency) as Currency;
  }, [
    entities.selectedCari?.currency,
    entities.selectedHesap?.currency,
    entities.selectedKrediKarti?.currency,
    form.type,
    userCurrency,
  ]);
  const handleUrunCreateNew = useCallback(
    async (name: string): Promise<Urun | undefined> => {
      try {
        return await createUrun.mutateAsync({
          ad: name.trim(),
          birim: 'adet',
          kdv_orani: 0,
          alis_fiyati: 0,
          satis_fiyati: 0,
          currency: productTransactionCurrency,
        });
      } catch {
        return undefined;
      }
    },
    [createUrun, productTransactionCurrency]
  );

  const handleOpenTaksitConfig = useCallback(() => {
    Keyboard.dismiss();

    const count = taksitPlan?.adet ?? 3;
    const planDateStale =
      !!taksitPlan &&
      formatDateForDB(taksitPlan.ilkVade) < formatDateForDB(form.safeDate);
    const firstDueDate =
      taksitPlan && !planDateStale
        ? taksitPlan.ilkVade
        : addMonths(form.safeDate, 1);
    const wasStale =
      !!taksitPlan &&
      (currentTaksitTotalCents === null ||
        taksitPlan.totalCents !== currentTaksitTotalCents ||
        planDateStale);
    let locks = taksitPlan?.lockedRows.map((row) => ({ ...row })) ?? [];
    // Baz vade bayatladıysa satır bazlı özel vadeler de anlamını yitirir.
    const overrides = planDateStale
      ? []
      : taksitPlan?.dateOverrides.map((row) => ({ ...row })) ?? [];

    setTaksitAdetDraft(count);
    setTaksitIlkVadeDraft(firstDueDate);
    setTaksitDraftWasStale(wasStale);
    setEditingTaksitIndex(null);
    setEditingTaksitText('');
    setEditingVadeIndex(null);
    setTaksitDraftDateOverrides(overrides);

    if (currentTaksitTotalCents === null) {
      setTaksitPreviewPlan(null);
      setTaksitDraftLocks([]);
      setTaksitDraftError('INVALID_TOTAL_CENTS');
      setShowTaksitConfig(true);
      return;
    }

    let result = buildInstallmentPlan(
      currentTaksitTotalCents,
      count,
      firstDueDate,
      locks,
      overrides
    );

    // Tutar küçüldüğünde eski elle-sabitlenmiş satırlar yeni toplamı aşabilir.
    // Kullanıcının planını sessizce kaydetmek yerine kilitleri temizleyip yeni,
    // doğrulanabilir dağılımı önizle; eski committed plan Apply'a kadar korunur.
    if (!result.ok && wasStale && locks.length > 0) {
      locks = [];
      result = buildInstallmentPlan(
        currentTaksitTotalCents,
        count,
        firstDueDate,
        [],
        overrides
      );
    }

    setTaksitDraftLocks(locks);
    if (result.ok) {
      setTaksitPreviewPlan(result.plan);
      setTaksitDraftError(null);
    } else {
      setTaksitPreviewPlan(null);
      setTaksitDraftError(result.error.code);
    }
    setShowTaksitConfig(true);
  }, [currentTaksitTotalCents, form.safeDate, taksitPlan]);

  const rebuildTaksitDraft = useCallback(
    (
      count: number,
      firstDueDate: Date,
      locks: LockedInstallmentRow[],
      clearPreviewOnError = false,
      overrides?: InstallmentDateOverride[]
    ): InstallmentPlan | null => {
      if (currentTaksitTotalCents === null) {
        if (clearPreviewOnError) setTaksitPreviewPlan(null);
        setTaksitDraftError('INVALID_TOTAL_CENTS');
        return null;
      }

      const result = buildInstallmentPlan(
        currentTaksitTotalCents,
        count,
        firstDueDate,
        locks,
        overrides ?? taksitDraftDateOverrides
      );
      if (!result.ok) {
        if (clearPreviewOnError) setTaksitPreviewPlan(null);
        setTaksitDraftError(result.error.code);
        return null;
      }

      setTaksitPreviewPlan(result.plan);
      setTaksitDraftLocks(result.plan.lockedRows);
      setTaksitDraftDateOverrides(result.plan.dateOverrides);
      setTaksitDraftError(null);
      return result.plan;
    },
    [currentTaksitTotalCents, taksitDraftDateOverrides]
  );

  // Modal içi tutar girişi: toplam değişince önizleme canlı yeniden kurulur.
  // Kilitli satırlar yeni toplama sığmazsa kilitler bırakılıp tekrar denenir
  // (açılıştaki stale davranışının canlı hali). Dar dep listesi bilinçli:
  // rebuild kendi state'lerini güncellediği için tam liste döngü üretir.
  useEffect(() => {
    if (!showTaksitConfig || editingTaksitIndex !== null) return;
    if (currentTaksitTotalCents === null) {
      setTaksitPreviewPlan(null);
      setTaksitDraftError('INVALID_TOTAL_CENTS');
      return;
    }
    const rebuilt = rebuildTaksitDraft(
      taksitAdetDraft,
      taksitIlkVadeDraft,
      taksitDraftLocks,
      true
    );
    if (!rebuilt && taksitDraftLocks.length > 0) {
      setTaksitDraftLocks([]);
      rebuildTaksitDraft(taksitAdetDraft, taksitIlkVadeDraft, [], true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTaksitTotalCents, showTaksitConfig]);

  const handleTaksitCountChange = useCallback(
    (nextCount: number) => {
      if (editingTaksitIndex !== null) return;

      setTaksitAdetInput(null);
      const count = Math.max(
        MIN_INSTALLMENT_COUNT,
        Math.min(MAX_INSTALLMENT_COUNT, nextCount)
      );
      if (count === taksitAdetDraft) return;

      Keyboard.dismiss();
      setEditingTaksitIndex(null);
      setEditingTaksitText('');
      setEditingVadeIndex(null);
      setTaksitAdetDraft(count);
      setTaksitDraftLocks([]);
      // Adet değişince satır kilitleri gibi elle vadeler de sıfırlanır.
      setTaksitDraftDateOverrides([]);
      rebuildTaksitDraft(count, taksitIlkVadeDraft, [], true, []);
    },
    [
      editingTaksitIndex,
      rebuildTaksitDraft,
      taksitAdetDraft,
      taksitIlkVadeDraft,
    ]
  );

  // Taksit sayısı elle yazımı: blur/enter'da 2–48'e sıkıştırıp uygular; boş
  // veya sayı-dışı girişte mevcut değer korunur.
  const commitTaksitAdetInput = useCallback(() => {
    if (taksitAdetInput === null) return;
    const parsed = Number.parseInt(taksitAdetInput, 10);
    setTaksitAdetInput(null);
    if (!Number.isFinite(parsed)) return;
    handleTaksitCountChange(parsed);
  }, [taksitAdetInput, handleTaksitCountChange]);

  const handleTaksitDateChange = useCallback(
    (date: Date) => {
      if (editingTaksitIndex !== null) return;
      setTaksitIlkVadeDraft(date);
      rebuildTaksitDraft(taksitAdetDraft, date, taksitDraftLocks, true);
    },
    [
      editingTaksitIndex,
      rebuildTaksitDraft,
      taksitAdetDraft,
      taksitDraftLocks,
    ]
  );

  // Satır vadesine dokununca o satırın satır-içi tarih seçicisi açılır/kapanır.
  const handlePressTaksitRowDate = useCallback(
    (index: number) => {
      if (editingTaksitIndex !== null) return;
      Keyboard.dismiss();
      setShowTaksitVadePicker(false);
      setEditingVadeIndex((value) => (value === index ? null : index));
    },
    [editingTaksitIndex]
  );

  // Satır vadesi seçimi: varsayılana (ilkVade + n ay) dönerse override silinir.
  const handleTaksitRowDateChange = useCallback(
    (index: number, date: Date) => {
      const picked = formatDateForDB(date);
      const defaultDate = formatDateForDB(addMonths(taksitIlkVadeDraft, index));
      const nextOverrides = [
        ...taksitDraftDateOverrides.filter((row) => row.index !== index),
        ...(picked === defaultDate ? [] : [{ index, dueDate: picked }]),
      ].sort((a, b) => a.index - b.index);
      setTaksitDraftDateOverrides(nextOverrides);
      rebuildTaksitDraft(
        taksitAdetDraft,
        taksitIlkVadeDraft,
        taksitDraftLocks,
        false,
        nextOverrides
      );
    },
    [
      rebuildTaksitDraft,
      taksitAdetDraft,
      taksitDraftDateOverrides,
      taksitDraftLocks,
      taksitIlkVadeDraft,
    ]
  );

  const buildTaksitDraftWithEdit = useCallback(
    (index: number, rawAmount: string): InstallmentPlan | null => {
      const amountCents = amountToCents(parseCurrency(rawAmount));
      if (amountCents === null) {
        setTaksitDraftError('INVALID_LOCKED_AMOUNT');
        return null;
      }

      const nextLocks = [
        ...taksitDraftLocks.filter((row) => row.index !== index),
        { index, amountCents },
      ].sort((a, b) => a.index - b.index);
      return rebuildTaksitDraft(
        taksitAdetDraft,
        taksitIlkVadeDraft,
        nextLocks
      );
    },
    [rebuildTaksitDraft, taksitAdetDraft, taksitDraftLocks, taksitIlkVadeDraft]
  );

  const handleCommitTaksitEdit = useCallback(
    (index: number, rawAmount: string) => {
      buildTaksitDraftWithEdit(index, rawAmount);
      setEditingTaksitIndex(null);
      setEditingTaksitText('');
    },
    [buildTaksitDraftWithEdit]
  );

  const handleToggleTaksitLock = useCallback(
    (index: number, row: InstallmentRpcRow) => {
      if (editingTaksitIndex !== null) return;

      const existing = taksitDraftLocks.some((lock) => lock.index === index);
      const rowCents = amountToCents(row.tutar);
      if (!existing && rowCents === null) {
        setTaksitDraftError('INVALID_LOCKED_AMOUNT');
        return;
      }

      const nextLocks = existing
        ? taksitDraftLocks.filter((lock) => lock.index !== index)
        : [
            ...taksitDraftLocks,
            { index, amountCents: rowCents as number },
          ].sort((a, b) => a.index - b.index);
      rebuildTaksitDraft(
        taksitAdetDraft,
        taksitIlkVadeDraft,
        nextLocks
      );
    },
    [
      editingTaksitIndex,
      rebuildTaksitDraft,
      taksitAdetDraft,
      taksitDraftLocks,
      taksitIlkVadeDraft,
    ]
  );

  const handleTaksitDistributionPreset = useCallback(
    (target: 'first' | 'last' | 'reset') => {
      if (editingTaksitIndex !== null) return;

      if (currentTaksitTotalCents === null) {
        setTaksitDraftError('INVALID_TOTAL_CENTS');
        return;
      }

      Keyboard.dismiss();
      setEditingTaksitIndex(null);
      setEditingTaksitText('');

      const base = buildInstallmentPlan(
        currentTaksitTotalCents,
        taksitAdetDraft,
        taksitIlkVadeDraft,
        [],
        taksitDraftDateOverrides
      );
      if (!base.ok) {
        setTaksitPreviewPlan(null);
        setTaksitDraftError(base.error.code);
        return;
      }

      if (target === 'reset') {
        setTaksitDraftLocks([]);
        setTaksitPreviewPlan(base.plan);
        setTaksitDraftError(null);
        return;
      }

      const residualRow = base.plan.rows[base.plan.rows.length - 1];
      const residualCents = residualRow ? amountToCents(residualRow.tutar) : null;
      if (residualCents === null) {
        setTaksitDraftError('DISTRIBUTION_INVARIANT_FAILED');
        return;
      }

      const index = target === 'first' ? 0 : taksitAdetDraft - 1;
      rebuildTaksitDraft(
        taksitAdetDraft,
        taksitIlkVadeDraft,
        [{ index, amountCents: residualCents }]
      );
    },
    [
      currentTaksitTotalCents,
      editingTaksitIndex,
      rebuildTaksitDraft,
      taksitAdetDraft,
      taksitDraftDateOverrides,
      taksitIlkVadeDraft,
    ]
  );

  const handleApplyTaksitPlan = useCallback(() => {
    let candidate = taksitPreviewPlan;
    if (editingTaksitIndex !== null) {
      candidate = buildTaksitDraftWithEdit(
        editingTaksitIndex,
        editingTaksitText
      );
    }
    if (
      !candidate ||
      currentTaksitTotalCents === null ||
      candidate.adet !== taksitAdetDraft ||
      formatDateForDB(candidate.ilkVade) !== formatDateForDB(taksitIlkVadeDraft) ||
      formatDateForDB(candidate.ilkVade) < formatDateForDB(form.safeDate)
    ) {
      setTaksitDraftError('INVALID_FIRST_DUE_DATE');
      return;
    }

    setTaksitPlan(candidate);
    form.setVadeTarihi(null);
    setTaksitDraftWasStale(false);
    setShowTaksitConfig(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [
    buildTaksitDraftWithEdit,
    currentTaksitTotalCents,
    editingTaksitIndex,
    editingTaksitText,
    form,
    taksitAdetDraft,
    taksitIlkVadeDraft,
    taksitPreviewPlan,
  ]);

  const editingTaksitCents =
    editingTaksitIndex === null
      ? null
      : amountToCents(parseCurrency(editingTaksitText));
  const pendingEditedTaksitResult = useMemo(() => {
    if (
      editingTaksitIndex === null ||
      currentTaksitTotalCents === null ||
      editingTaksitCents === null
    ) {
      return null;
    }

    const nextLocks = [
      ...taksitDraftLocks.filter((row) => row.index !== editingTaksitIndex),
      { index: editingTaksitIndex, amountCents: editingTaksitCents },
    ].sort((a, b) => a.index - b.index);

    return buildInstallmentPlan(
      currentTaksitTotalCents,
      taksitAdetDraft,
      taksitIlkVadeDraft,
      nextLocks,
      taksitDraftDateOverrides
    );
  }, [
    currentTaksitTotalCents,
    editingTaksitCents,
    editingTaksitIndex,
    taksitAdetDraft,
    taksitDraftDateOverrides,
    taksitDraftLocks,
    taksitIlkVadeDraft,
  ]);
  const effectiveTaksitPreviewPlan =
    pendingEditedTaksitResult?.ok === true
      ? pendingEditedTaksitResult.plan
      : taksitPreviewPlan;
  const lockedTaksitIndexes = useMemo(
    () =>
      new Set(
        (effectiveTaksitPreviewPlan?.lockedRows ?? taksitDraftLocks).map(
          (row) => row.index
        )
      ),
    [effectiveTaksitPreviewPlan, taksitDraftLocks]
  );
  const taksitPreviewTotalCents = useMemo(
    () =>
      (effectiveTaksitPreviewPlan?.rows ?? []).reduce(
        (sum, row, index) => {
          const rowCents =
            editingTaksitIndex === index && editingTaksitCents !== null
              ? editingTaksitCents
              : amountToCents(row.tutar) ?? 0;
          return sum + rowCents;
        },
        0
      ),
    [editingTaksitCents, editingTaksitIndex, effectiveTaksitPreviewPlan]
  );
  const taksitDifferenceCents =
    taksitPreviewTotalCents - (currentTaksitTotalCents ?? 0);
  const visibleTaksitDraftError =
    editingTaksitIndex === null
      ? taksitDraftError
      : editingTaksitCents === null
        ? 'INVALID_LOCKED_AMOUNT'
        : pendingEditedTaksitResult && !pendingEditedTaksitResult.ok
          ? pendingEditedTaksitResult.error.code
          : null;
  const isTaksitDraftValid =
    !!effectiveTaksitPreviewPlan &&
    currentTaksitTotalCents !== null &&
    visibleTaksitDraftError === null &&
    effectiveTaksitPreviewPlan.adet === taksitAdetDraft &&
    formatDateForDB(effectiveTaksitPreviewPlan.ilkVade) ===
      formatDateForDB(taksitIlkVadeDraft) &&
    formatDateForDB(effectiveTaksitPreviewPlan.ilkVade) >=
      formatDateForDB(form.safeDate) &&
    (editingTaksitIndex === null
      ? taksitDifferenceCents === 0
      : pendingEditedTaksitResult?.ok === true) &&
    effectiveTaksitPreviewPlan.rows.every(
      (row) => (amountToCents(row.tutar) ?? 0) >= 1
    );

  const taksitDraftErrorText = useMemo(() => {
    if (!visibleTaksitDraftError) return null;
    if (visibleTaksitDraftError === 'INVALID_TOTAL_CENTS') {
      return t('transactions:taksit.tutarOnce');
    }
    if (
      visibleTaksitDraftError === 'TOTAL_TOO_SMALL' ||
      visibleTaksitDraftError === 'INVALID_LOCKED_AMOUNT' ||
      visibleTaksitDraftError === 'INSUFFICIENT_REMAINDER'
    ) {
      return t('transactions:taksit.enAzBirKurus');
    }
    return t('transactions:taksit.dagitimGecersiz');
  }, [t, visibleTaksitDraftError]);

  const overriddenTaksitIndexes = useMemo(
    () => new Set(taksitDraftDateOverrides.map((row) => row.index)),
    [taksitDraftDateOverrides]
  );

  const renderTaksitRow = useCallback(
    ({ item, index }: { item: InstallmentRpcRow; index: number }) => (
      <InstallmentPreviewRow
        row={item}
        index={index}
        isLocked={lockedTaksitIndexes.has(index)}
        isEditing={editingTaksitIndex === index}
        editingText={editingTaksitText}
        formatDate={formatDateMedium}
        onStartEditing={(rowIndex, value) => {
          setEditingTaksitIndex(rowIndex);
          setEditingTaksitText(value);
        }}
        onEditingTextChange={setEditingTaksitText}
        onCommitEditing={handleCommitTaksitEdit}
        onToggleLock={handleToggleTaksitLock}
        lockControlsDisabled={editingTaksitIndex !== null}
        isDateEditing={editingVadeIndex === index}
        isDateOverridden={overriddenTaksitIndexes.has(index)}
        onPressDate={handlePressTaksitRowDate}
        onDateChange={handleTaksitRowDateChange}
        minimumDueDate={form.safeDate}
        pickerLocale={locale}
        t={t}
      />
    ),
    [
      editingTaksitIndex,
      editingTaksitText,
      editingVadeIndex,
      form.safeDate,
      formatDateMedium,
      handleCommitTaksitEdit,
      handlePressTaksitRowDate,
      handleTaksitRowDateChange,
      handleToggleTaksitLock,
      locale,
      lockedTaksitIndexes,
      overriddenTaksitIndexes,
      t,
    ]
  );

  // Handle personel selection from picker
  const handlePersonelSelect = useCallback(
    (selectedPersonelId: string) => {
      form.setPersonelId(selectedPersonelId);
      modals.setShowPersonelPicker(false);
      modals.setPersonelSearchQuery('');
    },
    [form, modals]
  );

  // Handle odeme type selection
  const handleOdemeTypeSelect = useCallback(
    (selectedType: typeof form.odemeHedefType, nextModal: 'cari' | 'personel' | 'hesap') => {
      form.setOdemeHedefType(selectedType);
      form.setCariId(null);
      form.setPersonelId(null);
      if (selectedType === 'kredi_karti') {
        form.setHedefHesapId(null);
      }
      modals.setShowOdemeHedefTypePicker(false);

      setTimeout(() => {
        if (nextModal === 'cari') {
          if (!form.kategoriId && !modals.categorySkipped) {
            modals.setPendingModal('category');
          }
          modals.setShowCariPicker(true);
        } else if (nextModal === 'personel') {
          if (!form.kategoriId && !modals.categorySkipped) {
            modals.setPendingModal('category');
          }
          modals.setShowPersonelPicker(true);
        } else if (nextModal === 'hesap') {
          if (form.sourceHesapId) {
            // Source account already set (user came from a specific account) — skip to credit card picker
            modals.setShowKrediKartiPicker(true);
          } else {
            modals.setPendingModal('kredi_karti');
            modals.setHesapPickerTarget('source');
            modals.setShowHesapPicker(true);
          }
        }
      }, 250);
    },
    [form, modals]
  );

  // Handle tahsilat type selection
  const handleTahsilatTypeSelect = useCallback(
    (selectedType: typeof form.tahsilatHedefType, nextModal: 'cari' | 'personel') => {
      form.setTahsilatHedefType(selectedType);
      form.setCariId(null);
      form.setPersonelId(null);
      modals.setShowTahsilatHedefTypePicker(false);

      setTimeout(() => {
        if (!form.kategoriId && !modals.categorySkipped) {
          modals.setPendingModal('category');
        }
        if (nextModal === 'cari') {
          modals.setShowCariPicker(true);
        } else {
          modals.setShowPersonelPicker(true);
        }
      }, 250);
    },
    [form, modals]
  );

  // Handle kredi karti selection
  const handleKrediKartiSelect = useCallback(
    (hesapId: string) => {
      form.setHedefHesapId(hesapId);
      modals.setShowKrediKartiPicker(false);
    },
    [form, modals]
  );

  // Handle pending modal
  const handlePendingModalHandled = useCallback(
    (modal: 'category' | 'kredi_karti' | 'cari' | 'personel' | null) => {
      if (modal === 'category' || modal === 'kredi_karti') {
        // When products are selected, skip category picker (products provide their own categorization)
        const effectiveKategoriId = form.urunItems.length > 0 ? 'skip' : form.kategoriId;
        modals.handlePendingModalHandled(modal, effectiveKategoriId);
      }
    },
    [modals, form.kategoriId, form.urunItems.length]
  );

  if (
    !visible
    || (
      requestedAccountReferenceScope !== undefined
      && !minimalAccountRefsAllowed
    )
    || (scopedCreateRequested !== undefined && !scopedCreateContext)
    || (allowedTypes !== undefined && allowedTypes.length === 0)
  ) {
    return null;
  }

  const buttonColor = getTransactionTypeColor(form.type);
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
    personel_satis_tab: t('transactions:tabs.personel_satis'),
    personel_izin_hakki_tab: t('transactions:tabs.personel_izin_hakki'),
    personel_izin_kullanimi_tab: t('transactions:tabs.personel_izin_kullanimi'),
    kredi_karti_gider: t('transactions:tabs.kredi_karti_gider'),
    kredi_karti_odeme: t('transactions:tabs.kredi_karti_odeme'),
    kredi_karti_ekstre: t('transactions:tabs.kredi_karti_ekstre'),
  };
  // In edit mode, show "Update" instead of transaction type
  const buttonLabel = form.isEditMode
    ? t('common:buttons.update')
    : buttonLabels[form.type];

  // Category picker type mapping
  const getCategoryType = (): 'gelir' | 'gider' | undefined => {
    if (form.type === 'gelir' || form.type === 'tahsilat' || form.type === 'satis') return 'gelir';
    if (form.type === 'gider' || form.type === 'odeme' || form.type === 'transfer' || form.type === 'alis')
      return 'gider';
    if (form.type === 'satis_iade') return 'gelir';
    if (form.type === 'alis_iade') return 'gider';
    if (form.type === 'personel_tahsilat_tab' || form.type === 'personel_satis_tab') return 'gelir';
    if (form.type === 'personel_odeme_tab' || form.type === 'personel_gider_tab') return 'gider';
    return undefined;
  };
  const categoryType = modals.selectedCategoryType || getCategoryType();

  // Seçili ürünler desteklenmeyen bir sekmeye geçilince de düğmeyi görünür
  // tut: kullanıcı ürünleri kaldırabilsin; kaydetme katmanı bu durumda fail-closed.
  const showUrunButton =
    entities.hasUrunler
    && (
      supportsQuickTransactionProducts(form.type)
      || form.urunItems.length > 0
    );

  // Vade (ödeme tarihi) — yalnız borç-doğuran (alış/satış) + non-scheduled tiplerde. İleri-tarihli
  // (Bell) ile BİLİNÇLİ olarak ayrı: bu, var olan borcun ödeme vadesi (scheduled = henüz olmamış işlem).
  const showVade = (form.type === 'alis' || form.type === 'satis') && !form.isScheduled;

  // Position card above keyboard and tab bar
  const cardBottom = animation.keyboardHeight > 0
    ? animation.keyboardHeight
    : insets.bottom + TAB_BAR_HEIGHT + 10;

  // Kart + üstündeki ✕ butonu EKRANA SIĞMALI: içerik uzayınca (hedef chip'leri,
  // kategori önerileri vs.) kart ekranın üstünden taşıyor ve ✕ görünmez oluyordu.
  // Üst bölge (tarih/hesap/hedef) gerekirse kendi içinde kayar; tutar + kaydet +
  // sekmeler HEP görünür kalır. 44 = ✕ (36) + boşluk (8).
  const cardMaxHeight = Math.max(280, windowHeight - cardBottom - insets.top - 44 - 8);

  return (
    <Modal visible={visible && !modals.navigatedAway} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Card + kartın dışında sağ üstte duran kapatma butonu.
          box-none: sarmalayıcının boş (şeffaf) alanı dokunuşu YUTMASIN — X'in solu/üstü
          backdrop'a geçer, backdrop davranışı (klavye kapat → QTB kapat) korunur. */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.cardWrapper,
          {
            bottom: cardBottom,
            opacity: animation.opacity,
            transform: [{ translateY: animation.translateY }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.floatingClose}
          onPress={handleDismiss}
          hitSlop={HIT_SLOP.md}
        >
          <X size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={[styles.card, { maxHeight: cardMaxHeight }]}>
          {/* Üst bölge: kart maxHeight'i aşarsa yalnız burası kayar (tutar/kaydet sabit).
              flexGrow:0 → içerik kısayken ekstra yer kaplamaz, davranış değişmez. */}
          <ScrollView
            style={qtbLocal.topScroll}
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
          {/* Header: Date + Bell */}
          <HeaderSection
            date={form.safeDate}
            isScheduled={form.isScheduled}
            formatDateMedium={formatDateMedium}
            onDatePress={() => {
              suspendKeyboardForDatePicker();
              modals.setShowDatePicker(true);
            }}
            onScheduledToggle={() => form.setIsScheduled(!form.isScheduled)}
            showScheduledToggle
            onResetToNow={() => form.setDate(new Date())}
            isLeaveUsageType={isLeaveUsageType}
            dateEnd={form.dateEnd}
            onDateEndPress={() => {
              suspendKeyboardForDatePicker();
              modals.setShowDateEndPicker(true);
            }}
            showVade={showVade}
            vadeTarihi={form.safeVadeTarihi}
            onVadePress={() => {
              suspendKeyboardForDatePicker();
              setTaksitPlan(null);
              setShowVadePicker(true);
            }}
            onVadeClear={() => form.setVadeTarihi(null)}
            onVadePreset={(days) => {
              setTaksitPlan(null);
              form.setVadeTarihi(addDays(form.safeDate, days));
            }}
            vadeLocked={installmentEditQuery.data === true}
            onVadeLockedPress={() => {
              Alert.alert(
                t('transactions:taksit.label'),
                t('transactions:taksit.vadeEditEngel')
              );
            }}
            taksitAdet={taksitPlan?.adet ?? null}
            taksitStale={taksitPlanStale}
            onTaksitPress={
              // Taksit yalnız yeni kayıt + ürünsüz yolda (RPC ürünlü varyantı Faz 3 kapsamı dışı)
              !form.isEditMode && form.urunItems.length === 0
                ? handleOpenTaksitConfig
                : undefined
            }
            onTaksitClear={() => setTaksitPlan(null)}
          />

          {/* Entity Display: Hesap/Cari/Personel bilgisi */}
          <EntityDisplaySection
            type={form.type}
            isCariMode={form.isCariMode}
            isPersonelMode={form.isPersonelMode}
            defaultCariType={effectiveScopedCariType}
            selectedHesap={entities.selectedHesap}
            selectedSourceHesap={entities.selectedSourceHesap}
            selectedCari={entities.selectedCari}
            selectedPersonel={entities.selectedPersonel}
            onOpenHesapPicker={() => {
              modals.setHesapPickerTarget('source');
              modals.setShowHesapPicker(true);
            }}
            onOpenCariPicker={() => modals.setShowCariPicker(true)}
            showAccountBalances={!minimalAccountRefsAllowed}
            showEntityBalances
          />

          {/* Transfer: Kaynak ve Hedef Hesap */}
          {form.type === 'transfer' && (
            <TransferSection
              selectedHesap={entities.selectedHesap}
              selectedHedefHesap={entities.selectedHedefHesap}
              onOpenHedefHesapPicker={() => {
                modals.setHesapPickerTarget('hedef');
                modals.setShowHesapPicker(true);
              }}
            />
          )}

          {/* Ödeme: Kaynak Hesap + Ödeme Türü Seçici (sadece normal modda) */}
          {form.type === 'odeme' && !form.isCariMode && (
            <OdemeSection
              selectedHesap={entities.selectedHesap}
              selectedSourceHesap={entities.selectedSourceHesap}
              selectedCari={entities.selectedCari}
              selectedPersonel={entities.selectedPersonel}
              selectedKrediKarti={entities.selectedKrediKarti}
              odemeHedefType={form.odemeHedefType}
              onOpenOdemeTypePicker={() => modals.setShowOdemeHedefTypePicker(true)}
              onOpenCariPicker={() => modals.setShowCariPicker(true)}
              onOpenPersonelPicker={() => modals.setShowPersonelPicker(true)}
              onOpenSourceHesapPicker={() => {
                modals.setHesapPickerTarget('source');
                modals.setShowHesapPicker(true);
              }}
              onOpenKrediKartiPicker={() => modals.setShowKrediKartiPicker(true)}
            />
          )}

          {/* Tahsilat: Tahsilat Türü + Hedef Hesap Seçici (sadece normal modda) */}
          {form.type === 'tahsilat' && !form.isCariMode && (
            <TahsilatSection
              selectedHesap={entities.selectedHesap}
              selectedHedefHesap={entities.selectedHedefHesap}
              selectedCari={entities.selectedCari}
              selectedPersonel={entities.selectedPersonel}
              tahsilatHedefType={form.tahsilatHedefType}
              onOpenTahsilatTypePicker={() => modals.setShowTahsilatHedefTypePicker(true)}
              onOpenCariPicker={() => modals.setShowCariPicker(true)}
              onOpenPersonelPicker={() => modals.setShowPersonelPicker(true)}
              onOpenHedefHesapPicker={() => {
                modals.setHesapPickerTarget('hedef');
                modals.setShowHesapPicker(true);
              }}
            />
          )}

          </ScrollView>

          {/* Amount Input Section: Category, Description, Amount, Save, Tabs */}
          <AmountInputSection
            amount={form.amount}
            onAmountChange={form.handleAmountChange}
            amountInputRef={amountInputRef}
            descriptionInputRef={descriptionInputRef}
            description={form.description}
            onDescriptionChange={form.setDescription}
            kategoriId={form.kategoriId}
            onKategoriChange={(newKategoriId) => {
              form.setKategoriId(newKategoriId);
              if (newKategoriId) {
                modals.setSelectedCategoryType(categoryType ?? null);
              } else {
                modals.setSelectedCategoryType(null);
              }
            }}
            categoryType={categoryType ?? null}
            recentCategories={recentCategories}
            categoryPickerOpen={
              modals.categoryPickerOpen
              && form.urunItems.length === 0
            }
            onCategoryPickerOpenChange={(open) => {
              // Prevent opening category picker when products are selected
              if (open && form.urunItems.length > 0) {
                return;
              }
              modals.setCategoryPickerOpen(open);
              if (!open && !form.kategoriId) {
                modals.setCategorySkipped(true);
              }
            }}
            onCategoryPickerCloseComplete={restoreAmountKeyboardAfterCategoryPicker}
            // Kategori-ekle'ye giderken QTB KAPANMAZ, gizlenir (ürün akışıyla aynı):
            // dönüşte form korunur + yeni kategori otomatik seçilir (focus effect)
            onNavigateAway={() => modals.setNavigatedAway(true)}
            hasPhoto={isOwner && !!form.photoUri}
            onPickImage={handlePickImage}
            onTakePhoto={handleTakePhoto}
            onRemovePhoto={handleRemovePhoto}
            onViewPhoto={handleViewPhoto}
            photoLoading={pickImage.isPending || takePhoto.isPending}
            isScheduled={form.isScheduled}
            isSaving={
              form.isSaving
              || form.isLoadingTransaction
              || (
                installmentEditRequired
                && installmentEditGuardReason !== 'allowed'
              )
              || (
                form.isEditMode
                && !isScheduledTransaction
                && !isProductItemsResolved
              )
            }
            buttonColor={buttonColor}
            buttonLabel={buttonLabel}
            onSave={handleInstallmentGuardedSave}
            type={form.type}
            onTypeChange={form.setType}
            tabMode={tabMode}
            allowedTypes={visibleTransactionTypes}
            showUrunButton={showUrunButton}
            urunItemCount={form.urunItems.length}
            onUrunButtonPress={() => modals.setShowUrunPicker(true)}
            showPhotoButton={isOwner}
          />
        </View>
      </Animated.View>

      {/* DateTime Picker Modal */}
      <DateTimePickerModal
        visible={modals.showDatePicker}
        onDismiss={() => {
          modals.setShowDatePicker(false);
          restoreKeyboardAfterDatePicker();
        }}
        value={form.safeDate}
        onChange={form.setDate}
        locale={locale}
      />

      {/* Vade (ödeme tarihi) Picker — borç-doğuran işlemde vade; ileri-tarihli picker'dan AYRI */}
      {showVade && (
        <DateTimePickerModal
          visible={showVadePicker}
          onDismiss={() => {
            setShowVadePicker(false);
            restoreKeyboardAfterDatePicker();
          }}
          value={form.safeVadeTarihi || form.safeDate}
          onChange={form.setVadeTarihi}
          locale={locale}
          minimumDate={form.safeDate}
        />
      )}

      {/* Taksit editörü ana QTB Modal'ının İÇİNDE inline overlay'dir. İkinci bir
          RN Modal sunulmaz; iOS'taki modal-üstü-modal donması böylece oluşmaz. */}
      {showTaksitConfig && (
        <View
          style={[
            taksitStyles.overlay,
            {
              paddingTop: insets.top + 12,
              paddingBottom:
                (Platform.OS === 'ios' && animation.isKeyboardVisible
                  ? animation.keyboardHeight
                  : insets.bottom) + 12,
            },
          ]}
        >
          <TouchableWithoutFeedback
            onPress={() => {
              Keyboard.dismiss();
              setShowTaksitConfig(false);
            }}
          >
            <View style={taksitStyles.overlayBackdrop} />
          </TouchableWithoutFeedback>

          <View
            style={[
              taksitStyles.editorContainer,
              {
                width: Math.min(windowWidth - 24, 520),
                maxHeight: Math.max(
                  180,
                  windowHeight -
                    insets.top -
                    (Platform.OS === 'ios' && animation.isKeyboardVisible
                      ? animation.keyboardHeight
                      : insets.bottom) -
                    24
                ),
              },
            ]}
          >
            <View style={taksitStyles.editorTitleRow}>
              <Text style={taksitStyles.editorTitle}>
                {t('transactions:taksit.configTitle')}
              </Text>
              <TouchableOpacity
                style={taksitStyles.editorClose}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowTaksitConfig(false);
                }}
                hitSlop={HIT_SLOP.sm}
                accessibilityRole="button"
                accessibilityLabel={t('common:buttons.close')}
              >
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {taksitDraftWasStale && (
              <View style={taksitStyles.staleBanner}>
                <Text style={taksitStyles.staleTitle}>
                  {t('transactions:taksit.planGuncellenmeli')}
                </Text>
                <Text style={taksitStyles.staleText}>
                  {t('transactions:taksit.planGuncellenmeliAciklama')}
                </Text>
              </View>
            )}

            <FlatList
              style={taksitStyles.planList}
              contentContainerStyle={taksitStyles.planListContent}
              data={effectiveTaksitPreviewPlan?.rows ?? []}
              keyExtractor={(row) => String(row.sira)}
              renderItem={renderTaksitRow}
              extraData={`${editingTaksitIndex ?? 'x'}:${editingTaksitText}:${Array.from(lockedTaksitIndexes).join(',')}:${editingVadeIndex ?? 'x'}:${taksitDraftDateOverrides.map((row) => `${row.index}=${row.dueDate}`).join(',')}`}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
              ListHeaderComponent={
                <View>
                  {/* QTB satır dili: ince çizgili yapışık satırlar, başlık yok. */}
                  <View style={taksitStyles.fieldRow}>
                    <Text style={taksitStyles.fieldLabel}>
                      {t('transactions:form.amount')}
                    </Text>
                    <TextInput
                      style={[
                        taksitStyles.fieldAmountInput,
                        editingTaksitIndex !== null && taksitStyles.controlDisabled,
                      ]}
                      value={form.amount}
                      onChangeText={(text) => form.setAmount(cleanAmountInput(text))}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      editable={editingTaksitIndex === null}
                      placeholder={t('transactions:form.amountPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      accessibilityLabel={t('transactions:form.amount')}
                    />
                  </View>
                  <View style={taksitStyles.fieldRow}>
                    <Text style={taksitStyles.fieldLabel}>
                      {t('transactions:taksit.adetEtiket')}
                    </Text>
                    <View style={taksitStyles.segmentGroup}>
                    {[2, 3, 5, 9, 12].map((count) => (
                      <TouchableOpacity
                        key={count}
                        style={[
                          taksitStyles.segment,
                          taksitAdetDraft === count && taksitStyles.segmentActive,
                          editingTaksitIndex !== null && taksitStyles.controlDisabled,
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          handleTaksitCountChange(count);
                        }}
                        disabled={editingTaksitIndex !== null}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: taksitAdetDraft === count,
                          disabled: editingTaksitIndex !== null,
                        }}
                        accessibilityLabel={t('transactions:taksit.adetLabel', {
                          adet: count,
                        })}
                      >
                        <Text
                          style={[
                            taksitStyles.segmentText,
                            taksitAdetDraft === count &&
                              taksitStyles.segmentTextActive,
                          ]}
                        >
                          {count}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TextInput
                      style={[
                        taksitStyles.segment,
                        taksitStyles.segmentInput,
                        ![2, 3, 5, 9, 12].includes(taksitAdetDraft) &&
                          taksitStyles.segmentInputActive,
                        editingTaksitIndex !== null && taksitStyles.controlDisabled,
                      ]}
                      value={taksitAdetInput ?? String(taksitAdetDraft)}
                      onFocus={() => setTaksitAdetInput(String(taksitAdetDraft))}
                      onChangeText={(text) =>
                        setTaksitAdetInput(text.replace(/[^0-9]/g, '').slice(0, 3))
                      }
                      onBlur={commitTaksitAdetInput}
                      onSubmitEditing={commitTaksitAdetInput}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      maxLength={3}
                      editable={editingTaksitIndex === null}
                      selectTextOnFocus
                      accessibilityLabel={`${t('transactions:taksit.adetSecin')} (${t('transactions:taksit.adetAraligi')})`}
                    />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[
                      taksitStyles.fieldRow,
                      editingTaksitIndex !== null && taksitStyles.controlDisabled,
                    ]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowTaksitVadePicker((value) => !value);
                    }}
                    disabled={editingTaksitIndex !== null}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: editingTaksitIndex !== null }}
                    accessibilityLabel={t('transactions:taksit.ilkVade')}
                  >
                    <Text style={taksitStyles.fieldLabel}>
                      {t('transactions:taksit.ilkVade')}
                    </Text>
                    <Text style={taksitStyles.fieldValue}>
                      {formatDateMedium(taksitIlkVadeDraft)}
                    </Text>
                  </TouchableOpacity>

                  {/* Tarih seçici de satır içidir; ikinci RN Modal açılmaz. */}
                  {showTaksitVadePicker && (
                    <View style={taksitStyles.inlinePickerWrap}>
                      <DateTimePickerRN
                        value={
                          taksitIlkVadeDraft.getTime() < form.safeDate.getTime()
                            ? form.safeDate
                            : taksitIlkVadeDraft
                        }
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        minimumDate={form.safeDate}
                        locale={locale}
                        themeVariant="light"
                        onChange={(event, date) => {
                          if (Platform.OS === 'android') {
                            setShowTaksitVadePicker(false);
                            if (event.type === 'dismissed') return;
                          }
                          if (date) handleTaksitDateChange(date);
                        }}
                      />
                    </View>
                  )}

                  <View style={taksitStyles.tableHeader}>
                    <Text style={[taksitStyles.tableHeaderText, taksitStyles.rowNumber]}>
                      {t('transactions:taksit.satirSira')}
                    </Text>
                    <Text style={[taksitStyles.tableHeaderText, taksitStyles.rowDate]}>
                      {t('transactions:taksit.satirVade')}
                    </Text>
                    <Text style={[taksitStyles.tableHeaderText, taksitStyles.rowAmount]}>
                      {t('transactions:taksit.satirTutar')}
                    </Text>
                    <View style={taksitStyles.rowLock} />
                  </View>
                </View>
              }
              ListEmptyComponent={
                <Text style={taksitStyles.emptyPlanText}>
                  {taksitDraftErrorText ?? t('transactions:taksit.tutarOnce')}
                </Text>
              }
            />

            {!animation.isKeyboardVisible && (
              <View style={taksitStyles.distributionActions}>
                <TouchableOpacity
                  style={[
                    taksitStyles.distributionAction,
                    editingTaksitIndex !== null && taksitStyles.controlDisabled,
                  ]}
                  onPress={() => handleTaksitDistributionPreset('first')}
                  disabled={!taksitPreviewPlan || editingTaksitIndex !== null}
                >
                  <Text style={taksitStyles.distributionActionText} numberOfLines={2}>
                    {t('transactions:taksit.farkiIlkeAl')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    taksitStyles.distributionAction,
                    taksitStyles.distributionDivider,
                    editingTaksitIndex !== null && taksitStyles.controlDisabled,
                  ]}
                  onPress={() => handleTaksitDistributionPreset('last')}
                  disabled={!taksitPreviewPlan || editingTaksitIndex !== null}
                >
                  <Text style={taksitStyles.distributionActionText} numberOfLines={2}>
                    {t('transactions:taksit.farkiSonaAl')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    taksitStyles.distributionAction,
                    taksitStyles.distributionDivider,
                    editingTaksitIndex !== null && taksitStyles.controlDisabled,
                  ]}
                  onPress={() => handleTaksitDistributionPreset('reset')}
                  disabled={!taksitPreviewPlan || editingTaksitIndex !== null}
                >
                  <Text style={taksitStyles.distributionActionText} numberOfLines={2}>
                    {t('transactions:taksit.esitDagit')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Tek hata mesajı kuralı: liste boşken mesaj listede; burada yalnız
                plan varken satır-düzeyi hatalar gösterilir. */}
            {effectiveTaksitPreviewPlan !== null && taksitDraftErrorText && (
              <Text style={taksitStyles.errorText}>{taksitDraftErrorText}</Text>
            )}

            <View style={taksitStyles.editorFooter}>
              <TouchableOpacity
                style={taksitStyles.cancelButton}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowTaksitConfig(false);
                }}
              >
                <Text style={styles.pickerCancelText}>{t('common:buttons.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  taksitStyles.applyButton,
                  !isTaksitDraftValid && taksitStyles.controlDisabled,
                ]}
                onPress={handleApplyTaksitPlan}
                disabled={!isTaksitDraftValid}
                accessibilityRole="button"
                accessibilityState={{ disabled: !isTaksitDraftValid }}
              >
                <Text style={styles.pickerDoneText}>
                  {t('transactions:taksit.uygula')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* DateTime End Picker Modal (for leave usage date range) */}
      {isLeaveUsageType && (
        <DateTimePickerModal
          visible={modals.showDateEndPicker}
          onDismiss={() => {
            modals.setShowDateEndPicker(false);
            restoreKeyboardAfterDatePicker();
          }}
          value={form.safeDateEnd || form.safeDate}
          onChange={(newDate) => {
            // Ensure end date is not before start date
            if (newDate < form.safeDate) {
              form.setDateEnd(form.safeDate);
            } else {
              form.setDateEnd(newDate);
            }
          }}
          locale={locale}
          minimumDate={form.safeDate}
        />
      )}

      {/* Hesap Picker Modal - Bottom Sheet */}
      <HesapPickerSheet
        inline
        visible={modals.showHesapPicker}
        onDismiss={modals.handleHesapPickerDismiss}
        onSelect={handleHesapSelect}
        hesaplar={entities.hesaplar || []}
        selectedId={modals.hesapPickerTarget === 'source' ? form.sourceHesapId : form.hedefHesapId}
        target={modals.hesapPickerTarget}
        excludeId={modals.hesapPickerTarget === 'hedef' ? form.hesapId : undefined}
        pendingModal={modals.pendingModal}
        onPendingModalHandled={handlePendingModalHandled}
        showBalances={!minimalAccountRefsAllowed}
      />

      {/* Cari Picker Modal - Bottom Sheet */}
      <CariPickerSheet
        inline
        visible={modals.showCariPicker}
        onDismiss={modals.handleCariPickerDismiss}
        onSelect={handleCariSelect}
        cariler={entities.carilerForType || []}
        selectedId={form.cariId}
        mode={cariPickerMode}
        onCreateNew={handleCariCreateNew}
        creating={createCari.isPending}
        pendingModal={modals.pendingModal}
        onPendingModalHandled={handlePendingModalHandled}
      />

      {/* Ödeme Hedef Tipi Picker Modal - Bottom Sheet */}
      <OdemeHedefTypePicker
        visible={modals.showOdemeHedefTypePicker}
        onDismiss={() => modals.setShowOdemeHedefTypePicker(false)}
        onSelect={handleOdemeTypeSelect}
        selectedType={form.odemeHedefType}
        allowedTypes={allowedOdemeHedefTypes}
      />

      {/* Tahsilat Hedef Tipi Picker Modal - Bottom Sheet */}
      <TahsilatHedefTypePicker
        visible={modals.showTahsilatHedefTypePicker}
        onDismiss={() => modals.setShowTahsilatHedefTypePicker(false)}
        onSelect={handleTahsilatTypeSelect}
        selectedType={form.tahsilatHedefType}
        allowedTypes={allowedTahsilatHedefTypes}
      />

      {/* Kredi Kartı Picker Modal - Bottom Sheet */}
      <KrediKartiPickerSheet
        visible={modals.showKrediKartiPicker}
        onDismiss={() => modals.setShowKrediKartiPicker(false)}
        onSelect={handleKrediKartiSelect}
        krediKartiHesaplari={entities.krediKartiHesaplari}
        selectedId={form.hedefHesapId}
      />

      {/* Personel Picker Modal - Bottom Sheet */}
      <PersonelPickerSheet
        visible={modals.showPersonelPicker}
        onDismiss={modals.handlePersonelPickerDismiss}
        onSelect={handlePersonelSelect}
        personelList={entities.personelList || []}
        selectedId={form.personelId}
        pendingModal={modals.pendingModal}
        onPendingModalHandled={handlePendingModalHandled}
      />

      {/* Exchange Rate Bar */}
      {form.pendingExchangeData && (
        <ExchangeRateBar
          visible={modals.showExchangeRateBar}
          presentation="inline"
          onDismiss={() => {
            modals.setShowExchangeRateBar(false);
            form.setPendingExchangeData(null);
          }}
          sourceAmount={form.pendingExchangeData.sourceAmount}
          sourceCurrency={form.pendingExchangeData.sourceCurrency}
          targetCurrency={form.pendingExchangeData.targetCurrency}
          // Düzenlemede işlemin KAYITLI kuru (A6): bar bugünün kuruyla dolup tarihsel
          // kuru sessizce ezmesin. Yeni kayıtta null → eski davranış (bugünün kuru).
          initialRate={form.pendingExchangeData.initialRate}
          onConfirm={submit.handleExchangeRateConfirm}
        />
      )}

      {/* Urun Picker Modal */}
      <UrunPickerModal
        visible={modals.showUrunPicker}
        onDismiss={() => {
          modals.setShowUrunPicker(false);
          modals.setUrunSearchQuery('');
        }}
        urunler={entities.urunler || []}
        urunItems={form.urunItems}
        onUrunItemsChange={form.setUrunItems}
        searchQuery={modals.urunSearchQuery}
        onSearchQueryChange={modals.setUrunSearchQuery}
        onTotalChange={(total) => {
          // Ürün toplamını işlem tutarına yaz.
          // KRİTİK: ürün toplamı 3+ ondalık olabilir (ör. %1 KDV: 12*40.40+%1 = 489.648
          // → genel toplam ...828). 2 ondalığa YUVARLANMAZSA, parseCurrency TR locale'de
          // noktadan sonraki 3 haneyi binlik ayracı sanıp noktayı siliyor ve tutarı
          // ~1000x şişiriyor (2692.828 → 2692828). roundCurrency 2 ondalık garanti eder.
          if (total > 0) {
            // NOKTA yazmak yasak: alan cleanAmountInput'tan geçiyor ve locale
            // ondalığı dışındaki ayracı siler (TR'de "489.65" → "48965", 100x).
            form.setAmount(formatAmountForInput(roundCurrency(total)));
          }
        }}
        currency={productTransactionCurrency}
        islemYonu={form.type === 'satis' || form.type === 'satis_iade' ? 'satis' : 'alis'}
        onCreateNew={handleUrunCreateNew}
        creating={createUrun.isPending}
        onAddFullProduct={() => {
          // Eklenen ürünleri KAYBETMEDEN tam ekran ürün ekleme sayfasına git.
          // ÖNCEDEN (v1): handleDismiss() → parent visible=false → form reset = VERİ KAYBI.
          // v2 HATASI: sadece navigatedAway ile dış Modal gizlenip iç ürün seçici (showUrunPicker
          //   hâlâ true) "visible iken unmount" oluyordu → öksüz, dokunuş-yutan native modal
          //   kalıyordu → yeni sayfa AÇILIYOR ama DONUYORDU.
          // v3 (bu): önce iç ürün seçiciyi DÜZGÜN kapat (visible=false → temiz dismiss), SONRAKİ
          //   adımda (aynı frame'de değil) dış bar'ı navigatedAway ile gizle + navigasyon yap.
          //   `visible`'a hiç dokunulmadığı için form/urunItems yine KORUNUR (veri kaybı yok);
          //   dönüşte useFocusEffect bar'ı geri açar (ürünler Ürün butonunda adet olarak görünür).
          modals.setShowUrunPicker(false);
          modals.setUrunSearchQuery('');
          setTimeout(() => {
            modals.setNavigatedAway(true);
            router.push('/urunler/ekle' as Href);
          }, 240);
        }}
      />

      {/* Photo Viewer Modal */}
      <PhotoViewerModal
        inline
        visible={isOwner && showPhotoViewer}
        photoPath={form.photoUri}
        onClose={() => setShowPhotoViewer(false)}
      />
    </Modal>
  );
}

interface InstallmentPreviewRowProps {
  row: InstallmentRpcRow;
  index: number;
  isLocked: boolean;
  isEditing: boolean;
  editingText: string;
  formatDate: (date: string | Date) => string;
  onStartEditing: (index: number, value: string) => void;
  onEditingTextChange: (value: string) => void;
  onCommitEditing: (index: number, value: string) => void;
  onToggleLock: (index: number, row: InstallmentRpcRow) => void;
  lockControlsDisabled: boolean;
  isDateEditing: boolean;
  isDateOverridden: boolean;
  onPressDate: (index: number) => void;
  onDateChange: (index: number, date: Date) => void;
  minimumDueDate: Date;
  pickerLocale: string;
  t: TFunction;
}

function InstallmentPreviewRow({
  row,
  index,
  isLocked,
  isEditing,
  editingText,
  formatDate,
  onStartEditing,
  onEditingTextChange,
  onCommitEditing,
  onToggleLock,
  lockControlsDisabled,
  isDateEditing,
  isDateOverridden,
  onPressDate,
  onDateChange,
  minimumDueDate,
  pickerLocale,
  t,
}: InstallmentPreviewRowProps) {
  const displayAmount = isEditing
    ? editingText
    : formatAmountForInput(row.tutar, 2);

  return (
    <View>
    <View style={taksitStyles.previewRow}>
      <Text style={[taksitStyles.previewText, taksitStyles.rowNumber]}>
        {row.sira}
      </Text>
      <TouchableOpacity
        style={[
          taksitStyles.rowDate,
          taksitStyles.rowDateButton,
          isDateEditing && taksitStyles.rowDateButtonActive,
          lockControlsDisabled && taksitStyles.controlDisabled,
        ]}
        onPress={() => onPressDate(index)}
        disabled={lockControlsDisabled}
        accessibilityRole="button"
        accessibilityState={{
          selected: isDateEditing,
          disabled: lockControlsDisabled,
        }}
        accessibilityLabel={t('transactions:taksit.satirVadeDuzenle', {
          sira: row.sira,
        })}
      >
        <Text
          style={[
            taksitStyles.previewText,
            (isDateOverridden || isDateEditing) && taksitStyles.rowDateTextActive,
          ]}
          numberOfLines={1}
        >
          {formatDate(row.vade_tarihi)}
        </Text>
      </TouchableOpacity>
      <TextInput
        style={[
          taksitStyles.rowAmount,
          taksitStyles.amountEditor,
          isLocked && taksitStyles.amountEditorLocked,
        ]}
        value={displayAmount}
        onFocus={() => onStartEditing(index, formatAmountForInput(row.tutar, 2))}
        onChangeText={(value) => onEditingTextChange(cleanAmountInput(value))}
        onEndEditing={(event) => onCommitEditing(index, event.nativeEvent.text)}
        keyboardType="decimal-pad"
        selectTextOnFocus
        maxLength={15}
        accessibilityLabel={t('transactions:taksit.satirDuzenle', {
          sira: row.sira,
        })}
      />
      <TouchableOpacity
        style={[
          taksitStyles.rowLock,
          isLocked && taksitStyles.rowLockActive,
          lockControlsDisabled && taksitStyles.controlDisabled,
        ]}
        onPress={() => onToggleLock(index, row)}
        disabled={lockControlsDisabled}
        hitSlop={HIT_SLOP.sm}
        accessibilityRole="button"
        accessibilityState={{ selected: isLocked, disabled: lockControlsDisabled }}
        accessibilityLabel={
          isLocked
            ? t('transactions:taksit.satirKilidiniAc', { sira: row.sira })
            : t('transactions:taksit.satiriKilitle', { sira: row.sira })
        }
      >
        {isLocked ? (
          <Lock size={16} color={colors.primary} />
        ) : (
          <Unlock size={16} color={colors.textMuted} />
        )}
      </TouchableOpacity>
    </View>
    {/* Satır-içi vade seçici: iç içe native modal açılmaz (iOS donma kuralı). */}
    {isDateEditing && (
      <View style={taksitStyles.inlinePickerWrap}>
        <DateTimePickerRN
          value={new Date(`${row.vade_tarihi}T00:00:00`)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={minimumDueDate}
          locale={pickerLocale}
          themeVariant="light"
          onChange={(event, date) => {
            if (Platform.OS === 'android') {
              onPressDate(index);
              if (event.type === 'dismissed') return;
            }
            if (date) onDateChange(index, date);
          }}
        />
      </View>
    )}
    </View>
  );
}

// Üst bölge kaydırıcısı: kart maxHeight'e çarptığında yalnız üst kısım kayar.
// flexGrow:0 → içerik kısayken ScrollView fazladan yer KAPLAMAZ (normal görünüm aynı).
const qtbLocal = StyleSheet.create({
  topScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
});

// Taksit planı inline editörü (ana QTB Modal'ı içinde; ayrı RN Modal değildir).
const taksitStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    elevation: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  editorContainer: {
    flexShrink: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 24,
  },
  editorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 38,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  editorTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  editorClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  staleBanner: {
    backgroundColor: colors.warningLight,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  staleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.warning,
  },
  staleText: {
    marginTop: 2,
    fontSize: 11,
    color: colors.textMuted,
  },
  planList: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 70,
  },
  planListContent: {
    paddingBottom: 4,
  },
  // QTB satır dili: etiket solda, değer sağda, ince alt çizgi.
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    paddingHorizontal: 4,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  fieldAmountInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
    paddingVertical: 8,
  },
  fieldValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'right',
  },
  // Taksit sayısı: QTB tip sekmeleri dilinde segment grubu.
  segmentGroup: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  segment: {
    minWidth: 36,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: colors.background,
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  // Serbest adet girişi: beyaz zemin + kenarlık yazılabilirliği imler.
  segmentInput: {
    minWidth: 44,
    paddingVertical: 0,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  segmentInputActive: {
    borderColor: colors.primary,
    color: colors.primary,
  },
  inlinePickerWrap: {
    alignItems: 'center',
    marginBottom: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 26,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  previewText: {
    fontSize: 14,
    color: colors.text,
  },
  rowNumber: {
    width: 32,
    textAlign: 'center',
  },
  rowDate: {
    flex: 0.9,
    minWidth: 78,
    paddingRight: 5,
  },
  rowDateButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  rowDateButtonActive: {
    backgroundColor: colors.primaryLight,
  },
  rowDateTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  rowAmount: {
    flex: 1,
    minWidth: 88,
  },
  amountEditor: {
    height: 36,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'right',
  },
  amountEditorLocked: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  rowLock: {
    width: 38,
    height: 34,
    marginLeft: 5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLockActive: {
    backgroundColor: colors.primaryLight,
  },
  emptyPlanText: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
  },
  // Yapışık satır dili: buton görünümü yok, ince çizgilerle bölünmüş eylemler.
  distributionActions: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  distributionAction: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  distributionDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  distributionActionText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    color: colors.error,
    textAlign: 'center',
  },
  editorFooter: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 8,
  },
  cancelButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlDisabled: {
    opacity: 0.4,
  },
});
