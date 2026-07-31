import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Kategori, KategoriInsert, KategoriUpdate, KategoriType, KategoriWithChildren } from '@/types/database';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import i18n from '@/i18n';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * Düz kategori listesini hiyerarşik yapıya dönüştürür
 */
function buildCategoryTree(categories: Kategori[]): KategoriWithChildren[] {
  const categoryMap = new Map<string, KategoriWithChildren>();
  const rootCategories: KategoriWithChildren[] = [];

  // İlk geçişte tüm kategorileri map'e ekle
  categories.forEach(cat => {
    categoryMap.set(cat.id, { ...cat, children: [] });
  });

  // İkinci geçişte parent-child ilişkilerini kur
  categories.forEach(cat => {
    const category = categoryMap.get(cat.id)!;
    if (cat.parent_id && categoryMap.has(cat.parent_id)) {
      const parent = categoryMap.get(cat.parent_id)!;
      category.parent = parent;
      parent.children = parent.children || [];
      parent.children.push(category);
    } else {
      rootCategories.push(category);
    }
  });

  return rootCategories;
}

/**
 * Hiyerarşik kategori listesini düz listeye dönüştürür (indentasyon bilgisiyle)
 */
export interface FlattenedCategory extends Kategori {
  level: number;
  hasChildren: boolean;
}

function flattenCategoryTree(
  categories: KategoriWithChildren[],
  level: number = 0
): FlattenedCategory[] {
  const result: FlattenedCategory[] = [];

  categories.forEach(cat => {
    result.push({
      ...cat,
      level,
      hasChildren: (cat.children?.length ?? 0) > 0,
    });

    if (cat.children && cat.children.length > 0) {
      result.push(...flattenCategoryTree(cat.children, level + 1));
    }
  });

  return result;
}

export function useKategoriler(type?: KategoriType, enabled: boolean = true) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.kategoriler.list(isletme?.id ?? '', type),
    queryFn: async () => {
      if (!isletme) return [];

      let query = supabase
        .from('kategoriler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Kategori[];
    },
    enabled: enabled && !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // isletme henüz yükleniyorsa loading olarak göster
  return {
    ...result,
    isLoading: enabled && (result.isLoading || isletmeLoading),
  };
}

/**
 * Kategorileri hiyerarşik yapıda döndürür
 */
export function useKategorilerHierarchical(
  type?: KategoriType,
  enabled: boolean = true,
) {
  const { data: kategoriler, ...rest } = useKategoriler(type, enabled);

  const hierarchicalData = useMemo(() => {
    if (!kategoriler) return { tree: [], flat: [] };

    const tree = buildCategoryTree(kategoriler);
    const flat = flattenCategoryTree(tree);

    return { tree, flat };
  }, [kategoriler]);

  return {
    ...rest,
    data: kategoriler,
    tree: hierarchicalData.tree,
    flatList: hierarchicalData.flat,
  };
}

/**
 * Sadece ana kategorileri döndürür (parent_id null olanlar)
 */
export function useParentKategoriler(type?: KategoriType) {
  const { data: kategoriler, ...rest } = useKategoriler(type);

  const parentCategories = useMemo(() => {
    if (!kategoriler) return [];
    return kategoriler.filter(k => k.parent_id === null);
  }, [kategoriler]);

  return {
    ...rest,
    data: parentCategories,
  };
}

/**
 * Belirli bir kategorinin alt kategorilerini döndürür
 */
export function useSubKategoriler(parentId: string | null, type?: KategoriType) {
  const { data: kategoriler, ...rest } = useKategoriler(type);

  const subCategories = useMemo(() => {
    if (!kategoriler || !parentId) return [];
    return kategoriler.filter(k => k.parent_id === parentId);
  }, [kategoriler, parentId]);

  return {
    ...rest,
    data: subCategories,
  };
}

export function useCreateKategori() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();
  const { canManageCategories } = usePermissions();

  return useMutation({
    mutationFn: async (input: Omit<KategoriInsert, 'isletme_id'>) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));
      if (!canManageCategories) {
        throw new Error(i18n.t('common:errors.permissionDenied'));
      }

      const { data, error } = await supabase
        .from('kategoriler')
        .insert({ ...input, isletme_id: isletme.id })
        .select()
        .single();

      if (error) throw error;
      return data as Kategori;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'kategori');
    },
  });
}

export function useUpdateKategori() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();
  const { canManageCategories } = usePermissions();

  return useMutation({
    mutationFn: async ({ id, ...input }: KategoriUpdate & { id: string }) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));
      if (!canManageCategories) {
        throw new Error(i18n.t('common:errors.permissionDenied'));
      }

      const { data, error } = await supabase
        .from('kategoriler')
        .update(input)
        .eq('id', id)
        .eq('isletme_id', isletme.id)  // Güvenlik: Sadece kendi işletmesindeki kategoriyi güncelleyebilir
        .select()
        .single();

      if (error) throw error;
      return data as Kategori;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'kategori');
    },
  });
}

export function useDeleteKategori() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();
  const { canManageCategories } = usePermissions();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));
      if (!canManageCategories) {
        throw new Error(i18n.t('common:errors.permissionDenied'));
      }

      const { error } = await supabase.rpc('archive_kategori_atomik', {
        p_isletme_id: isletme.id,
        p_kategori_id: id,
      });

      if (error?.message?.includes('CATEGORY_HAS_TRANSACTIONS')) {
        throw new Error(i18n.t('errors:category.hasTransactions'));
      }
      if (error?.code === '42501') {
        throw new Error(i18n.t('common:errors.permissionDenied'));
      }
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'kategori');
      // Ürünlerin kategori_id'si null'landı → ürün listesi ve ürün-bağlı raporları da tazele
      invalidateRelatedQueries(queryClient, 'urun');
    },
  });
}
