/**
 * Currency utility tests - Bugs #5, #6, #7
 */

// Mock useSettings before importing currency
jest.mock('@/hooks/useSettings', () => ({
  getCurrentCurrency: () => ({ code: 'TRY', symbol: '₺', locale: 'tr-TR' }),
  getCurrentDateFormat: () => ({ code: 'DMY', example: '31/12/2024', separator: '/' }),
}));

jest.mock('@/constants/currencies', () => ({
  getCurrencySymbol: (code: string) => {
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
  isValidAmount,
  isValidBalance,
  getBalanceInfo,
  calculateBalanceSummary,
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
