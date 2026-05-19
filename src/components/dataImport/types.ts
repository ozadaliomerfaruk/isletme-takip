export type Step = 'select' | 'preview' | 'mapping' | 'importing' | 'result';
export type ModalType = 'transactions' | 'accounts' | 'clients' | 'categories' | 'categoryTypes' | 'skipped' | null;
export type TabType = 'import' | 'skipped';

export const HESAP_TYPE_VALUES = ['banka', 'nakit', 'kredi_karti', 'birikim'] as const;
export const CARI_TYPE_VALUES = ['musteri', 'tedarikci'] as const;
export const ENTITY_TYPE_VALUES = ['cari', 'personel'] as const;
