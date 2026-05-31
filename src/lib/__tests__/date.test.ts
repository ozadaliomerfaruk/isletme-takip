/**
 * Date utility tests - Bug #3
 */

jest.mock('@/hooks/useSettings', () => ({
  getCurrentCurrency: () => ({ code: 'TRY', symbol: '₺', locale: 'tr-TR' }),
  getCurrentDateFormat: () => ({ code: 'DMY', example: '31/12/2024', separator: '/' }),
}));

jest.mock('i18next', () => ({
  t: (key: string, opts?: Record<string, unknown>) => {
    if (opts?.returnObjects) return undefined;
    return key;
  },
  language: 'tr',
}));

import {
  getDateRange,
  formatDateForDB,
  formatDateTimeForDB,
  parseDateFromDB,
  isSameDay,
  isToday,
  isDateInRange,
  compareDates,
  addMonths,
  addDays,
  ensureValidDate,
  getMonthRange,
  getYearRange,
  formatDateShort,
} from '../date';

// ============================================================================
// Bug #3: Hafta hesaplama Monday-start varsayımı
// ============================================================================
describe('Bug #3: getDateRange - weekly', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return Monday-Sunday range when today is Wednesday', () => {
    jest.useFakeTimers();
    // Feb 11, 2026 = Wednesday
    jest.setSystemTime(new Date(2026, 1, 11, 12, 0, 0));

    const range = getDateRange('weekly', 0);
    expect(range.startDate).toBe('2026-02-09'); // Monday
    expect(range.endDate).toBe('2026-02-15');   // Sunday
  });

  it('should handle Sunday correctly (map to previous week)', () => {
    jest.useFakeTimers();
    // Feb 8, 2026 = Sunday
    jest.setSystemTime(new Date(2026, 1, 8, 12, 0, 0));

    const range = getDateRange('weekly', 0);
    expect(range.startDate).toBe('2026-02-02'); // Previous Monday
    expect(range.endDate).toBe('2026-02-08');   // This Sunday
  });

  it('should handle Monday correctly (start of week)', () => {
    jest.useFakeTimers();
    // Feb 9, 2026 = Monday
    jest.setSystemTime(new Date(2026, 1, 9, 12, 0, 0));

    const range = getDateRange('weekly', 0);
    expect(range.startDate).toBe('2026-02-09'); // This Monday
    expect(range.endDate).toBe('2026-02-15');   // This Sunday
  });

  it('should handle Saturday correctly (end-1 of week)', () => {
    jest.useFakeTimers();
    // Feb 14, 2026 = Saturday
    jest.setSystemTime(new Date(2026, 1, 14, 12, 0, 0));

    const range = getDateRange('weekly', 0);
    expect(range.startDate).toBe('2026-02-09'); // This Monday
    expect(range.endDate).toBe('2026-02-15');   // This Sunday
  });

  it('should handle negative offset (previous week)', () => {
    jest.useFakeTimers();
    // Feb 11, 2026 = Wednesday
    jest.setSystemTime(new Date(2026, 1, 11, 12, 0, 0));

    const range = getDateRange('weekly', -1);
    expect(range.startDate).toBe('2026-02-02'); // Previous Monday
    expect(range.endDate).toBe('2026-02-08');   // Previous Sunday
  });

  it('should handle positive offset (next week)', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 1, 11, 12, 0, 0));

    const range = getDateRange('weekly', 1);
    expect(range.startDate).toBe('2026-02-16'); // Next Monday
    expect(range.endDate).toBe('2026-02-22');   // Next Sunday
  });

  it('weekly range should always be 7 days', () => {
    jest.useFakeTimers();
    // Test multiple dates
    const testDates = [
      new Date(2026, 0, 1),  // Thursday
      new Date(2026, 0, 4),  // Sunday
      new Date(2026, 0, 5),  // Monday
      new Date(2026, 5, 15), // Monday
      new Date(2026, 11, 31), // Thursday
    ];

    for (const date of testDates) {
      jest.setSystemTime(date);
      const range = getDateRange('weekly', 0);
      const start = new Date(range.startDate);
      const end = new Date(range.endDate);
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(6); // Monday to Sunday = 6 days difference
    }
  });
});

