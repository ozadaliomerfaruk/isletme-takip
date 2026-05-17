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
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useNotePhotoField } from '@/hooks/useNotePhoto';
import { useIsletmeUsers } from '@/hooks/useMultiUser';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
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
  const { t } = useTranslation(['common']);
  const inputRef = useRef<TextInput>(null);

  const [content, setContent] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [reminderDate, setReminderDate] = useState<Date | null>(null);
  const [assignedUser, setAssignedUser] = useState<string | null>(null);
  const [assignedCari, setAssignedCari] = useState<string | null>(null);
  const [assignedPersonel, setAssignedPersonel] = useState<string | null>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [assignTab, setAssignTab] = useState<'users' | 'cari' | 'personel'>('users');

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
    return date.toLocaleDateString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
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

          {/* Text Input */}
          <ScrollView style={styles.inputScroll} keyboardShouldPersistTaps="handled">
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={t('common:notes.notePlaceholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              value={content}
              onChangeText={setContent}
              textAlignVertical="top"
              scrollEnabled={false}
            />
          </ScrollView>

          {/* Toolbar */}
          <View style={styles.toolbar}>
            <TouchableOpacity
              style={styles.toolbarBtn}
              onPress={handlePhotoAction}
              activeOpacity={0.7}
            >
              <Camera size={20} color={localPhotoUri ? colors.primary : colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolbarBtn}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <Bell size={20} color={reminderDate ? colors.warning : colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolbarBtn}
              onPress={() => setShowAssignPicker(!showAssignPicker)}
              activeOpacity={0.7}
            >
              <UserPlus
                size={20}
                color={
                  assignedUser || assignedCari || assignedPersonel
                    ? colors.info
                    : colors.textMuted
                }
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolbarBtn}
              onPress={() => setIsCompleted(!isCompleted)}
              activeOpacity={0.7}
            >
              <CheckCircle2
                size={20}
                color={isCompleted ? colors.success : colors.textMuted}
                fill={isCompleted ? colors.success : 'transparent'}
              />
            </TouchableOpacity>
          </View>

          {/* Photo Preview */}
          {localPhotoUri && (
            <View style={styles.photoRow}>
              <Image
                source={{ uri: localPhotoUri }}
                style={styles.photoThumb}
              />
              <TouchableOpacity onPress={clearPhoto}>
                <Trash2 size={16} color={colors.error} />
              </TouchableOpacity>
            </View>
          )}

          {/* Badges */}
          <View style={styles.badgeRow}>
            {reminderDate && (
              <TouchableOpacity style={styles.badge} onPress={() => setShowDatePicker(true)} onLongPress={removeReminder}>
                <Clock size={12} color={colors.warning} />
                <Text variant="caption" style={styles.badgeText}>
                  {formatReminderDate(reminderDate)}
                </Text>
              </TouchableOpacity>
            )}
            {assignedUser && (
              <View style={styles.badge}>
                <Text variant="caption" style={styles.badgeText}>
                  {getUserName(assignedUser)}
                </Text>
                <TouchableOpacity onPress={() => setAssignedUser(null)}>
                  <X size={10} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            {assignedCari && (
              <View style={styles.badge}>
                <Text variant="caption" style={styles.badgeText}>
                  {getCariName(assignedCari)}
                </Text>
                <TouchableOpacity onPress={() => setAssignedCari(null)}>
                  <X size={10} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            {assignedPersonel && (
              <View style={styles.badge}>
                <Text variant="caption" style={styles.badgeText}>
                  {getPersonelName(assignedPersonel)}
                </Text>
                <TouchableOpacity onPress={() => setAssignedPersonel(null)}>
                  <X size={10} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Assignment Picker */}
          {showAssignPicker && (
            <View style={styles.assignContainer}>
              <View style={styles.assignTabs}>
                <TouchableOpacity
                  style={[styles.assignTab, assignTab === 'users' && styles.assignTabActive]}
                  onPress={() => setAssignTab('users')}
                >
                  <Text variant="caption" color={assignTab === 'users' ? 'primary' : 'muted'}>
                    {t('common:notes.users')}
                  </Text>
                </TouchableOpacity>
                {(entityType === 'cari' || entityType === 'genel') && (
                  <TouchableOpacity
                    style={[styles.assignTab, assignTab === 'cari' && styles.assignTabActive]}
                    onPress={() => setAssignTab('cari')}
                  >
                    <Text variant="caption" color={assignTab === 'cari' ? 'primary' : 'muted'}>
                      {t('common:notes.entityCari')}
                    </Text>
                  </TouchableOpacity>
                )}
                {(entityType === 'personel' || entityType === 'genel') && (
                  <TouchableOpacity
                    style={[styles.assignTab, assignTab === 'personel' && styles.assignTabActive]}
                    onPress={() => setAssignTab('personel')}
                  >
                    <Text variant="caption" color={assignTab === 'personel' ? 'primary' : 'muted'}>
                      {t('common:notes.entityPersonel')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView style={styles.assignList} nestedScrollEnabled>
                {assignTab === 'users' &&
                  isletmeUsers?.map((u) => (
                    <TouchableOpacity
                      key={u.user_id}
                      style={[
                        styles.assignItem,
                        assignedUser === u.user_id && styles.assignItemActive,
                      ]}
                      onPress={() =>
                        setAssignedUser(assignedUser === u.user_id ? null : u.user_id)
                      }
                    >
                      <Text variant="body" numberOfLines={1}>
                        {u.profile?.display_name ?? u.profile?.email ?? u.user_id}
                      </Text>
                    </TouchableOpacity>
                  ))}
                {assignTab === 'cari' &&
                  cariler?.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.assignItem,
                        assignedCari === c.id && styles.assignItemActive,
                      ]}
                      onPress={() => setAssignedCari(assignedCari === c.id ? null : c.id)}
                    >
                      <Text variant="body" numberOfLines={1}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                {assignTab === 'personel' &&
                  personelList?.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.assignItem,
                        assignedPersonel === p.id && styles.assignItemActive,
                      ]}
                      onPress={() =>
                        setAssignedPersonel(assignedPersonel === p.id ? null : p.id)
                      }
                    >
                      <Text variant="body" numberOfLines={1}>
                        {p.last_name ? `${p.first_name} ${p.last_name}` : p.first_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
          )}

          {/* Date Picker */}
          {showDatePicker && (
            <View style={styles.datePickerContainer}>
              <DateTimePicker
                value={reminderDate ?? new Date()}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleDateChange}
                minimumDate={new Date()}
                themeVariant="light"
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
    backgroundColor: 'transparent',
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  inputScroll: {
    maxHeight: 150,
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
  },
  toolbar: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  toolbarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  photoThumb: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    fontSize: 11,
  },
  assignContainer: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    maxHeight: 180,
  },
  assignTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  assignTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  assignTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  assignList: {
    maxHeight: 130,
  },
  assignItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  assignItemActive: {
    backgroundColor: colors.primaryLight,
  },
  datePickerContainer: {
    marginTop: spacing.sm,
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
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
  },
});
