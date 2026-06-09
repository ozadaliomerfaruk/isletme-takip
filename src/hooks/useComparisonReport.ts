import { useState, useMemo, useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { formatCurrency } from '@/lib/currency';
import { useMonthSummary, type PeriodType } from '@/hooks/useIslemler';
import { useAuthContext } from '@/contexts/AuthContext';
import { logEvent } from '@/lib/appEvents';
import { buildComparisonPdfHtml } from '@/lib/comparisonPdf';

export interface ComparisonRow {
  periodLabel: string;
  income: number;
  expense: number;
  net: number;
}

export interface ComparisonReport {
  /** En yeni dönem üstte (ekran/PDF sırası) */
  displayRows: ComparisonRow[];
  totals: {
    income: number;
    expense: number;
    net: number;
    avgIncome: number;
    avgExpense: number;
    avgNet: number;
  };
  isLoading: boolean;
  isExporting: boolean;
  exportPdf: () => Promise<void>;
}

/**
 * Karşılaştırma raporu: seçili dönem/offset'e göre son 12 dönemin gelir/gider/net
 * özeti + PDF dışa aktarımı. Tutarlar useMonthSummary tarafından ana para birimine
 * çevrilmiş gelir. Veri ekran seviyesinde tutulur ki header butonu da erişebilsin.
 */
export function useComparisonReport(period: PeriodType, periodOffset: number): ComparisonReport {
  const { t } = useTranslation(['reports', 'common']);
  const { isletme } = useAuthContext();
  const [isExporting, setIsExporting] = useState(false);

  const activePeriod = period || 'monthly';
  const activeOffset = periodOffset || 0;

  // 12 dönem: kayan pencere (en eski -> en yeni)
  const p1 = useMonthSummary(activePeriod, activeOffset - 11);
  const p2 = useMonthSummary(activePeriod, activeOffset - 10);
  const p3 = useMonthSummary(activePeriod, activeOffset - 9);
  const p4 = useMonthSummary(activePeriod, activeOffset - 8);
  const p5 = useMonthSummary(activePeriod, activeOffset - 7);
  const p6 = useMonthSummary(activePeriod, activeOffset - 6);
  const p7 = useMonthSummary(activePeriod, activeOffset - 5);
  const p8 = useMonthSummary(activePeriod, activeOffset - 4);
  const p9 = useMonthSummary(activePeriod, activeOffset - 3);
  const p10 = useMonthSummary(activePeriod, activeOffset - 2);
  const p11 = useMonthSummary(activePeriod, activeOffset - 1);
  const p12 = useMonthSummary(activePeriod, activeOffset);

  const periods = [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12];
  const isLoading = periods.some((p) => p.isLoading);

  // Kronolojik sıra (en eski -> en yeni)
  const monthsData = useMemo(
    () =>
      periods.map((s) => {
        const income = s.data?.income ?? 0;
        const expense = s.data?.expense ?? 0;
        return { periodLabel: s.periodLabel, income, expense, net: income - expense };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    periods
  );

  const totals = useMemo(() => {
    const income = monthsData.reduce((sum, m) => sum + m.income, 0);
    const expense = monthsData.reduce((sum, m) => sum + m.expense, 0);
    const count = monthsData.length || 1;
    return {
      income,
      expense,
      net: income - expense,
      avgIncome: income / count,
      avgExpense: expense / count,
      avgNet: (income - expense) / count,
    };
  }, [monthsData]);

  // Ekranda/PDF'te en yeni dönem üstte
  const displayRows = useMemo(() => [...monthsData].reverse(), [monthsData]);

  const exportPdf = useCallback(async () => {
    try {
      setIsExporting(true);
      const rangeLabel =
        monthsData.length > 0
          ? `${monthsData[0].periodLabel} - ${monthsData[monthsData.length - 1].periodLabel}`
          : '';
      const html = buildComparisonPdfHtml({
        title: t('reports:titles.comparison'),
        businessName: isletme?.name || '',
        rangeLabel,
        generatedLabel: t('common:export.pdf.date'),
        generatedValue: new Date().toLocaleDateString(),
        labels: {
          period: t('reports:comparison.period'),
          income: t('reports:summary.income'),
          expense: t('reports:summary.expense'),
          net: t('reports:comparison.net'),
          total: t('reports:comparison.total'),
          average: t('reports:comparison.average'),
        },
        rows: displayRows.map((r) => ({
          label: r.periodLabel,
          income: r.income,
          expense: r.expense,
          net: r.net,
        })),
        totals: { income: totals.income, expense: totals.expense, net: totals.net },
        averages: { income: totals.avgIncome, expense: totals.avgExpense, net: totals.avgNet },
        formatAmount: (value: number) => formatCurrency(value),
      });

      const { uri } = await Print.printToFileAsync({ html });
      logEvent('export_completed', { format: 'pdf' });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: t('reports:titles.comparison'),
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(t('common:export.sharingNotSupported'));
      }
    } catch (error) {
      if (__DEV__) console.error('[useComparisonReport] PDF export error:', error);
      Alert.alert(t('common:status.error'));
    } finally {
      setIsExporting(false);
    }
  }, [monthsData, displayRows, totals, isletme, t]);

  return { displayRows, totals, isLoading, isExporting, exportPdf };
}
