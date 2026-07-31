import { useState, useMemo, useCallback, useEffect } from 'react';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Plus, Share as ShareIcon } from 'lucide-react-native';
import { BackButton } from '@/components/ui/BackButton';
import { GlassFab } from '@/components/ui/GlassFab';

import { Text, EmptyState, Screen } from '@/components/ui';
import { SwipeableRow, SwipeableProvider } from '@/components/ui/SwipeableRow';
import { UndoSnackbar } from '@/components/ui/UndoSnackbar';
import { DateSectionHeader } from '@/components/ui/TransactionRow';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { AddNoteButton } from '@/components/notes/AddNoteButton';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, fontWeight, HIT_SLOP } from '@/constants/spacing';
import { usePersonel } from '@/hooks/usePersonel';
import {
  useAllLeaveByPersonel,
  useDeleteIslem,
  type PersonelTransactionRow,
} from '@/hooks/useIslemler';
import { isPersonelIslemListRow } from '@/lib/personelTransactionProjection';
import { useNotlarByEntity, useDeleteNot, useUpdateNot, useToggleNotCompletion, useMarkAsTask } from '@/hooks/useNotlar';
import {
  removeNotePhotoBestEffort,
  useUploadNotePhoto,
} from '@/hooks/useNotePhoto';
import { NoteListRow } from '@/components/notes/NoteListRow';
import { NoteInputModal } from '@/components/notes/NoteInputModal';
import type { NoteFormData } from '@/components/notes/NoteInputModal';
import { useAuthContext } from '@/contexts/AuthContext';
import { scheduleNoteReminder, cancelNoteReminder } from '@/lib/notifications';
import { isLeaveType } from '@/constants/islemTypes';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { usePermissions } from '@/hooks/usePermissions';
import { preprocessTransactionsByDate, mergeNotesIntoGroupedData, TransactionListItem } from '@/lib/transactionGrouping';
import { getTransactionColor, getTransactionPrefix, showAccentBar } from '@/lib/transactionColors';
import {
  classifyMutationError,
  getTransactionActionDeniedMessageKey,
  getTransactionMutationMessageKey,
  isPermissionDeniedError,
  toErrorMessage,
} from '@/lib/errors';
import { parseDateFromDB } from '@/lib/date';
import { exportLeaveHistory } from '@/lib/pageExports';
import { canAccessTransactionSources } from '@/lib/transactionSourceModules';
import type { Not } from '@/types/database';

