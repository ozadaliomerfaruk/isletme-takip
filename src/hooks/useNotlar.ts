import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { cancelNoteReminder } from '@/lib/notifications';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import { logEvent } from '@/lib/appEvents';
import type { Not, NotInsert, NotUpdate, NotEntityType } from '@/types/database';
import { usePermissions } from '@/hooks/usePermissions';

const NOTE_QUERY_META = {
  persist: false,
  query_purpose: 'notes:scoped-v2',
} as const;

export type NoteCreateInput = Omit<
  NotInsert,
  'isletme_id' | 'created_by'
> & {
  /**
   * Fotoğraf seçilen yeni notlarda dosya, aynı UUID ile INSERT'ten önce
   * yüklenir. Tenant/sahiplik yine istemciden alınmaz ve server trigger'ındadır.
   */
  id?: string;
};

type NoteCreateResult = Pick<Not, 'id' | 'entity_type'>;
type NoteMutationResult = Pick<Not, 'id'>;
export type NoteUpdateInput = Omit<NotUpdate, 'updated_at'>;
export type ContextNoteParentModule =
  | 'hesaplar'
  | 'cariler'
  | 'personel'
  | 'urunler';

type ContextNoteMutationInput = {
  /**
   * UI bağlamıdır; DB kolonuna/RPC patch'ine gönderilmez. Hook, notun gerçek
   * entity/atama alanlarıyla eşleşmesini ayrıca doğrular.
   */
  contextModule?: ContextNoteParentModule;
};

export function createNoteId(): string {
  return Crypto.randomUUID();
}

export function noteEntityModule(
  entityType: NotEntityType,
): 'hesaplar' | 'cariler' | 'personel' | 'urunler' | 'notlar' {
  if (entityType === 'hesap') return 'hesaplar';
  if (entityType === 'cari') return 'cariler';
  if (entityType === 'personel' || entityType === 'personel_izin') return 'personel';
  if (entityType === 'urun') return 'urunler';
  return 'notlar';
}

function noteMatchesContextModule(
  note: Pick<
    NoteMutationRecord,
    'entity_type' | 'assigned_to_cari' | 'assigned_to_personel'
  >,
  contextModule: ContextNoteParentModule,
): boolean {
  const entityModule = noteEntityModule(note.entity_type);
  if (entityModule !== 'notlar') return entityModule === contextModule;

  // Genel not yalnız doğrudan atandığı Cari/Personel detayında bağlamsaldır.
  if (contextModule === 'cariler') return !!note.assigned_to_cari;
  if (contextModule === 'personel') return !!note.assigned_to_personel;
  return false;
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
  contextModule?: ContextNoteParentModule,
): boolean {
  if (contextModule) {
    if (
      !canAccessModule(contextModule)
      || !noteMatchesContextModule(note, contextModule)
    ) {
      return false;
    }
  } else if (!canAccessModule(noteEntityModule(note.entity_type))) {
    return false;
  }
  if (note.assigned_to_cari && !canAccessModule('cariler')) return false;
  if (note.assigned_to_personel && !canAccessModule('personel')) return false;
  return true;
}

function useNoteReadAccess() {
  const { user } = useAuthContext();
  const {
    isOwner,
    permissionLevel,
    canAccessModule,
    canSeeAllUsersData,
  } = usePermissions();
  const canSeeNotes = canAccessModule('notlar');
  const canSeeAccounts = canAccessModule('hesaplar');
  const canSeeCariler = canAccessModule('cariler');
  const canSeePersonnel = canAccessModule('personel');
  const canSeeProducts = canAccessModule('urunler');
  const permissionFingerprint = [
    `o${Number(isOwner)}`,
    `l${permissionLevel ?? 'legacy'}`,
    `n${Number(canSeeNotes)}`,
    `h${Number(canSeeAccounts)}`,
    `c${Number(canSeeCariler)}`,
    `p${Number(canSeePersonnel)}`,
    `u${Number(canSeeProducts)}`,
    `a${Number(canSeeAllUsersData)}`,
  ].join('|');

  return {
    userId: user?.id ?? '',
    permissionFingerprint,
    canAccessModule,
    canSeeNotes,
  };
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
  const noteAccess = useNoteReadAccess();
  const { canAccessModule } = noteAccess;
  const canSeeGeneralNotes = noteAccess.canSeeNotes;
  const canReadEntityType = (type: NotEntityType) =>
    canAccessModule(noteEntityModule(type));
  const requestedEntityAllowed = entityType
    ? canReadEntityType(entityType)
    : canSeeGeneralNotes;

  const queryResult = useQuery({
    queryKey: queryKeys.notlar.list(
      isletme?.id ?? '',
      noteAccess.userId,
      noteAccess.permissionFingerprint,
      entityType,
      entityId,
      allowedEntityTypes,
    ),
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
        if (permittedTypes.length === 0) return [];

        // Kaynak entity tipi istemcide daraltılır; assigned_to_cari/personel
        // kesişimi ve assigned_to_user hedef kitlesi kanonik RLS tarafından AND
        // olarak uygulanır. Eski OR filtresi, kapalı Personel kaynağına bağlı ama
        // açık bir cariye atanmış notu gereksiz yere istemeye çalışıyordu.
        query = query.in('entity_type', permittedTypes);
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
    meta: NOTE_QUERY_META,
  });

  const mustMaskCachedRows =
    !requestedEntityAllowed
    || queryResult.isError
    || queryResult.isRefetchError;

  return {
    ...queryResult,
    data: mustMaskCachedRows ? [] : queryResult.data,
  };
}

