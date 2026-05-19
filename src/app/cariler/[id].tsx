import { useState, useCallback, useMemo, useEffect, memo } from 'react';
import { View, StyleSheet, FlatList, Alert, TouchableOpacity, Modal, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  User,
  Phone,
  CircleDollarSign,
  Pencil,
  Trash2,
  Zap,
  MoreVertical,
  FileCheck,
  X,
  Share2,
  Unlink,
  Package,
  BarChart3,
  Eye,
  ShieldCheck,
  Info,
} from 'lucide-react-native';
import { BackButton } from '@/components/ui/BackButton';
import { Text, Card, Button, EmptyState, ArchivedBanner, type BalanceDirection } from '@/components/ui';
import { IleriTarihliIslemlerSection } from '@/components/ui/IleriTarihliIslemlerSection';
import { BalanceEditorModal, DetailExportSection, DetailActionMenu } from '@/components/detail';
import { TransactionRow, DateSectionHeader } from '@/components/ui/TransactionRow';
import { SwipeableRow, SwipeableProvider } from '@/components/ui/SwipeableRow';
import { UndoSnackbar } from '@/components/ui/UndoSnackbar';
import { BekleyenCeklerSection, CekKesSheet } from '@/components/cek';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { PhotoViewerModal } from '@/components/transaction/PhotoViewerModal';
import { AddNoteButton } from '@/components/notes/AddNoteButton';
import { NoteRow } from '@/components/notes/NoteRow';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '@/constants/spacing';
import { formatCurrency, toNumber, calculateTargetAmount } from '@/lib/currency';
import { useDateFormat } from '@/hooks/useDateFormat';
import { preprocessTransactionsByDate, mergeNotesIntoGroupedData, TransactionListItem } from '@/lib/transactionGrouping';
import { useNotlarByEntity } from '@/hooks/useNotlar';
import { useDetailNoteHandlers } from '@/hooks/useDetailNoteHandlers';
import { NoteInputModal } from '@/components/notes/NoteInputModal';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { useCari, useDeleteCari, useUpdateCari } from '@/hooks/useCariler';
import { useUnarchiveCari } from '@/hooks/useArchive';
import { useIslemlerByCari, useDeleteIslem } from '@/hooks/useIslemler';
import { useIslemlerWithUrunByCari, useUrunHareketlerByIslemId } from '@/hooks/useUrunHareketler';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { useIleriTarihliIslemlerByCari } from '@/hooks/useIleriTarihliIslemler';
import { useCeklerByCari } from '@/hooks/useCekler';
import { IslemWithRelations, IslemType, Not } from '@/types/database';
import { useCariLinkStatus, useRemoveCariLink } from '@/hooks/useCariSharing';
import { ShareCodeModal } from '@/components/cariSharing/ShareCodeModal';
import { LinkedCariBadge } from '@/components/cariSharing/LinkedCariBadge';
import { toErrorMessage, isLinkedRecordsError } from '@/lib/errors';
import { getEntityPerspectiveColor, getEntityPerspectivePrefix } from '@/lib/transactionColors';
import { invertCariTransactionType, hasTypeMismatch, shouldInvertTransaction } from '@/lib/cariTransactionMapper';
import { usePermissions } from '@/hooks/usePermissions';
import { useHaptics } from '@/hooks/useHaptics';
import { useAuthContext } from '@/contexts/AuthContext';

// ============================================================================
// MEMOIZED TRANSACTION ITEM COMPONENT
// ============================================================================

interface CariTransactionItemProps {
  islem: IslemWithRelations;
  displayType?: string;
  hideHesap?: boolean;
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
  onPhotoPress?: (id: string) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
  hasUrunFn: (id: string) => boolean;
  getUrunCountFn: (id: string) => number;
  formatDateSmart: (date: string) => string;
  t: (key: string) => string;
  deleteLabel: string;
  copyLabel: string;
  currency?: string;
  canEdit?: boolean;
  currentUserId?: string;
  otherPartyName?: string | null;
}

function getCreatorName(islem: IslemWithRelations): string | null {
  if (!islem.creator) return null;
  return islem.creator.display_name || islem.creator.email || null;
}

function getCariHareketLabelKey(type: string): string {
  switch (type) {
    case 'cari_alis': return 'clients:transactionLabels.alis';
    case 'cari_odeme': return 'clients:transactionLabels.odeme';
    case 'cari_satis': return 'clients:transactionLabels.satis';
    case 'cari_tahsilat': return 'clients:transactionLabels.tahsilat';
    case 'cari_alis_iade': return 'clients:transactionLabels.alisIade';
    case 'cari_satis_iade': return 'clients:transactionLabels.satisIade';
    default: return '';
  }
}