const LEAVE_TRANSACTION_DELETE_PERMISSION_REVOKED = Object.assign(
  new Error('Leave transaction delete permission revoked'),
  { code: '42501' as const },
);

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
  const contentPaddingBottom = useContentBottomPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['staff', 'common', 'errors']);
  const { formatDateMedium, formatDateSmart } = useDateFormat();
  const insets = useSafeAreaInsets();

  const { isletme, user } = useAuthContext();
  const {
    canUpdate,
    canDelete,
    canAccessModule,
    canCreateTransactions,
    isOwner,
  } = usePermissions();
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

  // New leave transaction state
  const [showNewLeaveBar, setShowNewLeaveBar] = useState(false);

  // Edit & Copy state
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [showCopyBar, setShowCopyBar] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  // Filter to leave transactions only
  const leaveTransactions = useMemo(() => {
    if (!islemler) return [];
    return islemler.filter(i => isLeaveType(i.type));
  }, [islemler]);

  const isActiveTenantTransaction = useCallback(
    (transaction: PersonelTransactionRow): boolean => {
      if (!isletme?.id || !isLeaveType(transaction.type)) return false;

      // Shared projection tenant/personel kimliklerini istemciye taşımaz; satırlar
      // aktif işletme + rota personeliyle çağrılan RPC'den gelir. Owner satırında
      // tenant eşitliğini doğrudan yeniden doğrularız.
      return isPersonelIslemListRow(transaction)
        ? transaction.projection_source === 'personel-v1'
        : transaction.isletme_id === isletme.id;
    },
    [isletme?.id],
  );
  const canUpdateTransactionRecord = useCallback(
    (transaction: PersonelTransactionRow): boolean =>
      isActiveTenantTransaction(transaction)
      && canAccessTransactionSources(
        [transaction.type],
        canAccessModule,
      )
      && canUpdate('islemler', transaction.created_by ?? null),
    [canAccessModule, canUpdate, isActiveTenantTransaction],
  );
  const canDeleteTransactionRecord = useCallback(
    (transaction: PersonelTransactionRow): boolean =>
      isActiveTenantTransaction(transaction)
      && canAccessTransactionSources(
        [transaction.type],
        canAccessModule,
      )
      && canDelete('islemler', transaction.created_by ?? null),
    [canAccessModule, canDelete, isActiveTenantTransaction],
  );
  const canUpdateTransaction = useCallback(
    (islemId: string): boolean => {
      const transaction = leaveTransactions.find((item) => item.id === islemId);
      return !!transaction && canUpdateTransactionRecord(transaction);
    },
    [canUpdateTransactionRecord, leaveTransactions],
  );

  const showTransactionUpdateDenied = useCallback((islemId: string) => {
    const transaction = leaveTransactions.find((item) => item.id === islemId);
    if (!transaction) {
      Alert.alert(
        t('common:status.error'),
        t('common:errors.transactionNotFound'),
      );
      return;
    }

    const createdBy = transaction.created_by ?? null;
    const hasSourceAccess = canAccessTransactionSources(
      [transaction.type],
      canAccessModule,
    );
    const canUpdateRecord = canUpdateTransactionRecord(transaction);
    const messageKey = getTransactionActionDeniedMessageKey('update', {
      createdBy,
      currentUserId: user?.id,
      canActOnOwnRecord:
        isActiveTenantTransaction(transaction)
        && hasSourceAccess
        && !!user?.id
        && canUpdate('islemler', user.id),
      canActOnRecord: canUpdateRecord,
    });
    Alert.alert(t('common:status.error'), t(messageKey));
  }, [
    canAccessModule,
    canUpdate,
    canUpdateTransactionRecord,
    isActiveTenantTransaction,
    leaveTransactions,
    t,
    user?.id,
  ]);

  const canRenderEditTransactionBar =
    !!editTransactionId && canUpdateTransaction(editTransactionId);

  useEffect(() => {
    if (!showEditBar || canRenderEditTransactionBar) return;
    setShowEditBar(false);
    setEditTransactionId(null);
  }, [canRenderEditTransactionBar, showEditBar]);

  useEffect(() => {
    if (isOwner) return;
    setShowCopyBar(false);
    setCopySourceId(null);
  }, [isOwner]);

  // Undo delete: beş saniyelik pencere boyunca rol veya kaynak erişimi
  // daralabileceği için commit anında en güncel kayıt yetkisini yeniden doğrula.
  const {
    requestDelete,
    undoDelete,
    dismissDelete,
    snackbar: undoSnackbar,
  } = useUndoDelete<PersonelTransactionRow>({
    onCommitDelete: async (islemId: string) => {
      const transaction = leaveTransactions.find((item) => item.id === islemId);
      if (!transaction || !canDeleteTransactionRecord(transaction)) {
        throw LEAVE_TRANSACTION_DELETE_PERMISSION_REVOKED;
      }
      // useDeleteIslem shared kullanıcıda atomik V2 mutation yolunu seçer.
      await deleteIslem.mutateAsync(islemId);
    },
    onError: (error: unknown) => {
      const messageKey = getTransactionMutationMessageKey(error, 'delete');
      const message = messageKey
        ? t(messageKey)
        : toErrorMessage(error, t('errors:transaction.deleteFailed'));
      Alert.alert(t('common:status.error'), message);
    },
  });

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
    if (!islem) return;
    if (!canDeleteTransactionRecord(islem)) {
      const messageKey = getTransactionMutationMessageKey(
        LEAVE_TRANSACTION_DELETE_PERMISSION_REVOKED,
        'delete',
      );
      Alert.alert(
        t('common:status.error'),
        messageKey
          ? t(messageKey)
          : t('errors:transaction.deleteFailed'),
      );
      return;
    }
    const desc = islem.description || t(getLeaveLabel(islem.type));
    requestDelete(islemId, islem, desc);
  }, [
    canDeleteTransactionRecord,
    leaveTransactions,
    requestDelete,
    t,
  ]);

  const handleEditIslem = useCallback((islemId: string) => {
    const transaction = leaveTransactions.find((item) => item.id === islemId);
    if (!transaction || !canUpdateTransactionRecord(transaction)) {
      showTransactionUpdateDenied(islemId);
      return;
    }
    setEditTransactionId(islemId);
    setShowEditBar(true);
  }, [
    canUpdateTransactionRecord,
    leaveTransactions,
    showTransactionUpdateDenied,
  ]);

  const handleCopyIslem = useCallback((islemId: string) => {
    if (!isOwner) return;
    setCopySourceId(islemId);
    setShowCopyBar(true);
  }, [isOwner]);

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
                contextModule: 'personel',
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
      ],
    );
  }, [deleteNot, entityNotes, t]);

  const handleToggleNoteCompletion = useCallback(async (
    noteId: string,
    done: boolean,
  ) => {
    try {
      await toggleNotCompletion.mutateAsync({
        id: noteId,
        done,
        contextModule: 'personel',
      });
    } catch (error) {
      Alert.alert(
        t('common:status.error'),
        isPermissionDeniedError(error)
          ? t('common:errors.permissionDenied')
          : t('common:errors.genericError'),
      );
    }
  }, [t, toggleNotCompletion]);

  const handleMarkAsTask = useCallback(async (noteId: string) => {
    try {
      await markAsTask.mutateAsync({
        id: noteId,
        contextModule: 'personel',
      });
    } catch (error) {
      Alert.alert(
        t('common:status.error'),
        isPermissionDeniedError(error)
          ? t('common:errors.permissionDenied')
          : t('common:errors.genericError'),
      );
    }
  }, [markAsTask, t]);

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
      if (isPhotoReplacement && !isletme) {
        throw new Error('No isletme');
      }
      if (isPhotoReplacement && isletme && data.photo_uri) {
        failedDuringPhotoUpload = true;
        uploadedPhotoPath = await uploadNotePhoto.mutateAsync({
          uri: data.photo_uri,
          isletmeId: isletme.id,
          noteId: editingNoteId,
          contextModule: 'personel',
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
        contextModule: 'personel',
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
            { type: 'note_reminder', note_id: editingNoteId, entity_type: 'personel_izin', entity_id: id },
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
  }, [editingNoteId, editingNote, updateNot, uploadNotePhoto, isletme, id, t]);

  const deleteLabel = t('common:buttons.delete');
  const copyLabel = t('common:buttons.copy');

  const renderItem = useCallback(
    ({
      item,
    }: {
      item: TransactionListItem<PersonelTransactionRow>;
    }) => {
      if (item.type === 'header') {
        return <DateSectionHeader title={item.title} />;
      }
      if (item.type === 'milestone') {
        return null;
      }
      if (item.type === 'note') {
        const noteData = item.data as Not;
        return (
          <NoteListRow
            note={noteData}
            onEditId={setEditingNoteId}
            onDeleteId={handleNoteDelete}
            onToggleComplete={handleToggleNoteCompletion}
            onMarkAsTask={handleMarkAsTask}
            deleteLabel={deleteLabel}
            contextModule="personel"
            flush
          />
        );
      }

      const islem = item.data;
      const amount = toNumber(islem.amount);
      const typeLabel = t(getLeaveLabel(islem.type));
      const txColor = getTransactionColor(islem.type);
      const prefix = getTransactionPrefix(islem.type);
      const hasBar = showAccentBar(islem.type);
      const canDeleteTransaction = canDeleteTransactionRecord(islem);
      const canCopyTransaction = isOwner && canCreateTransactions;

      // Build date range text for leave usage with date_end
      const dateEnd = islem.date_end;
      let dateRangeText: string | null = null;
      if (dateEnd) {
        // 1970-guard: ham new Date() Hermes'te boşluklu/bozuk string'de Invalid olur
        const startDate = parseDateFromDB(islem.date);
        const endDate = parseDateFromDB(dateEnd);
        dateRangeText = `${formatDateMedium(startDate)} - ${formatDateMedium(endDate)}`;
      }

      return (
        <SwipeableRow
          onDelete={canDeleteTransaction ? () => handleDeleteIslem(islem.id) : undefined}
          onCopy={canCopyTransaction ? () => handleCopyIslem(islem.id) : undefined}
          enabled={canDeleteTransaction || canCopyTransaction}
          deleteLabel={deleteLabel}
          copyLabel={copyLabel}
          flush
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
    [t, formatDateSmart, formatDateMedium, handleDeleteIslem, handleCopyIslem, handleEditIslem, handleNoteDelete, handleToggleNoteCompletion, handleMarkAsTask, deleteLabel, copyLabel, isOwner, canDeleteTransactionRecord, canCreateTransactions]
  );

  const keyExtractor = useCallback(
    (item: TransactionListItem<PersonelTransactionRow>) => item.key,
    [],
  );

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
    <>
      {/* Başlık TEK yerden: rota zaten native header ile kayıtlı; sayfa içi header
          çizmek başlığı ve geri butonunu ikiye katlıyordu (kardeş detay sayfalarının
          deseni = Stack.Screen + headerLeft/headerRight).
          Başlık BAĞLAMLI: hangi personelin izinlerine bakıldığı başka hiçbir yerde
          yazmıyor — kardeş detay sayfası (personel/[id]) da adı başlığa koyuyor.
          Personel henüz yüklenmemişken statik 'İzin Geçmişi'ne düşer. */}
      <Stack.Screen
        options={{
          headerTitle: personel
            ? `${personel.first_name} ${personel.last_name || ''}`.trim()
            : t('staff:leave.leaveHistory'),
          headerBackVisible: false,
          headerLeft: () => <BackButton size={28} />,
          headerRight: () =>
            leaveTransactions.length > 0 ? (
              <TouchableOpacity onPress={handleExport} disabled={isExporting} hitSlop={HIT_SLOP.md}>
                <ShareIcon size={20} color={isExporting ? colors.textMuted : colors.text} />
              </TouchableOpacity>
            ) : null,
        }}
      />
      <Screen>
      {/* Content */}
      <SwipeableProvider>
        <FlatList<TransactionListItem<PersonelTransactionRow>>
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
          contentContainerStyle={[styles.listContent, { paddingBottom: contentPaddingBottom }]}
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
      {canRenderEditTransactionBar && (
      <QuickTransactionBar
        visible={showEditBar && canRenderEditTransactionBar}
        onDismiss={() => {
          setShowEditBar(false);
          setEditTransactionId(null);
        }}
        mode="edit"
        transactionId={editTransactionId ?? undefined}
        isScheduledTransaction={false}
        defaultPersonelId={id!}
        createScope="personel"
        tabModeOverride="personel_izin"
        onSuccess={() => {
          setShowEditBar(false);
          setEditTransactionId(null);
        }}
      />
      )}

      {/* Copy QuickTransactionBar */}
      {isOwner && (
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
      )}

      {/* New Leave QuickTransactionBar */}
      {canCreateTransactions && (
      <QuickTransactionBar
        visible={showNewLeaveBar}
        onDismiss={() => setShowNewLeaveBar(false)}
        mode="create"
        defaultType="personel_izin_hakki_tab"
        defaultPersonelId={id!}
        tabModeOverride="personel_izin"
        onSuccess={() => setShowNewLeaveBar(false)}
      />
      )}

      {/* FABs — kardeş detay sayfalarıyla aynı taban/aralık: ana FAB cam (GlassFab),
          not FAB'ı 70px yukarıda ayrı konumlanır (yan yana cam+opak görünmesin). */}
      <AddNoteButton
        entityType="personel_izin"
        entityId={id!}
        style={{ position: 'absolute', right: spacing.lg, bottom: spacing.lg + insets.bottom + 70 }}
      />
      {canCreateTransactions && (
        <GlassFab
          style={[styles.fab, { bottom: spacing.lg + insets.bottom }]}
          onPress={() => setShowNewLeaveBar(true)}
          renderIcon={({ color, size }) => <Plus size={size} color={color} />}
        />
      )}

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
        loading={updateNot.isPending || uploadNotePhoto.isPending}
        entityType="personel_izin"
        entityId={id!}
        existingPhotoPath={editingNote?.photo_path}
      />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    borderBottomWidth: 1,
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
  fab: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 10,
  },
});
