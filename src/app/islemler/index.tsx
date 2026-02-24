import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Receipt,
  Clock,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter, SearchInput, EmptyState } from '@/components/ui';
import { TransactionRow, DateSectionHeader } from '@/components/ui/TransactionRow';
import { SwipeableRow, SwipeableProvider } from '@/components/ui/SwipeableRow';
import { UndoSnackbar } from '@/components/ui/UndoSnackbar';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { PhotoViewerModal } from '@/components/transaction/PhotoViewerModal';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useIslemler, useDeleteIslem, useUpdateIslem } from '@/hooks/useIslemler';
import { useDeleteIslemPhoto, usePickImage, useTakePhoto, useUploadIslemPhoto } from '@/hooks/useIslemPhoto';
import { useAuthContext } from '@/contexts/AuthContext';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { preprocessTransactionsByDate, TransactionListItem } from '@/lib/transactionGrouping';
import { IslemWithRelations } from '@/types/database';
import { usePermissions } from '@/hooks/usePermissions';

// ============================================================================
// PURE HELPER FUNCTIONS (module-level, no re-creation per render)
// ============================================================================

function getIslemEntity(islem: IslemWithRelations): string | null {
  if (islem.type === 'transfer') {
    if (islem.hesap?.name && islem.hedef_hesap?.name) {
      return `${islem.hesap.name} → ${islem.hedef_hesap.name}`;
    }
    return null;
  }
  if (islem.cari?.name) return `→ ${islem.cari.name}`;
  if (islem.personel) {
    const name = `${islem.personel.first_name} ${islem.personel.last_name}`.trim();
    return name ? `→ ${name}` : null;
  }
  if (islem.hesap?.name) return islem.hesap.name;
  return null;
}

// ============================================================================
// MEMOIZED TRANSACTION ITEM (SwipeableRow wrapper + TransactionRow)
// ============================================================================

interface IslemlerTransactionItemProps {
  islem: IslemWithRelations;
  onPress: (id: string) => void;
  onDelete: (id: string, description: string) => void;
  formatDateMedium: (date: string) => string;
  t: (key: string) => string;
  deleteLabel: string;
  canEdit?: boolean;
}

