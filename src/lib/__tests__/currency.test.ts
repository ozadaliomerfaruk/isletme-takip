/**
 * Currency utility tests - Bugs #5, #6, #7
 */

// Mock useSettings before importing currency.
// mockCurrencyConfig değiştirilebilir; locale-bağımlı davranış testlerinde değiştirilir.
const mockCurrencyConfig = { code: 'TRY', symbol: '₺', locale: 'tr-TR' };
jest.mock('@/hooks/useSettings', () => ({
  getCurrentCurrency: () => mockCurrencyConfig,
  getCurrentDateFormat: () => ({ code: 'DMY', example: '31/12/2024', separator: '/' }),
}));

/** Test süresince ana para birimi locale'ini geçici olarak değiştirir */
function setMockCurrency(code: string, symbol: string, locale: string) {
  mockCurrencyConfig.code = code;
  mockCurrencyConfig.symbol = symbol;
  mockCurrencyConfig.locale = locale;
}
const TR_DEFAULT = { code: 'TRY', symbol: '₺', locale: 'tr-TR' };

jest.mock('@/constants/currencies', () => ({
  // GERÇEK davranışın aynısı (constants/currencies.ts:29-35): kod YOKSA sabit '₺' değil
  // ANA para biriminin sembolü döner. Mock bunu taklit etmezse formatCurrency'nin
  // argümansız dalı testte "undefined1.234,56" üretir ama üretimde doğrudur.
  getCurrencySymbol: (code?: string | null) => {
    if (!code) return mockCurrencyConfig.symbol;
    const symbols: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
    return symbols[code] || code;
  },
  isPreciousMetal: () => false,
}));

import {
  calculateTargetAmount,
  toNumber,
  roundCurrency,
  parseCurrency,
  safeParseAmount,
  safeParseExchangeRate,
  formatCurrencyInput,
  unformatCurrencyInput,
  cleanAmountInput,
  formatAmountForInput,
  isValidAmount,
  isValidBalance,
  getBalanceInfo,
  calculateBalanceSummary,
  formatCurrency,
  formatCurrencyWithSign,
  formatCurrencyCompact,
  formatPercentage,
  getCurrencyLocale,
  getLocaleSeparators,
} from '../currency';

// ============================================================================
// Bug #5: Exchange rate=0 sessiz hata
// calculateTargetAmount() rate=0 olduğunda orijinal tutarı döndürüyor
// ============================================================================
describe('Bug #5: calculateTargetAmount - invalid exchange rate', () => {
  it('should throw when exchange rate is 0 for cross-currency conversion', () => {
    expect(() => calculateTargetAmount(100, 0, 'USD', 'TRY')).toThrow();
  });

  it('should throw when exchange rate is null for cross-currency conversion', () => {
    expect(() => calculateTargetAmount(100, null, 'USD', 'TRY')).toThrow();
  });

  it('should throw when exchange rate is negative for cross-currency conversion', () => {
    expect(() => calculateTargetAmount(100, -5, 'USD', 'TRY')).toThrow();
  });

  it('should NOT throw for same currency regardless of rate', () => {
    expect(calculateTargetAmount(100, 0, 'TRY', 'TRY')).toBe(100);
    expect(calculateTargetAmount(100, null, 'USD', 'USD')).toBe(100);
  });

  it('should correctly convert USD to TRY (foreign to TRY = multiply)', () => {
    expect(calculateTargetAmount(100, 32, 'USD', 'TRY')).toBe(3200);
  });

  it('should correctly convert TRY to USD (TRY to foreign = divide)', () => {
    expect(calculateTargetAmount(3200, 32, 'TRY', 'USD')).toBe(100);
  });

  it('should handle non-TRY to non-TRY conversion', () => {
    // USD to EUR with direct rate
    const result = calculateTargetAmount(100, 0.92, 'USD', 'EUR');
    expect(result).toBe(92);
  });
});

