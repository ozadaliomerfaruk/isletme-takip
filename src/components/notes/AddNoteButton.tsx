import { useState } from 'react';
import { StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { StickyNote } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useCreateNot } from '@/hooks/useNotlar';
import { useToast } from '@/contexts/ToastContext';
import { NoteInputModal } from './NoteInputModal';
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
  const { showToast } = useToast();

  const handleSave = async (content: string) => {
    try {
      await createNot.mutateAsync({
        entity_type: entityType,
        entity_id: entityId,
        content,
      });
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
        loading={createNot.isPending}
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
