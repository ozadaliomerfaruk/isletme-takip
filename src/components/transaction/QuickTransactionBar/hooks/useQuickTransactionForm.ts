import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ensureValidDate } from '@/lib/date';
import type { TransactionType, OdemeHedefType, TahsilatHedefType } from '../types';
import type { CariType, Currency } from '@/types/database';

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
}: UseQuickTransactionFormOptions): UseQuickTransactionFormReturn {
  // Mode flags
  const isCariMode = !!defaultCariId;
  const isPersonelMode = !!defaultPersonelId;

  // Form state
  const [type, setType] = useState<TransactionType>(defaultType);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
    setHedefHesapId(null);
    setSourceHesapId(null);
    setCariId(null);
    setPersonelId(null);
    setOdemeHedefType(null);
    setTahsilatHedefType(null);
    setPendingExchangeData(null);
    resetModalStates();
  }, [resetModalStates]);

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

  // Update type and cari/personel when modal opens
  useEffect(() => {
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
    isPersonelMode,
    defaultPersonelId,
    isCariMode,
    defaultCariId,
    defaultCariType,
    defaultType,
    hesaplar,
    defaultHesapId,
  ]);

  // Reset cariId and personelId when type changes (only in normal mode)
  useEffect(() => {
    if (!isCariMode && !isPersonelMode) {
      setCariId(null);
      setPersonelId(null);
      setOdemeHedefType(null);
      setTahsilatHedefType(null);
    }
  }, [type, isCariMode, isPersonelMode]);

  return {
    // Mode flags
    isCariMode,
    isPersonelMode,

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