// ============================================================================
// Bug #6: Negatif sayı yuvarlama hatası
// Math.round(-1.005 * 100) / 100 = -1.00 (doğrusu -1.01)
// ============================================================================
describe('Bug #6: calculateTargetAmount - rounding precision', () => {
  it('should round 1.005 to 1.01 (not 1.00)', () => {
    // 32.16 TRY / 32 rate = 1.005 USD -> should be 1.01
    const result = calculateTargetAmount(32.16, 32, 'TRY', 'USD');
    expect(result).toBe(1.01);
  });

  it('should round 0.005 to 0.01', () => {
    // 0.005 * 1 = 0.005, should round to 0.01
    const result = calculateTargetAmount(0.005, 1, 'USD', 'TRY');
    expect(result).toBe(0.01);
  });

  it('should handle negative amounts correctly', () => {
    // -32.16 TRY / 32 = -1.005 -> should be -1.01
    const result = calculateTargetAmount(-32.16, 32, 'TRY', 'USD');
    expect(result).toBe(-1.01);
  });

  it('should maintain standard 2-decimal precision', () => {
    expect(calculateTargetAmount(100.456, 1, 'USD', 'TRY')).toBe(100.46);
    expect(calculateTargetAmount(100.454, 1, 'USD', 'TRY')).toBe(100.45);
  });
});

// ============================================================================
// Bug #7: Dönüşüm zinciri drift
// Multi-step conversion accumulates rounding error
// ============================================================================
describe('Bug #7: calculateTargetAmount - conversion chain drift', () => {
  it('should not accumulate excessive rounding error in round-trip', () => {
    // Step 1: 1000 USD -> TRY at rate 32.456
    const tryAmount = calculateTargetAmount(1000, 32.456, 'USD', 'TRY');
    // Step 2: TRY -> EUR at rate 35.123 (1 EUR = 35.123 TRY)
    const eurAmount = calculateTargetAmount(tryAmount, 35.123, 'TRY', 'EUR');
    // Step 3: EUR -> TRY at rate 35.123
    const tryBack = calculateTargetAmount(eurAmount, 35.123, 'EUR', 'TRY');
    // Step 4: TRY -> USD at rate 32.456
    const usdBack = calculateTargetAmount(tryBack, 32.456, 'TRY', 'USD');

    // Round trip should be close to 1000, within 0.05 tolerance
    expect(Math.abs(usdBack - 1000)).toBeLessThanOrEqual(0.05);
  });

  it('should handle large amounts without losing precision', () => {
    const result = calculateTargetAmount(1000000.99, 32.456, 'USD', 'TRY');
    // 1000000.99 * 32.456 = 32456032.13
    expect(result).toBeCloseTo(32456032.13, 1);
  });
});

// ============================================================================
// toNumber - database value to number conversion
// ============================================================================
describe('toNumber', () => {
  it('should return 0 for null', () => {
    expect(toNumber(null)).toBe(0);
  });

  it('should return 0 for undefined', () => {
    expect(toNumber(undefined)).toBe(0);
  });

  it('should return number as-is', () => {
    expect(toNumber(1234.56)).toBe(1234.56);
  });

  it('should return 0 for NaN number input', () => {
    expect(toNumber(NaN)).toBe(0);
  });

  it('should parse string to number', () => {
    expect(toNumber('1234.56')).toBe(1234.56);
  });

  it('should return 0 for non-numeric string', () => {
    expect(toNumber('abc')).toBe(0);
  });

  it('should return 0 for empty string', () => {
    expect(toNumber('')).toBe(0);
  });

  it('should handle negative number', () => {
    expect(toNumber(-500)).toBe(-500);
  });

  it('should handle negative string', () => {
    expect(toNumber('-500')).toBe(-500);
  });
});

// ============================================================================
// roundCurrency - IEEE 754 safe rounding
// ============================================================================
describe('roundCurrency', () => {
  it('should round 1.005 to 1.01 (not 1.00)', () => {
    expect(roundCurrency(1.005)).toBe(1.01);
  });

  it('should round -1.005 to -1.01', () => {
    expect(roundCurrency(-1.005)).toBe(-1.01);
  });

  it('should return 0 for NaN', () => {
    expect(roundCurrency(NaN)).toBe(0);
  });

  it('should return 0 for Infinity', () => {
    expect(roundCurrency(Infinity)).toBe(0);
  });

  it('should keep exact values unchanged', () => {
    expect(roundCurrency(1.23)).toBe(1.23);
  });
});

