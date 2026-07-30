import type { DateRange } from '@/types/analytics';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CustomTrendPeriod {
  offset: number;
  startDate: string;
  endDate: string;
  label: string;
}

function parseIsoDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

function formatIsoDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function formatBucketLabel(startTimestamp: number, endTimestamp: number): string {
  const start = new Date(startTimestamp);
  const end = new Date(endTimestamp);
  const startDay = start.getUTCDate();
  const startMonth = start.getUTCMonth() + 1;
  const endDay = end.getUTCDate();
  const endMonth = end.getUTCMonth() + 1;

  if (startTimestamp === endTimestamp) {
    return `${startDay}/${startMonth}`;
  }
  if (startMonth === endMonth) {
    return `${startDay}-${endDay}/${startMonth}`;
  }
  return `${startDay}/${startMonth}-${endDay}/${endMonth}`;
}

/**
 * Özel tarih aralığını en fazla altı, kesintisiz ve çakışmayan grafik dilimine böler.
 * UTC gün hesabı kullanıldığı için yaz/kış saati geçişleri bir günlük kayma üretmez.
 */
export function buildCustomTrendPeriods(
  range: DateRange,
  maxPeriods = 6,
): CustomTrendPeriod[] {
  const startTimestamp = parseIsoDay(range.startDate);
  const endTimestamp = parseIsoDay(range.endDate);
  if (
    startTimestamp === null
    || endTimestamp === null
    || startTimestamp > endTimestamp
    || !Number.isInteger(maxPeriods)
    || maxPeriods < 1
  ) {
    return [];
  }

  const totalDays = Math.floor((endTimestamp - startTimestamp) / DAY_MS) + 1;
  const periodCount = Math.min(maxPeriods, totalDays);

  return Array.from({ length: periodCount }, (_, index) => {
    const startDayIndex = Math.floor((index * totalDays) / periodCount);
    const nextStartDayIndex = Math.floor(((index + 1) * totalDays) / periodCount);
    const bucketStart = startTimestamp + startDayIndex * DAY_MS;
    const bucketEnd = startTimestamp + (nextStartDayIndex - 1) * DAY_MS;

    return {
      offset: index - (periodCount - 1),
      startDate: formatIsoDay(bucketStart),
      endDate: formatIsoDay(bucketEnd),
      label: formatBucketLabel(bucketStart, bucketEnd),
    };
  });
}
