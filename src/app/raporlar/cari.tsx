import { useState, useCallback, useEffect } from 'react';
import { logEvent } from '@/lib/appEvents';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TabFilter } from '@/components/ui';
import { CariTabContent } from '@/components/reports/tabs';
import { PeriodNavigator } from '@/components/reports/PeriodNavigator';
import { CustomDateRangePicker } from '@/components/reports/CustomDateRangePicker';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { PeriodType } from '@/hooks/useIslemler';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { usePagePermission } from '@/hooks/usePagePermission';
import { useQueryClient } from '@tanstack/react-query';

export default function CariRaporPage() {
  usePagePermission({ module: 'raporlar' });
  useEffect(() => { logEvent('report_viewed', { report_type: 'cari' }); }, []);
  const { t } = useTranslation(['reports', 'common']);
  const { cariId } = useLocalSearchParams<{ cariId?: string }>();
  const state = useReportRouteState();
  const queryClient = useQueryClient();

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  const PERIOD_OPTIONS = [
    { label: t('reports:period.yearly'), value: 'yearly' },
    { label: t('reports:period.monthly'), value: 'monthly' },
    { label: t('reports:period.weekly'), value: 'weekly' },
    { label: t('reports:period.daily'), value: 'daily' },
    { label: t('reports:period.custom'), value: 'custom' },
  ];

  return (
    <>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          <View style={styles.periodFilter}>
            <TabFilter
              options={PERIOD_OPTIONS}
              value={state.period}
              onChange={(v) => {
                state.setPeriod(v as PeriodType);
                state.setPeriodOffset(0);
              }}
            />
            {state.period === 'custom' ? (
              <CustomDateRangePicker
                startDate={state.customStartDate}
                endDate={state.customEndDate}
                onChange={(s, e) => {
                  state.setCustomStartDate(s);
                  state.setCustomEndDate(e);
                }}
                locale={state.locale}
              />
            ) : (
              <PeriodNavigator
                period={state.period}
                periodOffset={state.periodOffset}
                periodLabel={state.periodLabel}
                setPeriodOffset={state.setPeriodOffset}
              />
            )}
          </View>

          <CariTabContent
            dateRange={state.dateRange}
            period={state.period}
            periodOffset={state.periodOffset}
            periodLabel={state.periodLabel}
            initialCariId={cariId}
          />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  periodFilter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
});
