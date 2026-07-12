import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Receipt,
  Clock,
  ListFilter,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Users,
  UserCheck,
  CalendarPlus,
  CalendarMinus,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, FilterChips, SearchInput, EmptyState } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { FilterChipItem } from '@/components/ui';
import { TransactionRow, DateSectionHeader } from '@/components/ui/TransactionRow';
import { SwipeableRow, SwipeableProvider } from '@/components/ui/SwipeableRow';
import { UndoSnackbar } from '@/components/ui/UndoSnackbar';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { PhotoViewerModal } from '@/components/transaction/PhotoViewerModal';
import { ProductDetailModal } from '@/components/transaction';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '@/constants/spacing';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useIslemler, useDeleteIslem, useUpdateIslem } from '@/hooks/useIslemler';
import { useUrunKalemlerByIslemIds, type UrunKalemOzet } from '@/hooks/useUrunHareketler';
import { useDeleteIslemPhoto, usePickImage, useTakePhoto, useUploadIslemPhoto } from '@/hooks/useIslemPhoto';
import { useAuthContext } from '@/contexts/AuthContext';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { preprocessTransactionsByDate, getIslemlerItemType, TransactionListItem } from '@/lib/transactionGrouping';
import { IslemWithRelations } from '@/types/database';
import { usePermissions } from '@/hooks/usePermissions';
import { isLeaveType } from '@/constants/islemTypes';
import { getCrossCurrencyDisplay } from '@/lib/currency';
import { textIncludes } from '@/lib/turkishTextUtils';

// ============================================================================
// PURE HELPER FUNCTIONS (module-level, no re-creation per render)
// ============================================================================

function getCreatorName(islem: IslemWithRelations): string | null {
  if (!islem.creator) return null;
  return islem.creator.display_name || islem.creator.email || null;
}