// ============================================================================
// parseCurrency - Turkish/English format parsing
// ============================================================================
describe('parseCurrency', () => {
  it('should parse Turkish format "1.234,56"', () => {
    expect(parseCurrency('1.234,56')).toBe(1234.56);
  });

  it('should parse comma decimal "1234,56"', () => {
    expect(parseCurrency('1234,56')).toBe(1234.56);
  });

  it('should parse English format "1234.56"', () => {
    expect(parseCurrency('1234.56')).toBe(1234.56);
  });

  it('should parse Turkish thousand separator "5.000"', () => {
    expect(parseCurrency('5.000')).toBe(5000);
  });

  it('should return NaN for empty string', () => {
    expect(parseCurrency('')).toBeNaN();
  });

  it('should parse plain integer', () => {
    expect(parseCurrency('500')).toBe(500);
  });
});

// ============================================================================
// safeParseAmount - strict amount parsing
// ============================================================================
describe('safeParseAmount', () => {
  it('should parse valid number string', () => {
    expect(safeParseAmount('1234.56')).toBe(1234.56);
  });

  it('should pass through valid number', () => {
    expect(safeParseAmount(1234.56)).toBe(1234.56);
  });

  it('should throw for null', () => {
    expect(() => safeParseAmount(null)).toThrow('null or undefined');
  });

  it('should throw for undefined', () => {
    expect(() => safeParseAmount(undefined)).toThrow('null or undefined');
  });

  it('should throw for non-numeric string', () => {
    expect(() => safeParseAmount('abc')).toThrow('not a valid number');
  });

  it('should throw for Infinity', () => {
    expect(() => safeParseAmount(Infinity)).toThrow('infinite');
  });

  it('should include custom field name in error message', () => {
    expect(() => safeParseAmount(null, 'tutar')).toThrow('Invalid tutar');
  });
});

// ============================================================================
// safeParseExchangeRate - exchange rate validation
// ============================================================================
describe('safeParseExchangeRate', () => {
  it('should return null for null input', () => {
    expect(safeParseExchangeRate(null)).toBeNull();
  });

  it('should return null for undefined input', () => {
    expect(safeParseExchangeRate(undefined)).toBeNull();
  });

  it('should return null for NaN string', () => {
    expect(safeParseExchangeRate('abc')).toBeNull();
  });

  it('should parse valid number', () => {
    expect(safeParseExchangeRate(32.5)).toBe(32.5);
  });

  it('should parse valid string', () => {
    expect(safeParseExchangeRate('32.5')).toBe(32.5);
  });

  it('should throw for zero', () => {
    expect(() => safeParseExchangeRate(0)).toThrow('must be greater than 0');
  });

  it('should throw for negative value', () => {
    expect(() => safeParseExchangeRate(-1)).toThrow('must be greater than 0');
  });

  it('should throw for Infinity', () => {
    expect(() => safeParseExchangeRate(Infinity)).toThrow('infinite');
  });
});

// ============================================================================
// isValidAmount - positive amount validation
// ============================================================================
describe('isValidAmount', () => {
  it('should return true for valid Turkish format', () => {
    expect(isValidAmount('1.234,56')).toBe(true);
  });

  it('should return true for plain number', () => {
    expect(isValidAmount('500')).toBe(true);
  });

  it('should return false for "0"', () => {
    expect(isValidAmount('0')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isValidAmount('')).toBe(false);
  });

  it('should return false for non-numeric string', () => {
    expect(isValidAmount('abc')).toBe(false);
  });

  it('should return false for negative number', () => {
    expect(isValidAmount('-100')).toBe(false);
  });

  it('should return true for small decimal "0,01"', () => {
    expect(isValidAmount('0,01')).toBe(true);
  });
});

// ============================================================================
// isValidBalance - balance validation (allows zero and negatives)
// ============================================================================
describe('isValidBalance', () => {
  it('should return true for positive amount', () => {
    expect(isValidBalance('1.234,56')).toBe(true);
  });

  it('should return true for "0"', () => {
    expect(isValidBalance('0')).toBe(true);
  });

  it('should return true for negative "-500"', () => {
    expect(isValidBalance('-500')).toBe(true);
  });

  it('should return false for empty string', () => {
    expect(isValidBalance('')).toBe(false);
  });

  it('should return false for non-numeric string', () => {
    expect(isValidBalance('abc')).toBe(false);
  });
});

