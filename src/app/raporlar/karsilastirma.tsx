import { useState, useCallback, useEffect } from 'react';
import { logEvent } from '@/lib/appEvents';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet } from 'lucide-react-native';
import { ReportPeriodBar } from '@/components/reports/ReportPeriodBar';
import { KarsilastirmaTabContent } from '@/components/reports/tabs';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { useComparisonReport } from '@/hooks/useComparisonReport';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { usePagePermission } from '@/hooks/usePagePermission';
import { useQueryClient } from '@tanstack/react-query';

export default function KarsilastirmaRaporPage() {
  usePagePermission({ module: 'raporlar' });
  useEffect(() => { logEvent('report_viewed', { report_type: 'comparison' }); }, []);
  const { t } = useTranslation(['reports']);
  const state = useReportRouteState();
  const report = useComparisonReport(state.period, state.periodOffset);
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
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={report.exportPdf}
              disabled={report.isExporting || report.isLoading}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('reports:export.exportPDF')}
            >
              {report.isExporting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <FileSpreadsheet size={18} color={colors.success} />
              )}
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          <ReportPeriodBar state={state} monthlyAsYear dailyAsMonth />

          <KarsilastirmaTabContent report={report} />
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
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
});
