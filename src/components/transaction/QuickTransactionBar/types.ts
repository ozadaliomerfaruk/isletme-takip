import { CariType, Currency } from '@/types/database';
import { TransactionType, TransactionTabMode } from '../TransactionTypeTabs';

// Re-export for convenience
export type { TransactionType, TransactionTabMode };

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
  onSuccess?: () => void;
  // Edit mode props
  mode?: QuickTransactionMode;
  transactionId?: string;
  isScheduledTransaction?: boolean;
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
