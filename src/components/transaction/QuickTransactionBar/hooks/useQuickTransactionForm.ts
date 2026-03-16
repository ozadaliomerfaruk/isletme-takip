import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ensureValidDate } from '@/lib/date';
import type { TransactionType, OdemeHedefType, TahsilatHedefType, QuickTransactionMode, UrunItem } from '../types';
import type { CariType, Currency, BirimType } from '@/types/database';
import { useIslem } from '@/hooks/useIslemler';
import { useIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import { useUrunHareketlerByIslemId } from '@/hooks/useUrunHareketler';
import { mapApiTypeToFormState } from '../utils/reverseTypeMapper';

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
  hesaplar: Hesap[] | undefined;
  resetModalStates: () => void;
  // Edit mode options
  mode?: QuickTransactionMode;
  transactionId?: string;
  isScheduledTransaction?: boolean;
  // Copy mode: load data from this transaction but create as new
  copySourceId?: string;
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
  hesaplar,
  resetModalStates,
  mode = 'create',
  transactionId,
  isScheduledTransaction = false,
  copySourceId,
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
  // For odeme/tahsilat, do NOT auto-select the first account (user must manually choose)
  const hesapId = (type === 'odeme' || type === 'tahsilat')
    ? sourceHesapId || defaultHesapId || undefined
    : sourceHesapId || defaultHesapId || hesaplar?.[0]?.id;

  // Amount change handler
  const handleAmountChange = useCallback((text: string) => {
    // Remove non-numeric except comma and dot
    const cleaned = text.replace(/[^0-9,.]/g, '');
    setAmount(cleaned);
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
    setAmount(transaction.amount.toString());
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

  // Update type and cari/personel when modal opens (only in create mode)
  useEffect(() => {
    // Skip in edit mode - data will be loaded from transaction
    if (isEditMode) return;

    if (visible) {
      // Personel mode
      if (isPersonelMode && defaultPersonelId) {
        setPersonelId(defaultPersonelId);
        setType('personel_gider_tab');
      }
      // Cari mode
      else if (isCariMode && defaultCariId) {
        setCariId(defaultCariId);
        if (defaultCariType === 'tedarikci') {
          setType('alis');
          setOdemeHedefType('tedarikci');
        } else {
          setType('satis');
        }
      } else {
        // Normal mode
        if (hesaplar && hesaplar.length > 0) {
          setSourceHesapId(defaultHesapId || hesaplar[0].id);
        }
        setType(defaultType);
      }
    }
  }, [
    visible,
    isEditMode,
    isPersonelMode,
    defaultPersonelId,
    isCariMode,
    defaultCariId,
    defaultCariType,
    defaultType,
    hesaplar,
    defaultHesapId,
  ]);

  // Reset cariId, personelId and sourceHesapId when type changes (only in normal mode, not during edit data loading)
  useEffect(() => {
    // Don't reset during edit mode data loading
    if (isEditMode && !editDataLoaded) return;

    if (!isCariMode && !isPersonelMode) {
      setCariId(null);
      setPersonelId(null);
      setOdemeHedefType(null);
      setTahsilatHedefType(null);
      // Reset account selection for odeme/tahsilat so no account is pre-selected
      if (type === 'odeme' || type === 'tahsilat') {
        setSourceHesapId(null);
        setHedefHesapId(null);
      }
    }
  }, [type, isCariMode, isPersonelMode, isEditMode, editDataLoaded]);

  return {
    // Mode flags
    isCariMode,
    isPersonelMode,
    isEditMode,
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
