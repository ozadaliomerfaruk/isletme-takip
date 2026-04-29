/**
 * Para birimi sabitleri
 * Hesaplarda kullanılabilecek para birimleri
 */

import { Currency } from '@/types/database';

export interface CurrencyInfo {
  code: Currency;
  symbol: string;
  name: string;
  nameEn: string;
  flag?: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'TRY', symbol: '₺', name: 'Türk Lirası', nameEn: 'Turkish Lira', flag: '🇹🇷' },
  { code: 'USD', symbol: '$', name: 'Amerikan Doları', nameEn: 'US Dollar', flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', name: 'Euro', nameEn: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', name: 'İngiliz Sterlini', nameEn: 'British Pound', flag: '🇬🇧' },
  { code: 'XAU', symbol: 'gr', name: 'Altın (gram)', nameEn: 'Gold (gram)' },
  { code: 'XAG', symbol: 'gr', name: 'Gümüş (gram)', nameEn: 'Silver (gram)' },
];

/**
 * Para birimi sembolünü döndürür
 */
export const getCurrencySymbol = (code: Currency | string | undefined | null): string => {
  if (!code) return '₺';
  const currency = CURRENCIES.find(c => c.code === code);
  return currency?.symbol || code;
};


/**
 * Para birimi bilgisini döndürür
 */
export const getCurrencyInfo = (code: Currency | string | undefined | null): CurrencyInfo => {
  if (!code) return CURRENCIES[0]; // TRY default
  const currency = CURRENCIES.find(c => c.code === code);
  return currency || CURRENCIES[0];
};

/**
 * İki para biriminin farklı olup olmadığını kontrol eder
 */
export const isCrossCurrency = (
  currency1: Currency | string | undefined | null,
  currency2: Currency | string | undefined | null
): boolean => {
  const c1 = currency1 || 'TRY';
  const c2 = currency2 || 'TRY';
  return c1 !== c2;
};

/**
 * Kur giriş formatı için yabancı para birimini belirler
 * TL olmayan para birimi baz alınır
 * Örnek: EUR/TRY için "1 EUR = ? TL"
 * Örnek: USD/EUR için daha büyük değerli olan baz (EUR)
 */
export const getExchangeRateDisplay = (
  sourceCurrency: Currency | string,
  targetCurrency: Currency | string
): { baseCurrency: string; quoteCurrency: string } => {
  const source = sourceCurrency || 'TRY';
  const target = targetCurrency || 'TRY';

  // TL varsa, TL olmayan para birimi baz alınır
  if (source === 'TRY' && target !== 'TRY') {
    return { baseCurrency: target, quoteCurrency: 'TRY' };
  }
  if (target === 'TRY' && source !== 'TRY') {
    return { baseCurrency: source, quoteCurrency: 'TRY' };
  }

  // İkisi de TL değilse, kaynak para birimi baz alınır
  return { baseCurrency: source, quoteCurrency: target };
};

/**
 * Altın veya gümüş para birimi mi?
 */
export const isPreciousMetal = (code: Currency | string | undefined | null): boolean => {
  return code === 'XAU' || code === 'XAG';
};

/**
 * Varsayılan para birimi
 */
export const DEFAULT_CURRENCY: Currency = 'TRY';

/**
 * Lokalize edilmiş para birimi listesi
 * İngilizce için TRY sona, Türkçe için TRY başa gelir
 */
export const getLocalizedCurrencies = (locale: string): CurrencyInfo[] => {
  const isEnglish = locale.startsWith('en');

  if (isEnglish) {
    // İngilizce: USD, EUR, GBP önce, TRY sona
    const nonTRY = CURRENCIES.filter(c => c.code !== 'TRY');
    const TRY = CURRENCIES.find(c => c.code === 'TRY');
    return TRY ? [...nonTRY, TRY] : nonTRY;
  }

  // Türkçe ve diğer diller: varsayılan sıra (TRY önce)
  return CURRENCIES;
};

/**
 * Para birimi adını locale'e göre döndürür
 */
export const getLocalizedCurrencyName = (code: Currency | string | undefined | null, locale: string): string => {
  if (!code) return locale.startsWith('en') ? 'Turkish Lira' : 'Türk Lirası';
  const currency = CURRENCIES.find(c => c.code === code);
  if (!currency) return code;
  return locale.startsWith('en') ? currency.nameEn : currency.name;
};
