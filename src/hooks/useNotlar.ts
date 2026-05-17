import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { cancelNoteReminder } from '@/lib/notifications';
import type { Not, NotInsert, NotUpdate, NotEntityType } from '@/types/database';

const NOTLAR_QUERY_KEY = 'notlar';

/**
 * Tum notlari getirir (opsiyonel entity filtresi)
 */
export function useNotlar(entityType?: NotEntityType, entityId?: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: [NOTLAR_QUERY_KEY, isletme?.id, entityType, entityId],
    queryFn: async () => {
      if (!isletme) return [];

      let query = supabase
        .from('notlar')
        .select('*')
        .eq('isletme_id', isletme.id)
        .order('created_at', { ascending: false });

      if (entityType) {
        query = query.eq('entity_type', entityType);
      }
      if (entityId) {
        query = query.eq('entity_id', entityId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Not[];
    },
    enabled: !!isletme,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

/**
 * Belirli bir entity'ye ait notlari getirir
 */
export function useNotlarByEntity(entityType: NotEntityType, entityId: string) {
  return useNotlar(entityType, entityId);
}

/**
 * Not olustur
 */
export function useCreateNot() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: Omit<NotInsert, 'isletme_id'>) => {
      if (!isletme) throw new Error('No isletme');

      const { data, error } = await supabase
        .from('notlar')
        .insert({
          ...input,
          isletme_id: isletme.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Not;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [NOTLAR_QUERY_KEY] });
    },
  });
}

/**
 * Not guncelle
 */
export function useUpdateNot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: NotUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('notlar')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Not;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [NOTLAR_QUERY_KEY] });
    },
  });
}

/**
 * Not sil — also cleans up photo from storage and cancels reminder
 */
export function useDeleteNot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (note: { id: string; photo_path?: string | null }) => {
      if (note.photo_path) {
        await supabase.storage.from('islem-photos').remove([note.photo_path]);
      }
      await cancelNoteReminder(note.id);

      const { error } = await supabase
        .from('notlar')
        .delete()
        .eq('id', note.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [NOTLAR_QUERY_KEY] });
    },
  });
}

/**
 * Toggle not completion state
 */
export function useToggleNotCompletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { data, error } = await supabase
        .from('notlar')
        .update({
          is_completed,
          completed_at: is_completed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Not;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [NOTLAR_QUERY_KEY] });
    },
  });
}
