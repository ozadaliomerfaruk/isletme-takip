/**
 * FinanceKPIGrid Widget
 *
 * Displays 3 KPI metrics (Income, Expense, Net Profit) in a row
 * + Cash/Bank balance in a full-width row below
 * Clean, big numbers, no sparklines
 */

import { View, StyleSheet } from 'react-native';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { useAnalyticsSummary } from '@/hooks/useAnalyticsSummary';
import { useSettings } from '@/hooks/useSettings';
import { formatCurrency } from '@/lib/currency';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import type { WidgetProps } from '@/types/analytics';

interface KPICardProps {
  title: string;
  value: number;
  delta?: number;
  deltaPercent?: number;
  currency: string;
  isInstant?: boolean;
  subtitle?: string;
}

function KPICard({
  title,
  value,
  delta = 0,
  deltaPercent = 0,
  currency,
  isInstant = false,
  subtitle,
}: KPICardProps) {
  const { t } = useTranslation('analytics');

  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const hasChange = delta !== 0;

  return (
    <View style={styles.kpiCard}>
      <Text variant="label" color="muted" style={styles.kpiTitle}>{title}</Text>
      <Text
        variant="h2"
        bold
        style={[
          styles.kpiValue,
          value < 0 && styles.kpiValueNegative,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {formatCurrency(value, currency)}
      </Text>

      {!isInstant && (
        <View style={styles.deltaRow}>
          {hasChange ? (
            <>
              {isPositive ? (
                <TrendingUp size={13} color={colors.success} />
              ) : (
                <TrendingDown size={13} color={colors.error} />
              )}
              <Text
                variant="label"
                color="muted"
                style={[
                  styles.deltaText,
                  isPositive && styles.deltaTextPositive,
                  isNegative && styles.deltaTextNegative,
                ]}
              >
                {isPositive ? '+' : ''}{deltaPercent.toFixed(1)}%
              </Text>
            </>
          ) : (
            <>
              <Minus size={13} color={colors.textMuted} />
              <Text variant="label" color="muted" style={styles.deltaText}>{t('labels.noChange')}</Text>
            </>
          )}
        </View>
      )}

      {isInstant && subtitle && (
        <Text variant="caption" color="muted" style={styles.kpiSubtitle}>{subtitle}</Text>
      )}
    </View>
  );
}

export function FinanceKPIGrid({
  period,
  dateRange,
  previousDateRange,
}: WidgetProps) {
  const { t } = useTranslation('analytics');
  const { currency } = useSettings();
  const summary = useAnalyticsSummary(period, dateRange, previousDateRange);

  if (summary.isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.topRow}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={[styles.kpiCard, styles.kpiCardSkeleton]} />
          ))}
        </View>
        <View style={[styles.cashRow, styles.kpiCardSkeleton]} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 3-column top row: Income, Expense, Net Profit */}
      <View style={styles.topRow}>
        <KPICard
          title={t('kpi.income')}
          value={summary.income.current}
          delta={summary.income.delta}
          deltaPercent={summary.income.deltaPercent}
          currency={currency}
        />
        <KPICard
          title={t('kpi.expense')}
          value={summary.expense.current}
          delta={summary.expense.delta}
          deltaPercent={summary.expense.deltaPercent}
          currency={currency}
        />
        <KPICard
          title={t('kpi.netProfit')}
          value={summary.netProfit.current}
          delta={summary.netProfit.delta}
          deltaPercent={summary.netProfit.deltaPercent}
          currency={currency}
        />
      </View>

      {/* Full-width cash/bank row */}
      <View style={styles.cashRow}>
        <KPICard
          title={t('kpi.cashBalance')}
          value={summary.cashBalance.total}
          currency={currency}
          isInstant
          subtitle={t('labels.accounts', { count: summary.cashBalance.accountCount })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  kpiCardSkeleton: {
    height: 80,
    backgroundColor: colors.surface,
  },
  cashRow: {
    borderRadius: borderRadius.lg,
  },
  // Tipografi/renk artık Text variant'ından geliyor; burada yalnız variant tablosunda
  // birebir karşılığı OLMAYAN ölçü (13px) ve yerleşim override'ları kalır.
  kpiTitle: {
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  kpiValue: {
    marginBottom: spacing.xs,
  },
  kpiValueNegative: {
    color: colors.error,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  deltaText: {
    fontSize: 13,
  },
  deltaTextPositive: {
    color: colors.success,
  },
  deltaTextNegative: {
    color: colors.error,
  },
  kpiSubtitle: {
    fontSize: 13,
  },
});
