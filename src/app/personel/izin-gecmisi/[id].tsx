import { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarDays, Copy, Plus, Share2 } from 'lucide-react-native';
import { BackButton } from '@/components/ui/BackButton';

import { Text, EmptyState } from '@/components/ui';
import { SwipeableRow, SwipeableProvider } from '@/components/ui/SwipeableRow';
import { UndoSnackbar } from '@/components/ui/UndoSnackbar';
import { DateSectionHeader } from '@/components/ui/TransactionRow';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { AddNoteButton } from '@/components/notes/AddNoteButton';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '@/constants/spacing';
import { usePersonel } from '@/hooks/usePersonel';
import { useAllLeaveByPersonel, useDeleteIslem } from '@/hooks/useIslemler';
import { useNotlarByEntity, useDeleteNot, useUpdateNot, useToggleNotCompletion, useMarkAsTask, useInvalidateNotlar } from '@/hooks/useNotlar';
import { useUploadNotePhoto } from '@/hooks/useNotePhoto';
import { NoteRow } from '@/components/notes/NoteRow';
import { NoteInputModal } from '@/components/notes/NoteInputModal';
import type { NoteFormData } from '@/components/notes/NoteInputModal';
import { useAuthContext } from '@/contexts/AuthContext';
import { scheduleNoteReminder, cancelNoteReminder } from '@/lib/notifications';
import { isLeaveType } from '@/constants/islemTypes';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { preprocessTransactionsByDate, mergeNotesIntoGroupedData, TransactionListItem } from '@/lib/transactionGrouping';
import { getTransactionColor, getTransactionPrefix, showAccentBar } from '@/lib/transactionColors';
import { toErrorMessage } from '@/lib/errors';
import { exportLeaveHistory } from '@/lib/pageExports';
import type { IslemWithRelations, Not } from '@/types/database';

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

function getLeaveLabel(type: string): string {
  switch (type) {
    case 'personel_izin_hakki':
      return 'staff:transactionLabels.izinHakki';
    case 'personel_izin_kullanimi':
      return 'staff:transactionLabels.izinKullanimi';
    default:
      return type;
  }
}

