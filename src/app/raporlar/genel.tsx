import { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Share2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { GenelTabContent } from '@/components/reports/tabs';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { useAuthContext } from '@/contexts/AuthContext';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { toNumber } from '@/lib/currency';
import { exportGenelDurumToExcel, GenelDurumExcelTranslations } from '@/lib/reportExcelExport';
import { toErrorMessage } from '@/lib/errors';
import { colors } from '@/constants/colors';

export default function GenelRaporPage() {
  const state = useReportRouteState();
  const { t } = useTranslation(['reports', 'common']);
  const { isletme } = useAuthContext();
  const { currency: baseCurrency } = useSettings();
  const [isExporting, setIsExporting] = useState(false);

  const { data: hesaplar } = useHesaplar(false, false);
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;
  const financialSummary = useFinancialSummary();

  const normalHesaplar = hesaplar?.filter(h => h.type !== 'kredi_karti') || [];
  const krediKartiHesaplar = hesaplar?.filter(h => h.type === 'kredi_karti') || [];

  const convertBalance = (h: typeof normalHesaplar[0]) => {
    const balance = toNumber(h.balance);
    const currency = h.currency || baseCurrency;
    if (currency === baseCurrency) return balance;
    return convertCurrency(balance, currency, baseCurrency, exchangeRates) ?? balance;
  };

  const normalHesaplarToplam = normalHesaplar.reduce((acc, h) => acc + convertBalance(h), 0);
  const krediKartiToplam = krediKartiHesaplar.reduce((acc, h) => acc + convertBalance(h), 0);

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
          headerRight: () => (
            <TouchableOpacity
              onPress={handleExport}
              disabled={isExporting}
              style={styles.headerBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Share2 size={22} color={colors.text} />
              )}
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <GenelTabContent
            dateRange={state.dateRange}
            period={state.period}
            periodOffset={state.periodOffset}
            periodLabel={state.periodLabel}
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
  headerBtn: {
    padding: 6,
  },
});
