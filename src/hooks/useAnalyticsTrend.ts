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
import { getDateRange } from '@/lib/date';
import { calculateIncomeSummary } from '@/constants/islemTypes';
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

  // Get localized short month names
  const monthsShort = useMemo(() => {
    const months = t('date.monthsShort', { returnObjects: true });
    if (Array.isArray(months) && months.every((m) => typeof m === 'string')) {
      return months as string[];
    }
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  }, [t]);

  const trendQuery = useQuery({
    queryKey: ['analytics-trend', isletme?.id, period, filter?.type || null, filter?.id || null, dateRange?.startDate, dateRange?.endDate],
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

      // Fetch all transactions in the full date range
      const oldestStart = periods[0].startDate;
      const newestEnd = periods[periods.length - 1].endDate;

      // Build query with optional filter
      let query = supabase
        .from('islemler')
        .select('type, amount, date')
        .eq('isletme_id', isletme.id)
        .gte('date', `${oldestStart}T00:00:00`)
        .lte('date', `${newestEnd}T23:59:59`);

      // Apply filter if present
      if (filter?.type && filter?.id) {
        switch (filter.type) {
          case 'hesap':
            query = query.eq('hesap_id', filter.id);
            break;
          case 'cari':
            query = query.eq('cari_id', filter.id);
            break;
          case 'kategori':
            query = query.eq('kategori_id', filter.id);
            break;
          case 'personel':
            query = query.eq('personel_id', filter.id);
            break;
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      // Determine today's date string for current period check
      const todayStr = new Date().toISOString().split('T')[0];

      // Group transactions by period
      const trendData: TrendDataPoint[] = periods.map((p) => {
        const periodTransactions = (data || []).filter((t) => {
          const txDate = t.date.split('T')[0];
          return txDate >= p.startDate && txDate <= p.endDate;
        });

        const summary = calculateIncomeSummary(
          periodTransactions as Array<{ type: IslemType; amount: number }>
        );

        return {
          label: p.label,
          income: summary.income,
          expense: summary.expense,
          net: summary.income - summary.expense,
          isCurrentPeriod: todayStr >= p.startDate && todayStr <= p.endDate,
        };
      });

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
