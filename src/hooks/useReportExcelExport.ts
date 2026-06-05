/**
 * Report Excel Export Hook
 * Gelir/Gider rapor sayfalarındaki işlemleri export etmek için hook
 */

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { exportReportToExcel, ReportType, ReportExcelTranslations } from '@/lib/reportExcelExport';
import { logEvent } from '@/lib/appEvents';
import { useAuthContext } from '@/contexts/AuthContext';
import { useSettings } from '@/hooks/useSettings';
import { supabase } from '@/lib/supabase';
import { IslemWithRelations } from '@/types/database';
import { formatDateForDB } from '@/lib/date';
import { fetchAllPages } from '@/lib/supabaseHelpers';
import { INCOME_TYPES, EXPENSE_TYPES } from '@/constants/islemTypes';
import { toErrorMessage } from '@/lib/errors';

interface UseReportExcelExportReturn {
  isExporting: boolean;
  exportReport: (startDate: string, endDate: string, periodLabel: string) => Promise<void>;
}

export function useReportExcelExport(reportType: ReportType): UseReportExcelExportReturn {
  const { isletme } = useAuthContext();
  const { currency: baseCurrency } = useSettings();
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  const exportReport = useCallback(
    async (startDate: string, endDate: string, periodLabel: string) => {
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
        const endDateTime = new Date(endDate + 'T00:00:00');
        endDateTime.setDate(endDateTime.getDate() + 1);
        const endDateNextDay = formatDateForDB(endDateTime);

        const islemTypes = reportType === 'gelir' ? INCOME_TYPES : EXPENSE_TYPES;

        const buildQuery = () => {
          return supabase
            .from('islemler')
            .select(`
              *,
              hesap:hesaplar!islemler_hesap_id_fkey(id,name,currency,type,is_active),
              hedef_hesap:hesaplar!islemler_hedef_hesap_id_fkey(id,name,currency,type,is_active),
              kategori:kategoriler(id,name),
              cari:cariler(id,name,type),
              personel:personel(id,first_name,last_name)
            `)
            .eq('isletme_id', isletme.id)
            .in('type', islemTypes)
            .gte('date', startDate)
            .lt('date', endDateNextDay)
            .order('date', { ascending: true });
        };

        const transactions = await fetchAllPages<IslemWithRelations>(buildQuery);

        await exportReportToExcel({
          reportType,
          isletmeName: isletme.name,
          startDate,
          endDate,
          periodLabel,
          transactions,
          baseCurrency,
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
    [reportType, isletme, baseCurrency, t]
  );

  return {
    isExporting,
    exportReport,
  };
}
