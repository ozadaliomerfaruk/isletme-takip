/**
 * FinanceKPIGrid Widget
 *
 * Displays 4 KPI cards in a 2x2 grid:
 * - Net Profit, Income, Expense, Cash/Bank Balance
 * Each card includes a sparkline and delta indicator
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAnalyticsSummary } from '@/hooks/useAnalyticsSummary';
import { useSettings } from '@/hooks/useSettings';
import { formatCurrency } from '@/lib/currency';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import type { WidgetProps, MetricWithDelta } from '@/types/analytics';

interface KPICardProps {
  title: string;
  value: number;
  delta?: number;
  deltaPercent?: number;
  sparklineData?: number[];
  currency: string;
  isInstant?: boolean;
  subtitle?: string;
  color?: string;
}

function KPICard({
  title,
  value,
  delta = 0,
  deltaPercent = 0,
  sparklineData = [],
  currency,
  isInstant = false,
  subtitle,
  color = colors.primary,
}: KPICardProps) {
  const { t } = useTranslation('analytics');

  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const hasChange = delta !== 0;

  // Prepare sparkline data
  const lineData = sparklineData.map((v) => ({ value: v }));

  // Determine sparkline color based on trend
  const sparklineColor = isPositive
    ? colors.success
    : isNegative
    ? colors.error
    : colors.textMuted;

  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiTitle}>{title}</Text>

      <View style={styles.kpiValueRow}>
        <Text
          style={[
            styles.kpiValue,
            value < 0 && styles.kpiValueNegative,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatCurrency(value, currency)}
        </Text>

        {/* Sparkline */}
        {sparklineData.length > 0 && (
          <View style={styles.sparklineContainer}>
            <LineChart
              data={lineData}
              width={50}
              height={24}
              thickness={1.5}
              color={sparklineColor}
              hideDataPoints
              hideYAxisText
              hideAxesAndRules
              hideOrigin
              adjustToWidth
              curved
              areaChart
              startFillColor={sparklineColor}
              endFillColor="transparent"
              startOpacity={0.2}
              endOpacity={0}
            />
          </View>
        )}
      </View>

      {/* Delta indicator */}
      {!isInstant && (
        <View style={styles.deltaRow}>
          {hasChange ? (
            <>
              {isPositive ? (
                <TrendingUp size={14} color={colors.success} />
              ) : (
                <TrendingDown size={14} color={colors.error} />
              )}
              <Text
                style={[
                  styles.deltaText,
                  isPositive && styles.deltaTextPositive,
                  isNegative && styles.deltaTextNegative,
                ]}
              >
                {isPositive ? '+' : ''}
                {deltaPercent.toFixed(1)}%
              </Text>
              <Text style={styles.deltaLabel}>{t('labels.vsLastPeriod')}</Text>
            </>
          ) : (
            <>
              <Minus size={14} color={colors.textMuted} />
              <Text style={styles.deltaText}>{t('labels.noChange')}</Text>
            </>
          )}
        </View>
      )}

      {/* Subtitle (for instant metrics) */}
      {isInstant && subtitle && (
        <Text style={styles.kpiSubtitle}>{subtitle}</Text>
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
        <View style={styles.grid}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={[styles.kpiCard, styles.kpiCardSkeleton]} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {/* Net Profit */}
        <KPICard
          title={t('kpi.netProfit')}
          value={summary.netProfit.current}
          delta={summary.netProfit.delta}
          deltaPercent={summary.netProfit.deltaPercent}
          sparklineData={summary.netProfit.sparklineData}
          currency={currency}
          color={summary.netProfit.current >= 0 ? colors.success : colors.error}
        />

        {/* Income */}
        <KPICard
          title={t('kpi.income')}
          value={summary.income.current}
          delta={summary.income.delta}
          deltaPercent={summary.income.deltaPercent}
          sparklineData={summary.income.sparklineData}
          currency={currency}
          color={colors.success}
        />

        {/* Expense */}
        <KPICard
          title={t('kpi.expense')}
          value={summary.expense.current}
          delta={summary.expense.delta}
          deltaPercent={summary.expense.deltaPercent}
          sparklineData={summary.expense.sparklineData}
          currency={currency}
          color={colors.error}
        />

        {/* Cash/Bank Balance */}
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
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  kpiCard: {
    width: '47%',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  kpiCardSkeleton: {
    height: 90,
    backgroundColor: colors.background,
  },
  kpiTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  kpiValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  kpiValueNegative: {
    color: colors.error,
  },
  sparklineContainer: {
    marginLeft: spacing.sm,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  deltaText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
  },
  deltaTextPositive: {
    color: colors.success,
  },
  deltaTextNegative: {
    color: colors.error,
  },
  deltaLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  kpiSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