/**
 * Cross-currency işlemlerde cari tarafındaki tutarı hesaplar.
 * Ödeme/tahsilat işlemlerinde exchange_rate varsa dönüştürülmüş tutarı döner.
 * Alış/satış işlemlerinde (fatura) dönüşüm yapılmaz, amount direkt kullanılır.
 */
function getCariDisplayAmount(islem: IslemWithRelations): number {
  const amount = toNumber(islem.amount);
  const sourceCurrency = islem.source_currency;
  const targetCurrency = islem.target_currency;
  const exchangeRate = islem.exchange_rate;

  // Cross-currency ödeme/tahsilat: kur ile dönüştür
  if (sourceCurrency && targetCurrency && sourceCurrency !== targetCurrency && exchangeRate) {
    try {
      return calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);
    } catch {
      return amount;
    }
  }

  return amount;
}

function getCariSubAmount(islem: IslemWithRelations): string | null {
  if (islem.source_currency && islem.target_currency && islem.source_currency !== islem.target_currency && islem.exchange_rate) {
    return formatCurrency(toNumber(islem.amount), islem.source_currency);
  }
  return null;
}

const CariTransactionItem = memo(function CariTransactionItem({
  islem,
  displayType,
  hideHesap,
  onPress,
  onLongPress,
  onPhotoPress,
  onDelete,
  onCopy,
  hasUrunFn,
  getUrunCountFn,
  formatDateSmart,
  t,
  deleteLabel,
  copyLabel,
  currency,
  canEdit = true,
  currentUserId,
  otherPartyName,
}: CariTransactionItemProps) {
  const handleDelete = useCallback(() => onDelete(islem.id), [onDelete, islem.id]);
  const handleCopy = useCallback(() => onCopy(islem.id), [onCopy, islem.id]);

  const effectiveType = (displayType || islem.type) as IslemType;
  const labelKey = getCariHareketLabelKey(effectiveType);
  const typeLabel = labelKey ? t(labelKey) : effectiveType;

  // Ödeme/tahsilat işlemlerinde hangi hesaba yapıldığını göster (ok ile yön belirt)
  // hideHesap: viewer karşı tarafın hesap bilgisini görmemeli
  const entityText = hideHesap
    ? null
    : (effectiveType === 'cari_odeme' || effectiveType === 'cari_tahsilat')
      ? islem.hesap?.name
        ? `${effectiveType === 'cari_odeme' ? '→' : '←'} ${islem.hesap.name}`
        : null
      : null;
  // Linked cari: karşı tarafın işletme adını göster, yoksa multi-user creator adını göster
  const creatorText = otherPartyName
    || ((islem.created_by && islem.created_by !== currentUserId) ? getCreatorName(islem) : null);

  return (
    <SwipeableRow
      onDelete={canEdit ? handleDelete : undefined}
      onCopy={canEdit ? handleCopy : undefined}
      enabled={canEdit}
      deleteLabel={deleteLabel}
      copyLabel={copyLabel}
    >
      <TransactionRow
        id={islem.id}
        type={effectiveType}
        amount={getCariDisplayAmount(islem)}
        date={formatDateSmart(islem.date)}
        typeLabel={typeLabel}
        entityText={entityText}
        secondaryText={islem.kategori?.name || null}
        tertiaryText={islem.description || null}
        creatorText={creatorText}
        hasPhoto={!!islem.photo_path}
        hasUrunler={hasUrunFn(islem.id)}
        urunCount={getUrunCountFn(islem.id)}
        currency={currency}
        subAmount={getCariSubAmount(islem)}
        overrideColor={getEntityPerspectiveColor(effectiveType)}
        overridePrefix={getEntityPerspectivePrefix(effectiveType)}
        onPress={onPress}
        onLongPress={onLongPress}
        onPhotoPress={onPhotoPress}
      />
    </SwipeableRow>
  );
}, (prev, next) => {
  return prev.islem.id === next.islem.id
    && prev.islem.updated_at === next.islem.updated_at
    && prev.canEdit === next.canEdit
    && prev.currentUserId === next.currentUserId
    && prev.displayType === next.displayType
    && prev.hideHesap === next.hideHesap
    && prev.otherPartyName === next.otherPartyName;
});

// ============================================================================
// PRODUCT DETAIL MODAL
// ============================================================================

