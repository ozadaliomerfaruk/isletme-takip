import { useState, useCallback, useMemo, useEffect, memo } from 'react';
import { View, StyleSheet, FlatList, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Phone,
  Briefcase,
  CalendarDays,
  CalendarCheck,
  CalendarX2,
  Banknote,
  Zap,
  CircleDollarSign,
  Pencil,
  Trash2,
  UserCircle,
  MoreVertical,
  Share2,
  BarChart3,
} from 'lucide-react-native';
import { BackButton } from '@/components/ui/BackButton';
import { Text, Card, Button, EmptyState, ArchivedBanner, type BalanceDirection } from '@/components/ui';
import { IleriTarihliIslemlerSection } from '@/components/ui/IleriTarihliIslemlerSection';
import { BalanceEditorModal, DetailExportSection, DetailActionMenu } from '@/components/detail';
import { SwipeableRow, SwipeableProvider } from '@/components/ui/SwipeableRow';
import { UndoSnackbar } from '@/components/ui/UndoSnackbar';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { TransactionRow, DateSectionHeader } from '@/components/ui/TransactionRow';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import type { TransactionType } from '@/components/transaction/TransactionTypeTabs';
import { PhotoViewerModal } from '@/components/transaction/PhotoViewerModal';
import { AddNoteButton } from '@/components/notes/AddNoteButton';
import { NoteRow } from '@/components/notes/NoteRow';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { useDateFormat } from '@/hooks/useDateFormat';
import { preprocessTransactionsByDate, mergeNotesIntoGroupedData, TransactionListItem, MilestoneItem } from '@/lib/transactionGrouping';
import { useNotlarByEntity } from '@/hooks/useNotlar';
import { useDetailNoteHandlers } from '@/hooks/useDetailNoteHandlers';
import { NoteInputModal } from '@/components/notes/NoteInputModal';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { getInitials } from '@/lib/utils';
import { usePersonelById, useDeletePersonel, useUpdatePersonel } from '@/hooks/usePersonel';
import { useUnarchivePersonel } from '@/hooks/useArchive';
import { useIslemlerByPersonel, useDeleteIslem } from '@/hooks/useIslemler';
import { useIleriTarihliIslemlerByPersonel } from '@/hooks/useIleriTarihliIslemler';
import { IslemWithRelations, Not } from '@/types/database';
import { LeaveQuotaCard } from '@/components/personel/LeaveQuotaCard';
import { isLeaveType } from '@/constants/islemTypes';
import { toErrorMessage, isLinkedRecordsError } from '@/lib/errors';
import { getEntityPerspectiveColor, getEntityPerspectivePrefix } from '@/lib/transactionColors';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthContext } from '@/contexts/AuthContext';

// ============================================================================
// PURE HELPER FUNCTIONS (module-level, no re-creation per render)
// ============================================================================

function getHareketLabelKey(type: string): string {
  switch (type) {
    case 'personel_gider':
      return 'staff:transactionLabels.gider';
    case 'personel_odeme':
      return 'staff:transactionLabels.odeme';
    case 'personel_tahsilat':
      return 'staff:transactionLabels.tahsilat';
    case 'personel_satis':
      return 'staff:transactionLabels.satis';
    case 'personel_izin_hakki':
      return 'staff:transactionLabels.izinHakki';
    case 'personel_izin_kullanimi':
      return 'staff:transactionLabels.izinKullanimi';
    default:
      return type;
  }
}

// ============================================================================
// MEMOIZED TRANSACTION ITEM
// ============================================================================

interface PersonelTransactionItemProps {
  islem: IslemWithRelations;
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
  formatDateSmart: (date: string) => string;
  t: (key: string) => string;
  currency?: string;
  deleteLabel: string;
  copyLabel: string;
  canEdit?: boolean;
  currentUserId?: string;
}