// ============================================================================
// getBalanceInfo - balance label/color mapping
// ============================================================================
describe('getBalanceInfo', () => {
  it('should return "balanced" key for zero balance', () => {
    const info = getBalanceInfo(0, 'musteri');
    expect(info.label).toBe('balanced');
    expect(info.colorType).toBe('secondary');
  });

  it('should return "receivable" key for positive musteri balance', () => {
    const info = getBalanceInfo(100, 'musteri');
    expect(info.label).toBe('receivable');
    expect(info.isPositive).toBe(true);
    expect(info.colorType).toBe('success');
  });

  it('should return "debt" key for negative musteri balance', () => {
    const info = getBalanceInfo(-100, 'musteri');
    expect(info.label).toBe('debt');
    expect(info.isPositive).toBe(false);
    expect(info.colorType).toBe('error');
  });

  it('should return "overpayment" key for positive tedarikci balance', () => {
    const info = getBalanceInfo(100, 'tedarikci');
    expect(info.label).toBe('overpayment');
    expect(info.isPositive).toBe(true);
  });

  it('should return "debt" key for negative tedarikci balance', () => {
    const info = getBalanceInfo(-100, 'tedarikci');
    expect(info.label).toBe('debt');
    expect(info.isPositive).toBe(false);
  });

  it('should return "advance" key for positive personel balance', () => {
    const info = getBalanceInfo(100, 'personel');
    expect(info.label).toBe('advance');
    expect(info.isPositive).toBe(true);
  });

  it('should return "debt" key for negative personel balance', () => {
    const info = getBalanceInfo(-100, 'personel');
    expect(info.label).toBe('debt');
    expect(info.isPositive).toBe(false);
  });
});

// ============================================================================
// calculateBalanceSummary - aggregate balance calculation
// ============================================================================
describe('calculateBalanceSummary', () => {
  it('should calculate receivables and payables correctly', () => {
    const items = [{ balance: 100 }, { balance: -200 }, { balance: 300 }, { balance: -50 }];
    const result = calculateBalanceSummary(items);
    expect(result.receivables).toBe(400);
    expect(result.payables).toBe(250);
    expect(result.net).toBe(150);
  });

  it('should handle empty array', () => {
    const result = calculateBalanceSummary([]);
    expect(result.receivables).toBe(0);
    expect(result.payables).toBe(0);
    expect(result.net).toBe(0);
  });

  it('should handle string balances from database', () => {
    const items = [{ balance: '500.50' }, { balance: '-200' }];
    const result = calculateBalanceSummary(items);
    expect(result.receivables).toBe(500.50);
    expect(result.payables).toBe(200);
    expect(result.net).toBeCloseTo(300.50);
  });

  it('should handle all-positive balances', () => {
    const items = [{ balance: 100 }, { balance: 200 }];
    const result = calculateBalanceSummary(items);
    expect(result.receivables).toBe(300);
    expect(result.payables).toBe(0);
    expect(result.net).toBe(300);
  });

  it('should handle all-negative balances', () => {
    const items = [{ balance: -100 }, { balance: -200 }];
    const result = calculateBalanceSummary(items);
    expect(result.receivables).toBe(0);
    expect(result.payables).toBe(300);
    expect(result.net).toBe(-300);
  });

  it('should skip zero balances', () => {
    const items = [{ balance: 0 }, { balance: 100 }];
    const result = calculateBalanceSummary(items);
    expect(result.receivables).toBe(100);
    expect(result.payables).toBe(0);
  });
});

