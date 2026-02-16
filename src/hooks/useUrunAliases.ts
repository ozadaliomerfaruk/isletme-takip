import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { UrunAlias, UrunAliasInsert } from '@/types/database';
import { invalidateRelatedQueries, queryKeys } from '@/lib/queryKeys';

/**
 * Tüm ürün alias'larını getir
 */
export function useUrunAliases() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.urunAliases.list(isletme?.id || ''),
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase
        .from('urun_aliases')
        .select('*')
        .eq('isletme_id', isletme.id)
        .order('usage_count', { ascending: false });

      if (error) throw error;
      return data as UrunAlias[];
    },
    enabled: !!isletme,
  });
}

/**
 * Ürün alias oluştur veya güncelle (ON CONFLICT -> usage_count++)
 */
export function useCreateUrunAlias() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: UrunAliasInsert) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // Check if alias already exists (partial unique indexes don't work with Supabase upsert)
      const query = supabase
        .from('urun_aliases')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('alias_normalized', input.alias_normalized);

      if (input.supplier_cari_id) {
        query.eq('supplier_cari_id', input.supplier_cari_id);
      } else {
        query.is('supplier_cari_id', null);
      }

      const { data: existing } = await query.maybeSingle();

      if (existing) {
        // Update existing: bump usage_count and update urun_id
        const { data: updated, error: updateError } = await supabase
          .from('urun_aliases')
          .update({
            urun_id: input.urun_id,
            usage_count: existing.usage_count + 1,
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (updateError) throw updateError;
        return updated as UrunAlias;
      }

      // Insert new alias
      const { data, error } = await supabase
        .from('urun_aliases')
        .insert({
          ...input,
          isletme_id: isletme.id,
          usage_count: 1,
          last_seen_at: new Date().toISOString(),
          status: input.status || 'confirmed',
        })
        .select()
        .single();

      if (error) throw error;
      return data as UrunAlias;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urunAlias');
    },
  });
}

/**
 * Mevcut alias'ın usage_count'unu artır
 */
export function useBumpAliasUsage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (aliasId: string) => {
      const { data: existing } = await supabase
        .from('urun_aliases')
        .select('usage_count')
        .eq('id', aliasId)
        .single();

      if (!existing) return;

      const { error } = await supabase
        .from('urun_aliases')
        .update({
          usage_count: existing.usage_count + 1,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', aliasId);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urunAlias');
    },
  });
}

/**
 * Ürün alias sil
 */
export function useDeleteUrunAlias() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { error } = await supabase
        .from('urun_aliases')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urunAlias');
    },
  });
}
