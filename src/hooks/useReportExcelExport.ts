/**
 * Report Excel Export Hook
 * Gelir/Gider rapor sayfalarındaki işlemleri export etmek için hook
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  exportIncomeExpenseLensSummaryToExcel,
  exportReportToExcel,
  type IncomeExpenseLensSummaryExcelRow,
  type IncomeExpenseLensSummaryExcelTranslations,
  type ReportExcelTranslations,
  type ReportType,
} from '@/lib/reportExcelExport';
import { logEvent } from '@/lib/appEvents';
import { useAuthContext } from '@/contexts/AuthContext';
import { useSettings } from '@/hooks/useSettings';
import { supabase } from '@/lib/supabase';
import { IslemWithRelations } from '@/types/database';
import { formatDateForDB } from '@/lib/date';
import { fetchAllPages } from '@/lib/supabaseHelpers';
import { INCOME_TYPES, EXPENSE_TYPES, INCOME_RETURN_TYPES, EXPENSE_RETURN_TYPES } from '@/constants/islemTypes';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { toErrorMessage } from '@/lib/errors';
import { usePermissions } from '@/hooks/usePermissions';
import {
  parseCategoryReportTransactionRows,
  parseReportCategoryReferenceRows,
} from '@/lib/reportPermissionProjection';

interface UseReportExcelExportReturn {
  isExporting: boolean;
  canExport: boolean;
  exportReport: (startDate: string, endDate: string, periodLabel: string) => Promise<void>;
  exportLensSummary: (options: ReportLensSummaryExportOptions) => Promise<void>;
}

export interface ReportLensSummaryExportOptions {
  startDate: string;
  endDate: string;
  periodLabel: string;
  lens: 'reel' | 'usd' | 'eur' | 'altin';
  lensLabel: string;
  lensDescription: string;
  dimensionLabel?: string;
  currency: string;
  rows: IncomeExpenseLensSummaryExcelRow[];
  totalAmount: number;
  conversionIncomplete: boolean;
  missingRateCount: number;
}

const SHARED_EXPORT_PAGE_SIZE = 100;
const SHARED_EXPORT_MAX_PAGES = 1000;
const SHARED_EXPORT_CATEGORY_BATCH_SIZE = 100;

async function fetchSharedReportExportTransactions(params: {
  isletmeId: string;
  reportType: ReportType;
  startDate: string;
  endDate: string;
}): Promise<IslemWithRelations[]> {
  const { data: categoryData, error: categoryError } = await supabase.rpc(
    'get_rapor_kategori_referanslari_v1',
    {
      p_isletme_id: params.isletmeId,
      p_type: params.reportType,
    },
  );
  if (categoryError) throw categoryError;

  const categoryIds = parseReportCategoryReferenceRows(categoryData)
    .map((category) => category.id);
  const categoryBatches: string[][] = [];
  for (
    let index = 0;
    index < categoryIds.length;
    index += SHARED_EXPORT_CATEGORY_BATCH_SIZE
  ) {
    categoryBatches.push(
      categoryIds.slice(index, index + SHARED_EXPORT_CATEGORY_BATCH_SIZE),
    );
  }
  if (categoryBatches.length === 0) categoryBatches.push([]);

  const transactions = new Map<string, IslemWithRelations>();
  const startDateTime = params.startDate.includes('T')
    ? params.startDate
    : `${params.startDate}T00:00:00`;
  const endDateTime = params.endDate.includes('T')
    ? params.endDate
    : `${params.endDate}T23:59:59`;

  for (const categoryBatch of categoryBatches) {
    let beforeDate: string | null = null;
    let beforeId: string | null = null;
    let batchCompleted = false;

    for (
      let pageIndex = 0;
      pageIndex < SHARED_EXPORT_MAX_PAGES;
      pageIndex += 1
    ) {
      const { data, error } = await supabase.rpc(
        'get_kategori_rapor_islem_satirlari_v1',
        {
          p_isletme_id: params.isletmeId,
          p_kategori_ids: categoryBatch,
          // Kategorisizler her batch'te gelebilir; aşağıdaki Map aynı işlem
          // kimliğini tekilleştirir.
          p_include_uncategorized: true,
          p_direction: params.reportType,
          p_source: 'income-expense',
          p_include_returns: true,
          p_start_date: startDateTime,
          p_end_date: endDateTime,
          p_limit: SHARED_EXPORT_PAGE_SIZE,
          p_before_date: beforeDate,
          p_before_id: beforeId,
        },
      );
      if (error) throw error;

      const page = parseCategoryReportTransactionRows(
        data,
        params.isletmeId,
      );
      page.forEach((transaction) => {
        if (!transactions.has(transaction.id)) {
          transactions.set(transaction.id, transaction);
        }
      });
      if (page.length < SHARED_EXPORT_PAGE_SIZE) {
        batchCompleted = true;
        break;
      }

      const last = page[page.length - 1];
      const nextDate = last.date;
      const nextId = last.id;
      if (beforeDate === nextDate && beforeId === nextId) {
        throw new Error('Shared report export cursor did not advance');
      }
      beforeDate = nextDate;
      beforeId = nextId;
    }

    if (!batchCompleted) {
      throw new Error('Shared report export page limit exceeded');
    }
  }

  return [...transactions.values()];
}

export function useReportExcelExport(reportType: ReportType): UseReportExcelExportReturn {
  const { isletme, user } = useAuthContext();
  const { canExportModule, isOwner } = usePermissions();
  const { currency: baseCurrency } = useSettings();
  // Karışık para birimli dönemde Excel toplamlarını ana para birimine çevirmek için.
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  // Raporlar izni tek başına export'u açar. Owner mevcut detay sorgusunu,
  // reports-only kullanıcı yalnız dar kategori/drilldown RPC'lerini kullanır.
  const canExport = canExportModule('raporlar');
  const latestExportAccessRef = useRef({
    canExport,
    isletmeId: isletme?.id ?? null,
    userId: user?.id ?? null,
  });
  latestExportAccessRef.current = {
    canExport,
    isletmeId: isletme?.id ?? null,
    userId: user?.id ?? null,
  };

  useEffect(() => () => {
    // Ekran/oturum kapanırken devam eden geniş sorgu dosya üretimine geçmesin.
    latestExportAccessRef.current.canExport = false;
  }, []);

  const exportReport = useCallback(
    async (startDate: string, endDate: string, periodLabel: string) => {
      if (!canExport) {
        Alert.alert(t('common:status.error'), t('common:errors.permissionDenied'));
        return;
      }
      if (!isletme) {
        Alert.alert(t('common:status.error'), t('common:empty.noData'));
        return;
      }

      const translations: ReportExcelTranslations = {
        reportTitle: reportType === 'gelir'
          ? t('reports:titles.incomeAnalysis')
          : t('reports:titles.expenseAnalysis'),
        period: t('common:export.excel.period'),
        createdAt: t('common:export.excel.createdAt'),
        business: t('common:export.excel.business'),
        date: t('common:export.excel.date'),
        description: t('common:export.excel.description'),
        category: t('common:export.excel.category'),
        account: t('common:export.excel.accountColumn'),
        clientStaff: t('common:export.reportExcel.clientStaff'),
        amount: t('common:export.reportExcel.amount'),
        total: t('common:export.reportExcel.total'),
        transactionCount: t('common:export.reportExcel.transactionCount'),
        categoryBreakdown: t('common:export.reportExcel.categoryBreakdown'),
        sheetName: t('common:export.reportExcel.sheetName'),
        fileName: reportType === 'gelir'
          ? t('common:export.reportExcel.incomeFileName')
          : t('common:export.reportExcel.expenseFileName'),
        shareDialogTitle: t('common:export.shareDialogTitle'),
        sharingNotSupported: t('common:export.sharingNotSupported'),
        transactionTypes: {
          gelir: t('transactions:types.gelir'),
          gider: t('transactions:types.gider'),
          cari_alis: t('transactions:types.cari_alis'),
          cari_satis: t('transactions:types.cari_satis'),
          personel_gider: t('transactions:types.personel_gider'),
          personel_satis: t('transactions:types.personel_satis'),
        },
        noDataError: t('common:export.noDataToExport'),
      };

      setIsExporting(true);

      try {
        const expectedIsletmeId = isletme.id;
        const expectedUserId = user?.id ?? null;
        const endDateTime = new Date(endDate + 'T00:00:00');
        endDateTime.setDate(endDateTime.getDate() + 1);
        const endDateNextDay = formatDateForDB(endDateTime);

        // İADE TİPLERİ DE ÇEKİLİR. Ekranın kaynağı (get_category_report + iade sorgusu)
        // toplamı NET veriyor; export ise yalnız INCOME/EXPENSE çekip BRÜT veriyordu →
        // iadesi olan her dönemde Excel'in "TOPLAM"ı ekrandan iade tutarı kadar YÜKSEK
        // çıkıyordu. Netleme reportExcelExport içinde isReturnType ile yapılır.
        const islemTypes = reportType === 'gelir'
          ? [...INCOME_TYPES, ...INCOME_RETURN_TYPES]
          : [...EXPENSE_TYPES, ...EXPENSE_RETURN_TYPES];

        const buildQuery = () => {
          return supabase
            .from('islemler')
            .select(`
              *,
              hesap:hesaplar!islemler_hesap_id_fkey(id,name,currency,type,is_active),
              hedef_hesap:hesaplar!islemler_hedef_hesap_id_fkey(id,name,currency,type,is_active),
              kategori:kategoriler(id,name),
              cari:cariler(id,name,type,is_active,currency),
              personel:personel(id,first_name,last_name,is_active,currency)
            `)
            .eq('isletme_id', isletme.id)
            .in('type', islemTypes)
            .gte('date', startDate)
            .lt('date', endDateNextDay)
            .order('date', { ascending: true });
        };

        const transactions = isOwner
          ? await fetchAllPages<IslemWithRelations>(buildQuery)
          : await fetchSharedReportExportTransactions({
              isletmeId: isletme.id,
              reportType,
              startDate,
              endDate,
            });

        const latestAccess = latestExportAccessRef.current;
        if (
          !latestAccess.canExport
          || latestAccess.isletmeId !== expectedIsletmeId
          || latestAccess.userId !== expectedUserId
        ) {
          Alert.alert(t('common:status.error'), t('common:errors.permissionDenied'));
          return;
        }

        // Ekran raporuyla TUTARLI olsun: ekran get_category_report RPC'si pasif
        // hesap/cari/personel islemlerini disliyor; export da aynisini yapsin.
        // NULL-guvenli: yalnizca ACIKCA pasif (is_active === false) kayitlar dislanir;
        // is_active true/undefined olanlar (ve hesap_id'siz islemler) raporda kalir -> veri kaybi yok.
        const visibleTransactions = transactions.filter((islem) => {
          if (islem.hesap?.is_active === false) return false;
          if (islem.hedef_hesap?.is_active === false) return false;
          if (islem.cari?.is_active === false) return false;
          if (islem.personel?.is_active === false) return false;
          return true;
        });

        await exportReportToExcel({
          reportType,
          isletmeName: isletme.name,
          startDate,
          endDate,
          periodLabel,
          transactions: visibleTransactions,
          baseCurrency,
          exchangeRates,
          translations,
        });
        logEvent('export_completed', { format: 'excel', export_type: 'report', report_type: reportType });
      } catch (error) {
        console.error('Report Excel export error:', error);
        Alert.alert(
          t('common:status.error'),
          toErrorMessage(error) || t('common:status.error')
        );
      } finally {
        setIsExporting(false);
      }
    },
    [
      reportType,
      isletme,
      user?.id,
      baseCurrency,
      exchangeRates,
      t,
      canExport,
      isOwner,
    ]
  );

  const exportLensSummary = useCallback(
    async (options: ReportLensSummaryExportOptions) => {
      if (!canExport) {
        Alert.alert(t('common:status.error'), t('common:errors.permissionDenied'));
        return;
      }
      if (!isletme) {
        Alert.alert(t('common:status.error'), t('common:empty.noData'));
        return;
      }
      if (options.conversionIncomplete) {
        Alert.alert(
          t('reports:incomeExpenseLens.exportBlockedTitle'),
          t('reports:incomeExpenseLens.exportBlockedIncomplete', {
            count: options.missingRateCount,
          }),
        );
        return;
      }

      const expectedIsletmeId = isletme.id;
      const expectedUserId = user?.id ?? null;
      const latestAccess = latestExportAccessRef.current;
      if (
        !latestAccess.canExport
        || latestAccess.isletmeId !== expectedIsletmeId
        || latestAccess.userId !== expectedUserId
      ) {
        Alert.alert(t('common:status.error'), t('common:errors.permissionDenied'));
        return;
      }

      const translations: IncomeExpenseLensSummaryExcelTranslations = {
        reportTitle: `${reportType === 'gelir'
          ? t('reports:titles.incomeAnalysis')
          : t('reports:titles.expenseAnalysis')} - ${options.lensLabel}`,
        period: t('common:export.excel.period'),
        createdAt: t('common:export.excel.createdAt'),
        business: t('common:export.excel.business'),
        lens: t('reports:incomeExpenseLens.title'),
        category: options.dimensionLabel ?? t('common:export.excel.category'),
        transactionCount: t('common:export.reportExcel.transactionCount'),
        amount: `${t('common:export.reportExcel.amount')} (${options.lensLabel})`,
        total: t('common:export.reportExcel.total'),
        sheetName: t('common:export.reportExcel.sheetName'),
        fileName: reportType === 'gelir'
          ? t('common:export.reportExcel.incomeFileName')
          : t('common:export.reportExcel.expenseFileName'),
        shareDialogTitle: t('common:export.shareDialogTitle'),
        sharingNotSupported: t('common:export.sharingNotSupported'),
        noDataError: t('common:export.noDataToExport'),
      };

      setIsExporting(true);
      try {
        await exportIncomeExpenseLensSummaryToExcel({
          isletmeName: isletme.name,
          startDate: options.startDate,
          endDate: options.endDate,
          periodLabel: options.periodLabel,
          lensLabel: options.lensLabel,
          lensDescription: options.lensDescription,
          currency: options.currency,
          rows: options.rows,
          totalAmount: options.totalAmount,
          translations,
        });
        logEvent('export_completed', {
          format: 'excel',
          export_type: 'report',
          report_type: reportType,
          lens: options.lens,
        });
      } catch (error) {
        console.error('Report lens summary Excel export error:', error);
        Alert.alert(
          t('common:status.error'),
          toErrorMessage(error) || t('common:status.error'),
        );
      } finally {
        setIsExporting(false);
      }
    },
    [canExport, isletme, reportType, t, user?.id],
  );

  return {
    isExporting,
    canExport,
    exportReport,
    exportLensSummary,
  };
}
