import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import {
  createHistoricalReportLensConverter,
  turkeyIsoDay,
  type DailyReportIndicatorRow,
  type HistoricalReportLensConverter,
  type IncomeExpenseLens,
  type MonthlyReportIndicatorRow,
} from '@/lib/reportLens';

const DAY_MS = 24 * 60 * 60 * 1000;
const QUERY_META = {
  persist: false,
  query_purpose: 'reports:historical-lens-rates-v1',
} as const;

function shiftDay(value: string, days: number): string {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function shiftMonthStart(value: string, months: number): string {
  const [year, month] = String(value).slice(0, 7).split('-').map(Number);
  if (!year || !month) return '';
  return new Date(Date.UTC(year, month - 1 + months, 1))
    .toISOString()
    .slice(0, 10);
}

function capAtDay(value: string, ceiling: string): string {
  const day = String(value).slice(0, 10);
  return day > ceiling ? ceiling : day;
}

export interface HistoricalReportLensData {
  convert: HistoricalReportLensConverter | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Bir detay ekranının bütün işlem satırları için kur/TÜFE verisini iki toplu
 * sorguda getirir. Satır başına sorgu yapmaz; dönüşüm tamamen bellekte yapılır.
 */
export function useHistoricalReportLens(
  lens: IncomeExpenseLens,
  startDate: string,
  endDate: string,
): HistoricalReportLensData {
  const enabled = lens !== 'nominal' && !!startDate && !!endDate;
  const currentDay = turkeyIsoDay();
  const effectiveStart = capAtDay(startDate, currentDay);
  const effectiveEnd = capAtDay(endDate, currentDay);
  const dailyStart = shiftDay(effectiveStart, -7);
  const dailyEnd = effectiveEnd;
  const monthlyStart = shiftMonthStart(effectiveStart, -2);
  const monthlyEnd = shiftMonthStart(currentDay, 0);

  const dailyQuery = useQuery({
    queryKey: queryKeys.reports.dailyEconomicIndicators(dailyStart, dailyEnd),
    queryFn: async (): Promise<DailyReportIndicatorRow[]> => {
      const { data, error } = await supabase
        .from('ekonomik_gostergeler_gunluk')
        .select('gun, usd_try, eur_try, gbp_try, gram_altin_try, gram_gumus_try')
        .gte('gun', dailyStart)
        .lte('gun', dailyEnd)
        .order('gun', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DailyReportIndicatorRow[];
    },
    enabled,
    staleTime: 12 * 60 * 60 * 1000,
    meta: QUERY_META,
  });

  const monthlyQuery = useQuery({
    queryKey: queryKeys.reports.reportLensMonthlyIndicators(monthlyStart, monthlyEnd),
    queryFn: async (): Promise<MonthlyReportIndicatorRow[]> => {
      const { data, error } = await supabase
        .from('ekonomik_gostergeler')
        .select('ay, tufe')
        .gte('ay', monthlyStart)
        .lte('ay', monthlyEnd)
        .order('ay', { ascending: true });
      if (error) throw error;
      return (data ?? []) as MonthlyReportIndicatorRow[];
    },
    enabled: enabled && lens === 'reel',
    staleTime: 12 * 60 * 60 * 1000,
    meta: QUERY_META,
  });

  const convert = useMemo<HistoricalReportLensConverter | null>(() => {
    if (!enabled || !dailyQuery.data) return null;
    if (lens === 'reel' && !monthlyQuery.data) return null;
    return createHistoricalReportLensConverter(
      lens,
      dailyQuery.data,
      monthlyQuery.data ?? [],
      currentDay,
    );
  }, [currentDay, dailyQuery.data, enabled, lens, monthlyQuery.data]);

  const monthlyLoading = lens === 'reel' && monthlyQuery.isLoading;
  const error = dailyQuery.error || (lens === 'reel' ? monthlyQuery.error : null);

  return {
    convert,
    isLoading: enabled && (dailyQuery.isLoading || monthlyLoading),
    error: error as Error | null,
  };
}
