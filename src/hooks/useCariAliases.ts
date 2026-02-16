import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { CariAlias, CariAliasInsert } from '@/types/database';
import { invalidateRelatedQueries, queryKeys } from '@/lib/queryKeys';

/**
 * Tüm cari alias'larını getir
 */
export function useCariAliases() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.cariAliases.list(isletme?.id || ''),
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase
        .from('cari_aliases')
        .select('*')
        .eq('isletme_id', isletme.id)
        .order('usage_count', { ascending: false });

      if (error) throw error;
      return data as CariAlias[];
    },
    enabled: !!isletme,
  });
}

/**
 * Cari alias oluştur veya güncelle (ON CONFLICT -> usage_count++)
 */
export function useCreateCariAlias() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: CariAliasInsert) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // Check if alias already exists
      const { data: existing } = await supabase
        .from('cari_aliases')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('alias_normalized', input.alias_normalized)
        .maybeSingle();

      if (existing) {
        // Update existing: bump usage_count and update cari_id
        const { data: updated, error: updateError } = await supabase
          .from('cari_aliases')
          .update({
            cari_id: input.cari_id,
            usage_count: existing.usage_count + 1,
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (updateError) throw updateError;
        return updated as CariAlias;
      }

      // Insert new alias
      const { data, error } = await supabase
        .from('cari_aliases')
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
      return data as CariAlias;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'cariAlias');
    },
  });
}

/**
 * Cari alias sil
 */
export function useDeleteCariAlias() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { error } = await supabase
        .from('cari_aliases')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'cariAlias');
    },
  });
}
