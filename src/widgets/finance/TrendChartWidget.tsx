/**
 * TrendChartWidget
 *
 * Displays 6-period income/expense trend as a bar chart
 * Full-width widget with metric toggle (Income/Expense/Net)
 * Supports filtering by hesap, cari, kategori, or personel
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Filter, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAnalyticsTrend } from '@/hooks/useAnalyticsTrend';
import { useSettings } from '@/hooks/useSettings';
import { TrendFilterModal } from '@/components/reports';
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import type { WidgetProps, TrendFilter } from '@/types/analytics';

type MetricType = 'income' | 'expense' | 'net';

// React.memo: dashboard'da İLGİSİZ bir re-render (başka widget'ın verisi değişince parent yeniden
// render) bu SVG bar-grafiği yeniden çizmesin. Kendi verisi (useAnalyticsTrend) değişirse yine güncellenir.
export const TrendChartWidget = React.memo(function TrendChartWidget({ period, dateRange }: WidgetProps) {
  const { t } = useTranslation('analytics');
  const { currency } = useSettings();

  // Filter state
  const [activeFilter, setActiveFilter] = useState<TrendFilter | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // Pass filter and dateRange to hook
  const trend = useAnalyticsTrend(period, activeFilter, dateRange);

  const [selectedMetric, setSelectedMetric] = useState<MetricType>('net');

  // Pencere genişliğiyle güncellenmeli (iPad/Mac yeniden boyutlanınca grafik taşmasın)
  const { width: windowWidth } = useWindowDimensions();

  if (trend.isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('trend.title')}</Text>
        </View>
        <View style={styles.skeletonChart} />
      </View>
    );
  }

  // Prepare bar data based on selected metric
  const chartWidth = windowWidth - spacing.lg * 4;
  const barWidth = Math.max(20, (chartWidth / trend.data.length) - 12);

  const getBarColor = (value: number, metric: MetricType): string => {
    if (metric === 'income') return colors.success;
    if (metric === 'expense') return colors.error;
    // Net: green if positive, red if negative
    return value >= 0 ? colors.success : colors.error;
  };

  const barData = trend.data.map((point) => {
    const value =
      selectedMetric === 'income'
        ? point.income
        : selectedMetric === 'expense'
        ? point.expense
        : point.net;

    const absValue = Math.abs(value);

    return {
      value: absValue,
      label: point.label,
      frontColor: getBarColor(value, selectedMetric),
      topLabelComponent: () => (
        <View style={styles.barTopLabel}>
          {point.isCurrentPeriod && <View style={styles.currentPeriodDot} />}
          <Text style={styles.barValueText}>
            {formatCurrencyCompact(absValue, currency)}
          </Text>
        </View>
      ),
    };
  });

  // Calculate max value for Y-axis
  const maxValue = Math.max(...barData.map((d) => d.value), 1);

  // Get total and average for selected metric
  const total =
    selectedMetric === 'income'
      ? trend.totals.income
      : selectedMetric === 'expense'
      ? trend.totals.expense
      : trend.totals.net;

  const average =
    selectedMetric === 'income'
      ? trend.averages.income
      : selectedMetric === 'expense'
      ? trend.averages.expense
      : trend.averages.net;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{t('trend.title')}</Text>
          {/* Filter Button */}
          <TouchableOpacity
            style={[styles.filterButton, activeFilter && styles.filterButtonActive]}
            onPress={() => setFilterModalVisible(true)}
          >
            <Filter size={16} color={activeFilter ? colors.primary : colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Metric Toggle */}
        <View style={styles.toggleContainer}>
          {(['income', 'expense', 'net'] as MetricType[]).map((metric) => (
            <TouchableOpacity
              key={metric}
              style={[
                styles.toggleButton,
                selectedMetric === metric && styles.toggleButtonActive,
              ]}
              onPress={() => setSelectedMetric(metric)}
            >
              <Text
                style={[
                  styles.toggleText,
                  selectedMetric === metric && styles.toggleTextActive,
                ]}
              >
                {t(`trend.${metric}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Bar Chart */}
      <View style={styles.chartContainer}>
        <BarChart
          data={barData}
          width={chartWidth}
          height={150}
          barWidth={barWidth}
          barBorderRadius={4}
          noOfSections={4}
          yAxisThickness={0}
          xAxisThickness={1}
          xAxisColor={colors.border}
          yAxisTextStyle={styles.yAxisText}
          xAxisLabelTextStyle={styles.xAxisLabel}
          hideRules
          spacing={12}
          maxValue={maxValue * 1.1}
          formatYLabel={(val) => formatCurrencyCompact(Number(val), currency)}
          isAnimated
          animationDuration={300}
        />
      </View>

      {/* Summary Row */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('labels.total')}</Text>
          <Text
            style={[
              styles.summaryValue,
              total < 0 && styles.summaryValueNegative,
            ]}
          >
            {formatCurrency(total, currency)}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('labels.average')}</Text>
          <Text
            style={[
              styles.summaryValue,
              average < 0 && styles.summaryValueNegative,
            ]}
          >
            {formatCurrency(average, currency)}
          </Text>
        </View>
      </View>

      {/* Active Filter Chip */}
      {activeFilter && (
        <View style={styles.filterChipContainer}>
          <View style={styles.filterChip}>
            <Text style={styles.filterChipLabel}>
              {t(`filter.types.${activeFilter.type}`)}:
            </Text>
            <Text style={styles.filterChipValue}>{activeFilter.label}</Text>
            <TouchableOpacity
              style={styles.filterChipClose}
              onPress={() => setActiveFilter(null)}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Filter Modal */}
      <TrendFilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        currentFilter={activeFilter}
        onApply={setActiveFilter}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    backgroundColor: colors.primaryLight,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    padding: 2,
  },
  toggleButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  toggleButtonActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
  },
  toggleTextActive: {
    color: colors.text,
  },
  chartContainer: {
    marginLeft: -spacing.md,
    marginRight: -spacing.md,
  },
  skeletonChart: {
    height: 150,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  yAxisText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  xAxisLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  barTopLabel: {
    alignItems: 'center',
    marginBottom: 2,
  },
  barValueText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  currentPeriodDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginBottom: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  summaryValueNegative: {
    color: colors.error,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  filterChipContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  filterChipLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  filterChipValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  filterChipClose: {
    marginLeft: spacing.xs,
    padding: 2,
  },
});
