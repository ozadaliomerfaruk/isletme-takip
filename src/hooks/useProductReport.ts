import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, createRpcTotalConverter } from '@/hooks/useExchangeRates';
import { usePermissions } from '@/hooks/usePermissions';

// Alış işlem tipleri
const PURCHASE_TYPES = ['cari_alis'];
const PURCHASE_RETURN_TYPES = ['cari_alis_iade'];

// Satış işlem tipleri
const SALE_TYPES = ['cari_satis', 'personel_satis'];
const SALE_RETURN_TYPES = ['cari_satis_iade'];

const PRODUCT_REPORT_QUERY_META = {
  persist: false,
  query_purpose: 'reports:product-report-v2',
} as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  /** Kur bulunamadığı için bazı tutarlar ham TRY kaldı → uyarı gösterilmeli. */
  conversionIncomplete?: boolean;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
  error: Error | null;
}

interface UseProductReportOptions {
  startDate: string;
  endDate: string;
}

interface ProductReportRpcRow {
  urun_id: string;
  urun_adi: string;
  urun_birim: string;
  kategori_id: string | null;
  kategori_adi: string | null;
  toplam_miktar: number | string;
  toplam_tutar: number | string;
  toplam_tutar_kdvsiz: number | string;
  islem_sayisi: number | string;
}

function isFiniteNumeric(value: unknown): value is number | string {
  return (
    (typeof value === 'number' || typeof value === 'string')
    && value !== ''
    && Number.isFinite(Number(value))
  );
}

