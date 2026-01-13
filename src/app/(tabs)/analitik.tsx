/**
 * Analytics Dashboard Page
 *
 * Widget-based dashboard displaying financial metrics and insights
 * Supports period selection and widget filtering
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AnalyticsProvider, useAnalytics } from '@/contexts/AnalyticsContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { WidgetRenderer } from '@/components/analytics';
import { widgetRegistry } from '@/services/widgetRegistry';
import { registerFinanceWidgets } from '@/widgets/finance';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import type { AnalyticsPeriod } from '@/types/analytics';

// Register widgets immediately at module load (not in useEffect)
registerFinanceWidgets();

function AnalyticsDashboard() {
  const { t } = useTranslation('analytics');
  const { isletme, isletmeLoading } = useAuthContext();
  const {
    period,
    setPeriod,
    periodOffset,
    setPeriodOffset,
    periodLabel,
    userRole,
    activeModules,
    hiddenWidgets,
    refreshKey,
    refresh,
  } = useAnalytics();

  // Get filtered widgets
  const widgets = useMemo(
    () =>
      widgetRegistry.getWidgets({
        role: userRole,
        activeModules,
        hiddenWidgets,
      }),
    [userRole, activeModules, hiddenWidgets, refreshKey]
  );

  // Period options
  const periodOptions: { key: AnalyticsPeriod; label: string }[] = [
    { key: 'weekly', label: t('period.thisWeek') },
    { key: 'monthly', label: t('period.thisMonth') },
    { key: 'yearly', label: t('period.thisYear') },
  ];

  // Show loading while isletme is being loaded
  if (isletmeLoading || !isletme) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('title')}</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('title')}</Text>
      </View>

      {/* Period Selector */}
      <View style={styles.periodContainer}>
        <View style={styles.periodSelector}>
          {periodOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.periodButton,
                period === option.key && styles.periodButtonActive,
              ]}
              onPress={() => setPeriod(option.key)}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  period === option.key && styles.periodButtonTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Period Navigator */}
        <View style={styles.periodNavigator}>
          <TouchableOpacity
            style={styles.periodNavButton}
            onPress={() => setPeriodOffset((prev) => prev - 1)}
          >
            <ChevronLeft size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.periodLabel}>{periodLabel}</Text>
          <TouchableOpacity
            style={styles.periodNavButton}
            onPress={() => setPeriodOffset((prev) => prev + 1)}
          >
            <ChevronRight size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Widget Grid */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <WidgetRenderer widgets={widgets} />
      </ScrollView>
    </SafeAreaView>
  );
}

export default function AnalitikPage() {
  return (
    <AnalyticsProvider>
      <AnalyticsDashboard />
    </AnalyticsProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  periodContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
  },
  periodButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  periodButtonActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textMuted,
  },
  periodButtonTextActive: {
    color: colors.text,
  },
  periodNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  periodNavButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
  },
  periodLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    minWidth: 120,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
