import { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  X,
  Camera,
  Bell,
  UserPlus,
  CheckCircle2,
  Clock,
  Trash2,
  User,
  Users,
  UserCircle,
  Check,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useNotePhotoField } from '@/hooks/useNotePhoto';
import { useIsletmeUsers } from '@/hooks/useMultiUser';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { EntityPickerModal, EntityPickerItem } from '@/components/import/EntityPickerModal';
import type { NotEntityType } from '@/types/database';

export interface NoteFormData {
  content: string;
  is_completed: boolean;
  reminder_date: string | null;
  photo_uri: string | null;
  assigned_to_user: string | null;
  assigned_to_cari: string | null;
  assigned_to_personel: string | null;
}

interface NoteInputModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: NoteFormData) => void;
  initialData?: Partial<NoteFormData>;
  isEditing?: boolean;
  loading?: boolean;
  entityType: NotEntityType;
  entityId: string;
  existingPhotoPath?: string | null;
}

export function NoteInputModal({
  visible,
  onClose,
  onSave,
  initialData,
  isEditing = false,
  loading = false,
  entityType,
  entityId: _entityId,
  existingPhotoPath,
}: NoteInputModalProps) {
  const { t, i18n } = useTranslation(['common']);
  const inputRef = useRef<TextInput>(null);

  const [content, setContent] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [reminderDate, setReminderDate] = useState<Date | null>(null);
  const [assignedUser, setAssignedUser] = useState<string | null>(null);
  const [assignedCari, setAssignedCari] = useState<string | null>(null);
  const [assignedPersonel, setAssignedPersonel] = useState<string | null>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [assignPickerType, setAssignPickerType] = useState<'user' | 'cari' | 'personel' | null>(null);
  const [assignSearch, setAssignSearch] = useState('');

  const { localPhotoUri, setLocalPhotoUri, handlePickImage, handleTakePhoto, clearPhoto } =
    useNotePhotoField();

  const { data: isletmeUsers } = useIsletmeUsers();
  const { data: cariler } = useCariler();
  const { data: personelList } = usePersonelList();

  useEffect(() => {
    if (visible) {
      setContent(initialData?.content ?? '');
      setIsCompleted(initialData?.is_completed ?? false);
      setReminderDate(initialData?.reminder_date ? new Date(initialData.reminder_date) : null);
      setAssignedUser(initialData?.assigned_to_user ?? null);
      setAssignedCari(initialData?.assigned_to_cari ?? null);
      setAssignedPersonel(initialData?.assigned_to_personel ?? null);
      if (initialData?.photo_uri) {
        setLocalPhotoUri(initialData.photo_uri);
      } else if (existingPhotoPath) {
        setLocalPhotoUri(existingPhotoPath);
      } else {
        clearPhoto();
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible, initialData, existingPhotoPath, setLocalPhotoUri, clearPhoto]);

  const handleSave = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSave({
      content: trimmed,
      is_completed: isCompleted,
      reminder_date: reminderDate?.toISOString() ?? null,
      photo_uri: localPhotoUri,
      assigned_to_user: assignedUser,
      assigned_to_cari: assignedCari,
      assigned_to_personel: assignedPersonel,
    });
  };

  const handleDismiss = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onClose();
  };

  const handlePhotoAction = () => {
    Alert.alert(t('common:notes.addPhoto'), undefined, [
      { text: t('common:notes.takePhoto'), onPress: () => handleTakePhoto().catch(() => {}) },
      { text: t('common:notes.pickFromGallery'), onPress: () => handlePickImage().catch(() => {}) },
      { text: t('common:buttons.cancel'), style: 'cancel' },
    ]);
  };

  const handleDateChange = (_: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setReminderDate(selectedDate);
    }
  };

  const confirmDateIOS = () => {
    setShowDatePicker(false);
  };

  const removeReminder = () => {
    setReminderDate(null);
  };

  // Assignment picker data
  const userItems: EntityPickerItem[] = (isletmeUsers ?? []).map(u => ({
    id: u.user_id,
    label: u.profile?.display_name ?? u.profile?.email ?? u.user_id,
  }));

  const cariItems: EntityPickerItem[] = (cariler ?? []).map(c => ({
    id: c.id,
    label: c.name,
  }));

  const personelItems: EntityPickerItem[] = (personelList ?? []).map(p => ({
    id: p.id,
    label: [p.first_name, p.last_name].filter(Boolean).join(' '),
  }));

  const getFilteredItems = () => {
    let items: EntityPickerItem[] = [];
    if (assignPickerType === 'user') items = userItems;
    else if (assignPickerType === 'cari') items = cariItems;
    else if (assignPickerType === 'personel') items = personelItems;

    if (!assignSearch.trim()) return items;
    const q = assignSearch.toLowerCase();
    return items.filter(i => i.label.toLowerCase().includes(q));
  };

  const handleAssignSelect = (id: string) => {
    if (assignPickerType === 'user') {
      setAssignedUser(assignedUser === id ? null : id);
    } else if (assignPickerType === 'cari') {
      setAssignedCari(assignedCari === id ? null : id);
    } else if (assignPickerType === 'personel') {
      setAssignedPersonel(assignedPersonel === id ? null : id);
    }
    setAssignPickerType(null);
    setAssignSearch('');
  };

  const getAssignPickerTitle = () => {
    if (assignPickerType === 'user') return t('common:notes.users');
    if (assignPickerType === 'cari') return t('common:notes.entityCari');
    return t('common:notes.entityPersonel');
  };

  const getAssignPickerSelectedId = () => {
    if (assignPickerType === 'user') return assignedUser;
    if (assignPickerType === 'cari') return assignedCari;
    return assignedPersonel;
  };

  const getUserName = (userId: string) => {
    const user = isletmeUsers?.find((u) => u.user_id === userId);
    return user?.profile?.display_name ?? user?.profile?.email ?? '?';
  };

  const getCariName = (cariId: string) => {
    const cari = cariler?.find((c) => c.id === cariId);
    return cari?.name ?? '?';
  };

  const getPersonelName = (personelId: string) => {
    const p = personelList?.find((per) => per.id === personelId);
    if (!p) return '?';
    return p.last_name ? `${p.first_name} ${p.last_name}` : p.first_name;
  };

  const formatReminderDate = (date: Date) => {
    return date.toLocaleDateString(i18n.language === 'tr' ? 'tr-TR' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const hasAnyAssignment = assignedUser || assignedCari || assignedPersonel;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={handleDismiss} />
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text variant="h3">
              {isEditing ? t('common:notes.editNote') : t('common:notes.addNote')}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Text Input */}
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={t('common:notes.notePlaceholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              value={content}
              onChangeText={setContent}
              textAlignVertical="top"
            />

            {/* Photo Preview */}
            {localPhotoUri && (
              <View style={styles.photoRow}>
                <Image source={{ uri: localPhotoUri }} style={styles.photoThumb} />
                <TouchableOpacity style={styles.photoRemoveBtn} onPress={clearPhoto}>
                  <Trash2 size={14} color={colors.error} />
                  <Text variant="caption" style={{ color: colors.error }}>
                    {t('common:notes.removePhoto')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Reminder Badge */}
            {reminderDate && (
              <View style={styles.infoRow}>
                <View style={styles.infoBadge}>
                  <Clock size={14} color={colors.warning} />
                  <Text variant="body" style={styles.infoBadgeText}>
                    {formatReminderDate(reminderDate)}
                  </Text>
                </View>
                <TouchableOpacity onPress={removeReminder} hitSlop={8}>
                  <X size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* Assignment Badges */}
            {hasAnyAssignment && (
              <View style={styles.assignBadgesRow}>
                {assignedUser && (
                  <View style={styles.assignBadge}>
                    <User size={12} color={colors.info} />
                    <Text variant="caption" style={styles.assignBadgeText}>
                      {getUserName(assignedUser)}
                    </Text>
                    <TouchableOpacity onPress={() => setAssignedUser(null)} hitSlop={6}>
                      <X size={12} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                )}
                {assignedCari && (
                  <View style={styles.assignBadge}>
                    <Users size={12} color={colors.info} />
                    <Text variant="caption" style={styles.assignBadgeText}>
                      {getCariName(assignedCari)}
                    </Text>
                    <TouchableOpacity onPress={() => setAssignedCari(null)} hitSlop={6}>
                      <X size={12} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                )}
                {assignedPersonel && (
                  <View style={styles.assignBadge}>
                    <UserCircle size={12} color={colors.success} />
                    <Text variant="caption" style={styles.assignBadgeText}>
                      {getPersonelName(assignedPersonel)}
                    </Text>
                    <TouchableOpacity onPress={() => setAssignedPersonel(null)} hitSlop={6}>
                      <X size={12} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Date Picker (inline) */}
            {showDatePicker && (
              <View style={styles.datePickerContainer}>
                <DateTimePicker
                  value={reminderDate ?? new Date()}
                  mode="datetime"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleDateChange}
                  minimumDate={new Date()}
                  themeVariant="light"
                  locale={i18n.language === 'tr' ? 'tr' : 'en'}
                />
                {Platform.OS === 'ios' && (
                  <View style={styles.datePickerActions}>
                    <Button variant="outline" size="sm" onPress={() => setShowDatePicker(false)}>
                      {t('common:buttons.cancel')}
                    </Button>
                    <Button variant="primary" size="sm" onPress={confirmDateIOS}>
                      {t('common:buttons.ok')}
                    </Button>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Toolbar */}
          <View style={styles.toolbar}>
            <TouchableOpacity
              style={[styles.toolbarBtn, localPhotoUri && styles.toolbarBtnActive]}
              onPress={handlePhotoAction}
              activeOpacity={0.7}
            >
              <Camera size={20} color={localPhotoUri ? colors.primary : colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toolbarBtn, reminderDate && styles.toolbarBtnActive]}
              onPress={() => setShowDatePicker(!showDatePicker)}
              activeOpacity={0.7}
            >
              <Bell size={20} color={reminderDate ? colors.warning : colors.textMuted} />
            </TouchableOpacity>

            {/* Assign buttons — individual for each type */}
            <TouchableOpacity
              style={[styles.toolbarBtn, assignedUser && styles.toolbarBtnActive]}
              onPress={() => { setAssignPickerType('user'); setAssignSearch(''); }}
              activeOpacity={0.7}
            >
              <User size={20} color={assignedUser ? colors.info : colors.textMuted} />
            </TouchableOpacity>

            {(entityType === 'cari' || entityType === 'genel') && (
              <TouchableOpacity
                style={[styles.toolbarBtn, assignedCari && styles.toolbarBtnActive]}
                onPress={() => { setAssignPickerType('cari'); setAssignSearch(''); }}
                activeOpacity={0.7}
              >
                <Users size={20} color={assignedCari ? colors.info : colors.textMuted} />
              </TouchableOpacity>
            )}

            {(entityType === 'personel' || entityType === 'genel') && (
              <TouchableOpacity
                style={[styles.toolbarBtn, assignedPersonel && styles.toolbarBtnActive]}
                onPress={() => { setAssignPickerType('personel'); setAssignSearch(''); }}
                activeOpacity={0.7}
              >
                <UserCircle size={20} color={assignedPersonel ? colors.success : colors.textMuted} />
              </TouchableOpacity>
            )}

            <View style={styles.toolbarSpacer} />

            <TouchableOpacity
              style={[styles.toolbarBtn, isCompleted && styles.toolbarBtnComplete]}
              onPress={() => setIsCompleted(!isCompleted)}
              activeOpacity={0.7}
            >
              <CheckCircle2
                size={20}
                color={isCompleted ? '#fff' : colors.textMuted}
                fill={isCompleted ? colors.success : 'transparent'}
              />
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Button variant="outline" size="md" onPress={onClose} style={styles.button}>
              {t('common:buttons.cancel')}
            </Button>
            <Button
              variant="primary"
              size="md"
              onPress={handleSave}
              loading={loading}
              disabled={!content.trim()}
              style={styles.button}
            >
              {t('common:buttons.save')}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Assignment Picker Modal */}
      <EntityPickerModal
        visible={!!assignPickerType}
        title={getAssignPickerTitle()}
        items={getFilteredItems()}
        selectedId={getAssignPickerSelectedId()}
        onSelect={handleAssignSelect}
        onClose={() => { setAssignPickerType(null); setAssignSearch(''); }}
        searchValue={assignSearch}
        onSearchChange={setAssignSearch}
        renderIcon={(_item, isSelected) => (
          <View style={[styles.assignIcon, isSelected && styles.assignIconSelected]}>
            {assignPickerType === 'user' && <User size={16} color={isSelected ? colors.primary : colors.textMuted} />}
            {assignPickerType === 'cari' && <Users size={16} color={isSelected ? colors.primary : colors.textMuted} />}
            {assignPickerType === 'personel' && <UserCircle size={16} color={isSelected ? colors.primary : colors.textMuted} />}
          </View>
        )}
        selectedColor={colors.primary}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  scrollBody: {
    maxHeight: 350,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    minHeight: 100,
    maxHeight: 160,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  photoThumb: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
  },
  photoRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.md,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  infoBadgeText: {
    fontSize: 14,
    color: colors.text,
  },
  assignBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  assignBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  assignBadgeText: {
    fontSize: 12,
    color: colors.text,
    maxWidth: 100,
  },
  datePickerContainer: {
    marginTop: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  datePickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  toolbarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbarBtnActive: {
    backgroundColor: colors.primaryLight,
  },
  toolbarBtnComplete: {
    backgroundColor: colors.success,
  },
  toolbarSpacer: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  button: {
    flex: 1,
  },
  assignIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assignIconSelected: {
    backgroundColor: colors.primaryLight,
  },
});