// ============================================================================
// formatCurrencyInput - live input formatting
// ============================================================================
describe('formatCurrencyInput', () => {
  it('should format "2000" with thousand separator', () => {
    expect(formatCurrencyInput('2000')).toBe('2.000');
  });

  it('should format with decimal "2000,5"', () => {
    expect(formatCurrencyInput('2000,5')).toBe('2.000,5');
  });

  it('should format with two decimals "2000,50"', () => {
    expect(formatCurrencyInput('2000,50')).toBe('2.000,50');
  });

  it('should return empty string for empty input', () => {
    expect(formatCurrencyInput('')).toBe('');
  });

  it('should limit decimal to 2 digits', () => {
    expect(formatCurrencyInput('100,123')).toBe('100,12');
  });

  it('should strip non-numeric characters', () => {
    expect(formatCurrencyInput('abc123')).toBe('123');
  });

  // REGRESYON: 4+ haneli tutar bug'ı — formatlanmış değer tekrar verilince binlik
  // ayracı ondalık sanılıp "1,00"a çevriliyordu. İdempotent olmalı.
  it('idempotent: 4+ haneli formatlanmış değer tekrar verilince değişmez', () => {
    expect(formatCurrencyInput('1000')).toBe('1.000');
    expect(formatCurrencyInput('1.000')).toBe('1.000');
    expect(formatCurrencyInput('10000')).toBe('10.000');
    expect(formatCurrencyInput('10.000')).toBe('10.000');
    expect(formatCurrencyInput('1.234,56')).toBe('1.234,56');
  });
});

// ============================================================================
// unformatCurrencyInput - strip thousand separators
// ============================================================================
describe('unformatCurrencyInput', () => {
  it('should remove dots (thousand separators)', () => {
    expect(unformatCurrencyInput('2.000,50')).toBe('2000,50');
  });

  it('should handle no dots', () => {
    expect(unformatCurrencyInput('500')).toBe('500');
  });

  it('should handle empty string', () => {
    expect(unformatCurrencyInput('')).toBe('');
  });
});

// ============================================================================
// cleanAmountInput - tuş-tuş ham giriş temizleme (binlik at, ondalık max 2)
// ============================================================================
describe('cleanAmountInput (tr-TR varsayılan)', () => {
  it('binlik ayracını atar ve ondalığı 2 haneye kırpar', () => {
    expect(cleanAmountInput('2.000,567')).toBe('2000,56');
    expect(cleanAmountInput('2692,828')).toBe('2692,82');
  });

  it('rakam/ondalık dışı her şeyi siler, yazmaya devam eden girişi bozmaz', () => {
    expect(cleanAmountInput('₺1.234,5 abc')).toBe('1234,5');
    expect(cleanAmountInput('abc')).toBe('');
    expect(cleanAmountInput('')).toBe('');
    // Kullanıcı henüz ondalığı yazmadı: ayraç korunur ki tuş kaybolmasın
    expect(cleanAmountInput('100,')).toBe('100,');
  });

  it('birden fazla ondalık ayracı kırpılır', () => {
    expect(cleanAmountInput('1,2,3')).toBe('1,2');
  });

  it('iki nokta TR locale de binlik sayılıp atılır', () => {
    expect(cleanAmountInput('1.2.3')).toBe('123');
  });

  // REGRESYON (3-ondalık ~1000x): giriş yüzeyleri eskiden ham
  // `text.replace(/[^0-9,.]/g, '')` kullanıyordu; değeri olduğu gibi bıraktığı için
  // parseCurrency TR locale'de noktadan sonraki 3 haneyi binlik ayracı sanıp noktayı
  // siliyor ve tutarı ~1000x şişiriyordu. cleanAmountInput çıktısı en fazla 2 ondalık
  // taşıdığı için parseCurrency'nin o dalı artık hiç tetiklenemez.
  it('çıktısı parseCurrency ile ~1000x şişmez', () => {
    // Tuzağın kendisi (mevcut davranışın belgesi): 3 haneli nokta binlik sanılır
    expect(parseCurrency('2692.828')).toBe(2692828);
    // Temizlenmiş giriş 2 ondalıkta kalır → şişme yok
    expect(parseCurrency(cleanAmountInput('2.692,828'))).toBeCloseTo(2692.82, 2);
    expect(parseCurrency(cleanAmountInput('2692,828'))).toBeCloseTo(2692.82, 2);
  });

  it('idempotent: kendi çıktısı tekrar verilince değişmez', () => {
    expect(cleanAmountInput(cleanAmountInput('2.000,567'))).toBe('2000,56');
  });
});

