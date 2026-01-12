/**
 * Merkezi Para/Tutar Yönetimi
 *
 * Bu dosya uygulamadaki tüm para işlemlerinin tek kaynağıdır.
 * Yeni para formatı veya işlemi eklendiğinde sadece burası güncellenmelidir.
 *
 * KULLANIM KURALLARI:
 * - Hiçbir component'ta doğrudan parseFloat() veya Number() ile para parse etme
 * - Tüm para formatlamaları bu dosyadan yapılmalı
 * - Balance alanları için toNumber() kullan
 */

import { getCurrentCurrency } from '@/hooks/useSettings';
import { Currency } from '@/types/database';
import { getCurrencySymbol, isPreciousMetal } from '@/constants/currencies';

// ============================================================================
// PARSE FONKSİYONLARI (String → Number)
// ============================================================================

/**
 * Kullanıcı girişinden para değerini parse et
 * Türkçe (1.234,56) ve İngilizce (1,234.56 veya 1234.56) formatları destekler
 *
 * @example
 * parseCurrency("1.234,56") // 1234.56
 * parseCurrency("1234,56")  // 1234.56
 * parseCurrency("1234.56")  // 1234.56
 * parseCurrency("5.000")    // 5000 (Türkçe binlik ayracı)
 * parseCurrency("")         // NaN
 */
export function parseCurrency(value: string): number {
  if (!value || value.trim() === '') return NaN;

  let cleaned = value.trim();

  // Hem nokta hem virgül varsa, Türkçe format (1.234,56)
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // Binlik ayracı olan noktaları kaldır, ondalık virgülü noktaya çevir
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    // Sadece virgül var - ondalık ayracı olarak kullan
    cleaned = cleaned.replace(',', '.');
  } else if (cleaned.includes('.')) {
    // Sadece nokta var - binlik mi ondalık mı kontrol et
    // Türkçe binlik ayracı: nokta her zaman 3 rakamdan önce gelir (5.000, 50.000, 1.234.567)
    // İngilizce ondalık: nokta 1-2 rakamdan önce gelir (5.5, 5.50)
    const dotIndex = cleaned.lastIndexOf('.');
    const afterDot = cleaned.length - dotIndex - 1;

    if (afterDot === 3) {
      // Türkçe binlik ayracı (5.000 → 5000)
      cleaned = cleaned.replace(/\./g, '');
    }
    // afterDot < 3 ise İngilizce ondalık, olduğu gibi bırak
  }

  return parseFloat(cleaned);
}

/**
 * Veritabanından gelen balance değerini number'a çevir
 * null, undefined, string ve number tiplerini güvenli şekilde handle eder
 *
 * @example
 * toNumber("1234.56")  // 1234.56
 * toNumber(1234.56)    // 1234.56
 * toNumber(null)       // 0
 * toNumber(undefined)  // 0
 */
export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

// ============================================================================
// FORMAT FONKSİYONLARI (Number → String)
// ============================================================================

/**
 * Para formatla: "₺1.234,56" veya "$1,234.56"
 * Her zaman mutlak değer kullanır (negatif işareti göstermez)
 *
 * @param amount - Formatlanacak tutar
 * @param accountCurrency - Hesabın para birimi (opsiyonel). Verilirse hesabın para birimine göre formatlar.
 *
 * @example
 * formatCurrency(1234.56)           // "₺1.234,56" (kullanıcının ayarına göre)
 * formatCurrency(1234.56, 'USD')    // "$1,234.56" (hesap USD ise)
 * formatCurrency(1234.56, 'EUR')    // "€1,234.56" (hesap EUR ise)
 * formatCurrency(1234.56, 'XAU')    // "1.234,56 gr" (altın için gram)
 */
export function formatCurrency(amount: number, accountCurrency?: Currency | string | null): string {
  const abs = Math.abs(amount);

  // Hesap para birimi verilmişse onu kullan
  if (accountCurrency) {
    const symbol = getCurrencySymbol(accountCurrency as Currency);

    // Altın/Gümüş için özel format: "1.234,56 gr"
    if (isPreciousMetal(accountCurrency as Currency)) {
      return `${new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(abs)} ${symbol}`;
    }

    // USD/EUR için İngilizce format: "$1,234.56"
    if (accountCurrency === 'USD' || accountCurrency === 'EUR') {
      return `${symbol}${new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(abs)}`;
    }

    // TRY için Türkçe format: "₺1.234,56"
    return `${symbol}${new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs)}`;
  }

  // Hesap para birimi verilmemişse kullanıcının ayarına göre formatla
  const currencyConfig = getCurrentCurrency();
  return `${currencyConfig.symbol}${new Intl.NumberFormat(currencyConfig.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs)}`;
}

