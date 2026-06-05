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
import i18n from '@/i18n';

// ============================================================================
// YUVARLAMA (IEEE 754 safe)
// ============================================================================

/**
 * Para tutarını 2 ondalık basamağa yuvarla (IEEE 754 floating point safe)
 * Math.round(1.005 * 100) / 100 = 1.00 (YANLIŞ) → bu fonksiyon 1.01 döner
 */
export function roundCurrency(value: number): number {
  if (isNaN(value) || !isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  return sign * Number(Math.round(parseFloat(Math.abs(value) + 'e2')) + 'e-2');
}

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
/**
 * Aktif (ana) para biriminin locale'ine göre binlik/ondalık ayraçlarını döndürür.
 * en-US / en-GB (USD/GBP): ondalık '.', binlik ','
 * tr-TR / de-DE (TRY/EUR): ondalık ',', binlik '.'
 */
function getLocaleSeparators(): { decimal: string; thousands: string } {
  const locale = getCurrentCurrency().locale;
  return locale.startsWith('en')
    ? { decimal: '.', thousands: ',' }
    : { decimal: ',', thousands: '.' };
}

export function parseCurrency(value: string): number {
  if (!value || value.trim() === '') return NaN;

  let cleaned = value.trim();
  const { thousands } = getLocaleSeparators();

  // Hem nokta hem virgül varsa SON gelen ayraç ondalıktır, diğeri binliktir (locale-bağımsız).
  //   "1.234,56" (TR) -> virgül sonda -> ondalık virgül ; "1,234.56" (EN) -> nokta sonda -> ondalık nokta
  if (cleaned.includes('.') && cleaned.includes(',')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    // Tek tür ayraç: virgül. EN'de binlik (1,000 -> 1000), TR/DE'de ondalık (1234,56).
    cleaned = thousands === ',' ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  } else if (cleaned.includes('.')) {
    // Tek tür ayraç: nokta. TR/DE'de 3 rakam öncesi binliktir (5.000 -> 5000); aksi halde ondalık.
    const afterDot = cleaned.length - cleaned.lastIndexOf('.') - 1;
    if (thousands === '.' && afterDot === 3) {
      cleaned = cleaned.replace(/\./g, '');
    }
    // EN'de nokta her zaman ondalık; TR/DE'de <3 hane lenient ondalık (olduğu gibi bırak)
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
  if (typeof value === 'number') {
    if (isNaN(value)) return 0;
    return value;
  }
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Kritik finansal işlemler için güvenli tutar dönüşümü
 * NaN veya geçersiz değerler için hata fırlatır
 *
 * @example
 * safeParseAmount("1234.56")  // 1234.56
 * safeParseAmount(1234.56)    // 1234.56
 * safeParseAmount(null)       // Error!
 * safeParseAmount("invalid")  // Error!
 */
export function safeParseAmount(value: string | number | null | undefined, fieldName: string = 'amount'): number {
  if (value === null || value === undefined) {
    throw new Error(`Invalid ${fieldName}: value is null or undefined`);
  }

  let result: number;
  if (typeof value === 'number') {
    result = value;
  } else {
    result = parseFloat(value);
  }

  if (isNaN(result)) {
    throw new Error(`Invalid ${fieldName}: "${value}" is not a valid number`);
  }

  if (!isFinite(result)) {
    throw new Error(`Invalid ${fieldName}: value is infinite`);
  }

  return result;
}

/**
 * Kur değerini güvenli şekilde parse et ve doğrula
 * NaN, 0, negatif veya sonsuz değerler için hata fırlatır
 *
 * @example
 * safeParseExchangeRate(1.5)   // 1.5
 * safeParseExchangeRate("1.5") // 1.5
 * safeParseExchangeRate(0)     // Error! (division by zero riski)
 * safeParseExchangeRate(-1)    // Error! (negatif kur olamaz)
 */
export function safeParseExchangeRate(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  let result: number;
  if (typeof value === 'number') {
    result = value;
  } else {
    result = parseFloat(value);
  }

  // NaN kontrolü
  if (isNaN(result)) {
    return null;
  }

  // Sonsuz değer kontrolü
  if (!isFinite(result)) {
    throw new Error('Invalid exchange rate: value is infinite');
  }

  // Sıfır veya negatif kontrolü (division by zero riski)
  if (result <= 0) {
    throw new Error('Invalid exchange rate: must be greater than 0');
  }

  return result;
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

    // USD/EUR/GBP için İngilizce format: "$1,234.56"
    if (accountCurrency === 'USD' || accountCurrency === 'EUR' || accountCurrency === 'GBP') {
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
  const currencyConfig = getCurrentCurrency();
  const decimalSeparator = currencyConfig.locale.startsWith('tr') ? ',' : '.';
  return `${value.toFixed(decimals).replace('.', decimalSeparator)}%`;
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
    // USD/EUR/GBP için nokta (formatCurrency bunlarda en-US formatı kullanır), diğerleri için virgül
    decimalSeparator = (accountCurrency === 'USD' || accountCurrency === 'EUR' || accountCurrency === 'GBP') ? '.' : ',';
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

  const locale = getCurrentCurrency().locale;
  const { decimal } = getLocaleSeparators();
  const decimalClass = decimal === '.' ? '\\.' : ',';

  // Yalnızca rakam ve locale'in ONDALIK ayracını bırak; binlik ayracını AT.
  // Bu, fonksiyonu idempotent yapar: kendi formatladığı "1.000" tekrar verildiğinde
  // binlik nokta atılır → "1.000" sabit kalır (yanlışlıkla ondalık sanılmaz).
  let cleaned = value.replace(new RegExp(`[^\\d${decimalClass}]`, 'g'), '');

  // Birden fazla ondalık ayracı varsa sadece ilkini tut
  const parts = cleaned.split(decimal);
  if (parts.length > 2) {
    cleaned = parts[0] + decimal + parts.slice(1).join('');
  }

  const [integerPart, decimalPart] = cleaned.split(decimal);
  if (!integerPart) return '';

  const parsedInteger = parseInt(integerPart, 10);
  if (isNaN(parsedInteger)) return '';

  // Tam kısmı locale'e göre binlik ayraçla formatla
  const formattedInteger = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(parsedInteger);

  // Ondalık kısım varsa locale'in ondalık ayracıyla ekle (max 2 hane)
  if (decimalPart !== undefined) {
    return `${formattedInteger}${decimal}${decimalPart.slice(0, 2)}`;
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
  const { thousands } = getLocaleSeparators();
  const thousandsEsc = thousands === '.' ? '\\.' : ',';
  return value.replace(new RegExp(thousandsEsc, 'g'), '');
}

/**
 * Ham (canlı) girişi locale'e göre temizler: yalnızca rakam + ondalık ayracı bırakır,
 * ondalık kısmı en fazla 2 haneyle sınırlar, binlik ayracı EKLEMEZ.
 * AmountInput gibi tuş-tuş güncellenen giriş alanları için kullanılır.
 *
 * @example
 * cleanAmountInput("2.000,567")  // "2000,56" (tr-TR / de-DE)
 * cleanAmountInput("2,000.567")  // "2000.56" (en-US / en-GB)
 */
export function cleanAmountInput(text: string): string {
  const { decimal } = getLocaleSeparators();
  const decimalClass = decimal === '.' ? '\\.' : ',';
  // Yalnızca rakam ve locale ondalık ayracını bırak; binlik ayracını AT (idempotent).
  const cleaned = text.replace(new RegExp(`[^\\d${decimalClass}]`, 'g'), '');
  const parts = cleaned.split(decimal);
  let result = parts[0];
  if (parts.length > 1) {
    result += decimal + parts[1].slice(0, 2);
  }
  return result;
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
 * Bakiye tipine göre i18n label key döndür
 *
 * @example
 * getBalanceInfo(100, 'musteri')    // { label: "receivable", isPositive: true, colorType: "success" }
 * getBalanceInfo(-100, 'musteri')   // { label: "debt", isPositive: false, colorType: "error" }
 * getBalanceInfo(100, 'tedarikci')  // { label: "overpayment", isPositive: true, colorType: "success" }
 * getBalanceInfo(0, 'musteri')      // { label: "balanced", isPositive: true, colorType: "secondary" }
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
    return { label: 'balanced', isPositive: true, colorType: 'secondary' };
  }

  switch (type) {
    case 'musteri':
      return isPositive
        ? { label: 'receivable', isPositive: true, colorType: 'success' }
        : { label: 'debt', isPositive: false, colorType: 'error' };

    case 'tedarikci':
      return isPositive
        ? { label: 'overpayment', isPositive: true, colorType: 'success' }
        : { label: 'debt', isPositive: false, colorType: 'error' };

    case 'personel':
      return isPositive
        ? { label: 'advance', isPositive: true, colorType: 'success' }
        : { label: 'debt', isPositive: false, colorType: 'error' };

    default:
      return isPositive
        ? { label: 'receivable', isPositive: true, colorType: 'success' }
        : { label: 'debt', isPositive: false, colorType: 'error' };
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

// ============================================================================
// CROSS-CURRENCY HESAPLAMA
// ============================================================================

/**
 * Cross-currency hesaplama için güvenli dönüşüm
 * Exchange rate ile hedef tutarı hesaplar
 *
 * Kur formatı: "1 [yabancı para] = X TRY"
 * - USD -> TRY: amount * exchangeRate (örn: 100 USD * 32 = 3200 TRY)
 * - TRY -> USD: amount / exchangeRate (örn: 3200 TRY / 32 = 100 USD)
 *
 * @example
 * calculateTargetAmount(100, 32, 'USD', 'TRY') // 3200 (100 * 32)
 * calculateTargetAmount(3200, 32, 'TRY', 'USD') // 100 (3200 / 32)
 * calculateTargetAmount(100, null, 'TRY', 'TRY') // 100 (aynı para birimi)
 */
export function calculateTargetAmount(
  amount: number,
  exchangeRate: number | null,
  sourceCurrency: string,
  targetCurrency: string
): number {
  // Aynı para birimi ise dönüşüm yok
  if (sourceCurrency === targetCurrency) {
    return amount;
  }

  // Exchange rate yoksa veya geçersizse - farklı para birimleri için kur zorunlu
  if (!exchangeRate || exchangeRate <= 0) {
    throw new Error(
      i18n.t('common:errors.invalidExchangeRate', { source: sourceCurrency, target: targetCurrency, rate: exchangeRate })
    );
  }

  // TRY referans alınarak kur hesaplanır
  // Exchange rate formatı: "1 [yabancı para] = X TRY"
  let result: number;
  if (sourceCurrency === 'TRY') {
    // TRY'den yabancı paraya: bölme işlemi
    result = amount / exchangeRate;
  } else if (targetCurrency === 'TRY') {
    // Yabancı paradan TRY'ye: çarpma işlemi
    result = amount * exchangeRate;
  } else {
    // İki yabancı para arası: önce TRY'ye çevir, sonra hedef paraya
    // Bu durumda exchange_rate source->TRY formatında olmalı
    // Basitleştirilmiş: direkt çarpma (UI'da doğru kur girilmeli)
    result = amount * exchangeRate;
  }

  // Floating point precision fix: 2 ondalık basamağa yuvarla (IEEE 754 safe)
  return roundCurrency(result);
}

// ============================================================================
// CROSS-CURRENCY GÖSTERİM YARDIMCISI
// ============================================================================

/** Cross-currency gösterim için işlemden okunan minimal alanlar */
export interface CrossCurrencyIslemLike {
  type: string;
  amount: number | string;
  source_currency?: string | null;
  target_currency?: string | null;
  exchange_rate?: number | null;
  hesap?: { currency?: string | null } | null;
  hedef_hesap?: { currency?: string | null } | null;
  cari?: { currency?: string | null } | null;
  personel?: { currency?: string | null } | null;
}

export interface CrossCurrencyDisplay {
  /** Ana (büyük) satırda gösterilecek tutar — HEDEF tarafın para biriminde */
  mainAmount: number;
  /** Ana satırın para birimi (hedef taraf) */
  mainCurrency: string | undefined;
  /** Alt (küçük) satırda gösterilecek metin — KAYNAK para birimindeki karşılığı. Cross-currency değilse null */
  subText: string | null;
}

/**
 * Bir işlemin ana/alt tutar gösterimini tek kuralla hesaplar:
 *   - Ana satır: HEDEF tarafın (paranın gittiği entity) para biriminde tutar
 *   - Alt satır: KAYNAK hesabın para birimindeki orijinal tutar
 * Yalnızca GÖRSEL; saklanan tutar/bakiye değişmez. Cross-currency değilse alt satır null.
 *
 * Hedef taraf: transfer -> hedef_hesap, cari_* -> cari, personel_* -> personel.
 * 'amount' kaynak (hesap) para birimindedir; HEDEF tutar = calculateTargetAmount ile çevrilir.
 */
export function getCrossCurrencyDisplay(islem: CrossCurrencyIslemLike): CrossCurrencyDisplay {
  const amount = toNumber(islem.amount);
  const sourceCurrency = islem.source_currency || islem.hesap?.currency || undefined;

  // Hedef tarafın para birimini işlem tipine göre çöz
  let targetCurrency: string | undefined;
  if (islem.type === 'transfer') {
    targetCurrency = islem.target_currency || islem.hedef_hesap?.currency || undefined;
  } else if (islem.type.startsWith('cari_')) {
    targetCurrency = islem.target_currency || islem.cari?.currency || undefined;
  } else if (islem.type.startsWith('personel_')) {
    targetCurrency = islem.target_currency || islem.personel?.currency || undefined;
  } else {
    targetCurrency = sourceCurrency;
  }

  const rate = islem.exchange_rate ? toNumber(islem.exchange_rate) : null;

  // Cross-currency değilse (aynı pb / kur yok / taraf yok): ana=kaynak, alt yok
  if (!sourceCurrency || !targetCurrency || sourceCurrency === targetCurrency || !rate || rate <= 0) {
    return { mainAmount: amount, mainCurrency: sourceCurrency, subText: null };
  }

  let targetAmount: number;
  try {
    targetAmount = calculateTargetAmount(amount, rate, sourceCurrency, targetCurrency);
  } catch {
    // Kur hesaplanamazsa güvenli düş: kaynak tutarı göster, alt satır yok
    return { mainAmount: amount, mainCurrency: sourceCurrency, subText: null };
  }

  return {
    mainAmount: targetAmount,
    mainCurrency: targetCurrency,
    subText: formatCurrency(amount, sourceCurrency),
  };
}
