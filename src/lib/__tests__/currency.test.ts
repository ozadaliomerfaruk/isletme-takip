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

import { calculateTargetAmount } from '../currency';

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
