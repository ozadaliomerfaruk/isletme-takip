import { useState, useMemo, useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { formatCurrency, formatCurrencyWithSign } from '@/lib/currency';
import { getLocale } from '@/lib/date';
import { useMonthSummary, type PeriodType } from '@/hooks/useIslemler';
import { useAuthContext } from '@/contexts/AuthContext';
import { logEvent } from '@/lib/appEvents';
import { buildComparisonPdfHtml } from '@/lib/comparisonPdf';

export interface ComparisonRow {
  periodLabel: string;
  income: number;
  expense: number;
  net: number;
  /** Bu döneme ait dönem-offset'i (detay raporuna filtreli geçiş için) */
  offset: number;
}

export interface ComparisonReport {
  /** Aktif dönem tipi (detay raporuna geçişte kullanılır) */
  period: PeriodType;
  /** Aylık-takvim modunda gösterilen takvim yılı (başlık için); diğer modlarda null */
  year: number | null;
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
  error: Error | null;
  refetch: () => Promise<unknown>;
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

  // Aylık modda karşılaştırma TAKVİM YILI gösterir: burada periodOffset = YIL offset'i
  // (0 = bu yıl, -1 = geçen yıl). 12 satır = o yılın Ocak–Aralık'ı; her ay için bu aya
  // göre ay-offset'i hesaplanır (activeOffset*12 + (i - bu ay)). Gelecek/boş aylar
  // useMonthSummary'den doğal olarak ₺0 döner. Diğer dönem tiplerinde eski davranış
  // korunur: [activeOffset-11 .. activeOffset] kayan 12 dönem.
  const monthOffsets =
    activePeriod === 'monthly'
      ? Array.from({ length: 12 }, (_, i) => activeOffset * 12 + (i - new Date().getMonth()))
      : Array.from({ length: 12 }, (_, i) => activeOffset - 11 + i);

  const p1 = useMonthSummary(activePeriod, monthOffsets[0]);
  const p2 = useMonthSummary(activePeriod, monthOffsets[1]);
  const p3 = useMonthSummary(activePeriod, monthOffsets[2]);
  const p4 = useMonthSummary(activePeriod, monthOffsets[3]);
  const p5 = useMonthSummary(activePeriod, monthOffsets[4]);
  const p6 = useMonthSummary(activePeriod, monthOffsets[5]);
  const p7 = useMonthSummary(activePeriod, monthOffsets[6]);
  const p8 = useMonthSummary(activePeriod, monthOffsets[7]);
  const p9 = useMonthSummary(activePeriod, monthOffsets[8]);
  const p10 = useMonthSummary(activePeriod, monthOffsets[9]);
  const p11 = useMonthSummary(activePeriod, monthOffsets[10]);
  const p12 = useMonthSummary(activePeriod, monthOffsets[11]);

  const periods = [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12];
  const isLoading = periods.some((p) => p.isLoading);
  const error = (periods.find((p) => p.error)?.error ?? null) as Error | null;

  // Kronolojik sıra (en eski -> en yeni)
  const monthsData = useMemo(
    () =>
      periods.map((s, index) => {
        const income = s.data?.income ?? 0;
        const expense = s.data?.expense ?? 0;
        // periods[0]=p1 (en eski) -> offset = activeOffset - 11; periods[11]=p12 -> activeOffset
        return {
          periodLabel: s.periodLabel,
          income,
          expense,
          net: income - expense,
          offset: monthOffsets[index],
        };
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

  // Aylık (takvim yılı): Ocak üstte → Aralık altta (doğal takvim sırası).
  // Diğer dönem tipleri: en yeni dönem üstte (kayan pencere).
  const displayRows = useMemo(
    () => (activePeriod === 'monthly' ? monthsData : [...monthsData].reverse()),
    [monthsData, activePeriod]
  );

  const exportPdf = useCallback(async () => {
    // Veriler yüklenmeden export, tüm dönemleri ₺0,00 gösteren "geçerli görünümlü" PDF üretir
    if (isLoading) return;
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
        generatedValue: new Date().toLocaleDateString(getLocale()),
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
        // formatCurrency mutlak değer basar; negatif net (zarar) PDF'te işaretsiz
        // kalıp kâr gibi okunuyordu. Negatiflerde işaretli format kullan.
        formatAmount: (value: number) =>
          value < 0 ? formatCurrencyWithSign(value) : formatCurrency(value),
      });

      const { uri } = await Print.printToFileAsync({ html });
      logEvent('export_completed', { format: 'pdf', export_type: 'report', report_type: 'comparison' });

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
  }, [monthsData, displayRows, totals, isletme, t, isLoading]);

  return {
    period: activePeriod,
    year: activePeriod === 'monthly' ? new Date().getFullYear() + activeOffset : null,
    displayRows,
    totals,
    isLoading,
    error,
    refetch: () => Promise.all(periods.map((p) => p.refetch())),
    isExporting,
    exportPdf,
  };
}
