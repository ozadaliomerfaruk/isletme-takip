import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';

// Alış işlem tipleri
const PURCHASE_TYPES = ['cari_alis'];
const PURCHASE_RETURN_TYPES = ['cari_alis_iade'];

// Satış işlem tipleri
const SALE_TYPES = ['cari_satis', 'personel_satis'];
const SALE_RETURN_TYPES = ['cari_satis_iade'];

export type ProductReportDirection = 'alis' | 'satis';

export interface ProductReportItem {
  urunId: string;
  urunAdi: string;
  urunBirim: string;
  kategoriId: string | null;
  kategoriAdi: string | null;
  toplamMiktar: number;
  toplamTutar: number;
  toplamTutarKdvsiz: number;
  islemSayisi: number;
  percentage: number;
}

export interface ProductReportResult {
  items: ProductReportItem[];
  totalAmount: number;
  totalAmountKdvsiz: number;
  returnTotal: number;
  netAmount: number;
  totalTransactions: number;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
  error: Error | null;
}

interface UseProductReportOptions {
  startDate: string;
  endDate: string;
}

function normalizeDateRange(startDate: string, endDate: string) {
  const startDateTime = startDate.includes('T') ? startDate : `${startDate}T00:00:00`;
  const endDateTime = endDate.includes('T') ? endDate : `${endDate}T23:59:59`;
  return { startDateTime, endDateTime };
}

export function useProductReport(
  direction: ProductReportDirection,
  options: UseProductReportOptions
): ProductReportResult {
  const { isletme } = useAuthContext();
  const { startDate, endDate } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  const islemTypes = direction === 'alis' ? PURCHASE_TYPES : SALE_TYPES;
  const returnTypes = direction === 'alis' ? PURCHASE_RETURN_TYPES : SALE_RETURN_TYPES;

  // Ana sorgu: ürün bazlı kırılım
  const {
    data: mainData,
    isLoading: mainLoading,
    isFetching: mainFetching,
    error: mainError,
    refetch: refetchMain,
  } = useQuery({
    queryKey: queryKeys.reports.productReport(isletme?.id ?? '', direction, startDateTime, endDateTime),
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase.rpc('get_product_report', {
        p_isletme_id: isletme.id,
        p_islem_types: islemTypes,
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) {
        if (__DEV__) console.error('[useProductReport] RPC error:', error.message);
        throw error;
      }

      return (data || []) as Array<{
        urun_id: string;
        urun_adi: string;
        urun_birim: string;
        kategori_id: string | null;
        kategori_adi: string | null;
        toplam_miktar: number;
        toplam_tutar: number;
        toplam_tutar_kdvsiz: number;
        islem_sayisi: number;
      }>;
    },
    enabled: !!isletme && !!startDate && !!endDate,
  });

  // İade sorgusu: toplam iade tutarı (net hesaplama için)
  const {
    data: returnData,
    isLoading: returnLoading,
  } = useQuery({
    queryKey: queryKeys.reports.productReportReturns(isletme?.id ?? '', direction, startDateTime, endDateTime),
    queryFn: async () => {
      if (!isletme) return 0;

      const { data, error } = await supabase.rpc('get_product_report', {
        p_isletme_id: isletme.id,
        p_islem_types: returnTypes,
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) {
        if (__DEV__) console.error('[useProductReport] returns RPC error:', error.message);
        return 0;
      }

      return (data || []).reduce((sum: number, row: any) =>
        sum + (Number(row.toplam_tutar) || 0), 0);
    },
    enabled: !!isletme && !!startDate && !!endDate,
  });

  const result = useMemo(() => {
    if (!mainData || mainData.length === 0) {
      return {
        items: [],
        totalAmount: 0,
        totalAmountKdvsiz: 0,
        returnTotal: returnData || 0,
        netAmount: -(returnData || 0),
        totalTransactions: 0,
      };
    }

    const totalAmount = mainData.reduce((sum, row) => sum + (Number(row.toplam_tutar) || 0), 0);
    const totalAmountKdvsiz = mainData.reduce((sum, row) => sum + (Number(row.toplam_tutar_kdvsiz) || 0), 0);
    const totalTransactions = mainData.reduce((sum, row) => sum + (Number(row.islem_sayisi) || 0), 0);
    const returnTotal = returnData || 0;

    const items: ProductReportItem[] = mainData.map((row) => ({
      urunId: row.urun_id,
      urunAdi: row.urun_adi,
      urunBirim: row.urun_birim,
      kategoriId: row.kategori_id,
      kategoriAdi: row.kategori_adi,
      toplamMiktar: Number(row.toplam_miktar) || 0,
      toplamTutar: Number(row.toplam_tutar) || 0,
      toplamTutarKdvsiz: Number(row.toplam_tutar_kdvsiz) || 0,
      islemSayisi: Number(row.islem_sayisi) || 0,
      percentage: totalAmount > 0
        ? Math.round(((Number(row.toplam_tutar) || 0) / totalAmount) * 100)
        : 0,
    }));

    return {
      items,
      totalAmount,
      totalAmountKdvsiz,
      returnTotal,
      netAmount: totalAmount - returnTotal,
      totalTransactions,
    };
  }, [mainData, returnData]);

  return {
    ...result,
    isLoading: mainLoading || returnLoading,
    isFetching: mainFetching,
    refetch: refetchMain,
    error: mainError,
  };
}
