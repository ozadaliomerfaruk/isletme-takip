import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { cancelNoteReminder } from '@/lib/notifications';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import { logEvent } from '@/lib/appEvents';
import type { Not, NotInsert, NotUpdate, NotEntityType } from '@/types/database';
import { usePermissions } from '@/hooks/usePermissions';

function noteEntityModule(
  entityType: NotEntityType,
): 'hesaplar' | 'cariler' | 'personel' | 'urunler' | 'notlar' {
  if (entityType === 'hesap') return 'hesaplar';
  if (entityType === 'cari') return 'cariler';
  if (entityType === 'personel' || entityType === 'personel_izin') return 'personel';
  if (entityType === 'urun') return 'urunler';
  return 'notlar';
}

type NoteMutationRecord = Pick<
  Not,
  | 'id'
  | 'isletme_id'
  | 'entity_type'
  | 'created_by'
  | 'photo_path'
  | 'assigned_to_cari'
  | 'assigned_to_personel'
>;

const NOTE_MUTATION_SELECT =
  'id,isletme_id,entity_type,created_by,photo_path,assigned_to_cari,assigned_to_personel';

function noteTargetsAreAccessible(
  note: Pick<
    NoteMutationRecord,
    'entity_type' | 'assigned_to_cari' | 'assigned_to_personel'
  >,
  canAccessModule: ReturnType<typeof usePermissions>['canAccessModule'],
): boolean {
  if (!canAccessModule(noteEntityModule(note.entity_type))) return false;
  if (note.assigned_to_cari && !canAccessModule('cariler')) return false;
  if (note.assigned_to_personel && !canAccessModule('personel')) return false;
  return true;
}

async function fetchNoteForMutation(
  isletmeId: string,
  noteId: string,
): Promise<NoteMutationRecord> {
  const { data, error } = await supabase
    .from('notlar')
    .select(NOTE_MUTATION_SELECT)
    .eq('isletme_id', isletmeId)
    .eq('id', noteId)
    .single();

  if (error || !data) throw error ?? new Error('NOTE_NOT_FOUND');
  return data as NoteMutationRecord;
}

export function useInvalidateNotlar() {
  const queryClient = useQueryClient();
  return () => invalidateRelatedQueries(queryClient, 'not');
}

/**
 * Tum notlari getirir (opsiyonel entity filtresi)
 */
