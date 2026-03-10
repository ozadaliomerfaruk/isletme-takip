/**
 * useAnalyticsSummary Hook
 *
 * Aggregates financial data for the Analytics dashboard
 * Provides KPI metrics with delta calculations (current vs previous period)
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { useFinancialSummary } from './useFinancialSummary';
import { useHesaplar } from './useHesaplar';
import { useCariler } from './useCariler';
import { usePersonelList } from './usePersonel';
import { useSettings } from './useSettings';
import { getDateRange } from '@/lib/date';
import { isIncomeType, isIncomeReturnType, isExpenseType, isExpenseReturnType } from '@/constants/islemTypes';
import { toNumber } from '@/lib/currency';
import type {
  AnalyticsSummary,
  AnalyticsPeriod,
  DateRange,
  MetricWithDelta,
} from '@/types/analytics';
import type { IslemType } from '@/types/database';

/**
 * Calculates delta and percentage change between two values
 */
function calculateDelta(current: number, previous: number): { delta: number; deltaPercent: number } {
  const delta = current - previous;
  const deltaPercent = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
  return { delta, deltaPercent };
}

/**
 * Main hook for analytics summary data
 * Composes multiple data sources into a unified summary
 */
export function useAnalyticsSummary(
  period: AnalyticsPeriod,
  dateRange?: DateRange,
  previousDateRange?: DateRange,
): AnalyticsSummary {
  const { isletme } = useAuthContext();
  const { currency: baseCurrency } = useSettings();

  // Get instant metrics from existing hooks
  const financialSummary = useFinancialSummary();
  const { data: hesaplar, isLoading: hesaplarLoading } = useHesaplar();
  const { data: cariler, isLoading: carilerLoading } = useCariler();
  const { data: personelList, isLoading: personelLoading } = usePersonelList();

  // Fetch current + previous period data via RPC (no 1000-row limit)
  const periodsQuery = useQuery({
    queryKey: ['analytics-periods', isletme?.id, period, baseCurrency, dateRange?.startDate, dateRange?.endDate],
    queryFn: async () => {
      if (!isletme) return null;

      // Determine current and previous date ranges
      let currentStart: string;
      let currentEnd: string;
      let prevStart: string;
      let prevEnd: string;

      if (dateRange && previousDateRange) {
        currentStart = dateRange.startDate;
        currentEnd = dateRange.endDate;
        prevStart = previousDateRange.startDate;
        prevEnd = previousDateRange.endDate;
      } else {
        const current = getDateRange(period, 0);
        const prev = getDateRange(period, -1);
        currentStart = current.startDate;
        currentEnd = current.endDate;
        prevStart = prev.startDate;
        prevEnd = prev.endDate;
      }

      // Server-side aggregation via RPC: no 1000-row limit
      // Parallel fetch for current and previous period
      const [currentResult, previousResult] = await Promise.all([
        supabase.rpc('get_income_expense_summary', {
          p_isletme_id: isletme.id,
          p_start_date: `${currentStart}T00:00:00`,
          p_end_date: `${currentEnd}T23:59:59`,
        }),
        supabase.rpc('get_income_expense_summary', {
          p_isletme_id: isletme.id,
          p_start_date: `${prevStart}T00:00:00`,
          p_end_date: `${prevEnd}T23:59:59`,
        }),
      ]);

      if (currentResult.error) throw currentResult.error;
      if (previousResult.error) throw previousResult.error;

      // Parse RPC results into income/expense using type classification
      function parseSummary(rows: Array<{ type: string; total: number }>) {
        const result = { income: 0, expense: 0 };
        for (const row of rows || []) {
          const amount = Number(row.total) || 0;
          const t = row.type as IslemType;
          if (isIncomeType(t)) result.income += amount;
          else if (isIncomeReturnType(t)) result.income -= amount;
          if (isExpenseType(t)) result.expense += amount;
          else if (isExpenseReturnType(t)) result.expense -= amount;
        }
        return {
          income: Math.round(result.income * 100) / 100,
          expense: Math.round(result.expense * 100) / 100,
        };
      }

      const currentSummary = parseSummary(currentResult.data || []);
      const previousSummary = parseSummary(previousResult.data || []);

      return {
        current: {
          income: currentSummary.income,
          expense: currentSummary.expense,
          net: currentSummary.income - currentSummary.expense,
        },
        previous: {
          income: previousSummary.income,
          expense: previousSummary.expense,
          net: previousSummary.income - previousSummary.expense,
        },
      };
    },
    enabled: !!isletme,
    staleTime: 5 * 60 * 1000,
  });

  // Calculate metrics
  const summary = useMemo<AnalyticsSummary>(() => {
    const periodData = periodsQuery.data;
    const isLoading =
      periodsQuery.isLoading ||
      financialSummary.isLoading ||
      hesaplarLoading ||
      carilerLoading ||
      personelLoading;

    const currentPeriod = periodData?.current || { income: 0, expense: 0, net: 0 };
    const previousPeriod = periodData?.previous || { income: 0, expense: 0, net: 0 };

    const incomeMetric: MetricWithDelta = {
      current: currentPeriod.income,
      previous: previousPeriod.income,
      ...calculateDelta(currentPeriod.income, previousPeriod.income),
    };

    const expenseMetric: MetricWithDelta = {
      current: currentPeriod.expense,
      previous: previousPeriod.expense,
      ...calculateDelta(currentPeriod.expense, previousPeriod.expense),
    };

    const netProfitMetric: MetricWithDelta = {
      current: currentPeriod.net,
      previous: previousPeriod.net,
      ...calculateDelta(currentPeriod.net, previousPeriod.net),
    };

    const accountCount =
      hesaplar?.filter((h) => {
        const accountCurrency = h.currency || baseCurrency;
        return accountCurrency === baseCurrency && toNumber(h.balance) !== 0;
      }).length ?? 0;

    const customerCount =
      cariler?.filter((c) => Number(c.balance) > 0).length ?? 0;

    const supplierCount =
      cariler?.filter((c) => Number(c.balance) < 0).length ?? 0;

    const staffCount =
      personelList?.filter((p) => Number(p.balance) < 0).length ?? 0;

    return {
      netProfit: netProfitMetric,
      income: incomeMetric,
      expense: expenseMetric,
      cashBalance: {
        total: financialSummary.accounts,
        accountCount,
      },
      receivables: {
        total: financialSummary.receivables.total,
        customerCount,
      },
      payables: {
        total: financialSummary.payables.total,
        supplierCount,
        staffCount,
        creditCardDebt: financialSummary.payables.hesap,
      },
      isLoading,
    };
  }, [
    periodsQuery.data,
    periodsQuery.isLoading,
    financialSummary,
    hesaplar,
    hesaplarLoading,
    cariler,
    carilerLoading,
    personelList,
    personelLoading,
    baseCurrency,
  ]);

  return summary;
}
