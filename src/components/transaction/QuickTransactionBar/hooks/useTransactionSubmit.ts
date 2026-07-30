import { useCallback, useEffect, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCreateIslem,
  useCreateIslemV2,
  useCreateIslemWithUrun,
  useCreateIslemTaksitli,
  useUpdateIslem,
  useDeleteIslem,
} from '@/hooks/useIslemler';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
import { useCreateIleriTarihliIslem, useUpdateIleriTarihliIslem, useDeleteIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import { useDeleteIslemPhoto, useUploadIslemPhoto } from '@/hooks/useIslemPhoto';
import { useReapplyUrunHareketlerForIslem } from '@/hooks/useUrunHareketler';
import { parseCurrency, isValidAmount, roundCurrency, toNumber } from '@/lib/currency';
import { formatDateForDB, formatDateTimeForDB } from '@/lib/date';
import { isCrossCurrency } from '@/constants/currencies';
import { resolveHedefIslemId } from '@/lib/hedefTahsis';
import type { TransactionType, OdemeHedefType, HesapPickerTarget, PendingModal, QuickTransactionMode, UrunItem } from '../types';
import type { Currency, IslemInsert, UrunHareketTipi } from '@/types/database';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useReview } from '@/contexts/ReviewContext';
import { supabase, msSinceForeground } from '@/lib/supabase';
import { logEvent } from '@/lib/appEvents';
import { useToast } from '@/contexts/ToastContext';
import { recordLastUsed } from '@/lib/lastUsedSelections';
import { getCategoryType } from '../utils/categoryTypeMapper';
import {
  classifyMutationError,
  getTransactionMutationMessageKey,
  MutationRetryPayloadChangedError,
  ProductAtomicWriteUnavailableError,
} from '@/lib/errors';
import { buildMutationFingerprint } from '@/lib/mutationIdentity';
import { shouldUseCreateIslemV2 } from '@/lib/createIslemV2Client';
import {
  amountToCents,
  validateInstallmentPlan,
  type InstallmentPlan,
  type InstallmentRpcRow,
} from '@/lib/installmentDistribution';
import type { EditOriginalSnapshot } from './useQuickTransactionForm';
import {
  clearIslemPhotoCopyOnWrite,
  getValidatedIslemPhotoPath,
  removeIslemPhotoBestEffort,
  replaceIslemPhotoCopyOnWrite,
} from '@/lib/islemPhotoLifecycle';
import { supportsSharedProductMutationV3 } from '@/lib/sharedProductMutationTypes';
import {
  getTransactionProductMutationDecision,
  isEditableProductPayloadComplete,
} from '@/lib/transactionProductMutationGate';

interface Hesap {
  id: string;
  name: string;
  balance?: number;
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
  /** Kur onayından sonraki create tekrarlarında kullanılan sabit idempotency anahtarı. */
  clientIslemId?: string;
  /** Düzenlemede kur alanına ön-dolacak KAYITLI kur (bkz. ExchangeRateBar.initialRate). */
  initialRate?: number | null;
}

interface UseTransactionSubmitOptions {
  // Mode
  visible: boolean;
  /** Known same-tenant Cari/Personel create surface may opt simple rows into V2. */
  enableScopedV2Create?: boolean;
  /** Linked-cari viewer writes remain on the legacy inversion-aware endpoint. */
  isViewer?: boolean;
  isCariMode: boolean;
  isPersonelMode: boolean;
  isEditMode: boolean;
  /** Mutabakat kuyruğu gibi toplu akışlarda son-kullanılan persist'ini atla (#4b). */
  suppressLastUsed?: boolean;

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
  /** Vade (ödeme tarihi) — yalnız borç-doğuran (alış/satış) tiplerde. */
  vadeTarihi?: Date | null;
  /** Faz 3: taksit planı (yalnız alış/satış + non-scheduled + ürünsüz create'te). */
  taksitPlan?: InstallmentPlan | null;
  kategoriId: string | null;
  isScheduled: boolean;
  odemeHedefType: OdemeHedefType;
  categorySkipped: boolean;

  // Photo
  photoUri: string | null;
  /** Edit açılışında DB'den gelen yol; yalnız gerçekten değişirse başarı sonrası temizlenir. */
  originalPhotoPath?: string | null;
  /** Kullanıcı edit sırasında mevcut fotoğrafı açıkça kaldırdı. */
  removeOriginalPhoto?: boolean;

  // IDs
  hesapId: string | undefined;
  hedefHesapId: string | null;
  sourceHesapId: string | null;
  cariId: string | null;
  personelId: string | null;
  /** Faz 2 hedefleme: satır-swipe "öde/tahsil et" jestinden gelen hedef fatura islem_id'si.
   *  Yalnız create + cari ödeme/tahsilat'ta p_new_row.hedef_islem_id olarak yazılır. */
  hedefIslemId?: string | null;

  // Entities
  hesaplar: Hesap[] | undefined;
  cariler: Cari[] | undefined;
  personelList: Personel[] | undefined;

  // Urun items for alis/satis/iade transactions
  urunItems?: UrunItem[];
  /** Edit açılışında işleme bağlı ürün hareketi vardı; tüm ürünler silinse bile reapply gerekir. */
  /** Exact transaction-id product-presence query completed without placeholder/error. */
  productItemsResolved?: boolean;
  /** Authoritative persisted raw movement count from the batch query. */
  persistedProductItemCount?: number;
  /** Full editable product rows were loaded successfully. */
  productEditDataResolved?: boolean;
  /** Count of full editable product rows used to construct the outgoing payload. */
  editableProductItemCount?: number;
  /**
   * Düzenlenen asıl işlem satırının creator'ı. `undefined` henüz
   * çözümlenmemiş kayıt, `null` ise gerçek eski/creator'sız kayıt demektir.
   */
  editTransactionCreatedBy?: string | null;

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
  /** Düzenlemeye açılan işlemin kur/alan açılış hâli (A6 — tarihsel kuru koru). */
  editOriginal: EditOriginalSnapshot | null;

