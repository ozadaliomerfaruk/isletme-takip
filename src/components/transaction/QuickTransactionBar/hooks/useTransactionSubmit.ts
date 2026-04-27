import { useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useCreateIslem, useUpdateIslem, useDeleteIslem } from '@/hooks/useIslemler';
import { useCreateIleriTarihliIslem, useUpdateIleriTarihliIslem, useDeleteIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import { useUploadIslemPhoto } from '@/hooks/useIslemPhoto';
import { useCreateUrunHareket } from '@/hooks/useUrunHareketler';
import { parseCurrency, isValidAmount } from '@/lib/currency';
import { formatDateForDB, formatDateTimeForDB } from '@/lib/date';
import { isCrossCurrency } from '@/constants/currencies';
import type { TransactionType, OdemeHedefType, HesapPickerTarget, PendingModal, QuickTransactionMode, UrunItem } from '../types';
import type { Currency, UrunHareketTipi } from '@/types/database';
import { useAuthContext } from '@/contexts/AuthContext';
import { useReview } from '@/contexts/ReviewContext';
import { useToast } from '@/contexts/ToastContext';

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
  isEditMode: boolean;

  // Edit mode props
  mode?: QuickTransactionMode;
  transactionId?: string;
  isScheduledTransaction?: boolean;

  // Form state
  type: TransactionType;
  amount: string;
  description: string;
  safeDate: Date;
  safeDateEnd?: Date | null;
  kategoriId: string | null;
  isScheduled: boolean;
  odemeHedefType: OdemeHedefType;
  categorySkipped: boolean;

  // Photo
  photoUri: string | null;

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

  // Urun items for alis/satis/iade transactions
  urunItems?: UrunItem[];

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
  if (type === 'personel_izin_hakki_tab') return 'personel_izin_hakki';
  if (type === 'personel_izin_kullanimi_tab') return 'personel_izin_kullanimi';
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
    'personel_izin_hakki_tab',
    'personel_izin_kullanimi_tab',
    'odeme',
  ].includes(type);
}

// Helper: Strip fields not supported by ileri_tarihli_islemler table
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripScheduledUnsupportedFields(data: any): any {
  const { source_currency, target_currency, exchange_rate, photo_path, date_end, ...rest } = data;
  return rest;
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
    'personel_izin_hakki_tab',
    'personel_izin_kullanimi_tab',
  ].includes(type);
}

