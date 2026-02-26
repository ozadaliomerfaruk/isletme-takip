/**
 * useReportRouteState - Detay rapor sayfalari icin ortak state hook.
 *
 * Router params'tan period/dateRange'i parse eder,
 * local state olarak yonetir ve params'i sync eder.
 */

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { PeriodType } from '@/hooks/useIslemler';
import { useDateFormat } from '@/hooks/useDateFormat';
import { formatDateForDB, parseDateFromDB } from '@/lib/date';

export function useReportRouteState() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    period?: string;
    periodOffset?: string;
    startDate?: string;
    endDate?: string;
  }>();
  const { getDateRangeLabel, locale, formatDateNative } = useDateFormat();

  // Parse params safely
  const initialPeriod = (String(params.period || 'monthly')) as PeriodType;
  const initialOffset = Number(params.periodOffset || '0') || 0;

  const [period, setPeriod] = useState<PeriodType>(initialPeriod);
  const [periodOffset, setPeriodOffset] = useState(initialOffset);

  // Custom range state (only used when period === 'custom')
  const [customStartDate, setCustomStartDate] = useState<Date>(() => {
    if (params.startDate) {
      const d = parseDateFromDB(String(params.startDate));
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });
  const [customEndDate, setCustomEndDate] = useState<Date>(() => {
    if (params.endDate) {
      const d = parseDateFromDB(String(params.endDate));
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });

  // Calculate dateRange
  const customRange = useMemo(
    () =>
      period === 'custom'
        ? {
            startDate: formatDateForDB(customStartDate),
            endDate: formatDateForDB(customEndDate),
          }
        : undefined,
    [period, customStartDate, customEndDate]
  );

  const { startDate, endDate, label: periodLabel } = getDateRangeLabel(
    period,
    periodOffset,
    customRange
  );

  const dateRange = useMemo(
    () => ({ startDate, endDate }),
    [startDate, endDate]
  );

  // Sync params when period/offset changes (for back-navigation sync)
  // Only depend on period + periodOffset to avoid infinite loop:
  // setParams -> useLocalSearchParams update -> derived startDate/endDate change -> setParams again
  useEffect(() => {
    router.setParams({
      period,
      periodOffset: String(periodOffset),
      startDate,
      endDate,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, periodOffset]);

  return {
    period,
    setPeriod,
    periodOffset,
    setPeriodOffset,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    dateRange,
    periodLabel,
    locale,
    formatDateNative,
  };
}