// ============================================================================
// TOHUM ↔ TEMİZLEYİCİ GİDİŞ-DÖNÜŞÜ  (regresyon kalkanı)
//
// Giriş alanları tuş-tuş cleanAmountInput'tan geçiyor ve o LOCALE ondalığı dışındaki
// her ayracı SİLER (TR'de nokta binlik sayılıp atılır — bu kasıtlı, 1000x tuzağına
// karşı). Dolayısıyla alana PROGRAMLI yazılan (tohumlanan) değer de locale ayracıyla
// yazılmak ZORUNDA. Tohum `.toString()` ile yazılırsa JS her zaman NOKTA basar ve
// kullanıcı alana dokunduğu ilk anda değer 10x/100x şişer.
//
// Bu hata QTB'de (düzenleme tohumu, defaultAmount, ürün toplamı) ÜRETİMDE canlıydı;
// aşağıdaki testler tohum tarafının formatAmountForInput kullanmaya devam etmesini
// garanti eder. Biri tekrar `.toString()`e dönerse bu blok kırılır.
// ============================================================================
describe('tohum ↔ cleanAmountInput gidiş-dönüşü (10x/100x şişme kalkanı)', () => {
  const seedThenTouch = (v: number) => parseCurrency(cleanAmountInput(formatAmountForInput(roundCurrency(v))));

  it('TR locale: tohumlanan değer alana dokunulunca DEĞİŞMEZ', () => {
    expect(seedThenTouch(150.5)).toBeCloseTo(150.5, 2);
    expect(seedThenTouch(489.65)).toBeCloseTo(489.65, 2);
    expect(seedThenTouch(1234.56)).toBeCloseTo(1234.56, 2);
    expect(seedThenTouch(5000)).toBe(5000);
  });

  it('TR locale: YANLIŞ tohum (.toString) şişmeyi GERÇEKTEN üretiyor — testin gerekçesi', () => {
    // Belge amaçlı: düzeltmenin neye karşı olduğunu sabitler.
    expect(parseCurrency(cleanAmountInput(roundCurrency(150.5).toString()))).toBe(1505);
    expect(parseCurrency(cleanAmountInput(roundCurrency(489.65).toString()))).toBe(48965);
  });

  it('en-US locale: aynı gidiş-dönüş bozulmaz', () => {
    setMockCurrency('USD', '$', 'en-US');
    try {
      expect(seedThenTouch(150.5)).toBeCloseTo(150.5, 2);
      expect(seedThenTouch(489.65)).toBeCloseTo(489.65, 2);
      expect(seedThenTouch(5000)).toBe(5000);
    } finally {
      setMockCurrency(TR_DEFAULT.code, TR_DEFAULT.symbol, TR_DEFAULT.locale);
    }
  });
});

// ============================================================================
// Locale-bilinçli giriş/parse (ana para birimi USD/GBP -> en-US/en-GB)
// Bug: ana=USD iken "1234.56" girişi sessizce bozuluyordu (123456'ya şişiyordu)
// ============================================================================
describe('formatAmountForInput (tr-TR varsayılan)', () => {
  it('TRY aktifken eski String(x).replace(".", ",") davranışıyla birebir aynı çıktıyı vermeli', () => {
    expect(formatAmountForInput(5000)).toBe('5000');
    expect(formatAmountForInput(1234.56)).toBe('1234,56');
    expect(formatAmountForInput(43.27, 2)).toBe('43,27');
    expect(formatAmountForInput(0.921659, 6)).toBe('0,921659');
  });

  it('çıktı parseCurrency ile kayıpsız round-trip yapmalı', () => {
    expect(parseCurrency(formatAmountForInput(1234.56))).toBe(1234.56);
    expect(parseCurrency(formatAmountForInput(43.27, 2))).toBe(43.27);
  });
});

