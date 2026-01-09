import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { CashFlowItem } from '@/hooks/useCashFlowByCategory';

interface HorizontalBarChartProps {
  data: CashFlowItem[];
  maxItems?: number;  // Kartda gösterilecek max item (varsayılan 5)
  showLabels?: boolean;
  compact?: boolean;  // Carousel için kompakt görünüm
}

export function HorizontalBarChart({
  data,
  maxItems = 5,
  showLabels = true,
  compact = false,
}: HorizontalBarChartProps) {
  const displayData = data.slice(0, maxItems);
  const maxValue = Math.max(...displayData.map(d => d.total), 1);

  const barHeight = compact ? 10 : 16;
  const labelWidth = compact ? 70 : 90;
  const valueWidth = compact ? 40 : 50;

  if (displayData.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text variant="caption" color="secondary">
          Veri bulunamadı
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {displayData.map((item, index) => {
        const barWidthPercent = Math.max((item.total / maxValue) * 100, 2);
        const categoryName = item.kategori?.name || 'Diğer';
        const truncatedName = categoryName.length > (compact ? 10 : 12)
          ? categoryName.substring(0, compact ? 10 : 12) + '...'
          : categoryName;

        return (
          <View key={item.kategori?.id || `other-${index}`} style={styles.barRow}>
            {showLabels && (
              <Text
                variant="caption"
                numberOfLines={1}
                style={[styles.label, { width: labelWidth }]}
              >
                {truncatedName}
              </Text>
            )}

            <View style={styles.barContainer}>
              <Svg height={barHeight} width="100%">
                {/* Background bar */}
                <Rect
                  x={0}
                  y={0}
                  width="100%"
                  height={barHeight}
                  rx={barHeight / 2}
                  fill={colors.surfaceLight}
                />
                {/* Value bar */}
                <Rect
                  x={0}
                  y={0}
                  width={`${barWidthPercent}%`}
                  height={barHeight}
                  rx={barHeight / 2}
                  fill={item.color}
                />
              </Svg>
            </View>

            <Text
              variant="caption"
              color="secondary"
              style={[styles.value, { width: valueWidth }]}
            >
              %{item.percentage.toFixed(0)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  emptyContainer: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    fontWeight: '500',
  },
  barContainer: {
    flex: 1,
    height: 16,
  },
  value: {
    textAlign: 'right',
  },
});
