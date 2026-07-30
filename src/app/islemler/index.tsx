import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import {
  Receipt,
  X,
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
import { Text, FilterChips, FloatingSearchBar, EmptyState, Modal, Screen } from '@/components/ui';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { FilterChipItem } from '@/components/ui';
import { TransactionRow, DateSectionHeader } from '@/components/ui/TransactionRow';
import { formatTime } from '@/lib/date';
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
import {
  getTransactionMutationMessageKey,
  toErrorMessage,
} from '@/lib/errors';
import { preprocessTransactionsByDate, getIslemlerItemType, TransactionListItem } from '@/lib/transactionGrouping';
import { IslemWithRelations } from '@/types/database';
import { usePermissions } from '@/hooks/usePermissions';
import { useTransactionCreatorLabelResolver } from '@/hooks/useTransactionCreatorLabels';
import { isLeaveType } from '@/constants/islemTypes';
import { formatCurrency, getCrossCurrencyDisplay } from '@/lib/currency';
import { searchMatchesTr, upperTr } from '@/lib/turkishTextUtils';
import {
  clearIslemPhotoCopyOnWrite,
  getValidatedIslemPhotoPath,
  removeIslemPhotoBestEffort,
  replaceIslemPhotoCopyOnWrite,
} from '@/lib/islemPhotoLifecycle';
import {
  getTransactionProductMutationDecision,
  type TransactionProductMutationDecision,
} from '@/lib/transactionProductMutationGate';
import { getQuickTransactionScopeForApiType } from '@/lib/quickTransactionCreateScope';

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
    const name = `${islem.personel.first_name ?? ''} ${islem.personel.last_name ?? ''}`.trim();
    return name ? `→ ${name}` : null;
  }
  // Hesap bağlamından görünür olup kaynak Cari/Personel modülü kapalı olan
  // satırda yalnız salt-okunur ad gelir; gizli entity ID/relation üretilmez.
  if (islem.counterparty_name) return `→ ${islem.counterparty_name}`;
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
  t: (key: string) => string;
  deleteLabel: string;
  copyLabel: string;
  canOpen?: boolean;
  canDelete?: boolean;
  canCopy?: boolean;
  creatorText?: string | null;
  urunItems?: UrunKalemOzet[];
}

