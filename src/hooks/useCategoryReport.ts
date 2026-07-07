import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { Kategori, KategoriType, HesapType } from '@/types/database';
import { INCOME_TYPES, EXPENSE_TYPES, INCOME_RETURN_TYPES, EXPENSE_RETURN_TYPES, CASH_INFLOW_TYPES, CASH_OUTFLOW_TYPES } from '@/constants/islemTypes';
import { fetchAllPages } from '@/lib/supabaseHelpers';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';

const CASH_ACCOUNT_TYPES: HesapType[] = ['nakit', 'banka', 'birikim', 'diger'];

/**
 * Bir yönün İADE tiplerini döner (gider→cari_alis_iade, gelir→cari_satis_iade).
 */
function getReturnTypes(type: KategoriType) {
  return type === 'gider' ? EXPENSE_RETURN_TYPES : INCOME_RETURN_TYPES;
}

/**
 * İşlem tiplerini kaynak ve tipe göre belirler
 * source='cash-flow' ise nakit akışı tiplerini kullan
 * includeReturns=true ise iade tipleri de eklenir (drill-down'da iadeleri göstermek için;
 * nakit akışında iade ayrı akış olduğundan uygulanmaz).
 */
function getIslemTypes(type: KategoriType, source?: string, includeReturns = false) {
  if (source === 'cash-flow') {
    return type === 'gider' ? CASH_OUTFLOW_TYPES : CASH_INFLOW_TYPES;
  }
  const base = type === 'gider' ? EXPENSE_TYPES : INCOME_TYPES;
  return includeReturns ? [...base, ...getReturnTypes(type)] : base;
}

export interface CategoryReportItem {
  kategori: Kategori | null; // null = kategorisiz
  total: number;
  count: number;
  percentage: number;
}

// Hiyerarşik kategori rapor item'ı
export interface HierarchicalCategoryReportItem extends CategoryReportItem {
  children: CategoryReportItem[];
  totalWithChildren: number; // Kendi + alt kategorilerin toplamı
  countWithChildren: number; // Kendi + alt kategorilerin işlem sayısı
  percentageWithChildren: number; // Alt kategoriler dahil yüzde
}

export interface CategoryReportResult {
  items: CategoryReportItem[];
  totalAmount: number;        // İade SONRASI (net) toplam — başlıkta gösterilen
  returnTotal: number;        // Dönemdeki iade toplamı (ayrı "İadeler" satırı için)
  uncategorizedAmount: number;
  uncategorizedCount: number;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
  error: Error | null;
}

// Hiyerarşik kategori rapor sonucu
export interface HierarchicalCategoryReportResult {
  items: HierarchicalCategoryReportItem[];
  totalAmount: number;
  uncategorizedAmount: number;
  uncategorizedCount: number;
  isLoading: boolean;
  error: Error | null;
}

interface UseCategoryReportOptions {
  startDate: string;
  endDate: string;
  source?: string; // 'cash-flow' ise nakit akışı tiplerini kullan
  percentageReferenceTotal?: number; // Yüzde hesabında payda olarak kullanılacak toplam (örn: giderlerin gelire oranı)
  includeReturns?: boolean; // true ise işlem listesine iadeler de dahil edilir (drill-down)
}

/**
 * Tarih string'ini tam gun formatina normalize eder
 * YYYY-MM-DD -> YYYY-MM-DDTHH:MM:SS formatina cevirir
 */
function normalizeDateRange(startDate: string | undefined, endDate: string | undefined): { startDateTime: string; endDateTime: string } {
  // Handle undefined dates with empty strings (queries will be disabled anyway)
  const start = startDate || '';
  const end = endDate || '';
  const startDateTime = start.includes('T') ? start : `${start}T00:00:00`;
  const endDateTime = end.includes('T') ? end : `${end}T23:59:59`;
  return { startDateTime, endDateTime };
}

