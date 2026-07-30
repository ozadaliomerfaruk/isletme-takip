import {
  isAllowedPublicStatementDuration,
  OWNER_PUBLIC_STATEMENT_DURATIONS,
  SHARED_PUBLIC_STATEMENT_DURATIONS,
} from '../publicStatementExpiry';

describe('public ekstre geçerlilik sınırı', () => {
  it('ortak kullanıcıyı 1, 7 ve 30 günle sınırlar', () => {
    expect(SHARED_PUBLIC_STATEMENT_DURATIONS).toEqual([1, 7, 30]);
    expect(isAllowedPublicStatementDuration(1, false)).toBe(true);
    expect(isAllowedPublicStatementDuration(30, false)).toBe(true);
    expect(isAllowedPublicStatementDuration(365, false)).toBe(false);
  });

  it('owner için 365 günü açar ama süresiz değeri reddeder', () => {
    expect(OWNER_PUBLIC_STATEMENT_DURATIONS).toEqual([1, 7, 30, 365]);
    expect(isAllowedPublicStatementDuration(365, true)).toBe(true);
    expect(isAllowedPublicStatementDuration(null, true)).toBe(false);
    expect(isAllowedPublicStatementDuration(36500, true)).toBe(false);
  });

  it('bozuk tipleri fail-closed reddeder', () => {
    for (const value of [undefined, '30', 0, -1, 31, Number.NaN]) {
      expect(isAllowedPublicStatementDuration(value, true)).toBe(false);
    }
  });
});
