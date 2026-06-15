import { useState, useCallback, useEffect } from 'react';
import { logEvent } from '@/lib/appEvents';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ReportPeriodBar } from '@/components/reports/ReportPeriodBar';
import { PersonelTabContent } from '@/components/reports/tabs';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { colors } from '@/constants/colors';
import { usePagePermission } from '@/hooks/usePagePermission';
import { useQueryClient } from '@tanstack/react-query';

export default function PersonelRaporPage() {
  usePagePermission({ module: 'raporlar' });
  useEffect(() => { logEvent('report_viewed', { report_type: 'personel' }); }, []);
  const { personelId } = useLocalSearchParams<{ personelId?: string }>();
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
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          <ReportPeriodBar state={state} includeCustom />

          <PersonelTabContent
            dateRange={state.dateRange}
            period={state.period}
            periodOffset={state.periodOffset}
            periodLabel={state.periodLabel}
            initialPersonelId={personelId}
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
});
