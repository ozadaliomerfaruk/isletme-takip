/**
 * Ürün Excel Export Hook
 * Tek ürün veya tüm ürünlerin hareketlerini Excel olarak export eder
 */

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { exportUrunHareketlerToExcel, UrunExcelTranslations } from '@/lib/excelExport';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Currency } from '@/types/database';
import { formatDateForDB } from '@/lib/date';
import { fetchAllPages } from '@/lib/supabaseHelpers';
import { toErrorMessage } from '@/lib/errors';

interface UseUrunExcelExportOptions {
  productName: string;
  productCode?: string;
  productUnit: string;
  productCurrency?: Currency | string;
  urunId: string;
}

interface UseUrunExcelExportReturn {
  isExporting: boolean;
  exportExcel: (startDate: string, endDate: string) => Promise<void>;
}

export function useUrunExcelExport(options: UseUrunExcelExportOptions): UseUrunExcelExportReturn {
  const { productName, productCode, productUnit, productCurrency, urunId } = options;
  const { isletme } = useAuthContext();
  const { t } = useTranslation(['products', 'common']);
  const [isExporting, setIsExporting] = useState(false);

  const exportExcel = useCallback(
    async (startDate: string, endDate: string) => {
      if (!isletme) {
        Alert.alert(t('common:status.error'), t('common:empty.noData'));
        return;
      }

      setIsExporting(true);

      try {
        // Bitiş tarihi için günün sonunu hesapla (yerel timezone ile)
        const endDateTime = new Date(endDate + 'T00:00:00');
        endDateTime.setDate(endDateTime.getDate() + 1);
        const endDateNextDay = formatDateForDB(endDateTime);

        // Ürün hareketlerini İŞ TARİHİNE göre getir (ekrandaki liste/rapor ile aynı eksen):
        //  - İşleme bağlı: islemler.date dönemde mi (inner join) + cari bilgisi gömülü
        //  - Manuel (islem_id NULL): iş tarihi = created_at
        const [linkedHareketler, manuelHareketler] = await Promise.all([
          fetchAllPages<any>(() =>
            supabase
              .from('urun_hareketler')
              .select('*, islemler!inner(date, cari_id, cariler(id, name))')
              .eq('isletme_id', isletme.id)
              .eq('urun_id', urunId)
              .gte('islemler.date', startDate)
              .lt('islemler.date', endDateNextDay)
              .order('id', { ascending: true })
          ),
          fetchAllPages<any>(() =>
            supabase
              .from('urun_hareketler')
              .select('*')
              .eq('isletme_id', isletme.id)
              .eq('urun_id', urunId)
              .is('islem_id', null)
              .gte('created_at', startDate)
              .lt('created_at', endDateNextDay)
              .order('created_at', { ascending: true })
          ),
        ]);

        // Hareketlere iş tarihi (islemDate) + cari bilgisi iliştir
        const hareketlerWithCari = [
          ...(linkedHareketler || []).map(h => {
            const islemRel = Array.isArray(h.islemler) ? h.islemler[0] : h.islemler;
            const cariRaw = islemRel?.cariler as unknown;
            const cariData = Array.isArray(cariRaw) ? cariRaw[0] : cariRaw;
            const cari =
              cariData && typeof cariData === 'object' && 'id' in cariData
                ? { id: (cariData as { id: string; name: string }).id, name: (cariData as { id: string; name: string }).name }
                : null;
            return { ...h, islemDate: (islemRel?.date as string | undefined) ?? h.created_at, cari };
          }),
          ...(manuelHareketler || []).map(h => ({ ...h, islemDate: h.created_at, cari: null })),
        ];

        // Çevirileri hazırla
        const translations: UrunExcelTranslations = {
          productMovements: t('products:export.productMovements'),
          product: t('products:export.product'),
          period: t('common:export.excel.period'),
          createdAt: t('common:export.excel.createdAt'),
          business: t('common:export.excel.business'),
          date: t('common:export.excel.date'),
          movementType: t('products:export.movementType'),
          client: t('products:export.client'),
          quantity: t('products:export.quantity'),
          unit: t('products:export.unit'),
          unitPrice: t('products:export.unitPrice'),
          subtotal: t('products:export.subtotal'),
          vatRate: t('products:export.vatRate'),
          vatAmount: t('products:export.vatAmount'),
          total: t('products:export.total'),
          description: t('common:export.excel.description'),
          totalIn: t('products:export.totalIn'),
          totalOut: t('products:export.totalOut'),
          totalAdjustment: t('products:export.totalAdjustment'),
          netChange: t('products:export.netChange'),
          periodSummary: t('products:export.periodSummary'),
          sheetName: t('products:export.sheetName'),
          fileName: t('products:export.fileName'),
          shareDialogTitle: t('products:export.shareDialogTitle'),
          sharingNotSupported: t('products:export.sharingNotSupported'),
          movementTypes: {
            giris: t('products:export.movementTypes.giris'),
            cikis: t('products:export.movementTypes.cikis'),
            duzeltme: t('products:export.movementTypes.duzeltme'),
          },
          noDataError: t('common:export.noDataToExport'),
        };

        await exportUrunHareketlerToExcel({
          productName,
          productCode,
          productUnit,
          productCurrency: productCurrency || 'TRY',
          isletmeName: isletme.name,
          startDate,
          endDate,
          hareketler: hareketlerWithCari,
          translations,
        });
      } catch (error) {
        Alert.alert(
          t('common:status.error'),
          toErrorMessage(error) || t('products:export.error')
        );
      } finally {
        setIsExporting(false);
      }
    },
    [isletme, urunId, productName, productCode, productUnit, productCurrency, t]
  );

  return { isExporting, exportExcel };
}
