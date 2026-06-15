import { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList, Alert, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  StickyNote,
  Plus,
  Wallet,
  Users,
  UserCircle,
  Package,
  Globe,
  CheckCircle2,
} from 'lucide-react-native';
import {
  Text,
  SearchInput,
  EmptyState,
  SwipeableRow,
  SwipeableProvider,
} from '@/components/ui';
import { UndoSnackbar } from '@/components/ui/UndoSnackbar';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useNotlar, useCreateNot, useUpdateNot, useDeleteNot, useToggleNotCompletion, useMarkAsTask, useInvalidateNotlar } from '@/hooks/useNotlar';
import { useUploadNotePhoto } from '@/hooks/useNotePhoto';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { useUrunler } from '@/hooks/useUrunler';
import { useIsletmeUsers } from '@/hooks/useMultiUser';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePagePermission } from '@/hooks/usePagePermission';
import { useToast } from '@/contexts/ToastContext';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useDateFormat } from '@/hooks/useDateFormat';
import { scheduleNoteReminder, cancelNoteReminder } from '@/lib/notifications';
import { NoteInputModal } from '@/components/notes/NoteInputModal';
import { NoteRow } from '@/components/notes/NoteRow';
import { PhotoViewerModal } from '@/components/transaction/PhotoViewerModal';
import type { NoteFormData } from '@/components/notes/NoteInputModal';
import type { Not, NotEntityType } from '@/types/database';

type FilterKey = NotEntityType | 'all' | 'tasks';

const ENTITY_FILTERS: { key: FilterKey; icon: React.ReactNode; labelKey: string }[] = [
  { key: 'all', icon: <Globe size={14} color={colors.text} />, labelKey: 'common:notes.allNotes' },
  { key: 'tasks', icon: <CheckCircle2 size={14} color={colors.text} />, labelKey: 'common:notes.filterTasks' },
  { key: 'hesap', icon: <Wallet size={14} color={colors.text} />, labelKey: 'common:notes.filterAccounts' },
  { key: 'cari', icon: <Users size={14} color={colors.text} />, labelKey: 'common:notes.filterClients' },
  { key: 'personel', icon: <UserCircle size={14} color={colors.text} />, labelKey: 'common:notes.filterStaff' },
  { key: 'urun', icon: <Package size={14} color={colors.text} />, labelKey: 'common:notes.filterProducts' },
  { key: 'genel', icon: <StickyNote size={14} color={colors.text} />, labelKey: 'common:notes.filterGeneral' },
];

function getEntityIcon(type: NotEntityType) {
  switch (type) {
    case 'hesap': return <Wallet size={14} color={colors.primary} />;
    case 'cari': return <Users size={14} color={colors.info} />;
    case 'personel': return <UserCircle size={14} color={colors.success} />;
    case 'personel_izin': return <UserCircle size={14} color={colors.success} />;
    case 'urun': return <Package size={14} color={colors.warning} />;
    case 'genel': return <StickyNote size={14} color={colors.textMuted} />;
  }
}

const ENTITY_TYPE_LABEL_KEYS: Record<NotEntityType, string> = {
  hesap: 'common:notes.entityHesap',
  cari: 'common:notes.entityCari',
  personel: 'common:notes.entityPersonel',
  personel_izin: 'common:notes.entityPersonelIzin',
  urun: 'common:notes.entityUrun',
  genel: 'common:notes.entityGenel',
};

