import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Text as SvgText, G } from 'react-native-svg';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { TrendIndicator } from './TrendIndicator';
import { useTranslation } from 'react-i18next';

interface PeriodData {
  label: string;
  value: number;
  isCurrentPeriod?: boolean;
}

interface PeriodComparisonChartProps {
  data: PeriodData[];
  title?: string;
  color?: string;
  showTrend?: boolean;
  height?: number;
}

export function PeriodComparisonChart({
  data,
  title,
  color = colors.primary,
  showTrend = true,
  height = 180,
}: PeriodComparisonChartProps) {
  const { t } = useTranslation(['reports']);

  if (data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text variant="body" color="secondary">
          {t('reports:empty.noData')}
        </Text>
      </View>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const chartPadding = 16;
  const screenWidth = Dimensions.get('window').width - spacing.lg * 4;
  const barGap = Math.max(8, Math.floor(40 / data.length));
  const barWidth = Math.max(24, Math.floor((screenWidth - chartPadding * 2 - barGap * (data.length - 1)) / data.length));
  const chartWidth = data.length * (barWidth + barGap) + chartPadding * 2;
  const chartHeight = height - 60; // Label için alan bırak

  // İlk ve son değer arasındaki trend
  const firstValue = data[0]?.value || 0;
  const lastValue = data[data.length - 1]?.value || 0;

  return (
    <View style={styles.container}>
      {title && (
        <View style={styles.header}>
          <Text variant="label" color="secondary">
            {title}
          </Text>
          {showTrend && data.length >= 2 && (
            <TrendIndicator
              currentValue={lastValue}
              previousValue={firstValue}
              size="sm"
            />
          )}
        </View>
      )}

      <View style={styles.chartContainer}>
        <Svg width="100%" height={height} viewBox={`0 0 ${chartWidth} ${height}`}>
          {data.map((item, index) => {
            const barHeight = maxValue > 0 ? (item.value / maxValue) * chartHeight : 0;
            const x = chartPadding + index * (barWidth + barGap);
            const y = chartHeight - barHeight + 10;

            const barColor = item.isCurrentPeriod ? color : `${color}80`;

            return (
              <G key={index}>
                {/* Background bar */}
                <Rect
                  x={x}
                  y={10}
                  width={barWidth}
                  height={chartHeight}
                  rx={8}
                  fill={colors.surfaceLight}
                />
                {/* Value bar */}
                <Rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, 4)}
                  rx={8}
                  fill={barColor}
                />
                {/* Value label */}
                <SvgText
                  x={x + barWidth / 2}
                  y={y - 8}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight="600"
                  fill={colors.text}
                >
                  {item.value >= 1000
                    ? `${(item.value / 1000).toFixed(0)}K`
                    : item.value.toFixed(0)}
                </SvgText>
                {/* Period label */}
                <SvgText
                  x={x + barWidth / 2}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize={12}
                  fill={item.isCurrentPeriod ? color : colors.textMuted}
                  fontWeight={item.isCurrentPeriod ? '600' : '400'}
                >
                  {item.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </View>

      {/* Detay tablo */}
      <View style={styles.detailsContainer}>
        {data.map((item, index) => (
          <View
            key={index}
            style={[
              styles.detailItem,
              item.isCurrentPeriod && styles.detailItemCurrent,
            ]}
          >
            <Text variant="caption" color="secondary">
              {item.label}
            </Text>
            <Text
              variant="body"
              style={[
                styles.detailValue,
                item.isCurrentPeriod && { color },
              ]}
            >
              {formatCurrency(item.value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chartContainer: {
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  detailsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: spacing.md,
  },
  detailItem: {
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  detailItemCurrent: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    padding: spacing.sm,
    marginHorizontal: -spacing.xs,
  },
  detailValue: {
    fontWeight: '700',
    fontSize: 14,
  },
});

export default PeriodComparisonChart;
