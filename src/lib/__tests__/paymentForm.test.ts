/**
 * Payment form Zod schema tests
 *
 * Tests all 9 transaction form schemas: validation rules,
 * required field checks, and cross-field validations.
 */

// Mock transitive dependencies (parseCurrency uses these)
jest.mock('@/hooks/useSettings', () => ({
  getCurrentCurrency: () => ({ code: 'TRY', symbol: '₺', locale: 'tr-TR' }),
  getCurrentDateFormat: () => ({ code: 'DMY', example: '31/12/2024', separator: '/' }),
}));

jest.mock('@/constants/currencies', () => ({
  getCurrencySymbol: (code: string) => {
    const symbols: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };
    return symbols[code] || code;
  },
  isPreciousMetal: () => false,
}));

import {
  personelOdemeSchema,
  cariOdemeSchema,
  transferSchema,
  cariTahsilatSchema,
  cariAlisSchema,
  cariSatisSchema,
  personelGiderSchema,
  gelirSchema,
  giderSchema,
} from '../schemas/paymentForm';

/** Build a valid base form data object with optional overrides */
function validBase(overrides: Record<string, unknown> = {}) {
  return {
    amount: '1.000',
    description: '',
    selectedDate: new Date(),
    isIleriTarihli: false,
    reminderConfig: { enabled: false, daysBefore: 0, time: '09:00' },
    ...overrides,
  };
}

function findIssue(result: { success: false; error: { issues: Array<{ message: string; path: (string | number)[] }> } }, message: string) {
  return result.error.issues.find((i) => i.message === message);
}

// ============================================================================
// currencyAmount refinement (shared across all schemas)
// ============================================================================
describe('currencyAmount refinement', () => {
  // Use gelirSchema as the test vehicle (simplest: just hesapId + kategoriId)
  const parse = (amount: string) =>
    gelirSchema.safeParse(validBase({ amount, hesapId: 'h1', kategoriId: 'k1' }));

  it('should accept valid Turkish format "1.234,56"', () => {
    expect(parse('1.234,56').success).toBe(true);
  });

  it('should accept plain number "500"', () => {
    expect(parse('500').success).toBe(true);
  });

  it('should reject "0"', () => {
    expect(parse('0').success).toBe(false);
  });

  it('should reject empty string', () => {
    expect(parse('').success).toBe(false);
  });

  it('should reject non-numeric string', () => {
    expect(parse('abc').success).toBe(false);
  });
});

// ============================================================================
// validateFutureDate (tested via personelOdemeSchema)
// ============================================================================
describe('validateFutureDate', () => {
  const parse = (isIleriTarihli: boolean, selectedDate: Date) =>
    personelOdemeSchema.safeParse(
      validBase({ isIleriTarihli, selectedDate, personelId: 'p1', hesapId: 'h1', kategoriId: 'k1' })
    );

  it('should pass when isIleriTarihli is false even with past date', () => {
    expect(parse(false, new Date(2020, 0, 1)).success).toBe(true);
  });

  it('should fail when isIleriTarihli is true and date is in the past', () => {
    const result = parse(true, new Date(2020, 0, 1));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(findIssue(result, 'futureDateRequired')).toBeDefined();
    }
  });

  it('should fail when isIleriTarihli is true and date is today', () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    expect(parse(true, today).success).toBe(false);
  });

  it('should pass when isIleriTarihli is true and date is in the future', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(parse(true, future).success).toBe(true);
  });
});

// ============================================================================
// transferSchema - same account validation
// ============================================================================
describe('transferSchema', () => {
  it('should fail when source and target accounts are the same', () => {
    const result = transferSchema.safeParse(
      validBase({ kaynakHesapId: 'h1', hedefHesapId: 'h1' })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(findIssue(result, 'sameAccountError')).toBeDefined();
    }
  });

  it('should pass when source and target accounts are different', () => {
    const result = transferSchema.safeParse(
      validBase({ kaynakHesapId: 'h1', hedefHesapId: 'h2' })
    );
    expect(result.success).toBe(true);
  });

  it('should fail when kaynakHesapId is null', () => {
    const result = transferSchema.safeParse(
      validBase({ kaynakHesapId: null, hedefHesapId: 'h2' })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(findIssue(result, 'selectSourceAccount')).toBeDefined();
    }
  });

  it('should fail when hedefHesapId is null', () => {
    const result = transferSchema.safeParse(
      validBase({ kaynakHesapId: 'h1', hedefHesapId: null })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(findIssue(result, 'selectTargetAccount')).toBeDefined();
    }
  });
});

// ============================================================================
// personelOdemeSchema - required fields
// ============================================================================
describe('personelOdemeSchema', () => {
  it('should fail when personelId is null', () => {
    const result = personelOdemeSchema.safeParse(
      validBase({ personelId: null, hesapId: 'h1', kategoriId: 'k1' })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(findIssue(result, 'selectPersonel')).toBeDefined();
    }
  });

  it('should fail when hesapId is null', () => {
    const result = personelOdemeSchema.safeParse(
      validBase({ personelId: 'p1', hesapId: null, kategoriId: 'k1' })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(findIssue(result, 'selectPaymentAccount')).toBeDefined();
    }
  });

  it('should pass with all fields valid', () => {
    const result = personelOdemeSchema.safeParse(
      validBase({ personelId: 'p1', hesapId: 'h1', kategoriId: 'k1' })
    );
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Each schema: required entity field validation
// ============================================================================
describe('cariOdemeSchema', () => {
  it('should fail when cariId is null', () => {
    const result = cariOdemeSchema.safeParse(
      validBase({ cariId: null, hesapId: 'h1', kategoriId: 'k1' })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(findIssue(result, 'selectSupplier')).toBeDefined();
    }
  });
});

describe('cariTahsilatSchema', () => {
  it('should fail when cariId is null', () => {
    const result = cariTahsilatSchema.safeParse(
      validBase({ cariId: null, hesapId: 'h1' })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(findIssue(result, 'selectCustomer')).toBeDefined();
    }
  });

  it('should fail when hesapId is null', () => {
    const result = cariTahsilatSchema.safeParse(
      validBase({ cariId: 'c1', hesapId: null })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(findIssue(result, 'selectCollectionAccount')).toBeDefined();
    }
  });
});

describe('cariAlisSchema', () => {
  it('should fail when cariId is null', () => {
    const result = cariAlisSchema.safeParse(
      validBase({ cariId: null, kategoriId: 'k1' })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(findIssue(result, 'selectSupplier')).toBeDefined();
    }
  });
});

describe('cariSatisSchema', () => {
  it('should fail when cariId is null', () => {
    const result = cariSatisSchema.safeParse(
      validBase({ cariId: null, kategoriId: 'k1' })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(findIssue(result, 'selectCustomer')).toBeDefined();
    }
  });
});

describe('personelGiderSchema', () => {
  it('should fail when personelId is null', () => {
    const result = personelGiderSchema.safeParse(
      validBase({ personelId: null, kategoriId: 'k1' })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(findIssue(result, 'selectPersonel')).toBeDefined();
    }
  });
});

describe('gelirSchema', () => {
  it('should fail when hesapId is null', () => {
    const result = gelirSchema.safeParse(
      validBase({ hesapId: null, kategoriId: 'k1' })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(findIssue(result, 'selectAccount')).toBeDefined();
    }
  });
});

describe('giderSchema', () => {
  it('should fail when hesapId is null', () => {
    const result = giderSchema.safeParse(
      validBase({ hesapId: null, kategoriId: 'k1' })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(findIssue(result, 'selectAccount')).toBeDefined();
    }
  });
});
