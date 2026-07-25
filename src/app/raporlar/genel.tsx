import { useState, useCallback, useEffect } from 'react';
import { Screen } from '@/components/ui';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { logEvent } from '@/lib/appEvents';
import { ScrollView, Alert, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GenelTabContent } from '@/components/reports/tabs';
import { ReportExportButton } from '@/components/reports/ReportExportButton';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { useAuthContext } from '@/contexts/AuthContext';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, createConversionSum } from '@/hooks/useExchangeRates';
import { toNumber } from '@/lib/currency';
import { exportGenelDurumToExcel, GenelDurumExcelTranslations } from '@/lib/reportExcelExport';
import { toErrorMessage } from '@/lib/errors';
import { colors } from '@/constants/colors';
import { usePagePermission } from '@/hooks/usePagePermission';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

export default function GenelRaporPage() {
  const contentPaddingBottom = useContentBottomPadding();
  usePagePermission({ module: 'raporlar' });
  useEffect(() => { logEvent('report_viewed', { report_type: 'general' }); }, []);
  const state = useReportRouteState();
  const { t } = useTranslation(['reports', 'common']);
  const { isletme } = useAuthContext();
  const { currency: baseCurrency } = useSettings();
  const [isExporting, setIsExporting] = useState(false);

  const { data: hesaplar, refetch: refetchHesaplar } = useHesaplar(false, false);
  const { data: exchangeRatesData, refetch: refetchRates } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;
  const financialSummary = useFinancialSummary();

  const { refreshing, onRefresh } = usePullToRefresh(refetchHesaplar, refetchRates);

  const normalHesaplar = hesaplar?.filter(h => h.type !== 'kredi_karti') || [];
  const krediKartiHesaplar = hesaplar?.filter(h => h.type === 'kredi_karti') || [];

  // Excel'e giden toplamlar EKRANDAKİ ile aynı politikadan geçmeli (GenelTabContent):
  // kur yoksa kalem hariç tutulur, `?? balance` ile 1:1 eklenmez.
  const sumBalances = (list: typeof normalHesaplar) => {
    const sum = createConversionSum(baseCurrency, exchangeRates);
    list.forEach((h) => sum.add(toNumber(h.balance), h.currency));
    return sum.total;
  };

  const normalHesaplarToplam = sumBalances(normalHesaplar);
  const krediKartiToplam = sumBalances(krediKartiHesaplar);

  const handleExport = useCallback(async () => {
    if (!isletme) return;
    setIsExporting(true);
    try {
      const translations: GenelDurumExcelTranslations = {
        reportTitle: t('common:export.genelDurumExcel.reportTitle'),
        createdAt: t('common:export.excel.createdAt'),
        business: t('common:export.excel.business'),
        generalStatus: t('common:export.genelDurumExcel.generalStatus'),
        netValue: t('common:export.genelDurumExcel.netValue'),
        accounts: t('common:export.genelDurumExcel.accounts'),
        receivables: t('reports:summary.receivables'),
        payables: t('reports:summary.payables'),
        accountBalances: t('common:export.genelDurumExcel.accountBalances'),
        accountName: t('common:export.genelDurumExcel.accountName'),
        balance: t('common:export.genelDurumExcel.balance'),
        total: t('common:export.reportExcel.total'),
        creditCardBalances: t('common:export.genelDurumExcel.creditCardBalances'),
        clientStatus: t('common:export.genelDurumExcel.clientStatus'),
        personnelStatus: t('common:export.genelDurumExcel.personnelStatus'),
        personnelReceivables: t('common:export.genelDurumExcel.personnelReceivables'),
        personnelDebt: t('common:export.genelDurumExcel.personnelDebt'),
        netStatus: t('common:export.genelDurumExcel.netStatus'),
        instant: t('common:export.genelDurumExcel.instant'),
        sheetName: t('common:export.genelDurumExcel.sheetName'),
        fileName: t('common:export.genelDurumExcel.fileName'),
        shareDialogTitle: t('common:export.shareDialogTitle'),
        sharingNotSupported: t('common:export.sharingNotSupported'),
      };
      await exportGenelDurumToExcel({
        isletmeName: isletme.name,
        baseCurrency,
        netValue: financialSummary.generalStatus,
        totalAccounts: financialSummary.accounts,
        totalReceivables: financialSummary.receivables.total,
        totalPayables: financialSummary.payables.total,
        normalHesaplar: normalHesaplar.map(h => ({
          name: h.name,
          balance: toNumber(h.balance),
          currency: h.currency || baseCurrency,
        })),
        normalHesaplarToplam,
        krediKartiHesaplar: krediKartiHesaplar.map(h => ({
          name: h.name,
          balance: toNumber(h.balance),
          currency: h.currency || baseCurrency,
        })),
        krediKartiToplam,
        cariReceivables: financialSummary.receivables.cari,
        cariPayables: financialSummary.payables.cari,
        personelReceivables: financialSummary.receivables.personel,
        personelDebt: financialSummary.payables.personel,
        translations,
      });
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('common:status.error'));
    } finally {
      setIsExporting(false);
    }
  }, [isletme, baseCurrency, financialSummary, normalHesaplar, krediKartiHesaplar, normalHesaplarToplam, krediKartiToplam, t]);

  return (
    <>
      <Stack.Screen
        options={{
          headerBackVisible: true,
          gestureEnabled: true,
          headerRight: () => (
            <ReportExportButton
              onPress={handleExport}
              isExporting={isExporting}
              accessibilityLabel={t('reports:export.exportExcel')}
            />
          ),
        }}
      />
      <Screen>
        <ScrollView
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          <GenelTabContent
            dateRange={state.dateRange}
            period={state.period}
            periodOffset={state.periodOffset}
            periodLabel={state.periodLabel}
          />
        </ScrollView>
      </Screen>
    </>
  );
}
