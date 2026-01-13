/**
 * usePendingIslemler Hook
 *
 * CRUD operations for pending (skipped) transactions from import
 * These are transactions that couldn't be auto-imported and need manual correction
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
import type {
  PendingIslem,
  PendingIslemInsert,
  PendingIslemUpdate,
  PendingIslemCorrections,
  IslemInsert,
} from '@/types/database';

// Query key factory
const pendingIslemlerKeys = {
  all: ['pending-islemler'] as const,
  lists: () => [...pendingIslemlerKeys.all, 'list'] as const,
  list: (isletmeId: string, status?: string) =>
    [...pendingIslemlerKeys.lists(), isletmeId, status] as const,
  count: (isletmeId: string) =>
    [...pendingIslemlerKeys.all, 'count', isletmeId] as const,
  detail: (id: string) => [...pendingIslemlerKeys.all, 'detail', id] as const,
};

/**
 * Fetch all pending transactions
 */
export function usePendingIslemler(status?: 'pending' | 'saved' | 'dismissed') {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: pendingIslemlerKeys.list(isletme?.id || '', status),
    queryFn: async () => {
      if (!isletme) return [];

      let query = supabase
        .from('pending_islemler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .order('row_number', { ascending: true });

      if (status) {
        query = query.eq('status', status);
      } else {
        // Default: only show pending ones
        query = query.eq('status', 'pending');
      }

      const { data, error } = await query;
      if (error) throw error;

      return data as PendingIslem[];
    },
    enabled: !!isletme,
  });
}

/**
 * Get count of pending transactions
 */
export function usePendingIslemlerCount() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: pendingIslemlerKeys.count(isletme?.id || ''),
    queryFn: async () => {
      if (!isletme) return 0;

      const { count, error } = await supabase
        .from('pending_islemler')
        .select('*', { count: 'exact', head: true })
        .eq('isletme_id', isletme.id)
        .eq('status', 'pending');

      if (error) throw error;

      return count || 0;
    },
    enabled: !!isletme,
  });
}

/**
 * Batch insert pending transactions (called after import)
 */
export function useCreatePendingIslemler() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: Omit<PendingIslemInsert, 'isletme_id'>[]) => {
      if (!isletme) throw new Error('No isletme');

      const toInsert = items.map((item) => ({
        ...item,
        isletme_id: isletme.id,
      }));

      const { data, error } = await supabase
        .from('pending_islemler')
        .insert(toInsert)
        .select();

      if (error) throw error;

      return data as PendingIslem[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pendingIslemlerKeys.all,
      });
    },
  });
}

/**
 * Update a pending transaction (save user corrections)
 */
export function useUpdatePendingIslem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: PendingIslemUpdate;
    }) => {
      const { data, error } = await supabase
        .from('pending_islemler')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as PendingIslem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pendingIslemlerKeys.all,
      });
    },
  });
}

/**
 * Dismiss a pending transaction (user chose to skip it)
 */
export function useDismissPendingIslem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pending_islemler')
        .update({ status: 'dismissed' })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pendingIslemlerKeys.all,
      });
    },
  });
}

/**
 * Delete a pending transaction permanently
 */
export function useDeletePendingIslem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pending_islemler')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pendingIslemlerKeys.all,
      });
    },
  });
}

/**
 * Delete all pending transactions for current business
 */
export function useDeleteAllPendingIslemler() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!isletme) throw new Error('No isletme');

      const { error } = await supabase
        .from('pending_islemler')
        .delete()
        .eq('isletme_id', isletme.id)
        .eq('status', 'pending');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pendingIslemlerKeys.all,
      });
    },
  });
}

/**
 * Save a pending transaction as a real transaction
 * This creates the islem record and deletes the pending record
 */
export function useSavePendingAsIslem() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pendingId,
      islemData,
    }: {
      pendingId: string;
      islemData: Omit<IslemInsert, 'isletme_id'>;
    }) => {
      if (!isletme) throw new Error('No isletme');

      // Insert the real transaction
      const { data: islem, error: islemError } = await supabase
        .from('islemler')
        .insert({
          ...islemData,
          isletme_id: isletme.id,
        })
        .select()
        .single();

      if (islemError) throw islemError;

      // Delete the pending record (or mark as saved)
      const { error: deleteError } = await supabase
        .from('pending_islemler')
        .delete()
        .eq('id', pendingId);

      if (deleteError) {
        // If delete fails, try to rollback the islem
        await supabase.from('islemler').delete().eq('id', islem.id);
        throw deleteError;
      }

      return islem;
    },
    onSuccess: () => {
      // Invalidate all related queries
      queryClient.invalidateQueries({
        queryKey: pendingIslemlerKeys.all,
      });
      // Invalidate related entity queries
      invalidateRelatedQueries(queryClient, 'islem');
      invalidateRelatedQueries(queryClient, 'hesap');
      invalidateRelatedQueries(queryClient, 'cari');
      invalidateRelatedQueries(queryClient, 'personel');
    },
  });
}

/**
 * Build IslemInsert from PendingIslem + corrections
 */
export function buildIslemFromPending(
  pending: PendingIslem,
  corrections: PendingIslemCorrections
): Omit<IslemInsert, 'isletme_id'> {
  const raw = pending.raw_data;
  const merged = { ...corrections };

  return {
    type: merged.type || (raw.mappedType as any) || 'gider',
    amount: merged.amount ?? raw.amount,
    description: merged.description ?? raw.description,
    date: merged.date ?? raw.date,
    hesap_id: merged.hesap_id ?? null,
    hedef_hesap_id: merged.hedef_hesap_id ?? null,
    kategori_id: merged.kategori_id ?? null,
    cari_id: merged.cari_id ?? null,
    personel_id: merged.personel_id ?? null,
  };
}

export { pendingIslemlerKeys };