/**
 * Belirli bir entity'ye ait notlari getirir + cross-entity assigned notes
 * (e.g. a note from 'genel' assigned_to_cari=X also appears on cari X's page)
 */
export function useNotlarByEntity(entityType: NotEntityType, entityId: string) {
  const { isletme } = useAuthContext();
  const noteAccess = useNoteReadAccess();
  const { canAccessModule } = noteAccess;
  const canReadEntity = canAccessModule(noteEntityModule(entityType));

  const queryResult = useQuery({
    queryKey: queryKeys.notlar.byEntity(
      isletme?.id ?? '',
      noteAccess.userId,
      noteAccess.permissionFingerprint,
      entityType,
      entityId,
    ),
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
    meta: NOTE_QUERY_META,
  });

  const mustMaskCachedRows =
    !canReadEntity
    || queryResult.isError
    || queryResult.isRefetchError;

  return {
    ...queryResult,
    data: mustMaskCachedRows ? [] : queryResult.data,
  };
}

/**
 * Not olustur
 */
export function useCreateNot() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();
  const {
    canAccessModule,
    canCreate,
    canCreateContextNote,
  } = usePermissions();

  return useMutation({
    mutationFn: async (
      {
        contextModule,
        ...input
      }: NoteCreateInput & ContextNoteMutationInput,
    ): Promise<NoteCreateResult> => {
      if (!isletme) throw new Error('No isletme');
      if (
        !(
          contextModule
            ? canCreateContextNote(contextModule)
            : canCreate('notlar')
        )
        || !noteTargetsAreAccessible(
          {
            entity_type: input.entity_type,
            assigned_to_cari: input.assigned_to_cari ?? null,
            assigned_to_personel: input.assigned_to_personel ?? null,
          },
          canAccessModule,
          contextModule,
        )
      ) {
        throw new Error('PERMISSION_DENIED');
      }

      const noteId = input.id ?? createNoteId();
      const { count, error } = await supabase
        .from('notlar')
        .insert({
          id: noteId,
          isletme_id: isletme.id,
          entity_type: input.entity_type,
          entity_id: input.entity_id ?? null,
          content: input.content,
          is_completed: input.is_completed ?? false,
          reminder_date: input.reminder_date ?? null,
          photo_path: input.photo_path ?? null,
          assigned_to_user: input.assigned_to_user ?? null,
          assigned_to_cari: input.assigned_to_cari ?? null,
          assigned_to_personel: input.assigned_to_personel ?? null,
          // created_by istemciden asla kabul edilmez; BEFORE trigger auth.uid()
          // ile sahipler. Client-generated id, RETURNING/SELECT gerektirmeden
          // hatırlatıcı ve fotoğraf akışına kararlı referans verir.
        }, { count: 'exact' });

      if (error) throw error;
      if (count !== 1) throw new Error('PERMISSION_DENIED');
      return { id: noteId, entity_type: input.entity_type };
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
  const {
    canAccessModule,
    canUpdate,
    canUpdateContextNote,
  } = usePermissions();

  return useMutation({
    mutationFn: async (
      {
        id,
        contextModule,
        ...updates
      }: NoteUpdateInput & { id: string } & ContextNoteMutationInput,
    ): Promise<NoteMutationResult> => {
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
        !(
          contextModule
            ? canUpdateContextNote(contextModule, current.created_by)
            : canUpdate('notlar', current.created_by)
        )
        || !noteTargetsAreAccessible(
          target,
          canAccessModule,
          contextModule,
        )
      ) {
        throw new Error('PERMISSION_DENIED');
      }

      const patch: Record<string, unknown> = {};
      if (updates.content !== undefined) {
        patch.content = updates.content;
      }
      if (updates.is_completed !== undefined) {
        patch.is_completed = updates.is_completed;
      }
      if (updates.completed_at !== undefined) {
        patch.completed_at = updates.completed_at;
      }
      if (updates.reminder_date !== undefined) {
        patch.reminder_date = updates.reminder_date;
      }
      if (updates.photo_path !== undefined) {
        patch.photo_path = updates.photo_path;
      }
      if (updates.assigned_to_user !== undefined) {
        patch.assigned_to_user = updates.assigned_to_user;
      }
      if (updates.assigned_to_cari !== undefined) {
        patch.assigned_to_cari = updates.assigned_to_cari;
      }
      if (updates.assigned_to_personel !== undefined) {
        patch.assigned_to_personel = updates.assigned_to_personel;
      }
      if (Object.keys(patch).length === 0) {
        throw new Error('NOTE_UPDATE_EMPTY_PATCH');
      }

      const { data, error } = await supabase.rpc(
        'not_guncelle_v1',
        {
          p_isletme_id: isletme.id,
          p_not_id: id,
          p_patch: patch,
        },
      );

      if (error) throw error;
      if (data !== id) throw new Error('PERMISSION_DENIED');
      return { id };
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
  const {
    canAccessModule,
    canDelete,
    canDeleteContextNote,
  } = usePermissions();

  return useMutation({
    mutationFn: async (
      note: {
        id: string;
        photo_path?: string | null;
      } & ContextNoteMutationInput,
    ) => {
      if (!isletme) throw new Error('No isletme');
      const current = await fetchNoteForMutation(isletme.id, note.id);
      if (
        !(
          note.contextModule
            ? canDeleteContextNote(
                note.contextModule,
                current.created_by,
              )
            : canDelete('notlar', current.created_by)
        )
        || !noteTargetsAreAccessible(
          current,
          canAccessModule,
          note.contextModule,
        )
      ) {
        throw new Error('PERMISSION_DENIED');
      }

      const { count, error } = await supabase
        .from('notlar')
        .delete({ count: 'exact' })
        .eq('isletme_id', isletme.id)
        .eq('id', note.id);

      if (error) throw error;
      if (count !== 1) throw new Error('PERMISSION_DENIED');
      try {
        await cancelNoteReminder(note.id);
      } catch (reminderError) {
        // DB silme artik kesin; cihaz bildirimi temizligi ana mutation sonucunu
        // basarisiz gibi gostermemeli ve cache invalidation'i engellememeli.
        console.warn(
          '[Notes] reminder cleanup failed after delete:',
          reminderError,
        );
      }

      // Fotoğraf yolu kullanıcı girdisinden değil, yetkisi doğrulanan DB
      // kaydından alınır. DB silme başarılı olduktan sonra yapılan temizlik,
      // yetkisiz bir çağrının dosya silmesini engeller.
      const expectedPrefix = `${isletme.id}/notlar/${note.id}_`;
      if (
        current.photo_path
        && current.photo_path.startsWith(expectedPrefix)
        && current.photo_path.endsWith('.webp')
      ) {
        try {
          const { error: photoCleanupError } = await supabase.storage
            .from('islem-photos')
            .remove([current.photo_path]);
          if (photoCleanupError) {
            console.warn(
              '[Notes] photo cleanup failed after delete:',
              photoCleanupError,
            );
          }
        } catch (photoCleanupError) {
          console.warn(
            '[Notes] photo cleanup failed after delete:',
            photoCleanupError,
          );
        }
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
  const {
    canAccessModule,
    canUpdate,
    canUpdateContextNote,
  } = usePermissions();

  return useMutation({
    mutationFn: async (
      {
        id,
        done,
        contextModule,
      }: {
        id: string;
        done: boolean;
      } & ContextNoteMutationInput,
    ): Promise<NoteMutationResult> => {
      if (!isletme) throw new Error('No isletme');
      const current = await fetchNoteForMutation(isletme.id, id);
      if (
        !(
          contextModule
            ? canUpdateContextNote(contextModule, current.created_by)
            : canUpdate('notlar', current.created_by)
        )
        || !noteTargetsAreAccessible(
          current,
          canAccessModule,
          contextModule,
        )
      ) {
        throw new Error('PERMISSION_DENIED');
      }

      const { count, error } = await supabase
        .from('notlar')
        .update(
          {
            completed_at: done ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          },
          { count: 'exact' },
        )
        .eq('isletme_id', isletme.id)
        .eq('id', id);

      if (error) throw error;
      if (count !== 1) throw new Error('PERMISSION_DENIED');
      return { id };
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
  const {
    canAccessModule,
    canUpdate,
    canUpdateContextNote,
  } = usePermissions();

  return useMutation({
    mutationFn: async (
      input: string | ({ id: string } & ContextNoteMutationInput),
    ): Promise<NoteMutationResult> => {
      const id = typeof input === 'string' ? input : input.id;
      const contextModule =
        typeof input === 'string' ? undefined : input.contextModule;
      if (!isletme) throw new Error('No isletme');
      const current = await fetchNoteForMutation(isletme.id, id);
      if (
        !(
          contextModule
            ? canUpdateContextNote(contextModule, current.created_by)
            : canUpdate('notlar', current.created_by)
        )
        || !noteTargetsAreAccessible(
          current,
          canAccessModule,
          contextModule,
        )
      ) {
        throw new Error('PERMISSION_DENIED');
      }

      const { count, error } = await supabase
        .from('notlar')
        .update(
          {
            is_completed: true,
            updated_at: new Date().toISOString(),
          },
          { count: 'exact' },
        )
        .eq('isletme_id', isletme.id)
        .eq('id', id);

      if (error) throw error;
      if (count !== 1) throw new Error('PERMISSION_DENIED');
      return { id };
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'not');
    },
  });
}