// ============================================================================
// formatDateForDB
// ============================================================================
describe('formatDateForDB', () => {
  it('should format a normal date as YYYY-MM-DD', () => {
    expect(formatDateForDB(new Date(2026, 5, 15))).toBe('2026-06-15');
  });

  it('should zero-pad single-digit month and day', () => {
    expect(formatDateForDB(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  it('should handle Dec 31 correctly', () => {
    expect(formatDateForDB(new Date(2025, 11, 31))).toBe('2025-12-31');
  });

  // 1970 "yapışan tarih" regresyon korumasi: geçersiz tarih ASLA 'NaN-NaN-NaN'
  // üretmemeli (aksi halde AsyncStorage'a yazılıp tüm datepickerlara yayılıyordu).
  it('geçersiz tarih için NaN-NaN-NaN üretmez (bugüne düşer)', () => {
    const result = formatDateForDB(new Date('not-a-date'));
    expect(result).not.toContain('NaN');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('epoch (1970) tarihi bugüne düşer', () => {
    const result = formatDateForDB(new Date(0));
    expect(result.startsWith('1970')).toBe(false);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ============================================================================
// formatDateTimeForDB
// ============================================================================
describe('formatDateTimeForDB', () => {
  it('should match ISO 8601 pattern with timezone', () => {
    const result = formatDateTimeForDB(new Date(2026, 5, 15, 14, 30, 45));
    // Pattern: YYYY-MM-DDTHH:MM:SS±HH:MM
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(result).toContain('2026-06-15T14:30:45');
  });

  it('geçersiz tarih için NaN üretmez (bugüne düşer)', () => {
    const result = formatDateTimeForDB(new Date('invalid'));
    expect(result).not.toContain('NaN');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
});

// ============================================================================
// parseDateFromDB
// ============================================================================
describe('parseDateFromDB', () => {
  it('should parse "2026-06-15" to correct Date', () => {
    const d = parseDateFromDB('2026-06-15');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // 0-indexed
    expect(d.getDate()).toBe(15);
  });

  it('should parse ISO timestamp with T', () => {
    const d = parseDateFromDB('2026-06-15T14:30:00.000Z');
    expect(d.getFullYear()).toBe(2026);
  });

  it('should return today for empty string', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 1, 11));
    const d = parseDateFromDB('');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1);
    jest.useRealTimers();
  });

  it('should return today for invalid date string', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 1, 11));
    const d = parseDateFromDB('not-a-date');
    expect(d.getFullYear()).toBe(2026);
    jest.useRealTimers();
  });

  it('should return today for out-of-range year (<1900)', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 1, 11));
    const d = parseDateFromDB('1800-01-01');
    expect(d.getFullYear()).toBe(2026);
    jest.useRealTimers();
  });
});

// ============================================================================
// isSameDay
// ============================================================================
describe('isSameDay', () => {
  it('should return true for same day with different times', () => {
    const d1 = new Date(2026, 5, 15, 8, 0, 0);
    const d2 = new Date(2026, 5, 15, 23, 59, 59);
    expect(isSameDay(d1, d2)).toBe(true);
  });

  it('should return false for different days', () => {
    const d1 = new Date(2026, 5, 15);
    const d2 = new Date(2026, 5, 16);
    expect(isSameDay(d1, d2)).toBe(false);
  });

  it('should accept string inputs', () => {
    expect(isSameDay('2026-06-15', '2026-06-15')).toBe(true);
    expect(isSameDay('2026-06-15', '2026-06-16')).toBe(false);
  });

  it('should handle mixed Date and string inputs', () => {
    expect(isSameDay(new Date(2026, 5, 15), '2026-06-15')).toBe(true);
  });
});

// ============================================================================
// isToday
// ============================================================================
describe('isToday', () => {
  afterEach(() => jest.useRealTimers());

  it('should return true for today', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
    expect(isToday(new Date(2026, 5, 15, 8, 30, 0))).toBe(true);
  });

  it('should return false for yesterday', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
    expect(isToday(new Date(2026, 5, 14))).toBe(false);
  });

  it('should accept string input', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
    expect(isToday('2026-06-15')).toBe(true);
  });
});

// ============================================================================
// isDateInRange
// ============================================================================
describe('isDateInRange', () => {
  const start = new Date(2026, 5, 10);
  const end = new Date(2026, 5, 20);

  it('should return true for date inside range', () => {
    expect(isDateInRange(new Date(2026, 5, 15), start, end)).toBe(true);
  });

  it('should return true for date at start boundary', () => {
    expect(isDateInRange(new Date(2026, 5, 10), start, end)).toBe(true);
  });

  it('should return true for date at end boundary', () => {
    expect(isDateInRange(new Date(2026, 5, 20), start, end)).toBe(true);
  });

  it('should return false for date before range', () => {
    expect(isDateInRange(new Date(2026, 5, 9), start, end)).toBe(false);
  });

  it('should return false for date after range', () => {
    expect(isDateInRange(new Date(2026, 5, 21), start, end)).toBe(false);
  });
});

