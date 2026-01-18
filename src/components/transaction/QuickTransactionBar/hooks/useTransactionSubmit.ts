import { useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useCreateIslem } from '@/hooks/useIslemler';
import { useCreateIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import { parseCurrency, isValidAmount } from '@/lib/currency';
import { formatDateForDB, formatDateTimeForDB } from '@/lib/date';
import { isCrossCurrency } from '@/constants/currencies';
import type { TransactionType, OdemeHedefType, HesapPickerTarget, PendingModal } from '../types';
import type { Currency } from '@/types/database';

interface Hesap {
  id: string;
  name: string;
  balance: number;
  currency?: string;
  type?: string;
}

interface Cari {
  id: string;
  name: string;
  currency?: string;
}

interface Personel {
  id: string;
  first_name: string;
  currency?: string;
}

interface PendingExchangeData {
  sourceCurrency: Currency;
  targetCurrency: Currency;
  sourceAmount: number;
}

interface UseTransactionSubmitOptions {
  // Mode
  isCariMode: boolean;
  isPersonelMode: boolean;

  // Form state
  type: TransactionType;
  amount: string;
  description: string;
  safeDate: Date;
  kategoriId: string | null;
  isScheduled: boolean;
  odemeHedefType: OdemeHedefType;
  categorySkipped: boolean;

  // IDs
  hesapId: string | undefined;
  hedefHesapId: string | null;
  sourceHesapId: string | null;
  cariId: string | null;
  personelId: string | null;

  // Entities
  hesaplar: Hesap[] | undefined;
  cariler: Cari[] | undefined;
  personelList: Personel[] | undefined;

  // State setters
  setIsSaving: (saving: boolean) => void;
  setHesapPickerTarget: (target: HesapPickerTarget) => void;
  setShowHesapPicker: (show: boolean) => void;
  setShowCariPicker: (show: boolean) => void;
  setShowPersonelPicker: (show: boolean) => void;
  setShowOdemeHedefTypePicker: (show: boolean) => void;
  setShowTahsilatHedefTypePicker: (show: boolean) => void;
  setShowKrediKartiPicker: (show: boolean) => void;
  setCategoryPickerOpen: (open: boolean) => void;
  setPendingModal: (modal: PendingModal) => void;
  setShowExchangeRateBar: (show: boolean) => void;
  setPendingExchangeData: (data: PendingExchangeData | null) => void;

  // Exchange rate state
  pendingExchangeData: PendingExchangeData | null;

  // Callbacks
  onSuccess?: () => void;
  handleDismiss: () => void;
}

interface UseTransactionSubmitReturn {
  handleSave: () => Promise<void>;
  handleExchangeRateConfirm: (exchangeRate: number, targetAmount: number) => Promise<void>;
}

// Helper: Map UI type to API type
function mapTypeToApiType(type: TransactionType, odemeHedefType: OdemeHedefType): string {
  if (type === 'odeme') {
    if (odemeHedefType === 'staff') return 'personel_odeme';
    if (odemeHedefType === 'kredi_karti') return 'transfer';
    return 'cari_odeme';
  }
  if (type === 'tahsilat') return 'cari_tahsilat';
  if (type === 'alis') return 'cari_alis';
  if (type === 'satis') return 'cari_satis';
  if (type === 'alis_iade') return 'cari_alis_iade';
  if (type === 'satis_iade') return 'cari_satis_iade';
  if (type === 'personel_odeme_tab') return 'personel_odeme';
  if (type === 'personel_gider_tab') return 'personel_gider';
  if (type === 'personel_tahsilat_tab') return 'personel_tahsilat';
  if (type === 'personel_satis_tab') return 'personel_satis';
  return type;
}

// Helper: Check if type needs hesap
function needsHesapForType(type: TransactionType): boolean {
  return ![
    'alis',
    'satis',
    'alis_iade',
    'satis_iade',
    'personel_gider_tab',
    'personel_satis_tab',
    'odeme',
  ].includes(type);
}

// Helper: Check if type needs hesap in data
function needsHesapInData(type: TransactionType): boolean {
  return ![
    'alis',
    'satis',
    'alis_iade',
    'satis_iade',
    'personel_gider_tab',
    'personel_satis_tab',
  ].includes(type);
}

export function useTransactionSubmit({
  isCariMode,
  isPersonelMode,
  type,
  amount,
  description,
  safeDate,
  kategoriId,
  isScheduled,
  odemeHedefType,
  categorySkipped,
  hesapId,
  hedefHesapId,
  sourceHesapId,
  cariId,
  personelId,
  hesaplar,
  cariler,
  personelList,
  setIsSaving,
  setHesapPickerTarget,
  setShowHesapPicker,
  setShowCariPicker,
  setShowPersonelPicker,
  setShowOdemeHedefTypePicker,
  setShowTahsilatHedefTypePicker,
  setShowKrediKartiPicker,
  setCategoryPickerOpen,
  setPendingModal,
  setShowExchangeRateBar,
  setPendingExchangeData,
  pendingExchangeData,
  onSuccess,
  handleDismiss,
}: UseTransactionSubmitOptions): UseTransactionSubmitReturn {
  const { t } = useTranslation(['transactions', 'common', 'clients', 'staff', 'accounts']);
  const createIslem = useCreateIslem();
  const createIleriTarihliIslem = useCreateIleriTarihliIslem();

  // Build transaction data
  const buildTransactionData = useCallback(
    (parsedAmount: number, exchangeRateInfo?: { sourceCurrency: Currency; targetCurrency: Currency; exchangeRate: number }) => {
      const apiType = mapTypeToApiType(type, odemeHedefType);
      const needsHesap = needsHesapInData(type);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = {
        type: apiType,
        amount: parsedAmount,
        description: description.trim() || null,
        hesap_id: needsHesap ? hesapId : null,
        kategori_id: kategoriId,
      };

      // Exchange rate info
      if (exchangeRateInfo) {
        data.source_currency = exchangeRateInfo.sourceCurrency;
        data.target_currency = exchangeRateInfo.targetCurrency;
        data.exchange_rate = exchangeRateInfo.exchangeRate;
      }

      // Type-specific fields
      if (type === 'transfer') {
        data.hedef_hesap_id = hedefHesapId;
      }
      if (type === 'odeme') {
        if (odemeHedefType === 'tedarikci') {
          data.cari_id = cariId;
        } else if (odemeHedefType === 'kredi_karti') {
          data.hedef_hesap_id = hedefHesapId;
        } else {
          data.personel_id = personelId;
        }
      }
      if (type === 'tahsilat') {
        data.cari_id = cariId;
      }
      if (['alis', 'satis', 'alis_iade', 'satis_iade'].includes(type)) {
        data.cari_id = cariId;
      }
      if (['personel_odeme_tab', 'personel_gider_tab', 'personel_tahsilat_tab', 'personel_satis_tab'].includes(type)) {
        data.personel_id = personelId;
      }

      return data;
    },
    [type, odemeHedefType, description, hesapId, kategoriId, hedefHesapId, cariId, personelId]
  );

  // Check cross-currency
  const checkCrossCurrency = useCallback(
    (parsedAmount: number): boolean => {
      // Transfer cross-currency check
      if (type === 'transfer' && hesapId && hedefHesapId) {
        const sourceAcc = hesaplar?.find((h) => h.id === hesapId);
        const targetAcc = hesaplar?.find((h) => h.id === hedefHesapId);
        const sourceCurr = sourceAcc?.currency || 'TRY';
        const targetCurr = targetAcc?.currency || 'TRY';
        if (isCrossCurrency(sourceCurr, targetCurr)) {
          setPendingExchangeData({
            sourceCurrency: sourceCurr as Currency,
            targetCurrency: targetCurr as Currency,
            sourceAmount: parsedAmount,
          });
          setShowExchangeRateBar(true);
          return true;
        }
      }

      // Payment/collection cross-currency check - compare hesap currency with cari currency
      if (['odeme', 'tahsilat'].includes(type) && sourceHesapId && cariId) {
        const sourceAcc = hesaplar?.find((h) => h.id === sourceHesapId);
        const targetCari = cariler?.find((c) => c.id === cariId);
        const sourceCurr = sourceAcc?.currency || 'TRY';
        const targetCurr = targetCari?.currency || 'TRY';
        if (isCrossCurrency(sourceCurr, targetCurr)) {
          setPendingExchangeData({
            sourceCurrency: sourceCurr as Currency,
            targetCurrency: targetCurr as Currency,
            sourceAmount: parsedAmount,
          });
          setShowExchangeRateBar(true);
          return true;
        }
      }

      // Cari mode cross-currency check - compare hesap currency with cari currency
      if (isCariMode && ['odeme', 'tahsilat'].includes(type) && sourceHesapId && cariId) {
        const sourceAcc = hesaplar?.find((h) => h.id === sourceHesapId);
        const targetCari = cariler?.find((c) => c.id === cariId);
        const sourceCurr = sourceAcc?.currency || 'TRY';
        const targetCurr = targetCari?.currency || 'TRY';
        if (isCrossCurrency(sourceCurr, targetCurr)) {
          setPendingExchangeData({
            sourceCurrency: sourceCurr as Currency,
            targetCurrency: targetCurr as Currency,
            sourceAmount: parsedAmount,
          });
          setShowExchangeRateBar(true);
          return true;
        }
      }

      // Personel mode cross-currency check - compare hesap currency with personel currency
      if (isPersonelMode && ['personel_odeme_tab', 'personel_tahsilat_tab'].includes(type) && sourceHesapId && personelId) {
        const sourceAcc = hesaplar?.find((h) => h.id === sourceHesapId);
        const targetPersonel = personelList?.find((p) => p.id === personelId);
        const sourceCurr = sourceAcc?.currency || 'TRY';
        const targetCurr = targetPersonel?.currency || 'TRY';
        if (isCrossCurrency(sourceCurr, targetCurr)) {
          setPendingExchangeData({
            sourceCurrency: sourceCurr as Currency,
            targetCurrency: targetCurr as Currency,
            sourceAmount: parsedAmount,
          });
          setShowExchangeRateBar(true);
          return true;
        }
      }

      return false;
    },
    [type, hesapId, hedefHesapId, sourceHesapId, cariId, personelId, hesaplar, cariler, personelList, isCariMode, isPersonelMode, setPendingExchangeData, setShowExchangeRateBar]
  );

  // Handle save
  const handleSave = useCallback(async () => {
    if (!isValidAmount(amount)) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    // Auto-open modals for missing required data
    // Normal Mode
    if (!isCariMode && !isPersonelMode) {
      if (type === 'transfer' && !hedefHesapId) {
        setHesapPickerTarget('hedef');
        setShowHesapPicker(true);
        return;
      }

      if (type === 'odeme') {
        if (!odemeHedefType) {
          setShowOdemeHedefTypePicker(true);
          return;
        }
        if (odemeHedefType === 'tedarikci') {
          if (!cariId) {
            if (!kategoriId && !categorySkipped) setPendingModal('category');
            setShowCariPicker(true);
            return;
          }
          if (!kategoriId && !categorySkipped) {
            setCategoryPickerOpen(true);
            return;
          }
        } else if (odemeHedefType === 'staff') {
          if (!personelId) {
            if (!kategoriId && !categorySkipped) setPendingModal('category');
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
        }
      }

      if (type === 'tahsilat') {
        if (!cariId) {
          if (!kategoriId && !categorySkipped) setPendingModal('category');
          setShowCariPicker(true);
          return;
        }
        if (!kategoriId && !categorySkipped) {
          setCategoryPickerOpen(true);
          return;
        }
      }

      if (['gelir', 'gider'].includes(type) && !kategoriId && !categorySkipped) {
        setCategoryPickerOpen(true);
        return;
      }
    }

    // Cari Mode
    if (isCariMode) {
      if (type === 'odeme' || type === 'tahsilat') {
        if (!sourceHesapId) {
          if (!kategoriId && !categorySkipped) setPendingModal('category');
          setHesapPickerTarget('source');
          setShowHesapPicker(true);
          return;
        }
        if (!kategoriId && !categorySkipped) {
          setCategoryPickerOpen(true);
          return;
        }
      }
      if (['alis', 'satis', 'alis_iade', 'satis_iade'].includes(type) && !kategoriId && !categorySkipped) {
        setCategoryPickerOpen(true);
        return;
      }
    }

    // Personel Mode
    if (isPersonelMode) {
      if (['personel_odeme_tab', 'personel_tahsilat_tab'].includes(type)) {
        if (!sourceHesapId) {
          if (!kategoriId && !categorySkipped) setPendingModal('category');
          setHesapPickerTarget('source');
          setShowHesapPicker(true);
          return;
        }
        if (!kategoriId && !categorySkipped) {
          setCategoryPickerOpen(true);
          return;
        }
      }
      if ((type === 'personel_gider_tab' || type === 'personel_satis_tab') && !kategoriId && !categorySkipped) {
        setCategoryPickerOpen(true);
        return;
      }
    }

    // Validation
    if (needsHesapForType(type) && !hesapId) {
      Alert.alert(t('common:status.error'), t('accounts:messages.noAccounts'));
      return;
    }

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

    if ((type === 'alis' || type === 'alis_iade') && !cariId) {
      Alert.alert(t('common:status.error'), t('clients:transactionForm.selectSupplier'));
      return;
    }

    if ((type === 'satis' || type === 'satis_iade') && !cariId) {
      Alert.alert(t('common:status.error'), t('clients:transactionForm.selectCustomer'));
      return;
    }

    if (['personel_odeme_tab', 'personel_gider_tab', 'personel_tahsilat_tab', 'personel_satis_tab'].includes(type) && !personelId) {
      Alert.alert(t('common:status.error'), t('staff:transactionForm.selectPersonel'));
      return;
    }

    // Parse amount
    const parsedAmount = parseCurrency(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    // Check cross-currency
    if (checkCrossCurrency(parsedAmount)) {
      return;
    }

    // Submit transaction
    setIsSaving(true);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const transactionData = buildTransactionData(parsedAmount);

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
    amount,
    isCariMode,
    isPersonelMode,
    type,
    odemeHedefType,
    hedefHesapId,
    sourceHesapId,
    cariId,
    personelId,
    kategoriId,
    categorySkipped,
    hesapId,
    isScheduled,
    safeDate,
    t,
    setHesapPickerTarget,
    setShowHesapPicker,
    setShowCariPicker,
    setShowPersonelPicker,
    setShowOdemeHedefTypePicker,
    setShowKrediKartiPicker,
    setCategoryPickerOpen,
    setPendingModal,
    checkCrossCurrency,
    setIsSaving,
    buildTransactionData,
    createIleriTarihliIslem,
    createIslem,
    onSuccess,
    handleDismiss,
  ]);

  // Handle exchange rate confirmation
  const handleExchangeRateConfirm = useCallback(
    async (exchangeRate: number, _targetAmount: number) => {
      if (!pendingExchangeData) return;

      setShowExchangeRateBar(false);
      setIsSaving(true);

      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      try {
        const transactionData = buildTransactionData(pendingExchangeData.sourceAmount, {
          sourceCurrency: pendingExchangeData.sourceCurrency,
          targetCurrency: pendingExchangeData.targetCurrency,
          exchangeRate,
        });

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
    },
    [
      pendingExchangeData,
      isScheduled,
      safeDate,
      t,
      setShowExchangeRateBar,
      setIsSaving,
      buildTransactionData,
      createIleriTarihliIslem,
      createIslem,
      setPendingExchangeData,
      onSuccess,
      handleDismiss,
    ]
  );

  return {
    handleSave,
    handleExchangeRateConfirm,
  };
}
