import { useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueries } from '@tanstack/react-query';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { formatCurrency, formatCurrencyWithSign, roundCurrency } from '@/lib/currency';
import { getLocale } from '@/lib/date';
import { getPeriodDateRange, type PeriodType } from '@/hooks/useIslemler';
import { useAuthContext } from '@/contexts/AuthContext';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { isIncomeType, isExpenseType, isIncomeReturnType, isExpenseReturnType } from '@/constants/islemTypes';
import type { IslemType } from '@/types/database';
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
  /** Günlük-takvim modunda gösterilen ay etiketi (ör. "Haziran 2026"); diğer modlarda null */
  monthLabel: string | null;
  /** Ekran/PDF sırasındaki satırlar (takvim modlarında eski→yeni, kayan modlarda yeni→eski) */
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

// Tarih aralığını gün sonuna kadar dahil et (useMonthSummary ile aynı mantık).
function normalizeRange(start: string, end: string) {
  return {
    startDateTime: start.includes('T') ? start : `${start}T00:00:00`,
    endDateTime: end.includes('T') ? end : `${end}T23:59:59`,
  };
}

/**
 * Karşılaştırma raporu. Dönem tipine göre "kovalar" (buckets) kurulur:
 *  - monthly → o TAKVİM YILININ 12 ayı (periodOffset = YIL offset'i); sol/sağ yılı değiştirir.
 *  - daily   → o TAKVİM AYININ günleri (periodOffset = AY offset'i); sol/sağ ayı değiştirir.
 *  - yearly/weekly → kayan 12 dönem (periodOffset = dönem offset'i).
 *
 * Kova sayısı değişken (ör. 28-31 gün) olabildiği için useQueries kullanılır.
 * queryKey + queryFn useMonthSummary ile birebir aynı → cache paylaşımlı; tutarlar
 * ana para birimine çevrilir. Gelecek/boş dönemler doğal olarak ₺0 döner.
 */