export default function NotlarPage() {
  const { t } = useTranslation(['common', 'navigation']);
  const { formatDateTime } = useDateFormat();
  const { showToast } = useToast();
  const { isletme, user, isOwner } = useAuthContext();
  const insets = useSafeAreaInsets();
  usePagePermission({ module: 'notlar' }); // notlar kapalı kullanıcıyı geri yollar (yok→true geriye-uyum)

  const [filter, setFilter] = useState<FilterKey>('all');
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<Not | null>(null);
  const [viewPhotoPath, setViewPhotoPath] = useState<string | null>(null);

  const entityType = (filter === 'all' || filter === 'tasks') ? undefined : filter;
  const { data: notlar, isLoading, refetch } = useNotlar(entityType);
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  const createNot = useCreateNot();
  const updateNot = useUpdateNot();
  const deleteNot = useDeleteNot();
  const {
    pendingDeleteIds,
    requestDelete,
    undoDelete,
    dismissDelete,
    snackbar: undoSnackbar,
  } = useUndoDelete<Not>({
    onCommitDelete: async (id: string) => {
      const note = notlar?.find(n => n.id === id);
      await deleteNot.mutateAsync({ id, photo_path: note?.photo_path });
    },
    onError: () => {
      Alert.alert(t('common:status.error'), t('common:errors.genericError'));
    },
  });
  const toggleCompletion = useToggleNotCompletion();
  const uploadNotePhoto = useUploadNotePhoto();
  const invalidateNotlar = useInvalidateNotlar();

  // Entity data for resolving names
  const { data: hesaplar } = useHesaplar(true, true);
  const { data: cariler } = useCariler(undefined, true, true);
  const { data: personeller } = usePersonelList(true, true);
  const { data: urunler } = useUrunler(true);
  const { data: isletmeUsers } = useIsletmeUsers();

  // Build entity_id → name maps
  const entityNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    hesaplar?.forEach(h => { map[h.id] = h.name; });
    cariler?.forEach(c => { map[c.id] = c.name; });
    personeller?.forEach(p => { map[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' '); });
    urunler?.forEach(u => { map[u.id] = u.ad; });
    return map;
  }, [hesaplar, cariler, personeller, urunler]);

  const userNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    isletmeUsers?.forEach(u => {
      map[u.user_id] = u.profile?.display_name ?? u.profile?.email ?? u.user_id;
    });
    return map;
  }, [isletmeUsers]);

  const cariNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    cariler?.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [cariler]);

  const personelNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    personeller?.forEach(p => {
      map[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ');
    });
    return map;
  }, [personeller]);

  const filteredNotes = useMemo(() => {
    if (!notlar) return [];
    let result = notlar.filter(n => !pendingDeleteIds.has(n.id));
    if (filter === 'tasks') {
      result = result.filter(n => n.is_completed);
      if (taskFilter === 'pending') {
        result = result.filter(n => !n.completed_at);
      } else if (taskFilter === 'done') {
        result = result.filter(n => !!n.completed_at);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n => n.content.toLowerCase().includes(q));
    }
    return result;
  }, [notlar, searchQuery, filter, taskFilter, pendingDeleteIds]);

  const handleCreate = async (data: NoteFormData) => {
    try {
      const result = await createNot.mutateAsync({
        entity_type: 'genel',
        content: data.content,
        is_completed: data.is_completed,
        reminder_date: data.reminder_date,
        assigned_to_user: data.assigned_to_user,
        assigned_to_cari: data.assigned_to_cari,
        assigned_to_personel: data.assigned_to_personel,
      });

      if (data.photo_uri && isletme) {
        try {
          const photoPath = await uploadNotePhoto.mutateAsync({
            uri: data.photo_uri,
            isletmeId: isletme.id,
            noteId: result.id,
          });
          const { supabase } = await import('@/lib/supabase');
          await supabase.from('notlar').update({ photo_path: photoPath }).eq('id', result.id);
          invalidateNotlar();
        } catch { /* photo upload failed but note was created */ }
      }

      if (data.reminder_date) {
        await scheduleNoteReminder(
          result.id,
          t('common:notes.reminderNotification'),
          t('common:notes.reminderBody', { content: data.content.substring(0, 50) }),
          new Date(data.reminder_date),
          { type: 'note_reminder', note_id: result.id, entity_type: 'genel' },
        );
      }

      setModalVisible(false);
      showToast(t('common:notes.createSuccess'), 'success');
    } catch {
      Alert.alert(t('common:status.error'), t('common:errors.genericError'));
    }
  };

  const handleUpdate = async (data: NoteFormData) => {
    if (!editingNote) return;
    try {
      await updateNot.mutateAsync({
        id: editingNote.id,
        content: data.content,
        is_completed: data.is_completed,
        reminder_date: data.reminder_date,
        assigned_to_user: data.assigned_to_user,
        assigned_to_cari: data.assigned_to_cari,
        assigned_to_personel: data.assigned_to_personel,
      });

      if (data.photo_uri && data.photo_uri !== editingNote.photo_path && isletme) {
        try {
          if (editingNote.photo_path) {
            const { supabase: sb } = await import('@/lib/supabase');
            await sb.storage.from('islem-photos').remove([editingNote.photo_path]);
          }
          const photoPath = await uploadNotePhoto.mutateAsync({
            uri: data.photo_uri,
            isletmeId: isletme.id,
            noteId: editingNote.id,
          });
          const { supabase } = await import('@/lib/supabase');
          await supabase.from('notlar').update({ photo_path: photoPath }).eq('id', editingNote.id);
          invalidateNotlar();
        } catch { /* ignore */ }
      } else if (!data.photo_uri && editingNote.photo_path) {
        const { supabase } = await import('@/lib/supabase');
        await supabase.storage.from('islem-photos').remove([editingNote.photo_path]);
        await supabase.from('notlar').update({ photo_path: null }).eq('id', editingNote.id);
        invalidateNotlar();
      }

      if (data.reminder_date) {
        await scheduleNoteReminder(
          editingNote.id,
          t('common:notes.reminderNotification'),
          t('common:notes.reminderBody', { content: data.content.substring(0, 50) }),
          new Date(data.reminder_date),
          { type: 'note_reminder', note_id: editingNote.id, entity_type: editingNote.entity_type, entity_id: editingNote.entity_id ?? undefined },
        );
      } else {
        await cancelNoteReminder(editingNote.id);
      }

      setEditingNote(null);
      showToast(t('common:notes.updateSuccess'), 'success');
    } catch {
      Alert.alert(t('common:status.error'), t('common:errors.genericError'));
    }
  };

  const handleDelete = useCallback((note: Not) => {
    const description = note.content.length > 30
      ? note.content.substring(0, 30) + '...'
      : note.content;
    requestDelete(note.id, note, description);
  }, [requestDelete]);

  const markAsTask = useMarkAsTask();

  const handleToggleComplete = useCallback((noteId: string, done: boolean) => {
    toggleCompletion.mutate({ id: noteId, done });
  }, [toggleCompletion]);

  const handleMarkAsTask = useCallback((noteId: string) => {
    markAsTask.mutate(noteId);
  }, [markAsTask]);

  const renderNote = useCallback(({ item }: { item: Not }) => {
    const entityLabel = t(ENTITY_TYPE_LABEL_KEYS[item.entity_type]);
    const entityName = item.entity_id ? entityNameMap[item.entity_id] : null;
    // RLS yalnızca kendi notuna düzenleme/silme izni verir (owner hepsine). UI'da da hizala.
    const canModify = isOwner || item.created_by === user?.id;

    return (
      <SwipeableRow
        onDelete={canModify ? () => handleDelete(item) : undefined}
        deleteLabel={t('common:buttons.delete')}
      >
        <View style={styles.noteWrapper}>
          {/* Entity label */}
          <View style={styles.entityRow}>
            {getEntityIcon(item.entity_type)}
            <Text variant="caption" style={styles.entityText} numberOfLines={1}>
              {entityName ? `${entityLabel} · ${entityName}` : entityLabel}
            </Text>
            <Text variant="caption" color="muted" style={styles.dateLabel}>
              {formatDateTime(item.created_at)}
            </Text>
          </View>

          {/* Note card */}
          <NoteRow
            note={item}
            onEdit={canModify ? () => setEditingNote(item) : undefined}
            onToggleComplete={handleToggleComplete}
            onMarkAsTask={handleMarkAsTask}
            onPhotoPress={setViewPhotoPath}
            assignedUserName={item.assigned_to_user ? userNameMap[item.assigned_to_user] : null}
            assignedCariName={item.assigned_to_cari ? cariNameMap[item.assigned_to_cari] : null}
            assignedPersonelName={item.assigned_to_personel ? personelNameMap[item.assigned_to_personel] : null}
          />
        </View>
      </SwipeableRow>
    );
  }, [formatDateTime, handleDelete, handleToggleComplete, handleMarkAsTask, t, entityNameMap, userNameMap, cariNameMap, personelNameMap, isOwner, user?.id]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SwipeableProvider>
        {/* Filters */}
        <View style={styles.filtersContainer}>
          <FlatList
            horizontal
            data={ENTITY_FILTERS}
            keyExtractor={(item) => item.key}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersList}
            renderItem={({ item: f }) => (
              <TouchableOpacity
                style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                onPress={() => setFilter(f.key)}
              >
                {f.icon}
                <Text
                  variant="caption"
                  style={[styles.filterText, filter === f.key && styles.filterTextActive]}
                >
                  {t(f.labelKey)}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Task sub-filters */}
        {filter === 'tasks' && (
          <View style={styles.taskFiltersRow}>
            {(['all', 'pending', 'done'] as const).map((key) => (
              <TouchableOpacity
                key={key}
                style={[styles.taskFilterChip, taskFilter === key && styles.taskFilterChipActive]}
                onPress={() => setTaskFilter(key)}
              >
                <Text
                  variant="caption"
                  style={[styles.taskFilterText, taskFilter === key && styles.taskFilterTextActive]}
                >
                  {key === 'all' ? t('common:notes.allNotes')
                    : key === 'pending' ? t('common:notes.taskPending')
                    : t('common:notes.taskDone')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Search */}
        <View style={styles.searchContainer}>
          <SearchInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('common:notes.searchPlaceholder')}
          />
        </View>

        {/* Notes List */}
        <FlatList
          data={filteredNotes}
          keyExtractor={(item) => item.id}
          renderItem={renderNote}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            !isLoading ? (
              <EmptyState
                icon={filter === 'tasks'
                  ? <CheckCircle2 size={48} color={colors.textMuted} />
                  : <StickyNote size={48} color={colors.textMuted} />}
                title={filter === 'tasks' ? t('common:notes.noTasks') : t('common:notes.noNotes')}
              />
            ) : null
          }
        />

        {/* FAB */}
        <TouchableOpacity
          style={[styles.fab, { bottom: spacing.lg + insets.bottom }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
        >
          <Plus size={24} color={colors.surface} />
        </TouchableOpacity>

        {/* Create Modal */}
        <NoteInputModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onSave={handleCreate}
          loading={createNot.isPending || uploadNotePhoto.isPending}
          entityType="genel"
          entityId=""
        />

        {/* Edit Modal */}
        <NoteInputModal
          visible={!!editingNote}
          onClose={() => setEditingNote(null)}
          onSave={handleUpdate}
          initialData={editingNote ? {
            content: editingNote.content,
            is_completed: editingNote.is_completed,
            reminder_date: editingNote.reminder_date,
            photo_uri: editingNote.photo_path,
            assigned_to_user: editingNote.assigned_to_user,
            assigned_to_cari: editingNote.assigned_to_cari,
            assigned_to_personel: editingNote.assigned_to_personel,
          } : undefined}
          isEditing
          loading={updateNot.isPending}
          entityType={editingNote?.entity_type ?? 'genel'}
          entityId={editingNote?.entity_id ?? ''}
          existingPhotoPath={editingNote?.photo_path}
        />

        {/* Photo Viewer */}
        <PhotoViewerModal
          visible={!!viewPhotoPath}
          photoPath={viewPhotoPath}
          onClose={() => setViewPhotoPath(null)}
        />

        {/* Undo Delete Snackbar */}
        <UndoSnackbar
          visible={undoSnackbar.visible}
          message={undoSnackbar.message}
          onUndo={undoDelete}
          onDismiss={dismissDelete}
        />
      </SwipeableProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filtersContainer: {
    paddingVertical: spacing.sm,
  },
  filtersList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.text,
  },
  filterTextActive: {
    color: colors.surface,
  },
  taskFiltersRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  taskFilterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  taskFilterChipActive: {
    backgroundColor: colors.orange,
    borderColor: colors.orange,
  },
  taskFilterText: {
    color: colors.text,
    fontSize: 12,
  },
  taskFilterTextActive: {
    color: colors.surface,
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  noteWrapper: {
    gap: 4,
  },
  entityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    marginBottom: 2,
  },
  entityText: {
    flex: 1,
    fontWeight: '600',
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  dateLabel: {
    fontSize: 10,
  },
  separator: {
    height: spacing.md,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.warning,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
  },
});
