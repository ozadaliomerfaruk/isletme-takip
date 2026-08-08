import { useState, useCallback, useEffect } from 'react';
import { logEvent } from '@/lib/appEvents';

import { ScrollView, StyleSheet, RefreshControl, ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react-native';
import { ReportPeriodBar } from '@/components/reports/ReportPeriodBar';
import { KarsilastirmaTabContent } from '@/components/reports/tabs';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { useComparisonReport } from '@/hooks/useComparisonReport';
import { GlassIconButton, Screen, Text } from '@/components/ui';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { usePagePermission } from '@/hooks/usePagePermission';
import { useQueryClient } from '@tanstack/react-query';
import { ReportExportButton } from '@/components/reports/ReportExportButton';
import {
  IncomeExpenseLensPicker,
  INCOME_EXPENSE_LENS_STICKY_SPACE,
} from '@/components/reports/IncomeExpenseLensPicker';
import { useSettings } from '@/hooks/useSettings';
import type { IncomeExpenseLens } from '@/lib/reportLens';

export default function KarsilastirmaRaporPage() {
  usePagePermission({ module: 'raporlar' });
  useEffect(() => { logEvent('report_viewed', { report_type: 'comparison' }); }, []);
  const { t } = useTranslation(['reports']);
  const state = useReportRouteState();
  const { currency: baseCurrency } = useSettings();
  const [selectedLens, setSelectedLens] = useState<IncomeExpenseLens>('nominal');
  const report = useComparisonReport(state.period, state.periodOffset, selectedLens);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const contentPaddingBottom = useContentBottomPadding();

  useEffect(() => {
    if (baseCurrency !== 'TRY' && selectedLens !== 'nominal') {
      setSelectedLens('nominal');
    }
  }, [baseCurrency, selectedLens]);
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
          contentContainerStyle={{
            paddingTop: baseCurrency === 'TRY' ? INCOME_EXPENSE_LENS_STICKY_SPACE : 0,
            paddingBottom: contentPaddingBottom,
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          <ReportPeriodBar state={state} monthlyAsYear dailyAsMonth />

          {report.conversionIncomplete ? (
            <View style={styles.historicalWarning}>
              <Text variant="caption" color="error">
                {t('reports:incomeExpenseLens.incomplete', {
                  count: report.missingRateCount,
                })}
              </Text>
            </View>
          ) : null}

          <KarsilastirmaTabContent report={report} />
        </ScrollView>
        <IncomeExpenseLensPicker
          value={selectedLens}
          onChange={setSelectedLens}
          visible={baseCurrency === 'TRY'}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  /** Yalnız konum — boyut/görsel GlassIconButton'da. */
  headerBtn: {
    marginRight: spacing.sm,
  },
  historicalWarning: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
});