export function useNotlar(
  entityType?: NotEntityType,
  entityId?: string,
  enabled: boolean = true,
  allowedEntityTypes?: readonly NotEntityType[],
) {
  const { isletme } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeeGeneralNotes = canAccessModule('notlar');
  const canReadEntityType = (type: NotEntityType) =>
    canAccessModule(noteEntityModule(type));
  const requestedEntityAllowed = entityType
    ? canReadEntityType(entityType)
    : canSeeGeneralNotes;

  return useQuery({
    queryKey: [
      ...queryKeys.notlar.list(isletme?.id ?? '', entityType, entityId),
      { allowedEntityTypes: allowedEntityTypes ?? null },
    ],
    queryFn: async () => {
      if (!isletme || !requestedEntityAllowed) return [];

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
      } else {
        // Genel Notlar / arama, yalnız serbest notları ve kullanıcının açık
        // modüllerine bağlanan notları ağdan ister. `assigned_to_*` sonradan
        // değişebildiği için yalnız entity_type filtresi yeterli değildir.
        const requestedTypes = allowedEntityTypes ?? (
          ['hesap', 'cari', 'personel', 'personel_izin', 'urun', 'genel'] as const
        );
        const permittedTypes = requestedTypes.filter(canReadEntityType);
        const orParts: string[] = [];

        if (permittedTypes.includes('genel')) {
          orParts.push(
            'and(entity_type.eq.genel,assigned_to_cari.is.null,assigned_to_personel.is.null)',
          );
        }
        if (permittedTypes.includes('hesap')) orParts.push('entity_type.eq.hesap');
        if (permittedTypes.includes('urun')) orParts.push('entity_type.eq.urun');
        if (permittedTypes.includes('cari')) {
          orParts.push('entity_type.eq.cari', 'assigned_to_cari.not.is.null');
        }
        if (
          permittedTypes.includes('personel')
          || permittedTypes.includes('personel_izin')
        ) {
          orParts.push(
            'entity_type.eq.personel',
            'entity_type.eq.personel_izin',
            'assigned_to_personel.not.is.null',
          );
        }
        if (orParts.length === 0) return [];
        query = query.or(orParts.join(','));
      }
      if (entityId) {
        query = query.eq('entity_id', entityId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Not[];
    },
    enabled: enabled && requestedEntityAllowed && !!isletme,
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
  const { canAccessModule } = usePermissions();
  const canReadEntity = canAccessModule(noteEntityModule(entityType));

  return useQuery({
    queryKey: queryKeys.notlar.byEntity(isletme?.id ?? '', entityType, entityId),
    queryFn: async () => {
      if (!canReadEntity || !isletme || !entityId) return [];

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
    enabled: canReadEntity && !!isletme && !!entityId,
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
  const { canAccessModule, canCreate } = usePermissions();

  return useMutation({
    mutationFn: async (input: Omit<NotInsert, 'isletme_id'>) => {
      if (!isletme) throw new Error('No isletme');
      if (
        !canCreate('notlar')
        || !noteTargetsAreAccessible(
          {
            entity_type: input.entity_type,
            assigned_to_cari: input.assigned_to_cari ?? null,
            assigned_to_personel: input.assigned_to_personel ?? null,
          },
          canAccessModule,
        )
      ) {
        throw new Error('PERMISSION_DENIED');
      }

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
    onSuccess: (data) => {
      invalidateRelatedQueries(queryClient, 'not');
      logEvent('not_created', { entity_type: data?.entity_type ?? null });
    },
  });
}

/**
 * Not guncelle
 */
export function useUpdateNot() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();
  const { canAccessModule, canUpdate } = usePermissions();

  return useMutation({
    mutationFn: async ({ id, ...updates }: NotUpdate & { id: string }) => {
      if (!isletme) throw new Error('No isletme');
      const current = await fetchNoteForMutation(isletme.id, id);
      const target = {
        entity_type: current.entity_type,
        assigned_to_cari:
          updates.assigned_to_cari === undefined
            ? current.assigned_to_cari
            : updates.assigned_to_cari,
        assigned_to_personel:
          updates.assigned_to_personel === undefined
            ? current.assigned_to_personel
            : updates.assigned_to_personel,
      };
      if (
        !canUpdate('notlar', current.created_by)
        || !noteTargetsAreAccessible(target, canAccessModule)
      ) {
        throw new Error('PERMISSION_DENIED');
      }

      const { data, error } = await supabase
        .from('notlar')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('isletme_id', isletme.id)
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
  const { isletme } = useAuthContext();
  const { canAccessModule, canDelete } = usePermissions();

  return useMutation({
    mutationFn: async (note: { id: string; photo_path?: string | null }) => {
      if (!isletme) throw new Error('No isletme');
      const current = await fetchNoteForMutation(isletme.id, note.id);
      if (
        !canDelete('notlar', current.created_by)
        || !noteTargetsAreAccessible(current, canAccessModule)
      ) {
        throw new Error('PERMISSION_DENIED');
      }

      const { error } = await supabase
        .from('notlar')
        .delete()
        .eq('isletme_id', isletme.id)
        .eq('id', note.id);

      if (error) throw error;
      await cancelNoteReminder(note.id);

      // Fotoğraf yolu kullanıcı girdisinden değil, yetkisi doğrulanan DB
      // kaydından alınır. DB silme başarılı olduktan sonra yapılan temizlik,
      // yetkisiz bir çağrının dosya silmesini engeller.
      const expectedPrefix = `${isletme.id}/notlar/${note.id}_`;
      if (
        current.photo_path
        && current.photo_path.startsWith(expectedPrefix)
        && current.photo_path.endsWith('.webp')
      ) {
        await supabase.storage.from('islem-photos').remove([current.photo_path]);
      }
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
  const { isletme } = useAuthContext();
  const { canAccessModule, canUpdate } = usePermissions();

  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      if (!isletme) throw new Error('No isletme');
      const current = await fetchNoteForMutation(isletme.id, id);
      if (
        !canUpdate('notlar', current.created_by)
        || !noteTargetsAreAccessible(current, canAccessModule)
      ) {
        throw new Error('PERMISSION_DENIED');
      }

      const { data, error } = await supabase
        .from('notlar')
        .update({
          completed_at: done ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('isletme_id', isletme.id)
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
  const { isletme } = useAuthContext();
  const { canAccessModule, canUpdate } = usePermissions();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error('No isletme');
      const current = await fetchNoteForMutation(isletme.id, id);
      if (
        !canUpdate('notlar', current.created_by)
        || !noteTargetsAreAccessible(current, canAccessModule)
      ) {
        throw new Error('PERMISSION_DENIED');
      }

      const { data, error } = await supabase
        .from('notlar')
        .update({
          is_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('isletme_id', isletme.id)
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
