import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '@/contexts/AuthContext';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { usePermissions } from '@/hooks/usePermissions';
import { useSettings } from '@/hooks/useSettings';
import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

const PRODUCT_PRICE_CHANGE_QUERY_META = {
  persist: false,
  query_purpose: 'reports:product-price-change-report-v2',
} as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProductPriceHistoryKind = 'baseline' | 'initial' | 'change' | 'brand_change';

export interface ProductPriceHistoryPoint {
  date: string;
  price: number;
  quantity: number;
  supplierId: string | null;
  supplierName: string | null;
  brandName: string | null;
  kind: ProductPriceHistoryKind;
  changeAmount: number | null;
  changePercent: number | null;
}

export interface ProductPriceChangeItem {
  urunId: string;
  urunAdi: string;
  urunBirim: string;
  kategoriId: string | null;
  kategoriAdi: string | null;
  priceCurrency: string;
  referencePrice: number;
  currentPrice: number;
  previousPrice: number;
  lastChangeAmount: number;
  lastChangePercent: number;
  periodChangeAmount: number;
  periodChangePercent: number;
  changeCount: number;
  hadIncrease: boolean;
  hadDecrease: boolean;
  periodQuantity: number;
  higherPriceQuantity: number;
  lowerPriceQuantity: number;
  extraCost: number;
  extraCostBase: number | null;
  estimatedSavings: number;
  estimatedSavingsBase: number | null;
  firstPurchaseDate: string;
  lastPurchaseDate: string;
  lastChangeDate: string;
  latestSupplierId: string | null;
  latestSupplierName: string | null;
  supplierChanged: boolean;
  latestBrandName: string | null;
  brandChanged: boolean;
  priceHistory: ProductPriceHistoryPoint[];
}

export interface ProductPriceChangeReportResult {
  items: ProductPriceChangeItem[];
  changedCount: number;
  increasedCount: number;
  decreasedCount: number;
  totalExtraCost: number;
  totalSavings: number;
  conversionIncomplete: boolean;
  /** Seçili tarih aralığının fiyat raporu en az bir kez başarıyla tamamlandı. */
  isReady: boolean;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
  error: Error | null;
}

interface UseProductPriceChangeReportOptions {
  startDate: string;
  endDate: string;
  /** Ağır fiyat geçmişi sorgusunu yalnız görünür sekmede çalıştırır. */
  enabled?: boolean;
}

interface ProductPriceChangeRpcRow {
  urun_id: string;
  urun_adi: string;
  urun_birim: string;
  kategori_id: string | null;
  kategori_adi: string | null;
  fiyat_para_birimi: string;
  referans_fiyat: number | string;
  guncel_fiyat: number | string;
  onceki_fiyat: number | string;
  son_degisim_tutari: number | string;
  son_degisim_yuzdesi: number | string;
  donem_degisim_tutari: number | string;
  donem_degisim_yuzdesi: number | string;
  degisim_sayisi: number | string;
  zam_var: boolean;
  indirim_var: boolean;
  donem_toplam_miktar: number | string;
  zamli_alim_miktari: number | string;
  tahmini_ek_maliyet: number | string;
  indirimli_alim_miktari: number | string;
  tahmini_tasarruf: number | string;
  ilk_alim_tarihi: string;
  son_alim_tarihi: string;
  son_degisim_tarihi: string;
  son_tedarikci_id: string | null;
  son_tedarikci_adi: string | null;
  tedarikci_degisti: boolean;
  fiyat_gecmisi: unknown;
}

function isFiniteNumeric(value: unknown): value is number | string {
  return (
    (typeof value === 'number' || typeof value === 'string')
    && value !== ''
    && Number.isFinite(Number(value))
  );
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && UUID_PATTERN.test(value));
}

