import { useState, useMemo, useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useUpdateNot, useDeleteNot, useToggleNotCompletion, useMarkAsTask, useInvalidateNotlar } from '@/hooks/useNotlar';
import { useUploadNotePhoto } from '@/hooks/useNotePhoto';
import { scheduleNoteReminder, cancelNoteReminder } from '@/lib/notifications';
import type { NoteFormData } from '@/components/notes/NoteInputModal';
import type { Not } from '@/types/database';

type EntityType = 'cari' | 'hesap' | 'personel' | 'urun';

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
  const invalidateNotlar = useInvalidateNotlar();

  const editingNote = useMemo(() => {
    if (!editingNoteId || !entityNotes) return null;
    return entityNotes.find(n => n.id === editingNoteId) ?? null;
  }, [editingNoteId, entityNotes]);

  const handleNoteUpdate = useCallback(async (data: NoteFormData) => {
    if (!editingNoteId || !editingNote) return;
    try {
      await updateNot.mutateAsync({
        id: editingNoteId,
        content: data.content,
        is_completed: data.is_completed,
        reminder_date: data.reminder_date,
        assigned_to_user: data.assigned_to_user,
        assigned_to_cari: data.assigned_to_cari,
        assigned_to_personel: data.assigned_to_personel,
      });

      if (data.photo_uri && data.photo_uri !== editingNote.photo_path && isletmeId) {
        try {
          if (editingNote.photo_path) {
            const { supabase: sb } = await import('@/lib/supabase');
            await sb.storage.from('islem-photos').remove([editingNote.photo_path]);
          }
          const photoPath = await uploadNotePhoto.mutateAsync({
            uri: data.photo_uri,
            isletmeId,
            noteId: editingNoteId,
          });
          const { supabase } = await import('@/lib/supabase');
          await supabase.from('notlar').update({ photo_path: photoPath }).eq('id', editingNoteId);
          invalidateNotlar();
        } catch { /* ignore photo error */ }
      } else if (!data.photo_uri && editingNote.photo_path) {
        const { supabase } = await import('@/lib/supabase');
        await supabase.storage.from('islem-photos').remove([editingNote.photo_path]);
        await supabase.from('notlar').update({ photo_path: null }).eq('id', editingNoteId);
        invalidateNotlar();
      }

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

      setEditingNoteId(null);
    } catch {
      Alert.alert(t('common:status.error'), t('common:errors.genericError'));
    }
  }, [editingNoteId, editingNote, updateNot, uploadNotePhoto, isletmeId, entityId, entityType, t, invalidateNotlar]);

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
            try { await deleteNot.mutateAsync({ id: noteId, photo_path: note?.photo_path }); } catch { /* ignore */ }
          },
        },
      ]
    );
  }, [deleteNot, entityNotes, t]);

  const handleToggleNoteCompletion = useCallback((noteId: string, done: boolean) => {
    toggleNotCompletion.mutate({ id: noteId, done });
  }, [toggleNotCompletion]);

  const handleMarkAsTask = useCallback((noteId: string) => {
    markAsTask.mutate(noteId);
  }, [markAsTask]);

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
