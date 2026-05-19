import { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TabFilter } from '@/components/ui';
import { KarsilastirmaTabContent } from '@/components/reports/tabs';
import { PeriodNavigator } from '@/components/reports/PeriodNavigator';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { PeriodType } from '@/hooks/useIslemler';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { usePagePermission } from '@/hooks/usePagePermission';
import { useQueryClient } from '@tanstack/react-query';

export default function KarsilastirmaRaporPage() {
  usePagePermission({ module: 'raporlar' });
  const { t } = useTranslation(['reports']);
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
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
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
          <PeriodNavigator
            period={state.period}
            periodOffset={state.periodOffset}
            periodLabel={state.periodLabel}
            setPeriodOffset={state.setPeriodOffset}
          />
        </View>

        <KarsilastirmaTabContent
          dateRange={state.dateRange}
          period={state.period}
          periodOffset={state.periodOffset}
          periodLabel={state.periodLabel}
        />
      </ScrollView>
    </SafeAreaView>
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
