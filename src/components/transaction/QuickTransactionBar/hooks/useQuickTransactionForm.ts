import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ensureValidDate } from '@/lib/date';
import type { TransactionType, OdemeHedefType, TahsilatHedefType, QuickTransactionMode } from '../types';
import type { CariType, Currency } from '@/types/database';
import { useIslem } from '@/hooks/useIslemler';
import { useIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
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
}: UseQuickTransactionFormOptions): UseQuickTransactionFormReturn {
  // Edit mode flag
  const isEditMode = mode === 'edit' && !!transactionId;

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

  // Track if we've loaded edit data
  const [editDataLoaded, setEditDataLoaded] = useState(false);

  // Fetch transaction data for edit mode
  const { data: normalTransaction, isLoading: isLoadingNormal } = useIslem(
    isEditMode && !isScheduledTransaction ? transactionId : undefined
  );
  const { data: scheduledTransaction, isLoading: isLoadingScheduled } = useIleriTarihliIslem(
    isEditMode && isScheduledTransaction ? transactionId : undefined
  );

  // Combined loading state
  const isLoadingTransaction = isEditMode && (isLoadingNormal || isLoadingScheduled);

  // Form state
  const [type, setType] = useState<TransactionType>(defaultType);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Safe date
  const safeDate = useMemo(() => ensureValidDate(date), [date]);

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

  // Computed hesapId (fallback)
  const hesapId = sourceHesapId || defaultHesapId || hesaplar?.[0]?.id;

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

  // Load transaction data in edit mode
  useEffect(() => {
    if (!isEditMode || !visible || editDataLoaded) return;

    const transaction = isScheduledTransaction ? scheduledTransaction : normalTransaction;
    if (!transaction) return;

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
    // Use scheduled_date for scheduled transactions, date for normal transactions
    const transactionDate = isScheduledTransaction
      ? (transaction as { scheduled_date?: string }).scheduled_date
      : (transaction as { date?: string }).date;
    if (transactionDate) {
      setDate(new Date(transactionDate));
    }
    setKategoriId(transaction.kategori_id || null);
    setSourceHesapId(transaction.hesap_id || null);
    setHedefHesapId(transaction.hedef_hesap_id || null);
    setCariId(transaction.cari_id || null);
    setPersonelId(transaction.personel_id || null);
    setOdemeHedefType(mappedState.odemeHedefType);
    setTahsilatHedefType(mappedState.tahsilatHedefType);
    setIsCariMode(mappedState.isCariMode);
    setIsPersonelMode(mappedState.isPersonelMode);

    // For scheduled transactions, mark as scheduled
    if (isScheduledTransaction) {
      setIsScheduled(true);
    }

    setEditDataLoaded(true);
  }, [
    isEditMode,
    visible,
    editDataLoaded,
    isScheduledTransaction,
    normalTransaction,
    scheduledTransaction,
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

  // Reset cariId and personelId when type changes (only in normal mode, not during edit data loading)
  useEffect(() => {
    // Don't reset during edit mode data loading
    if (isEditMode && !editDataLoaded) return;

    if (!isCariMode && !isPersonelMode) {
      setCariId(null);
      setPersonelId(null);
      setOdemeHedefType(null);
      setTahsilatHedefType(null);
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

    // Computed
    hesapId,

    // Handlers
    handleAmountChange,
    resetForm,
  };
}
