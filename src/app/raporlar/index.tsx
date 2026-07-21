import { upperTr } from '@/lib/turkishTextUtils';
import { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import { TabFilter } from '@/components/ui';
import { FinanceKPIGrid, TrendChartWidget, CategoryDonutWidget } from '@/widgets/finance';
import { QuickInsights, ExploreGrid, CustomDateRangePicker } from '@/components/reports';
import { PeriodNavigator } from '@/components/reports/PeriodNavigator';
import { useReportPeriod, type ReportPeriod } from '@/hooks/useReportPeriod';
import { colors } from '@/constants/colors';
import { spacing, shadows } from '@/constants/spacing';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useTranslation } from 'react-i18next';
import { usePagePermission } from '@/hooks/usePagePermission';
import { logEvent } from '@/lib/appEvents';

type ReportTab = 'ozet' | 'grafikler';

export default function RaporlarPage() {
  usePagePermission({ module: 'raporlar' });
  const router = useRouter();
  const { t } = useTranslation(['reports', 'common']);
  const { locale } = useDateFormat();

  // Global persisted period state
  const {
    period,
    periodOffset,
    customStartDate,
    customEndDate,
    widgetPeriod,
    periodLabel,
    dateRange,
    previousDateRange,
    setPeriod,
    setPeriodOffset,
    setCustomDates,
  } = useReportPeriod();

  // Tab state
  const [activeTab, setActiveTab] = useState<ReportTab>('ozet');

  // Rapor bölümü açıldığında bir kez olay (aktivasyon hunisi için)
  useEffect(() => {
    logEvent('report_viewed', { report_type: 'overview' });
  }, []);

  const PERIOD_OPTIONS = [
    { label: upperTr(t('reports:period.yearly')), value: 'yearly' },
    { label: upperTr(t('reports:period.monthly')), value: 'monthly' },
    { label: upperTr(t('reports:period.weekly')), value: 'weekly' },
    { label: upperTr(t('reports:period.daily')), value: 'daily' },
    { label: upperTr(t('reports:period.custom')), value: 'custom' },
  ];

  const TAB_OPTIONS = [
    { label: t('reports:tabs.summary'), value: 'ozet' },
    { label: t('reports:tabs.charts'), value: 'grafikler' },
  ];

  // Widget navigation helper
  const handleNavigate = useCallback((route: string, params?: Record<string, string>) => {
    router.push({
      pathname: route,
      params: {
        period: widgetPeriod,
        periodOffset: String(periodOffset),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        ...params,
      },
    } as Href);
  }, [router, widgetPeriod, periodOffset, dateRange]);

  const handleExplorePress = useCallback((route: string) => {
    router.push({
      pathname: route,
      params: {
        period: widgetPeriod,
        periodOffset: String(periodOffset),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      },
    } as Href);
  }, [router, widgetPeriod, periodOffset, dateRange]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* STICKY: Period selector + Content tabs */}
      <View style={styles.stickyHeader}>
        {/* Period type selector */}
        <View style={styles.periodFilter}>
          <TabFilter
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(v) => setPeriod(v as ReportPeriod)}
          />
        </View>

        {/* Period navigator or custom date picker */}
        {period === 'custom' ? (
          <CustomDateRangePicker
            startDate={customStartDate}
            endDate={customEndDate}
            onChange={setCustomDates}
            locale={locale}
          />
        ) : (
          <PeriodNavigator
            period={period}
            periodOffset={periodOffset}
            periodLabel={periodLabel}
            setPeriodOffset={setPeriodOffset}
          />
        )}

        {/* Content tab selector */}
        <View style={styles.contentTabRow}>
          <TabFilter
            options={TAB_OPTIONS}
            value={activeTab}
            onChange={(v) => setActiveTab(v as ReportTab)}
          />
        </View>
      </View>

      {/* SCROLLABLE: Tab content */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {activeTab === 'ozet' ? (
          <>
            {/* KPI Grid */}
            <View style={styles.widgetSection}>
              <FinanceKPIGrid
                period={widgetPeriod}
                dateRange={dateRange}
                previousDateRange={previousDateRange}
                onNavigate={handleNavigate}
              />
            </View>

            {/* Quick Insights */}
            <QuickInsights dateRange={dateRange} />

            {/* Explore Grid */}
            <ExploreGrid onPress={handleExplorePress} />
          </>
        ) : (
          <>
            {/* Trend Chart */}
            <View style={styles.widgetSection}>
              <TrendChartWidget
                period={widgetPeriod}
                dateRange={dateRange}
                previousDateRange={previousDateRange}
                onNavigate={handleNavigate}
              />
            </View>

            {/* Category Donut */}
            <View style={styles.widgetSection}>
              <CategoryDonutWidget
                period={widgetPeriod}
                dateRange={dateRange}
                previousDateRange={previousDateRange}
                onNavigate={handleNavigate}
              />
            </View>
          </>
        )}

        {/* Bottom spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  stickyHeader: {
    backgroundColor: colors.background,
    paddingBottom: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    ...shadows.sm,
  },
  periodFilter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  contentTabRow: {
    paddingHorizontal: spacing.lg,
  },
  scrollView: {
    flex: 1,
  },
  widgetSection: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