function isValidDateString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isProductPriceChangeRpcRow(value: unknown): value is ProductPriceChangeRpcRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.urun_id === 'string'
    && UUID_PATTERN.test(row.urun_id)
    && typeof row.urun_adi === 'string'
    && typeof row.urun_birim === 'string'
    && isNullableUuid(row.kategori_id)
    && (row.kategori_adi === null || typeof row.kategori_adi === 'string')
    && typeof row.fiyat_para_birimi === 'string'
    && row.fiyat_para_birimi.length > 0
    && isFiniteNumeric(row.referans_fiyat)
    && isFiniteNumeric(row.guncel_fiyat)
    && isFiniteNumeric(row.onceki_fiyat)
    && isFiniteNumeric(row.son_degisim_tutari)
    && isFiniteNumeric(row.son_degisim_yuzdesi)
    && isFiniteNumeric(row.donem_degisim_tutari)
    && isFiniteNumeric(row.donem_degisim_yuzdesi)
    && isFiniteNumeric(row.degisim_sayisi)
    && typeof row.zam_var === 'boolean'
    && typeof row.indirim_var === 'boolean'
    && isFiniteNumeric(row.donem_toplam_miktar)
    && isFiniteNumeric(row.zamli_alim_miktari)
    && isFiniteNumeric(row.tahmini_ek_maliyet)
    && isFiniteNumeric(row.indirimli_alim_miktari)
    && isFiniteNumeric(row.tahmini_tasarruf)
    && isValidDateString(row.ilk_alim_tarihi)
    && isValidDateString(row.son_alim_tarihi)
    && isValidDateString(row.son_degisim_tarihi)
    && isNullableUuid(row.son_tedarikci_id)
    && (row.son_tedarikci_adi === null || typeof row.son_tedarikci_adi === 'string')
    && typeof row.tedarikci_degisti === 'boolean'
    && Array.isArray(row.fiyat_gecmisi)
  );
}

function normalizeHistoryPoint(value: unknown): ProductPriceHistoryPoint | null {
  if (!value || typeof value !== 'object') return null;
  const point = value as Record<string, unknown>;
  const kind = point.kind;
  if (
    !isValidDateString(point.date)
    || !isFiniteNumeric(point.price)
    || !isFiniteNumeric(point.quantity)
    || !isNullableUuid(point.supplierId)
    || (point.supplierName !== null && typeof point.supplierName !== 'string')
    || (point.brandName !== undefined && point.brandName !== null && typeof point.brandName !== 'string')
    || (kind !== 'baseline' && kind !== 'initial' && kind !== 'change' && kind !== 'brand_change')
    || (point.changeAmount !== null && !isFiniteNumeric(point.changeAmount))
    || (point.changePercent !== null && !isFiniteNumeric(point.changePercent))
  ) {
    return null;
  }

  return {
    date: point.date,
    price: Number(point.price),
    quantity: Number(point.quantity),
    supplierId: point.supplierId,
    supplierName: point.supplierName,
    brandName: typeof point.brandName === 'string' && point.brandName.trim()
      ? point.brandName.trim()
      : null,
    kind,
    changeAmount: point.changeAmount === null ? null : Number(point.changeAmount),
    changePercent: point.changePercent === null ? null : Number(point.changePercent),
  };
}

function normalizeDateRange(startDate: string, endDate: string) {
  const startDateTime = startDate.includes('T') ? startDate : `${startDate}T00:00:00`;
  const endDateTime = endDate.includes('T') ? endDate : `${endDate}T23:59:59`;
  return { startDateTime, endDateTime };
}

