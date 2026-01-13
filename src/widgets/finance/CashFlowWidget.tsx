/**
 * CashFlowWidget
 *
 * Displays cash inflow vs outflow as a horizontal progress bar
 * Full-width widget showing net cash position
 *
 * Uses useCashFlowByCategory hook which correctly:
 * - Excludes credit card transactions from cash flow
 * - Only counts actual cash movements (nakit, banka, birikim, diger account types)
 * - Handles transfers to credit cards as outflows
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useCashFlowByCategory } from '@/hooks/useCashFlowByCategory';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { useSettings } from '@/hooks/useSettings';
import { formatCurrency } from '@/lib/currency';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import type { WidgetProps } from '@/types/analytics';

export function CashFlowWidget({ period }: WidgetProps) {
  const { t } = useTranslation('analytics');
  const { currency } = useSettings();
  const { dateRange } = useAnalytics();

  // Use the same cash flow calculation as dashboard
  const {
    totalInflow,
    totalOutflow,
    netCashFlow,
    isLoading,
  } = useCashFlowByCategory({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('cashFlow.title')}</Text>
        </View>
        <View style={styles.skeleton} />
      </View>
    );
  }

  const total = totalInflow + totalOutflow;
  const inflowPercent = total > 0 ? (totalInflow / total) * 100 : 50;
  const outflowPercent = total > 0 ? (totalOutflow / total) * 100 : 50;
  const isPositive = netCashFlow >= 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('cashFlow.title')}</Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { backgroundColor: colors.background }]}>
          <View
            style={[
              styles.progressInflow,
              { width: `${inflowPercent}%` },
            ]}
          />
          <View
            style={[
              styles.progressOutflow,
              { width: `${outflowPercent}%` },
            ]}
          />
        </View>
      </View>

      {/* Flow Details */}
      <View style={styles.flowRow}>
        {/* Inflow */}
        <View style={styles.flowItem}>
          <View style={styles.flowHeader}>
            <View style={[styles.flowIcon, styles.flowIconInflow]}>
              <ArrowUpRight size={14} color={colors.success} />
            </View>
            <Text style={styles.flowLabel}>{t('cashFlow.inflow')}</Text>
          </View>
          <Text style={styles.flowValue}>
            {formatCurrency(totalInflow, currency)}
          </Text>
          <Text style={styles.flowPercent}>{inflowPercent.toFixed(0)}%</Text>
        </View>

        {/* Divider */}
        <View style={styles.flowDivider} />

        {/* Outflow */}
        <View style={styles.flowItem}>
          <View style={styles.flowHeader}>
            <View style={[styles.flowIcon, styles.flowIconOutflow]}>
              <ArrowDownRight size={14} color={colors.error} />
            </View>
            <Text style={styles.flowLabel}>{t('cashFlow.outflow')}</Text>
          </View>
          <Text style={styles.flowValue}>
            {formatCurrency(totalOutflow, currency)}
          </Text>
          <Text style={styles.flowPercent}>{outflowPercent.toFixed(0)}%</Text>
        </View>
      </View>

      {/* Net Position */}
      <View style={styles.netContainer}>
        <Text style={styles.netLabel}>
          {isPositive ? t('cashFlow.netPositive') : t('cashFlow.netNegative')}
        </Text>
        <Text
          style={[
            styles.netValue,
            isPositive ? styles.netValuePositive : styles.netValueNegative,
          ]}
        >
          {isPositive ? '+' : ''}{formatCurrency(netCashFlow, currency)}
        </Text>
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
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  skeleton: {
    height: 120,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  progressContainer: {
    marginBottom: spacing.lg,
  },
  progressBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressInflow: {
    backgroundColor: colors.success,
    height: '100%',
  },
  progressOutflow: {
    backgroundColor: colors.error,
    height: '100%',
  },
  flowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  flowItem: {
    flex: 1,
  },
  flowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  flowIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.xs,
  },
  flowIconInflow: {
    backgroundColor: `${colors.success}15`,
  },
  flowIconOutflow: {
    backgroundColor: `${colors.error}15`,
  },
  flowLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  flowValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  flowPercent: {
    fontSize: 12,
    color: colors.textMuted,
  },
  flowDivider: {
    width: 1,
    height: 60,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  netContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  netLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  netValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  netValuePositive: {
    color: colors.success,
  },
  netValueNegative: {
    color: colors.error,
  },
});