function getCreatorName(islem: IslemWithRelations): string | null {
  if (!islem.creator) return null;
  return islem.creator.display_name || islem.creator.email || null;
}

const PersonelTransactionItem = memo(function PersonelTransactionItem({
  islem,
  onPress,
  onDelete,
  onCopy,
  formatDateSmart,
  t,
  currency,
  deleteLabel,
  copyLabel,
  canEdit = true,
  currentUserId,
}: PersonelTransactionItemProps) {
  const handleDelete = useCallback(() => onDelete(islem.id), [onDelete, islem.id]);
  const handleCopy = useCallback(() => onCopy(islem.id), [onCopy, islem.id]);

  const labelKey = getHareketLabelKey(islem.type);
  const typeLabel = t(labelKey);
  // Ödeme/tahsilat işlemlerinde hangi hesaba yapıldığını göster (ok ile yön belirt)
  const entityText = (islem.type === 'personel_odeme' || islem.type === 'personel_tahsilat')
    ? islem.hesap?.name
      ? `${islem.type === 'personel_odeme' ? '→' : '←'} ${islem.hesap.name}`
      : null
    : null;
  const creatorText = (islem.created_by && islem.created_by !== currentUserId) ? getCreatorName(islem) : null;

  return (
    <SwipeableRow onDelete={canEdit ? handleDelete : undefined} onCopy={canEdit ? handleCopy : undefined} enabled={canEdit} deleteLabel={deleteLabel} copyLabel={copyLabel}>
      <TransactionRow
        id={islem.id}
        type={islem.type}
        amount={Number(islem.amount)}
        date={formatDateSmart(islem.date)}
        typeLabel={typeLabel}
        entityText={entityText}
        secondaryText={islem.kategori?.name || null}
        tertiaryText={islem.description || null}
        creatorText={creatorText}
        currency={currency}
        overrideColor={getEntityPerspectiveColor(islem.type)}
        overridePrefix={getEntityPerspectivePrefix(islem.type)}
        onPress={onPress}
      />
    </SwipeableRow>
  );
}, (prev, next) => {
  return prev.islem.id === next.islem.id
    && prev.islem.updated_at === next.islem.updated_at
    && prev.canEdit === next.canEdit
    && prev.currentUserId === next.currentUserId;
});

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function PersonelHareketleriPage() {
  const { id, expandIslemId } = useLocalSearchParams<{ id: string; expandIslemId?: string }>();
  const router = useRouter();
  const { t } = useTranslation(['staff', 'common', 'errors']);
  const { formatDateSmart, formatDateShort, formatDateMedium } = useDateFormat();
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;
  const insets = useSafeAreaInsets();

  const { data: personel, isLoading: personelLoading, refetch: refetchPersonel } = usePersonelById(id!);
  const { data: islemler, isLoading: islemlerLoading, hasNextPage, fetchNextPage, isFetchingNextPage, refetch: refetchIslemler } = useIslemlerByPersonel(id!);
  const { data: ileriTarihliIslemler, isLoading: ileriTarihliLoading } = useIleriTarihliIslemlerByPersonel(id!);
  const { data: entityNotes } = useNotlarByEntity('personel', id!);
  const { canUpdate, canDelete } = usePermissions();
  const { user, isletme } = useAuthContext();
  const deleteIslem = useDeleteIslem();
  const deletePersonel = useDeletePersonel();
  const updatePersonel = useUpdatePersonel();
  const unarchivePersonel = useUnarchivePersonel();

  const [quickBarVisible, setQuickBarVisible] = useState(false);
  const [quickBarDefaultType, setQuickBarDefaultType] = useState<TransactionType | undefined>(undefined);
  const [showMenu, setShowMenu] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [editBalanceModalVisible, setEditBalanceModalVisible] = useState(false);
  const [newInitialBalance, setNewInitialBalance] = useState('');
  const [balanceDirection, setBalanceDirection] = useState<BalanceDirection>('credit');
  // Edit transaction state
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);
  // Copy transaction state
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [showCopyBar, setShowCopyBar] = useState(false);
  const [notePhotoPath, setNotePhotoPath] = useState<string | null>(null);
  const {
    editingNoteId, setEditingNoteId, editingNote,
    handleNoteUpdate, handleNoteDelete, handleToggleNoteCompletion, handleMarkAsTask,
    isUpdatingNote,
  } = useDetailNoteHandlers({ entityType: 'personel', entityId: id!, entityNotes, isletmeId: isletme?.id });

  const {
    pendingDeleteIds,
    requestDelete,
    undoDelete,
    dismissDelete,
    snackbar: undoSnackbar,
  } = useUndoDelete<IslemWithRelations>({
    onCommitDelete: async (id: string) => {
      await deleteIslem.mutateAsync(id);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? toErrorMessage(error) : t('errors:transaction.deleteFailed');
      Alert.alert(t('common:status.error'), message);
    },
  });

  // Handle expandIslemId from search navigation
  const [expandHandled, setExpandHandled] = useState(false);
  useEffect(() => {
    if (expandIslemId && !expandHandled && islemler && islemler.length > 0) {
      setEditTransactionId(expandIslemId);
      setShowEditBar(true);
      setExpandHandled(true);
    }
  }, [expandIslemId, expandHandled, islemler]);

  // Pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchPersonel(), refetchIslemler()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchPersonel, refetchIslemler]);

  const fullName = personel ? `${personel.first_name} ${personel.last_name ?? ''}`.trim() : t('common:status.loading');

  // Memoized başlangıç bakiyesi hesaplaması
  const initialBalance = useMemo(() => {
    if (!personel || !islemler) return 0;

    let totalEffect = 0;
    islemler.forEach((islem) => {
      const amount = toNumber(islem.amount);
      if (islem.type === 'personel_gider') {
        totalEffect -= amount;
      } else if (islem.type === 'personel_odeme') {
        totalEffect += amount;
      } else if (islem.type === 'personel_tahsilat') {
        totalEffect -= amount;
      } else if (islem.type === 'personel_satis') {
        totalEffect += amount;
      }
    });

    return toNumber(personel.balance) - totalEffect;
  }, [personel, islemler]);

  // İzin kota hesaplaması
  const leaveQuota = useMemo(() => {
    if (!islemler) return { hakEdilen: 0, kullanilan: 0 };
    return islemler.reduce(
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
  }, [islemler]);

  const handleAddLeave = useCallback(() => {
    setQuickBarDefaultType('personel_izin_hakki_tab');
    setQuickBarVisible(true);
  }, []);

  const handleViewLeaveHistory = useCallback(() => {
    router.push({ pathname: '/personel/izin-gecmisi/[id]', params: { id: id! } });
  }, [id]);

  // Başlangıç bakiyesi düzenleme
  const handleOpenEditBalance = useCallback(() => {
    // Personelde: pozitif = credit (biz borçluyuz), negatif = debt (personel bize borçlu)
    setBalanceDirection(initialBalance >= 0 ? 'credit' : 'debt');
    setNewInitialBalance(Math.abs(initialBalance).toString());
    setEditBalanceModalVisible(true);
  }, [initialBalance]);

  const handleSaveInitialBalance = useCallback(() => {
    const absoluteAmount = parseFloat(newInitialBalance.replace(',', '.')) || 0;
    // Personelde: credit = pozitif (biz borçluyuz), debt = negatif (personel bize borçlu)
    const newInitial = balanceDirection === 'credit' ? absoluteAmount : -absoluteAmount;

    Alert.alert(
      t('staff:balance.confirmTitle'),
      t('staff:balance.confirmMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.confirm'),
          onPress: async () => {
            try {
              if (!personel) return;
              const transactionEffect = Number(personel.balance) - initialBalance;
              const newPersonelBalance = newInitial + transactionEffect;

              await updatePersonel.mutateAsync({
                id: personel.id,
                balance: newPersonelBalance,
              });

              setEditBalanceModalVisible(false);
              refetchPersonel();
            } catch (error) {
              Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:general.tryAgain'));
            }
          },
        },
      ]
    );
  }, [newInitialBalance, balanceDirection, personel, initialBalance, updatePersonel, refetchPersonel, t]);

  // Stable callback handlers for memoized item
  const handlePressIslem = useCallback((islemId: string) => {
    setEditTransactionId(islemId);
    setShowEditBar(true);
  }, []);

  const handleDeleteIslem = useCallback((islemId: string) => {
    const islem = (islemler || []).find(i => i.id === islemId);
    if (islem) {
      const desc = islem.description || t(`staff:transactionLabels.${islem.type.replace('personel_', '')}`) || islem.type;
      requestDelete(islemId, islem, desc);
    }
  }, [islemler, requestDelete, t]);

  const handleEditIslem = useCallback((islemId: string) => {
    setEditTransactionId(islemId);
    setShowEditBar(true);
  }, []);

  const handleCopyIslem = useCallback((islemId: string) => {
    setCopySourceId(islemId);
    setShowCopyBar(true);
  }, []);

  const handleDeletePersonel = useCallback(() => {
    setShowMenu(false);
    Alert.alert(
      t('staff:deleteConfirm.staffTitle'),
      t('staff:deleteConfirm.staffMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePersonel.mutateAsync(id!);
              router.replace('/(tabs)/personel');
            } catch (error) {
              Alert.alert(
                isLinkedRecordsError(error) ? t('common:errors.cannotDeleteTitle') : t('common:status.error'),
                toErrorMessage(error),
              );
            }
          },
        },
      ]
    );
  }, [deletePersonel, id, router, t]);

  const handleUnarchive = useCallback(async () => {
    try {
      await unarchivePersonel.mutateAsync(id!);
      Alert.alert(t('common:status.success'), t('common:archive.messages.unarchiveSuccess'));
      router.back();
    } catch (error) {
      Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
    }
  }, [unarchivePersonel, id, t, router]);

  // Header right buttons
  const headerRightElement = useMemo(() => (
    <View style={styles.headerRightContainer}>
      <TouchableOpacity
        onPress={() => router.push({ pathname: '/raporlar/personel', params: { personelId: id } })}
        style={styles.headerBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <BarChart3 size={22} color={colors.text} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setShowShareOptions(true)}
        style={styles.headerBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Share2 size={22} color={colors.text} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setShowMenu(true)}
        style={styles.headerBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MoreVertical size={24} color={colors.text} />
      </TouchableOpacity>
    </View>
  ), [id]);

  // ============================================================================
  // FlatList renderItem + key extractor
  // ============================================================================

  // === DATE GROUPING ===
  const groupedData = useMemo(() => {
    if (!islemler) return [];
    const filtered = islemler.filter(i => !pendingDeleteIds.has(i.id));
    const result = preprocessTransactionsByDate(
      filtered,
      t('common:date.today'),
      t('common:date.yesterday'),
      formatDateSmart,
    );

    // Inject milestone items (start_date, end_date) into the grouped list
    if (personel) {
      const milestones: MilestoneItem[] = [];
      if (personel.start_date) {
        milestones.push({
          type: 'milestone',
          key: 'milestone-start',
          title: t('staff:milestones.startDate'),
          date: personel.start_date,
          color: 'success',
        });
      }
      if (personel.end_date) {
        milestones.push({
          type: 'milestone',
          key: 'milestone-end',
          title: t('staff:milestones.endDate'),
          date: personel.end_date,
          color: 'error',
        });
      }

      // Sort milestones descending by date (newest first) for correct insertion order
      milestones.sort((a, b) => b.date.localeCompare(a.date));

      // Insert each milestone into the correct position by date (descending order)
      for (const ms of milestones) {
        const msDate = ms.date.slice(0, 10); // YYYY-MM-DD
        let inserted = false;

        // Check if a date header already exists for this date
        const existingHeaderIdx = result.findIndex(
          item => item.type === 'header' && item.key === 'header-' + msDate
        );

        if (existingHeaderIdx >= 0) {
          // Date group exists - insert at the end of this group
          let insertIdx = existingHeaderIdx + 1;
          while (insertIdx < result.length && result[insertIdx].type !== 'header') {
            insertIdx++;
          }
          result.splice(insertIdx, 0, ms);
          inserted = true;
        } else {
          // Find correct position for a new date group (descending order)
          for (let i = 0; i < result.length; i++) {
            const item = result[i];
            if (item.type === 'header') {
              const headerDate = item.key.replace('header-', '');
              if (msDate > headerDate) {
                // Milestone date is more recent - insert before this header
                const headerTitle = formatDateMedium(ms.date);
                result.splice(i, 0, { type: 'header', key: 'header-' + msDate, title: headerTitle }, ms);
                inserted = true;
                break;
              }
            }
          }
        }

        if (!inserted) {
          // Milestone is older than all items, append at end
          const headerTitle = formatDateMedium(ms.date);
          result.push({ type: 'header', key: 'header-' + msDate, title: headerTitle }, ms);
        }
      }
    }

    // Merge notes into the grouped data
    return mergeNotesIntoGroupedData(
      result,
      entityNotes ?? [],
      t('common:date.today'),
      t('common:date.yesterday'),
      formatDateSmart,
    );
  }, [islemler, pendingDeleteIds, t, formatDateSmart, formatDateMedium, personel, entityNotes]);

  const deleteLabel = t('common:buttons.delete');
  const copyLabel = t('common:buttons.copy');

  const renderTransactionItem = useCallback(({ item }: { item: TransactionListItem }) => {
    if (item.type === 'header') {
      return <DateSectionHeader title={item.title} />;
    }
    if (item.type === 'milestone') {
      const MilestoneIcon = item.color === 'success' ? CalendarCheck : CalendarX2;
      const milestoneColor = item.color === 'success' ? colors.success : colors.error;
      return (
        <View style={styles.milestoneRow}>
          <View style={[styles.milestoneBar, { backgroundColor: milestoneColor }]} />
          <MilestoneIcon size={18} color={milestoneColor} />
          <Text style={[styles.milestoneText, { color: milestoneColor }]}>
            {item.title}: {formatDateMedium(item.date)}
          </Text>
        </View>
      );
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
            onPhotoPress={setNotePhotoPath}
          />
        </SwipeableRow>
      );
    }
    const islem = item.data;
    const canEditItem = canDelete('islemler', islem.created_by ?? null);
    return (
      <PersonelTransactionItem
        islem={islem}
        onPress={handlePressIslem}
        onDelete={handleDeleteIslem}
        onCopy={handleCopyIslem}
        formatDateSmart={formatDateSmart}
        t={t}
        currency={personel?.currency}
        deleteLabel={deleteLabel}
        copyLabel={copyLabel}
        canEdit={canEditItem}
        currentUserId={user?.id}
      />
    );
  }, [handlePressIslem, handleDeleteIslem, handleCopyIslem, handleNoteDelete, handleToggleNoteCompletion, handleMarkAsTask, formatDateSmart, formatDateMedium, t, personel?.currency, deleteLabel, copyLabel, canDelete, user?.id]);

  const keyExtractor = useCallback((item: TransactionListItem) => item.key, []);

  // ============================================================================
  // FlatList Header (personel summary + action buttons + ileri tarihli + section title)
  // ============================================================================

  const ListHeader = useMemo(() => {
    if (!personel) return null;
    return (
      <View>
        {/* Personel Özeti */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.avatar}>
              <Text variant="h2" style={{ color: colors.primary }}>
                {getInitials(fullName)}
              </Text>
            </View>
            <View style={styles.summaryInfo}>
              {personel.position && (
                <View style={styles.infoRow}>
                  <Briefcase size={14} color={colors.textMuted} />
                  <Text variant="body" color="secondary">
                    {personel.position}
                  </Text>
                </View>
              )}
              {personel.phone && (
                <View style={styles.infoRow}>
                  <Phone size={14} color={colors.textMuted} />
                  <Text variant="caption" color="secondary">
                    {personel.phone}
                  </Text>
                </View>
              )}
              {personel.start_date && (
                <View style={styles.infoRow}>
                  <CalendarDays size={14} color={colors.textMuted} />
                  <Text variant="caption" color="secondary">
                    {formatDateShort(personel.start_date)}
                    {personel.end_date ? ` → ${formatDateShort(personel.end_date)}` : ''}
                  </Text>
                </View>
              )}
              {!personel.start_date && personel.end_date && (
                <View style={styles.infoRow}>
                  <CalendarDays size={14} color={colors.error} />
                  <Text variant="caption" color="error">
                    {t('staff:form.endDate')}: {formatDateShort(personel.end_date)}
                  </Text>
                </View>
              )}
              {personel.salary != null && personel.salary > 0 && (
                <View style={styles.infoRow}>
                  <Banknote size={14} color={colors.textMuted} />
                  <Text variant="caption" color="secondary">
                    {formatCurrency(personel.salary, personel.currency)}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.balanceInfo}>
              <Text variant="caption" color="secondary">
                {Number(personel.balance) < 0 ? t('staff:balance.weOwe') : t('staff:balance.theyOwe')}
              </Text>
              <Text variant="h2" color={Number(personel.balance) < 0 ? 'error' : 'success'}>
                {formatCurrency(Math.abs(Number(personel.balance)), personel.currency)}
              </Text>
              {personel.currency !== baseCurrency && exchangeRates && toNumber(personel.balance) !== 0 && (
                <Text variant="caption" color="secondary">
                  ~{formatCurrency(convertCurrency(Math.abs(toNumber(personel.balance)), personel.currency, baseCurrency, exchangeRates) ?? 0, baseCurrency)}
                </Text>
              )}
            </View>
          </View>
        </Card>

        {/* Arşiv Banner */}
        {personel.is_archived && (
          <View style={styles.bannerContainer}>
            <ArchivedBanner
              onUnarchive={handleUnarchive}
              loading={unarchivePersonel.isPending}
            />
          </View>
        )}

        {/* İzin Kota Kartı */}
        {!personel.is_archived && (
          <LeaveQuotaCard
            hakEdilenGun={leaveQuota.hakEdilen}
            kullanilanGun={leaveQuota.kullanilan}
            onAddLeave={handleAddLeave}
            onCardPress={handleViewLeaveHistory}
          />
        )}

        {/* İleri Tarihli İşlemler */}
        <View style={styles.section}>
          <IleriTarihliIslemlerSection
            ileriTarihliIslemler={ileriTarihliIslemler}
            isLoading={ileriTarihliLoading}
          />

          <Text variant="h3" style={styles.sectionTitle}>
            {t('staff:details.transactions')}
          </Text>

          {islemlerLoading && (
            <Text color="secondary">{t('common:status.loading')}</Text>
          )}
        </View>
      </View>
    );
  }, [personel, fullName, baseCurrency, exchangeRates, ileriTarihliIslemler, ileriTarihliLoading, islemlerLoading, handleUnarchive, unarchivePersonel.isPending, leaveQuota, handleAddLeave, handleViewLeaveHistory, t]);

  // ============================================================================
  // FlatList Footer (başlangıç bakiyesi kartı)
  // ============================================================================

  const ListFooter = useMemo(() => {
    if (!personel) return null;
    return (
      <View style={styles.section}>
        {hasNextPage && (
          <TouchableOpacity
            style={styles.loadMoreBtn}
            onPress={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            activeOpacity={0.7}
          >
            <Text style={styles.loadMoreText}>
              {isFetchingNextPage ? t('common:status.loading') : t('common:buttons.showMore')}
            </Text>
          </TouchableOpacity>
        )}
        <Card style={styles.hareketCard}>
          <View style={styles.hareketHeader}>
            <View style={[styles.hareketIcon, { backgroundColor: colors.primaryLight + '30' }]}>
              <CircleDollarSign size={20} color={colors.primary} />
            </View>
            <View style={styles.hareketInfo}>
              <Text variant="body">{t('staff:details.initialBalance')}</Text>
              <Text variant="caption" color="secondary">
                {t('staff:details.personelRecord')} • {formatDateShort(personel.created_at)}
              </Text>
            </View>
            <Text variant="h3" color={initialBalance >= 0 ? 'success' : 'error'}>
              {formatCurrency(initialBalance, personel?.currency)}
            </Text>
          </View>
        </Card>
      </View>
    );
  }, [personel, initialBalance, t, hasNextPage, fetchNextPage, isFetchingNextPage]);

  // ============================================================================
  // FlatList Empty component
  // ============================================================================

  const ListEmpty = useMemo(() => {
    if (islemlerLoading) return null;
    return (
      <View style={styles.section}>
        <Card style={styles.hareketCard}>
          <View style={styles.hareketHeader}>
            <View style={[styles.hareketIcon, { backgroundColor: colors.primaryLight + '30' }]}>
              <CircleDollarSign size={20} color={colors.primary} />
            </View>
            <View style={styles.hareketInfo}>
              <Text variant="body">{t('staff:details.initialBalance')}</Text>
              {personel && (
                <Text variant="caption" color="secondary">
                  {t('staff:details.personelRecord')} • {formatDateShort(personel.created_at)}
                </Text>
              )}
            </View>
            <View style={styles.initialBalanceRow}>
              <Text variant="h3" color={initialBalance >= 0 ? 'success' : 'error'}>
                {formatCurrency(initialBalance, personel?.currency)}
              </Text>
              <TouchableOpacity
                onPress={handleOpenEditBalance}
                style={styles.editBalanceBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Pencil size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      </View>
    );
  }, [islemlerLoading, personel, initialBalance, handleOpenEditBalance, t]);

  // ============================================================================
  // LOADING / NOT FOUND STATES
  // ============================================================================

  if (personelLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!personel) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon={<UserCircle size={48} color={colors.textMuted} />}
          title={t('errors:personel.notFound')}
          description={t('staff:details.notFoundDescription')}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: fullName,
          headerBackVisible: false,
          headerRight: () => headerRightElement,
          headerLeft: () => <BackButton size={28} />,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <SwipeableProvider>
          <FlatList
            data={groupedData}
            keyExtractor={keyExtractor}
            renderItem={renderTransactionItem}
            ListHeaderComponent={ListHeader}
            ListFooterComponent={(islemler && islemler.length > 0) ? ListFooter : undefined}
            ListEmptyComponent={ListEmpty}
            showsVerticalScrollIndicator={false}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews={false}
            contentContainerStyle={styles.flatListContent}
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
          />
        </SwipeableProvider>

        <DetailActionMenu
          visible={showMenu}
          onClose={() => setShowMenu(false)}
          actions={[
            { icon: Pencil, label: t('common:buttons.edit'), visible: canUpdate('personel', personel?.created_by ?? null), onPress: () => { setShowMenu(false); router.push({ pathname: '/personel/duzenle/[id]', params: { id: id } }); } },
            { icon: Trash2, label: t('common:buttons.delete'), visible: canDelete('personel', personel?.created_by ?? null), danger: true, onPress: handleDeletePersonel },
          ]}
        />

        {/* Quick Transaction Bar - Create Mode */}
        <QuickTransactionBar
          visible={quickBarVisible}
          onDismiss={() => { setQuickBarVisible(false); setQuickBarDefaultType(undefined); }}
          defaultType={quickBarDefaultType}
          defaultPersonelId={personel?.id}
          onSuccess={() => { setQuickBarVisible(false); setQuickBarDefaultType(undefined); }}
        />

        {/* Quick Transaction Bar - Edit Mode */}
        <QuickTransactionBar
          visible={showEditBar}
          onDismiss={() => {
            setShowEditBar(false);
            setEditTransactionId(null);
          }}
          mode="edit"
          transactionId={editTransactionId ?? undefined}
          isScheduledTransaction={false}
          defaultPersonelId={personel?.id}
          onSuccess={() => {
            setShowEditBar(false);
            setEditTransactionId(null);
          }}
        />

        {/* Copy Transaction Bar */}
        <QuickTransactionBar
          visible={showCopyBar}
          onDismiss={() => {
            setShowCopyBar(false);
            setCopySourceId(null);
          }}
          mode="create"
          copySourceId={copySourceId ?? undefined}
          defaultPersonelId={personel?.id}
          onSuccess={() => {
            setShowCopyBar(false);
            setCopySourceId(null);
          }}
        />

        <DetailExportSection
          visible={showShareOptions}
          onDismiss={() => setShowShareOptions(false)}
          entityType="personel"
          entityId={id!}
          entityName={fullName}
          currentBalance={Number(personel.balance)}
        />

        <BalanceEditorModal
          visible={editBalanceModalVisible}
          onDismiss={() => setEditBalanceModalVisible(false)}
          title={t('staff:balance.editTitle')}
          warning={t('staff:balance.editWarning')}
          directionLabel={t('staff:form.balanceDirection.label')}
          directionVariant="staff"
          balanceDirection={balanceDirection}
          onDirectionChange={setBalanceDirection}
          inputLabel={t('staff:balance.newInitialBalance')}
          inputValue={newInitialBalance}
          onInputChange={setNewInitialBalance}
          onSave={handleSaveInitialBalance}
          isSaving={updatePersonel.isPending}
          cancelLabel={t('common:buttons.cancel')}
          saveLabel={t('common:buttons.save')}
        />

        {/* Floating Not Ekle + Yeni İşlem FAB */}
        {!personel.is_archived && (
          <>
            <AddNoteButton
              entityType="personel"
              entityId={id!}
              style={{ position: 'absolute', right: spacing.lg, bottom: spacing.lg + insets.bottom + 70 }}
            />
            <TouchableOpacity
              style={[styles.fab, { bottom: spacing.lg + insets.bottom }]}
              onPress={() => setQuickBarVisible(true)}
              activeOpacity={0.8}
            >
              <Zap size={24} color={colors.surface} />
            </TouchableOpacity>
          </>
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
          loading={isUpdatingNote}
          entityType="personel"
          entityId={id!}
          existingPhotoPath={editingNote?.photo_path}
        />
        <PhotoViewerModal
          visible={!!notePhotoPath}
          photoPath={notePhotoPath}
          onClose={() => setNotePhotoPath(null)}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  milestoneBar: {
    width: 3,
    height: 24,
    borderRadius: 1.5,
  },
  milestoneText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flatListContent: {
    flexGrow: 1,
  },
  summaryCard: {
    margin: spacing.lg,
  },
  bannerContainer: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryLight + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  balanceInfo: {
    alignItems: 'flex-end',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  sectionTitle: {
    marginBottom: spacing.lg,
  },
  hareketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hareketIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hareketInfo: {
    flex: 1,
  },
  hareketCard: {
    marginBottom: spacing.sm,
  },
  // Header right buttons
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.sm,
  },
  headerBtn: {
    padding: spacing.xs,
  },
  // Initial balance edit styles
  initialBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editBalanceBtn: {
    padding: spacing.xs,
  },
  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadMoreText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
});
