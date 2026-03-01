/**
 * useAnalyticsSummary Hook
 *
 * Aggregates financial data for the Analytics dashboard
 * Provides KPI metrics with delta calculations and sparkline data
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
export function useAnalyticsSummary(period: AnalyticsPeriod): AnalyticsSummary {
  const { isletme } = useAuthContext();
  const { currency: baseCurrency } = useSettings();

  // Get instant metrics from existing hooks
  const financialSummary = useFinancialSummary();
  const { data: hesaplar, isLoading: hesaplarLoading } = useHesaplar();
  const { data: cariler, isLoading: carilerLoading } = useCariler();
  const { data: personelList, isLoading: personelLoading } = usePersonelList();

  // Fetch period-based data for current and previous + 6 periods for sparkline
  const periodsQuery = useQuery({
    queryKey: ['analytics-periods', isletme?.id, period, baseCurrency],
    queryFn: async () => {
      if (!isletme) return null;

      // Calculate date ranges for 6 periods (for sparkline) + current + previous
      const periods: Array<{ offset: number; startDate: string; endDate: string }> = [];
      for (let offset = -5; offset <= 0; offset++) {
        const range = getDateRange(period, offset);
        periods.push({
          offset,
          startDate: range.startDate,
          endDate: range.endDate,
        });
      }

      // Fetch all transactions in the date range (oldest to newest)
      // Hesap bilgisi ile birlikte çek (pasif filtresi için)
      const oldestStart = periods[0].startDate;
      const newestEnd = periods[periods.length - 1].endDate;

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
        .gte('date', `${oldestStart}T00:00:00`)
        .lte('date', `${newestEnd}T23:59:59`);

      if (error) throw error;

      // Pasif hesaplardaki işlemleri filtrele
      const activeData = (data || []).filter((item: any) => {
        const hesapActive = item.hesap ? (Array.isArray(item.hesap) ? item.hesap[0]?.is_active : item.hesap.is_active) : true;
        const hedefHesapActive = item.hedef_hesap ? (Array.isArray(item.hedef_hesap) ? item.hedef_hesap[0]?.is_active : item.hedef_hesap.is_active) : true;
        return hesapActive !== false && hedefHesapActive !== false;
      });

      // Group transactions by period
      const periodData = periods.map((p) => {
        const periodTransactions = activeData.filter((t: any) => {
          const txDate = t.date.split('T')[0];
          return txDate >= p.startDate && txDate <= p.endDate;
        });

        const summary = calculateIncomeSummary(
          periodTransactions as Array<{ type: IslemType; amount: number }>
        );

        return {
          offset: p.offset,
          income: summary.income,
          expense: summary.expense,
          net: summary.income - summary.expense,
        };
      });

      return periodData;
    },
    enabled: !!isletme,
    staleTime: 5 * 60 * 1000, // 5 dk - mutation'lar zaten invalidate eder
  });

  // Calculate metrics
  const summary = useMemo<AnalyticsSummary>(() => {
    const periodData = periodsQuery.data || [];
    const isLoading =
      periodsQuery.isLoading ||
      financialSummary.isLoading ||
      hesaplarLoading ||
      carilerLoading ||
      personelLoading;

    // Current period (offset 0) and previous period (offset -1)
    const currentPeriod = periodData.find((p) => p.offset === 0) || {
      income: 0,
      expense: 0,
      net: 0,
    };
    const previousPeriod = periodData.find((p) => p.offset === -1) || {
      income: 0,
      expense: 0,
      net: 0,
    };

    // Sparkline data (last 6 periods including current)
    const sparklineIncome = periodData.map((p) => p.income);
    const sparklineExpense = periodData.map((p) => p.expense);
    const sparklineNet = periodData.map((p) => p.net);

    // Calculate metrics with delta
    const incomeMetric: MetricWithDelta = {
      current: currentPeriod.income,
      previous: previousPeriod.income,
      ...calculateDelta(currentPeriod.income, previousPeriod.income),
      sparklineData: sparklineIncome,
    };

    const expenseMetric: MetricWithDelta = {
      current: currentPeriod.expense,
      previous: previousPeriod.expense,
      ...calculateDelta(currentPeriod.expense, previousPeriod.expense),
      sparklineData: sparklineExpense,
    };

    const netProfitMetric: MetricWithDelta = {
      current: currentPeriod.net,
      previous: previousPeriod.net,
      ...calculateDelta(currentPeriod.net, previousPeriod.net),
      sparklineData: sparklineNet,
    };

    // Calculate account count (only base currency accounts)
    const accountCount =
      hesaplar?.filter((h) => {
        const accountCurrency = h.currency || baseCurrency;
        return accountCurrency === baseCurrency && toNumber(h.balance) !== 0;
      }).length ?? 0;

    // Calculate customer count (positive balance = they owe us)
    const customerCount =
      cariler?.filter((c) => Number(c.balance) > 0).length ?? 0;

    // Calculate supplier count (negative balance = we owe them)
    const supplierCount =
      cariler?.filter((c) => Number(c.balance) < 0).length ?? 0;

    // Calculate staff count (negative balance = we owe them)
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
