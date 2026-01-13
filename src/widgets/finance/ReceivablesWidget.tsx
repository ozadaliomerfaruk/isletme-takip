/**
 * ReceivablesWidget
 *
 * Displays open receivables (customers who owe money)
 * Half-width widget with drill-down navigation
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Users, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAnalyticsSummary } from '@/hooks/useAnalyticsSummary';
import { useSettings } from '@/hooks/useSettings';
import { formatCurrency } from '@/lib/currency';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import type { WidgetProps } from '@/types/analytics';

export function ReceivablesWidget({ period, onNavigate }: WidgetProps) {
  const { t } = useTranslation('analytics');
  const { currency } = useSettings();
  const summary = useAnalyticsSummary(period);

  const handlePress = () => {
    onNavigate('/cariler', { filter: 'alacak' });
  };

  if (summary.isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.skeleton} />
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t('widgets.receivables')}</Text>
        <ChevronRight size={18} color={colors.textMuted} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Users size={20} color={colors.success} />
        </View>

        <Text
          style={[styles.value, summary.receivables.total === 0 && styles.valueZero]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatCurrency(summary.receivables.total, currency)}
        </Text>

        <Text style={styles.subtitle}>
          {t('labels.customers', { count: summary.receivables.customerCount })}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 120,
  },
  skeleton: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${colors.success}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.success,
    marginBottom: spacing.xs,
  },
  valueZero: {
    color: colors.textMuted,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