const IslemlerTransactionItem = memo(function IslemlerTransactionItem({
  islem,
  onPress,
  onDelete,
  onCopy,
  onPhotoPress,
  t,
  deleteLabel,
  copyLabel,
  canOpen = true,
  canDelete = true,
  canCopy = true,
  creatorText,
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
  // Display-only uppercase (stored isim/arama değişmez — arama ham islem.kategori.name kullanır)
  const kategoriName = islem.kategori?.name ? upperTr(islem.kategori.name) : null;
  const noteText = islem.description || null;
  // Cross-currency: ana satır HEDEF pb, alt satır KAYNAK pb (tek kural, tüm tipler).
  const xc = getCrossCurrencyDisplay(islem);

  return (
    <SwipeableRow
      itemKey={islem.id}
      onDelete={canDelete ? handleDelete : undefined}
      onCopy={canCopy ? handleCopy : undefined}
      enabled={canDelete || canCopy}
      deleteLabel={deleteLabel}
      copyLabel={copyLabel}
      flush
    >
      {/* Tarih satıra yazılmaz: bölüm başlığı pill'inde zaten var (yapışık liste dili) */}
      <TransactionRow
        id={islem.id}
        type={islem.type}
        amount={xc.mainAmount}
        date={formatTime(islem.date)}
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
        onPress={canOpen ? onPress : undefined}
        onPhotoPress={onPhotoPress}
      />
    </SwipeableRow>
  );
}, (prev, next) => {
  return prev.islem.id === next.islem.id
    && prev.islem.updated_at === next.islem.updated_at
    && prev.islem.photo_path === next.islem.photo_path
    && prev.islem.counterparty_kind === next.islem.counterparty_kind
    && prev.islem.counterparty_name === next.islem.counterparty_name
    && prev.canOpen === next.canOpen
    && prev.canDelete === next.canDelete
    && prev.canCopy === next.canCopy
    && prev.creatorText === next.creatorText
    && prev.urunItems === next.urunItems;
});

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function IslemlerPage() {
  const contentPaddingBottom = useContentBottomPadding({ search: true });
  const { t } = useTranslation(['transactions', 'common', 'errors']);
  const { formatDateMedium } = useDateFormat();
  const {
    canAccessModule,
    canUpdate,
    canDelete,
    canCreateTransactionType,
    isOwner,
  } = usePermissions();
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  // A2: arama alanının value'su searchQuery'ye (anlık) bağlı kalır; yalnız filtreleme/gruplama
  // debouncedSearch'ü kullanır → binlerce işlemde her tuşta tüm liste yeniden filtrelenmez.
  const debouncedSearch = useDebouncedValue(searchQuery, 250);
  const [showLongLoadingMessage, setShowLongLoadingMessage] = useState(false);
  // Edit mode state
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);
  const [productDetailIslemId, setProductDetailIslemId] = useState<string | null>(null);
  const [readOnlyTransactionId, setReadOnlyTransactionId] = useState<string | null>(null);
  // Copy mode state
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [showCopyBar, setShowCopyBar] = useState(false);
  // Photo viewer state
  const [viewPhotoPath, setViewPhotoPath] = useState<string | null>(null);
  const [viewPhotoIslemId, setViewPhotoIslemId] = useState<string | null>(null);
  const [isPhotoActionLoading, setIsPhotoActionLoading] = useState(false);

  const { isletme } = useAuthContext();
  const resolveCreatorLabel = useTransactionCreatorLabelResolver();
  const { data: islemler, isLoading, isFetching, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useIslemler(undefined, canAccessModule('islemler'));

  // Ürün detay modalının para birimi: satırın TransactionRow'a verdiği AYNI değer.
  const productDetailCurrency = productDetailIslemId
    ? getCrossCurrencyDisplay(((islemler || []).find((i) => i.id === productDetailIslemId) ?? { type: '', amount: 0 })).mainCurrency
    : undefined;
  const productDetailTransaction = productDetailIslemId
    ? (islemler || []).find((item) => item.id === productDetailIslemId)
    : undefined;
  const editTransaction = editTransactionId
    ? (islemler || []).find((item) => item.id === editTransactionId)
    : undefined;
  const readOnlyTransaction = readOnlyTransactionId
    ? (islemler || []).find((item) => item.id === readOnlyTransactionId)
    : undefined;
  // Ürün kalemleri (satırda önizleme) — tek batch sorgu, N+1 yok
  const islemIdList = useMemo(() => (islemler || []).map((i) => i.id), [islemler]);
  const {
    getUrunItems,
    getProductItemCount,
    isProductItemsResolved,
  } = useUrunKalemlerByIslemIds(
    islemIdList,
    true,
  );
  const productItemsSettled = isProductItemsResolved;
  const getMutationDecision = useCallback((
    transaction: IslemWithRelations | undefined,
    action: 'update' | 'delete',
  ): TransactionProductMutationDecision => {
    if (!transaction || transaction.isletme_id !== isletme?.id) {
      return {
        allowed: false,
        reason: 'transaction_denied',
        hasProductItems: null,
        useProductMutationV3: false,
      };
    }
    const createdBy = transaction.created_by ?? null;
    return getTransactionProductMutationDecision({
      type: transaction.type,
      productItemsResolved: isProductItemsResolved,
      productItemCount: getProductItemCount(transaction.id),
      isOwner,
      canAccessModule,
      canMutateTransaction:
        action === 'update'
          ? canUpdate('islemler', createdBy)
          : canDelete('islemler', createdBy),
      canMutateProduct:
        action === 'update'
          ? canUpdate('urunler', createdBy)
          : canDelete('urunler', createdBy),
    });
  }, [
    canAccessModule,
    canDelete,
    canUpdate,
    getProductItemCount,
    isOwner,
    isProductItemsResolved,
    isletme?.id,
  ]);
  const canMutateTransaction = useCallback(
    (transaction: IslemWithRelations | undefined): boolean =>
      getMutationDecision(transaction, 'update').allowed,
    [getMutationDecision],
  );
  const canUpdateProductTransaction =
    canMutateTransaction(productDetailTransaction);
  const canUpdateEditTransaction =
    canMutateTransaction(editTransaction);
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
    onCommitDelete: async (id: string, item: IslemWithRelations) => {
      const decision = getMutationDecision(item, 'delete');
      if (!decision.allowed) {
        throw new Error(t('common:errors.permissionDenied'));
      }
      const verifiedPhotoPath =
        item.isletme_id === isletme?.id
          ? getValidatedIslemPhotoPath(item.photo_path, isletme.id, item.id)
          : null;
      await deleteIslem.mutateAsync({
        id,
        useCariProductV3: decision.useProductMutationV3,
      });
      await removeIslemPhotoBestEffort(
        verifiedPhotoPath,
        (photoPath) => deletePhoto.mutateAsync(photoPath),
      );
    },
    onError: (error: unknown) => {
      const messageKey = getTransactionMutationMessageKey(error, 'delete');
      const message = messageKey
        ? t(messageKey)
        : toErrorMessage(error, t('transactions:messages.deleteFailed'));
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

  const filterChips = useMemo<FilterChipItem[]>(() => {
    const chips: FilterChipItem[] = [
      { key: 'all', label: t('transactions:filters.all'), icon: <ListFilter size={14} color={colors.textMuted} /> },
    ];
    if (canAccessModule('hesaplar')) {
      chips.push(
        { key: 'gelir', label: t('transactions:filters.income'), icon: <TrendingUp size={14} color={colors.success} /> },
        { key: 'gider', label: t('transactions:filters.expense'), icon: <TrendingDown size={14} color={colors.error} /> },
        { key: 'transfer', label: t('transactions:filters.transfer'), icon: <ArrowLeftRight size={14} color={colors.info} /> },
      );
    }
    if (canAccessModule('cariler')) {
      chips.push({ key: 'cari', label: t('transactions:filters.client'), icon: <Users size={14} color={colors.orange} /> });
    }
    if (canAccessModule('personel')) {
      chips.push(
        { key: 'personel', label: t('transactions:filters.personnel'), icon: <UserCheck size={14} color={colors.success} /> },
        { key: 'izin_hakki', label: t('transactions:filters.leaveEntitlement'), icon: <CalendarPlus size={14} color={colors.info} /> },
        { key: 'izin_kullanimi', label: t('transactions:filters.leaveUsage'), icon: <CalendarMinus size={14} color={colors.warning} /> },
      );
    }
    return chips;
  }, [canAccessModule, t]);

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
        searchMatchesTr(islem.description, debouncedSearch) ||
        searchMatchesTr(islem.hesap?.name, debouncedSearch) ||
        searchMatchesTr(islem.cari?.name, debouncedSearch) ||
        searchMatchesTr(islem.kategori?.name, debouncedSearch) ||
        searchMatchesTr(personelName, debouncedSearch) ||
        searchMatchesTr(islem.counterparty_name, debouncedSearch);

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
    if (!productItemsSettled) return;
    if ((getUrunItems(islemId)?.length ?? 0) > 0) {
      setProductDetailIslemId(islemId);
      return;
    }
    const transaction = (islemler || []).find((item) => item.id === islemId);
    if (canMutateTransaction(transaction)) {
      setEditTransactionId(islemId);
      setShowEditBar(true);
      return;
    }
    setReadOnlyTransactionId(islemId);
  }, [canMutateTransaction, getUrunItems, islemler, productItemsSettled]);

  // Swipe delete → undo snackbar (no Alert.alert)
  const handleDeleteIslem = useCallback((id: string, description: string) => {
    const islem = (islemler || []).find(i => i.id === id);
    if (islem && getMutationDecision(islem, 'delete').allowed) {
      requestDelete(id, islem, description);
    }
  }, [getMutationDecision, islemler, requestDelete]);

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
      const oldPhotoPath = getValidatedIslemPhotoPath(
        viewPhotoPath,
        isletme?.id,
        viewPhotoIslemId,
      );
      await clearIslemPhotoCopyOnWrite({
        oldPhotoPath,
        clearPhotoPointer: () => updateIslem.mutateAsync({
          id: viewPhotoIslemId,
          updates: { photo_path: null },
        }),
        removePhoto: (photoPath) => deletePhoto.mutateAsync(photoPath),
      });
      setViewPhotoPath(null);
      setViewPhotoIslemId(null);
    } catch (error) {
      console.error('[PhotoDelete] Error:', error);
      const messageKey = getTransactionMutationMessageKey(error, 'update');
      Alert.alert(
        t('common:status.error'),
        messageKey ? t(messageKey) : t('common:photo.uploadError'),
      );
    } finally {
      setIsPhotoActionLoading(false);
    }
  }, [viewPhotoPath, viewPhotoIslemId, isletme?.id, deletePhoto, updateIslem, t]);

  // Upload new photo (for change)
  const uploadNewPhoto = useCallback(async (uri: string) => {
    if (!viewPhotoIslemId || !isletme?.id) return;

    setIsPhotoActionLoading(true);
    try {
      const oldPhotoPath = getValidatedIslemPhotoPath(
        viewPhotoPath,
        isletme.id,
        viewPhotoIslemId,
      );
      const newPath = await replaceIslemPhotoCopyOnWrite({
        oldPhotoPath,
        uploadPhoto: () => uploadPhoto.mutateAsync({
          uri,
          isletmeId: isletme.id,
          islemId: viewPhotoIslemId,
        }),
        updatePhotoPointer: (photoPath) => updateIslem.mutateAsync({
          id: viewPhotoIslemId,
          updates: { photo_path: photoPath },
        }),
        removePhoto: (photoPath) => deletePhoto.mutateAsync(photoPath),
      });
      setViewPhotoPath(newPath);
    } catch (error) {
      console.error('[PhotoChange] Upload error:', error);
      const messageKey = getTransactionMutationMessageKey(error, 'update');
      Alert.alert(
        t('common:status.error'),
        messageKey ? t(messageKey) : t('common:photo.uploadError'),
      );
    } finally {
      setIsPhotoActionLoading(false);
    }
  }, [viewPhotoIslemId, viewPhotoPath, isletme?.id, deletePhoto, uploadPhoto, updateIslem, t]);

  // Photo change handler. `uploadNewPhoto` is a dependency because the selected
  // transaction/path may change while this screen stays mounted.
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
      ],
    );
  }, [takePhoto, pickImage, t, uploadNewPhoto]);

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
    const urunItems = getUrunItems(islem.id);
    const hasProducts = urunItems.length > 0;
    const canUpdateItem = getMutationDecision(islem, 'update').allowed;
    const canDeleteItem = getMutationDecision(islem, 'delete').allowed;
    const canCopyItem =
      canUpdateItem
      && canCreateTransactionType(
        islem.type,
        hasProducts ? ['urunler'] : [],
      );
    return (
      <IslemlerTransactionItem
        islem={islem}
        onPress={handlePressIslem}
        onDelete={handleDeleteIslem}
        onCopy={handleCopyIslem}
        onPhotoPress={handleViewPhoto}
        t={t}
        deleteLabel={deleteLabel}
        copyLabel={copyLabel}
        canOpen={productItemsSettled}
        canDelete={canDeleteItem}
        canCopy={canCopyItem}
        creatorText={resolveCreatorLabel(islem)}
        urunItems={urunItems}
      />
    );
  }, [handlePressIslem, handleDeleteIslem, handleCopyIslem, handleViewPhoto, t, deleteLabel, copyLabel, canCreateTransactionType, resolveCreatorLabel, getMutationDecision, getUrunItems, productItemsSettled]);

  const keyExtractor = useCallback((item: TransactionListItem) => item.key, []);

  // ============================================================================
  // FlatList Header (search + filter)
  // ============================================================================

  const ListHeader = useMemo(() => (
    <View>
      {/* Filtre Chips */}
      <View style={styles.filterContainer}>
        <FilterChips chips={filterChips} activeKey={filter} onChange={setFilter} />
      </View>
    </View>
  ), [filterChips, filter]);

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
    <Screen>
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
          // Alt boşluk TEK KAYNAKTAN: eski ifade (insets.bottom +
          // FLOATING_SEARCH_CLEARANCE) silindi — hook zaten ikisini de topluyor,
          // bırakılsaydı arama boşluğu İKİ KEZ eklenirdi (kovaladığımız çift
          // sayımın yeni kılığı).
          contentContainerStyle={[styles.flatListContent, { paddingBottom: contentPaddingBottom }]}
        />
      </SwipeableProvider>

      {/* Alta sabit yüzen arama çubuğu (Apple Notes tarzı) — geri-al snackbar'ı
          görünürken yukarı itilir: ikisi aynı taban çizgisinde duruyor ve zIndex'i
          büyük olan snackbar pill'i tamamen örtüyordu (arama "kayboldu" şikayeti).
          48 = snackbar'ın iç yüksekliği (paddingVertical spacing.md + satır). */}
      <FloatingSearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        bottomOffset={undoSnackbar.visible ? spacing.lg + 48 + spacing.sm : spacing.lg}
      />

      {/* Edit Transaction Bar */}
      <QuickTransactionBar
        visible={showEditBar && canUpdateEditTransaction}
        onDismiss={() => {
          setShowEditBar(false);
          setEditTransactionId(null);
        }}
        mode="edit"
        transactionId={editTransactionId ?? undefined}
        isScheduledTransaction={false}
        defaultHesapId={editTransaction?.hesap_id ?? undefined}
        defaultCariId={editTransaction?.cari_id ?? undefined}
        defaultCariType={editTransaction?.cari?.type}
        defaultPersonelId={editTransaction?.personel_id ?? undefined}
        createScope={
          editTransaction
            ? getQuickTransactionScopeForApiType(editTransaction.type)
              ?? undefined
            : undefined
        }
        onSuccess={() => {
          setShowEditBar(false);
          setEditTransactionId(null);
        }}
      />

      {/* Ürün Detay Modal — ürünlü işleme tıklanınca (cariler ile aynı standart) */}
      <ProductDetailModal
        islemId={productDetailIslemId}
        // Satırdaki TransactionRow ile AYNI para birimi (kutu ikonu ≠ satır çelişkisi)
        currency={productDetailCurrency}
        onDismiss={() => setProductDetailIslemId(null)}
        onEdit={
          canUpdateProductTransaction
            ? (islemId) => {
                setProductDetailIslemId(null);
                setEditTransactionId(islemId);
                setShowEditBar(true);
              }
            : undefined
        }
      />

      {/* Salt-okur / edit_own-başkasının ürünsüz satırı: görünür veri dar bir
          detay sheet'inde açılır; düzenle/sil/kopyala kontrolü bilerek yoktur. */}
      <Modal
        visible={!!readOnlyTransaction}
        transparent
        animationType="fade"
        onRequestClose={() => setReadOnlyTransactionId(null)}
      >
        <View style={styles.readOnlyModalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setReadOnlyTransactionId(null)}
            accessibilityRole="button"
            accessibilityLabel={t('common:buttons.close')}
          />
          {readOnlyTransaction ? (() => {
            const display = getCrossCurrencyDisplay(readOnlyTransaction);
            const entity = getIslemEntity(readOnlyTransaction);
            const creator = resolveCreatorLabel(readOnlyTransaction);
            return (
              <View style={styles.readOnlySheet}>
                <View style={styles.readOnlyHeader}>
                  <Text variant="h3">
                    {t('transactions:titles.transactionDetails')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setReadOnlyTransactionId(null)}
                    hitSlop={12}
                    style={styles.readOnlyCloseButton}
                  >
                    <X size={22} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <View style={styles.readOnlyAmountBlock}>
                  <Text variant="caption" color="secondary">
                    {t(`transactions:types.${readOnlyTransaction.type}`)}
                  </Text>
                  <Text variant="h2">
                    {isLeaveType(readOnlyTransaction.type)
                      ? t('staff:leave.dayCount', {
                          count: readOnlyTransaction.amount,
                        })
                      : formatCurrency(
                          display.mainAmount,
                          display.mainCurrency,
                        )}
                  </Text>
                  {display.subText ? (
                    <Text variant="caption" color="secondary">
                      {display.subText}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.readOnlyDetails}>
                  <View style={styles.readOnlyDetailRow}>
                    <Text variant="caption" color="secondary">
                      {t('common:labels.date')}
                    </Text>
                    <Text variant="body">
                      {`${formatDateMedium(readOnlyTransaction.date)} · ${formatTime(readOnlyTransaction.date)}`}
                    </Text>
                  </View>
                  {entity ? (
                    <View style={styles.readOnlyDetailRow}>
                      <Text variant="caption" color="secondary">
                        {t('common:labels.details')}
                      </Text>
                      <Text variant="body" style={styles.readOnlyDetailValue}>
                        {entity}
                      </Text>
                    </View>
                  ) : null}
                  {readOnlyTransaction.kategori?.name ? (
                    <View style={styles.readOnlyDetailRow}>
                      <Text variant="caption" color="secondary">
                        {t('common:labels.category')}
                      </Text>
                      <Text variant="body" style={styles.readOnlyDetailValue}>
                        {upperTr(readOnlyTransaction.kategori.name)}
                      </Text>
                    </View>
                  ) : null}
                  {readOnlyTransaction.description ? (
                    <View style={styles.readOnlyDetailRow}>
                      <Text variant="caption" color="secondary">
                        {t('common:labels.description')}
                      </Text>
                      <Text variant="body" style={styles.readOnlyDetailValue}>
                        {readOnlyTransaction.description}
                      </Text>
                    </View>
                  ) : null}
                  {creator ? (
                    <View style={styles.readOnlyDetailRow}>
                      <Text variant="caption" color="secondary">
                        {t('transactions:creatorLabel.title')}
                      </Text>
                      <Text variant="body" style={styles.readOnlyDetailValue}>
                        {creator}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })() : null}
        </View>
      </Modal>

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
        onDelete={
          viewPhotoIslemId
          && canMutateTransaction(
            (islemler || []).find((item) => item.id === viewPhotoIslemId),
          )
            ? handleDeletePhoto
            : undefined
        }
        onChange={
          viewPhotoIslemId
          && canMutateTransaction(
            (islemler || []).find((item) => item.id === viewPhotoIslemId),
          )
            ? handleChangePhoto
            : undefined
        }
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
    </Screen>
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
    // paddingBottom BURADA DEĞİL: useContentBottomPadding({ search: true })
    // ile inline veriliyor. Burada da bırakılsaydı üstü örtülen ölü bir değer
    // olurdu ve ileride "iki yerde iki farklı alt boşluk" karışıklığı doğardı.
  },
  filterContainer: {
    paddingTop: spacing.lg,
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
  readOnlyModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  readOnlySheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing['2xl'],
    gap: spacing.lg,
  },
  readOnlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readOnlyCloseButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.background,
  },
  readOnlyAmountBlock: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  readOnlyDetails: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  readOnlyDetailRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  readOnlyDetailValue: {
    flex: 1,
    textAlign: 'right',
  },
});
