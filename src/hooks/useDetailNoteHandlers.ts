import { useState, useMemo, useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useUpdateNot,
  useDeleteNot,
  useToggleNotCompletion,
  useMarkAsTask,
  type ContextNoteParentModule,
} from '@/hooks/useNotlar';
import {
  removeNotePhotoBestEffort,
  useUploadNotePhoto,
} from '@/hooks/useNotePhoto';
import { scheduleNoteReminder, cancelNoteReminder } from '@/lib/notifications';
import {
  classifyMutationError,
  isPermissionDeniedError,
} from '@/lib/errors';
import type { NoteFormData } from '@/components/notes/NoteInputModal';
import type { Not } from '@/types/database';

type EntityType = 'cari' | 'hesap' | 'personel' | 'urun';

const CONTEXT_MODULE_BY_ENTITY: Record<
  EntityType,
  ContextNoteParentModule
> = {
  cari: 'cariler',
  hesap: 'hesaplar',
  personel: 'personel',
  urun: 'urunler',
};

interface UseDetailNoteHandlersParams {
  entityType: EntityType;
  entityId: string;
  entityNotes: Not[] | undefined;
  isletmeId: string | undefined;
}

export function useDetailNoteHandlers({
  entityType,
  entityId,
  entityNotes,
  isletmeId,
}: UseDetailNoteHandlersParams) {
  const { t } = useTranslation();
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const updateNot = useUpdateNot();
  const deleteNot = useDeleteNot();
  const toggleNotCompletion = useToggleNotCompletion();
  const markAsTask = useMarkAsTask();
  const uploadNotePhoto = useUploadNotePhoto();
  const contextModule = CONTEXT_MODULE_BY_ENTITY[entityType];

  const editingNote = useMemo(() => {
    if (!editingNoteId || !entityNotes) return null;
    return entityNotes.find(n => n.id === editingNoteId) ?? null;
  }, [editingNoteId, entityNotes]);

  const handleNoteUpdate = useCallback(async (data: NoteFormData) => {
    if (!editingNoteId || !editingNote) return;
    const isPhotoReplacement =
      !!data.photo_uri && data.photo_uri !== editingNote.photo_path;
    let uploadedPhotoPath: string | null = null;
    let noteUpdated = false;
    let failedDuringPhotoUpload = false;
    let reminderUpdateFailed = false;

    try {
      if (isPhotoReplacement && !isletmeId) {
        throw new Error('No isletme');
      }
      if (isPhotoReplacement && isletmeId && data.photo_uri) {
        failedDuringPhotoUpload = true;
        uploadedPhotoPath = await uploadNotePhoto.mutateAsync({
          uri: data.photo_uri,
          isletmeId,
          noteId: editingNoteId,
          contextModule,
          action: 'update',
          createdBy: editingNote.created_by ?? null,
        });
        failedDuringPhotoUpload = false;
      }

      const nextPhotoPath = isPhotoReplacement
        ? uploadedPhotoPath
        : data.photo_uri
          ? editingNote.photo_path
          : null;

      await updateNot.mutateAsync({
        id: editingNoteId,
        contextModule,
        content: data.content,
        is_completed: data.is_completed,
        reminder_date: data.reminder_date,
        assigned_to_user: data.assigned_to_user,
        assigned_to_cari: data.assigned_to_cari,
        assigned_to_personel: data.assigned_to_personel,
        photo_path: nextPhotoPath,
      });
      noteUpdated = true;

      if (
        editingNote.photo_path
        && editingNote.photo_path !== nextPhotoPath
      ) {
        await removeNotePhotoBestEffort(editingNote.photo_path);
      }

      try {
        if (data.reminder_date) {
          await scheduleNoteReminder(
            editingNoteId,
            t('common:notes.reminderNotification'),
            t('common:notes.reminderBody', { content: data.content.substring(0, 50) }),
            new Date(data.reminder_date),
            { type: 'note_reminder', note_id: editingNoteId, entity_type: entityType, entity_id: entityId },
          );
        } else {
          await cancelNoteReminder(editingNoteId);
        }
      } catch (error) {
        console.warn('[Notes] reminder update failed after edit:', error);
        reminderUpdateFailed = true;
      }

      setEditingNoteId(null);
      if (reminderUpdateFailed) {
        Alert.alert(
          t('common:status.error'),
          t('common:notes.reminderUpdateFailed'),
        );
      }
    } catch (error) {
      if (
        uploadedPhotoPath
        && !noteUpdated
        && classifyMutationError(error) !== 'network_unknown'
      ) {
        await removeNotePhotoBestEffort(uploadedPhotoPath);
      }
      Alert.alert(
        t('common:status.error'),
        isPermissionDeniedError(error)
          ? t('common:errors.permissionDenied')
          : failedDuringPhotoUpload
            ? t('common:photo.uploadError')
            : t('common:errors.genericError'),
      );
    }
  }, [editingNoteId, editingNote, updateNot, uploadNotePhoto, isletmeId, entityId, entityType, contextModule, t]);

  const handleNoteDelete = useCallback((noteId: string) => {
    const note = entityNotes?.find(n => n.id === noteId);
    Alert.alert(
      t('common:notes.confirmDeleteTitle'),
      t('common:notes.confirmDelete'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNot.mutateAsync({
                id: noteId,
                photo_path: note?.photo_path,
                contextModule,
              });
            } catch (error) {
              Alert.alert(
                t('common:status.error'),
                isPermissionDeniedError(error)
                  ? t('common:errors.permissionDenied')
                  : t('common:errors.genericError'),
              );
            }
          },
        },
      ]
    );
  }, [contextModule, deleteNot, entityNotes, t]);

  const handleToggleNoteCompletion = useCallback(async (
    noteId: string,
    done: boolean,
  ) => {
    try {
      await toggleNotCompletion.mutateAsync({
        id: noteId,
        done,
        contextModule,
      });
    } catch (error) {
      Alert.alert(
        t('common:status.error'),
        isPermissionDeniedError(error)
          ? t('common:errors.permissionDenied')
          : t('common:errors.genericError'),
      );
    }
  }, [contextModule, t, toggleNotCompletion]);

  const handleMarkAsTask = useCallback(async (noteId: string) => {
    try {
      await markAsTask.mutateAsync({ id: noteId, contextModule });
    } catch (error) {
      Alert.alert(
        t('common:status.error'),
        isPermissionDeniedError(error)
          ? t('common:errors.permissionDenied')
          : t('common:errors.genericError'),
      );
    }
  }, [contextModule, markAsTask, t]);

  return {
    editingNoteId,
    setEditingNoteId,
    editingNote,
    handleNoteUpdate,
    handleNoteDelete,
    handleToggleNoteCompletion,
    handleMarkAsTask,
    isUpdatingNote: updateNot.isPending,
  };
}