/**
 * Para formatla işaret ile: "+₺1.234,56" veya "-₺1.234,56"
 *
 * @example
 * formatCurrencyWithSign(1234.56)           // "+₺1.234,56"
 * formatCurrencyWithSign(-1234.56)          // "-₺1.234,56"
 * formatCurrencyWithSign(1234.56, 'USD')    // "+$1,234.56"
 */
export function formatCurrencyWithSign(amount: number, accountCurrency?: Currency | string | null): string {
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}${formatCurrency(amount, accountCurrency)}`;
}

/**
 * Para formatla (sembol olmadan): "1.234,56" veya "1,234.56"
 * Kullanıcının seçtiği locale'e göre formatlar
 *
 * @example
 * formatNumber(1234.56) // "1.234,56" (TRY seçiliyken)
 * formatNumber(1234.56) // "1,234.56" (USD seçiliyken)
 */
export function formatNumber(amount: number): string {
  const currencyConfig = getCurrentCurrency();
  return new Intl.NumberFormat(currencyConfig.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
}

/**
 * Yüzde formatla: "45,5%"
 *
 * @example
 * formatPercentage(45.5) // "45,5%"
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals).replace('.', ',')}%`;
}

/**
 * Kompakt para formatı (büyük sayılar için): "₺1,2M", "$1.2M"
 *
 * @example
 * formatCurrencyCompact(1234567)          // "₺1,2M" (TRY seçiliyken)
 * formatCurrencyCompact(1234567, 'USD')   // "$1.2M"
 * formatCurrencyCompact(12345)            // "₺12,3K"
 * formatCurrencyCompact(1234)             // "₺1.234"
 */
export function formatCurrencyCompact(amount: number, accountCurrency?: Currency | string | null): string {
  const abs = Math.abs(amount);

  // Hesap para birimine göre ayarları belirle
  let symbol: string;
  let decimalSeparator: string;

  if (accountCurrency) {
    symbol = getCurrencySymbol(accountCurrency as Currency);
    // USD/EUR için nokta, diğerleri için virgül
    decimalSeparator = (accountCurrency === 'USD' || accountCurrency === 'EUR') ? '.' : ',';
  } else {
    const currencyConfig = getCurrentCurrency();
    symbol = currencyConfig.symbol;
    decimalSeparator = currencyConfig.locale.startsWith('tr') ? ',' : '.';
  }

  // Altın/Gümüş için sembol sonda olmalı
  const isMetalCurrency = isPreciousMetal(accountCurrency as Currency);

  if (abs >= 1_000_000) {
    const formatted = (abs / 1_000_000).toFixed(1).replace('.', decimalSeparator);
    return isMetalCurrency ? `${formatted}M ${symbol}` : `${symbol}${formatted}M`;
  }

  if (abs >= 10_000) {
    const formatted = (abs / 1_000).toFixed(1).replace('.', decimalSeparator);
    return isMetalCurrency ? `${formatted}K ${symbol}` : `${symbol}${formatted}K`;
  }

  return formatCurrency(amount, accountCurrency);
}

// ============================================================================
// INPUT FORMATLAMA (Kullanıcı yazarken)
// ============================================================================

/**
 * Input'a yazılan değeri Türkçe para formatına çevir
 * Kullanıcı yazarken canlı formatlama yapar
 *
 * @example
 * formatCurrencyInput("2000")      // "2.000"
 * formatCurrencyInput("2000,5")    // "2.000,5"
 * formatCurrencyInput("2000,50")   // "2.000,50"
 * formatCurrencyInput("")          // ""
 */
