/**
 * WidgetRenderer Component
 *
 * Renders analytics widgets in a responsive grid layout
 * Handles widget filtering, ordering, and layout
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import type { AnalyticsWidget } from '@/types/analytics';

interface WidgetRendererProps {
  widgets: AnalyticsWidget[];
}

export function WidgetRenderer({ widgets }: WidgetRendererProps) {
  const { t } = useTranslation('analytics');
  const { period, dateRange, previousDateRange, navigate } = useAnalytics();

  if (widgets.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t('empty.noWidgets')}</Text>
      </View>
    );
  }

  // Group widgets into rows
  // Full width widgets get their own row
  // Half width widgets are paired together
  const rows: AnalyticsWidget[][] = [];
  let currentHalfRow: AnalyticsWidget[] = [];

  widgets.forEach((widget) => {
    if (widget.size === 'full') {
      // First, flush any pending half-width widgets
      if (currentHalfRow.length > 0) {
        rows.push(currentHalfRow);
        currentHalfRow = [];
      }
      // Add full-width widget as its own row
      rows.push([widget]);
    } else {
      // Half-width widget
      currentHalfRow.push(widget);
      if (currentHalfRow.length === 2) {
        rows.push(currentHalfRow);
        currentHalfRow = [];
      }
    }
  });

  // Don't forget any remaining half-width widget
  if (currentHalfRow.length > 0) {
    rows.push(currentHalfRow);
  }

  return (
    <View style={styles.container}>
      {rows.map((row, rowIndex) => (
        <View
          key={`row-${rowIndex}`}
          style={[
            styles.row,
            row.length === 2 && styles.rowWithGap,
          ]}
        >
          {row.map((widget) => {
            const WidgetComponent = widget.component;
            return (
              <View
                key={widget.id}
                style={widget.size === 'half' ? styles.halfWidget : styles.fullWidget}
              >
                <WidgetComponent
                  period={period}
                  dateRange={dateRange}
                  previousDateRange={previousDateRange}
                  onNavigate={navigate}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
  },
  rowWithGap: {
    justifyContent: 'space-between',
  },
  fullWidget: {
    width: '100%',
  },
  halfWidget: {
    width: '48%',
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
