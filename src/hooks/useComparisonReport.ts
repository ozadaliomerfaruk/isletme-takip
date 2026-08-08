import { useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueries, useQuery } from '@tanstack/react-query';
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
import { usePermissions } from '@/hooks/usePermissions';
import {
  formatReportLensValue,
  reportLensCurrency,
  type HistoricalIncomeExpenseLens,
  type IncomeExpenseLens,
} from '@/lib/reportLens';
import {
  exportComparisonReportToExcel,
  type ComparisonExcelTranslations,
} from '@/lib/reportExcelExport';

export interface ComparisonRow {
  periodLabel: string;
  income: number;
  expense: number;
  net: number;
  /** Bu döneme ait dönem-offset'i (detay raporuna filtreli geçiş için) */
  offset: number;
}

export interface ComparisonReport {
  lens: IncomeExpenseLens;
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
  conversionIncomplete: boolean;
  missingRateCount: number;
  refetch: () => Promise<unknown>;
  isExporting: boolean;
  isExportingPdf: boolean;
  isExportingExcel: boolean;
  exportPdf: () => Promise<void>;
  exportExcel: () => Promise<void>;
}

interface HistoricalComparisonRow {
  bucket_index: number;
  income: number | string;
  expense: number | string;
}

interface HistoricalComparisonPayload {
  rows?: HistoricalComparisonRow[];
  conversion_incomplete?: boolean;
  missing_rate_count?: number | string;
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
export function useComparisonReport(
  period: PeriodType,
  periodOffset: number,
  lens: IncomeExpenseLens = 'nominal',
): ComparisonReport {
  const { t } = useTranslation(['reports', 'common']);
  const { isletme, user } = useAuthContext();
  const { canAccessModule, canSeeAllUsersData } = usePermissions();
  // Karşılaştırma işletme-geneli bir rapordur. Raporlar izni tek başına
  // aggregate RPC'yi ve aynı aggregate veriden üretilen PDF'i açar.
  const reportsEnabled = canAccessModule('raporlar');
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const rates = exchangeRatesData?.rates;
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'excel' | null>(null);
  const isExporting = exportingFormat !== null;

  const activePeriod = period || 'monthly';
  const activeOffset = periodOffset || 0;
  const lensLabel = t(
    `reports:incomeExpenseLens.${lens === 'reel'
      ? 'real'
      : lens === 'altin'
        ? 'gold'
        : lens}`,
  );

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

  const bucketRanges = buckets.map((bucket) => {
    const { startDate, endDate } = getPeriodDateRange(activePeriod, bucket.offset);
    const { startDateTime, endDateTime } = normalizeRange(startDate, endDate);
    return { startDate, endDate, startDateTime, endDateTime };
  });

  const results = useQueries({
    queries: buckets.map((b, bucketIndex) => {
      const { startDate, endDate, startDateTime, endDateTime } = bucketRanges[bucketIndex];
      return {
        queryKey: queryKeys.reports.monthSummary(isletme?.id ?? '', activePeriod, b.offset, startDate, endDate),
        queryFn: async () => {
          if (!reportsEnabled || !isletme) return { income: 0, expense: 0 };
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
        enabled: lens === 'nominal' && reportsEnabled && !!isletme,
        staleTime: 5 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
      };
    }),
  });

  const historicalQuery = useQuery({
    queryKey: queryKeys.reports.comparisonLens(
      isletme?.id ?? '',
      user?.id ?? '',
      `all:${Number(canSeeAllUsersData)}`,
      lens,
      bucketRanges.map((range) => `${range.startDateTime}/${range.endDateTime}`).join('|'),
    ),
    queryFn: async (): Promise<HistoricalComparisonPayload> => {
      if (!reportsEnabled || !isletme || lens === 'nominal') {
        return { rows: [], conversion_incomplete: false, missing_rate_count: 0 };
      }
      const { data, error: rpcError } = await supabase.rpc(
        'get_income_expense_comparison_lens_v1',
        {
          p_isletme_id: isletme.id,
          p_start_dates: bucketRanges.map((range) => range.startDateTime),
          p_end_dates: bucketRanges.map((range) => range.endDateTime),
          p_lens: lens as HistoricalIncomeExpenseLens,
        },
      );
      if (rpcError) throw rpcError;
      return (data ?? {}) as HistoricalComparisonPayload;
    },
    enabled: lens !== 'nominal' && reportsEnabled && !!isletme,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    meta: {
      persist: false,
      query_purpose: 'reports:comparison-lens-v1',
    },
  });

  const isLoading = lens === 'nominal'
    ? results.some((r) => r.isLoading)
    : historicalQuery.isLoading;
  const error = (lens === 'nominal'
    ? results.find((r) => r.error)?.error
    : historicalQuery.error) as Error | null;
  const historicalRows = new Map(
    (historicalQuery.data?.rows ?? []).map((row) => [Number(row.bucket_index), row]),
  );

  // Kova verisini ana para birimine çevirip satırlara dönüştür (kronolojik: eski→yeni).
  const rowsData: ComparisonRow[] = buckets.map((b, index) => {
    const nominalRaw = lens === 'nominal'
      ? results[index]?.data as { income: number; expense: number } | undefined
      : undefined;
    const historicalRaw = lens === 'nominal' ? undefined : historicalRows.get(index);
    let income = nominalRaw?.income ?? Number(historicalRaw?.income ?? 0);
    let expense = nominalRaw?.expense ?? Number(historicalRaw?.expense ?? 0);
    if (nominalRaw && baseCurrency !== 'TRY') {
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
  const historicalConversionIncomplete = lens !== 'nominal'
    && historicalQuery.data?.conversion_incomplete === true;
  const historicalMissingRateCount = lens === 'nominal'
    ? 0
    : Number(historicalQuery.data?.missing_rate_count ?? 0);

  const canExportCompleteHistoricalResult = () => {
    if (!historicalConversionIncomplete) return true;
    Alert.alert(
      t('reports:incomeExpenseLens.exportBlockedTitle'),
      t('reports:incomeExpenseLens.exportBlockedIncomplete', {
        count: historicalMissingRateCount,
      }),
    );
    return false;
  };

  const exportPdf = async () => {
    // Veriler yüklenmeden export, tüm dönemleri ₺0,00 gösteren "geçerli görünümlü" PDF üretir
    if (!reportsEnabled || isLoading || !canExportCompleteHistoricalResult()) return;
    try {
      setExportingFormat('pdf');
      const rangeLabel =
        rowsData.length > 0
          ? `${rowsData[0].periodLabel} - ${rowsData[rowsData.length - 1].periodLabel}`
          : '';
      const html = buildComparisonPdfHtml({
        title: `${t('reports:titles.comparison')} - ${lensLabel}`,
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
        formatAmount: (value: number) => lens === 'nominal'
          ? (value < 0 ? formatCurrencyWithSign(value) : formatCurrency(value))
          : formatReportLensValue(value, lens),
      });

      const { uri } = await Print.printToFileAsync({ html });
      logEvent('export_completed', {
        format: 'pdf',
        export_type: 'report',
        report_type: 'comparison',
        lens,
      });

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
      setExportingFormat(null);
    }
  };

  const exportExcel = async () => {
    if (
      !reportsEnabled
      || isLoading
      || !isletme
      || !canExportCompleteHistoricalResult()
    ) return;
    try {
      setExportingFormat('excel');
      const rangeLabel = rowsData.length > 0
        ? `${rowsData[0].periodLabel} - ${rowsData[rowsData.length - 1].periodLabel}`
        : '';
      const translations: ComparisonExcelTranslations = {
        reportTitle: `${t('reports:titles.comparison')} - ${lensLabel}`,
        period: t('reports:comparison.period'),
        createdAt: t('common:export.excel.createdAt'),
        business: t('common:export.excel.business'),
        income: t('reports:summary.income'),
        expense: t('reports:summary.expense'),
        net: t('reports:comparison.net'),
        total: t('reports:comparison.total'),
        average: t('reports:comparison.average'),
        sheetName: t('common:export.reportExcel.comparisonSheetName'),
        fileName: t('common:export.reportExcel.comparisonFileName'),
        shareDialogTitle: t('common:export.shareDialogTitle'),
        sharingNotSupported: t('common:export.sharingNotSupported'),
        noDataError: t('common:export.noDataToExport'),
      };

      await exportComparisonReportToExcel({
        isletmeName: isletme.name || '',
        rangeLabel,
        currency: reportLensCurrency(lens) ?? baseCurrency,
        rows: displayRows.map((row) => ({
          label: row.periodLabel,
          income: row.income,
          expense: row.expense,
          net: row.net,
        })),
        totals: {
          income: totals.income,
          expense: totals.expense,
          net: totals.net,
        },
        averages: {
          income: totals.avgIncome,
          expense: totals.avgExpense,
          net: totals.avgNet,
        },
        translations,
      });
      logEvent('export_completed', {
        format: 'excel',
        export_type: 'report',
        report_type: 'comparison',
        lens,
      });
    } catch (err) {
      if (__DEV__) console.error('[useComparisonReport] Excel export error:', err);
      Alert.alert(t('common:status.error'));
    } finally {
      setExportingFormat(null);
    }
  };

  return {
    lens,
    period: activePeriod,
    year: activePeriod === 'monthly' ? now.getFullYear() + activeOffset : null,
    monthLabel: activePeriod === 'daily' ? getPeriodDateRange('monthly', activeOffset).label : null,
    displayRows,
    totals,
    isLoading,
    error,
    conversionIncomplete: historicalConversionIncomplete,
    missingRateCount: historicalMissingRateCount,
    refetch: () => lens === 'nominal'
      ? Promise.all(results.map((r) => r.refetch()))
      : historicalQuery.refetch(),
    isExporting,
    isExportingPdf: exportingFormat === 'pdf',
    isExportingExcel: exportingFormat === 'excel',
    exportPdf,
    exportExcel,
  };
}
