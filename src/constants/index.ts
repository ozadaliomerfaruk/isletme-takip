export * from './colors';
export * from './spacing';
export * from './islemTypes';
export * from './categoryIcons';
export * from './currencies';

export const APP_NAME = 'Business Tracker'; // İşletme Takip in TR

/**
 * @deprecated Çeviriler için t('accounts:typeLabels.${type}') kullanın
 */
export const HESAP_TYPES = {
  nakit: 'Nakit',
  banka: 'Banka Hesabı',
  kredi_karti: 'Kredi Kartı',
} as const;

/**
 * @deprecated Çeviriler için t('clients:types.${type}') kullanın
 */
export const CARI_TYPES = {
  tedarikci: 'Tedarikçi',
  musteri: 'Müşteri',
} as const;

/**
 * @deprecated Çeviriler için t('transactions:types.${type}') kullanın
 */
export const ISLEM_TYPES = {
  gelir: 'Gelir',
  gider: 'Gider',
  transfer: 'Transfer',
  odeme: 'Ödeme',
  tahsilat: 'Tahsilat',
  alis: 'Alış',
  satis: 'Satış',
} as const;
