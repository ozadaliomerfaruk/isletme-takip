/**
 * Date utility tests - Bug #3
 */

jest.mock('@/hooks/useSettings', () => ({
  getCurrentCurrency: () => ({ code: 'TRY', symbol: '₺', locale: 'tr-TR' }),
  getCurrentDateFormat: () => ({ code: 'DMY', example: '31/12/2024', separator: '/' }),
}));

jest.mock('i18next', () => ({
  t: (key: string, opts?: any) => {
    if (opts?.returnObjects) return undefined;
    return key;
  },
  language: 'tr',
}));

import { getDateRange } from '../date';

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
