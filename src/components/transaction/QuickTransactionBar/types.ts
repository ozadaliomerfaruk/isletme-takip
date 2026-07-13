import { CariType, Currency, BirimType } from '@/types/database';
import { TransactionType, TransactionTabMode } from '../TransactionTypeTabs';

// Re-export for convenience
export type { TransactionType, TransactionTabMode };

// Urun item (işlem ile birlikte kaydedilecek urun hareketleri)
export interface UrunItem {
  urunId: string;
  urunAd: string;
  miktar: number;
  birimFiyat: number;
  kdvOrani: number; // 0, 1, 10, 20 vb.
  birim: BirimType;
}

// KDV oranları
export const KDV_ORANLARI = [0, 1, 10, 20] as const;
export type KdvOrani = typeof KDV_ORANLARI[number];

// Urun hesaplama yardımcıları
export function calculateUrunLineTotal(item: UrunItem): {
  subtotal: number;
  kdvAmount: number;
  total: number;
} {
  const subtotal = item.miktar * item.birimFiyat;
  const kdvAmount = subtotal * (item.kdvOrani / 100);
  const total = subtotal + kdvAmount;
  return { subtotal, kdvAmount, total };
}

export function calculateUrunGrandTotal(items: UrunItem[]): {
  subtotal: number;
  kdvTotal: number;
  grandTotal: number;
} {
  return items.reduce(
    (acc, item) => {
      const { subtotal, kdvAmount, total } = calculateUrunLineTotal(item);
      return {
        subtotal: acc.subtotal + subtotal,
        kdvTotal: acc.kdvTotal + kdvAmount,
        grandTotal: acc.grandTotal + total,
      };
    },
    { subtotal: 0, kdvTotal: 0, grandTotal: 0 }
  );
}

// Odeme hedef tipi
export type OdemeHedefType = 'tedarikci' | 'staff' | 'kredi_karti' | null;

// Tahsilat hedef tipi
export type TahsilatHedefType = 'musteri' | 'tedarikci' | 'personel' | null;

// Hesap picker modu
export type HesapPickerTarget = 'source' | 'hedef';

// Pending modal tipi
export type PendingModal = 'category' | 'kredi_karti' | 'cari' | 'personel' | null;

// Edit mode tipi
export type QuickTransactionMode = 'create' | 'edit';

// Ana component props
export interface QuickTransactionBarProps {
  visible: boolean;
  onDismiss: () => void;
  defaultType?: TransactionType;
  defaultHesapId?: string;
  defaultCariId?: string;
  defaultCariType?: CariType;
  defaultPersonelId?: string;
  // Dışarıdan ön-doldurma (örn. mutabakat "eksikleri ekle" kuyruğu):
  // yalnız create modda uygulanır; copy/edit yüklemesini ezmez
  defaultAmount?: number;
  defaultDate?: Date;
  defaultDescription?: string;
  onSuccess?: () => void;
  // Viewer mode: linked cari viewer (hides ödeme/tahsilat tabs)
  isViewer?: boolean;
  /**
   * Otomatik/toplu akışlarda (mutabakat "eksikleri ekle" kuyruğu) son-kullanılan belleğe
   * YAZMAYI atlar — kuyruk 20 kalemi arka arkaya kaydedip chip'leri yanlış-etiketle ezmesin.
   * Yalnız kuyruk instance'ı true geçer; normal cari/personel/gelir-gider girişleri persist eder.
   */
  suppressLastUsed?: boolean;
  // Edit mode props
  mode?: QuickTransactionMode;
  transactionId?: string;
  isScheduledTransaction?: boolean;
  // Copy mode: load data from this transaction but create as new
  copySourceId?: string;
  // Override auto-detected tab mode (e.g. 'personel_izin' for leave-only tabs)
  tabModeOverride?: TransactionTabMode;
  /** #5 peek-sheet: cari satırından açılınca peek başlığı + yön butonları (yalnız cari-create). */
  peekCari?: PeekCari;
}

/** #5 peek verisi — cariler listesinden gelir, SIFIR ek sorgu. */
export interface PeekCari {
  id: string;
  name: string;
  balance: number;
  currency: string;
  type: 'musteri' | 'tedarikci';
  isLinked?: boolean;
  linkPermission?: string;
}

// Exchange rate data for cross-currency transactions
export interface PendingExchangeData {
  sourceCurrency: Currency;
  targetCurrency: Currency;
  sourceAmount: number;
}

// Form state (for future hook extraction)
export interface QuickTransactionFormState {
  type: TransactionType;
  amount: string;
  description: string;
  date: Date;
  kategoriId: string | null;
  isScheduled: boolean;
  isSaving: boolean;
  categorySkipped: boolean;
  selectedCategoryType: 'gelir' | 'gider' | null;
}

// Entity selection state (for future hook extraction)
export interface QuickTransactionEntityState {
  hedefHesapId: string | null;
  sourceHesapId: string | null;
  cariId: string | null;
  personelId: string | null;
  odemeHedefType: OdemeHedefType;
  tahsilatHedefType: TahsilatHedefType;
  hesapPickerTarget: HesapPickerTarget;
}

// Modal visibility state (for future hook extraction)
export interface QuickTransactionModalState {
  showDatePicker: boolean;
  showHesapPicker: boolean;
  showCariPicker: boolean;
  showPersonelPicker: boolean;
  showOdemeHedefTypePicker: boolean;
  showTahsilatHedefTypePicker: boolean;
  showKrediKartiPicker: boolean;
  showExchangeRateBar: boolean;
  categoryPickerOpen: boolean;
  pendingModal: PendingModal;
}

// Search state (for future hook extraction)
export interface QuickTransactionSearchState {
  hesapSearchQuery: string;
  cariSearchQuery: string;
  personelSearchQuery: string;
}