export function formatCurrencyInput(value: string): string {
  if (!value || value.trim() === '') return '';

  // Sadece rakam, virgül ve nokta bırak
  let cleaned = value.replace(/[^\d,]/g, '');

  // Birden fazla virgül varsa sadece ilkini tut
  const parts = cleaned.split(',');
  if (parts.length > 2) {
    cleaned = parts[0] + ',' + parts.slice(1).join('');
  }

  // Virgülden önce ve sonra ayır
  const [integerPart, decimalPart] = cleaned.split(',');

  // Tam kısmı formatla (binlik ayracı ekle)
  if (!integerPart) return '';

  const parsedInteger = parseInt(integerPart, 10);
  if (isNaN(parsedInteger)) return '';

  const formattedInteger = parsedInteger.toLocaleString('tr-TR');

  // Ondalık kısım varsa ekle (max 2 hane)
  if (decimalPart !== undefined) {
    const limitedDecimal = decimalPart.slice(0, 2);
    return `${formattedInteger},${limitedDecimal}`;
  }

  return formattedInteger;
}

/**
 * Formatlanmış input değerini parse için hazırla
 * formatCurrencyInput ile formatlanmış değeri parseCurrency'ye uygun hale getirir
 *
 * @example
 * unformatCurrencyInput("2.000,50") // "2000,50"
 * unformatCurrencyInput("2.000")    // "2000"
 */
export function unformatCurrencyInput(value: string): string {
  return value.replace(/\./g, '');
}

// ============================================================================
// VALİDASYON FONKSİYONLARI
// ============================================================================

/**
 * Tutar geçerli mi kontrol et (0'dan büyük sayı)
 *
 * @example
 * isValidAmount("1.234,56") // true
 * isValidAmount("0")        // false
 * isValidAmount("")         // false
 * isValidAmount("abc")      // false
 */
export function isValidAmount(value: string): boolean {
  const amount = parseCurrency(value);
  return !isNaN(amount) && amount > 0;
}

/**
 * Bakiye geçerli mi kontrol et (0 veya daha büyük, negatif de olabilir)
 *
 * @example
 * isValidBalance("1.234,56")  // true
 * isValidBalance("-500")      // true
 * isValidBalance("0")         // true
 * isValidBalance("")          // false
 */
export function isValidBalance(value: string): boolean {
  const amount = parseCurrency(value);
  return !isNaN(amount);
}

// ============================================================================
// BAKİYE HESAPLAMA YARDIMCILARI
// ============================================================================

/**
 * Bakiye tipine göre label döndür
 *
 * @example
 * getBalanceLabel(100, 'musteri')   // { label: "Alacak", isPositive: true }
 * getBalanceLabel(-100, 'musteri')  // { label: "Borç", isPositive: false }
 * getBalanceLabel(100, 'tedarikci') // { label: "Fazla Ödeme", isPositive: true }
 * getBalanceLabel(-100, 'tedarikci') // { label: "Borç", isPositive: false }
 */
export function getBalanceInfo(
  balance: number,
  type: 'musteri' | 'tedarikci' | 'personel'
): {
  label: string;
  isPositive: boolean;
  colorType: 'success' | 'error' | 'secondary';
} {
  const isPositive = balance > 0;
  const isZero = balance === 0;

  if (isZero) {
    return { label: 'Dengede', isPositive: true, colorType: 'secondary' };
  }

  switch (type) {
    case 'musteri':
      return isPositive
        ? { label: 'Alacak', isPositive: true, colorType: 'success' }
        : { label: 'Borç', isPositive: false, colorType: 'error' };

    case 'tedarikci':
      return isPositive
        ? { label: 'Fazla Ödeme', isPositive: true, colorType: 'success' }
        : { label: 'Borç', isPositive: false, colorType: 'error' };

    case 'personel':
      return isPositive
        ? { label: 'Avans', isPositive: true, colorType: 'success' }
        : { label: 'Borç', isPositive: false, colorType: 'error' };

    default:
      return isPositive
        ? { label: 'Alacak', isPositive: true, colorType: 'success' }
        : { label: 'Borç', isPositive: false, colorType: 'error' };
  }
}

/**
 * Toplam borç ve alacak hesapla
 */
export function calculateBalanceSummary(
  items: Array<{ balance: number | string }>
): {
  receivables: number; // Alacaklar (pozitif bakiyeler)
  payables: number; // Borçlar (negatif bakiyelerin mutlak değeri)
  net: number; // Net durum
} {
  const result = items.reduce(
    (acc, item) => {
      const balance = toNumber(item.balance);
      if (balance > 0) {
        acc.receivables += balance;
      } else if (balance < 0) {
        acc.payables += Math.abs(balance);
      }
      return acc;
    },
    { receivables: 0, payables: 0 }
  );

  return {
    ...result,
    net: result.receivables - result.payables,
  };
}
