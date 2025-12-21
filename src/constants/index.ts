export * from './colors';
export * from './spacing';

export const APP_NAME = 'İşletme Takip';
export const CURRENCY = 'TRY';
export const CURRENCY_SYMBOL = '₺';

export const HESAP_TYPES = {
  nakit: 'Nakit',
  banka: 'Banka Hesabı',
  kredi_karti: 'Kredi Kartı',
} as const;

export const CARI_TYPES = {
  tedarikci: 'Tedarikçi',
  musteri: 'Müşteri',
} as const;

export const ISLEM_TYPES = {
  gelir: 'Gelir',
  gider: 'Gider',
  transfer: 'Transfer',
  odeme: 'Ödeme',
  tahsilat: 'Tahsilat',
  alis: 'Alış',
  satis: 'Satış',
} as const;