function ProductDetailModal({
  islemId,
  onDismiss,
  onEdit,
  t,
}: {
  islemId: string | null;
  onDismiss: () => void;
  onEdit: (islemId: string) => void;
  t: (key: string) => string;
}) {
  const { data: urunHareketler, isLoading } = useUrunHareketlerByIslemId(islemId || undefined);
  const windowHeight = Dimensions.get('window').height;

  if (!islemId) return null;

  return (
    <Modal
      visible={!!islemId}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={productDetailStyles.overlay}>
        <TouchableOpacity
          style={productDetailStyles.overlayBackdrop}
          activeOpacity={1}
          onPress={onDismiss}
        />
        <View
          style={[productDetailStyles.content, { maxHeight: windowHeight * 0.75 }]}
        >
          <View style={productDetailStyles.header}>
            <Text variant="h3">{t('clients:productDetail.title')}</Text>
            <TouchableOpacity onPress={onDismiss}>
              <X size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={productDetailStyles.loading}>
              <Text variant="body" color="secondary">{t('common:status.loading')}</Text>
            </View>
          ) : !urunHareketler || urunHareketler.length === 0 ? (
            <View style={productDetailStyles.loading}>
              <Text variant="body" color="secondary">{t('clients:productDetail.noProducts')}</Text>
            </View>
          ) : (
            <ScrollView
              style={productDetailStyles.list}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              bounces={true}
            >
              {urunHareketler.map((hareket) => {
                const subtotal = Math.abs(hareket.miktar) * (hareket.birim_fiyat || 0);
                const kdvAmount = subtotal * ((hareket.kdv_orani || 0) / 100);
                const total = subtotal + kdvAmount;
                return (
                  <View key={hareket.id} style={productDetailStyles.item}>
                    <View style={productDetailStyles.itemHeader}>
                      <Package size={16} color={colors.primary} />
                      <Text variant="body" style={productDetailStyles.itemName} numberOfLines={2}>
                        {hareket.urunler?.ad || '-'}
                      </Text>
                    </View>
                    <View style={productDetailStyles.itemDetails}>
                      <Text variant="caption" color="secondary">
                        {Math.abs(hareket.miktar)} {hareket.urunler?.birim || 'adet'} x {formatCurrency(hareket.birim_fiyat || 0)}
                      </Text>
                      {(hareket.kdv_orani ?? 0) > 0 && (
                        <Text variant="caption" color="secondary">
                          {t('common:tax.vat')} %{hareket.kdv_orani}: {formatCurrency(kdvAmount)}
                        </Text>
                      )}
                      <Text variant="body" color="primary" style={productDetailStyles.itemTotal}>
                        {formatCurrency(total)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={productDetailStyles.footer}>
            <Button
              variant="secondary"
              size="md"
              onPress={() => onEdit(islemId)}
              style={{ flex: 1 }}
            >
              {t('common:buttons.edit')}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const productDetailStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  overlayBackdrop: {
    flex: 1,
  },
  content: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  loading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  list: {
    marginBottom: spacing.md,
  },
  item: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  itemName: {
    flex: 1,
    fontWeight: fontWeight.medium as '500',
  },
  itemDetails: {
    paddingLeft: spacing.lg + spacing.sm,
  },
  itemTotal: {
    fontWeight: fontWeight.semibold as '600',
    marginTop: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function CariHareketleriPage() {
  const { id, expandIslemId } = useLocalSearchParams<{ id: string; expandIslemId?: string }>();
  const router = useRouter();
  const { t } = useTranslation(['clients', 'common', 'errors', 'checks']);
  const { formatDateSmart, formatDateShort } = useDateFormat();
  const { currency: baseCurrency } = useSettings();
  const insets = useSafeAreaInsets();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;

  const { data: cari, isLoading: cariLoading, refetch: refetchCari } = useCari(id!);
  const { data: islemler, isLoading: islemlerLoading, hasNextPage, fetchNextPage, isFetchingNextPage, refetch: refetchIslemler } = useIslemlerByCari(id!);
  const { data: ileriTarihliIslemler, isLoading: ileriTarihliLoading } = useIleriTarihliIslemlerByCari(id!);
  const { data: bekleyenCekler, isLoading: ceklerLoading } = useCeklerByCari(id!);
  const { data: entityNotes } = useNotlarByEntity('cari', id!);
  const { data: linkStatus } = useCariLinkStatus(id);
  const { canUpdate, canDelete } = usePermissions();
  const { user, isletme } = useAuthContext();
  const haptics = useHaptics();
  const {
    editingNoteId, setEditingNoteId, editingNote,
    handleNoteUpdate, handleNoteDelete, handleToggleNoteCompletion, handleMarkAsTask,
    isUpdatingNote,
  } = useDetailNoteHandlers({ entityType: 'cari', entityId: id!, entityNotes, isletmeId: isletme?.id });

  // Viewer olarak baglantili mi ve izin seviyesi nedir
  const isViewer = linkStatus?.is_linked && !linkStatus.is_owner;
  const isViewerViewOnly = isViewer && linkStatus?.permission === 'view';
  const canEditTransactions = !isViewer || linkStatus?.permission === 'full';

  // BUG 4: Viewer perspektifinden cari tipi (viewer_type kullan)
  const effectiveType = isViewer && linkStatus?.link?.viewer_type
    ? linkStatus.link.viewer_type
    : cari?.type;

  // Baglantili cari tip uyumsuzlugu: owner ve viewer farkli tip secmisse inversion gerekebilir
  const typeMismatch = hasTypeMismatch(cari?.type, linkStatus?.link?.viewer_type);
  // Bakiye her zaman owner perspektifinde saklanir; viewer icin negate edilir
  const shouldInvertBalance = !!isViewer && typeMismatch;

  // İşlemlerin ürünlü olup olmadığını kontrol et - cari bazlı sorgu ile ilk yüklemede de hızlı
  const { hasUrun, getUrunCount } = useIslemlerWithUrunByCari(id);
  const deleteIslem = useDeleteIslem();
  const deleteCari = useDeleteCari();
  const updateCari = useUpdateCari();
  const unarchiveCari = useUnarchiveCari();
  const removeCariLink = useRemoveCariLink();

  const [quickBarVisible, setQuickBarVisible] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showCekKesSheet, setShowCekKesSheet] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [showShareCodeModal, setShowShareCodeModal] = useState(false);
  const [editBalanceModalVisible, setEditBalanceModalVisible] = useState(false);
  const [newInitialBalance, setNewInitialBalance] = useState('');
  const [balanceDirection, setBalanceDirection] = useState<BalanceDirection>('debt');
  // Edit transaction state
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);
  // Copy transaction state
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [showCopyBar, setShowCopyBar] = useState(false);
  // Product detail modal state
  const [productDetailIslemId, setProductDetailIslemId] = useState<string | null>(null);
  // Photo viewer state
  const [photoViewerIslemId, setPhotoViewerIslemId] = useState<string | null>(null);
  const [notePhotoPath, setNotePhotoPath] = useState<string | null>(null);
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
      const message = error instanceof Error ? toErrorMessage(error) : t('errors:transaction.deleteFailed');
      Alert.alert(t('common:status.error'), message);
    },
  });

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    haptics.medium();
    setRefreshing(true);
    try {
      await Promise.all([refetchCari(), refetchIslemler()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchCari, refetchIslemler, haptics]);

  // Ürün detay sayfasından gelen expandIslemId parametresini işle
  const [expandHandled, setExpandHandled] = useState(false);
  useEffect(() => {
    if (expandIslemId && !expandHandled && islemler && islemler.length > 0) {
      setEditTransactionId(expandIslemId);
      setShowEditBar(true);
      setExpandHandled(true);
    }
  }, [expandIslemId, expandHandled, islemler]);

  // Başlangıç bakiyesini hesapla - MEMOIZED
  // Cross-currency işlemlerde cari tarafındaki dönüştürülmüş tutarı kullanır
  // Per-transaction inversion: karsi tarafin olusturdugu islemler ters cevrilir
  const initialBalance = useMemo(() => {
    if (!cari || !islemler) return 0;

    let totalEffect = 0;
    islemler.forEach((islem) => {
      const amount = getCariDisplayAmount(islem);
      const needsInvert = shouldInvertTransaction(islem.isletme_id, isletme?.id, typeMismatch);
      const type = needsInvert
        ? invertCariTransactionType(islem.type as IslemType)
        : islem.type;
      if (type === 'cari_alis') {
        totalEffect -= amount;
      } else if (type === 'cari_odeme') {
        totalEffect += amount;
      } else if (type === 'cari_satis') {
        totalEffect += amount;
      } else if (type === 'cari_tahsilat') {
        totalEffect -= amount;
      } else if (type === 'cari_alis_iade') {
        totalEffect += amount;
      } else if (type === 'cari_satis_iade') {
        totalEffect -= amount;
      }
    });

    // Viewer perspektifinde bakiye ters cevrilerek gosterilir
    const effectiveBalance = shouldInvertBalance ? -toNumber(cari.balance) : toNumber(cari.balance);
    return effectiveBalance - totalEffect;
  }, [cari, islemler, isletme?.id, typeMismatch, shouldInvertBalance]);

  // Başlangıç bakiyesi düzenleme
  const handleOpenEditBalance = useCallback(() => {
    // Mevcut yönü belirle: pozitif = debt (bize borçlu), negatif = credit (biz borçluyuz)
    setBalanceDirection(initialBalance >= 0 ? 'debt' : 'credit');
    setNewInitialBalance(Math.abs(initialBalance).toString());
    setEditBalanceModalVisible(true);
  }, [initialBalance]);

  const handleSaveInitialBalance = () => {
    const absoluteAmount = parseFloat(newInitialBalance.replace(',', '.')) || 0;
    // Yöne göre işareti uygula: debt = pozitif, credit = negatif
    const newInitial = balanceDirection === 'debt' ? absoluteAmount : -absoluteAmount;

    Alert.alert(
      t('clients:balance.confirmTitle'),
      t('clients:balance.confirmMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.confirm'),
          onPress: async () => {
            try {
              if (!cari) return;
              const transactionEffect = Number(cari.balance) - initialBalance;
              const newCariBalance = newInitial + transactionEffect;

              await updateCari.mutateAsync({
                id: cari.id,
                balance: newCariBalance,
              });

              setEditBalanceModalVisible(false);
              refetchCari();
            } catch (error) {
              Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:general.tryAgain'));
            }
          },
        },
      ]
    );
  };

  // === MEMOIZED HANDLERS for FlatList items ===
  const handlePressIslem = useCallback((islemId: string) => {
    const islem = (islemler || []).find(i => i.id === islemId);
    if (!islem) return;

    if (hasUrun(islemId)) {
      setProductDetailIslemId(islemId);
      return;
    }

    // Karşı tarafın işlemi → düzenlenemez, bir şey yapma
    if (islem.isletme_id !== isletme?.id) return;

    setEditTransactionId(islemId);
    setShowEditBar(true);
  }, [hasUrun, islemler, isletme?.id]);

  // Fotoğraf ikonuna basıldığında fotoğraf viewer aç
  const handlePressPhoto = useCallback((islemId: string) => {
    setPhotoViewerIslemId(islemId);
  }, []);

  const handleDeleteIslem = useCallback((islemId: string) => {
    const islem = (islemler || []).find(i => i.id === islemId);
    if (islem) {
      const desc = islem.description || t(`clients:transactionLabels.${islem.type.replace('cari_', '')}`) || islem.type;
      requestDelete(islemId, islem, desc);
    }
  }, [islemler, requestDelete, t]);

  const handleLongPressIslem = useCallback((islemId: string) => {
    setEditTransactionId(islemId);
    setShowEditBar(true);
  }, []);

  const handleCopyIslem = useCallback((islemId: string) => {
    setCopySourceId(islemId);
    setShowCopyBar(true);
  }, []);

  const handleDeleteCari = () => {
    setShowMenu(false);
    Alert.alert(
      t('clients:deleteConfirm.clientTitle'),
      t('clients:deleteConfirm.clientMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCari.mutateAsync(id!);
              router.replace('/(tabs)/cariler');
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
  };

  const handleUnarchive = useCallback(async () => {
    try {
      await unarchiveCari.mutateAsync(id!);
      Alert.alert(t('common:status.success'), t('common:archive.messages.unarchiveSuccess'));
      router.back();
    } catch (error) {
      Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
    }
  }, [unarchiveCari, id, t, router]);

  // BUG 3: Owner icin baglantiy kaldirma handler'i
  const handleUnlink = useCallback(() => {
    if (!linkStatus?.link?.id) return;
    setShowMenu(false);
    Alert.alert(
      t('clients:sharing.removeLinkConfirmTitle'),
      t('clients:sharing.removeLinkConfirmMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('clients:sharing.removeLinkConfirmButton'),
          style: 'destructive',
          onPress: async () => {
            try {
              await removeCariLink.mutateAsync({ link_id: linkStatus.link!.id });
            } catch {
              Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
            }
          },
        },
      ]
    );
  }, [linkStatus, removeCariLink, t]);

  // Header right buttons - viewer'lar icin share ve menu gizle
  const headerRightElement = useMemo(() => (
    <View style={styles.headerRightContainer}>
      <TouchableOpacity
        onPress={() => router.push({ pathname: '/raporlar/cari', params: { cariId: id } })}
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
      {!isViewer && (
        <TouchableOpacity
          onPress={() => setShowMenu(true)}
          style={styles.headerBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MoreVertical size={24} color={colors.text} />
        </TouchableOpacity>
      )}
    </View>
  ), [isViewer, id, router]);

  // === DATE GROUPING ===
  const groupedData = useMemo(() => {
    if (!islemler) return [];
    const filtered = islemler.filter(i => !pendingDeleteIds.has(i.id));
    const txnData = preprocessTransactionsByDate(
      filtered,
      t('common:date.today'),
      t('common:date.yesterday'),
      formatDateSmart,
    );
    return mergeNotesIntoGroupedData(
      txnData,
      entityNotes ?? [],
      t('common:date.today'),
      t('common:date.yesterday'),
      formatDateSmart,
    );
  }, [islemler, pendingDeleteIds, t, formatDateSmart, entityNotes]);

  // === FlatList renderItem ===
  const deleteLabel = t('common:buttons.delete');
  const copyLabel = t('common:buttons.copy');

  // Linked cari: karşı tarafın işletme adını belirle
  const otherPartyIsletmeName = useMemo(() => {
    if (!linkStatus?.is_linked || !linkStatus.link) return null;
    // A (owner) bakıyorsa → B'nin (viewer) isletme adı
    // B (viewer) bakıyorsa → A'nın (owner) isletme adı
    if (linkStatus.is_owner) {
      return linkStatus.link.viewer_isletme?.name || null;
    } else {
      return linkStatus.link.owner_isletme?.name || null;
    }
  }, [linkStatus]);

  const renderTransactionItem = useCallback(({ item }: { item: TransactionListItem }) => {
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
            onPhotoPress={setNotePhotoPath}
          />
        </SwipeableRow>
      );
    }
    const islem = item.data;
    const canEditItem = canEditTransactions && canDelete('islemler', islem.created_by ?? null);
    // Per-transaction inversion: karsi tarafin olusturdugu islemlerin tipi ters cevrilir
    const needsInvert = shouldInvertTransaction(islem.isletme_id, isletme?.id, typeMismatch);
    const itemDisplayType = needsInvert
      ? invertCariTransactionType(islem.type as IslemType)
      : islem.type;
    // Karsi tarafin odeme/tahsilat hesap bilgisini gizle (farklı isletme)
    const isOtherPartyTransaction = islem.isletme_id !== isletme?.id;
    const isPaymentType = islem.type === 'cari_odeme' || islem.type === 'cari_tahsilat';
    const itemHideHesap = isOtherPartyTransaction && isPaymentType;
    // Karşı tarafın işlemi ise işletme adını göster
    const itemOtherPartyName = isOtherPartyTransaction ? otherPartyIsletmeName : null;
    return (
      <CariTransactionItem
        islem={islem}
        displayType={itemDisplayType}
        hideHesap={itemHideHesap}
        onPress={handlePressIslem}
        onLongPress={handleLongPressIslem}
        onPhotoPress={handlePressPhoto}
        onDelete={handleDeleteIslem}
        onCopy={handleCopyIslem}
        hasUrunFn={hasUrun}
        getUrunCountFn={getUrunCount}
        formatDateSmart={formatDateSmart}
        t={t}
        deleteLabel={deleteLabel}
        copyLabel={copyLabel}
        currency={cari?.currency}
        canEdit={canEditItem}
        currentUserId={user?.id}
        otherPartyName={itemOtherPartyName}
      />
    );
  }, [handlePressIslem, handleLongPressIslem, handlePressPhoto, handleDeleteIslem, handleCopyIslem, handleNoteDelete, handleToggleNoteCompletion, handleMarkAsTask, hasUrun, getUrunCount, formatDateSmart, t, deleteLabel, copyLabel, cari?.currency, canEditTransactions, canDelete, user?.id, isletme?.id, typeMismatch, otherPartyIsletmeName]);

  const keyExtractor = useCallback((item: TransactionListItem) => item.key, []);

  // === FlatList ListHeaderComponent ===
  const ListHeader = useMemo(() => {
    if (!cari) return null;
    // BUG 4: Viewer perspektifinden cari tipi kullan
    const isTedarikci = effectiveType === 'tedarikci';
    // Viewer perspektifinde bakiye ters cevrilerek gosterilir
    const displayBalance = shouldInvertBalance ? -Number(cari.balance) : Number(cari.balance);

    return (
      <View>
        {/* Cari Özeti */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryIcon, { backgroundColor: isTedarikci ? colors.warningLight : colors.infoLight }]}>
              {isTedarikci ? (
                <Building2 size={32} color={colors.warning} />
              ) : (
                <User size={32} color={colors.info} />
              )}
            </View>
            <View style={styles.summaryInfo}>
              <Text variant="body" color="secondary">
                {isTedarikci ? t('clients:types.tedarikci') : t('clients:types.musteri')}
              </Text>
              {cari.phone && (
                <View style={styles.phoneRow}>
                  <Phone size={14} color={colors.textMuted} />
                  <Text variant="caption" color="secondary">
                    {cari.phone}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.balanceInfo}>
              <Text variant="caption" color="secondary">
                {displayBalance < 0 ? t('clients:balance.weOwe') : t('clients:balance.theyOwe')}
              </Text>
              <Text variant="h2" color={displayBalance < 0 ? 'error' : 'success'}>
                {formatCurrency(Math.abs(displayBalance), cari.currency)}
              </Text>
              {cari.currency !== baseCurrency && exchangeRates && displayBalance !== 0 && (
                <Text variant="caption" color="secondary">
                  ~{formatCurrency(convertCurrency(Math.abs(displayBalance), cari.currency, baseCurrency, exchangeRates) ?? 0, baseCurrency)}
                </Text>
              )}
            </View>
          </View>
        </Card>

        {/* Bağlantı Durumu */}
        {linkStatus?.is_linked && linkStatus.link?.owner_isletme?.name && (
          <View style={styles.linkedBadgeContainer}>
            <LinkedCariBadge
              ownerIsletmeName={linkStatus.link.owner_isletme.name}
              permission={linkStatus.permission ?? 'view'}
              variant="card"
            />
          </View>
        )}

        {/* Paylaşım İzin Modu Banner */}
        {isViewer && (
          <View style={styles.permissionBanner}>
            {isViewerViewOnly ? (
              <>
                <Eye size={16} color={colors.warning} />
                <Text variant="caption" style={{ color: colors.warning, flex: 1 }}>
                  {t('clients:sharing.viewOnlyBanner')}
                </Text>
              </>
            ) : (
              <>
                <ShieldCheck size={16} color={colors.success} />
                <Text variant="caption" style={{ color: colors.success, flex: 1 }}>
                  {t('clients:sharing.fullAccessBanner')}
                </Text>
              </>
            )}
          </View>
        )}
        {/* Paylaşılan cari bilgi notu */}
        {isViewer && (
          <View style={styles.permissionBanner}>
            <Info size={16} color={colors.info} />
            <Text variant="caption" style={{ color: colors.textMuted, flex: 1 }}>
              {t('clients:sharing.sharedCariNote')}
            </Text>
          </View>
        )}

        {/* Arşiv Banner */}
        {cari.is_archived && (
          <View style={styles.bannerContainer}>
            <ArchivedBanner
              onUnarchive={handleUnarchive}
              loading={unarchiveCari.isPending}
            />
          </View>
        )}

        {/* Aksiyon Butonlari - Çek Kes only for tedarikci */}
        {!cari.is_archived && !(isViewerViewOnly) && effectiveType === 'tedarikci' && (
          <View style={styles.actionButtons}>
            <Button
              variant="outline"
              size="md"
              icon={<FileCheck size={18} color={colors.info} />}
              onPress={() => setShowCekKesSheet(true)}
              style={[styles.actionBtn, { borderColor: colors.info }]}
            >
              {t('checks:create')}
            </Button>
          </View>
        )}

        {/* İleri Tarihli İşlemler ve Hareketler */}
        <View style={styles.section}>
          <IleriTarihliIslemlerSection
            ileriTarihliIslemler={ileriTarihliIslemler}
            isLoading={ileriTarihliLoading}
          />

          {effectiveType === 'tedarikci' && (
            <BekleyenCeklerSection
              cekler={bekleyenCekler}
              isLoading={ceklerLoading}
            />
          )}

          <Text variant="h3" style={styles.sectionTitle}>
            {t('clients:details.transactions')}
          </Text>

          {islemlerLoading && (
            <Text color="secondary">{t('common:status.loading')}</Text>
          )}
        </View>
      </View>
    );
  }, [cari, effectiveType, shouldInvertBalance, ileriTarihliIslemler, ileriTarihliLoading, bekleyenCekler, ceklerLoading, islemlerLoading, baseCurrency, exchangeRates, t, handleUnarchive, unarchiveCari.isPending, linkStatus, isViewerViewOnly, isViewer]);

  // === FlatList ListFooterComponent ===
  const ListFooter = useMemo(() => {
    if (!cari || islemlerLoading) return null;
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
              <CircleDollarSign size={22} color={colors.primary} />
            </View>
            <View style={styles.hareketInfo}>
              <Text variant="body">{t('clients:details.initialBalance')}</Text>
              <Text variant="caption" color="secondary">
                {t('clients:details.cariOpening')} • {formatDateShort(cari.created_at)}
              </Text>
            </View>
            <View style={styles.initialBalanceRow}>
              <Text variant="h3" color={initialBalance >= 0 ? 'success' : 'error'}>
                {formatCurrency(initialBalance, cari.currency)}
              </Text>
              {!isViewer && (!islemler || islemler.length === 0) && (
                <TouchableOpacity
                  onPress={handleOpenEditBalance}
                  style={styles.editBalanceBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Pencil size={16} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Card>
      </View>
    );
  }, [cari, islemlerLoading, initialBalance, t, handleOpenEditBalance, isViewer, islemler, hasNextPage, fetchNextPage, isFetchingNextPage, formatDateShort]);

  if (cariLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!cari) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon={<Building2 size={48} color={colors.textMuted} />}
          title={t('errors:cari.notFound')}
          description={t('clients:details.notFoundDescription')}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Text numberOfLines={2} style={{ fontSize: 17, fontWeight: '600', maxWidth: 200 }}>
              {cari.name}
            </Text>
          ),
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
            ListFooterComponent={ListFooter}
            showsVerticalScrollIndicator={false}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews={false}
            contentContainerStyle={styles.flatListContent}
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        </SwipeableProvider>

        <DetailActionMenu
          visible={showMenu}
          onClose={() => setShowMenu(false)}
          actions={[
            { icon: Pencil, label: t('common:buttons.edit'), visible: canUpdate('cariler', cari?.created_by ?? null), onPress: () => { setShowMenu(false); router.push({ pathname: '/cariler/duzenle/[id]', params: { id: id } }); } },
            { icon: Unlink, label: t('clients:sharing.removeLink'), visible: !!(linkStatus?.is_linked && linkStatus?.is_owner), iconColor: colors.warning, onPress: handleUnlink },
            { icon: Trash2, label: t('common:buttons.delete'), visible: canDelete('cariler', cari?.created_by ?? null), danger: true, onPress: handleDeleteCari },
          ]}
        />

        {/* Quick Transaction Bar - Create Mode */}
        <QuickTransactionBar
          visible={quickBarVisible}
          onDismiss={() => setQuickBarVisible(false)}
          defaultCariId={cari?.id}
          defaultCariType={effectiveType}
          isViewer={isViewer}
          onSuccess={() => setQuickBarVisible(false)}
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
          defaultCariId={cari?.id}
          defaultCariType={effectiveType}
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
          defaultCariId={cari?.id}
          defaultCariType={effectiveType}
          onSuccess={() => {
            setShowCopyBar(false);
            setCopySourceId(null);
          }}
        />

        {/* Çek Kes Sheet */}
        <CekKesSheet
          visible={showCekKesSheet}
          onDismiss={() => setShowCekKesSheet(false)}
          defaultCariId={cari?.id}
          defaultCurrency={cari?.currency}
        />

        <DetailExportSection
          visible={showShareOptions}
          onDismiss={() => setShowShareOptions(false)}
          entityType="cari"
          entityId={id!}
          entityName={cari.name}
          entityCurrency={cari.currency}
          currentBalance={shouldInvertBalance ? -Number(cari.balance) : Number(cari.balance)}
          cariType={(effectiveType || cari.type) as 'musteri' | 'tedarikci'}
          currentIsletmeId={isletme?.id}
          typeMismatch={typeMismatch}
          phone={cari.phone ?? undefined}
          onSharePress={!isViewer ? () => setShowShareCodeModal(true) : undefined}
        />

        {/* Cari Paylaşım Kodu Modal */}
        <ShareCodeModal
          visible={showShareCodeModal}
          onDismiss={() => setShowShareCodeModal(false)}
          cariId={id!}
          cariName={cari.name}
        />

        <BalanceEditorModal
          visible={editBalanceModalVisible}
          onDismiss={() => setEditBalanceModalVisible(false)}
          title={t('clients:balance.editTitle')}
          warning={t('clients:balance.editWarning')}
          directionLabel={t('clients:balanceDirection.label')}
          directionVariant={effectiveType === 'tedarikci' ? 'supplier' : 'customer'}
          balanceDirection={balanceDirection}
          onDirectionChange={setBalanceDirection}
          inputLabel={t('clients:balance.newInitialBalance')}
          inputValue={newInitialBalance}
          onInputChange={setNewInitialBalance}
          onSave={handleSaveInitialBalance}
          isSaving={updateCari.isPending}
          cancelLabel={t('common:buttons.cancel')}
          saveLabel={t('common:buttons.save')}
        />

        {/* Ürün Detay Modal */}
        <ProductDetailModal
          islemId={productDetailIslemId}
          onDismiss={() => setProductDetailIslemId(null)}
          onEdit={(islemId) => {
            setProductDetailIslemId(null);
            setEditTransactionId(islemId);
            setShowEditBar(true);
          }}
          t={t}
        />

        {/* Fotoğraf Görüntüleyici Modal */}
        <PhotoViewerModal
          visible={!!photoViewerIslemId}
          photoPath={photoViewerIslemId ? (islemler || []).find(i => i.id === photoViewerIslemId)?.photo_path ?? null : null}
          onClose={() => setPhotoViewerIslemId(null)}
          onDelete={undefined}
          onChange={undefined}
        />

        {/* Not fotoğraf görüntüleyici */}
        <PhotoViewerModal
          visible={!!notePhotoPath}
          photoPath={notePhotoPath}
          onClose={() => setNotePhotoPath(null)}
        />

        {/* Floating Not Ekle + Yeni İşlem FAB */}
        {!cari.is_archived && !(isViewerViewOnly) && (
          <>
            <AddNoteButton
              entityType="cari"
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

        {/* Undo Delete Snackbar */}
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
          entityType="cari"
          entityId={id!}
          existingPhotoPath={editingNote?.photo_path}
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
  linkedBadgeContainer: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  bannerContainer: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  summaryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryInfo: {
    flex: 1,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  balanceInfo: {
    alignItems: 'flex-end',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionBtn: {
    flex: 1,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
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
});