function getIslemEntity(islem: IslemWithRelations): string | null {
  if (islem.type === 'transfer') {
    if (islem.hesap?.name && islem.hedef_hesap?.name) {
      return `${islem.hesap.name} → ${islem.hedef_hesap.name}`;
    }
    return null;
  }
  if (islem.cari?.name) return `→ ${islem.cari.name}`;
  if (islem.personel) {
    const name = `${islem.personel.first_name ?? ''} ${islem.personel.last_name ?? ''}`.trim();
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
  onCopy: (id: string) => void;
  onPhotoPress?: (id: string) => void;
  formatDateMedium: (date: string) => string;
  t: (key: string) => string;
  deleteLabel: string;
  copyLabel: string;
  canEdit?: boolean;
  currentUserId?: string;
  urunItems?: UrunKalemOzet[];
}

const IslemlerTransactionItem = memo(function IslemlerTransactionItem({
  islem,
  onPress,
  onDelete,
  onCopy,
  onPhotoPress,
  formatDateMedium,
  t,
  deleteLabel,
  copyLabel,
  canEdit = true,
  currentUserId,
  urunItems,
}: IslemlerTransactionItemProps) {
  const handleDelete = useCallback(
    () => onDelete(islem.id, islem.description || t(`transactions:types.${islem.type}`)),
    [onDelete, islem.id, islem.description, islem.type, t]
  );

  const handleCopy = useCallback(
    () => onCopy(islem.id),
    [onCopy, islem.id]
  );

  const entityName = getIslemEntity(islem);
  const kategoriName = islem.kategori?.name || null;
  const noteText = islem.description || null;
  const creatorText = (islem.created_by && islem.created_by !== currentUserId) ? getCreatorName(islem) : null;
  // Cross-currency: ana satır HEDEF pb, alt satır KAYNAK pb (tek kural, tüm tipler).
  const xc = getCrossCurrencyDisplay(islem);

  return (
    <SwipeableRow
      itemKey={islem.id}
      onDelete={canEdit ? handleDelete : undefined}
      onCopy={canEdit ? handleCopy : undefined}
      enabled={canEdit}
      deleteLabel={deleteLabel}
      copyLabel={copyLabel}
    >
      <TransactionRow
        id={islem.id}
        type={islem.type}
        amount={xc.mainAmount}
        date={formatDateMedium(islem.date)}
        typeLabel={t(`transactions:types.${islem.type}`)}
        entityText={entityName}
        secondaryText={kategoriName}
        tertiaryText={noteText}
        subAmount={xc.subText}
        currency={xc.mainCurrency}
        urunItems={urunItems}
        hasUrunler={(urunItems?.length ?? 0) > 0}
        urunCount={urunItems?.length ?? 0}
        creatorText={creatorText}
        hasPhoto={!!islem.photo_path}
        onPress={onPress}
        onPhotoPress={onPhotoPress}
      />
    </SwipeableRow>
  );
}, (prev, next) => {
  return prev.islem.id === next.islem.id
    && prev.islem.updated_at === next.islem.updated_at
    && prev.islem.photo_path === next.islem.photo_path
    && prev.canEdit === next.canEdit
    && prev.currentUserId === next.currentUserId
    && prev.urunItems === next.urunItems;
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
  // A2: SearchInput value'su searchQuery'ye (anlık) bağlı kalır; yalnız filtreleme/gruplama
  // debouncedSearch'ü kullanır → binlerce işlemde her tuşta tüm liste yeniden filtrelenmez.
  const debouncedSearch = useDebouncedValue(searchQuery, 250);
  const [showLongLoadingMessage, setShowLongLoadingMessage] = useState(false);
  // Edit mode state
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);
  const [productDetailIslemId, setProductDetailIslemId] = useState<string | null>(null);
  // Copy mode state
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [showCopyBar, setShowCopyBar] = useState(false);
  // Photo viewer state
  const [viewPhotoPath, setViewPhotoPath] = useState<string | null>(null);
  const [viewPhotoIslemId, setViewPhotoIslemId] = useState<string | null>(null);
  const [isPhotoActionLoading, setIsPhotoActionLoading] = useState(false);

  const { isletme, user } = useAuthContext();
  const { data: islemler, isLoading, isFetching, hasNextPage, fetchNextPage, isFetchingNextPage } = useIslemler();
  // Ürün kalemleri (satırda önizleme) — tek batch sorgu, N+1 yok
  const islemIdList = useMemo(() => (islemler || []).map((i) => i.id), [islemler]);
  const { getUrunItems } = useUrunKalemlerByIslemIds(islemIdList);
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

  const filterChips = useMemo<FilterChipItem[]>(() => [
    { key: 'all', label: t('transactions:filters.all'), icon: <ListFilter size={14} color={colors.textMuted} /> },
    { key: 'gelir', label: t('transactions:filters.income'), icon: <TrendingUp size={14} color={colors.success} /> },
    { key: 'gider', label: t('transactions:filters.expense'), icon: <TrendingDown size={14} color={colors.error} /> },
    { key: 'transfer', label: t('transactions:filters.transfer'), icon: <ArrowLeftRight size={14} color={colors.info} /> },
    { key: 'cari', label: t('transactions:filters.client'), icon: <Users size={14} color={colors.orange} /> },
    { key: 'personel', label: t('transactions:filters.personnel'), icon: <UserCheck size={14} color={colors.success} /> },
    { key: 'izin_hakki', label: t('transactions:filters.leaveEntitlement'), icon: <CalendarPlus size={14} color={colors.info} /> },
    { key: 'izin_kullanimi', label: t('transactions:filters.leaveUsage'), icon: <CalendarMinus size={14} color={colors.warning} /> },
  ], [t]);

  // Memoized filtreleme - sadece islemler, filter veya searchQuery değiştiğinde çalışır
  const filteredIslemler = useMemo(() => {
    return (islemler || []).filter((islem) => {
      // Undo-pending silinen işlemleri gizle
      if (pendingDeleteIds.has(islem.id)) return false;

      let matchesFilter = filter === 'all';
      if (filter === 'gelir') {
        matchesFilter = ['gelir', 'cari_satis', 'personel_satis'].includes(islem.type);
      }
      if (filter === 'gider') {
        matchesFilter = ['gider', 'cari_alis', 'personel_gider'].includes(islem.type);
      }
      if (filter === 'transfer') matchesFilter = islem.type === 'transfer';
      if (filter === 'cari') matchesFilter = islem.type.startsWith('cari_');
      if (filter === 'personel') matchesFilter = islem.type.startsWith('personel_') && !isLeaveType(islem.type);
      if (filter === 'izin_hakki') matchesFilter = islem.type === 'personel_izin_hakki';
      if (filter === 'izin_kullanimi') matchesFilter = islem.type === 'personel_izin_kullanimi';

      if (!debouncedSearch) return matchesFilter;

      const personelName = islem.personel
        ? `${islem.personel.first_name || ''} ${islem.personel.last_name || ''}`.trim()
        : '';
      const matchesSearch =
        textIncludes(islem.description, debouncedSearch) ||
        textIncludes(islem.hesap?.name, debouncedSearch) ||
        textIncludes(islem.cari?.name, debouncedSearch) ||
        textIncludes(islem.kategori?.name, debouncedSearch) ||
        textIncludes(personelName, debouncedSearch);

      return matchesFilter && matchesSearch;
    });
  }, [islemler, filter, debouncedSearch, pendingDeleteIds]);

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

  // Tap → ürünlü işlem ürün detay modalı; değilse düzenleme barı (cariler ile aynı standart)
  const handlePressIslem = useCallback((islemId: string) => {
    if ((getUrunItems(islemId)?.length ?? 0) > 0) {
      setProductDetailIslemId(islemId);
      return;
    }
    setEditTransactionId(islemId);
    setShowEditBar(true);
  }, [getUrunItems]);

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

  // Copy → open create bar with pre-filled data from source transaction
  const handleCopyIslem = useCallback((islemId: string) => {
    setCopySourceId(islemId);
    setShowCopyBar(true);
  }, []);

  const handleViewPhoto = useCallback((islemId: string) => {
    const islem = (islemler || []).find(i => i.id === islemId);
    if (islem?.photo_path) {
      setViewPhotoPath(islem.photo_path);
      setViewPhotoIslemId(islemId);
    }
  }, [islemler]);

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
  const copyLabel = t('common:buttons.copy');

  const renderItem = useCallback(({ item }: { item: TransactionListItem }) => {
    if (item.type === 'header') {
      return <DateSectionHeader title={item.title} />;
    }
    if (item.type === 'milestone' || item.type === 'note') {
      return null;
    }
    const islem = item.data;
    const canEditItem = canDelete('islemler', islem.created_by ?? null);
    return (
      <IslemlerTransactionItem
        islem={islem}
        onPress={handlePressIslem}
        onDelete={handleDeleteIslem}
        onCopy={handleCopyIslem}
        onPhotoPress={handleViewPhoto}
        formatDateMedium={formatDateMedium}
        t={t}
        deleteLabel={deleteLabel}
        copyLabel={copyLabel}
        canEdit={canEditItem}
        currentUserId={user?.id}
        urunItems={getUrunItems(islem.id)}
      />
    );
  }, [handlePressIslem, handleDeleteIslem, handleCopyIslem, handleViewPhoto, formatDateMedium, t, deleteLabel, copyLabel, canDelete, user?.id, getUrunItems]);

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

      {/* Filtre Chips */}
      <View style={styles.filterContainer}>
        <FilterChips chips={filterChips} activeKey={filter} onChange={setFilter} />
      </View>
    </View>
  ), [searchQuery, filterChips, filter]);

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
        description={debouncedSearch || filter !== 'all'
          ? t('transactions:messages.noTransactionsInPeriod')
          : t('transactions:messages.noTransactions')}
      />
    );
  }, [isLoading, showLongLoadingMessage, debouncedSearch, filter, t]);

  // ============================================================================
  // FlatList Footer ("daha fazla göster") — useMemo ile stabil (cariler/hesaplar ile aynı standart)
  // ============================================================================

  const ListFooter = useMemo(
    () =>
      hasNextPage ? (
        <TouchableOpacity
          style={[styles.loadMoreBtn, isFetchingNextPage && { opacity: 0.5 }]}
          onPress={() => { if (!isFetchingNextPage) fetchNextPage(); }}
          disabled={isFetchingNextPage}
          activeOpacity={0.7}
        >
          <Text style={styles.loadMoreText}>
            {isFetchingNextPage ? t('common:status.loading') : t('common:buttons.showMore')}
          </Text>
        </TouchableOpacity>
      ) : null,
    [hasNextPage, isFetchingNextPage, fetchNextPage, t]
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SwipeableProvider>
        <FlashList
          data={groupedData}
          keyExtractor={keyExtractor}
          getItemType={getIslemlerItemType}
          keyboardShouldPersistTaps="handled"
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          ListFooterComponent={ListFooter}
          // NOT: onEndReached (oto-sayfalama) BİLİNÇLİ KALDIRILDI. Bu liste sunucuda FİLTRESİZ 50/sayfa
          // sayfalanıp CLIENT-SIDE filtreleniyor (filteredIslemler); izin_hakki/izin_kullanimi gibi seyrek
          // filtrede filtreli liste viewport'tan kısa kaldığından onEndReached kaydırma olmadan tetikleniyor
          // ve her sayfa çoğu izin-dışı satır ekleyip listeyi kısa bıraktığından TÜM sayfaları zincirleme
          // yüklüyordu → "Daha Fazla Göster" butonu atlanıyordu. Tek pagination tetikleyicisi artık ListFooter
          // butonu (cariler/[id] & hesaplar ile aynı buton-tabanlı standart).
          showsVerticalScrollIndicator={false}
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

      {/* Ürün Detay Modal — ürünlü işleme tıklanınca (cariler ile aynı standart) */}
      <ProductDetailModal
        islemId={productDetailIslemId}
        onDismiss={() => setProductDetailIslemId(null)}
        onEdit={(islemId) => {
          setProductDetailIslemId(null);
          setEditTransactionId(islemId);
          setShowEditBar(true);
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
        onSuccess={() => {
          setShowCopyBar(false);
          setCopySourceId(null);
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
  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginVertical: spacing.md,
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
  flatListContent: {
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