const IslemlerTransactionItem = memo(function IslemlerTransactionItem({
  islem,
  onPress,
  onDelete,
  formatDateMedium,
  t,
  deleteLabel,
  canEdit = true,
}: IslemlerTransactionItemProps) {
  const handleDelete = useCallback(
    () => onDelete(islem.id, islem.description || t(`transactions:types.${islem.type}`)),
    [onDelete, islem.id, islem.description, islem.type, t]
  );

  const entityName = getIslemEntity(islem);
  const description = islem.description || islem.kategori?.name || null;

  return (
    <SwipeableRow
      onDelete={canEdit ? handleDelete : undefined}
      enabled={canEdit}
      deleteLabel={deleteLabel}
    >
      <TransactionRow
        id={islem.id}
        type={islem.type}
        amount={islem.amount}
        date={formatDateMedium(islem.date)}
        typeLabel={t(`transactions:types.${islem.type}`)}
        entityText={entityName}
        secondaryText={description}
        hasPhoto={!!islem.photo_path}
        onPress={onPress}
      />
    </SwipeableRow>
  );
}, (prev, next) => {
  return prev.islem.id === next.islem.id
    && prev.islem.updated_at === next.islem.updated_at
    && prev.islem.photo_path === next.islem.photo_path
    && prev.canEdit === next.canEdit;
});

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function IslemlerPage() {
  const router = useRouter();
  const { t } = useTranslation(['transactions', 'common', 'errors']);
  const { formatDateMedium } = useDateFormat();
  const { canDelete } = usePermissions();
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLongLoadingMessage, setShowLongLoadingMessage] = useState(false);
  // Edit mode state
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);
  // Photo viewer state
  const [viewPhotoPath, setViewPhotoPath] = useState<string | null>(null);
  const [viewPhotoIslemId, setViewPhotoIslemId] = useState<string | null>(null);
  const [isPhotoActionLoading, setIsPhotoActionLoading] = useState(false);

  const { isletme } = useAuthContext();
  const { data: islemler, isLoading, isFetching } = useIslemler();
  const deleteIslem = useDeleteIslem();
  const updateIslem = useUpdateIslem();
  const deletePhoto = useDeleteIslemPhoto();
  const pickImage = usePickImage();
  const takePhoto = useTakePhoto();
  const uploadPhoto = useUploadIslemPhoto();

  // Undo delete hook
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
      const message = error instanceof Error ? error.message : t('transactions:messages.deleteFailed');
      Alert.alert(t('common:status.error'), message);
    },
  });

  // Uzun süren yükleme için mesaj göster
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isLoading || isFetching) {
      timer = setTimeout(() => {
        setShowLongLoadingMessage(true);
      }, 3000);
    } else {
      setShowLongLoadingMessage(false);
    }
    return () => clearTimeout(timer);
  }, [isLoading, isFetching]);

  const filterOptions = useMemo(() => [
    { label: t('transactions:filters.all'), value: 'all' },
    { label: t('transactions:filters.income'), value: 'gelir' },
    { label: t('transactions:filters.expense'), value: 'gider' },
    { label: t('transactions:filters.transfer'), value: 'transfer' },
    { label: t('transactions:filters.client'), value: 'cari' },
    { label: t('transactions:filters.personnel'), value: 'personel' },
  ], [t]);

  // Memoized filtreleme - sadece islemler, filter veya searchQuery değiştiğinde çalışır
  const filteredIslemler = useMemo(() => {
    return (islemler || []).filter((islem) => {
      // Undo-pending silinen işlemleri gizle
      if (pendingDeleteIds.has(islem.id)) return false;

      let matchesFilter = filter === 'all';
      if (filter === 'gelir') {
        matchesFilter = ['gelir', 'cari_satis'].includes(islem.type);
      }
      if (filter === 'gider') {
        matchesFilter = ['gider', 'cari_alis', 'personel_gider'].includes(islem.type);
      }
      if (filter === 'transfer') matchesFilter = islem.type === 'transfer';
      if (filter === 'cari') matchesFilter = islem.type.startsWith('cari_');
      if (filter === 'personel') matchesFilter = islem.type.startsWith('personel_');

      if (!searchQuery) return matchesFilter;

      const searchLower = searchQuery.toLowerCase();
      const personelName = islem.personel
        ? `${islem.personel.first_name || ''} ${islem.personel.last_name || ''}`.trim().toLowerCase()
        : '';
      const matchesSearch =
        (islem.description?.toLowerCase().includes(searchLower) || false) ||
        (islem.hesap?.name?.toLowerCase().includes(searchLower) || false) ||
        (islem.cari?.name?.toLowerCase().includes(searchLower) || false) ||
        (islem.kategori?.name?.toLowerCase().includes(searchLower) || false) ||
        (personelName.includes(searchLower));

      return matchesFilter && matchesSearch;
    });
  }, [islemler, filter, searchQuery, pendingDeleteIds]);

  // ============================================================================
  // DATE GROUPING
  // ============================================================================

  const groupedData = useMemo(() => {
    return preprocessTransactionsByDate(
      filteredIslemler,
      t('common:date.today'),
      t('common:date.yesterday'),
      formatDateMedium,
    );
  }, [filteredIslemler, t, formatDateMedium]);

  // ============================================================================
  // STABLE CALLBACK HANDLERS
  // ============================================================================

  // Tap → edit bar (press on row opens edit)
  const handlePressIslem = useCallback((islemId: string) => {
    setEditTransactionId(islemId);
    setShowEditBar(true);
  }, []);

  // Swipe delete → undo snackbar (no Alert.alert)
  const handleDeleteIslem = useCallback((id: string, description: string) => {
    const islem = (islemler || []).find(i => i.id === id);
    if (islem) {
      requestDelete(id, islem, description);
    }
  }, [islemler, requestDelete]);

  const handleEditIslem = useCallback((islemId: string) => {
    setEditTransactionId(islemId);
    setShowEditBar(true);
  }, []);

  const handleViewPhoto = useCallback((photoPath: string, islemId: string) => {
    setViewPhotoPath(photoPath);
    setViewPhotoIslemId(islemId);
  }, []);

  // Photo delete handler
  const handleDeletePhoto = useCallback(async () => {
    if (!viewPhotoPath || !viewPhotoIslemId) return;

    setIsPhotoActionLoading(true);
    try {
      await deletePhoto.mutateAsync(viewPhotoPath);
      await updateIslem.mutateAsync({
        id: viewPhotoIslemId,
        updates: { photo_path: null },
      });
      setViewPhotoPath(null);
      setViewPhotoIslemId(null);
    } catch (error) {
      console.error('[PhotoDelete] Error:', error);
      Alert.alert(t('common:status.error'), t('common:photo.uploadError'));
    } finally {
      setIsPhotoActionLoading(false);
    }
  }, [viewPhotoPath, viewPhotoIslemId, deletePhoto, updateIslem, t]);

  // Photo change handler
  const handleChangePhoto = useCallback(() => {
    Alert.alert(
      t('common:photo.change'),
      t('common:photo.selectSource'),
      [
        {
          text: t('common:photo.camera'),
          onPress: async () => {
            try {
              const uri = await takePhoto.mutateAsync();
              if (uri) await uploadNewPhoto(uri);
            } catch (error) {
              console.error('[PhotoChange] Camera error:', error);
            }
          },
        },
        {
          text: t('common:photo.gallery'),
          onPress: async () => {
            try {
              const uri = await pickImage.mutateAsync();
              if (uri) await uploadNewPhoto(uri);
            } catch (error) {
              console.error('[PhotoChange] Gallery error:', error);
            }
          },
        },
        { text: t('common:buttons.cancel'), style: 'cancel' },
      ]
    );
  }, [takePhoto, pickImage, t]);

  // Upload new photo (for change)
  const uploadNewPhoto = useCallback(async (uri: string) => {
    if (!viewPhotoIslemId || !isletme?.id) return;

    setIsPhotoActionLoading(true);
    try {
      if (viewPhotoPath) {
        await deletePhoto.mutateAsync(viewPhotoPath);
      }
      const newPath = await uploadPhoto.mutateAsync({
        uri,
        isletmeId: isletme.id,
        islemId: viewPhotoIslemId,
      });
      await updateIslem.mutateAsync({
        id: viewPhotoIslemId,
        updates: { photo_path: newPath },
      });
      setViewPhotoPath(newPath);
    } catch (error) {
      console.error('[PhotoChange] Upload error:', error);
      Alert.alert(t('common:status.error'), t('common:photo.uploadError'));
    } finally {
      setIsPhotoActionLoading(false);
    }
  }, [viewPhotoIslemId, viewPhotoPath, isletme?.id, deletePhoto, uploadPhoto, updateIslem, t]);

  // ============================================================================
  // FlatList renderItem + key extractor
  // ============================================================================

  // Localized labels for swipe actions (stable refs)
  const deleteLabel = t('common:buttons.delete');

  const renderItem = useCallback(({ item }: { item: TransactionListItem }) => {
    if (item.type === 'header') {
      return <DateSectionHeader title={item.title} />;
    }
    const islem = item.data;
    const canEditItem = canDelete('islemler', islem.created_by ?? null);
    return (
      <IslemlerTransactionItem
        islem={islem}
        onPress={handlePressIslem}
        onDelete={handleDeleteIslem}
        formatDateMedium={formatDateMedium}
        t={t}
        deleteLabel={deleteLabel}
        canEdit={canEditItem}
      />
    );
  }, [handlePressIslem, handleDeleteIslem, formatDateMedium, t, deleteLabel, canDelete]);

  const keyExtractor = useCallback((item: TransactionListItem) => item.key, []);

  // ============================================================================
  // FlatList Header (search + filter)
  // ============================================================================

  const ListHeader = useMemo(() => (
    <View>
      {/* Arama */}
      <View style={styles.searchContainer}>
        <SearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filtre */}
      <View style={styles.filterContainer}>
        <TabFilter options={filterOptions} value={filter} onChange={setFilter} />
      </View>
    </View>
  ), [searchQuery, filterOptions, filter]);

  // ============================================================================
  // FlatList Empty component (loading or empty state)
  // ============================================================================

  const ListEmpty = useMemo(() => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text variant="body" color="secondary" style={styles.loadingText}>
            {t('transactions:messages.loading')}
          </Text>
          {showLongLoadingMessage && (
            <View style={styles.longLoadingMessage}>
              <Clock size={20} color={colors.warning} />
              <Text variant="caption" color="secondary" style={styles.longLoadingText}>
                {t('transactions:messages.longLoading')}
              </Text>
            </View>
          )}
        </View>
      );
    }

    return (
      <EmptyState
        icon={<Receipt size={48} color={colors.textMuted} />}
        title={t('common:search.noResults')}
        description={searchQuery || filter !== 'all'
          ? t('transactions:messages.noTransactionsInPeriod')
          : t('transactions:messages.noTransactions')}
      />
    );
  }, [isLoading, showLongLoadingMessage, searchQuery, filter, t]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SwipeableProvider>
        <FlatList
          data={groupedData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          showsVerticalScrollIndicator={false}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={true}
          contentContainerStyle={styles.flatListContent}
        />
      </SwipeableProvider>

      {/* Edit Transaction Bar */}
      <QuickTransactionBar
        visible={showEditBar}
        onDismiss={() => {
          setShowEditBar(false);
          setEditTransactionId(null);
        }}
        mode="edit"
        transactionId={editTransactionId ?? undefined}
        isScheduledTransaction={false}
        onSuccess={() => {
          setShowEditBar(false);
          setEditTransactionId(null);
        }}
      />

      {/* Photo Viewer Modal */}
      <PhotoViewerModal
        visible={!!viewPhotoPath}
        photoPath={viewPhotoPath}
        onClose={() => {
          setViewPhotoPath(null);
          setViewPhotoIslemId(null);
        }}
        onDelete={handleDeletePhoto}
        onChange={handleChangePhoto}
        isLoading={isPhotoActionLoading}
      />

      {/* Undo Delete Snackbar */}
      <UndoSnackbar
        visible={undoSnackbar.visible}
        message={undoSnackbar.message}
        onUndo={undoDelete}
        onDismiss={dismissDelete}
        undoLabel={t('common:buttons.undo')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flatListContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  searchContainer: {
    paddingTop: spacing.lg,
    marginBottom: spacing.md,
  },
  filterContainer: {
    marginBottom: spacing.lg,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
    gap: spacing.md,
  },
  loadingText: {
    marginTop: spacing.sm,
  },
  longLoadingMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 8,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  longLoadingText: {
    flex: 1,
    color: colors.warning,
  },
});