describe('en-US locale (ana para birimi USD/GBP)', () => {
  beforeEach(() => setMockCurrency('USD', '$', 'en-US'));
  afterEach(() => setMockCurrency(TR_DEFAULT.code, TR_DEFAULT.symbol, TR_DEFAULT.locale));

  describe('parseCurrency (locale-bağımsız)', () => {
    it('nokta ondalık olarak parse edilmeli', () => {
      expect(parseCurrency('1234.56')).toBe(1234.56);
    });
    it('EN formatı (virgül binlik + nokta ondalık) parse edilmeli', () => {
      expect(parseCurrency('1,234.56')).toBe(1234.56);
    });
    it('TR formatı da (nokta binlik + virgül ondalık) çalışmalı', () => {
      expect(parseCurrency('1.234,56')).toBe(1234.56);
    });
    it('ondalıksız değer', () => {
      expect(parseCurrency('500')).toBe(500);
    });
    it('EN binlik (yalnız virgül) parse edilmeli', () => {
      expect(parseCurrency('1,000')).toBe(1000);
      expect(parseCurrency('2,000')).toBe(2000);
    });

    // Regresyon (v1.4.0 öncesi düzeltme): tek virgül GERÇEK binlik kalıbına
    // uymuyorsa ondalıktır. Eskiden "5,50" → 550 (100x) parse ediliyordu;
    // ExchangeRateBar prefill'i ("43,27") ve virgül-klavyeli giriş DB'ye
    // 100x-1.000.000x bozuk tutar/kur yazıyordu.
    it('binlik kalıbına uymayan virgül ondalık sayılmalı (100x regresyonu)', () => {
      expect(parseCurrency('5,50')).toBe(5.5);
      expect(parseCurrency('43,27')).toBe(43.27);
      expect(parseCurrency('1234,56')).toBe(1234.56);
      expect(parseCurrency('0,921659')).toBe(0.921659);
    });

    it('çoklu gerçek binlik grupları korunmalı', () => {
      expect(parseCurrency('12,345,678')).toBe(12345678);
    });
  });

  describe('formatAmountForInput (en-US)', () => {
    it('ondalık ayraç nokta olmalı ve parseCurrency ile kayıpsız round-trip yapmalı', () => {
      expect(formatAmountForInput(43.27, 2)).toBe('43.27');
      expect(parseCurrency(formatAmountForInput(43.27, 2))).toBe(43.27);
      expect(parseCurrency(formatAmountForInput(0.921659, 6))).toBe(0.921659);
      expect(parseCurrency(formatAmountForInput(4327, 2))).toBe(4327);
    });
  });

  describe('formatCurrencyInput', () => {
    it('binlik ayracı virgül olmalı', () => {
      expect(formatCurrencyInput('2000')).toBe('2,000');
    });
    it('nokta ondalık korunmalı (sessiz bozulma OLMAMALI)', () => {
      expect(formatCurrencyInput('1234.56')).toBe('1,234.56');
    });
    it('ondalık 2 haneyle sınırlı', () => {
      expect(formatCurrencyInput('100.123')).toBe('100.12');
    });
    it('idempotent: "1,000" tekrar formatlanınca değişmez', () => {
      expect(formatCurrencyInput('1000')).toBe('1,000');
      expect(formatCurrencyInput('1,000')).toBe('1,000');
    });
  });

  describe('unformatCurrencyInput', () => {
    it('binlik virgüllerini kaldırmalı, ondalık noktayı korumalı', () => {
      expect(unformatCurrencyInput('2,000.50')).toBe('2000.50');
    });
  });

  describe('cleanAmountInput', () => {
    it('binlik virgülü atılmalı, nokta ondalık 2 haneyle sınırlı olmalı', () => {
      expect(cleanAmountInput('2,000.567')).toBe('2000.56');
      expect(cleanAmountInput('1.2.3')).toBe('1.2');
      // en-* locale'de virgül binliktir → tamamı atılır
      expect(cleanAmountInput('1,2,3')).toBe('123');
    });
  });
});

