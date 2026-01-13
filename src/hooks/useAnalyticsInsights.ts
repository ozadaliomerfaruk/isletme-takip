/**
 * useAnalyticsInsights Hook
 *
 * Generates smart insights based on financial data
 * Provides actionable suggestions and warnings
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFinancialSummary } from './useFinancialSummary';
import { useAnalyticsTrend } from './useAnalyticsTrend';
import { useCariler } from './useCariler';
import { usePersonelList } from './usePersonel';
import { useSettings } from './useSettings';
import { formatCurrency } from '@/lib/currency';
import type {
  AnalyticsInsights,
  AnalyticsPeriod,
  Insight,
} from '@/types/analytics';

/**
 * Generates insights based on current financial data
 */
export function useAnalyticsInsights(period: AnalyticsPeriod): AnalyticsInsights {
  const { t } = useTranslation('analytics');
  const { currency } = useSettings();

  const financialSummary = useFinancialSummary();
  const trend = useAnalyticsTrend(period);
  const { data: cariler, isLoading: carilerLoading } = useCariler();
  const { data: personelList, isLoading: personelLoading } = usePersonelList();

  const insights = useMemo<Insight[]>(() => {
    const result: Insight[] = [];
    const fc = formatCurrency;

    // Insight 1: Open Receivables Warning
    const customersWithDebt =
      cariler?.filter((c) => Number(c.balance) > 0) || [];
    if (
      financialSummary.receivables.total > 0 &&
      customersWithDebt.length > 0
    ) {
      result.push({
        id: 'open-receivables',
        type: 'warning',
        icon: 'AlertCircle',
        title: t('insights.openReceivables', {
          count: customersWithDebt.length,
          amount: fc(financialSummary.receivables.total, currency),
        }),
        priority: 90,
        action: {
          label: t('insights.viewDetails'),
          route: '/cariler',
          params: { filter: 'alacak' },
        },
      });
    }

    // Insight 2: Open Payables Warning
    const suppliersOwed = cariler?.filter((c) => Number(c.balance) < 0) || [];
    const staffOwed = personelList?.filter((p) => Number(p.balance) < 0) || [];
    if (
      financialSummary.payables.total > 0 &&
      (suppliersOwed.length > 0 || staffOwed.length > 0)
    ) {
      result.push({
        id: 'open-payables',
        type: 'warning',
        icon: 'Wallet',
        title: t('insights.openPayables', {
          supplierCount: suppliersOwed.length,
          staffCount: staffOwed.length,
        }),
        subtitle: fc(financialSummary.payables.total, currency),
        priority: 85,
        action: {
          label: t('insights.viewDetails'),
          route: '/cariler',
          params: { filter: 'borc' },
        },
      });
    }

    // Insight 3: Collection Trend (compare last 2 periods)
    if (trend.data.length >= 2) {
      const currentPeriod = trend.data[trend.data.length - 1];
      const previousPeriod = trend.data[trend.data.length - 2];

      if (previousPeriod.income > 0) {
        const changePercent =
          ((currentPeriod.income - previousPeriod.income) /
            previousPeriod.income) *
          100;

        if (changePercent < -20) {
          // Income dropped more than 20%
          result.push({
            id: 'income-trend-down',
            type: 'warning',
            icon: 'TrendingDown',
            title: t('insights.collectionTrendDown', {
              percentage: Math.abs(Math.round(changePercent)),
            }),
            priority: 75,
          });
        } else if (changePercent > 20) {
          // Income increased more than 20%
          result.push({
            id: 'income-trend-up',
            type: 'success',
            icon: 'TrendingUp',
            title: t('insights.collectionTrendUp', {
              percentage: Math.round(changePercent),
            }),
            priority: 40,
          });
        }
      }
    }

    // Insight 4: Credit Card Debt (negative account balances)
    if (financialSummary.payables.hesap > 0) {
      result.push({
        id: 'credit-card-debt',
        type: 'info',
        icon: 'CreditCard',
        title: t('insights.creditCardDebt', {
          amount: fc(financialSummary.payables.hesap, currency),
        }),
        priority: 60,
        action: {
          label: t('insights.viewDetails'),
          route: '/',  // Accounts are displayed on home page
        },
      });
    }

    // Insight 5: Net Profit Status
    if (trend.data.length > 0) {
      const currentPeriod = trend.data[trend.data.length - 1];

      if (currentPeriod.net > 0) {
        result.push({
          id: 'net-profit-positive',
          type: 'success',
          icon: 'CheckCircle',
          title: t('insights.netProfitPositive', {
            amount: fc(currentPeriod.net, currency),
          }),
          priority: 20,
        });
      } else if (currentPeriod.net < 0) {
        result.push({
          id: 'net-profit-negative',
          type: 'warning',
          icon: 'AlertTriangle',
          title: t('insights.netProfitNegative', {
            amount: fc(Math.abs(currentPeriod.net), currency),
          }),
          priority: 95,
        });
      }
    }

    // Sort by priority (higher first) and limit to 5
    return result.sort((a, b) => b.priority - a.priority).slice(0, 5);
  }, [
    t,
    currency,
    financialSummary,
    trend.data,
    cariler,
    personelList,
  ]);

  const isLoading =
    financialSummary.isLoading ||
    trend.isLoading ||
    carilerLoading ||
    personelLoading;

  return {
    insights,
    isLoading,
  };
}