export function useProductPriceChangeReport(
  options: UseProductPriceChangeReportOptions,
): ProductPriceChangeReportResult {
  const { isletme, user, isletmeLoading } = useAuthContext();
  const { isOwner, canAccessModule, canSeeAllUsersData } = usePermissions();
  const canViewReports = canAccessModule('raporlar');
  const canViewProducts = canAccessModule('urunler');
  const reportsEnabled = (
    !isletmeLoading
    && !!isletme
    && !!user
    && (canViewReports || canViewProducts)
  );
  const permissionFingerprint = [
    `o${Number(isOwner)}`,
    `r${Number(canViewReports)}`,
    `u${Number(canViewProducts)}`,
    `a${Number(canSeeAllUsersData)}`,
  ].join('');
  const { currency: baseCurrency } = useSettings();
  const { data: ratesData } = useExchangeRates();
  const rates = ratesData?.rates;
  const { startDate, endDate, enabled = true } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);
  const queryEnabled = (
    reportsEnabled
    && enabled
    && !!isletme
    && !!startDate
    && !!endDate
  );

  const query = useQuery({
    queryKey: queryKeys.reports.productPriceChanges(
      isletme?.id ?? '',
      user?.id ?? '',
      permissionFingerprint,
      startDateTime,
      endDateTime,
    ),
    queryFn: async () => {
      if (!reportsEnabled || !isletme) return [];

      const { data, error } = await supabase.rpc('get_product_price_change_report_v2', {
        p_isletme_id: isletme.id,
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) {
        if (__DEV__) {
          console.error('[useProductPriceChangeReport] RPC error:', error.message);
        }
        throw error;
      }

      const rows: unknown[] = Array.isArray(data) ? data : [];
      return rows.filter(isProductPriceChangeRpcRow);
    },
    enabled: queryEnabled,
    meta: PRODUCT_PRICE_CHANGE_QUERY_META,
  });

  const hasUnsafeQueryState = query.isError || query.isRefetchError;
  const rows = useMemo(
    () => (
      reportsEnabled && !hasUnsafeQueryState
        ? query.data ?? []
        : []
    ),
    [hasUnsafeQueryState, query.data, reportsEnabled],
  );

  const result = useMemo(() => {
    let conversionIncomplete = false;
    const items: ProductPriceChangeItem[] = rows.map((row) => {
      const extraCost = Number(row.tahmini_ek_maliyet);
      const estimatedSavings = Number(row.tahmini_tasarruf);
      const convertedExtraCost = convertCurrency(
        extraCost,
        row.fiyat_para_birimi,
        baseCurrency,
        rates,
      );
      const convertedSavings = convertCurrency(
        estimatedSavings,
        row.fiyat_para_birimi,
        baseCurrency,
        rates,
      );
      if (
        (extraCost !== 0 && convertedExtraCost === null)
        || (estimatedSavings !== 0 && convertedSavings === null)
      ) {
        conversionIncomplete = true;
      }

      const priceHistory = (row.fiyat_gecmisi as unknown[])
        .map(normalizeHistoryPoint)
        .filter((point): point is ProductPriceHistoryPoint => point !== null);
      const latestBrandName = [...priceHistory]
        .reverse()
        .find((point) => point.brandName)?.brandName ?? null;
      const distinctBrands = new Set(
        priceHistory
          .map((point) => point.brandName?.trim().toLocaleLowerCase('tr-TR'))
          .filter((brand): brand is string => !!brand),
      );

      return {
        urunId: row.urun_id,
        urunAdi: row.urun_adi,
        urunBirim: row.urun_birim,
        kategoriId: row.kategori_id,
        kategoriAdi: row.kategori_adi,
        priceCurrency: row.fiyat_para_birimi,
        referencePrice: Number(row.referans_fiyat),
        currentPrice: Number(row.guncel_fiyat),
        previousPrice: Number(row.onceki_fiyat),
        lastChangeAmount: Number(row.son_degisim_tutari),
        lastChangePercent: Number(row.son_degisim_yuzdesi),
        periodChangeAmount: Number(row.donem_degisim_tutari),
        periodChangePercent: Number(row.donem_degisim_yuzdesi),
        changeCount: Number(row.degisim_sayisi),
        hadIncrease: row.zam_var,
        hadDecrease: row.indirim_var,
        periodQuantity: Number(row.donem_toplam_miktar),
        higherPriceQuantity: Number(row.zamli_alim_miktari),
        lowerPriceQuantity: Number(row.indirimli_alim_miktari),
        extraCost,
        extraCostBase: convertedExtraCost,
        estimatedSavings,
        estimatedSavingsBase: convertedSavings,
        firstPurchaseDate: row.ilk_alim_tarihi,
        lastPurchaseDate: row.son_alim_tarihi,
        lastChangeDate: row.son_degisim_tarihi,
        latestSupplierId: row.son_tedarikci_id,
        latestSupplierName: row.son_tedarikci_adi,
        supplierChanged: row.tedarikci_degisti,
        latestBrandName,
        brandChanged: distinctBrands.size > 1,
        priceHistory,
      };
    });

    return {
      items,
      changedCount: items.length,
      // Bir urun donem icinde zamlanip sonra referans fiyatina geri donebilir.
      // KPI'lar net kapanisi degil, donem icinde gerceklesen fiyat gecislerini sayar.
      increasedCount: items.filter((item) => item.hadIncrease).length,
      decreasedCount: items.filter((item) => item.hadDecrease).length,
      totalExtraCost: items.reduce(
        (sum, item) => sum + (item.extraCostBase ?? 0),
        0,
      ),
      totalSavings: items.reduce(
        (sum, item) => sum + (item.estimatedSavingsBase ?? 0),
        0,
      ),
      conversionIncomplete,
    };
  }, [baseCurrency, rates, rows]);

  const refetchQuery = query.refetch;
  const refetch = useCallback(async () => refetchQuery(), [refetchQuery]);

  return {
    ...result,
    isReady: (
      reportsEnabled
      && !hasUnsafeQueryState
      && query.data !== undefined
    ),
    isLoading: queryEnabled && query.isLoading,
    isFetching: queryEnabled && query.isFetching,
    refetch,
    error: queryEnabled && query.error instanceof Error ? query.error : null,
  };
}
