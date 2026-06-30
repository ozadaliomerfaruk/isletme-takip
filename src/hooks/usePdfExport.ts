import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/appEvents';
import { IslemWithRelations, Currency } from '@/types/database';
import { formatDateForDB } from '@/lib/date';
import { fetchAllPages } from '@/lib/supabaseHelpers';
import { LEAVE_TYPES } from '@/constants/islemTypes';
import { toErrorMessage } from '@/lib/errors';
import { EntityType } from '@/lib/excelExport';
import { generatePdfHtml, prepareStatementData, PdfExportOptions, PdfStatementData } from '@/lib/pdfExport';

interface UsePdfExportOptions {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  entityCurrency?: Currency | string;
  currentBalance: number;
  cariType?: 'musteri' | 'tedarikci';
  currentIsletmeId?: string;
  typeMismatch?: boolean;
  phone?: string;
}

interface UsePdfExportReturn {
  isExporting: boolean;
  isLoadingPreview: boolean;
  previewData: PdfStatementData | null;
  loadPreview: (startDate: string, endDate: string) => Promise<void>;
  exportPdf: (startDate: string, endDate: string) => Promise<void>;
}

export function usePdfExport(options: UsePdfExportOptions): UsePdfExportReturn {
  const { entityType, entityId, entityName, entityCurrency, currentBalance, cariType, currentIsletmeId, typeMismatch, phone } = options;
  const { isletme } = useAuthContext();
  const { t } = useTranslation(['common', 'transactions']);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState<PdfStatementData | null>(null);

  const getTranslations = useCallback(() => ({
    statementTitle: entityType === 'hesap'
      ? t('common:export.excel.accountStatement')
      : entityType === 'cari'
        ? t('common:export.excel.clientStatement')
        : t('common:export.excel.staffStatement'),
    entityLabel: entityType === 'hesap'
      ? t('common:export.excel.account')
      : entityType === 'cari'
        ? t('common:export.excel.client')
        : t('common:export.excel.staff'),
    phone: t('common:export.pdf.phone'),
    date: t('common:export.pdf.date'),
    time: t('common:export.pdf.time'),
    balance: t('common:export.pdf.balance'),
    dateColumn: t('common:export.excel.date'),
    typeColumn: t('common:export.excel.transactionType'),
    descriptionColumn: t('common:export.excel.description'),
    debitColumn: t('common:export.excel.debit'),
    creditColumn: t('common:export.excel.credit'),
    debitBalanceColumn: t('common:export.excel.debitBalance'),
    creditBalanceColumn: t('common:export.excel.creditBalance'),
    openingBalance: t('common:export.excel.openingBalance'),
    periodTotal: t('common:export.excel.periodTotal'),
    closingBalance: t('common:export.excel.closingBalance'),
    totalRecords: t('common:export.pdf.totalRecords'),
    page: t('common:export.pdf.page'),
    period: t('common:export.excel.period'),
    transactionTypes: {
      gelir: t('transactions:types.gelir'),
      gider: t('transactions:types.gider'),
      transfer: t('transactions:types.transfer'),
      cari_alis: t('transactions:types.cari_alis'),
      cari_satis: t('transactions:types.cari_satis'),
      cari_odeme: t('transactions:types.cari_odeme'),
      cari_tahsilat: t('transactions:types.cari_tahsilat'),
      cari_alis_iade: t('transactions:types.cari_alis_iade'),
      cari_satis_iade: t('transactions:types.cari_satis_iade'),
      personel_gider: t('transactions:types.personel_gider'),
      personel_odeme: t('transactions:types.personel_odeme'),
      personel_tahsilat: t('transactions:types.personel_tahsilat'),
      personel_satis: t('transactions:types.personel_satis'),
      nakit_avans_taksit: t('transactions:types.nakit_avans_taksit'),
      kredi_karti_harcama: t('transactions:types.kredi_karti_harcama'),
    },
  }), [entityType, t]);

  const fetchData = useCallback(async (startDate: string, endDate: string) => {
    if (!isletme) throw new Error('No business');

    const endDateTime = new Date(endDate + 'T00:00:00');
    endDateTime.setDate(endDateTime.getDate() + 1);
    const endDateNextDay = formatDateForDB(endDateTime);

    const buildQuery = (withDateFilter: boolean) => {
      let q = supabase
        .from('islemler')
        .select(`
          *,
          hesap:hesaplar!islemler_hesap_id_fkey(id,name,currency,type,is_active),
          hedef_hesap:hesaplar!islemler_hedef_hesap_id_fkey(id,name,currency,type,is_active),
          kategori:kategoriler(id,name),
          cari:cariler(id,name,type),
          personel:personel(id,first_name,last_name)
        `)
        .order('date', { ascending: true });

      if (withDateFilter) {
        q = q.gte('date', startDate).lt('date', endDateNextDay);
      }

      if (entityType !== 'cari') {
        q = q.eq('isletme_id', isletme.id);
      }

      if (entityType === 'hesap') {
        q = q.or(`hesap_id.eq.${entityId},hedef_hesap_id.eq.${entityId}`);
      } else if (entityType === 'cari') {
        q = q.eq('cari_id', entityId);
      } else if (entityType === 'personel') {
        q = q.eq('personel_id', entityId);
      }
      return q;
    };

    const [rawTransactions, rawAllTransactions] = await Promise.all([
      fetchAllPages<IslemWithRelations>(() => buildQuery(true)),
      fetchAllPages<IslemWithRelations>(() => buildQuery(false)),
    ]);

    return {
      transactions: rawTransactions.filter(t => !LEAVE_TYPES.includes(t.type)),
      allTransactions: rawAllTransactions.filter(t => !LEAVE_TYPES.includes(t.type)),
    };
  }, [entityType, entityId, isletme]);

  const buildOptions = useCallback((startDate: string, endDate: string, transactions: IslemWithRelations[], allTransactions: IslemWithRelations[]): PdfExportOptions => ({
    entityType,
    entityId,
    entityName,
    entityCurrency,
    isletmeName: isletme?.name || '',
    startDate,
    endDate,
    transactions,
    allTransactions,
    currentBalance,
    cariType,
    currentIsletmeId,
    typeMismatch,
    phone,
    translations: getTranslations(),
  }), [entityType, entityId, entityName, entityCurrency, currentBalance, cariType, currentIsletmeId, typeMismatch, phone, isletme, getTranslations]);

  const loadPreview = useCallback(async (startDate: string, endDate: string) => {
    setIsLoadingPreview(true);
    try {
      const { transactions, allTransactions } = await fetchData(startDate, endDate);
      const opts = buildOptions(startDate, endDate, transactions, allTransactions);
      const data = prepareStatementData(opts);
      setPreviewData(data);
    } catch (error) {
      console.error('PDF preview load error:', error);
      setPreviewData(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [fetchData, buildOptions]);

  const exportPdf = useCallback(async (startDate: string, endDate: string) => {
    if (!isletme) return;
    setIsExporting(true);
    try {
      const { transactions, allTransactions } = await fetchData(startDate, endDate);

      if (transactions.length === 0) {
        Alert.alert(t('common:status.error'), t('common:export.noDataToExport'));
        return;
      }

      const opts = buildOptions(startDate, endDate, transactions, allTransactions);
      const html = generatePdfHtml(opts);

      const { uri } = await Print.printToFileAsync({ html });
      logEvent('export_completed', { format: 'pdf' });

      const safeName = entityName.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s-]/g, '').replace(/\s+/g, '_');
      const newUri = uri.replace(/\.pdf$/, `_${safeName}.pdf`);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(newUri.includes(safeName) ? uri : uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${entityName} - PDF`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(t('common:export.sharingNotSupported'));
      }
    } catch (error) {
      console.error('PDF export error:', error);
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('common:status.error'));
    } finally {
      setIsExporting(false);
    }
  }, [entityName, isletme, fetchData, buildOptions, t]);

  return { isExporting, isLoadingPreview, previewData, loadPreview, exportPdf };
}
