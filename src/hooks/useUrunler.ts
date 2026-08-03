import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Urun, UrunInsert, UrunUpdate } from '@/types/database';
import { invalidateRelatedQueries, queryKeys } from '@/lib/queryKeys';
import { LinkedRecordsError } from '@/lib/errors';
import { logEvent } from '@/lib/appEvents';
import i18n from '@/i18n';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * Tüm ürünleri getir
 */
export function useUrunler(includeArchived: boolean = false, enabled: boolean = true) {
  const { isletme, isletmeLoading } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeeUrunler = canAccessModule('urunler');

  const result = useQuery({
    queryKey: [
      ...queryKeys.urunler.list(isletme?.id || '', includeArchived),
      'module-scope',
      canSeeUrunler,
    ],
    queryFn: async () => {
      if (!canSeeUrunler || !isletme) return [];

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
    enabled: enabled && canSeeUrunler && !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return {
    ...result,
    // Rol daralinca onceki yetkili cache satirlari disabled query uzerinden
    // tuketiciye sizmasin.
    data: enabled && canSeeUrunler ? result.data ?? [] : [],
    isLoading: enabled && canSeeUrunler && (result.isLoading || isletmeLoading),
  };
}

/**
 * Tek bir ürün getir
 */
export function useUrun(id: string | undefined) {
  const { isletme } = useAuthContext();
  const { canAccessModule, canSeePassiveRecords } = usePermissions();
  const canSeeUrunler = canAccessModule('urunler');

  return useQuery({
    queryKey: [
      ...queryKeys.urunler.detail(id || ''),
      isletme?.id,
      'passive-scope',
      canSeePassiveRecords,
      'module-scope',
      canSeeUrunler,
    ],
    queryFn: async () => {
      if (!canSeeUrunler || !id || !isletme) return null;

      let query = supabase
        .from('urunler')
        .select('*')
        .eq('id', id)
        .eq('isletme_id', isletme.id);
      if (!canSeePassiveRecords) query = query.eq('is_active', true);
      const { data, error } = await query.single();

      if (error) throw error;
      return data as Urun;
    },
    enabled: canSeeUrunler && !!id && !!isletme,
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
    onSuccess: (data) => {
      invalidateRelatedQueries(queryClient, 'urun');
      logEvent('urun_created', { currency: data?.currency, birim: data?.birim });
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
        .eq('isletme_id', isletme.id)
        .select('id')
        .single();

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
        .eq('isletme_id', isletme.id)
        .select('id')
        .single();

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
        .eq('isletme_id', isletme.id)
        .select('id')
        .single();

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
  const { count, error } = await supabase
    .from('urun_hareketler')
    .select('id', { count: 'exact', head: true })
    .eq('urun_id', urunId)
    .eq('isletme_id', isletmeId)
    .not('islem_id', 'is', null);

  if (error) throw error;
  return count ?? 0;
}

/**
 * Ürünü kalıcı olarak sil (hard delete)
 * İşleme bağlı hareket varsa silmeyi engeller. Manuel hareketler ürünle aynı
 * transaction'da veritabanındaki FK cascade ile temizlenir.
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
      const { count: linkedCount, error: linkedCountError } = await supabase
        .from('urun_hareketler')
        .select('id', { count: 'exact', head: true })
        .eq('urun_id', id)
        .eq('isletme_id', isletme.id)
        .not('islem_id', 'is', null);

      if (linkedCountError) throw linkedCountError;
      if (linkedCount && linkedCount > 0) {
        throw new LinkedRecordsError(
          i18n.t('common:errors.hasLinkedProductMovements', { count: linkedCount })
        );
      }

      // Kanonik bağlı-hareket guard'ı silme transaction'ında sunucuda yeniden
      // doğrulanır; notlar aynı BEFORE DELETE transaction'ında genel nota çevrilir,
      // yalnız manuel hareketler FK ON DELETE CASCADE ile atomik temizlenir.
      const { error } = await supabase
        .from('urunler')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select('id')
        .single();

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urun');
    },
  });
}
