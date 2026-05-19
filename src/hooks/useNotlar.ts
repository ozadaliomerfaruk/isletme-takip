import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { cancelNoteReminder } from '@/lib/notifications';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import type { Not, NotInsert, NotUpdate, NotEntityType } from '@/types/database';

export function useInvalidateNotlar() {
  const queryClient = useQueryClient();
  return () => invalidateRelatedQueries(queryClient, 'not');
}

/**
 * Tum notlari getirir (opsiyonel entity filtresi)
 */
export function useNotlar(entityType?: NotEntityType, entityId?: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.notlar.list(isletme?.id ?? '', entityType, entityId),
    queryFn: async () => {
      if (!isletme) return [];

      let query = supabase
        .from('notlar')
        .select('*')
        .eq('isletme_id', isletme.id)
        .order('created_at', { ascending: false });

      if (entityType) {
        if (entityType === 'personel') {
          query = query.in('entity_type', ['personel', 'personel_izin']);
        } else {
          query = query.eq('entity_type', entityType);
        }
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
 * Belirli bir entity'ye ait notlari getirir + cross-entity assigned notes
 * (e.g. a note from 'genel' assigned_to_cari=X also appears on cari X's page)
 */
export function useNotlarByEntity(entityType: NotEntityType, entityId: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.notlar.byEntity(isletme?.id ?? '', entityType, entityId),
    queryFn: async () => {
      if (!isletme || !entityId) return [];

      let directQuery = supabase
        .from('notlar')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });

      if (entityType === 'personel') {
        directQuery = directQuery.in('entity_type', ['personel', 'personel_izin']);
      } else {
        directQuery = directQuery.eq('entity_type', entityType);
      }

      const { data: directNotes, error: err1 } = await directQuery;
      if (err1) throw err1;

      let assignedNotes: Not[] = [];
      if (entityType === 'cari') {
        const { data, error } = await supabase
          .from('notlar')
          .select('*')
          .eq('isletme_id', isletme.id)
          .eq('assigned_to_cari', entityId)
          .neq('entity_type', 'cari')
          .order('created_at', { ascending: false });
        if (error) throw error;
        assignedNotes = (data as Not[]).filter(n => n.entity_id !== entityId);
      } else if (entityType === 'personel') {
        const { data, error } = await supabase
          .from('notlar')
          .select('*')
          .eq('isletme_id', isletme.id)
          .eq('assigned_to_personel', entityId)
          .neq('entity_type', 'personel')
          .order('created_at', { ascending: false });
        if (error) throw error;
        assignedNotes = (data as Not[]).filter(n => n.entity_id !== entityId);
      }

      const allNotes = [...(directNotes as Not[]), ...assignedNotes];
      const uniqueMap = new Map<string, Not>();
      allNotes.forEach(n => uniqueMap.set(n.id, n));
      return Array.from(uniqueMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    enabled: !!isletme && !!entityId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
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
      invalidateRelatedQueries(queryClient, 'not');
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
      invalidateRelatedQueries(queryClient, 'not');
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
      invalidateRelatedQueries(queryClient, 'not');
    },
  });
}

/**
 * Toggle task completion (completed_at) — used by checkbox in NoteRow
 * is_completed = true means "this is a task", completed_at means "task is done"
 */
export function useToggleNotCompletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { data, error } = await supabase
        .from('notlar')
        .update({
          completed_at: done ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Not;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'not');
    },
  });
}

/**
 * Mark a note as a task (set is_completed = true, which means "this is a task/todo")
 * Used by the "Görev Yap" action button in expanded NoteRow
 */
export function useMarkAsTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('notlar')
        .update({
          is_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Not;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'not');
    },
  });
}