export function useCategoryReport(
  type: KategoriType,
  options: UseCategoryReportOptions
): CategoryReportResult {
  const { isletme } = useAuthContext();
  const { currency: baseCurrency } = useSettings();
  const { data: ratesData } = useExchangeRates();
  const rates = ratesData?.rates;
  const { startDate, endDate, source } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  // İşlem tiplerini belirle (source'a göre)
  const islemTypes = getIslemTypes(type, source);

  // İade tiplerini belirle (dashboard tutarlılığı için)
  const returnTypes = type === 'gider' ? EXPENSE_RETURN_TYPES : INCOME_RETURN_TYPES;

  // Tüm kategorileri çek (parent bilgisi için) - sadece aktif kategoriler
  const {
    data: allKategoriler,
    isLoading: kategorilerLoading,
    error: kategorilerError,
  } = useQuery({
    queryKey: queryKeys.reports.allKategoriler(isletme?.id ?? '', type),
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase
        .from('kategoriler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('type', type)
        .eq('is_active', true);  // Sadece aktif kategoriler

      if (error) throw error;
      return data as Kategori[];
    },
    enabled: !!isletme,
  });

  // Server-side aggregation: Supabase max_rows sınırından etkilenmez
  // Kategori başına 1 satır döner (binlerce satır yerine ~50 satır)
  const {
    data: islemler,
    isLoading: islemlerLoading,
    isFetching: islemlerFetching,
    error: islemlerError,
    refetch: refetchIslemler,
  } = useQuery({
    queryKey: queryKeys.reports.categoryReport(isletme?.id ?? '', type, source ?? '', startDateTime, endDateTime),
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase.rpc('get_category_report', {
        p_isletme_id: isletme.id,
        p_types: islemTypes as string[],
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) {
        if (__DEV__) console.error('[useCategoryReport] RPC error:', error.message, error.code);
        throw error;
      }
      if (__DEV__) console.log('[useCategoryReport]', type, 'RPC result:', data?.length, 'rows');

      return (data || []) as Array<{
        kategori_id: string | null;
        kategori_adi: string | null;
        kategori_renk: string | null;
        kategori_icon: string | null;
        parent_id: string | null;
        islem_count: number;
        total_amount: number;
      }>;
    },
    enabled: !!isletme && !!startDate && !!endDate,
  });

  // İade işlemlerini KATEGORİ bazlı çek (per-kategori net'leme + toplam İade satırı).
  // Gelir: cari_satis_iade, Gider: cari_alis_iade → ilgili kategoriden düşülür.
  const {
    data: returnRows,
    isLoading: returnLoading,
  } = useQuery({
    queryKey: queryKeys.reports.categoryReportReturns(isletme?.id ?? '', type, startDateTime, endDateTime),
    queryFn: async () => {
      if (!isletme || returnTypes.length === 0) return [] as Array<{ kategori_id: string | null; parent_id: string | null; total_amount: number }>;

      const { data, error } = await supabase.rpc('get_category_report', {
        p_isletme_id: isletme.id,
        p_types: returnTypes as string[],
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) {
        if (__DEV__) console.error('[useCategoryReport] returns RPC error:', error.message);
        return [];
      }
      return (data || []) as Array<{ kategori_id: string | null; parent_id: string | null; total_amount: number }>;
    },
    enabled: !!isletme && !!startDate && !!endDate && returnTypes.length > 0,
  });

  // Kategori bazlı gruplama ve hesaplama (alt kategoriler ana kategoriye dahil)
  // RPC zaten kategori bazlı aggregate döndürüyor, burada sadece parent gruplama yapıyoruz
  const result = useMemo(() => {
    // RPC tutarları TRY cinsindendir; ana para birimine çevir (TR için no-op).
    const conv = (v: number) =>
      baseCurrency === 'TRY' ? v : (convertCurrency(v, 'TRY', baseCurrency, rates) ?? v);
    // Persist cache güvenliği: eski sürümde bu sorgu NUMBER dönüyordu; diskteki eski
    // cache hydrate olursa returnRows number olabilir → array'e normalize et (crash fix).
    const safeReturnRows = Array.isArray(returnRows) ? returnRows : [];
    const convertedReturnTotal = safeReturnRows.reduce(
      (sum, r) => sum + conv(Number(r.total_amount) || 0),
      0
    );

    if (!islemler || islemler.length === 0) {
      return {
        items: [],
        totalAmount: -convertedReturnTotal,
        returnTotal: convertedReturnTotal,
        uncategorizedAmount: 0,
        uncategorizedCount: 0,
      };
    }

    // Tüm kategorileri map'e al (parent bilgisi için)
    const kategoriMap = new Map<string, Kategori>();
    allKategoriler?.forEach((kat) => {
      kategoriMap.set(kat.id, kat);
    });

    // Ana kategori bazlı gruplama (alt kategoriler dahil)
    const parentCategoryMap = new Map<string, {
      kategori: Kategori;
      total: number;
      count: number;
    }>();

    let totalAmount = 0;
    let uncategorizedAmount = 0;
    let uncategorizedCount = 0;

    islemler.forEach((row) => {
      const amount = conv(Number(row.total_amount) || 0);
      const count = Number(row.islem_count) || 0;
      totalAmount += amount;

      // Kategorisiz işlem
      if (!row.kategori_id) {
        uncategorizedAmount += amount;
        uncategorizedCount += count;
        return;
      }

      // Kategoriyi bul (RPC'den gelen veya allKategoriler'den)
      const kategori = kategoriMap.get(row.kategori_id);
      if (!kategori) {
        // Kategori bulunamadı (silinmiş veya pasif olabilir) - RPC verisiyle oluştur
        const fallbackKategori = {
          id: row.kategori_id,
          name: row.kategori_adi || 'Bilinmeyen',
          color: row.kategori_renk,
          icon: row.kategori_icon,
          parent_id: row.parent_id,
        } as Kategori;

        const parentId = row.parent_id;
        const targetId = parentId || row.kategori_id;
        const parentKat = parentId ? kategoriMap.get(parentId) : fallbackKategori;
        const targetKat = parentKat || fallbackKategori;

        const existing = parentCategoryMap.get(targetId);
        if (existing) {
          existing.total += amount;
          existing.count += count;
        } else {
          parentCategoryMap.set(targetId, { kategori: targetKat, total: amount, count });
        }
        return;
      }

      // Alt kategori ise parent'a ekle, değilse kendi ID'sine ekle
      const parentId = kategori.parent_id;
      const targetId = parentId || kategori.id;
      const parentKategori = parentId ? kategoriMap.get(parentId) : kategori;

      if (!parentKategori) {
        const existing = parentCategoryMap.get(kategori.id);
        if (existing) {
          existing.total += amount;
          existing.count += count;
        } else {
          parentCategoryMap.set(kategori.id, { kategori, total: amount, count });
        }
        return;
      }

      const existing = parentCategoryMap.get(targetId);
      if (existing) {
        existing.total += amount;
        existing.count += count;
      } else {
        parentCategoryMap.set(targetId, { kategori: parentKategori, total: amount, count });
      }
    });

    // Per-kategori NET'leme: her iadeyi gelirdeki AYNI hedef kategoriden düş → kartlar
    // net gösterir (kart toplamları başlıktaki net toplamla tutarlı olur).
    safeReturnRows.forEach((row) => {
      const amount = conv(Number(row.total_amount) || 0);
      if (!row.kategori_id) {
        uncategorizedAmount -= amount;
        return;
      }
      const kat = kategoriMap.get(row.kategori_id);
      const parentId = kat?.parent_id ?? row.parent_id;
      const targetId = parentId || row.kategori_id;
      const entry = parentCategoryMap.get(targetId);
      if (entry) entry.total -= amount;
      // Hedef kategori gelir/gider'de yoksa (yalnız iade olan kategori) karta yansımaz;
      // ama adjustedTotalAmount = totalAmount − convertedReturnTotal ile net'ten düşülür.
    });

    // İade tutarını toplam tutardan çıkar (dashboard ile tutarlılık) — başlıkta gösterilen net toplam
    const adjustedTotalAmount = totalAmount - convertedReturnTotal;

    // Yüzde hesabı için payda: dışarıdan verilmişse onu kullan (örn: giderlerin gelire oranı);
    // yoksa İADE SONRASI (net) toplamı kullan ki yüzdeler gösterilen başlıkla tutarlı olsun (#9).
    const percentageDenominator = (options.percentageReferenceTotal && options.percentageReferenceTotal > 0)
      ? options.percentageReferenceTotal
      : adjustedTotalAmount;

    // Map'i array'e çevir ve sırala (büyükten küçüğe)
    const items: CategoryReportItem[] = Array.from(parentCategoryMap.values())
      .map((value) => ({
        kategori: value.kategori,
        total: value.total,
        count: value.count,
        percentage: percentageDenominator > 0 ? (value.total / percentageDenominator) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Kategorisiz varsa en sona ekle
    if (uncategorizedCount > 0) {
      items.push({
        kategori: null,
        total: uncategorizedAmount,
        count: uncategorizedCount,
        percentage: percentageDenominator > 0 ? (uncategorizedAmount / percentageDenominator) * 100 : 0,
      });
    }

    return {
      items,
      totalAmount: adjustedTotalAmount,
      returnTotal: convertedReturnTotal,
      uncategorizedAmount,
      uncategorizedCount,
    };
  }, [islemler, allKategoriler, returnRows, options.percentageReferenceTotal, baseCurrency, rates]);

  // Combine errors - prefer islemler error as it's more critical
  const combinedError = islemlerError || kategorilerError;

  return {
    ...result,
    isLoading: islemlerLoading || kategorilerLoading || returnLoading,
    isFetching: islemlerFetching,
    refetch: refetchIslemler,
    error: combinedError as Error | null,
  };
}

// Hiyerarşik kategori raporu - ana kategoriler ve alt kategorileri gruplar
export function useHierarchicalCategoryReport(
  type: KategoriType,
  options: UseCategoryReportOptions
): HierarchicalCategoryReportResult {
  const { isletme } = useAuthContext();
  const { currency: baseCurrency } = useSettings();
  const { data: ratesData } = useExchangeRates();
  const rates = ratesData?.rates;
  const { startDate, endDate, source } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  // İşlem tiplerini belirle (source'a göre)
  const islemTypes = getIslemTypes(type, source);

  // İade tiplerini belirle (dashboard tutarlılığı için)
  const returnTypes = type === 'gider' ? EXPENSE_RETURN_TYPES : INCOME_RETURN_TYPES;

  // Server-side aggregation: Supabase max_rows sınırından etkilenmez
  const {
    data: islemler,
    isLoading: islemlerLoading,
    error: islemlerError,
  } = useQuery({
    queryKey: queryKeys.reports.hierarchicalCategoryReport(isletme?.id ?? '', type, source ?? '', startDateTime, endDateTime),
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase.rpc('get_category_report', {
        p_isletme_id: isletme.id,
        p_types: islemTypes as string[],
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) {
        if (__DEV__) console.error('[useHierarchicalCategoryReport] RPC error:', error.message, error.code);
        throw error;
      }
      if (__DEV__) console.log('[useHierarchicalCategoryReport]', type, 'RPC result:', data?.length, 'rows');

      return (data || []) as Array<{
        kategori_id: string | null;
        kategori_adi: string | null;
        kategori_renk: string | null;
        kategori_icon: string | null;
        parent_id: string | null;
        islem_count: number;
        total_amount: number;
      }>;
    },
    enabled: !!isletme && !!startDate && !!endDate,
  });

  // İade işlemlerinin toplamını çek (dashboard ile tutarlılık için)
  const {
    data: returnTotal,
    isLoading: returnLoading,
  } = useQuery({
    queryKey: queryKeys.reports.hierarchicalCategoryReportReturns(isletme?.id ?? '', type, startDateTime, endDateTime),
    queryFn: async () => {
      if (!isletme || returnTypes.length === 0) return 0;

      const { data, error } = await supabase.rpc('get_category_report', {
        p_isletme_id: isletme.id,
        p_types: returnTypes as string[],
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) {
        if (__DEV__) console.error('[useHierarchicalCategoryReport] returns RPC error:', error.message);
        return 0;
      }

      return (data || []).reduce((sum: number, row: { total_amount?: number | string }) =>
        sum + (Number(row.total_amount) || 0), 0);
    },
    enabled: !!isletme && !!startDate && !!endDate && returnTypes.length > 0,
  });

  // Hiyerarşik gruplama (RPC aggregate verisi üzerinden)
  const result = useMemo(() => {
    // RPC tutarları TRY cinsindendir; ana para birimine çevir (TR için no-op).
    const conv = (v: number) =>
      baseCurrency === 'TRY' ? v : (convertCurrency(v, 'TRY', baseCurrency, rates) ?? v);
    const convertedReturnTotal = conv(returnTotal || 0);

    if (!islemler || islemler.length === 0) {
      return {
        items: [],
        totalAmount: 0,
        uncategorizedAmount: 0,
        uncategorizedCount: 0,
      };
    }

    // RPC'den gelen aggregate verisini categoryMap'e dönüştür
    const categoryMap = new Map<string | null, {
      kategori: Kategori | null;
      total: number;
      count: number;
    }>();

    let totalAmount = 0;

    islemler.forEach((row) => {
      const amount = conv(Number(row.total_amount) || 0);
      const count = Number(row.islem_count) || 0;
      totalAmount += amount;

      const kategoriId = row.kategori_id;

      // Kategori bilgisini RPC verisinden oluştur
      const kategori = kategoriId ? {
        id: kategoriId,
        name: row.kategori_adi || 'Bilinmeyen',
        color: row.kategori_renk,
        icon: row.kategori_icon,
        parent_id: row.parent_id,
      } as Kategori : null;

      const existing = categoryMap.get(kategoriId);
      if (existing) {
        existing.total += amount;
        existing.count += count;
      } else {
        categoryMap.set(kategoriId, { kategori, total: amount, count });
      }
    });

    // Kategorisiz işlemleri ayır
    const uncategorized = categoryMap.get(null);
    const uncategorizedAmount = uncategorized?.total ?? 0;
    const uncategorizedCount = uncategorized?.count ?? 0;

    // Ana kategorileri ve alt kategorileri ayır
    const parentCategories = new Map<string, HierarchicalCategoryReportItem>();
    const childCategories: CategoryReportItem[] = [];

    Array.from(categoryMap.entries())
      .filter(([key]) => key !== null)
      .forEach(([_, value]) => {
        const kategori = value.kategori;
        if (!kategori) return;

        const item: CategoryReportItem = {
          kategori: kategori,
          total: value.total,
          count: value.count,
          percentage: totalAmount > 0 ? (value.total / totalAmount) * 100 : 0,
        };

        if (kategori.parent_id) {
          // Alt kategori
          childCategories.push(item);
        } else {
          // Ana kategori
          parentCategories.set(kategori.id, {
            ...item,
            children: [],
            totalWithChildren: value.total,
            countWithChildren: value.count,
            percentageWithChildren: totalAmount > 0 ? (value.total / totalAmount) * 100 : 0,
          });
        }
      });

    // Alt kategorileri ana kategorilere bağla
    childCategories.forEach((child) => {
      if (!child.kategori?.parent_id) return;

      const parent = parentCategories.get(child.kategori.parent_id);
      if (parent) {
        parent.children.push(child);
        parent.totalWithChildren += child.total;
        parent.countWithChildren += child.count;
        parent.percentageWithChildren = totalAmount > 0
          ? (parent.totalWithChildren / totalAmount) * 100
          : 0;
      } else {
        // Ana kategori işlemlerde yok ama alt kategori var
        // Bu durumda alt kategoriyi ana kategori gibi göster
        const kategori = child.kategori;
        parentCategories.set(kategori.parent_id!, {
          kategori: null, // Placeholder - görünmez ana kategori
          total: 0,
          count: 0,
          percentage: 0,
          children: [child],
          totalWithChildren: child.total,
          countWithChildren: child.count,
          percentageWithChildren: totalAmount > 0 ? (child.total / totalAmount) * 100 : 0,
        });
      }
    });

    // Ana kategorileri yoksa, alt kategorileri doğrudan göster
    // Orphan alt kategoriler (ana kategorisi olmayan) için
    const orphanChildren = childCategories.filter((child) => {
      if (!child.kategori?.parent_id) return false;
      const parent = parentCategories.get(child.kategori.parent_id);
      return !parent || parent.kategori === null;
    });

    // Placeholder ana kategorileri kaldır ve orphan'ları ana kategori olarak ekle
    orphanChildren.forEach((orphan) => {
      if (!orphan.kategori) return;
      // Placeholder'ı kaldır
      if (orphan.kategori.parent_id) {
        parentCategories.delete(orphan.kategori.parent_id);
      }
      // Orphan'ı ana kategori olarak ekle
      parentCategories.set(orphan.kategori.id, {
        ...orphan,
        children: [],
        totalWithChildren: orphan.total,
        countWithChildren: orphan.count,
        percentageWithChildren: orphan.percentage,
      });
    });

    // Alt kategorileri sırala (büyükten küçüğe)
    parentCategories.forEach((parent) => {
      parent.children.sort((a, b) => b.total - a.total);
    });

    // Ana kategorileri sırala (toplam dahil, büyükten küçüğe)
    const items: HierarchicalCategoryReportItem[] = Array.from(parentCategories.values())
      .filter((item) => item.kategori !== null) // Placeholder'ları kaldır
      .sort((a, b) => b.totalWithChildren - a.totalWithChildren);

    // Kategorisiz varsa en sona ekle
    if (uncategorizedCount > 0) {
      items.push({
        kategori: null,
        total: uncategorizedAmount,
        count: uncategorizedCount,
        percentage: totalAmount > 0 ? (uncategorizedAmount / totalAmount) * 100 : 0,
        children: [],
        totalWithChildren: uncategorizedAmount,
        countWithChildren: uncategorizedCount,
        percentageWithChildren: totalAmount > 0 ? (uncategorizedAmount / totalAmount) * 100 : 0,
      });
    }

    // İade tutarını toplam tutardan çıkar (dashboard ile tutarlılık)
    const adjustedTotalAmount = totalAmount - convertedReturnTotal;

    return {
      items,
      totalAmount: adjustedTotalAmount,
      uncategorizedAmount,
      uncategorizedCount,
    };
  }, [islemler, returnTotal, baseCurrency, rates]);

  return {
    ...result,
    isLoading: islemlerLoading || returnLoading,
    error: islemlerError as Error | null,
  };
}

// Belirli bir kategorinin işlemlerini getir
// Ürün bazlı kategori raporlamasını destekler:
// - Ürünlü işlemler: ürünün kategorisine göre filtrelenir (mapping dahil)
// - Ürünsüz işlemler: islemler.kategori_id'ye göre filtrelenir
export function useCategoryTransactions(
  kategoriId: string | null,
  type: KategoriType,
  options: UseCategoryReportOptions
) {
  const { isletme } = useAuthContext();
  const { startDate, endDate, source, includeReturns = false } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  // İşlem tiplerini belirle (source'a göre) — includeReturns ise iadeler de dahil
  const islemTypes = getIslemTypes(type, source, includeReturns);

  return useQuery({
    queryKey: queryKeys.reports.categoryTransactions(isletme?.id ?? '', kategoriId ?? '', type, source ?? '', startDateTime, endDateTime, includeReturns),
    queryFn: async () => {
      if (!isletme) return [];

      // 0. Mapping: Bu kategori bir gelir/gider kategorisi ise, ona eşlenmiş ürün kategorilerini bul
      // Böylece eşlenmiş ürün kategorilerindeki ürünlerin işlemleri de dahil edilir
      let mappedUrunKategoriIds: string[] = [];
      if (kategoriId && kategoriId !== 'uncategorized') {
        const mappingField = type === 'gider' ? 'mapped_gider_kategori_id' : 'mapped_gelir_kategori_id';
        const { data: mappedKategoriler } = await supabase
          .from('kategoriler')
          .select('id')
          .eq('isletme_id', isletme.id)
          .eq('type', 'urun')
          .eq(mappingField, kategoriId);

        mappedUrunKategoriIds = (mappedKategoriler || []).map(k => k.id);
      }

      // Ürün filtresinde kullanılacak tüm kategori ID'leri (doğrudan + eşlenmiş)
      const allUrunKategoriIds = kategoriId && kategoriId !== 'uncategorized'
        ? [kategoriId, ...mappedUrunKategoriIds]
        : [];

      // 1. Ürünsüz işlemler: islemler.kategori_id ile filtrele
      const selectStr = `
          *,
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          kategori:kategoriler(id,name),
          cari:cariler(id,name,type),
          personel:personel(id,first_name,last_name)
        `;

      const noProductData = await fetchAllPages(() => {
        let q = supabase
          .from('islemler')
          .select(selectStr)
          .eq('isletme_id', isletme.id)
          .in('type', islemTypes)
          .gte('date', startDateTime)
          .lte('date', endDateTime)
          .order('date', { ascending: false });

        if (kategoriId === null || kategoriId === 'uncategorized') {
          q = q.is('kategori_id', null);
        } else {
          q = q.eq('kategori_id', kategoriId);
        }
        return q;
      });

      // Filter out transactions that have urun_hareketler (those are handled by product categories)
      const noProductIslemIds = (noProductData || []).map(i => i.id);
      let pureNoProductData = noProductData || [];
      if (noProductIslemIds.length > 0) {
        const { data: hasProducts } = await supabase
          .from('urun_hareketler')
          .select('islem_id')
          .eq('isletme_id', isletme.id)
          .in('islem_id', noProductIslemIds)
          .not('islem_id', 'is', null);

        const productIslemIds = new Set((hasProducts || []).map(h => h.islem_id));
        pureNoProductData = (noProductData || []).filter(i => !productIslemIds.has(i.id));
      }

      // 2. Ürünlü işlemler: urun_hareketler -> urunler.kategori_id ile filtrele (mapping dahil)
      let productIslemIds: string[] = [];
      if (allUrunKategoriIds.length > 0) {
        // Find islem_ids where any urun_hareket's urun has one of the matching kategori_ids
        const { data: urunHareketler } = await supabase
          .from('urun_hareketler')
          .select('islem_id, urunler!inner(kategori_id)')
          .eq('isletme_id', isletme.id)
          .in('urunler.kategori_id', allUrunKategoriIds)
          .not('islem_id', 'is', null);

        productIslemIds = [...new Set((urunHareketler || []).map(h => h.islem_id).filter(Boolean))] as string[];
      } else if (kategoriId === null || kategoriId === 'uncategorized') {
        // Find islem_ids where any urun_hareket's urun has no kategori_id
        const { data: urunHareketler } = await supabase
          .from('urun_hareketler')
          .select('islem_id, urunler!inner(kategori_id)')
          .eq('isletme_id', isletme.id)
          .is('urunler.kategori_id', null)
          .not('islem_id', 'is', null);

        productIslemIds = [...new Set((urunHareketler || []).map(h => h.islem_id).filter(Boolean))] as string[];
      }

      let productIslemData: typeof noProductData = [];
      if (productIslemIds.length > 0) {
        productIslemData = await fetchAllPages(() =>
          supabase
            .from('islemler')
            .select(selectStr)
            .eq('isletme_id', isletme.id)
            .in('id', productIslemIds)
            .in('type', islemTypes)
            .gte('date', startDateTime)
            .lte('date', endDateTime)
            .order('date', { ascending: false })
        );
      }

      // 3. For product-based transactions, compute the category-specific amount
      // from urun_hareketler where urun.kategori_id matches (including mapped)
      const productIslemIdList = productIslemData.map(i => i.id);
      const categoryAmountMap = new Map<string, number>();

      if (productIslemIdList.length > 0 && allUrunKategoriIds.length > 0) {
        const { data: categoryHareketler } = await supabase
          .from('urun_hareketler')
          .select('islem_id, miktar, birim_fiyat, kdv_orani, urunler!inner(kategori_id)')
          .eq('isletme_id', isletme.id)
          .in('urunler.kategori_id', allUrunKategoriIds)
          .in('islem_id', productIslemIdList);

        (categoryHareketler || []).forEach((h: { islem_id: string; miktar: number; birim_fiyat: number | null; kdv_orani: number | null }) => {
          const amount = Math.abs(h.miktar) * (h.birim_fiyat || 0) * (1 + (h.kdv_orani || 0) / 100);
          const prev = categoryAmountMap.get(h.islem_id) || 0;
          categoryAmountMap.set(h.islem_id, prev + amount);
        });
      }

      // 4. Cash flow transfers: nakit→kredi_karti transfers counted as outflow
      let cashFlowTransferData: typeof pureNoProductData = [];
      if (source === 'cash-flow' && type === 'gider') {
        const transferData = await fetchAllPages(() => {
          let q = supabase
            .from('islemler')
            .select(`
              *,
              hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
              hedef_hesap:hesaplar!hedef_hesap_id(id,type),
              kategori:kategoriler(id,name),
              cari:cariler(id,name,type),
              personel:personel(id,first_name,last_name)
            `)
            .eq('isletme_id', isletme.id)
            .eq('type', 'transfer')
            .gte('date', startDateTime)
            .lte('date', endDateTime)
            .order('date', { ascending: false });

          if (kategoriId === null || kategoriId === 'uncategorized') {
            q = q.is('kategori_id', null);
          } else {
            q = q.eq('kategori_id', kategoriId);
          }
          return q;
        });

        cashFlowTransferData = (transferData || []).filter((item) => {
          const hesap = Array.isArray(item.hesap) ? item.hesap[0] : item.hesap;
          const hedefHesap = Array.isArray(item.hedef_hesap) ? item.hedef_hesap[0] : item.hedef_hesap;
          return hesap?.type && CASH_ACCOUNT_TYPES.includes(hesap.type) && hedefHesap?.type === 'kredi_karti';
        });
      }

      // 5. Combine and deduplicate
      const seenIds = new Set<string>();
      const combined = [];
      for (const item of [...pureNoProductData, ...productIslemData, ...cashFlowTransferData]) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          const catAmount = categoryAmountMap.get(item.id);
          combined.push({
            ...item,
            _categoryAmount: catAmount !== undefined ? catAmount : undefined,
          });
        }
      }

      // Sort by date descending
      combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return combined;
    },
    enabled: !!isletme && !!startDate && !!endDate,
    meta: { query_purpose: 'islemler:report-period' },
  });
}

// Birden fazla kategori için işlemleri getir (checkbox filtresi için)
// Ürün bazlı kategori raporlamasını destekler
export function useMultiCategoryTransactions(
  kategoriIds: string[],
  type: KategoriType,
  options: UseCategoryReportOptions
) {
  const { isletme } = useAuthContext();
  const { startDate, endDate, source, includeReturns = false } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  // İşlem tiplerini belirle (source'a göre) — includeReturns ise iadeler de dahil
  const islemTypes = getIslemTypes(type, source, includeReturns);

  return useQuery({
    queryKey: queryKeys.reports.multiCategoryTransactions(isletme?.id ?? '', kategoriIds.sort().join(','), type, source ?? '', startDateTime, endDateTime, includeReturns),
    queryFn: async () => {
      if (!isletme || kategoriIds.length === 0) return [];

      // 0. Mapping: Eşlenmiş ürün kategorilerini bul
      // Seçilen gelir/gider kategorilerine eşlenmiş ürün kategorileri de dahil edilir
      const mappingField = type === 'gider' ? 'mapped_gider_kategori_id' : 'mapped_gelir_kategori_id';
      const { data: mappedKategoriler } = await supabase
        .from('kategoriler')
        .select('id')
        .eq('isletme_id', isletme.id)
        .eq('type', 'urun')
        .in(mappingField, kategoriIds);

      const mappedUrunKategoriIds = (mappedKategoriler || []).map(k => k.id);
      const allUrunKategoriIds = [...new Set([...kategoriIds, ...mappedUrunKategoriIds])];

      // 1. İslemler.kategori_id ile eşleşen (ürünsüz) işlemler
      // fetchAllPages ile 1000 satır limitini aş
      const selectStr = `
          *,
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          kategori:kategoriler(id,name),
          cari:cariler(id,name,type),
          personel:personel(id,first_name,last_name)
        `;

      const directData = await fetchAllPages(() =>
        supabase
          .from('islemler')
          .select(selectStr)
          .eq('isletme_id', isletme.id)
          .in('type', islemTypes)
          .in('kategori_id', kategoriIds)
          .gte('date', startDateTime)
          .lte('date', endDateTime)
          .order('date', { ascending: false })
      );

      // Filter out transactions that have urun_hareketler
      const directIds = directData.map(i => i.id);
      let pureDirectData = directData;
      if (directIds.length > 0) {
        const { data: hasProducts } = await supabase
          .from('urun_hareketler')
          .select('islem_id')
          .eq('isletme_id', isletme.id)
          .in('islem_id', directIds)
          .not('islem_id', 'is', null);

        const productIslemIds = new Set((hasProducts || []).map(h => h.islem_id));
        pureDirectData = (directData || []).filter(i => !productIslemIds.has(i.id));
      }

      // 2. Ürünlü işlemler: urun_hareketler -> urunler.kategori_id ile filtrele (mapping dahil)
      const { data: urunHareketler } = await supabase
        .from('urun_hareketler')
        .select('islem_id, miktar, birim_fiyat, kdv_orani, urunler!inner(kategori_id)')
        .eq('isletme_id', isletme.id)
        .in('urunler.kategori_id', allUrunKategoriIds)
        .not('islem_id', 'is', null);

      const productIslemIdSet = new Set((urunHareketler || []).map(h => h.islem_id).filter(Boolean));

      // Calculate category-specific amounts
      const categoryAmountMap = new Map<string, number>();
      (urunHareketler || []).forEach((h: { islem_id: string; miktar: number; birim_fiyat: number | null; kdv_orani: number | null }) => {
        const amount = Math.abs(h.miktar) * (h.birim_fiyat || 0) * (1 + (h.kdv_orani || 0) / 100);
        const prev = categoryAmountMap.get(h.islem_id) || 0;
        categoryAmountMap.set(h.islem_id, prev + amount);
      });

      let productIslemData: typeof directData = [];
      const productIslemIds = [...productIslemIdSet] as string[];
      if (productIslemIds.length > 0) {
        productIslemData = await fetchAllPages(() =>
          supabase
            .from('islemler')
            .select(selectStr)
            .eq('isletme_id', isletme.id)
            .in('id', productIslemIds)
            .in('type', islemTypes)
            .gte('date', startDateTime)
            .lte('date', endDateTime)
            .order('date', { ascending: false })
        );
      }

      // 3. Cash flow transfers: nakit→kredi_karti transfers counted as outflow
      let cashFlowTransferData: typeof directData = [];
      if (source === 'cash-flow' && type === 'gider') {
        const transferData = await fetchAllPages(() =>
          supabase
            .from('islemler')
            .select(`
              *,
              hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
              hedef_hesap:hesaplar!hedef_hesap_id(id,type),
              kategori:kategoriler(id,name),
              cari:cariler(id,name,type),
              personel:personel(id,first_name,last_name)
            `)
            .eq('isletme_id', isletme.id)
            .eq('type', 'transfer')
            .in('kategori_id', kategoriIds)
            .gte('date', startDateTime)
            .lte('date', endDateTime)
            .order('date', { ascending: false })
        );

        cashFlowTransferData = (transferData || []).filter((item) => {
          const hesap = Array.isArray(item.hesap) ? item.hesap[0] : item.hesap;
          const hedefHesap = Array.isArray(item.hedef_hesap) ? item.hedef_hesap[0] : item.hedef_hesap;
          return hesap?.type && CASH_ACCOUNT_TYPES.includes(hesap.type) && hedefHesap?.type === 'kredi_karti';
        });
      }

      // 4. Combine and deduplicate
      const seenIds = new Set<string>();
      const combined = [];
      for (const item of [...pureDirectData, ...productIslemData, ...cashFlowTransferData]) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          const catAmount = categoryAmountMap.get(item.id);
          combined.push({
            ...item,
            _categoryAmount: catAmount !== undefined ? catAmount : undefined,
          });
        }
      }

      combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return combined;
    },
    enabled: !!isletme && !!startDate && !!endDate && kategoriIds.length > 0,
  });
}

// Alt kategori raporu - bir ana kategorinin alt kategorilerini getir
export interface SubCategoryReportItem {
  kategori: Kategori;
  total: number;
  count: number;
  percentage: number; // Ana kategori toplamına göre yüzde
}

export interface SubCategoryReportResult {
  parentKategori: Kategori | null;
  subCategories: SubCategoryReportItem[];
  parentTotal: number; // Ana kategorinin doğrudan işlemleri
  parentCount: number;
  totalAmount: number; // Tüm işlemler (ana + alt kategoriler)
  totalCount: number;
  isLoading: boolean;
  error: Error | null;
}

export function useSubCategoryReport(
  parentKategoriIdRaw: string | null,
  type: KategoriType,
  options: UseCategoryReportOptions
): SubCategoryReportResult {
  // 'skip' (ve UUID olmayan) sentinel → null: hook'u DEVRE DIŞI bırakır. Eskiden çağıran
  // (raporlar/kategori/[id] kategorisiz drill-down'da) 'skip' geçiyordu; 'skip' truthy
  // olduğundan `!parentKategoriId` guard'ı geçilip `kategoriler.eq('id','skip')` çalışıyor
  // ve Postgres 22P02 "invalid input syntax for type uuid: skip" hatası veriyordu.
  const parentKategoriId =
    parentKategoriIdRaw && parentKategoriIdRaw !== 'skip' ? parentKategoriIdRaw : null;
  const { isletme } = useAuthContext();
  const { currency: baseCurrency } = useSettings();
  const { data: ratesData } = useExchangeRates();
  const rates = ratesData?.rates;
  const { startDate, endDate, source, includeReturns = false } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  // İşlem tiplerini belirle (source'a göre)
  const islemTypes = getIslemTypes(type, source);
  // İade net'leme yalnız normal (cash-flow olmayan) drill-down'da.
  const returnsEnabled = includeReturns && source !== 'cash-flow';

  // Ana kategoriyi ve alt kategorileri çek
  const {
    data: kategoriler,
    isLoading: kategorilerLoading,
    error: kategorilerError,
  } = useQuery({
    queryKey: queryKeys.reports.subCategories(isletme?.id ?? '', parentKategoriId ?? '', type),
    queryFn: async () => {
      if (!isletme || !parentKategoriId) return { parent: null, children: [] };

      // Ana kategoriyi çek
      const { data: parentData, error: parentError } = await supabase
        .from('kategoriler')
        .select('*')
        .eq('id', parentKategoriId)
        .single();

      if (parentError) throw parentError;

      // Alt kategorileri çek
      const { data: childrenData, error: childrenError } = await supabase
        .from('kategoriler')
        .select('*')
        .eq('parent_id', parentKategoriId)
        .eq('type', type)
        .order('name');

      if (childrenError) throw childrenError;

      return {
        parent: parentData as Kategori,
        children: childrenData as Kategori[],
      };
    },
    enabled: !!isletme && !!parentKategoriId,
  });

  // Tüm ilgili kategorilerin işlemlerini çek
  const allKategoriIds = useMemo(() => {
    if (!parentKategoriId) return [];
    const ids = [parentKategoriId];
    if (kategoriler?.children) {
      ids.push(...kategoriler.children.map((k) => k.id));
    }
    return ids;
  }, [parentKategoriId, kategoriler]);

  // RPC-based aggregate data for this parent category and its children
  const {
    data: rpcData,
    isLoading: rpcLoading,
    error: rpcError,
  } = useQuery({
    queryKey: queryKeys.reports.subCategoryReportRpc(isletme?.id ?? '', allKategoriIds.sort().join(','), type, source ?? '', startDateTime, endDateTime),
    queryFn: async () => {
      if (!isletme || allKategoriIds.length === 0) return [];

      const { data, error } = await supabase.rpc('get_category_report', {
        p_isletme_id: isletme.id,
        p_types: islemTypes as string[],
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) throw error;

      // Filter to only categories in allKategoriIds
      const idSet = new Set(allKategoriIds);
      return ((data || []) as Array<{
        kategori_id: string | null;
        kategori_adi: string | null;
        kategori_renk: string | null;
        kategori_icon: string | null;
        parent_id: string | null;
        islem_count: number;
        total_amount: number;
      }>).filter(row => row.kategori_id && idSet.has(row.kategori_id));
    },
    enabled: !!isletme && !!startDate && !!endDate && allKategoriIds.length > 0,
  });

  // İADE aggregate: includeReturns ise bu kategorilere düşen iadeler (aynı get_category_report,
  // iade tipleriyle) → memo'da ilgili kategoriden DÜŞÜLÜR (özet toplam liste ile tutarlı olsun).
  const {
    data: returnsData,
    isLoading: returnsLoading,
  } = useQuery({
    queryKey: queryKeys.reports.subCategoryReportReturns(isletme?.id ?? '', allKategoriIds.sort().join(','), type, startDateTime, endDateTime),
    queryFn: async () => {
      if (!isletme || allKategoriIds.length === 0) return [];

      const { data, error } = await supabase.rpc('get_category_report', {
        p_isletme_id: isletme.id,
        p_types: getReturnTypes(type) as string[],
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) throw error;

      const idSet = new Set(allKategoriIds);
      return ((data || []) as Array<{
        kategori_id: string | null;
        islem_count: number;
        total_amount: number;
      }>).filter(row => row.kategori_id && idSet.has(row.kategori_id));
    },
    enabled: returnsEnabled && !!isletme && !!startDate && !!endDate && allKategoriIds.length > 0,
  });

  // Sonuçları hesapla (RPC aggregate verisinden)
  const result = useMemo(() => {
    if (!kategoriler || !rpcData) {
      return {
        parentKategori: null,
        subCategories: [],
        parentTotal: 0,
        parentCount: 0,
        totalAmount: 0,
        totalCount: 0,
      };
    }

    let totalAmount = 0;
    let totalCount = 0;
    let parentTotal = 0;
    let parentCount = 0;

    const subCategoryMap = new Map<string, { total: number; count: number }>();

    // Alt kategorileri map'e ekle
    kategoriler.children?.forEach((child) => {
      subCategoryMap.set(child.id, { total: 0, count: 0 });
    });

    // RPC tutarları TRY cinsindendir; ana para birimine çevir (TR için no-op).
    const conv = (v: number) =>
      baseCurrency === 'TRY' ? v : (convertCurrency(v, 'TRY', baseCurrency, rates) ?? v);

    // RPC aggregate verisini grupla
    rpcData.forEach((row) => {
      const amount = conv(Number(row.total_amount) || 0);
      const count = Number(row.islem_count) || 0;
      totalAmount += amount;
      totalCount += count;

      if (row.kategori_id === parentKategoriId) {
        parentTotal += amount;
        parentCount += count;
      } else if (row.kategori_id && subCategoryMap.has(row.kategori_id)) {
        const existing = subCategoryMap.get(row.kategori_id)!;
        existing.total += amount;
        existing.count += count;
      }
    });

    // İADE: ilgili kategoriden DÜŞ (tutar net'lenir). İade işlemi de listede görüneceğinden
    // sayıya (count) DAHİL edilir → özet "İşlem Sayısı" liste satır sayısıyla tutar.
    (returnsData || []).forEach((row) => {
      const amount = conv(Number(row.total_amount) || 0);
      const count = Number(row.islem_count) || 0;
      totalAmount -= amount;
      totalCount += count;

      if (row.kategori_id === parentKategoriId) {
        parentTotal -= amount;
        parentCount += count;
      } else if (row.kategori_id && subCategoryMap.has(row.kategori_id)) {
        const existing = subCategoryMap.get(row.kategori_id)!;
        existing.total -= amount;
        existing.count += count;
      }
    });

    // Alt kategori rapor item'larını oluştur
    const subCategories: SubCategoryReportItem[] = (kategoriler.children || [])
      .map((child) => {
        const stats = subCategoryMap.get(child.id) || { total: 0, count: 0 };
        return {
          kategori: child,
          total: stats.total,
          count: stats.count,
          percentage: totalAmount > 0 ? (stats.total / totalAmount) * 100 : 0,
        };
      })
      .filter((item) => item.count > 0) // Sadece işlemi olan alt kategorileri göster
      .sort((a, b) => b.total - a.total);

    return {
      parentKategori: kategoriler.parent,
      subCategories,
      parentTotal,
      parentCount,
      totalAmount,
      totalCount,
    };
  }, [kategoriler, rpcData, returnsData, parentKategoriId, baseCurrency, rates]);

  // Combine errors - prefer rpc error as it's more critical
  const combinedError = rpcError || kategorilerError;

  return {
    ...result,
    isLoading: kategorilerLoading || rpcLoading || (returnsEnabled && returnsLoading),
    error: combinedError as Error | null,
  };
}
