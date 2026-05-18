import { useState } from 'react';
import { StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { StickyNote } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/colors';
import { useCreateNot, useInvalidateNotlar } from '@/hooks/useNotlar';
import { useUploadNotePhoto } from '@/hooks/useNotePhoto';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { scheduleNoteReminder } from '@/lib/notifications';
import { NoteInputModal } from './NoteInputModal';
import type { NoteFormData } from './NoteInputModal';
import type { NotEntityType } from '@/types/database';

interface AddNoteButtonProps {
  entityType: NotEntityType;
  entityId: string;
  style?: object;
}

export function AddNoteButton({ entityType, entityId, style }: AddNoteButtonProps) {
  const { t } = useTranslation(['common']);
  const [modalVisible, setModalVisible] = useState(false);
  const createNot = useCreateNot();
  const uploadPhoto = useUploadNotePhoto();
  const invalidateNotlar = useInvalidateNotlar();
  const { isletme } = useAuthContext();
  const { showToast } = useToast();

  const handleSave = async (data: NoteFormData) => {
    try {
      const noteData: Parameters<typeof createNot.mutateAsync>[0] = {
        entity_type: entityType,
        entity_id: entityId,
        content: data.content,
        is_completed: data.is_completed,
        reminder_date: data.reminder_date,
        assigned_to_user: data.assigned_to_user,
        assigned_to_cari: data.assigned_to_cari,
        assigned_to_personel: data.assigned_to_personel,
      };

      const result = await createNot.mutateAsync(noteData);

      if (data.photo_uri && isletme) {
        try {
          const photoPath = await uploadPhoto.mutateAsync({
            uri: data.photo_uri,
            isletmeId: isletme.id,
            noteId: result.id,
          });
          const { supabase } = await import('@/lib/supabase');
          await supabase
            .from('notlar')
            .update({ photo_path: photoPath })
            .eq('id', result.id);
          invalidateNotlar();
        } catch {
          // photo upload failed but note was created
        }
      }

      if (data.reminder_date) {
        await scheduleNoteReminder(
          result.id,
          t('common:notes.reminderNotification'),
          t('common:notes.reminderBody', { content: data.content.substring(0, 50) }),
          new Date(data.reminder_date),
          { type: 'note_reminder', note_id: result.id, entity_type: entityType, entity_id: entityId },
        );
      }

      setModalVisible(false);
      showToast(t('common:notes.createSuccess'), 'success');
    } catch {
      Alert.alert(t('common:status.error'), t('common:errors.genericError'));
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.button, style]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <StickyNote size={20} color={colors.surface} />
      </TouchableOpacity>

      <NoteInputModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        loading={createNot.isPending || uploadPhoto.isPending}
        entityType={entityType}
        entityId={entityId}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.warning,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
});