// ============================================================================
// compareDates
// ============================================================================
describe('compareDates', () => {
  it('should return negative when date1 < date2', () => {
    expect(compareDates(new Date(2026, 0, 1), new Date(2026, 0, 2))).toBeLessThan(0);
  });

  it('should return positive when date1 > date2', () => {
    expect(compareDates(new Date(2026, 0, 2), new Date(2026, 0, 1))).toBeGreaterThan(0);
  });

  it('should return zero for equal dates', () => {
    const d = new Date(2026, 5, 15, 12, 0, 0);
    expect(compareDates(d, new Date(d))).toBe(0);
  });
});

// ============================================================================
// addMonths
// ============================================================================
describe('addMonths', () => {
  it('should add months correctly', () => {
    const result = addMonths(new Date(2026, 0, 15), 3);
    expect(result.getMonth()).toBe(3);
    expect(result.getDate()).toBe(15);
  });

  it('should subtract months with negative value', () => {
    const result = addMonths(new Date(2026, 5, 15), -2);
    expect(result.getMonth()).toBe(3);
  });

  it('should clamp day when target month is shorter (Jan 31 + 1 month)', () => {
    const result = addMonths(new Date(2026, 0, 31), 1);
    // Feb doesn't have 31 days → should clamp to Feb 28
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(28);
  });

  it('should accept string input', () => {
    const result = addMonths('2026-06-15', 1);
    expect(result.getMonth()).toBe(6); // July
    expect(result.getDate()).toBe(15);
  });
});

// ============================================================================
// addDays
// ============================================================================
describe('addDays', () => {
  it('should add days across month boundary', () => {
    const result = addDays(new Date(2026, 0, 30), 3);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(2);
  });

  it('should subtract days', () => {
    const result = addDays(new Date(2026, 5, 15), -5);
    expect(result.getDate()).toBe(10);
  });

  it('should accept string input', () => {
    const result = addDays('2026-06-15', 1);
    expect(result.getDate()).toBe(16);
  });
});

// ============================================================================
// ensureValidDate
// ============================================================================
describe('ensureValidDate', () => {
  afterEach(() => jest.useRealTimers());

  it('should return the same date for a valid date', () => {
    const d = new Date(2026, 5, 15);
    expect(ensureValidDate(d)).toBe(d);
  });

  it('should return today for null', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 1, 11));
    const result = ensureValidDate(null);
    expect(result.getFullYear()).toBe(2026);
  });

  it('should return today for undefined', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 1, 11));
    const result = ensureValidDate(undefined);
    expect(result.getFullYear()).toBe(2026);
  });

  it('should return today for Invalid Date', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 1, 11));
    const result = ensureValidDate(new Date('invalid'));
    expect(result.getFullYear()).toBe(2026);
  });

  it('should return today for year < 1900', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 1, 11));
    const result = ensureValidDate(new Date(1800, 0, 1));
    expect(result.getFullYear()).toBe(2026);
  });
});

// ============================================================================
// getMonthRange
// ============================================================================
describe('getMonthRange', () => {
  it('should return correct range for June 2026', () => {
    const range = getMonthRange(new Date(2026, 5, 15));
    expect(range.startDate).toBe('2026-06-01');
    expect(range.endDate).toBe('2026-06-30');
  });

  it('should return correct range for February (non-leap year)', () => {
    const range = getMonthRange(new Date(2026, 1, 10));
    expect(range.startDate).toBe('2026-02-01');
    expect(range.endDate).toBe('2026-02-28');
  });
});

// ============================================================================
// getYearRange
// ============================================================================
describe('getYearRange', () => {
  it('should return Jan 1 to Dec 31 for given year', () => {
    const range = getYearRange(2026);
    expect(range.startDate).toBe('2026-01-01');
    expect(range.endDate).toBe('2026-12-31');
    expect(range.label).toBe('2026');
  });
});

// ============================================================================
// formatDateShort
// ============================================================================
describe('formatDateShort', () => {
  it('should format date as DD/MM/YYYY in DMY mode', () => {
    // Mock returns DMY format
    expect(formatDateShort(new Date(2026, 11, 5))).toBe('05/12/2026');
  });

  it('should accept string input', () => {
    expect(formatDateShort('2026-06-15')).toBe('15/06/2026');
  });
});
