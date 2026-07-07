import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Urun, UrunInsert, UrunUpdate } from '@/types/database';
import { invalidateRelatedQueries, queryKeys } from '@/lib/queryKeys';
import { LinkedRecordsError } from '@/lib/errors';
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
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: [...queryKeys.urunler.detail(id || ''), isletme?.id],
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
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
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
 * Ürüne İŞLEME BAĞLI (islem_id dolu) kaç stok hareketi olduğunu döndürür.
 * Kalıcı silme guard'ının OPTIMISTIC silmeden ÖNCE (liste undo-delete akışı) çağırması
 * için — usePermanentDeleteUrun içindeki guard commit anında patlıyor ve undo-delete
 * hatayı yuttuğu için kullanıcı "silinmiş" sanıyordu.
 */
export async function countUrunLinkedMovements(urunId: string, isletmeId: string): Promise<number> {
  const { count } = await supabase
    .from('urun_hareketler')
    .select('id', { count: 'exact', head: true })
    .eq('urun_id', urunId)
    .eq('isletme_id', isletmeId)
    .not('islem_id', 'is', null);
  return count ?? 0;
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

      // GUARD: İşleme bağlı (islem_id dolu) ürün hareketi varsa kalıcı silmeyi ENGELLE.
      // Aksi halde gerçek satış/alış işlemlerinin altındaki ürün dökümü sessizce silinir
      // (işlem "ürünlü" görünmez olur, ürün-bazlı rapor ile geçmiş çelişir). Kullanıcı
      // bunun yerine ürünü arşivlemeli. (Tekli hareket silme de aynı korumayı yapıyor.)
      const { count: linkedCount } = await supabase
        .from('urun_hareketler')
        .select('id', { count: 'exact', head: true })
        .eq('urun_id', id)
        .eq('isletme_id', isletme.id)
        .not('islem_id', 'is', null);

      if (linkedCount && linkedCount > 0) {
        throw new LinkedRecordsError(
          i18n.t('common:errors.hasLinkedProductMovements', { count: linkedCount })
        );
      }

      // Önce ilişkili (yalnızca manuel, islem_id NULL) urun hareketlerini sil
      const { error: hareketError } = await supabase
        .from('urun_hareketler')
        .delete()
        .eq('urun_id', id)
        .eq('isletme_id', isletme.id);

      if (hareketError) throw hareketError;

      // Bu ürüne iliştirilmiş notları genel nota çevir (yetim not kalmasın)
      const { error: notlarError } = await supabase
        .from('notlar')
        .update({ entity_type: 'genel', entity_id: null })
        .eq('entity_id', id)
        .eq('entity_type', 'urun')
        .eq('isletme_id', isletme.id);
      if (notlarError && __DEV__) {
        console.error('Not temizleme başarısız (yetim not kalabilir):', notlarError);
      }

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
    },
  });
}
