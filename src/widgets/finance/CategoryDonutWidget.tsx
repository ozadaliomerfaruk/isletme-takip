/**
 * CategoryDonutWidget
 *
 * Displays category distribution as a donut chart
 * Full-width widget with income/expense toggle
 */

import React, { useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { useCategoryReport } from '@/hooks/useCategoryReport';
import { useSettings } from '@/hooks/useSettings';
import { formatCurrency } from '@/lib/currency';
import { upperTr } from '@/lib/turkishTextUtils';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import type { WidgetProps } from '@/types/analytics';
import type { KategoriType } from '@/types/database';

// Chart colors palette
const CHART_COLORS = [
  '#10B981', // Green
  '#3B82F6', // Blue
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

// React.memo: dashboard'da ilgisiz bir re-render bu SVG donut'u yeniden çizmesin (chartData zaten useMemo'lu).
export const CategoryDonutWidget = React.memo(function CategoryDonutWidget({
  dateRange,
  onNavigate,
}: WidgetProps) {
  const { t } = useTranslation('analytics');
  const { currency } = useSettings();
  const [selectedType, setSelectedType] = useState<KategoriType>('gider');

  const categoryReport = useCategoryReport(selectedType, {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  // Prepare chart data (top 4 + other)
  const chartData = useMemo(() => {
    if (!categoryReport.items || categoryReport.items.length === 0) {
      return [];
    }

    const items = categoryReport.items;
    const top4 = items.slice(0, 4);
    const otherItems = items.slice(4);

    // Calculate "Other" total
    const otherTotal = otherItems.reduce((sum, item) => sum + item.total, 0);
    const otherPercentage = categoryReport.totalAmount > 0
      ? (otherTotal / categoryReport.totalAmount) * 100
      : 0;

    // Build chart data
    const data = top4.map((item, index) => ({
      value: item.total,
      color: CHART_COLORS[index % CHART_COLORS.length],
      name: item.kategori?.name ? upperTr(item.kategori.name) : t('category.uncategorized'),
      percentage: item.percentage,
      kategoriId: item.kategori?.id || null,
    }));

    // Add "Other" if there are more than 4 categories
    if (otherItems.length > 0) {
      data.push({
        value: otherTotal,
        color: colors.textMuted,
        name: t('category.other'),
        percentage: otherPercentage,
        kategoriId: null,
      });
    }

    return data;
  }, [categoryReport.items, categoryReport.totalAmount, t]);

  const handleCategoryPress = (kategoriId: string | null) => {
    if (kategoriId) {
      // type ŞART: detay sayfası paramı okumazsa gelir/gider yönünü bilemez ve
      // varsayılan olarak GELİR'i sorgular → gider kategorisine basınca boş sayfa.
      onNavigate(`/raporlar/kategori/${kategoriId}`, { type: selectedType });
    }
  };

  if (categoryReport.isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="bodySmall" color="secondary" style={styles.title}>{t('category.title')}</Text>
        </View>
        <View style={styles.skeletonChart} />
      </View>
    );
  }

  const totalLabel = selectedType === 'gider'
    ? t('category.totalExpense')
    : t('category.totalIncome');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="bodySmall" color="secondary" style={styles.title}>{t('category.title')}</Text>

        {/* Type Toggle */}
        <View style={styles.toggleContainer}>
          {(['gider', 'gelir'] as KategoriType[]).map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.toggleButton,
                selectedType === type && styles.toggleButtonActive,
              ]}
              onPress={() => setSelectedType(type)}
            >
              <Text
                variant="label"
                color="muted"
                style={selectedType === type ? styles.toggleTextActive : undefined}
              >
                {t(`category.${type === 'gider' ? 'expense' : 'income'}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {chartData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text variant="bodySmall" color="muted">{t('empty.noData')}</Text>
        </View>
      ) : (
        <View style={styles.chartRow}>
          {/* Donut Chart */}
          <View style={styles.chartContainer}>
            <PieChart
              data={chartData}
              donut
              radius={70}
              innerRadius={45}
              centerLabelComponent={() => (
                <View style={styles.centerLabel}>
                  <Text variant="caption" color="muted" style={styles.centerLabelTitle}>{totalLabel}</Text>
                  <Text
                    variant="caption"
                    style={styles.centerLabelValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatCurrency(categoryReport.totalAmount, currency)}
                  </Text>
                </View>
              )}
            />
          </View>

          {/* Legend */}
          <ScrollView style={styles.legendContainer} showsVerticalScrollIndicator={false}>
            {chartData.map((item, index) => (
              <TouchableOpacity
                key={`${item.name}-${index}`}
                style={styles.legendItem}
                onPress={() => handleCategoryPress(item.kategoriId)}
                disabled={!item.kategoriId}
                activeOpacity={item.kategoriId ? 0.7 : 1}
              >
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <View style={styles.legendTextContainer}>
                  <Text variant="caption" style={styles.legendName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={styles.legendValues}>
                    <Text variant="caption" style={styles.legendAmount} numberOfLines={1}>
                      {formatCurrency(item.value, currency)}
                    </Text>
                    <Text variant="caption" color="muted">
                      {item.percentage.toFixed(0)}%
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
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
  // Tipografi/renk artık Text variant'ından geliyor; burada yalnız variant tablosunda
  // birebir karşılığı OLMAYAN ölçüler (10/13px) ve biçim override'ları kalır.
  title: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  toggleTextActive: {
    color: colors.text,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabelTitle: {
    fontSize: 10,
    marginBottom: 2,
  },
  centerLabelValue: {
    fontWeight: '600',
    maxWidth: 70,
    textAlign: 'center',
  },
  legendContainer: {
    flex: 1,
    marginLeft: spacing.lg,
    maxHeight: 160,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  legendTextContainer: {
    flex: 1,
  },
  legendName: {
    fontSize: 13,
    marginBottom: 1,
  },
  legendValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendAmount: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  skeletonChart: {
    height: 160,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  emptyContainer: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
