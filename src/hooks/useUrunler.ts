import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Urun, UrunInsert, UrunUpdate } from '@/types/database';
import { invalidateRelatedQueries, queryKeys } from '@/lib/queryKeys';
import i18n from '@/i18n';

/**
 * Tüm ürünleri getir
 */
export function useUrunler(includeArchived: boolean = false) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.urunler.list(isletme?.id || ''),
    queryFn: async () => {
      if (!isletme) return [];

      let query = supabase
        .from('urunler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('is_active', true)
        .order('ad', { ascending: true });

      if (!includeArchived) {
        query = query.eq('is_archived', false);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Urun[];
    },
    enabled: !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

/**
 * Tek bir ürün getir
 */
export function useUrun(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.urunler.detail(id || ''),
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('urunler')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Urun;
    },
    enabled: !!id,
  });
}

/**
 * Ürün oluştur
 */
export function useCreateUrun() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: UrunInsert) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { data, error } = await supabase
        .from('urunler')
        .insert({ ...input, isletme_id: isletme.id })
        .select()
        .single();

      if (error) throw error;
      return data as Urun;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urun');
    },
  });
}

/**
 * Ürün güncelle
 */
export function useUpdateUrun() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async ({ id, ...input }: UrunUpdate & { id: string }) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { data, error } = await supabase
        .from('urunler')
        .update(input)
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select()
        .single();

      if (error) throw error;

      return data as Urun;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urun');
      // Kategori değiştiğinde raporlar da güncellensin
      // (Raporlar artık urunler.kategori_id'yi doğrudan kullanıyor)
      queryClient.invalidateQueries({ queryKey: ['category-report'] });
      queryClient.invalidateQueries({ queryKey: ['hierarchical-category-report'] });
    },
  });
}

/**
 * Ürünü arşivle (soft delete - sadece arşivle, is_active kalır)
 */
export function useArchiveUrun() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { error } = await supabase
        .from('urunler')
        .update({ is_archived: true })
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urun');
    },
  });
}

/**
 * Ürünü arşivden çıkar
 */
export function useUnarchiveUrun() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { error } = await supabase
        .from('urunler')
        .update({ is_archived: false })
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urun');
    },
  });
}

/**
 * Ürün sil (soft delete - arşivle ve deaktif et)
 */
export function useDeleteUrun() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { error } = await supabase
        .from('urunler')
        .update({ is_archived: true, is_active: false })
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urun');
    },
  });
}

/**
 * Ürünü kalıcı olarak sil (hard delete)
 * Önce ilişkili ürün hareketlerini siler, sonra ürünü siler
 */
export function usePermanentDeleteUrun() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      // Önce ilişkili urun hareketlerini sil
      const { error: hareketError } = await supabase
        .from('urun_hareketler')
        .delete()
        .eq('urun_id', id)
        .eq('isletme_id', isletme.id);

      if (hareketError) throw hareketError;

      // Sonra ürünü sil
      const { error } = await supabase
        .from('urunler')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urun');
      queryClient.invalidateQueries({ queryKey: ['archive', 'counts'] });
      queryClient.invalidateQueries({ queryKey: ['urun_hareketleri'] });
    },
  });
}
