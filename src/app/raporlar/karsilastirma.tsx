import { useState, useCallback, useEffect } from 'react';
import { logEvent } from '@/lib/appEvents';

import { ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react-native';
import { ReportPeriodBar } from '@/components/reports/ReportPeriodBar';
import { KarsilastirmaTabContent } from '@/components/reports/tabs';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { useComparisonReport } from '@/hooks/useComparisonReport';
import { GlassIconButton, Screen } from '@/components/ui';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { usePagePermission } from '@/hooks/usePagePermission';
import { useQueryClient } from '@tanstack/react-query';
import { ReportExportButton } from '@/components/reports/ReportExportButton';

export default function KarsilastirmaRaporPage() {
  usePagePermission({ module: 'raporlar' });
  useEffect(() => { logEvent('report_viewed', { report_type: 'comparison' }); }, []);
  const { t } = useTranslation(['reports']);
  const state = useReportRouteState();
  const report = useComparisonReport(state.period, state.periodOffset);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const contentPaddingBottom = useContentBottomPadding();
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
            <>
              <ReportExportButton
                onPress={report.exportExcel}
                isExporting={report.isExportingExcel}
                accessibilityLabel={t('reports:export.exportExcel')}
              />
              <GlassIconButton
                style={styles.headerBtn}
                onPress={report.exportPdf}
                disabled={report.isExporting || report.isLoading}
                accessibilityLabel={t('reports:export.exportPDF')}
              >
                {report.isExportingPdf ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <FileText size={18} color={colors.error} />
                )}
              </GlassIconButton>
            </>
          ),
        }}
      />
      <Screen>
        {/* Alt boşluk KAYDIRMA İÇERİĞİNDE, container'da değil: eskiden
            SafeAreaView edges={['bottom']} kullanılıyordu ve o NATIVE bileşen
            _layout'un inset override'ını görmediği için bar yüksekliğini hiç
            almıyordu — son satır ("ORTALAMA") bar'ın altında kalıyordu. */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          <ReportPeriodBar state={state} monthlyAsYear dailyAsMonth />

          <KarsilastirmaTabContent report={report} />
        </ScrollView>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  /** Yalnız konum — boyut/görsel GlassIconButton'da. */
  headerBtn: {
    marginRight: spacing.sm,
  },
});
