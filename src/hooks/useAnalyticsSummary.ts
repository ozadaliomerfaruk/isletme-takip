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
import { calculateIncomeSummary } from '@/constants/islemTypes';
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

  // Fetch current + previous period data
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

      // Fetch all transactions in the full date range (previous start to current end)
      const { data, error } = await supabase
        .from('islemler')
        .select(`
          type,
          amount,
          date,
          hesap:hesaplar!hesap_id(is_active),
          hedef_hesap:hesaplar!hedef_hesap_id(is_active)
        `)
        .eq('isletme_id', isletme.id)
        .gte('date', `${prevStart}T00:00:00`)
        .lte('date', `${currentEnd}T23:59:59`);

      if (error) throw error;

      // Filter out transactions from inactive accounts
      const activeData = (data || []).filter((item: any) => {
        const hesapActive = item.hesap ? (Array.isArray(item.hesap) ? item.hesap[0]?.is_active : item.hesap.is_active) ?? true : true;
        const hedefHesapActive = item.hedef_hesap ? (Array.isArray(item.hedef_hesap) ? item.hedef_hesap[0]?.is_active : item.hedef_hesap.is_active) ?? true : true;
        return hesapActive === true && hedefHesapActive === true;
      });

      // Split into current and previous period
      const currentTransactions = activeData.filter((t: any) => {
        const txDate = t.date.split('T')[0];
        return txDate >= currentStart && txDate <= currentEnd;
      });

      const previousTransactions = activeData.filter((t: any) => {
        const txDate = t.date.split('T')[0];
        return txDate >= prevStart && txDate <= prevEnd;
      });

      const currentSummary = calculateIncomeSummary(
        currentTransactions as Array<{ type: IslemType; amount: number }>
      );
      const previousSummary = calculateIncomeSummary(
        previousTransactions as Array<{ type: IslemType; amount: number }>
      );

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
