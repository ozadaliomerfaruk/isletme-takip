import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Kategori, KategoriType } from '@/types/database';
import { INCOME_TYPES, EXPENSE_TYPES, CASH_INFLOW_TYPES, CASH_OUTFLOW_TYPES } from '@/constants/islemTypes';

/**
 * İşlem tiplerini kaynak ve tipe göre belirler
 * source='cash-flow' ise nakit akışı tiplerini kullan
 */
function getIslemTypes(type: KategoriType, source?: string) {
  if (source === 'cash-flow') {
    return type === 'gider' ? CASH_OUTFLOW_TYPES : CASH_INFLOW_TYPES;
  }
  return type === 'gider' ? EXPENSE_TYPES : INCOME_TYPES;
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
  totalAmount: number;
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
  const { startDate, endDate } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  // İşlem tiplerini belirle
  const islemTypes = type === 'gider' ? EXPENSE_TYPES : INCOME_TYPES;

  // Tüm kategorileri çek (parent bilgisi için) - sadece aktif kategoriler
  const {
    data: allKategoriler,
    isLoading: kategorilerLoading,
    error: kategorilerError,
  } = useQuery({
    queryKey: ['all-kategoriler', isletme?.id, type],
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
    queryKey: ['category-report', isletme?.id, type, startDateTime, endDateTime],
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase.rpc('get_category_report', {
        p_isletme_id: isletme.id,
        p_types: islemTypes as string[],
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) {
        if (__DEV__) console.error('[useCategoryReport] RPC error:', error.message, (error as any).code);
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

  // Kategori bazlı gruplama ve hesaplama (alt kategoriler ana kategoriye dahil)
  // RPC zaten kategori bazlı aggregate döndürüyor, burada sadece parent gruplama yapıyoruz
  const result = useMemo(() => {
    if (!islemler || islemler.length === 0) {
      return {
        items: [],
        totalAmount: 0,
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
      const amount = Number(row.total_amount) || 0;
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

    // Map'i array'e çevir ve sırala (büyükten küçüğe)
    const items: CategoryReportItem[] = Array.from(parentCategoryMap.values())
      .map((value) => ({
        kategori: value.kategori,
        total: value.total,
        count: value.count,
        percentage: totalAmount > 0 ? (value.total / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Kategorisiz varsa en sona ekle
    if (uncategorizedCount > 0) {
      items.push({
        kategori: null,
        total: uncategorizedAmount,
        count: uncategorizedCount,
        percentage: totalAmount > 0 ? (uncategorizedAmount / totalAmount) * 100 : 0,
      });
    }

    return {
      items,
      totalAmount,
      uncategorizedAmount,
      uncategorizedCount,
    };
  }, [islemler, allKategoriler]);

  // Combine errors - prefer islemler error as it's more critical
  const combinedError = islemlerError || kategorilerError;

  return {
    ...result,
    isLoading: islemlerLoading || kategorilerLoading,
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
  const { startDate, endDate } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  // İşlem tiplerini belirle
  const islemTypes = type === 'gider' ? EXPENSE_TYPES : INCOME_TYPES;

  // Server-side aggregation: Supabase max_rows sınırından etkilenmez
  const {
    data: islemler,
    isLoading: islemlerLoading,
    error: islemlerError,
  } = useQuery({
    queryKey: ['hierarchical-category-report', isletme?.id, type, startDateTime, endDateTime],
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase.rpc('get_category_report', {
        p_isletme_id: isletme.id,
        p_types: islemTypes as string[],
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) {
        if (__DEV__) console.error('[useHierarchicalCategoryReport] RPC error:', error.message, (error as any).code);
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

  // Hiyerarşik gruplama (RPC aggregate verisi üzerinden)
  const result = useMemo(() => {
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
      const amount = Number(row.total_amount) || 0;
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

    return {
      items,
      totalAmount,
      uncategorizedAmount,
      uncategorizedCount,
    };
  }, [islemler]);

  return {
    ...result,
    isLoading: islemlerLoading,
    error: islemlerError as Error | null,
  };
}

// Belirli bir kategorinin işlemlerini getir
// Ürün bazlı kategori raporlamasını destekler:
// - Ürünlü işlemler: ürünün kategorisine göre filtrelenir
// - Ürünsüz işlemler: islemler.kategori_id'ye göre filtrelenir
export function useCategoryTransactions(
  kategoriId: string | null,
  type: KategoriType,
  options: UseCategoryReportOptions
) {
  const { isletme } = useAuthContext();
  const { startDate, endDate, source } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  // İşlem tiplerini belirle (source'a göre)
  const islemTypes = getIslemTypes(type, source);

  return useQuery({
    queryKey: ['category-transactions', isletme?.id, kategoriId, type, source, startDateTime, endDateTime],
    queryFn: async () => {
      if (!isletme) return [];

      // 1. Ürünsüz işlemler: islemler.kategori_id ile filtrele
      let noProductQuery = supabase
        .from('islemler')
        .select(`
          *,
          hesap:hesaplar!hesap_id(*),
          kategori:kategoriler(*),
          cari:cariler(*),
          personel:personel(*)
        `)
        .eq('isletme_id', isletme.id)
        .in('type', islemTypes)
        .gte('date', startDateTime)
        .lte('date', endDateTime)
        .order('date', { ascending: false });

      if (kategoriId === null || kategoriId === 'uncategorized') {
        noProductQuery = noProductQuery.is('kategori_id', null);
      } else {
        noProductQuery = noProductQuery.eq('kategori_id', kategoriId);
      }

      const { data: noProductData, error: noProductError } = await noProductQuery;
      if (noProductError) throw noProductError;

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

      // 2. Ürünlü işlemler: urun_hareketler -> urunler.kategori_id ile filtrele
      let productIslemIds: string[] = [];
      if (kategoriId && kategoriId !== 'uncategorized') {
        // Find islem_ids where any urun_hareket's urun has this kategori_id
        const { data: urunHareketler } = await supabase
          .from('urun_hareketler')
          .select('islem_id, urunler!inner(kategori_id)')
          .eq('isletme_id', isletme.id)
          .eq('urunler.kategori_id', kategoriId)
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
        const { data, error } = await supabase
          .from('islemler')
          .select(`
            *,
            hesap:hesaplar!hesap_id(*),
            kategori:kategoriler(*),
            cari:cariler(*),
            personel:personel(*)
          `)
          .eq('isletme_id', isletme.id)
          .in('id', productIslemIds)
          .in('type', islemTypes)
          .gte('date', startDateTime)
          .lte('date', endDateTime)
          .order('date', { ascending: false });

        if (error) throw error;
        productIslemData = data || [];
      }

      // 3. For product-based transactions, compute the category-specific amount
      // from urun_hareketler where urun.kategori_id matches
      const productIslemIdList = productIslemData.map(i => i.id);
      const categoryAmountMap = new Map<string, number>();

      if (productIslemIdList.length > 0 && kategoriId && kategoriId !== 'uncategorized') {
        const { data: categoryHareketler } = await supabase
          .from('urun_hareketler')
          .select('islem_id, miktar, birim_fiyat, kdv_orani, urunler!inner(kategori_id)')
          .eq('isletme_id', isletme.id)
          .eq('urunler.kategori_id', kategoriId)
          .in('islem_id', productIslemIdList);

        (categoryHareketler || []).forEach((h: any) => {
          const amount = Math.abs(h.miktar) * (h.birim_fiyat || 0) * (1 + (h.kdv_orani || 0) / 100);
          const prev = categoryAmountMap.get(h.islem_id) || 0;
          categoryAmountMap.set(h.islem_id, prev + amount);
        });
      }

      // 4. Combine and deduplicate
      const seenIds = new Set<string>();
      const combined = [];
      for (const item of [...pureNoProductData, ...productIslemData]) {
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
  const { startDate, endDate, source } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  // İşlem tiplerini belirle (source'a göre)
  const islemTypes = getIslemTypes(type, source);

  return useQuery({
    queryKey: ['multi-category-transactions', isletme?.id, kategoriIds.sort().join(','), type, source, startDateTime, endDateTime],
    queryFn: async () => {
      if (!isletme || kategoriIds.length === 0) return [];

      // 1. İslemler.kategori_id ile eşleşen (ürünsüz) işlemler
      const { data: directData, error: directError } = await supabase
        .from('islemler')
        .select(`
          *,
          hesap:hesaplar!hesap_id(*),
          kategori:kategoriler(*),
          cari:cariler(*),
          personel:personel(*)
        `)
        .eq('isletme_id', isletme.id)
        .in('type', islemTypes)
        .in('kategori_id', kategoriIds)
        .gte('date', startDateTime)
        .lte('date', endDateTime)
        .order('date', { ascending: false });

      if (directError) throw directError;

      // Filter out transactions that have urun_hareketler
      const directIds = (directData || []).map(i => i.id);
      let pureDirectData = directData || [];
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

      // 2. Ürünlü işlemler: urun_hareketler -> urunler.kategori_id ile filtrele
      const { data: urunHareketler } = await supabase
        .from('urun_hareketler')
        .select('islem_id, miktar, birim_fiyat, kdv_orani, urunler!inner(kategori_id)')
        .eq('isletme_id', isletme.id)
        .in('urunler.kategori_id', kategoriIds)
        .not('islem_id', 'is', null);

      const productIslemIdSet = new Set((urunHareketler || []).map(h => h.islem_id).filter(Boolean));

      // Calculate category-specific amounts
      const categoryAmountMap = new Map<string, number>();
      (urunHareketler || []).forEach((h: any) => {
        const amount = Math.abs(h.miktar) * (h.birim_fiyat || 0) * (1 + (h.kdv_orani || 0) / 100);
        const prev = categoryAmountMap.get(h.islem_id) || 0;
        categoryAmountMap.set(h.islem_id, prev + amount);
      });

      let productIslemData: typeof directData = [];
      const productIslemIds = [...productIslemIdSet] as string[];
      if (productIslemIds.length > 0) {
        const { data, error } = await supabase
          .from('islemler')
          .select(`
            *,
            hesap:hesaplar!hesap_id(*),
            kategori:kategoriler(*),
            cari:cariler(*),
            personel:personel(*)
          `)
          .eq('isletme_id', isletme.id)
          .in('id', productIslemIds)
          .in('type', islemTypes)
          .gte('date', startDateTime)
          .lte('date', endDateTime)
          .order('date', { ascending: false });

        if (error) throw error;
        productIslemData = data || [];
      }

      // 3. Combine and deduplicate
      const seenIds = new Set<string>();
      const combined = [];
      for (const item of [...pureDirectData, ...productIslemData]) {
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
  parentKategoriId: string | null,
  type: KategoriType,
  options: UseCategoryReportOptions
): SubCategoryReportResult {
  const { isletme } = useAuthContext();
  const { startDate, endDate, source } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  // İşlem tiplerini belirle (source'a göre)
  const islemTypes = getIslemTypes(type, source);

  // Ana kategoriyi ve alt kategorileri çek
  const {
    data: kategoriler,
    isLoading: kategorilerLoading,
    error: kategorilerError,
  } = useQuery({
    queryKey: ['sub-categories', isletme?.id, parentKategoriId, type],
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
    queryKey: ['sub-category-report-rpc', isletme?.id, allKategoriIds.sort().join(','), type, source, startDateTime, endDateTime],
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

    // RPC aggregate verisini grupla
    rpcData.forEach((row) => {
      const amount = Number(row.total_amount) || 0;
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
  }, [kategoriler, rpcData, parentKategoriId]);

  // Combine errors - prefer rpc error as it's more critical
  const combinedError = rpcError || kategorilerError;

  return {
    ...result,
    isLoading: kategorilerLoading || rpcLoading,
    error: combinedError as Error | null,
  };
}