  // Callbacks
  onSuccess?: (islemId?: string) => void;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- works with dynamic transaction data object
function stripScheduledUnsupportedFields(data: any): any {
  // vade_tarihi de strip'lenir: ileri_tarihli_islemler tablosunda böyle bir kolon YOK
  // (ileri-tarihli ≠ vade — ayrı kavram). Aksi halde insert bilinmeyen-kolon hatası verir.
  const { source_currency, target_currency, exchange_rate, photo_path, date_end, vade_tarihi, ...rest } = data;
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

const UPDATE_PROBE_TIMEOUT_MS = 5000;
type MutationOutcomeProbe = 'landed' | 'not_landed' | 'partial' | 'unknown';

async function probeCreatedTransaction(
  islemId: string,
  isletmeId: string,
): Promise<MutationOutcomeProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPDATE_PROBE_TIMEOUT_MS);
  try {
    const { data, error } = await supabase
      .from('islemler')
      .select('id')
      .eq('id', islemId)
      .eq('isletme_id', isletmeId)
      .abortSignal(controller.signal)
      .maybeSingle();
    if (error) return 'unknown';
    return data ? 'landed' : 'not_landed';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

async function probeCreatedScheduledTransaction(
  scheduledIslemId: string,
  isletmeId: string,
): Promise<MutationOutcomeProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPDATE_PROBE_TIMEOUT_MS);
  try {
    const { data, error } = await supabase
      .from('ileri_tarihli_islemler')
      .select('id')
      .eq('id', scheduledIslemId)
      .eq('isletme_id', isletmeId)
      .abortSignal(controller.signal)
      .maybeSingle();
    if (error) return 'unknown';
    return data ? 'landed' : 'not_landed';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

async function probeRegularToScheduledConversion(
  scheduledIslemId: string,
  regularIslemId: string,
  isletmeId: string,
): Promise<MutationOutcomeProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPDATE_PROBE_TIMEOUT_MS);
  try {
    const [scheduledResult, regularResult] = await Promise.all([
      supabase
        .from('ileri_tarihli_islemler')
        .select('id')
        .eq('id', scheduledIslemId)
        .eq('isletme_id', isletmeId)
        .abortSignal(controller.signal)
        .maybeSingle(),
      supabase
        .from('islemler')
        .select('id')
        .eq('id', regularIslemId)
        .eq('isletme_id', isletmeId)
        .abortSignal(controller.signal)
        .maybeSingle(),
    ]);

    if (scheduledResult.error || regularResult.error) return 'unknown';
    if (scheduledResult.data && !regularResult.data) return 'landed';
    if (!scheduledResult.data && regularResult.data) return 'not_landed';
    if (scheduledResult.data && regularResult.data) return 'partial';
    return 'unknown';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

async function probeScheduledToRegularConversion(
  regularIslemId: string,
  scheduledIslemId: string,
  isletmeId: string,
): Promise<MutationOutcomeProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPDATE_PROBE_TIMEOUT_MS);
  try {
    const [regularResult, scheduledResult] = await Promise.all([
      supabase
        .from('islemler')
        .select('id')
        .eq('id', regularIslemId)
        .eq('isletme_id', isletmeId)
        .abortSignal(controller.signal)
        .maybeSingle(),
      supabase
        .from('ileri_tarihli_islemler')
        .select('id')
        .eq('id', scheduledIslemId)
        .eq('isletme_id', isletmeId)
        .abortSignal(controller.signal)
        .maybeSingle(),
    ]);

    if (regularResult.error || scheduledResult.error) return 'unknown';
    if (regularResult.data && !scheduledResult.data) return 'landed';
    if (!regularResult.data && scheduledResult.data) return 'not_landed';
    if (regularResult.data && scheduledResult.data) return 'partial';
    // İki satır da yoksa tersine ve beklenmeyen bir kısmi sonuç vardır.
    return 'unknown';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Update RPC'si commit olduktan sonra HTTP cevabı kaybolabilir. Aynı alanlar DB'de gerçekten
 * yazılmışsa kullanıcıya hata gösterip tekrar denetmek yerine başarı kabul et. Bu probe yalnız
 * normal edit'in hata yolunda çalışır; hiçbir veri yazmaz.
 */
async function didRegularUpdateLand(
  islemId: string,
  isletmeId: string,
  expected: Partial<Omit<IslemInsert, 'isletme_id'>>,
): Promise<MutationOutcomeProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPDATE_PROBE_TIMEOUT_MS);
  try {
    const { data, error } = await supabase
      .from('islemler')
      .select('*')
      .eq('id', islemId)
      .eq('isletme_id', isletmeId)
      .abortSignal(controller.signal)
      .maybeSingle();
    if (error) return 'unknown';
    if (!data) return 'not_landed';

    const exactMatch = Object.entries(expected).every(([key, expectedValue]) => {
      const actualValue = (data as Record<string, unknown>)[key];
      if (key === 'amount' || key === 'exchange_rate') {
        const actualNumber =
          typeof actualValue === 'number' || typeof actualValue === 'string' ? actualValue : null;
        const expectedNumber =
          typeof expectedValue === 'number' || typeof expectedValue === 'string' ? expectedValue : null;
        return roundCurrency(toNumber(actualNumber)) === roundCurrency(toNumber(expectedNumber));
      }
      if (key === 'date') {
        const actualMs = new Date(String(actualValue)).getTime();
        const expectedMs = new Date(String(expectedValue)).getTime();
        return Number.isFinite(actualMs) && Number.isFinite(expectedMs) && actualMs === expectedMs;
      }
      return (actualValue ?? null) === (expectedValue ?? null);
    });
    return exactMatch ? 'landed' : 'not_landed';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

export function useTransactionSubmit({
  visible,
  enableScopedV2Create = false,
  isViewer = false,
  isCariMode,
  isPersonelMode,
  isEditMode,
  suppressLastUsed,
  mode = 'create',
  transactionId,
  isScheduledTransaction = false,
  type,
  amount,
  description,
  safeDate,
  safeDateEnd,
  vadeTarihi,
  taksitPlan,
  kategoriId,
  isScheduled,
  odemeHedefType,
  categorySkipped,
  photoUri,
  originalPhotoPath = null,
  removeOriginalPhoto = false,
  hesapId,
  hedefHesapId,
  sourceHesapId,
  cariId,
  personelId,
  hedefIslemId,
  hesaplar,
  cariler,
  personelList,
  urunItems = [],
  productItemsResolved = false,
  persistedProductItemCount = 0,
  productEditDataResolved = false,
  editableProductItemCount = 0,
  editTransactionCreatedBy,
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
  editOriginal,
  onSuccess,
  handleDismiss,
}: UseTransactionSubmitOptions): UseTransactionSubmitReturn {
  const { t } = useTranslation(['transactions', 'common', 'clients', 'staff', 'accounts', 'errors']);
  const { isletme } = useAuthContext();
  const { isOwner, canAccessModule, canUpdate } = usePermissions();
  const { triggerReviewIfEligible } = useReview();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const createIslem = useCreateIslem();
  const createIslemV2 = useCreateIslemV2();
  const createIslemWithUrun = useCreateIslemWithUrun();
  const createIslemTaksitli = useCreateIslemTaksitli();
  const updateIslem = useUpdateIslem();
  const createIleriTarihliIslem = useCreateIleriTarihliIslem();
  const updateIleriTarihliIslem = useUpdateIleriTarihliIslem();
  const deleteIslem = useDeleteIslem();
  const deleteIleriTarihliIslem = useDeleteIleriTarihliIslem();
  const uploadPhoto = useUploadIslemPhoto();
  const deletePhoto = useDeleteIslemPhoto();
  const reapplyUrunHareketler = useReapplyUrunHareketlerForIslem();
  const isSavingRef = useRef(false);
  // Çift/üç gönderim koruması: handleSave'deki ilk async işten ÖNCE
  // senkron olarak kurulur; yavaş ağda hızlı çift dokunuşun ikinci/üçüncüsü erkenden eler.
  const submitInFlightRef = useRef(false);
  // Sonucu doğrulanamayan create/dönüşüm tekrarında AYNI UUID kullanılmalı. Aksi halde
  // kullanıcı aynı açık formda tekrar Kaydet'e bastığında ikinci finansal kayıt oluşabilir.
  // Form gerçekten kapandığında yeni oturum başlar ve kimlikler temizlenir.
  const regularMutationIdRef = useRef<string | null>(null);
  const scheduledMutationIdRef = useRef<string | null>(null);
  const regularMutationFingerprintRef = useRef<string | null>(null);
  const scheduledMutationFingerprintRef = useRef<string | null>(null);
  const syncTransactionPhotoBestEffort = useCallback(
    async (targetIslemId: string): Promise<void> => {
      if (
        !isOwner
        || !isletme?.id
        || (!photoUri && !removeOriginalPhoto)
      ) return;

      const verifiedOriginalPhotoPath = getValidatedIslemPhotoPath(
        originalPhotoPath,
        isletme.id,
        targetIslemId,
      );

      try {
        if (photoUri) {
          await replaceIslemPhotoCopyOnWrite({
            oldPhotoPath: verifiedOriginalPhotoPath,
            uploadPhoto: () => uploadPhoto.mutateAsync({
              uri: photoUri,
              isletmeId: isletme.id,
              islemId: targetIslemId,
            }),
            updatePhotoPointer: (photoPath) => updateIslem.mutateAsync({
              id: targetIslemId,
              updates: { photo_path: photoPath },
            }),
            removePhoto: (photoPath) => deletePhoto.mutateAsync(photoPath),
          });
          return;
        }

        if (removeOriginalPhoto) {
          await clearIslemPhotoCopyOnWrite({
            oldPhotoPath: verifiedOriginalPhotoPath,
            clearPhotoPointer: () => updateIslem.mutateAsync({
              id: targetIslemId,
              updates: { photo_path: null },
            }),
            removePhoto: (photoPath) => deletePhoto.mutateAsync(photoPath),
          });
        }
      } catch (photoError) {
        console.error('[PhotoUpload] Error:', photoError);
        Alert.alert(
          t('common:status.warning'),
          t('transactions:messages.photoUploadFailed'),
        );
      }
    },
    [
      deletePhoto,
      isOwner,
      isletme?.id,
      originalPhotoPath,
      photoUri,
      removeOriginalPhoto,
      t,
      updateIslem,
      uploadPhoto,
    ],
  );

  const cleanupOriginalPhotoAfterDelete = useCallback(
    async (deletedIslemId: string): Promise<void> => {
      const verifiedOriginalPhotoPath = getValidatedIslemPhotoPath(
        originalPhotoPath,
        isletme?.id,
        deletedIslemId,
      );
      await removeIslemPhotoBestEffort(
        verifiedOriginalPhotoPath,
        (photoPath) => deletePhoto.mutateAsync(photoPath),
      );
    },
    [deletePhoto, isletme?.id, originalPhotoPath],
  );
  const rememberRegularMutationPayload = useCallback((payload: unknown) => {
    const nextFingerprint = buildMutationFingerprint(payload);
    if (
      regularMutationFingerprintRef.current
      && regularMutationFingerprintRef.current !== nextFingerprint
    ) {
      throw new MutationRetryPayloadChangedError();
    }
    regularMutationFingerprintRef.current = nextFingerprint;
  }, []);
  const rememberScheduledMutationPayload = useCallback((payload: unknown) => {
    const nextFingerprint = buildMutationFingerprint(payload);
    if (
      scheduledMutationFingerprintRef.current
      && scheduledMutationFingerprintRef.current !== nextFingerprint
    ) {
      throw new MutationRetryPayloadChangedError();
    }
    scheduledMutationFingerprintRef.current = nextFingerprint;
  }, []);
  const resetMutationIds = useCallback(() => {
    regularMutationIdRef.current = null;
    scheduledMutationIdRef.current = null;
    regularMutationFingerprintRef.current = null;
    scheduledMutationFingerprintRef.current = null;
  }, []);

  useEffect(() => {
    if (!visible) {
      resetMutationIds();
    }
  }, [resetMutationIds, visible]);

  // A1: başarılı CREATE sonrası son-kullanılan hesap/kategoriyi diske yazar (fire-and-forget).
  // Edit'te çağrılmaz — eski işlemi düzenlemek kullanıcının güncel varsayılanlarını ezmemeli.
  // Anahtar isletme.id ile namespace'li; hesap RAW tipe, kategori gelir/gider ailesine göre.
  const persistLastUsed = useCallback(() => {
    if (!isletme?.id) return;
    // #4b: persist artık cari/personel modda da çalışır (chip'ler o modlarda da beslensin —
    // işini cari üzerinden yürüten esnafta recents boş kalmasın). TEK istisna suppressLastUsed:
    // mutabakat "eksikleri ekle" kuyruğu bar'ı her kalemde remount edip birçok farklı işlemi
    // arka arkaya kaydeder → tek kategoriyle toplu yanlış-etiketleyip belleği ezerdi; o yol
    // suppressLastUsed=true geçer. (Edit'te zaten çağrılmaz.)
    if (suppressLastUsed) return;
    // Ürün-taşıyan kayıtlarda kategori 'skip' sayılır → kategori yazma.
    const kategoriToPersist = urunItems.length > 0 ? null : kategoriId;
    void recordLastUsed(isletme.id, {
      type,
      family: getCategoryType(type),
      hesapId: hesapId ?? null,
      kategoriId: kategoriToPersist,
    });
  }, [isletme, type, hesapId, kategoriId, urunItems.length, suppressLastUsed]);

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
    // gelir: Para GİRDİ = mal SATILDI → Ürün ÇIKIŞI (satis ile tutarlı)
    if (txnType === 'gelir') return 'cikis';
    // gider: Para ÇIKTI = mal SATIN ALINDI → Ürün GİRİŞİ (alis ile tutarlı)
    if (txnType === 'gider') return 'giris';
    // kredi_karti_gider: Kart gideri = mal satın alındı → Ürün GİRİŞİ
    if (txnType === 'kredi_karti_gider') return 'giris';
    return null;
  }, []);