export function useTransactionSubmit({
  isCariMode,
  isPersonelMode,
  isEditMode,
  mode = 'create',
  transactionId,
  isScheduledTransaction = false,
  type,
  amount,
  description,
  safeDate,
  safeDateEnd,
  kategoriId,
  isScheduled,
  odemeHedefType,
  categorySkipped,
  photoUri,
  hesapId,
  hedefHesapId,
  sourceHesapId,
  cariId,
  personelId,
  hesaplar,
  cariler,
  personelList,
  urunItems = [],
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
  const { isletme } = useAuthContext();
  const { triggerReviewIfEligible } = useReview();
  const { showToast } = useToast();
  const createIslem = useCreateIslem();
  const updateIslem = useUpdateIslem();
  const createIleriTarihliIslem = useCreateIleriTarihliIslem();
  const updateIleriTarihliIslem = useUpdateIleriTarihliIslem();
  const deleteIslem = useDeleteIslem();
  const deleteIleriTarihliIslem = useDeleteIleriTarihliIslem();
  const uploadPhoto = useUploadIslemPhoto();
  const createUrunHareket = useCreateUrunHareket();

  // Helper: Get urun movement type based on transaction type
  const getUrunHareketTipi = useCallback((txnType: TransactionType): UrunHareketTipi | null => {
    // alis: Tedarikçiden mal alındı → Ürün Girişi
    if (txnType === 'alis') return 'giris';
    // satis: Müşteriye mal satıldı → Ürün Çıkışı
    if (txnType === 'satis') return 'cikis';
    // alis_iade: Tedarikçiye mal iade edildi → Ürün Çıkışı
    if (txnType === 'alis_iade') return 'cikis';
    // satis_iade: Müşteriden mal iade alındı → Ürün Girişi
    if (txnType === 'satis_iade') return 'giris';
    // gelir: Gelir işleminde ürün eklenmişse → Ürün Girişi
    if (txnType === 'gelir') return 'giris';
    // gider: Gider işleminde ürün eklenmişse → Ürün Çıkışı
    if (txnType === 'gider') return 'cikis';
    // kredi_karti_gider: Kredi kartı gideri → Ürün Çıkışı
    if (txnType === 'kredi_karti_gider') return 'cikis';
    return null;
  }, []);

  // Helper: Create urun movements for transaction
  const createUrunHareketler = useCallback(async (txnType: TransactionType, desc: string, islemId: string) => {
    if (urunItems.length === 0) return;

    const hareketTipi = getUrunHareketTipi(txnType);
    if (!hareketTipi) return;

    // Create urun movement for each item
    const promises = urunItems.map(item =>
      createUrunHareket.mutateAsync({
        urun_id: item.urunId,
        islem_id: islemId,
        hareket_tipi: hareketTipi,
        miktar: item.miktar,
        birim_fiyat: item.birimFiyat,
        kdv_orani: item.kdvOrani,
        aciklama: desc || undefined,
      })
    );

    await Promise.all(promises);
  }, [urunItems, getUrunHareketTipi, createUrunHareket]);

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
      if (['personel_odeme_tab', 'personel_gider_tab', 'personel_tahsilat_tab', 'personel_satis_tab', 'personel_izin_hakki_tab', 'personel_izin_kullanimi_tab'].includes(type)) {
        data.personel_id = personelId;
      }

      // Leave usage date range
      if (type === 'personel_izin_kullanimi_tab' && safeDateEnd) {
        data.date_end = formatDateForDB(safeDateEnd);
      }

      return data;
    },
    [type, odemeHedefType, description, hesapId, kategoriId, hedefHesapId, cariId, personelId, safeDateEnd]
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

      // Normal mode personel payment cross-currency check - compare hesap currency with personel currency
      if (!isPersonelMode && type === 'odeme' && odemeHedefType === 'staff' && hesapId && personelId) {
        const sourceAcc = hesaplar?.find((h) => h.id === hesapId);
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
    [type, hesapId, hedefHesapId, sourceHesapId, cariId, personelId, odemeHedefType, hesaplar, cariler, personelList, isCariMode, isPersonelMode, setPendingExchangeData, setShowExchangeRateBar]
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
    // Skip in edit mode — all data was already loaded from the transaction
    if (isEditMode) {
      // In edit mode, just proceed to save directly (no auto-open pickers)
    } else
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

      if (['gelir', 'gider'].includes(type) && !kategoriId && !categorySkipped && urunItems.length === 0) {
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
      if (['alis', 'satis', 'alis_iade', 'satis_iade'].includes(type) && !kategoriId && !categorySkipped && urunItems.length === 0) {
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

    if (['personel_odeme_tab', 'personel_gider_tab', 'personel_tahsilat_tab', 'personel_satis_tab', 'personel_izin_hakki_tab', 'personel_izin_kullanimi_tab'].includes(type) && !personelId) {
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

      // Edit mode - update existing transaction
      if (isEditMode && transactionId) {
        if (isScheduledTransaction && isScheduled) {
          // Was scheduled, stays scheduled → update scheduled transaction
          await updateIleriTarihliIslem.mutateAsync({
            id: transactionId,
            updates: {
              ...stripScheduledUnsupportedFields(transactionData),
              scheduled_date: formatDateForDB(safeDate),
            },
          });
        } else if (!isScheduledTransaction && !isScheduled) {
          // Was regular, stays regular → update normal transaction
          await updateIslem.mutateAsync({
            id: transactionId,
            updates: {
              ...transactionData,
              date: formatDateTimeForDB(safeDate),
            },
          });

          // Upload photo if present (supports adding photo to existing transaction)
          if (photoUri && isletme?.id) {
            try {
              console.log('[PhotoUpload] Starting upload for existing islem:', transactionId);
              const photoPath = await uploadPhoto.mutateAsync({
                uri: photoUri,
                isletmeId: isletme.id,
                islemId: transactionId,
              });
              console.log('[PhotoUpload] Upload success, path:', photoPath);
              await updateIslem.mutateAsync({
                id: transactionId,
                updates: { photo_path: photoPath },
              });
              console.log('[PhotoUpload] Transaction updated with photo_path');
            } catch (photoError) {
              console.error('[PhotoUpload] Error:', photoError);
              Alert.alert(t('common:status.warning'), t('transactions:messages.photoUploadFailed'));
            }
          }
        } else if (!isScheduledTransaction && isScheduled) {
          // Was regular, now scheduled → delete regular + create scheduled
          await deleteIslem.mutateAsync(transactionId);
          await createIleriTarihliIslem.mutateAsync({
            ...stripScheduledUnsupportedFields(transactionData),
            scheduled_date: formatDateForDB(safeDate),
          });
        } else {
          // Was scheduled, now regular → delete scheduled + create regular
          await deleteIleriTarihliIslem.mutateAsync(transactionId);
          await createIslem.mutateAsync({
            ...transactionData,
            date: formatDateTimeForDB(safeDate),
          });
        }
      }
      // Create mode - create new transaction
      else {
        if (isScheduled) {
          // Scheduled transactions don't support photos/exchange rate
          await createIleriTarihliIslem.mutateAsync({
            ...stripScheduledUnsupportedFields(transactionData),
            scheduled_date: formatDateForDB(safeDate),
          });
        } else {
          // Create transaction first to get the ID
          const newIslem = await createIslem.mutateAsync({
            ...transactionData,
            date: formatDateTimeForDB(safeDate),
          });

          // Upload photo if present
          if (photoUri && isletme?.id && newIslem?.id) {
            try {
              console.log('[PhotoUpload] Starting upload for islem:', newIslem.id);
              const photoPath = await uploadPhoto.mutateAsync({
                uri: photoUri,
                isletmeId: isletme.id,
                islemId: newIslem.id,
              });
              console.log('[PhotoUpload] Upload success, path:', photoPath);
              // Update the transaction with the photo path
              await updateIslem.mutateAsync({
                id: newIslem.id,
                updates: { photo_path: photoPath },
              });
              console.log('[PhotoUpload] Transaction updated with photo_path');
            } catch (photoError) {
              console.error('[PhotoUpload] Error:', photoError);
              Alert.alert(t('common:status.warning'), t('transactions:messages.photoUploadFailed'));
            }
          }

          // Create urun movements if urunItems present (for alis/satis/iade/gelir/gider/kredi_karti_gider)
          if (urunItems.length > 0 && newIslem?.id) {
            try {
              await createUrunHareketler(type, description.trim(), newIslem.id);
              console.log('[UrunHareket] Urun movements created successfully');
            } catch (urunError) {
              console.error('[UrunHareket] Error creating urun movements:', urunError);
              Alert.alert(t('common:status.warning'), t('transactions:messages.urunMovementFailed'));
            }
          }
        }
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Show success toast
      showToast(
        isEditMode
          ? t('transactions:messages.updateSuccess')
          : t('transactions:messages.saveSuccess'),
        'success'
      );

      // Trigger review prompt for new transactions (not edits)
      if (!isEditMode) {
        // Async call, don't await - we don't want to block the UI
        triggerReviewIfEligible().catch((err) => {
          console.log('[Review] Error triggering review:', err);
        });
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
    isEditMode,
    transactionId,
    isScheduledTransaction,
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
    photoUri,
    isletme,
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
    updateIslem,
    updateIleriTarihliIslem,
    deleteIslem,
    deleteIleriTarihliIslem,
    uploadPhoto,
    triggerReviewIfEligible,
    showToast,
    onSuccess,
    handleDismiss,
    urunItems,
    createUrunHareketler,
    description,
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

        // Edit mode - update existing transaction
        if (isEditMode && transactionId) {
          if (isScheduledTransaction && isScheduled) {
            // Was scheduled, stays scheduled → update scheduled (strip unsupported fields)
            await updateIleriTarihliIslem.mutateAsync({
              id: transactionId,
              updates: {
                ...stripScheduledUnsupportedFields(transactionData),
                scheduled_date: formatDateForDB(safeDate),
              },
            });
          } else if (!isScheduledTransaction && !isScheduled) {
            // Was regular, stays regular → update normal transaction
            await updateIslem.mutateAsync({
              id: transactionId,
              updates: {
                ...transactionData,
                date: formatDateTimeForDB(safeDate),
              },
            });
          } else if (!isScheduledTransaction && isScheduled) {
            // Was regular, now scheduled → delete regular + create scheduled (strip unsupported fields)
            await deleteIslem.mutateAsync(transactionId);
            await createIleriTarihliIslem.mutateAsync({
              ...stripScheduledUnsupportedFields(transactionData),
              scheduled_date: formatDateForDB(safeDate),
            });
          } else {
            // Was scheduled, now regular → delete scheduled + create regular
            await deleteIleriTarihliIslem.mutateAsync(transactionId);
            await createIslem.mutateAsync({
              ...transactionData,
              date: formatDateTimeForDB(safeDate),
            });
          }
        }
        // Create mode - create new transaction
        else {
          if (isScheduled) {
            // Scheduled transactions don't support exchange rate fields
            await createIleriTarihliIslem.mutateAsync({
              ...stripScheduledUnsupportedFields(transactionData),
              scheduled_date: formatDateForDB(safeDate),
            });
          } else {
            await createIslem.mutateAsync({
              ...transactionData,
              date: formatDateTimeForDB(safeDate),
            });
          }
        }

        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        // Show success toast
        showToast(
          isEditMode
            ? t('transactions:messages.updateSuccess')
            : t('transactions:messages.saveSuccess'),
          'success'
        );

        // Trigger review prompt for new transactions (not edits)
        if (!isEditMode) {
          triggerReviewIfEligible().catch((err) => {
            console.log('[Review] Error triggering review:', err);
          });
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
      isEditMode,
      transactionId,
      isScheduledTransaction,
      safeDate,
      t,
      setShowExchangeRateBar,
      setIsSaving,
      buildTransactionData,
      createIleriTarihliIslem,
      createIslem,
      updateIslem,
      updateIleriTarihliIslem,
      deleteIslem,
      deleteIleriTarihliIslem,
      triggerReviewIfEligible,
      showToast,
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
