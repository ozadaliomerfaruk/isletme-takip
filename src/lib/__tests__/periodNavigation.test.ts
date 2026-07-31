import { getWeeklyOffsetForMonth } from '../periodNavigation';

describe('haftalık rapor ay seçimi', () => {
  it('seçilen ayın içinde başlayan ilk Pazartesi haftasına gider', () => {
    // Referans hafta: 27 Temmuz 2026 Pazartesi.
    const reference = new Date(2026, 6, 30);

    // Ağustos 2026 Cumartesi başlar; ilk tam hafta 3 Ağustos Pazartesi.
    expect(getWeeklyOffsetForMonth(2026, 7, reference)).toBe(1);
    // Temmuzun ilk Pazartesisi 6 Temmuz, referans haftadan üç hafta önce.
    expect(getWeeklyOffsetForMonth(2026, 6, reference)).toBe(-3);
  });

  it('yıl sınırında haftayı bir ay ileri/geri kaydırmaz', () => {
    // Referans hafta 28 Aralık 2026 Pazartesi.
    const reference = new Date(2026, 11, 30);

    // Ocak 2027'nin ilk Pazartesisi 4 Ocak.
    expect(getWeeklyOffsetForMonth(2027, 0, reference)).toBe(1);
    // Aralık 2026'nın ilk Pazartesisi 7 Aralık.
    expect(getWeeklyOffsetForMonth(2026, 11, reference)).toBe(-3);
  });

  it('yaz/kış saati farkından etkilenmeden tam hafta farkı döndürür', () => {
    const reference = new Date(2026, 2, 25);
    const offset = getWeeklyOffsetForMonth(2026, 10, reference);

    expect(Number.isInteger(offset)).toBe(true);
  });
});
