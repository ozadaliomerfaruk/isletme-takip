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
import { UrunHareket, Currency } from '@/types/database';
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
        // Ürün hareketlerini getir
        const { data: hareketler, error } = await supabase
          .from('urun_hareketler')
          .select('*')
          .eq('isletme_id', isletme.id)
          .eq('urun_id', urunId)
          .gte('created_at', `${startDate}T00:00:00`)
          .lte('created_at', `${endDate}T23:59:59`)
          .order('created_at', { ascending: true });

        if (error) throw error;

        // islem_id'lerle cari bilgilerini getir
        const islemIds = (hareketler || [])
          .filter(h => h.islem_id)
          .map(h => h.islem_id as string);

        let islemCariMap = new Map<string, { id: string; name: string } | null>();

        if (islemIds.length > 0) {
          const { data: islemler } = await supabase
            .from('islemler')
            .select('id, cari_id, cariler(id, name)')
            .in('id', islemIds);

          islemler?.forEach(islem => {
            const cariRaw = islem.cariler as unknown;
            const cariData = Array.isArray(cariRaw) ? cariRaw[0] : cariRaw;
            if (cariData && typeof cariData === 'object' && 'id' in cariData) {
              const cari = cariData as { id: string; name: string };
              islemCariMap.set(islem.id, { id: cari.id, name: cari.name });
            } else {
              islemCariMap.set(islem.id, null);
            }
          });
        }

        // Hareketlere cari bilgisi ekle
        const hareketlerWithCari = (hareketler || []).map(h => ({
          ...h,
          cari: h.islem_id ? islemCariMap.get(h.islem_id) || null : null,
        }));

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
