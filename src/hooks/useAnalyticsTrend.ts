/**
 * useAnalyticsTrend Hook
 *
 * Provides 6-period trend data for the analytics dashboard
 * Used by the TrendChart widget to display income/expense trends
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { getDateRange } from '@/lib/date';
import { calculateIncomeSummary, isIncomeType, isIncomeReturnType, isExpenseType, isExpenseReturnType } from '@/constants/islemTypes';
import { fetchAllPages } from '@/lib/supabaseHelpers';
import { useSettings } from './useSettings';
import { useExchangeRates, convertCurrency } from './useExchangeRates';
import type {
  AnalyticsTrend,
  AnalyticsPeriod,
  DateRange,
  TrendDataPoint,
  TrendFilter,
} from '@/types/analytics';
import type { IslemType } from '@/types/database';

/**
 * Get period label based on period type
 */
function getPeriodLabel(
  period: AnalyticsPeriod,
  offset: number,
  monthsShort: string[]
): string {
  const now = new Date();

  switch (period) {
    case 'daily': {
      const targetDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + offset
      );
      return `${targetDay.getDate()}/${targetDay.getMonth() + 1}`;
    }
    case 'weekly': {
      // Calculate the week's start date
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const thisMonday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + mondayOffset
      );
      const targetMonday = new Date(thisMonday);
      targetMonday.setDate(thisMonday.getDate() + offset * 7);
      // Format: "23/12" (day/month)
      const day = targetMonday.getDate();
      const month = targetMonday.getMonth() + 1;
      return `${day}/${month}`;
    }
    case 'monthly': {
      const targetMonth = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      return monthsShort[targetMonth.getMonth()];
    }
    case 'yearly': {
      const targetYear = now.getFullYear() + offset;
      return targetYear.toString().slice(-2); // Last 2 digits: "23", "24"
    }
  }
}

/**
 * Hook to get trend data for the last 6 periods
 * Optionally filter by hesap, cari, kategori, or personel
 */
