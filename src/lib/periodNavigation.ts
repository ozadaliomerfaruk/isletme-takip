const DAY_MS = 24 * 60 * 60 * 1000;

function civilDayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS,
  );
}

function startOfMondayWeek(date: Date): Date {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + mondayOffset);
}

/**
 * Haftalık raporda ay seçildiğinde o ayın içinde başlayan ilk tam haftaya gider.
 *
 * Eski hesap, ayın ilk günü ile bugünün arasındaki günü 7'ye bölüp aşağı
 * yuvarlıyordu. Haftanın hangi gününde olunduğuna ve yaz/kış saati geçişine göre
 * bir önceki/sonraki haftaya kayabiliyordu. Burada iki gerçek Pazartesi arasındaki
 * takvim haftası farkı kullanılır.
 */
export function getWeeklyOffsetForMonth(
  year: number,
  month: number,
  referenceDate: Date = new Date(),
): number {
  const firstDay = new Date(year, month, 1);
  const daysUntilMonday = (8 - firstDay.getDay()) % 7;
  const firstMondayInMonth = new Date(year, month, 1 + daysUntilMonday);
  const currentMonday = startOfMondayWeek(referenceDate);

  return Math.round(
    (civilDayNumber(firstMondayInMonth) - civilDayNumber(currentMonday)) / 7,
  );
}