export default function LeaveHistoryPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['staff', 'common', 'errors']);
  const { formatDateMedium, formatDateSmart } = useDateFormat();
  const insets = useSafeAreaInsets();

  const { isletme } = useAuthContext();
  const { data: personel, refetch: refetchPersonel } = usePersonel(id);
  // İzin-only, pagination'sız sorgu: TÜM izin hareketleri (geçmiş yıl dahil) eksiksiz gelir,
  // sadece izin satırları çekilir (düşük egress). Böylece liste tam + kalan gün ana sayfayla
  // (usePersonelLeaveQuotas, aynı toplam) birebir aynı olur.
  // (Önceki useIslemlerByPersonel sayfalıydı; en yeni 50 işlemi yüklüyordu → geçmiş hak ediş
  //  listede yok + 22 gün eksik gösteriyordu.)
  const { data: islemler, refetch: refetchIslemler } = useAllLeaveByPersonel(id!);
  const { data: entityNotes, refetch: refetchNotes } = useNotlarByEntity('personel_izin', id!);

  const { refreshing, onRefresh } = usePullToRefresh(refetchPersonel, refetchIslemler, refetchNotes);
  const deleteIslem = useDeleteIslem();
  const deleteNot = useDeleteNot();
  const updateNot = useUpdateNot();
  const toggleNotCompletion = useToggleNotCompletion();
  const markAsTask = useMarkAsTask();
  const uploadNotePhoto = useUploadNotePhoto();
  const invalidateNotlar = useInvalidateNotlar();

  // New leave transaction state
  const [showNewLeaveBar, setShowNewLeaveBar] = useState(false);

  // Edit & Copy state
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [showCopyBar, setShowCopyBar] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  // Undo delete
  const {
    requestDelete,
    undoDelete,
    dismissDelete,
    snackbar: undoSnackbar,
  } = useUndoDelete<IslemWithRelations>({
    onCommitDelete: async (islemId: string) => {
      await deleteIslem.mutateAsync(islemId);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? toErrorMessage(error) : t('errors:transaction.deleteFailed');
      Alert.alert(t('common:status.error'), message);
    },
  });

  // Filter to leave transactions only
  const leaveTransactions = useMemo(() => {
    if (!islemler) return [];
    return islemler.filter(i => isLeaveType(i.type));
  }, [islemler]);

  // Calculate quota
  const quota = useMemo(() => {
    return leaveTransactions.reduce(
      (acc, islem) => {
        const amount = toNumber(islem.amount);
        if (islem.type === 'personel_izin_hakki') {
          acc.hakEdilen += amount;
        } else if (islem.type === 'personel_izin_kullanimi') {
          acc.kullanilan += amount;
        }
        return acc;
      },
      { hakEdilen: 0, kullanilan: 0 }
    );
  }, [leaveTransactions]);

  const kalanGun = quota.hakEdilen - quota.kullanilan;

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!personel || !isletme || leaveTransactions.length === 0) return;
    setIsExporting(true);
    try {
      await exportLeaveHistory({
        personelName: `${personel.first_name} ${personel.last_name || ''}`.trim(),
        isletmeName: isletme.name,
        transactions: leaveTransactions.map(tx => ({
          date: tx.date,
          type: tx.type,
          amount: toNumber(tx.amount),
          description: tx.description,
          date_end: (tx as { date_end?: string | null }).date_end,
        })),
        quota,
        t: {
          title: t('staff:leave.leaveHistory'),
          business: t('common:export.excel.business'),
          staff: t('common:export.excel.staff'),
          createdAt: t('common:export.excel.createdAt'),
          date: t('common:export.excel.date'),
          dateRange: t('staff:leave.startDate') + ' - ' + t('staff:leave.endDate'),
          type: t('common:export.excel.transactionType'),
          days: t('staff:leave.days'),
          description: t('common:export.excel.description'),
          entitled: t('staff:leave.entitled'),
          used: t('staff:leave.used'),
          remaining: t('staff:leave.remaining'),
          summary: t('staff:leave.leaveStatus'),
          sheetName: t('staff:leave.leaveHistory'),
          fileName: t('staff:leave.leaveHistory'),
          dialogTitle: t('staff:leave.leaveHistory'),
          typeLabels: {
            personel_izin_hakki: t('staff:transactionLabels.izinHakki'),
            personel_izin_kullanimi: t('staff:transactionLabels.izinKullanimi'),
          },
        },
      });
    } catch {
      Alert.alert(t('common:status.error'), t('common:errors.genericError'));
    } finally {
      setIsExporting(false);
    }
  }, [personel, isletme, leaveTransactions, quota, t]);

  // Group by date and merge notes
  const groupedData = useMemo(() => {
    const txData = preprocessTransactionsByDate(
      leaveTransactions,
      t('common:date.today'),
      t('common:date.yesterday'),
      formatDateSmart,
    );
    return mergeNotesIntoGroupedData(
      txData,
      entityNotes ?? [],
      t('common:date.today'),
      t('common:date.yesterday'),
      formatDateSmart,
    );
  }, [leaveTransactions, t, formatDateSmart, entityNotes]);

  const handleDeleteIslem = useCallback((islemId: string) => {
    const islem = leaveTransactions.find(i => i.id === islemId);
    if (islem) {
      const desc = islem.description || t(getLeaveLabel(islem.type));
      requestDelete(islemId, islem, desc);
    }
  }, [leaveTransactions, requestDelete, t]);

  const handleEditIslem = useCallback((islemId: string) => {
    setEditTransactionId(islemId);
    setShowEditBar(true);
  }, []);

  const handleCopyIslem = useCallback((islemId: string) => {
    setCopySourceId(islemId);
    setShowCopyBar(true);
  }, []);

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
          onPress: () => deleteNot.mutate({ id: noteId, photo_path: note?.photo_path }),
        },
      ],
    );
  }, [deleteNot, entityNotes, t]);

  const handleToggleNoteCompletion = useCallback((noteId: string, done: boolean) => {
    toggleNotCompletion.mutate({ id: noteId, done });
  }, [toggleNotCompletion]);

  const handleMarkAsTask = useCallback((noteId: string) => {
    markAsTask.mutate(noteId);
  }, [markAsTask]);

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

      if (data.photo_uri && data.photo_uri !== editingNote.photo_path && isletme) {
        try {
          if (editingNote.photo_path) {
            const { supabase } = await import('@/lib/supabase');
            await supabase.storage.from('islem-photos').remove([editingNote.photo_path]);
          }
          const photoPath = await uploadNotePhoto.mutateAsync({
            uri: data.photo_uri,
            isletmeId: isletme.id,
            noteId: editingNoteId,
          });
          const { supabase } = await import('@/lib/supabase');
          await supabase.from('notlar').update({ photo_path: photoPath }).eq('id', editingNoteId);
          invalidateNotlar();
        } catch { /* ignore */ }
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
          { type: 'note_reminder', note_id: editingNoteId, entity_type: 'personel_izin', entity_id: id },
        );
      } else {
        await cancelNoteReminder(editingNoteId);
      }

      setEditingNoteId(null);
    } catch {
      Alert.alert(t('common:status.error'), t('common:errors.genericError'));
    }
  }, [editingNoteId, editingNote, updateNot, uploadNotePhoto, isletme, id, t, invalidateNotlar]);

  const deleteLabel = t('common:buttons.delete');
  const copyLabel = t('common:buttons.copy');

  const renderItem = useCallback(
    ({ item }: { item: TransactionListItem }) => {
      if (item.type === 'header') {
        return <DateSectionHeader title={item.title} />;
      }
      if (item.type === 'milestone') {
        return null;
      }
      if (item.type === 'note') {
        const noteData = item.data as Not;
        return (
          <SwipeableRow onDelete={() => handleNoteDelete(item.data.id)} deleteLabel={deleteLabel}>
            <NoteRow
              note={noteData}
              onEdit={() => setEditingNoteId(item.data.id)}
              onToggleComplete={handleToggleNoteCompletion}
              onMarkAsTask={handleMarkAsTask}
            />
          </SwipeableRow>
        );
      }

      const islem = item.data;
      const amount = toNumber(islem.amount);
      const typeLabel = t(getLeaveLabel(islem.type));
      const txColor = getTransactionColor(islem.type);
      const prefix = getTransactionPrefix(islem.type);
      const hasBar = showAccentBar(islem.type);

      // Build date range text for leave usage with date_end
      const dateEnd = (islem as { date_end?: string | null }).date_end;
      let dateRangeText: string | null = null;
      if (dateEnd) {
        const startDate = new Date(islem.date);
        const endDate = new Date(dateEnd);
        dateRangeText = `${formatDateMedium(startDate)} - ${formatDateMedium(endDate)}`;
      }

      return (
        <SwipeableRow
          onDelete={() => handleDeleteIslem(islem.id)}
          onCopy={() => handleCopyIslem(islem.id)}
          deleteLabel={deleteLabel}
          copyLabel={copyLabel}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleEditIslem(islem.id)}
          >
            <View style={styles.txContainer}>
              {/* Accent Bar */}
              {hasBar ? (
                <View style={[styles.accentBar, { backgroundColor: txColor }]} />
              ) : (
                <View style={styles.accentBarSpacer} />
              )}

              {/* Content */}
              <View style={styles.txContent}>
                {/* Line 1: Type Label + Date */}
                <View style={styles.txLine1}>
                  <Text style={[styles.txTypeText, { color: txColor }]} numberOfLines={1}>
                    {typeLabel}
                  </Text>
                  <Text style={styles.txDateText}>{formatDateSmart(islem.date)}</Text>
                </View>

                {/* Date range for leave usage */}
                {dateRangeText && (
                  <Text style={styles.txEntityText} numberOfLines={1}>
                    {dateRangeText}
                  </Text>
                )}

                {/* Description */}
                {islem.description ? (
                  <Text style={styles.txSecondaryText} numberOfLines={1}>
                    {islem.description}
                  </Text>
                ) : null}
              </View>

              {/* Amount — days instead of currency */}
              <View style={styles.txAmountContainer}>
                <Text style={[styles.txAmountText, { color: txColor }]}>
                  {prefix}{amount} {t('staff:leave.days')}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </SwipeableRow>
      );
    },
    [t, formatDateSmart, formatDateMedium, handleDeleteIslem, handleCopyIslem, handleEditIslem, handleNoteDelete, handleToggleNoteCompletion, handleMarkAsTask, deleteLabel, copyLabel]
  );

  const keyExtractor = useCallback((item: TransactionListItem) => item.key, []);

  const ListHeader = useMemo(
    () => (
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryLabel}>{t('staff:leave.entitled')}</Text>
            <Text style={styles.summaryValue}>
              {quota.hakEdilen} {t('staff:leave.days')}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryStat}>
            <Text style={styles.summaryLabel}>{t('staff:leave.used')}</Text>
            <Text style={[styles.summaryValue, { color: colors.textMuted }]}>
              {quota.kullanilan} {t('staff:leave.days')}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryStat}>
            <Text style={styles.summaryLabel}>{t('staff:leave.remaining')}</Text>
            <Text
              style={[
                styles.summaryValue,
                { color: kalanGun >= 0 ? colors.success : colors.error, fontWeight: '700' },
              ]}
            >
              {kalanGun} {t('staff:leave.days')}
            </Text>
          </View>
        </View>
      </View>
    ),
    [quota, kalanGun, t]
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton icon={ArrowLeft} style={styles.backButton} />
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{t('staff:leave.leaveHistory')}</Text>
          {personel && (
            <Text style={styles.headerSubtitle}>
              {personel.first_name} {personel.last_name || ''}
            </Text>
          )}
        </View>
        {leaveTransactions.length > 0 && (
          <TouchableOpacity style={styles.backButton} onPress={handleExport} disabled={isExporting}>
            <Share2 size={20} color={isExporting ? colors.textMuted : colors.text} />
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <SwipeableProvider>
        <FlatList
          data={groupedData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={leaveTransactions.length > 0 ? ListHeader : null}
          ListEmptyComponent={
            <EmptyState
              icon={<CalendarDays size={48} color={colors.textMuted} />}
              title={t('staff:leave.noLeaveHistory')}
            />
          }
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        />
      </SwipeableProvider>

      {/* Edit QuickTransactionBar */}
      <QuickTransactionBar
        visible={showEditBar}
        onDismiss={() => {
          setShowEditBar(false);
          setEditTransactionId(null);
        }}
        mode="edit"
        transactionId={editTransactionId ?? undefined}
        isScheduledTransaction={false}
        defaultPersonelId={id!}
        tabModeOverride="personel_izin"
        onSuccess={() => {
          setShowEditBar(false);
          setEditTransactionId(null);
        }}
      />

      {/* Copy QuickTransactionBar */}
      <QuickTransactionBar
        visible={showCopyBar}
        onDismiss={() => {
          setShowCopyBar(false);
          setCopySourceId(null);
        }}
        mode="create"
        copySourceId={copySourceId ?? undefined}
        defaultPersonelId={id!}
        tabModeOverride="personel_izin"
        onSuccess={() => {
          setShowCopyBar(false);
          setCopySourceId(null);
        }}
      />

      {/* New Leave QuickTransactionBar */}
      <QuickTransactionBar
        visible={showNewLeaveBar}
        onDismiss={() => setShowNewLeaveBar(false)}
        mode="create"
        defaultType="personel_izin_hakki_tab"
        defaultPersonelId={id!}
        tabModeOverride="personel_izin"
        onSuccess={() => setShowNewLeaveBar(false)}
      />

      {/* FABs */}
      <View style={[styles.fabContainer, { bottom: insets.bottom + 16 }]}>
        <AddNoteButton entityType="personel_izin" entityId={id!} />
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.8}
          onPress={() => setShowNewLeaveBar(true)}
        >
          <Plus size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <UndoSnackbar
        visible={undoSnackbar.visible}
        message={undoSnackbar.message}
        onUndo={undoDelete}
        onDismiss={dismissDelete}
        undoLabel={t('common:buttons.undo')}
      />

      <NoteInputModal
        visible={!!editingNote}
        onClose={() => setEditingNoteId(null)}
        onSave={handleNoteUpdate}
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
        entityType="personel_izin"
        entityId={id!}
        existingPhotoPath={editingNote?.photo_path}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },
  // Summary card
  summaryCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.borderLight,
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  // Transaction row
  txContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 1.5,
  },
  accentBarSpacer: {
    width: 3,
  },
  txContent: {
    flex: 1,
    gap: 3,
  },
  txLine1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  txTypeText: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    flex: 1,
  },
  txDateText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  txEntityText: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  txSecondaryText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    color: colors.textMuted,
  },
  txAmountContainer: {
    alignItems: 'flex-end',
  },
  txAmountText: {
    fontSize: 20,
    fontWeight: fontWeight.bold,
  },
  fabContainer: {
    position: 'absolute',
    right: spacing.lg,
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
