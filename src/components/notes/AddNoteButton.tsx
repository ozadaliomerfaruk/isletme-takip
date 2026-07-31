import { useState } from 'react';
import { Alert } from 'react-native';
import { StickyNote } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { GlassFab } from '@/components/ui';
import { colors } from '@/constants/colors';
import {
  createNoteId,
  noteEntityModule,
  useCreateNot,
} from '@/hooks/useNotlar';
import {
  removeNotePhotoBestEffort,
  useUploadNotePhoto,
} from '@/hooks/useNotePhoto';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';
import { scheduleNoteReminder } from '@/lib/notifications';
import {
  classifyMutationError,
  isPermissionDeniedError,
} from '@/lib/errors';
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
  const { isletme } = useAuthContext();
  const { showToast } = useToast();
  const { canCreate, canCreateContextNote } = usePermissions();
  const entityModule = noteEntityModule(entityType);
  const contextModule =
    entityModule === 'notlar' ? undefined : entityModule;
  const canCreateNote = contextModule
    ? canCreateContextNote(contextModule)
    : canCreate('notlar');

  const handleSave = async (data: NoteFormData) => {
    const noteId = createNoteId();
    let uploadedPhotoPath: string | null = null;
    let noteCreated = false;
    let failedDuringPhotoUpload = false;
    let reminderUpdateFailed = false;

    try {
      if (data.photo_uri) {
        if (!isletme) throw new Error('No isletme');
        failedDuringPhotoUpload = true;
        uploadedPhotoPath = await uploadPhoto.mutateAsync({
          uri: data.photo_uri,
          isletmeId: isletme.id,
          noteId,
          contextModule,
          action: 'create',
        });
        failedDuringPhotoUpload = false;
      }

      const noteData: Parameters<typeof createNot.mutateAsync>[0] = {
        id: noteId,
        contextModule,
        entity_type: entityType,
        entity_id: entityId,
        content: data.content,
        is_completed: data.is_completed,
        reminder_date: data.reminder_date,
        photo_path: uploadedPhotoPath,
        assigned_to_user: data.assigned_to_user,
        assigned_to_cari: data.assigned_to_cari,
        assigned_to_personel: data.assigned_to_personel,
      };

      const result = await createNot.mutateAsync(noteData);
      noteCreated = true;

      if (data.reminder_date) {
        try {
          await scheduleNoteReminder(
            result.id,
            t('common:notes.reminderNotification'),
            t('common:notes.reminderBody', { content: data.content.substring(0, 50) }),
            new Date(data.reminder_date),
            { type: 'note_reminder', note_id: result.id, entity_type: entityType, entity_id: entityId },
          );
        } catch (error) {
          console.warn('[Notes] reminder schedule failed after create:', error);
          reminderUpdateFailed = true;
        }
      }

      setModalVisible(false);
      showToast(t('common:notes.createSuccess'), 'success');
      if (reminderUpdateFailed) {
        Alert.alert(
          t('common:status.error'),
          t('common:notes.reminderUpdateFailed'),
        );
      }
    } catch (error) {
      // INSERT kesin reddedildiyse upload yetim kalmasın. Ağ sonucu belirsizse
      // INSERT commit olmuş olabilir; bağlı dosyayı yanlışlıkla silmeyiz.
      if (
        uploadedPhotoPath
        && !noteCreated
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
  };

  // Detay notu parent modül yetkisiyle; genel Notlar hub'ı exact Notlar yetkisiyle açılır.
  if (!canCreateNote) return null;

  return (
    <>
      {/* Cam FAB — komşusundaki işlem FAB'ıyla AYNI DİLDE olmalı: ikisi 14px
          arayla duruyor ve biri cam diğeri dolu disk olunca tutarsızlık
          uygulamanın en görünür yerinde oluşuyordu. Renk sarı kalıyor (warning):
          farklı bir aksiyon, aynı renk kafa karıştırırdı. */}
      <GlassFab
        size={44}
        iconSize={20}
        color={colors.warning}
        onPress={() => setModalVisible(true)}
        renderIcon={({ color, size }) => <StickyNote size={size} color={color} />}
        style={style}
        accessibilityLabel={t('common:notes.addNote')}
      />

      <NoteInputModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        loading={
          createNot.isPending
          || uploadPhoto.isPending
        }
        entityType={entityType}
        entityId={entityId}
      />
    </>
  );
}

// Buton stili GlassFab'e taşındı (boyut/gölge/dolgu orada, cam-fallback ayrımıyla).