function isProductReportRpcRow(value: unknown): value is ProductReportRpcRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.urun_id === 'string'
    && UUID_PATTERN.test(row.urun_id)
    && typeof row.urun_adi === 'string'
    && typeof row.urun_birim === 'string'
    && (
      row.kategori_id === null
      || (
        typeof row.kategori_id === 'string'
        && UUID_PATTERN.test(row.kategori_id)
      )
    )
    && (row.kategori_adi === null || typeof row.kategori_adi === 'string')
    && isFiniteNumeric(row.toplam_miktar)
    && isFiniteNumeric(row.toplam_tutar)
    && isFiniteNumeric(row.toplam_tutar_kdvsiz)
    && isFiniteNumeric(row.islem_sayisi)
  );
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
  const { isletme, user, isletmeLoading } = useAuthContext();
  const {
    isOwner,
    canAccessModule,
    canSeeAllUsersData,
  } = usePermissions();
  const canViewReports = canAccessModule('raporlar');
  const canViewProducts = canAccessModule('urunler');
  const canViewProductReport = canViewReports || canViewProducts;
  const reportsEnabled =
    !isletmeLoading
    && !!isletme
    && !!user
    && canViewProductReport;
  const permissionFingerprint = [
    `o${Number(isOwner)}`,
    `r${Number(canViewReports)}`,
    `u${Number(canViewProducts)}`,
    `a${Number(canSeeAllUsersData)}`,
  ].join('');
  const { currency: baseCurrency } = useSettings();
  const { data: ratesData } = useExchangeRates();
  const rates = ratesData?.rates;
  const { startDate, endDate } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  const islemTypes = direction === 'alis' ? PURCHASE_TYPES : SALE_TYPES;
  const returnTypes = direction === 'alis' ? PURCHASE_RETURN_TYPES : SALE_RETURN_TYPES;

  // Ana sorgu: ürün bazlı kırılım
  const mainQuery = useQuery({
    queryKey: queryKeys.reports.productReport(
      isletme?.id ?? '',
      user?.id ?? '',
      permissionFingerprint,
      direction,
      startDateTime,
      endDateTime,
    ),
    queryFn: async () => {
      if (!reportsEnabled || !isletme) return [];

      const { data, error } = await supabase.rpc('get_product_report_v2', {
        p_isletme_id: isletme.id,
        p_islem_types: islemTypes,
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) {
        if (__DEV__) console.error('[useProductReport] RPC error:', error.message);
        throw error;
      }

      const rows: unknown[] = Array.isArray(data) ? data : [];
      return rows.filter(isProductReportRpcRow);
    },
    enabled: reportsEnabled && !!isletme && !!startDate && !!endDate,
    meta: PRODUCT_REPORT_QUERY_META,
  });

  // İade sorgusu: toplam iade tutarı (net hesaplama için)
  const returnQuery = useQuery({
    queryKey: queryKeys.reports.productReportReturns(
      isletme?.id ?? '',
      user?.id ?? '',
      permissionFingerprint,
      direction,
      startDateTime,
      endDateTime,
    ),
    queryFn: async () => {
      if (!reportsEnabled || !isletme) return 0;

      const { data, error } = await supabase.rpc('get_product_report_v2', {
        p_isletme_id: isletme.id,
        p_islem_types: returnTypes,
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) {
        if (__DEV__) console.error('[useProductReport] returns RPC error:', error.message);
        throw error;
      }

      const rows: unknown[] = Array.isArray(data) ? data : [];
      return rows.filter(isProductReportRpcRow).reduce((sum, row) =>
        sum + (Number(row.toplam_tutar) || 0), 0);
    },
    enabled: reportsEnabled && !!isletme && !!startDate && !!endDate,
    meta: PRODUCT_REPORT_QUERY_META,
  });

  const hasUnsafeQueryState =
    mainQuery.isError
    || mainQuery.isRefetchError
    || returnQuery.isError
    || returnQuery.isRefetchError;
  const mainData = useMemo(
    () => (
      reportsEnabled && !hasUnsafeQueryState
        ? mainQuery.data ?? []
        : []
    ),
    [hasUnsafeQueryState, mainQuery.data, reportsEnabled],
  );
  const returnData =
    reportsEnabled
    && !hasUnsafeQueryState
      ? returnQuery.data ?? 0
      : 0;

  const result = useMemo(() => {
    // RPC tutarları TRY cinsinden döner; ana para birimine çevir.
    // baseCurrency === 'TRY' iken tam no-op (TR kullanıcı için davranış değişmez).
    // Miktar (adet) ve işlem sayısı para DEĞİL — çevrilmez.
    // TEK politika: çevrilemezse ham TRY korunur ama conversionIncomplete kalkar (bkz.
    // createRpcTotalConverter) — eskiden sessizce ham TRY, baz para birimi etiketiyle basılıyordu.
    const converter = createRpcTotalConverter(baseCurrency, rates);
    const conv = converter.conv;

    const returnTotal = conv(returnData);

    if (mainData.length === 0) {
      return {
        items: [],
        totalAmount: 0,
        totalAmountKdvsiz: 0,
        returnTotal,
        netAmount: returnTotal === 0 ? 0 : -returnTotal,
        totalTransactions: 0,
        conversionIncomplete: converter.conversionIncomplete,
      };
    }

    const items: ProductReportItem[] = mainData.map((row) => ({
      urunId: row.urun_id,
      urunAdi: row.urun_adi,
      urunBirim: row.urun_birim,
      kategoriId: row.kategori_id,
      kategoriAdi: row.kategori_adi,
      toplamMiktar: Number(row.toplam_miktar) || 0,
      toplamTutar: conv(Number(row.toplam_tutar) || 0),
      toplamTutarKdvsiz: conv(Number(row.toplam_tutar_kdvsiz) || 0),
      islemSayisi: Number(row.islem_sayisi) || 0,
      percentage: 0, // çevrilmiş toplam üzerinden aşağıda hesaplanır
    }));

    const totalAmount = items.reduce((sum, it) => sum + it.toplamTutar, 0);
    const totalAmountKdvsiz = items.reduce((sum, it) => sum + it.toplamTutarKdvsiz, 0);
    const totalTransactions = mainData.reduce((sum, row) => sum + (Number(row.islem_sayisi) || 0), 0);

    // Yüzde oran olduğundan para biriminden bağımsız; çevrilmiş değerlerle hesapla
    items.forEach((it) => {
      it.percentage = totalAmount > 0 ? Math.round((it.toplamTutar / totalAmount) * 100) : 0;
    });

    return {
      items,
      totalAmount,
      totalAmountKdvsiz,
      returnTotal,
      netAmount: totalAmount - returnTotal,
      totalTransactions,
      // Kur bulunamadıysa ham TRY korunuyor → ekran uyarıyı göstersin
      conversionIncomplete: converter.conversionIncomplete,
    };
  }, [mainData, returnData, baseCurrency, rates]);

  const refetchMain = mainQuery.refetch;
  const refetchReturns = returnQuery.refetch;
  const refetch = useCallback(
    async () => Promise.all([
      refetchMain(),
      refetchReturns(),
    ]),
    [refetchMain, refetchReturns],
  );

  return {
    ...result,
    isLoading:
      reportsEnabled
      && (mainQuery.isLoading || returnQuery.isLoading),
    isFetching:
      reportsEnabled
      && (mainQuery.isFetching || returnQuery.isFetching),
    refetch,
    error: reportsEnabled
      ? mainQuery.error || returnQuery.error
      : null,
  };
}
