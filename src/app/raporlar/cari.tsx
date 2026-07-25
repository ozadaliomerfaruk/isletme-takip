import { useState, useCallback, useEffect } from 'react';
import { Screen } from '@/components/ui';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { logEvent } from '@/lib/appEvents';
import { ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ReportPeriodBar } from '@/components/reports/ReportPeriodBar';
import { CariTabContent } from '@/components/reports/tabs';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { colors } from '@/constants/colors';
import { usePagePermission } from '@/hooks/usePagePermission';
import { useQueryClient } from '@tanstack/react-query';

export default function CariRaporPage() {
  const contentPaddingBottom = useContentBottomPadding();
  usePagePermission({ module: 'raporlar' });
  useEffect(() => { logEvent('report_viewed', { report_type: 'cari' }); }, []);
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

  return (
    <>
      <Screen>
        <ScrollView
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          <ReportPeriodBar state={state} includeCustom />

          <CariTabContent
            dateRange={state.dateRange}
            period={state.period}
            periodOffset={state.periodOffset}
            periodLabel={state.periodLabel}
            initialCariId={cariId}
          />
        </ScrollView>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