// ============================================================================
// A10: para birimi → locale TEK eşleme (formatCurrency'nin iki dalı artık ÇELİŞMİYOR)
//
// Eski hâl: ikinci argümanla USD/EUR/GBP → koşulsuz 'en-US'; argümansız dalda ana
// para biriminin locale'i (EUR → de-DE). Ana para birimi EUR olan kullanıcı hesap
// satırında "€1.234,56", grup toplamında "€1,234.56" görüyordu (ayraçlar tam ters).
// Doğru cevap de-DE'dir: giriş katmanı (parseCurrency/cleanAmountInput/
// formatAmountForInput → getLocaleSeparators) EUR için ondalık VİRGÜL varsayıyor.
// ============================================================================
describe('A10: locale eşlemesi tek kaynak', () => {
  afterEach(() => setMockCurrency(TR_DEFAULT.code, TR_DEFAULT.symbol, TR_DEFAULT.locale));

  it('getCurrencyLocale sabit eşlemeyi döndürür', () => {
    expect(getCurrencyLocale('TRY')).toBe('tr-TR');
    expect(getCurrencyLocale('USD')).toBe('en-US');
    expect(getCurrencyLocale('EUR')).toBe('de-DE');
    expect(getCurrencyLocale('GBP')).toBe('en-GB');
    expect(getCurrencyLocale('XAU')).toBe('tr-TR');
  });

  it('kod verilmezse ANA para biriminin locale\'i', () => {
    setMockCurrency('USD', '$', 'en-US');
    expect(getCurrencyLocale()).toBe('en-US');
    expect(getCurrencyLocale(null)).toBe('en-US');
  });

  it('EUR: iki dal da AYNI ayracı basar (nokta binlik + virgül ondalık)', () => {
    // argümanlı dal
    expect(formatCurrency(1234.56, 'EUR')).toBe('€1.234,56');
    // argümansız dal (ana para birimi EUR)
    setMockCurrency('EUR', '€', 'de-DE');
    expect(formatCurrency(1234.56)).toBe('€1.234,56');
  });

  it('USD/GBP: nokta ondalık, virgül binlik (davranış değişmedi)', () => {
    expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
    expect(formatCurrency(1234.56, 'GBP')).toBe('£1,234.56');
  });

  it('TRY: virgül ondalık, nokta binlik (davranış değişmedi)', () => {
    expect(formatCurrency(1234.56, 'TRY')).toBe('₺1.234,56');
  });

  it('getLocaleSeparators para birimine göre de çalışır (parseCurrency ile aynı varsayım)', () => {
    expect(getLocaleSeparators('EUR')).toEqual({ decimal: ',', thousands: '.' });
    expect(getLocaleSeparators('USD')).toEqual({ decimal: '.', thousands: ',' });
  });

  it('formatPercentage ana para biriminin ondalığını kullanır (startsWith(\'tr\') çelişkisi kalktı)', () => {
    expect(formatPercentage(45.5)).toBe('45,5%'); // TRY
    setMockCurrency('EUR', '€', 'de-DE');
    expect(formatPercentage(45.5)).toBe('45,5%'); // de-DE de virgül
    setMockCurrency('USD', '$', 'en-US');
    expect(formatPercentage(45.5)).toBe('45.5%');
  });
});

// ============================================================================
// A5: negatif tutarda işaret KAYBOLMAMALI
// formatCurrency mutlak değer basar (bilinçli: yön kelimesi öne yazıldığında
// "Borç -₺500" daha kötü okunur). Net/fark kolonları bu yüzden işaretli
// varyantı kullanmak ZORUNDA — aksi halde −50.000 ile +50.000 aynı metin.
// ============================================================================
describe('A5: işaretli para formatı', () => {
  it('formatCurrency mutlak değer basar (sözleşme sabit)', () => {
    expect(formatCurrency(-1234.56, 'TRY')).toBe('₺1.234,56');
  });

  it('formatCurrencyWithSign iki yönde de işaret koyar', () => {
    expect(formatCurrencyWithSign(1234.56, 'TRY')).toBe('+₺1.234,56');
    expect(formatCurrencyWithSign(-1234.56, 'TRY')).toBe('-₺1.234,56');
  });

  it('formatCurrencyCompact eksiyi KORUR (eskiden Math.abs ile siliniyordu)', () => {
    expect(formatCurrencyCompact(-1_234_567, 'TRY')).toBe('-₺1,2M');
    expect(formatCurrencyCompact(1_234_567, 'TRY')).toBe('₺1,2M');
    expect(formatCurrencyCompact(-12_345, 'TRY')).toBe('-₺12,3K');
  });

  it('formatCurrencyCompact ayracı da tek eşlemeden alır', () => {
    expect(formatCurrencyCompact(1_234_567, 'EUR')).toBe('€1,2M');
    expect(formatCurrencyCompact(1_234_567, 'USD')).toBe('$1.2M');
  });
});