export function useAnalyticsTrend(
  period: AnalyticsPeriod,
  filter?: TrendFilter | null,
  dateRange?: DateRange,
): AnalyticsTrend {
  const { isletme } = useAuthContext();
  const { t } = useTranslation('common');
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const rates = exchangeRatesData?.rates;
  const ratesVersion = exchangeRatesData?.updated_at ?? null;

  // Get localized short month names
  const monthsShort = useMemo(() => {
    const months = t('date.monthsShort', { returnObjects: true });
    if (Array.isArray(months) && months.every((m) => typeof m === 'string')) {
      return months as string[];
    }
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  }, [t]);

  const trendQuery = useQuery({
    // baseCurrency + ratesVersion eklendi: filtreli yol kuru istemcide uyguladığından,
    // kurlar yüklendiğinde/güncellendiğinde trend yeniden hesaplanmalı.
    queryKey: [
      ...queryKeys.analytics.trend(isletme?.id ?? '', period, filter?.type || null, filter?.id || null, dateRange?.startDate, dateRange?.endDate),
      baseCurrency,
      ratesVersion,
    ],
    queryFn: async () => {
      if (!isletme) return null;

      // Calculate date ranges for 6 periods
      const periods: Array<{
        offset: number;
        startDate: string;
        endDate: string;
        label: string;
      }> = [];

      // Find the correct offset for the given dateRange
      let currentOffset = 0;
      if (dateRange) {
        for (let testOffset = -50; testOffset <= 50; testOffset++) {
          const testRange = getDateRange(period, testOffset);
          if (testRange.startDate === dateRange.startDate) {
            currentOffset = testOffset;
            break;
          }
        }
      }

      for (let i = 0; i < 6; i++) {
        const offset = currentOffset - 5 + i;
        const range = getDateRange(period, offset);
        periods.push({
          offset: offset - currentOffset, // normalize so current = 0
          startDate: range.startDate,
          endDate: range.endDate,
          label: getPeriodLabel(period, offset, monthsShort),
        });
      }

      const hasFilter = !!(filter?.type && filter?.id);
      const todayStr = new Date().toISOString().split('T')[0];

      let trendData: TrendDataPoint[];

      if (!hasFilter) {
        // No filter: use RPC for each period (no 1000-row limit)
        const rpcResults = await Promise.all(
          periods.map((p) =>
            supabase.rpc('get_income_expense_summary', {
              p_isletme_id: isletme.id,
              p_start_date: `${p.startDate}T00:00:00`,
              p_end_date: `${p.endDate}T23:59:59`,
            })
          )
        );

        // RPC tutarları TRY cinsindendir; ana para birimine çevir (TR için no-op).
        const convToBase = (v: number) =>
          baseCurrency === 'TRY' ? v : (convertCurrency(v, 'TRY', baseCurrency, rates) ?? v);

        trendData = periods.map((p, i) => {
          const result = rpcResults[i];
          if (result.error) throw result.error;

          let income = 0;
          let expense = 0;
          for (const row of result.data || []) {
            const amount = Number(row.total) || 0;
            const t = row.type as IslemType;
            if (isIncomeType(t)) income += amount;
            else if (isIncomeReturnType(t)) income -= amount;
            if (isExpenseType(t)) expense += amount;
            else if (isExpenseReturnType(t)) expense -= amount;
          }

          const incomeBase = convToBase(income);
          const expenseBase = convToBase(expense);
          return {
            label: p.label,
            income: Math.round(incomeBase * 100) / 100,
            expense: Math.round(expenseBase * 100) / 100,
            net: Math.round((incomeBase - expenseBase) * 100) / 100,
            isCurrentPeriod: todayStr >= p.startDate && todayStr <= p.endDate,
          };
        });
      } else {
        // With filter: use fetchAllPages to bypass 1000-row limit
        const oldestStart = periods[0].startDate;
        const newestEnd = periods[periods.length - 1].endDate;

        type TrendRow = {
          type: string; amount: number; date: string;
          hesap: { currency: string | null } | { currency: string | null }[] | null;
          cari: { currency: string | null } | { currency: string | null }[] | null;
          personel: { currency: string | null } | { currency: string | null }[] | null;
        };
        const firstCcy = (v: TrendRow['hesap']): string | null =>
          Array.isArray(v) ? (v[0]?.currency ?? null) : (v?.currency ?? null);
        // İşlemin para birimini A1 ile aynı kuralla çöz (tutar hangi bakiye bacağındaysa o)
        // ve ana para birimine çevir. Kur yoksa ham tutar (mevcut davranış; nadir).
        const toBaseAmount = (row: TrendRow): number => {
          const amt = Number(row.amount) || 0;
          const ccy = firstCcy(row.hesap) || firstCcy(row.cari) || firstCcy(row.personel) || baseCurrency;
          if (ccy === baseCurrency) return amt;
          const conv = convertCurrency(amt, ccy, baseCurrency, rates);
          return conv ?? amt;
        };

        const data = await fetchAllPages<TrendRow>(() => {
          let q = supabase
            .from('islemler')
            .select('type, amount, date, hesap:hesaplar!hesap_id(currency), cari:cariler(currency), personel:personel(currency)')
            .eq('isletme_id', isletme.id)
            .gte('date', `${oldestStart}T00:00:00`)
            .lte('date', `${newestEnd}T23:59:59`);

          switch (filter!.type) {
            case 'hesap':
              q = q.eq('hesap_id', filter!.id);
              break;
            case 'cari':
              q = q.eq('cari_id', filter!.id);
              break;
            case 'kategori':
              q = q.eq('kategori_id', filter!.id);
              break;
            case 'personel':
              q = q.eq('personel_id', filter!.id);
              break;
          }

          return q;
        });

        trendData = periods.map((p) => {
          const periodTransactions = data.filter((t) => {
            const txDate = t.date.split('T')[0];
            return txDate >= p.startDate && txDate <= p.endDate;
          });

          const summary = calculateIncomeSummary(
            periodTransactions.map((tx) => ({ type: tx.type as IslemType, amount: toBaseAmount(tx) }))
          );

          return {
            label: p.label,
            income: summary.income,
            expense: summary.expense,
            net: summary.income - summary.expense,
            isCurrentPeriod: todayStr >= p.startDate && todayStr <= p.endDate,
          };
        });
      }

      // Calculate totals
      const totals = trendData.reduce(
        (acc, point) => ({
          income: acc.income + point.income,
          expense: acc.expense + point.expense,
          net: acc.net + point.net,
        }),
        { income: 0, expense: 0, net: 0 }
      );

      // Calculate averages
      const count = trendData.length || 1;
      const averages = {
        income: totals.income / count,
        expense: totals.expense / count,
        net: totals.net / count,
      };

      return {
        data: trendData,
        totals,
        averages,
      };
    },
    enabled: !!isletme,
    staleTime: 5 * 60 * 1000, // 5 dk
  });

  return {
    data: trendQuery.data?.data || [],
    totals: trendQuery.data?.totals || { income: 0, expense: 0, net: 0 },
    averages: trendQuery.data?.averages || { income: 0, expense: 0, net: 0 },
    isLoading: trendQuery.isLoading,
  };
}
