/**
 * InsightsWidget
 *
 * Displays smart insights and actionable suggestions
 * Full-width widget showing top 5 insights
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  CheckCircle,
  AlertTriangle,
  Info,
  Lightbulb,
  ChevronRight,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAnalyticsInsights } from '@/hooks/useAnalyticsInsights';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import type { WidgetProps, InsightType } from '@/types/analytics';

// Icon mapping
const INSIGHT_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  CheckCircle,
  AlertTriangle,
  Info,
  Lightbulb,
};

// Color mapping for insight types
const INSIGHT_COLORS: Record<InsightType, { icon: string; bg: string }> = {
  warning: { icon: colors.warning, bg: `${colors.warning}15` },
  info: { icon: colors.info, bg: `${colors.info}15` },
  success: { icon: colors.success, bg: `${colors.success}15` },
  tip: { icon: colors.primary, bg: colors.primaryLight },
};

export function InsightsWidget({ period, onNavigate }: WidgetProps) {
  const { t } = useTranslation('analytics');
  const { insights, isLoading } = useAnalyticsInsights(period);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('insights.title')}</Text>
        </View>
        <View style={styles.skeleton} />
      </View>
    );
  }

  if (insights.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('insights.title')}</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Lightbulb size={24} color={colors.textMuted} />
          <Text style={styles.emptyText}>{t('insights.noInsights')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('insights.title')}</Text>
      </View>

      <View style={styles.insightsList}>
        {insights.map((insight, index) => {
          const IconComponent = INSIGHT_ICONS[insight.icon] || Info;
          const colorScheme = INSIGHT_COLORS[insight.type];

          return (
            <TouchableOpacity
              key={insight.id}
              style={[
                styles.insightItem,
                index === insights.length - 1 && styles.insightItemLast,
              ]}
              onPress={() => {
                if (insight.action) {
                  onNavigate(insight.action.route, insight.action.params);
                }
              }}
              disabled={!insight.action}
              activeOpacity={insight.action ? 0.7 : 1}
            >
              <View style={[styles.insightIcon, { backgroundColor: colorScheme.bg }]}>
                <IconComponent size={18} color={colorScheme.icon} />
              </View>

              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                {insight.subtitle && (
                  <Text style={styles.insightSubtitle}>{insight.subtitle}</Text>
                )}
              </View>

              {insight.action && (
                <ChevronRight size={18} color={colors.textMuted} />
              )}
            </TouchableOpacity>
          );
        })}
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
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  skeleton: {
    height: 100,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  insightsList: {
    gap: spacing.xs,
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  insightItemLast: {
    borderBottomWidth: 0,
  },
  insightIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
  },
  insightSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
