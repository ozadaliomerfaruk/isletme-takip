import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ensureValidDate } from '@/lib/date';
import { roundCurrency, toNumber, cleanAmountInput } from '@/lib/currency';
import type { TransactionType, OdemeHedefType, TahsilatHedefType, QuickTransactionMode, UrunItem } from '../types';
import type { CariType, Currency, BirimType } from '@/types/database';
import { useIslem } from '@/hooks/useIslemler';
import { useIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import { useUrunHareketlerByIslemId } from '@/hooks/useUrunHareketler';
import { mapApiTypeToFormState } from '../utils/reverseTypeMapper';
import { getCategoryType } from '../utils/categoryTypeMapper';

interface Hesap {
  id: string;
  name: string;
  balance: number;
  currency?: string;
  type?: string;
}

interface UseQuickTransactionFormOptions {
  visible: boolean;
  defaultType: TransactionType;
  defaultHesapId?: string;
  defaultCariId?: string;
  defaultCariType?: CariType;
  defaultPersonelId?: string;
  // Dışarıdan ön-doldurma (mutabakat kuyruğu vb.) — yalnız create modda
  defaultAmount?: number;
  defaultDate?: Date;
  defaultDescription?: string;
  hesaplar: Hesap[] | undefined;
  resetModalStates: () => void;
  // Edit mode options
  mode?: QuickTransactionMode;
  transactionId?: string;
  isScheduledTransaction?: boolean;
  // Copy mode: load data from this transaction but create as new
  copySourceId?: string;
  // A1: son-kullanılan hesap ön-doldurması. Ref-stabil getter; RAW işlem tipine göre
  // saklanan ham id'yi döner (doğrulama burada, hesaplar listesine karşı yapılır).
  getLastUsedHesapId?: (type: TransactionType) => string | undefined;
}

interface PendingExchangeData {
  sourceCurrency: Currency;
  targetCurrency: Currency;
  sourceAmount: number;
}

interface UseQuickTransactionFormReturn {
  // Mode flags
  isCariMode: boolean;
  isPersonelMode: boolean;
  isEditMode: boolean;
  isCopyMode: boolean;
  isLoadingTransaction: boolean;

  // Form state
  type: TransactionType;
  setType: (type: TransactionType) => void;
  amount: string;
  setAmount: (amount: string) => void;
  description: string;
  setDescription: (description: string) => void;
  date: Date;
  setDate: (date: Date) => void;
  safeDate: Date;
  dateEnd: Date | null;
  setDateEnd: (date: Date | null) => void;
  safeDateEnd: Date | null;
  kategoriId: string | null;
  setKategoriId: (id: string | null) => void;
  isScheduled: boolean;
  setIsScheduled: (scheduled: boolean) => void;
  isSaving: boolean;
  setIsSaving: (saving: boolean) => void;

  // Photo state
  photoUri: string | null;
  setPhotoUri: (uri: string | null) => void;

  // Entity IDs
  hedefHesapId: string | null;
  setHedefHesapId: (id: string | null) => void;
  sourceHesapId: string | null;
  setSourceHesapId: (id: string | null) => void;
  cariId: string | null;
  setCariId: (id: string | null) => void;
  personelId: string | null;
  setPersonelId: (id: string | null) => void;

  // Type states
  odemeHedefType: OdemeHedefType;
  setOdemeHedefType: (type: OdemeHedefType) => void;
  tahsilatHedefType: TahsilatHedefType;
  setTahsilatHedefType: (type: TahsilatHedefType) => void;

  // Exchange rate state
  pendingExchangeData: PendingExchangeData | null;
  setPendingExchangeData: (data: PendingExchangeData | null) => void;

  // Urun items (alış/satış/iade işlemlerinde urun hareketi)
  urunItems: UrunItem[];
  setUrunItems: React.Dispatch<React.SetStateAction<UrunItem[]>>;
  addUrunItem: (item: UrunItem) => void;
  removeUrunItem: (urunId: string) => void;
  updateUrunItem: (urunId: string, updates: Partial<UrunItem>) => void;
  clearUrunItems: () => void;

  // Computed hesapId
  hesapId: string | undefined;

  // Amount handler
  handleAmountChange: (text: string) => void;

  // Reset form
  resetForm: () => void;
}

export function useQuickTransactionForm({
  visible,
  defaultType,
  defaultHesapId,
  defaultCariId,
  defaultCariType,
  defaultPersonelId,
  defaultAmount,
  defaultDate,
  defaultDescription,
  hesaplar,
  resetModalStates,
  mode = 'create',
  transactionId,
  isScheduledTransaction = false,
  copySourceId,
  getLastUsedHesapId,
}: UseQuickTransactionFormOptions): UseQuickTransactionFormReturn {
  // Edit mode flag
  const isEditMode = mode === 'edit' && !!transactionId;
  // Copy mode: load data like edit mode, but submit as create
  const isCopyMode = !!copySourceId;
  const loadSourceId = isEditMode ? transactionId : (isCopyMode ? copySourceId : undefined);

  // Mode flags (overridden in edit mode based on loaded transaction)
  const [isCariMode, setIsCariMode] = useState(!!defaultCariId);
  const [isPersonelMode, setIsPersonelMode] = useState(!!defaultPersonelId);

  // Update mode flags when props change (important when cari/personel data loads after component mount)
  useEffect(() => {
    if (!isEditMode) {
      setIsCariMode(!!defaultCariId);
      setIsPersonelMode(!!defaultPersonelId);
    }
  }, [defaultCariId, defaultPersonelId, isEditMode]);

  // Track if we've loaded edit data — keyed by loadSourceId to reset when source changes
  const [editDataLoaded, setEditDataLoaded] = useState(false);
  const prevLoadSourceIdRef = useRef<string | undefined>(undefined);

  // Reset editDataLoaded when the source transaction changes (e.g. different copy target)
  if (loadSourceId !== prevLoadSourceIdRef.current) {
    prevLoadSourceIdRef.current = loadSourceId;
    if (editDataLoaded) {
      setEditDataLoaded(false);
    }
  }

  // Fetch transaction data for edit/copy mode
  const shouldLoadNormal = (isEditMode || isCopyMode) && !isScheduledTransaction;
  const shouldLoadScheduled = isEditMode && isScheduledTransaction;
  const { data: normalTransaction, isLoading: isLoadingNormal } = useIslem(
    shouldLoadNormal ? loadSourceId : undefined
  );
  const { data: scheduledTransaction, isLoading: isLoadingScheduled } = useIleriTarihliIslem(
    shouldLoadScheduled ? loadSourceId : undefined
  );

  // Fetch urun hareketler for edit/copy mode (only for normal transactions)
  const { data: urunHareketler, isLoading: isLoadingUrunHareketler } = useUrunHareketlerByIslemId(
    shouldLoadNormal ? loadSourceId : undefined
  );

  // Combined loading state
  const isLoadingTransaction = (isEditMode || isCopyMode) && (isLoadingNormal || isLoadingScheduled || isLoadingUrunHareketler);

  // Form state
  const [type, setType] = useState<TransactionType>(defaultType);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Date end (for leave usage date range)
  const [dateEnd, setDateEnd] = useState<Date | null>(null);

  // Safe date
  const safeDate = useMemo(() => ensureValidDate(date), [date]);
  const safeDateEnd = useMemo(() => dateEnd ? ensureValidDate(dateEnd) : null, [dateEnd]);

  // Entity IDs
  const [hedefHesapId, setHedefHesapId] = useState<string | null>(null);
  const [sourceHesapId, setSourceHesapId] = useState<string | null>(null);
  const [cariId, setCariId] = useState<string | null>(null);
  const [personelId, setPersonelId] = useState<string | null>(null);

  // Type states
  const [odemeHedefType, setOdemeHedefType] = useState<OdemeHedefType>(null);
  const [tahsilatHedefType, setTahsilatHedefType] = useState<TahsilatHedefType>(null);

  // Exchange rate state
  const [pendingExchangeData, setPendingExchangeData] = useState<PendingExchangeData | null>(null);

  // Urun items state (alış/satış/iade işlemlerinde urun hareketi)
  const [urunItems, setUrunItems] = useState<UrunItem[]>([]);

  // Urun items helper functions
  const addUrunItem = useCallback((item: UrunItem) => {
    setUrunItems(prev => {
      // Aynı ürün zaten eklenmişse güncelle
      const existingIndex = prev.findIndex(i => i.urunId === item.urunId);
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex] = item;
        return updated;
      }
      return [...prev, item];
    });
  }, []);

  const removeUrunItem = useCallback((urunId: string) => {
    setUrunItems(prev => prev.filter(item => item.urunId !== urunId));
  }, []);

  const updateUrunItem = useCallback((urunId: string, updates: Partial<UrunItem>) => {
    setUrunItems(prev => prev.map(item =>
      item.urunId === urunId ? { ...item, ...updates } : item
    ));
  }, []);

  const clearUrunItems = useCallback(() => {
    setUrunItems([]);
  }, []);

  // Computed hesapId (fallback)
  // For cari/personel mode or odeme/tahsilat, do NOT auto-select the first account (user must manually choose)
  const hesapId = (isCariMode || isPersonelMode || type === 'odeme' || type === 'tahsilat')
    ? sourceHesapId || defaultHesapId || undefined
    : sourceHesapId || defaultHesapId || hesaplar?.[0]?.id;

  // Amount change handler
  const handleAmountChange = useCallback((text: string) => {
    // Merkezî temizleyici: locale'e göre binliği atar, ondalığı 2 haneye kısar ve tek
    // ayraç bırakır. Ham regex (birden çok ayraç + sınırsız ondalık) parseCurrency'nin
    // "3-ondalık" tuzağına düşüp tutarı ~1000x şişirebiliyordu.
    setAmount(cleanAmountInput(text));
  }, []);

  // Reset form
  const resetForm = useCallback(() => {
    setAmount('');
    setDescription('');
    setDate(new Date());
    setDateEnd(null);
    setKategoriId(null);
    setIsScheduled(false);
    setIsSaving(false);
    setPhotoUri(null);
    setHedefHesapId(null);
    setSourceHesapId(null);
    setCariId(null);
    setPersonelId(null);
    setOdemeHedefType(null);
    setTahsilatHedefType(null);
    setPendingExchangeData(null);
    setUrunItems([]); // Urun items'ı temizle
    setEditDataLoaded(false);
    setIsCariMode(!!defaultCariId);
    setIsPersonelMode(!!defaultPersonelId);
    resetModalStates();
  }, [resetModalStates, defaultCariId, defaultPersonelId]);

  // Keep resetForm ref up to date (to avoid dependency in effect)
  const resetFormRef = useRef(resetForm);
  resetFormRef.current = resetForm;

  // Reset state when modal closes - only depends on visible (matches original behavior)
  useEffect(() => {
    if (!visible) {
      setIsSaving(false);
      const timer = setTimeout(() => {
        resetFormRef.current();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Load transaction data in edit/copy mode
  useEffect(() => {
    if ((!isEditMode && !isCopyMode) || !visible || editDataLoaded) return;

    const transaction = isScheduledTransaction ? scheduledTransaction : normalTransaction;
    if (!transaction) return;

    // Ensure the loaded transaction matches the requested source ID (avoid stale cache)
    if (transaction.id !== loadSourceId) return;

    // Map API type to form state using reverse mapper
    const mappedState = mapApiTypeToFormState(
      transaction.type,
      transaction.cari_id,
      transaction.personel_id,
      transaction.hedef_hesap_id
    );

    // Set form values from transaction
    setType(mappedState.type);
    // Emniyet: tutar alanına her zaman 2-ondalık yaz (parseCurrency TR locale'de
    // 3-ondalık değeri ~1000x şişirme riskine karşı defense-in-depth).
    setAmount(roundCurrency(toNumber(transaction.amount)).toString());
    setDescription(transaction.description || '');

    // Copy mode: set date to today; Edit mode: use original date
    if (isCopyMode) {
      setDate(new Date());
    } else {
      const transactionDate = isScheduledTransaction
        ? (transaction as { scheduled_date?: string }).scheduled_date
        : (transaction as { date?: string }).date;
      if (transactionDate) {
        setDate(new Date(transactionDate));
      }
    }

    setKategoriId(transaction.kategori_id || null);
    // Load date_end for leave usage date range (only in edit mode)
    if (!isCopyMode && (transaction as { date_end?: string | null }).date_end) {
      setDateEnd(new Date((transaction as { date_end?: string | null }).date_end!));
    }
    setSourceHesapId(transaction.hesap_id || null);
    setHedefHesapId(transaction.hedef_hesap_id || null);
    setCariId(transaction.cari_id || null);
    setPersonelId(transaction.personel_id || null);
    setOdemeHedefType(mappedState.odemeHedefType);
    setTahsilatHedefType(mappedState.tahsilatHedefType);
    setIsCariMode(mappedState.isCariMode);
    setIsPersonelMode(mappedState.isPersonelMode);

    // Load photo indicator (storage path) so the photo icon appears active
    const photoPath = (transaction as { photo_path?: string | null }).photo_path;
    if (photoPath) {
      setPhotoUri(photoPath);
    }

    // For scheduled transactions in edit mode, mark as scheduled
    if (isScheduledTransaction && !isCopyMode) {
      setIsScheduled(true);
    }

    // Load urun items from urun hareketler (if available)
    if (urunHareketler && urunHareketler.length > 0) {
      const loadedUrunItems: UrunItem[] = urunHareketler.map(hareket => ({
        urunId: hareket.urun_id,
        urunAd: hareket.urunler?.ad || '',
        miktar: Math.abs(hareket.miktar),
        birimFiyat: hareket.birim_fiyat || 0,
        kdvOrani: hareket.kdv_orani || 0,
        birim: (hareket.urunler?.birim || 'adet') as BirimType,
      }));
      setUrunItems(loadedUrunItems);
    }

    setEditDataLoaded(true);
  }, [
    isEditMode,
    isCopyMode,
    visible,
    editDataLoaded,
    isScheduledTransaction,
    normalTransaction,
    scheduledTransaction,
    urunHareketler,
  ]);

  // Prefill (defaultAmount/Date/Description) açılış başına BİR KEZ uygulanır:
  // parent re-render'ında yeni Date objesi gelse bile kullanıcının düzenlemesi ezilmez
  const prefillAppliedRef = useRef(false);
  useEffect(() => {
    if (!visible) prefillAppliedRef.current = false;
  }, [visible]);

  // Update type and cari/personel when modal opens (only in fresh create mode)
  useEffect(() => {
    // Skip in edit AND copy mode — başlangıç tip/hesap/cari/personel durumu YALNIZ
    // yükleme effect'inden gelmeli. Aksi halde copy modda kaynak işlem yüklenince
    // isCariMode false→true olur, bu effect (isCariMode dep'i) yeniden tetiklenir ve
    // defaultType'a (gelir) + hesaplar[0]/son-kullanılan hesaba düşerek yüklenen
    // tipi ve cari/personel bağını EZER → sessiz veri bozulması (kopya yanlış tiple kaydolur).
    if (isEditMode || isCopyMode) return;

    if (visible) {
      // Dışarıdan ön-doldurma — copy modda uygulanmaz (kaynak işlem yüklemesi ezilmesin)
      if (!isCopyMode && !prefillAppliedRef.current) {
        prefillAppliedRef.current = true;
        if (defaultAmount != null) setAmount(roundCurrency(defaultAmount).toString());
        if (defaultDate) setDate(ensureValidDate(defaultDate));
        if (defaultDescription) setDescription(defaultDescription);
      }
      // Personel mode
      if (isPersonelMode && defaultPersonelId) {
        setPersonelId(defaultPersonelId);
        setType('personel_gider_tab');
      }
      // Cari mode
      else if (isCariMode && defaultCariId) {
        setCariId(defaultCariId);
        if (defaultCariType === 'tedarikci') {
          const validTedarikciTypes: TransactionType[] = ['alis', 'odeme', 'alis_iade'];
          setType(validTedarikciTypes.includes(defaultType) ? defaultType : 'alis');
          setOdemeHedefType('tedarikci');
        } else {
          const validMusteriTypes: TransactionType[] = ['satis', 'tahsilat', 'satis_iade'];
          setType(validMusteriTypes.includes(defaultType) ? defaultType : 'satis');
        }
      } else {
        // Normal mode
        if (hesaplar && hesaplar.length > 0) {
          // A1: hesap ön-doldurma önceliği → açık defaultHesapId > son-kullanılan
          // (canlı listeye karşı doğrulanmış) > ilk hesap. Silinmiş/arşivlenmiş
          // son-kullanılan id asla uygulanmaz.
          const remembered = getLastUsedHesapId?.(defaultType);
          const validRemembered =
            remembered && hesaplar.some((h) => h.id === remembered) ? remembered : undefined;
          setSourceHesapId(defaultHesapId || validRemembered || hesaplar[0].id);
        }
        setType(defaultType);
      }
    }
  }, [
    visible,
    isEditMode,
    isCopyMode,
    isPersonelMode,
    defaultPersonelId,
    isCariMode,
    defaultCariId,
    defaultCariType,
    defaultType,
    defaultAmount,
    defaultDate,
    defaultDescription,
    hesaplar,
    defaultHesapId,
    getLastUsedHesapId,
  ]);

  // A1: kategori ailesi (gelir/gider) takibi — aile değişince bayat kategori temizlenir
  const prevCategoryFamilyRef = useRef<'gelir' | 'gider' | undefined>(getCategoryType(defaultType));

  // Reset cariId, personelId and sourceHesapId when type changes (only in normal mode, not during edit data loading)
  useEffect(() => {
    // Don't reset during edit mode data loading
    if (isEditMode && !editDataLoaded) return;

    // A1: kategori ailesi (gelir/gider) değişince bayat kategoriyi temizle — ön-doldurulan
    // veya seçilmiş bir gelir kategorisi gider formunda (ve tersi) asılı kalmasın. Bu,
    // save-anı gate'inin yanlış-aile kategoriyle işlem kaydetmesini (mis-tag) engeller.
    // Ref her modda güncellenir; temizleme yalnız saf create modda (edit/copy yüklenen
    // kategoriyi korur).
    const newFamily = getCategoryType(type);
    if (newFamily !== prevCategoryFamilyRef.current) {
      prevCategoryFamilyRef.current = newFamily;
      if (!isEditMode && !isCopyMode) {
        setKategoriId(null);
      }
    }

    // Reset account selection for odeme/tahsilat — keep defaultHesapId as source if available
    // Skip in edit AND copy mode after data is loaded — accounts were set from the transaction.
    // (Copy modda yükleme, type'ı gelir→odeme'ye çevirir; bu reset load-tetikli değişimde
    // çalışıp kopyalanan kaynak hesabı silerdi → recurring ödeme/tahsilat kopyası bozulurdu.)
    if (type === 'odeme' || type === 'tahsilat' || type === 'personel_odeme_tab' || type === 'personel_tahsilat_tab') {
      if (!((isEditMode || isCopyMode) && editDataLoaded)) {
        setSourceHesapId(defaultHesapId || null);
        setHedefHesapId(null);
      }
    }

    if (!isCariMode && !isPersonelMode) {
      setCariId(null);
      setPersonelId(null);
      setOdemeHedefType(null);
      setTahsilatHedefType(null);
    }
  }, [type, isCariMode, isPersonelMode, isEditMode, editDataLoaded, isCopyMode]);

  return {
    // Mode flags
    isCariMode,
    isPersonelMode,
    isEditMode,
    isCopyMode,
    isLoadingTransaction,

    // Form state
    type,
    setType,
    amount,
    setAmount,
    description,
    setDescription,
    date,
    setDate,
    safeDate,
    dateEnd,
    setDateEnd,
    safeDateEnd,
    kategoriId,
    setKategoriId,
    isScheduled,
    setIsScheduled,
    isSaving,
    setIsSaving,

    // Photo state
    photoUri,
    setPhotoUri,

    // Entity IDs
    hedefHesapId,
    setHedefHesapId,
    sourceHesapId,
    setSourceHesapId,
    cariId,
    setCariId,
    personelId,
    setPersonelId,

    // Type states
    odemeHedefType,
    setOdemeHedefType,
    tahsilatHedefType,
    setTahsilatHedefType,

    // Exchange rate state
    pendingExchangeData,
    setPendingExchangeData,

    // Urun items
    urunItems,
    setUrunItems,
    addUrunItem,
    removeUrunItem,
    updateUrunItem,
    clearUrunItems,

    // Computed
    hesapId,

    // Handlers
    handleAmountChange,
    resetForm,
  };
}