export function useComparisonReport(period: PeriodType, periodOffset: number): ComparisonReport {
  const { t } = useTranslation(['reports', 'common']);
  const { isletme } = useAuthContext();
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const rates = exchangeRatesData?.rates;
  const [isExporting, setIsExporting] = useState(false);

  const activePeriod = period || 'monthly';
  const activeOffset = periodOffset || 0;

  // Kovaları (offset + etiket) dönem tipine göre kur.
  const now = new Date();
  const buckets: { offset: number; label: string }[] = (() => {
    if (activePeriod === 'monthly') {
      // Takvim yılı: 12 ay. Her ay için bu aya göre ay-offset'i (activeOffset = yıl offset'i).
      return Array.from({ length: 12 }, (_, i) => {
        const off = activeOffset * 12 + (i - now.getMonth());
        return { offset: off, label: getPeriodDateRange('monthly', off).label };
      });
    }
    if (activePeriod === 'daily') {
      // Takvim ayı: o ayın günleri. activeOffset = ay offset'i; satır offset'i = gün offset'i.
      const targetMonth = new Date(now.getFullYear(), now.getMonth() + activeOffset, 1);
      const y = targetMonth.getFullYear();
      const m = targetMonth.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return Array.from({ length: daysInMonth }, (_, i) => {
        const dayDate = new Date(y, m, i + 1);
        const off = Math.round((dayDate.getTime() - todayMid.getTime()) / 86400000);
        // Kısa gün etiketi (ör. "15 Pzt")
        const label = dayDate.toLocaleDateString(getLocale(), { day: 'numeric', weekday: 'short' });
        return { offset: off, label };
      });
    }
    // yearly / weekly: kayan 12 dönem (eski davranış).
    return Array.from({ length: 12 }, (_, i) => {
      const off = activeOffset - 11 + i;
      return { offset: off, label: getPeriodDateRange(activePeriod, off).label };
    });
  })();

  const results = useQueries({
    queries: buckets.map((b) => {
      const { startDate, endDate } = getPeriodDateRange(activePeriod, b.offset);
      const { startDateTime, endDateTime } = normalizeRange(startDate, endDate);
      return {
        queryKey: queryKeys.reports.monthSummary(isletme?.id ?? '', activePeriod, b.offset, startDate, endDate),
        queryFn: async () => {
          if (!isletme) return { income: 0, expense: 0 };
          const { data, error } = await supabase.rpc('get_income_expense_summary', {
            p_isletme_id: isletme.id,
            p_start_date: startDateTime,
            p_end_date: endDateTime,
          });
          if (error) throw error;
          const result = { income: 0, expense: 0 };
          for (const row of (data || []) as Array<{ type: string; total: number | string }>) {
            const amount = Number(row.total) || 0;
            const type = row.type as IslemType;
            if (isIncomeType(type)) result.income += amount;
            else if (isIncomeReturnType(type)) result.income -= amount;
            if (isExpenseType(type)) result.expense += amount;
            else if (isExpenseReturnType(type)) result.expense -= amount;
          }
          return {
            income: Math.round(result.income * 100) / 100,
            expense: Math.round(result.expense * 100) / 100,
          };
        },
        enabled: !!isletme,
        staleTime: 5 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
      };
    }),
  });

  const isLoading = results.some((r) => r.isLoading);
  const error = (results.find((r) => r.error)?.error ?? null) as Error | null;

  // Kova verisini ana para birimine çevirip satırlara dönüştür (kronolojik: eski→yeni).
  const rowsData: ComparisonRow[] = buckets.map((b, index) => {
    const raw = results[index]?.data as { income: number; expense: number } | undefined;
    let income = raw?.income ?? 0;
    let expense = raw?.expense ?? 0;
    if (raw && baseCurrency !== 'TRY') {
      const ci = convertCurrency(income, 'TRY', baseCurrency, rates);
      const ce = convertCurrency(expense, 'TRY', baseCurrency, rates);
      income = ci === null ? income : roundCurrency(ci);
      expense = ce === null ? expense : roundCurrency(ce);
    }
    return { periodLabel: b.label, income, expense, net: income - expense, offset: b.offset };
  });

  const incomeTotal = rowsData.reduce((sum, m) => sum + m.income, 0);
  const expenseTotal = rowsData.reduce((sum, m) => sum + m.expense, 0);
  // Ortalama yalnız VERİ OLAN dönemler üzerinden — boş/gelecek dönemler (₺0) paydayı
  // şişirip ortalamayı yapay düşürmesin (satır gösterimindeki 'empty' tanımıyla aynı).
  const activeCount = rowsData.filter((m) => m.income !== 0 || m.expense !== 0).length || 1;
  const totals = {
    income: incomeTotal,
    expense: expenseTotal,
    net: incomeTotal - expenseTotal,
    avgIncome: incomeTotal / activeCount,
    avgExpense: expenseTotal / activeCount,
    avgNet: (incomeTotal - expenseTotal) / activeCount,
  };

  // Takvim modları (monthly/daily): kronolojik (en eski üstte). Kayan modlar: en yeni üstte.
  const calendarMode = activePeriod === 'monthly' || activePeriod === 'daily';
  const displayRows = calendarMode ? rowsData : [...rowsData].reverse();

  const exportPdf = async () => {
    // Veriler yüklenmeden export, tüm dönemleri ₺0,00 gösteren "geçerli görünümlü" PDF üretir
    if (isLoading) return;
    try {
      setIsExporting(true);
      const rangeLabel =
        rowsData.length > 0
          ? `${rowsData[0].periodLabel} - ${rowsData[rowsData.length - 1].periodLabel}`
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
    } catch (err) {
      if (__DEV__) console.error('[useComparisonReport] PDF export error:', err);
      Alert.alert(t('common:status.error'));
    } finally {
      setIsExporting(false);
    }
  };

  return {
    period: activePeriod,
    year: activePeriod === 'monthly' ? now.getFullYear() + activeOffset : null,
    monthLabel: activePeriod === 'daily' ? getPeriodDateRange('monthly', activeOffset).label : null,
    displayRows,
    totals,
    isLoading,
    error,
    refetch: () => Promise.all(results.map((r) => r.refetch())),
    isExporting,
    exportPdf,
  };
}