  // Build transaction data
  const buildTransactionData = useCallback(
    (parsedAmount: number, exchangeRateInfo?: { sourceCurrency: Currency; targetCurrency: Currency; exchangeRate: number }) => {
      const apiType = mapTypeToApiType(type, odemeHedefType);
      const needsHesap = needsHesapInData(type);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamically built per transaction type, consumed by typed mutateAsync calls
      const data: any = {
        type: apiType,
        amount: parsedAmount,
        description: description.trim() || null,
        hesap_id: needsHesap ? hesapId : null,
        // Ürün-taşıyan işlemlerde kategori ürünlerden türetilir ve UI'da devre dışıdır
        // (value={urunItemCount>0 ? null : kategoriId}). Ön-doldurulmuş/manuel kategorinin
        // ürün işlemine sızıp yanlış-etiketlemesini önlemek için CREATE'te null yaz.
        // EDIT'te DOKUNMA: eski sürümlerde kategori+ürün birlikte kaydedilmiş legacy işlemler
        // olabilir; salt tutar düzeltmesi bile kategoriyi sessizce null'larsa geçmiş dönem
        // kategori raporları bir düzenlemeyle değişir (create-only guard).
        kategori_id: !isEditMode && urunItems.length > 0 ? null : kategoriId,
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

      // Vade (ödeme tarihi) — YALNIZ borç-doğuran (alış/satış) tiplerde. HER ZAMAN AÇIK yazılır
      // (değer ya da null, ASLA undefined): update_islem_atomik'in anahtar-varlığı guard'ı böyle
      // çalışır ve düzenlemede vade'yi temizleme (açık null) sessizce kaybolmaz. Diğer tiplerde null.
      data.vade_tarihi = (vadeTarihi && (type === 'alis' || type === 'satis'))
        ? formatDateForDB(vadeTarihi)
        : null;

      // Faz 2 — fatura-hedefli ödeme/tahsilat pointer'ı. Kural (create-only + yalnız cari
      // tahsilat/tedarikçi ödemesi) lib/hedefTahsis.ts'te TEK KAYNAK ve jest'le kilitli:
      // sessiz bozulma sınıfı, çünkü edit'te yanlışlıkla yazılırsa hata çıkmaz, yalnız
      // eski hedefleme kaybolur. Sunucu ayrıca doğrular (aynı cari + alis/satis +
      // iki-yabancı değil); uyumsuz → NULL degrade.
      const hedefPointer = resolveHedefIslemId({ isEditMode, hedefIslemId, type, odemeHedefType });
      if (hedefPointer) {
        data.hedef_islem_id = hedefPointer;
      }

      return data;
    },
    [type, odemeHedefType, description, hesapId, kategoriId, hedefHesapId, cariId, personelId, safeDateEnd, vadeTarihi, urunItems.length, isEditMode, hedefIslemId]
  );

  // Check cross-currency
  const checkCrossCurrency = useCallback(
    (parsedAmount: number): boolean => {
      /**
       * İki bacağın para birimi farklıysa kur barını aç ve "kaydı durdur" (true) döndür.
       * Beş dalın hepsi bu kapıdan geçiyor — beş kopya yerine tek karar noktası, çünkü
       * A6 kuralı (düzenlemede tarihsel kuru koru) her dalda AYNI şekilde geçerli.
       */
      const openBarIfCross = (
        sourceCurr: string | undefined,
        targetCurr: string | undefined
      ): boolean => {
        const source = sourceCurr || 'TRY';
        const target = targetCurr || 'TRY';
        if (!isCrossCurrency(source, target)) return false;

        // A6 — DÜZENLEME: kayıtlı kur var ve para birimi çifti AYNI ise, yalnızca tutar
        // da değişmemişse kur barını hiç açma. Aksi halde 6 ay önceki bir EUR ödemesinin
        // sadece açıklamasını düzeltmek kur barını açıyor, bar BUGÜNÜN kuruyla doluyor ve
        // onay reverse(eski)+apply(yeni) ile bakiyeyi kur farkı kadar kaydırıyordu.
        // Bar açılmadığında kur alanları update patch'ine HİÇ girmiyor → RPC'ye giden
        // mergedRow eski kuru koruyor → net bakiye etkisi sıfır.
        const recorded = editOriginal?.exchange;
        const pairSame =
          !!recorded && recorded.sourceCurrency === source && recorded.targetCurrency === target;

        if (isEditMode && pairSame && roundCurrency(parsedAmount) === editOriginal!.baseline.amount) {
          return false;
        }

        const clientIslemId =
          regularMutationIdRef.current ?? Crypto.randomUUID();
        regularMutationIdRef.current = clientIslemId;
        setPendingExchangeData({
          sourceCurrency: source as Currency,
          targetCurrency: target as Currency,
          sourceAmount: parsedAmount,
          // Kur onayından SONRA değil, isteğin öncesinde üretilir. Böylece HTTP
          // cevabı kaybolsa bile aynı id ile existence probe yapılabilir.
          clientIslemId,
          // Çift aynıysa alan KAYITLI kurla dolar (bugünün kuru ipucu olarak gösterilir);
          // çift değiştiyse eski kur anlamsız → bugünün kuru.
          initialRate: pairSame ? recorded!.exchangeRate : null,
        });
        setShowExchangeRateBar(true);
        return true;
      };

      const accCurrency = (id: string | null | undefined) =>
        hesaplar?.find((h) => h.id === id)?.currency;

      // Transfer cross-currency check
      if (type === 'transfer' && hesapId && hedefHesapId) {
        if (openBarIfCross(accCurrency(hesapId), accCurrency(hedefHesapId))) return true;
      }

      // Kredi kartı ödemesi (API'de 'transfer' olarak saklanır): ödeyen hesap ile kart hesabı
      // farklı para birimindeyse cross-currency. Yukarıdaki 'transfer' dalı yalnız
      // type==='transfer' yakalar; kredi kartı ödemesi type==='odeme' olduğundan atlanıp
      // tutar kart bakiyesine 1:1 (çevrilmeden) uygulanıyordu (yanlış bakiye).
      if (type === 'odeme' && odemeHedefType === 'kredi_karti' && hesapId && hedefHesapId) {
        if (openBarIfCross(accCurrency(hesapId), accCurrency(hedefHesapId))) return true;
      }

      // Payment/collection cross-currency check - compare hesap currency with cari currency
      if (['odeme', 'tahsilat'].includes(type) && sourceHesapId && cariId) {
        const targetCari = cariler?.find((c) => c.id === cariId);
        if (openBarIfCross(accCurrency(sourceHesapId), targetCari?.currency)) return true;
      }

      // Normal mode personel payment cross-currency check - compare hesap currency with personel currency
      if (!isPersonelMode && type === 'odeme' && odemeHedefType === 'staff' && hesapId && personelId) {
        const targetPersonel = personelList?.find((p) => p.id === personelId);
        if (openBarIfCross(accCurrency(hesapId), targetPersonel?.currency)) return true;
      }

      // Personel mode cross-currency check - compare hesap currency with personel currency
      if (isPersonelMode && ['personel_odeme_tab', 'personel_tahsilat_tab'].includes(type) && sourceHesapId && personelId) {
        const targetPersonel = personelList?.find((p) => p.id === personelId);
        if (openBarIfCross(accCurrency(sourceHesapId), targetPersonel?.currency)) return true;
      }

      return false;
    },
    [type, hesapId, hedefHesapId, sourceHesapId, cariId, personelId, odemeHedefType, hesaplar, cariler, personelList, isPersonelMode, isEditMode, editOriginal, setPendingExchangeData, setShowExchangeRateBar]
  );

  const guardRegularProductEdit = useCallback((): boolean => {
    if (
      !isEditMode
      || !transactionId
      || isScheduledTransaction
    ) return true;

    const hasPersistedProductItems = persistedProductItemCount > 0;
    const hasAnyProductItems =
      hasPersistedProductItems || urunItems.length > 0;
    const finalType = mapTypeToApiType(type, odemeHedefType);
    const editablePayloadComplete = isEditableProductPayloadComplete({
      productItemsResolved,
      persistedProductItemCount,
      productEditDataResolved,
      editableProductItemCount,
    });
    const creatorResolved = editTransactionCreatedBy !== undefined;
    const mutationDecision = getTransactionProductMutationDecision({
      type: finalType,
      productItemsResolved,
      productItemCount: hasAnyProductItems ? 1 : 0,
      isOwner,
      canAccessModule,
      canMutateTransaction:
        creatorResolved
        && canUpdate('islemler', editTransactionCreatedBy ?? null),
      canMutateProduct:
        creatorResolved
        && canUpdate('urunler', editTransactionCreatedBy ?? null),
    });
    const blocked =
      !editablePayloadComplete
      || !mutationDecision.allowed;

    if (!blocked) return true;

    Alert.alert(
      t('common:status.error'),
      t('common:errors.permissionDenied'),
    );
    return false;
  }, [
    canAccessModule,
    canUpdate,
    editableProductItemCount,
    editTransactionCreatedBy,
    isEditMode,
    isOwner,
    isScheduledTransaction,
    odemeHedefType,
    productEditDataResolved,
    productItemsResolved,
    persistedProductItemCount,
    t,
    transactionId,
    type,
    urunItems.length,
  ]);

  // Handle save
  const handleSave = useCallback(async () => {
    // Senkron kilit gerçek kayıttan önce kurulur; doğrulama/kur/ürün gibi async
    // boşluklarda hızlı 2-3 dokunuşun ayrı ayrı yazma başlatmasını engeller.
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    // [GEÇİCİ TEŞHİS — 14 Tem] Submit-zinciri TOPLAM süresi (kullanıcının gördüğü spinner'ın
    // proxy'si). mutationFn fazları hızlıyken kullanıcı asılma yaşıyorsa fark buradadır
    // (cross-currency/personel-RPC/ürün/foto + auth-kilit beklemeleri dahil).
    const __submitT0 = Date.now();
    // P1b: fonksiyon kapsamında — catch/finally erişebilsin.
    let __slowTimer: ReturnType<typeof setTimeout> | null = null; // yavaş-kayıt bilgi zamanlayıcısı
    let createdClientIslemId: string | null = null; // create yolunda üretilen id (existence-check için)
    let createdClientScheduledId: string | null = null;
    let attemptedRegularUpdate: Partial<Omit<IslemInsert, 'isletme_id'>> | null = null;
    let attemptedConversion:
      | 'regular_to_scheduled'
      | 'scheduled_to_regular'
      | null = null;
    let hasCompletedWriteStep = false;
    // Başarı UI'ı: normal başarı VE "hata verdi ama aslında düşmüştü" kurtarma yolunda ortak kullanılır.
    const completeSuccess = () => {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      showToast(
        isEditMode
          ? t('transactions:messages.updateSuccess')
          : t('transactions:messages.saveSuccess'),
        'success'
      );
      if (!isEditMode) {
        persistLastUsed(); // A1: son-kullanılan hesap/kategoriyi hatırla (create-only)
        triggerReviewIfEligible().catch((err) => {
          console.log('[Review] Error triggering review:', err);
        });
      }
      // Create yolunda client-üretimli id (idempotency id'siyle aynı) geçilir;
      // edit'te mevcut transactionId. Çağıran bağlam-hedefli tahsis için kullanabilir.
      onSuccess?.(isEditMode ? (transactionId ?? undefined) : (createdClientIslemId ?? undefined));
      resetMutationIds();
      isSavingRef.current = false;
      handleDismiss();
    };
    try {
    if (!guardRegularProductEdit()) return;

    if (!isValidAmount(amount)) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    // Ayrı auth-health preflight'i burada BİLEREK yok: prod ölçümünde yavaş örnekler 3–5 sn
    // ekliyordu, fakat REST/RPC yazılabilirliğini garanti etmiyordu. QTB açılışında fire-and-forget
    // soket ısıtma zaten var; kaydın kendisi gerçek bağlantı kontrolüdür ve 15 sn fetch timeout +
    // formu koruyan hata akışıyla sınırlıdır.

    // GUARD: İleri tarihli işleme ürün/stok EKLENEMEZ. Scheduled dalı urun_hareketler
    // oluşturmaz ve edge function tetiklendiğinde de ürün/stok işlenmez → ürünler
    // SESSİZCE kaybolurdu. Sessiz veri kaybı yerine kullanıcıyı açıkça uyar.
    if (isScheduled && urunItems.length > 0) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(
        t('transactions:validation.scheduledNoProductsTitle'),
        t('transactions:validation.scheduledNoProductsMessage')
      );
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

    // İzin kullanımı: bitiş tarihi başlangıçtan önce olamaz (ters aralık) — sessiz 1-güne
    // kelepçelenme yerine kullanıcıya açık uyarı ver ve kaydı engelle.
    if (type === 'personel_izin_kullanimi_tab' && safeDateEnd) {
      const startDay = new Date(safeDate.getFullYear(), safeDate.getMonth(), safeDate.getDate()).getTime();
      const endDay = new Date(safeDateEnd.getFullYear(), safeDateEnd.getMonth(), safeDateEnd.getDate()).getTime();
      if (endDay < startDay) {
        Alert.alert(t('staff:leave.invalidRangeTitle'), t('staff:leave.invalidRangeMessage'));
        return;
      }
    }

    // İzin hak edişi: aynı GÜNE zaten hak ediş girilmişse onay iste (mükerrer kaydı engelleme,
    // sadece "emin misiniz?"). Yalnız yeni kayıt için (edit'te atla).
    if (type === 'personel_izin_hakki_tab' && !isEditMode && personelId && isletme) {
      try {
        const { data: existing } = await supabase
          .from('islemler')
          .select('date')
          .eq('isletme_id', isletme.id)
          .eq('personel_id', personelId)
          .eq('type', 'personel_izin_hakki');
        const targetDay = formatDateForDB(safeDate);
        const dup = (existing ?? []).some((r) => r.date && formatDateForDB(new Date(r.date)) === targetDay);
        if (dup) {
          const proceed = await new Promise<boolean>((resolve) => {
            Alert.alert(
              t('staff:leave.duplicateTitle'),
              t('staff:leave.duplicateMessage'),
              [
                { text: t('common:buttons.cancel'), style: 'cancel', onPress: () => resolve(false) },
                { text: t('common:buttons.continue'), onPress: () => resolve(true) },
              ],
              { cancelable: true, onDismiss: () => resolve(false) }
            );
          });
          if (!proceed) return;
        }
      } catch {
        // Mükerrer kontrolü başarısız olursa kaydı engelleme (sadece uyarı atlanır)
      }
    }

    // Parse amount
    const parsedAmount = parseCurrency(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    // S-07 — Önizleme tek gerçek kaynaktır. Plan varken normal işlem yoluna sessizce
    // düşmek veya tutarı burada yeniden bölmek, kullanıcının onayladığı kuruş satırlarını
    // değiştirebilir. Bu nedenle eligibility + stale toplam + satır invariantları yazma
    // başlamadan doğrulanır; başarıdaki AYNI dizi fingerprint ve RPC'ye aktarılır.
    let installmentRowsForSubmit: InstallmentRpcRow[] | null = null;
    if (taksitPlan) {
      const installmentEligible =
        !isEditMode &&
        !isScheduled &&
        urunItems.length === 0 &&
        (type === 'satis' || type === 'alis');
      const currentTotalCents = amountToCents(roundCurrency(parsedAmount));
      const validation =
        installmentEligible && currentTotalCents !== null
          ? validateInstallmentPlan(taksitPlan, currentTotalCents, safeDate)
          : null;

      if (!validation?.ok) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        const installmentErrorMessage =
          validation?.error.code === 'STALE_TOTAL_CENTS'
            ? t('transactions:taksit.tutarDegistiAciklama')
            : validation?.error.code === 'FIRST_DUE_BEFORE_TRANSACTION_DATE'
              ? t('transactions:taksit.islemTarihiDegistiAciklama')
              : t('transactions:taksit.dagitimGecersiz');
        Alert.alert(
          t('transactions:taksit.configTitle'),
          installmentErrorMessage
        );
        return;
      }

      installmentRowsForSubmit = validation.rows;
    }

    // Check cross-currency
    if (checkCrossCurrency(parsedAmount)) {
      return;
    }

    // Submit transaction
    isSavingRef.current = true;
    setIsSaving(true);
    // P1b: kayıt 3 sn'yi aşarsa "kaydediliyor…" bilgisi ver (donmadı hissi; bayat-soket turu
    // sürebilir). Eşik 8sn→3sn indirildi: yavaş kayıtlar ort ~9sn (app_events) → 8sn'de kullanıcı
    // çoktan donmuş sanıyordu. Sıcak sokette normal kayıt <1sn olduğundan 3sn yanlış-pozitif üretmez.
    __slowTimer = setTimeout(() => {
      showToast(t('transactions:messages.savingSlow'), 'info');
    }, 3000);

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
          const regularUpdates: Partial<Omit<IslemInsert, 'isletme_id'>> = {
            ...transactionData,
            date: formatDateTimeForDB(safeDate),
          };
          const hasAnyProductItems =
            persistedProductItemCount > 0 || urunItems.length > 0;
          const shouldUseSharedProductV3 =
            !isOwner
            && supportsSharedProductMutationV3(transactionData.type)
            && hasAnyProductItems;
          const hareketTipi = getUrunHareketTipi(type);
          const sharedProductItems = shouldUseSharedProductV3
            ? hareketTipi
              ? urunItems.map((item) => ({
                  urun_id: item.urunId,
                  hareket_tipi: hareketTipi,
                  miktar: item.miktar,
                  birim_fiyat: item.birimFiyat,
                  kdv_orani: item.kdvOrani,
                  aciklama: description.trim() || null,
                }))
              : []
            : undefined;
          attemptedRegularUpdate = regularUpdates;
          await updateIslem.mutateAsync({
            id: transactionId,
            updates: regularUpdates,
            productItems: sharedProductItems,
          });

          // Fotoğraf finansal kayıttan sonra copy-on-write güncellenir. Pointer sonucu
          // belirsizse yeni obje korunur; eski obje yalnız pointer kesin başarıdan sonra silinir.
          await syncTransactionPhotoBestEffort(transactionId);
          // #6: Yalnız ürün-bağlı işlemde stoğu da yeniden uygula. updateIslem yalnızca
          // bakiyeyi düzeltir; ürün hareketleri eski hâli geri alınıp güncel urunItems'tan
          // yeniden oluşturulmalı, yoksa stok ve ürün raporu islem.amount ile tutarsız
          // kalır. Aynı islem id korunur. ATOMİK: tek RPC içinde geri-al+sil+yeniden-oluştur;
          // hata olursa tümü geri sarılır -> stok asla yarım kalmaz. items boşsa (ürünler
          // kaldırılmışsa) yalnızca geri alma yapılır. Eski ve yeni ürün yoksa RPC'yi hiç
          // çağırma: no-op olsa da mobil ağda ayrı 15 sn timeout turu yaratıyordu.
          if (
            !shouldUseSharedProductV3
            && hasAnyProductItems
          ) {
            // Ürün geçmişi olan editlerde yeniden uygula. Yeni tip ürün üretmiyorsa
            // (ör. tahsilat/transfer'e çevrildi) items BOŞ gider → reapply RPC eski
            // hareketleri geri alıp siler; böylece orphan stok/hayalet hareket kalmaz.
            // Ürünsüz işlemlerde (hiç hareketi yok) bu çağrı zararsız no-op'tur.
            try {
              await reapplyUrunHareketler.mutateAsync({
                islemId: transactionId,
                items: hareketTipi
                  ? urunItems.map((item) => ({
                      urun_id: item.urunId,
                      hareket_tipi: hareketTipi,
                      miktar: item.miktar,
                      birim_fiyat: item.birimFiyat,
                      kdv_orani: item.kdvOrani,
                      aciklama: description.trim() || null,
                    }))
                  : [],
              });
            } catch (urunError) {
              console.error('[UrunHareket] Edit reapply error:', urunError);
              Alert.alert(t('common:status.warning'), t('transactions:messages.urunMovementFailed'));
            }
          }
        } else if (!isScheduledTransaction && isScheduled) {
          // Was regular, now scheduled → create scheduled first, then delete regular
          createdClientScheduledId =
            scheduledMutationIdRef.current ?? Crypto.randomUUID();
          scheduledMutationIdRef.current = createdClientScheduledId;
          attemptedConversion = 'regular_to_scheduled';
          const scheduledCreateInput = {
            ...stripScheduledUnsupportedFields(transactionData),
            id: createdClientScheduledId,
            scheduled_date: formatDateForDB(safeDate),
          };
          rememberScheduledMutationPayload({
            kind: 'regular_to_scheduled',
            input: scheduledCreateInput,
          });
          await createIleriTarihliIslem.mutateAsync(scheduledCreateInput);
          hasCompletedWriteStep = true;
          await deleteIslem.mutateAsync(transactionId);
          await cleanupOriginalPhotoAfterDelete(transactionId);
        } else {
          // Was scheduled, now regular → create regular first, then delete scheduled
          createdClientIslemId =
            regularMutationIdRef.current ?? Crypto.randomUUID();
          regularMutationIdRef.current = createdClientIslemId;
          attemptedConversion = 'scheduled_to_regular';
          const regularCreateInput = {
            ...transactionData,
            id: createdClientIslemId,
            date: formatDateTimeForDB(safeDate),
          };
          rememberRegularMutationPayload({
            kind: 'scheduled_to_regular',
            input: regularCreateInput,
          });
          await createIslem.mutateAsync(regularCreateInput);
          hasCompletedWriteStep = true;
          await deleteIleriTarihliIslem.mutateAsync(transactionId);
        }
      }
      // Create mode - create new transaction
      else {
        if (isScheduled) {
          // Scheduled transactions don't support photos/exchange rate
          createdClientScheduledId =
            scheduledMutationIdRef.current ?? Crypto.randomUUID();
          scheduledMutationIdRef.current = createdClientScheduledId;
          const scheduledCreateInput = {
            ...stripScheduledUnsupportedFields(transactionData),
            id: createdClientScheduledId,
            scheduled_date: formatDateForDB(safeDate),
          };
          rememberScheduledMutationPayload({
            kind: 'scheduled_create',
            input: scheduledCreateInput,
          });
          await createIleriTarihliIslem.mutateAsync(scheduledCreateInput);
        } else {
          // P1a: idempotent-retry anahtarı — client-üretimi id. Zayıf ağda RQ retry veya
          // "sunucuda başarılı ama yanıt timeout" durumunda aynı id ikinci kez gidince RPC
          // ON CONFLICT ile atlar → MÜKERRER kayıt + çift bakiye/stok YAZILMAZ. id, mutation
          // değişkeninde SABİT tutulur ki RQ retry'ı aynısını göndersin (mutationFn içinde
          // üretilseydi her denemede yeni id olur, idempotency bozulurdu).
          createdClientIslemId =
            regularMutationIdRef.current ?? Crypto.randomUUID();
          regularMutationIdRef.current = createdClientIslemId;
          const baseRow = {
            ...transactionData,
            id: createdClientIslemId,
            date: formatDateTimeForDB(safeDate),
          };
          const hareketTipi = urunItems.length > 0 ? getUrunHareketTipi(type) : null;

          // P0: ürünlü kayıt TEK atomik RPC'de (islem + bakiye + N ürün stok/hareket) →
          // 2+3N round-trip'ten ~1'e iner (asıl "kaydet asılması" fix'i). Atomik olduğundan
          // istemci tarafı manuel rollback GEREKMEZ (RPC patlarsa hiçbir bacak commit olmaz).
          let newIslem: { id?: string } | null = null;
          if (urunItems.length > 0 && hareketTipi) {
            const items = urunItems.map((item) => ({
              urun_id: item.urunId,
              hareket_tipi: hareketTipi,
              miktar: item.miktar,
              birim_fiyat: item.birimFiyat,
              kdv_orani: item.kdvOrani,
              aciklama: description.trim() || null,
            }));
            rememberRegularMutationPayload({
              kind: 'product_create',
              input: baseRow,
              items,
            });
            try {
              newIslem = await createIslemWithUrun.mutateAsync({ input: baseRow, items });
            } catch (rpcError) {
              const code = (rpcError as { code?: string })?.code;
              const msg = (rpcError as { message?: string })?.message ?? '';
              if (
                code === '42883'
                || /create_islem_with_urun_atomik/.test(msg)
              ) {
                // Ürün + stok yazısını ayrı çağrılarla taklit etmek cevap kaybında stok
                // etkisini iki kez uygulayabilir. Atomik endpoint yoksa hiçbir yazı yapma.
                throw new ProductAtomicWriteUnavailableError(rpcError);
              }
              throw rpcError;
            }
          } else if (
            installmentRowsForSubmit &&
            (type === 'satis' || type === 'alis') &&
            transactionData.cari_id
          ) {
            // FAZ 3 — taksitli satış/alış: 1 işlem + N taksit TEK atomik RPC.
            // Kullanıcının onayladığı önizleme dizisi yeniden hesaplanmadan hem mutation
            // fingerprint'ine hem RPC payload'ına AYNI referansla aktarılır.
            const taksitler = installmentRowsForSubmit;
            // Taksitli işlemde ayrıca vade gönderilmez (sunucu ilk taksit vadesini yazar).
            const { vade_tarihi: _stripVade, ...taksitRow } = baseRow as Record<string, unknown>;
            rememberRegularMutationPayload({
              kind: 'installment_create',
              input: taksitRow,
              installments: taksitler,
            });
            newIslem = await createIslemTaksitli.mutateAsync({
              input: taksitRow as typeof baseRow,
              taksitler,
            });
          } else {
            // Base gelir/gider/transfer plus known same-tenant scoped Cari/Personel
            // creates opt into V2. Linked-cari, product, installment, scheduled
            // and conversion flows keep their dedicated endpoints. A V2 error is
            // never retried through V1.
            rememberRegularMutationPayload({
              kind: 'regular_create',
              input: baseRow,
            });
            const useV2Create = shouldUseCreateIslemV2({
              type: transactionData.type,
              isViewer: !!isViewer,
              scopedSameTenant: enableScopedV2Create,
            });
            newIslem = useV2Create
              ? await createIslemV2.mutateAsync(baseRow)
              : await createIslem.mutateAsync(baseRow);
          }

          // İşlem kaydı kalıcıdır; foto ekleme hatası yalnız fotoğrafı etkiler.
          if (newIslem?.id) {
            await syncTransactionPhotoBestEffort(newIslem.id);
          }
        }
      }

      completeSuccess();
    } catch (error) {
      if (__DEV__) {
        console.error('Transaction error:', error);
      }
      if (__slowTimer) {
        clearTimeout(__slowTimer);
        __slowTimer = null;
      }
      const classifiedKind = classifyMutationError(error);
      // Dönüştürmenin ilk yazımı tamamlandıktan sonra ikinci çağrı daha sunucuya
      // gönderilmeden kesilse bile işlem seviyesinde sonuç artık "gönderilmedi"
      // değildir: yeni ve eski satır birlikte kalmış olabilir.
      const errorKind =
        classifiedKind === 'network_not_sent' && hasCompletedWriteStep
          ? 'network_unknown'
          : classifiedKind;
      // P1b: Kayıt hata verdi ama istek sunucuda BAŞARILI olup yanıtı timeout'a düşmüş olabilir
      // ("sessiz başarı"). Client id ile gerçekten düşüp düşmediğini doğrula (ölü ağda kontrolün
      // kendisi asmasın diye kısa süre sınırı). Düştüyse → başarı akışı (kullanıcı elle tekrar
      // denemesin → MÜKERRER önlenir) + manuel invalidation (mutation onSuccess'i çalışmadı).
      //
      // Yetki/validation/conflict hataları kesin sonuçtur; bunlarda 5 saniyelik probe
      // çalıştırmak hem yanlış mesajı geciktiriyor hem de ağ hatası izlenimi veriyordu.
      let outcome: MutationOutcomeProbe = 'unknown';
      const shouldProbe =
        !!isletme?.id
        && (
          errorKind === 'network_unknown'
          || (hasCompletedWriteStep && attemptedConversion !== null)
        );
      if (shouldProbe && isletme?.id) {
        if (errorKind === 'network_unknown') {
          showToast(t('transactions:messages.checkingSaveOutcome'), 'info');
        }
        if (
          attemptedConversion === 'regular_to_scheduled'
          && createdClientScheduledId
          && transactionId
        ) {
          outcome = await probeRegularToScheduledConversion(
            createdClientScheduledId,
            transactionId,
            isletme.id,
          );
        } else if (
          attemptedConversion === 'scheduled_to_regular'
          && createdClientIslemId
          && transactionId
        ) {
          outcome = await probeScheduledToRegularConversion(
            createdClientIslemId,
            transactionId,
            isletme.id,
          );
        } else if (isEditMode && transactionId && attemptedRegularUpdate) {
          outcome = await didRegularUpdateLand(
            transactionId,
            isletme.id,
            attemptedRegularUpdate,
          );
        } else if (
          !isEditMode
          && createdClientIslemId
        ) {
          outcome = await probeCreatedTransaction(
            createdClientIslemId,
            isletme.id,
          );
        } else if (!isEditMode && createdClientScheduledId) {
          outcome = await probeCreatedScheduledTransaction(
            createdClientScheduledId,
            isletme.id,
          );
        }
      }
      if (outcome === 'landed') {
        // Kayıt gerçekte düşmüş → başarı akışını çalıştır. Mutation onSuccess tetiklenmediği
        // için invalidation'ı elle yap (yeni kayıt + stok listelerde görünsün).
        // Yeni create RPC'sinin cevabı kaybolduysa finansal kaydı tekrar göndermeden,
        // bilinen client UUID üzerinden seçili fotoğrafı best-effort tamamla.
        if (!isEditMode && createdClientIslemId) {
          await syncTransactionPhotoBestEffort(createdClientIslemId);
        }
        invalidateRelatedQueries(queryClient, 'islem');
        invalidateRelatedQueries(queryClient, 'ileriTarihliIslem');
        invalidateRelatedQueries(queryClient, 'urunHareket');
        completeSuccess();
      } else if (outcome === 'partial') {
        // Yeni satır oluşmuş, eski satır ise kalmış. Formu açık bırakıp yeniden
        // kaydettirmek üçüncü bir kayıt riski doğurur; listeyi tazeleyip kullanıcıya
        // iki kaydı açıkça kontrol ettir.
        invalidateRelatedQueries(queryClient, 'islem');
        invalidateRelatedQueries(queryClient, 'ileriTarihliIslem');
        isSavingRef.current = false;
        setIsSaving(false);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        Alert.alert(
          t('common:status.warning'),
          t('transactions:messages.conversionIncomplete'),
        );
        resetMutationIds();
        handleDismiss();
      } else {
        isSavingRef.current = false;
        setIsSaving(false);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        if (
          outcome === 'not_landed'
          || errorKind === 'network_not_sent'
          || errorKind === 'permission'
          || errorKind === 'ownership'
          || errorKind === 'validation'
          || error instanceof ProductAtomicWriteUnavailableError
        ) {
          resetMutationIds();
        } else if (shouldProbe && outcome === 'unknown') {
          // Kullanıcıdan listeyi kontrol etmesini istiyorsak cache'i de gerçekten
          // tazele; aynı form açık kaldığı sürece UUID korunur.
          invalidateRelatedQueries(queryClient, 'islem');
          invalidateRelatedQueries(queryClient, 'ileriTarihliIslem');
          invalidateRelatedQueries(queryClient, 'urunHareket');
        }
        // Form KORUNUR (handleDismiss çağrılmaz) → kullanıcı verisini kaybetmeden tekrar dener.
        const messageKey = getTransactionMutationMessageKey(
          error,
          isEditMode ? 'update' : 'create',
        );
        const message =
          errorKind === 'network_unknown' && outcome === 'not_landed'
            ? t('transactions:messages.saveNotLanded')
            : errorKind === 'network_unknown' && classifiedKind === 'network_not_sent'
              ? t('transactions:messages.saveOutcomeUnknown')
              : hasCompletedWriteStep && attemptedConversion && outcome === 'unknown'
                ? t('transactions:messages.saveOutcomeUnknown')
            : messageKey
              ? t(messageKey)
              : t('transactions:messages.saveFailedRetry');
        Alert.alert(t('common:status.error'), message);
      }
    }
    } finally {
      if (__slowTimer) clearTimeout(__slowTimer); // P1b: yavaş-kayıt bilgisini iptal et
      // Erken dönüşlerde (validation/picker/cross-currency) ve kayıt bitince kilidi bırak.
      submitInFlightRef.current = false;
      // Prod-safe performans ölçümü: tutar/açıklama/id yok; yalnız süre ve işlem sınıfı.
      // Yeni zincirin sahada gerçekten hızlandığını build bazında doğrulamak için yavaş
      // submit'lerde ateşle-unut kaydı bırak.
      const __submitMs = Date.now() - __submitT0;
      if (__submitMs > 2000) {
        logEvent('save_submit_perf', {
          submit_ms: __submitMs,
          type,
          mode: isEditMode ? 'edit' : 'create',
          has_products: urunItems.length > 0,
          ms_since_fg: msSinceForeground(),
        });
      }
    }
  }, [
    amount,
    mode,
    enableScopedV2Create,
    isViewer,
    isOwner,
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
    safeDateEnd,
    photoUri,
    isletme,
    hesaplar,
    cariler,
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
    createIslemV2,
    createIslemWithUrun,
    createIslemTaksitli,
    queryClient,
    updateIslem,
    updateIleriTarihliIslem,
    deleteIslem,
    deleteIleriTarihliIslem,
    syncTransactionPhotoBestEffort,
    cleanupOriginalPhotoAfterDelete,
    triggerReviewIfEligible,
    persistLastUsed,
    showToast,
    onSuccess,
    handleDismiss,
    urunItems,
    persistedProductItemCount,
    guardRegularProductEdit,
    reapplyUrunHareketler,
    getUrunHareketTipi,
    description,
    taksitPlan,
    rememberRegularMutationPayload,
    rememberScheduledMutationPayload,
    resetMutationIds,
  ]);

  // Handle exchange rate confirmation
  const handleExchangeRateConfirm = useCallback(
    async (exchangeRate: number, _targetAmount: number) => {
      if (!pendingExchangeData || isSavingRef.current) return;
      if (!guardRegularProductEdit()) return;

      // İLERİ TARİHLİ + CROSS-CURRENCY ENGELİ: bu handler'a YALNIZ cross-currency ile
      // ulaşılır. ileri_tarihli_islemler tablosu kur/para birimi saklamaz (create'te
      // strip'lenir) → farklı para birimleri arasında bir ileri tarihli işlem TAMAMLANAMAZ
      // (tamamlama anında kur null olur, calculateTargetAmount "geçersiz kur" fırlatır ve
      // her deneme geri sarılır). Sessizce-tamamlanamaz durum yaratmak yerine baştan net
      // mesajla engelle. (Kalıcı çözüm: ileri_tarihli'ye kur kolonları eklemek — ayrı iş.)
      if (isScheduled) {
        setShowExchangeRateBar(false);
        showToast(t('transactions:exchangeRate.scheduledCrossCurrencyBlocked'), 'error');
        return;
      }

      setShowExchangeRateBar(false);
      isSavingRef.current = true;
      setIsSaving(true);

      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      let exchangeCreatedIslemId: string | undefined;
      let attemptedExchangeRegularUpdate:
        | Partial<Omit<IslemInsert, 'isletme_id'>>
        | null = null;
      let attemptedScheduledToRegular = false;
      let hasCompletedWriteStep = false;
      const completeExchangeSuccess = () => {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        showToast(
          isEditMode
            ? t('transactions:messages.updateSuccess')
            : t('transactions:messages.saveSuccess'),
          'success',
        );

        if (!isEditMode) {
          persistLastUsed();
          triggerReviewIfEligible().catch((err) => {
            console.log('[Review] Error triggering review:', err);
          });
        }

        setPendingExchangeData(null);
        onSuccess?.(
          isEditMode
            ? (exchangeCreatedIslemId ?? transactionId ?? undefined)
            : exchangeCreatedIslemId,
        );
        resetMutationIds();
        isSavingRef.current = false;
        handleDismiss();
      };

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
            const regularUpdates: Partial<Omit<IslemInsert, 'isletme_id'>> = {
              ...transactionData,
              date: formatDateTimeForDB(safeDate),
            };
            const hasAnyProductItems =
              persistedProductItemCount > 0 || urunItems.length > 0;
            const shouldUseSharedProductV3 =
              !isOwner
              && supportsSharedProductMutationV3(transactionData.type)
              && hasAnyProductItems;
            const hareketTipi = getUrunHareketTipi(type);
            const sharedProductItems = shouldUseSharedProductV3
              ? hareketTipi
                ? urunItems.map((item) => ({
                    urun_id: item.urunId,
                    hareket_tipi: hareketTipi,
                    miktar: item.miktar,
                    birim_fiyat: item.birimFiyat,
                    kdv_orani: item.kdvOrani,
                    aciklama: description.trim() || null,
                  }))
                : []
              : undefined;
            attemptedExchangeRegularUpdate = regularUpdates;
            await updateIslem.mutateAsync({
              id: transactionId,
              updates: regularUpdates,
              productItems: sharedProductItems,
            });
            await syncTransactionPhotoBestEffort(transactionId);
            if (
              !shouldUseSharedProductV3
              && hasAnyProductItems
            ) {
              await reapplyUrunHareketler.mutateAsync({
                islemId: transactionId,
                items: hareketTipi
                  ? urunItems.map((item) => ({
                      urun_id: item.urunId,
                      hareket_tipi: hareketTipi,
                      miktar: item.miktar,
                      birim_fiyat: item.birimFiyat,
                      kdv_orani: item.kdvOrani,
                      aciklama: description.trim() || null,
                    }))
                  : [],
              });
            }
          } else if (!isScheduledTransaction && isScheduled) {
            // Was regular, now scheduled → create scheduled FIRST, then delete regular.
            // (handleSave yolu ile aynı sıra.) Create patlarsa eski kayıt DURUR; delete-first
            // olsaydı create patladığında işlem tamamen kaybolurdu (sessiz veri kaybı).
            await createIleriTarihliIslem.mutateAsync({
              ...stripScheduledUnsupportedFields(transactionData),
              scheduled_date: formatDateForDB(safeDate),
            });
            await deleteIslem.mutateAsync(transactionId);
            await cleanupOriginalPhotoAfterDelete(transactionId);
          } else {
            // Was scheduled, now regular → create regular FIRST, then delete scheduled
            const clientIslemId =
              pendingExchangeData.clientIslemId
              ?? regularMutationIdRef.current
              ?? Crypto.randomUUID();
            regularMutationIdRef.current = clientIslemId;
            exchangeCreatedIslemId = clientIslemId;
            attemptedScheduledToRegular = true;
            const regularCreateInput = {
              ...transactionData,
              id: clientIslemId,
              date: formatDateTimeForDB(safeDate),
            };
            rememberRegularMutationPayload({
              kind: 'exchange_scheduled_to_regular',
              input: regularCreateInput,
            });
            const created = await createIslem.mutateAsync(regularCreateInput);
            exchangeCreatedIslemId = created?.id ?? clientIslemId;
            hasCompletedWriteStep = true;
            await deleteIleriTarihliIslem.mutateAsync(transactionId);
            await syncTransactionPhotoBestEffort(exchangeCreatedIslemId);
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
            const clientIslemId =
              pendingExchangeData.clientIslemId
              ?? regularMutationIdRef.current
              ?? Crypto.randomUUID();
            regularMutationIdRef.current = clientIslemId;
            exchangeCreatedIslemId = clientIslemId;
            const regularCreateInput = {
              ...transactionData,
              id: clientIslemId,
              date: formatDateTimeForDB(safeDate),
            };
            rememberRegularMutationPayload({
              kind: 'exchange_regular_create',
              input: regularCreateInput,
            });
            const useV2Create = shouldUseCreateIslemV2({
              type: transactionData.type,
              isViewer: !!isViewer,
              scopedSameTenant: enableScopedV2Create,
            });
            const created = useV2Create
              ? await createIslemV2.mutateAsync(regularCreateInput)
              : await createIslem.mutateAsync(regularCreateInput);
            exchangeCreatedIslemId = created?.id ?? clientIslemId;
            await syncTransactionPhotoBestEffort(exchangeCreatedIslemId);
          }
        }

        completeExchangeSuccess();
      } catch (error) {
        if (__DEV__) {
          console.error('Transaction error:', error);
        }
        const classifiedKind = classifyMutationError(error);
        const errorKind =
          classifiedKind === 'network_not_sent' && hasCompletedWriteStep
            ? 'network_unknown'
            : classifiedKind;
        let outcome: MutationOutcomeProbe = 'unknown';
        const shouldProbe =
          !!isletme?.id
          && (
            errorKind === 'network_unknown'
            || (hasCompletedWriteStep && attemptedScheduledToRegular)
          );
        if (shouldProbe && isletme?.id) {
          if (errorKind === 'network_unknown') {
            showToast(t('transactions:messages.checkingSaveOutcome'), 'info');
          }
          if (
            attemptedExchangeRegularUpdate
            && transactionId
            && !attemptedScheduledToRegular
          ) {
            outcome = await didRegularUpdateLand(
              transactionId,
              isletme.id,
              attemptedExchangeRegularUpdate,
            );
          } else if (
            attemptedScheduledToRegular
            && exchangeCreatedIslemId
            && transactionId
          ) {
            outcome = await probeScheduledToRegularConversion(
              exchangeCreatedIslemId,
              transactionId,
              isletme.id,
            );
          } else if (exchangeCreatedIslemId) {
            outcome = await probeCreatedTransaction(
              exchangeCreatedIslemId,
              isletme.id,
            );
          }
        }

        if (outcome === 'landed') {
          // Kur onaylı yeni create cevabı kaybolduysa aynı client UUID'ye yalnız
          // fotoğrafı bağla; finansal mutation V1/V2 üzerinden tekrar çağrılmaz.
          if (!isEditMode && exchangeCreatedIslemId) {
            await syncTransactionPhotoBestEffort(exchangeCreatedIslemId);
          }
          invalidateRelatedQueries(queryClient, 'islem');
          invalidateRelatedQueries(queryClient, 'ileriTarihliIslem');
          completeExchangeSuccess();
          return;
        }

        isSavingRef.current = false;
        setIsSaving(false);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        if (outcome === 'partial') {
          invalidateRelatedQueries(queryClient, 'islem');
          invalidateRelatedQueries(queryClient, 'ileriTarihliIslem');
          setPendingExchangeData(null);
          resetMutationIds();
          Alert.alert(
            t('common:status.warning'),
            t('transactions:messages.conversionIncomplete'),
          );
          handleDismiss();
          return;
        }
        if (
          outcome === 'not_landed'
          || errorKind === 'network_not_sent'
          || errorKind === 'permission'
          || errorKind === 'ownership'
          || errorKind === 'validation'
        ) {
          resetMutationIds();
        } else if (shouldProbe && outcome === 'unknown') {
          invalidateRelatedQueries(queryClient, 'islem');
          invalidateRelatedQueries(queryClient, 'ileriTarihliIslem');
        }
        const messageKey = getTransactionMutationMessageKey(
          error,
          isEditMode ? 'update' : 'create',
        );
        const message =
          errorKind === 'network_unknown' && outcome === 'not_landed'
            ? t('transactions:messages.saveNotLanded')
            : errorKind === 'network_unknown' && classifiedKind === 'network_not_sent'
              ? t('transactions:messages.saveOutcomeUnknown')
              : hasCompletedWriteStep
                  && attemptedScheduledToRegular
                  && outcome === 'unknown'
                ? t('transactions:messages.saveOutcomeUnknown')
            : messageKey
              ? t(messageKey)
              : t('transactions:messages.saveFailed');
        Alert.alert(
          t('common:status.error'),
          message,
        );
      }
    },
    [
      pendingExchangeData,
      enableScopedV2Create,
      isViewer,
      isOwner,
      isletme?.id,
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
      createIslemV2,
      updateIslem,
      reapplyUrunHareketler,
      updateIleriTarihliIslem,
      deleteIslem,
      deleteIleriTarihliIslem,
      syncTransactionPhotoBestEffort,
      cleanupOriginalPhotoAfterDelete,
      triggerReviewIfEligible,
      persistLastUsed,
      showToast,
      queryClient,
      setPendingExchangeData,
      onSuccess,
      handleDismiss,
      rememberRegularMutationPayload,
      resetMutationIds,
      persistedProductItemCount,
      guardRegularProductEdit,
      urunItems,
      getUrunHareketTipi,
      description,
      type,
    ]
  );

  return {
    handleSave,
    handleExchangeRateConfirm,
  };
}
