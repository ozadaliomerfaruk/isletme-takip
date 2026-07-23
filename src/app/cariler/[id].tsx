import { useState, useCallback, useMemo, useEffect, memo } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity, Modal, ScrollView, Dimensions, Linking } from 'react-native';
import { FlashList } from '@shopify/flash-list';
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
  Scale,
  X,
  Share as ShareIcon,
  Unlink,
  Package,
  BarChart3,
  Eye,
  ShieldCheck,
  Info,
  Link,
  Plus,
  CalendarClock,
  HandCoins,
  MessageCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { BackButton } from '@/components/ui/BackButton';
import { Text, Button, EmptyState, ArchivedBanner, type BalanceDirection } from '@/components/ui';
import { IleriTarihliIslemlerSection } from '@/components/ui/IleriTarihliIslemlerSection';
import { BalanceEditorModal, DetailExportSection, DetailActionMenu } from '@/components/detail';
import { TransactionRow, DateSectionHeader } from '@/components/ui/TransactionRow';
import { SwipeableRow, SwipeableProvider } from '@/components/ui/SwipeableRow';
import { UndoSnackbar } from '@/components/ui/UndoSnackbar';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { PhotoViewerModal } from '@/components/transaction/PhotoViewerModal';
import { AddNoteButton } from '@/components/notes/AddNoteButton';
import { NoteListRow } from '@/components/notes/NoteListRow';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, fontWeight, HIT_SLOP } from '@/constants/spacing';
import { formatCurrency, formatQuantity, parseCurrency, toNumber, calculateTargetAmount, roundCurrency } from '@/lib/currency';
import { useDateFormat } from '@/hooks/useDateFormat';
import { preprocessTransactionsByDate, mergeNotesIntoGroupedData, getTransactionDetailItemType, TransactionListItem } from '@/lib/transactionGrouping';
import { useNotlarByEntity } from '@/hooks/useNotlar';
import { useDetailNoteHandlers } from '@/hooks/useDetailNoteHandlers';
import { NoteInputModal } from '@/components/notes/NoteInputModal';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { useCari, useDeleteCari, useUpdateCari, useCariOzet, type CariOzet } from '@/hooks/useCariler';
import { useUnarchiveCari } from '@/hooks/useArchive';
import { useIslemlerByCari, useDeleteIslem } from '@/hooks/useIslemler';
import { useCariTahsisOzeti, useCariVadeRozet, useCariVadeliBorclar, useCariVadeDetay } from '@/hooks/useIslemTahsis';
import { useCariTaksitBirimleri } from '@/hooks/useTaksit';
import { buildWhatsAppUrl, buildTelUrl } from '@/lib/phone';
import { useUrunHareketlerByIslemId, useUrunKalemlerByIslemIds, type UrunKalemOzet } from '@/hooks/useUrunHareketler';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { useIleriTarihliIslemlerByCari } from '@/hooks/useIleriTarihliIslemler';
import { IslemWithRelations, IslemType, Not } from '@/types/database';
import { useCariLinkStatus, useRemoveCariLink } from '@/hooks/useCariSharing';
import { ShareCodeModal } from '@/components/cariSharing/ShareCodeModal';
import { toErrorMessage, isLinkedRecordsError } from '@/lib/errors';
import { upperTr } from '@/lib/turkishTextUtils';
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
  t: (key: string) => string;
  deleteLabel: string;
  copyLabel: string;
  currency?: string;
  canEdit?: boolean;
  currentUserId?: string;
  otherPartyName?: string | null;
  urunItems?: UrunKalemOzet[];
  vadeText?: string | null;
  vadeState?: 'paid' | 'overdue' | 'soon' | 'future';
  /** Faz 2: açık vadeli borçta swipe hızlı aksiyonu ("Tahsil Et"/"Öde") */
  onTahsil?: () => void;
  tahsilLabel?: string;
  /** Ön-dolu tutar (yalnız memo karşılaştırması için — closure tazelensin diye). */
  tahsilAmount?: number;
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
  t,
  deleteLabel,
  copyLabel,
  currency,
  canEdit = true,
  currentUserId,
  otherPartyName,
  urunItems,
  vadeText,
  vadeState,
  onTahsil,
  tahsilLabel,
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
      itemKey={islem.id}
      onDelete={canEdit ? handleDelete : undefined}
      onCopy={canEdit ? handleCopy : undefined}
      onAction={canEdit ? onTahsil : undefined}
      actionLabel={tahsilLabel}
      actionIcon={<HandCoins size={20} color={colors.white} />}
      enabled={canEdit}
      deleteLabel={deleteLabel}
      copyLabel={copyLabel}
      flush
    >
      {/* Tarih satıra yazılmaz: bölüm başlığı pill'inde zaten var (kullanıcı isteği) */}
      <TransactionRow
        id={islem.id}
        type={effectiveType}
        amount={getCariDisplayAmount(islem)}
        typeLabel={typeLabel}
        entityText={entityText}
        secondaryText={islem.kategori?.name ? upperTr(islem.kategori.name) : null}
        tertiaryText={islem.description || null}
        creatorText={creatorText}
        vadeText={vadeText}
        vadeState={vadeState}
        hasPhoto={!!islem.photo_path}
        hasUrunler={(urunItems?.length ?? 0) > 0}
        urunCount={urunItems?.length ?? 0}
        currency={currency}
        urunItems={urunItems}
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
    && prev.urunItems === next.urunItems
    && prev.displayType === next.displayType
    && prev.hideHesap === next.hideHesap
    && prev.otherPartyName === next.otherPartyName
    && prev.vadeText === next.vadeText
    && prev.vadeState === next.vadeState
    // onTahsil callback kimliği değil VARLIĞI karşılaştırılır (kalan değişimi zaten
    // vadeText üzerinden yeni render tetikler; closure o renderda tazelenir).
    && !!prev.onTahsil === !!next.onTahsil
    && prev.tahsilLabel === next.tahsilLabel
    // Taksit ön-dolu tutarı vadeText'i değiştirmeden gelebilir (taksitBirimleri
    // sorgusu geç yüklenince) → closure'ın tazelenmesi için ayrıca karşılaştır.
    && prev.tahsilAmount === next.tahsilAmount;
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
                        {formatQuantity(Math.abs(hareket.miktar))} {hareket.urunler?.birim || 'adet'} x {formatCurrency(hareket.birim_fiyat || 0)}
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
  const { t } = useTranslation(['clients', 'common', 'errors', 'multiUser']);
  const { formatDateSmart, formatDateShort } = useDateFormat();
  const { currency: baseCurrency } = useSettings();
  const insets = useSafeAreaInsets();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;

  const { data: cari, isLoading: cariLoading, refetch: refetchCari } = useCari(id!);
  // Viewer bağlantı durumu — işlemler sorgusundan ÖNCE belirlenmeli (sahibin işlemlerini
  // çekmek için asViewer parametresi gerekiyor).
  const { data: linkStatus } = useCariLinkStatus(id);
  const isViewer = linkStatus?.is_linked && !linkStatus.is_owner;
  // Viewer ise sahibin işlemlerini de çek: kendi isletme_id filtresi atlanır, erişimi RLS
  // (view_linked_islemler) yalnız bağlı cari ile sınırlar → güvenli, RLS'e dokunulmaz.
  const { data: islemler, isLoading: islemlerLoading, hasNextPage, fetchNextPage, isFetchingNextPage, refetch: refetchIslemler } = useIslemlerByCari(id!, !!isViewer);
  const { data: ileriTarihliIslemler, isLoading: ileriTarihliLoading } = useIleriTarihliIslemlerByCari(id!);
  const { data: entityNotes } = useNotlarByEntity('cari', id!);
  const { canUpdate, canDelete, canAccessModule } = usePermissions();
  const { user, isletme } = useAuthContext();
  const haptics = useHaptics();
  const {
    editingNoteId, setEditingNoteId, editingNote,
    handleNoteUpdate, handleNoteDelete, handleToggleNoteCompletion, handleMarkAsTask,
    isUpdatingNote,
  } = useDetailNoteHandlers({ entityType: 'cari', entityId: id!, entityNotes, isletmeId: isletme?.id });

  // Viewer izin seviyesi (isViewer yukarıda, işlemler sorgusundan önce tanımlandı)
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

  // Ürün kalemleri (satırda önizleme + kutu ikonu) — yüklenen sayfaya bağlı tek batch sorgu, N+1 yok.
  // (Eski useIslemlerWithUrunByCari/fetchAllPages kaldırıldı: cari detayı açılışını yavaşlatıyordu;
  //  kutu ikonu artık getUrunItems uzunluğundan türetiliyor — hesaplar/işlemler ile aynı standart.)
  const islemIdList = useMemo(() => (islemler || []).map((i) => i.id), [islemler]);
  const { getUrunItems } = useUrunKalemlerByIslemIds(islemIdList);
  const deleteIslem = useDeleteIslem();
  const deleteCari = useDeleteCari();
  const updateCari = useUpdateCari();
  const unarchiveCari = useUnarchiveCari();
  const removeCariLink = useRemoveCariLink();

  const [quickBarVisible, setQuickBarVisible] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
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
  // Faz 2: swipe "Tahsil Et/Öde" — kalan tutar ön-dolu QTB; tahsis kaydırılan satırın
  // borcuna hedeflenir (retahsis QTB İÇİNDE tetiklenir — defaultHedefBorcId)
  const [tahsilPrefill, setTahsilPrefill] = useState<{ type: 'tahsilat' | 'odeme'; amount?: number; hedefBorcId: string } | null>(null);
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

  // Açılış bakiyesi yalnız İŞLEM YOKKEN ve viewer-olmayan modda düzenlenir (ilk işlemle kilit).
  // !!islemler: liste YÜKLENİRKEN (undefined) kilitli kalmalı (hesap detayıyla aynı polarite) —
  // aksi hâlde işlemli caride yükleme penceresinde editör açılıp bakiye ezilebilir.
  const isBalanceEditable = !isViewer && !!islemler && islemler.length === 0;

  // Başlangıç bakiyesi düzenleme
  const handleOpenEditBalance = useCallback(() => {
    // Mevcut yönü belirle: pozitif = debt (bize borçlu), negatif = credit (biz borçluyuz)
    setBalanceDirection(initialBalance >= 0 ? 'debt' : 'credit');
    setNewInitialBalance(Math.abs(initialBalance).toString());
    setEditBalanceModalVisible(true);
  }, [initialBalance]);

  const handleSaveInitialBalance = async () => {
    if (!cari) return;
    const absoluteAmount = roundCurrency(parseCurrency(newInitialBalance) || 0);
    // Yöne göre işareti uygula: debt = pozitif, credit = negatif
    const newInitial = balanceDirection === 'debt' ? absoluteAmount : -absoluteAmount;

    // Onay Alert'i kaldırıldı: editör zaten yalnız işlem YOKKEN açılıyor (ilk giriş),
    // "değiştirmek istediğinize emin misiniz?" sormak gereksiz. Hata Alert'i kalır.
    try {
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
  };

  // === MEMOIZED HANDLERS for FlatList items ===
  const handlePressIslem = useCallback((islemId: string) => {
    // Görüntüleme modundaki viewer: işleme tıklama BOŞ geçer (ürün detayı/QTB hiçbir şey açılmaz).
    if (isViewerViewOnly) return;

    const islem = (islemler || []).find(i => i.id === islemId);
    if (!islem) return;

    if ((getUrunItems(islemId)?.length ?? 0) > 0) {
      setProductDetailIslemId(islemId);
      return;
    }

    // Karşı tarafın işlemi → düzenlenemez, bir şey yapma
    if (islem.isletme_id !== isletme?.id) return;

    setEditTransactionId(islemId);
    setShowEditBar(true);
  }, [getUrunItems, islemler, isletme?.id, isViewerViewOnly]);

  // Fotoğraf ikonuna basıldığında fotoğraf viewer aç
  const handlePressPhoto = useCallback((islemId: string) => {
    setPhotoViewerIslemId(islemId);
  }, []);

  const handleDeleteIslem = useCallback((islemId: string) => {
    const islem = (islemler || []).find(i => i.id === islemId);
    if (islem) {
      const labelKey = getCariHareketLabelKey(islem.type);
      const desc = islem.description || (labelKey.includes(':') ? t(labelKey) : t(`transactions:types.${islem.type}`));
      requestDelete(islemId, islem, desc);
    }
  }, [islemler, requestDelete, t]);

  const handleLongPressIslem = useCallback((islemId: string) => {
    if (isViewerViewOnly) return; // viewer (görüntüleme): basılı tutma da bir şey açmaz
    setEditTransactionId(islemId);
    setShowEditBar(true);
  }, [isViewerViewOnly]);

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
              // dismissTo (POP_TO): kök Stack'i mevcut (tabs)'a collapse eder. replace/push YENİ (tabs)
              // kopyası yığardı (RN7 navigate/replace var-olan (tabs)'a dönmez) → sonsuz swipe-back.
              router.dismissTo('/(tabs)/cariler');
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
        onPress={() => {
          // Rapor sayfası 'raporlar' modülüne bağlı. İzinsiz üye için sayfaya HİÇ gitme
          // (flaş + veri-çekme olmadan) — doğrudan "Erişim Engellendi" uyarısı ver.
          if (!canAccessModule('raporlar')) {
            Alert.alert(t('multiUser:permissions.denied'), t('multiUser:permissions.noModuleAccess'));
            return;
          }
          router.push({ pathname: '/raporlar/cari', params: { cariId: id } });
        }}
        style={styles.headerBtn}
        hitSlop={HIT_SLOP.md}
      >
        <BarChart3 size={22} color={colors.text} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setShowShareOptions(true)}
        style={styles.headerBtn}
        hitSlop={HIT_SLOP.md}
      >
        <ShareIcon size={22} color={colors.text} />
      </TouchableOpacity>
      {!isViewer && (
        <TouchableOpacity
          onPress={() => setShowMenu(true)}
          style={styles.headerBtn}
          hitSlop={HIT_SLOP.md}
        >
          <MoreVertical size={24} color={colors.text} />
        </TouchableOpacity>
      )}
    </View>
  ), [isViewer, id, router, canAccessModule, t]);

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

  // ── Vade (Faz 1) — "Vadesi geçti" görünürlüğü ─────────────────────────────
  // Bugün YYYY-MM-DD (yerel). vade_tarihi date-kolonu → string karşılaştırma TZ-güvenli.
  const overdueTodayStr = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);
  // Kaba susturucu (Fable): tahsis defteri (Faz 2) YOKKEN "gecikme" iddia etme. Rozet yalnız
  // carinin NET bakiyesi borç yönünde ise çıkar → "ödedim ama gecikmiş görünüyor" şikayetini önler.
  // musteri: bakiye>0 (bize borçlu) → çıkar; tedarikçi: bakiye<0 (biz borçlu) → çıkar; settled/ters → sustur.
  // Viewer'da tamamen gizle: inversiyon perspektifi Faz 2'de kalan-bazlı netleşir (yanlış göstermektense hiç gösterme).
  // Kaba "ödendi" (Faz 1 yaklaşımı): cari NET bakiyesi borç yönünde DEĞİLSE vadeli işlemler
  // crude "ödendi"=yeşil. (Faz 2 FIFO tahsis defteri per-fatura kesinleştirir: kısmi ödemede
  // en eski fatura yeşil, kalan kırmızı — Faz 1'de yapılamaz.) musteri: bakiye>0 borçlu →
  // borç var; tedarikçi: bakiye<0 → borç var. Viewer'da paid perspektifi karışık → false (urgency).
  const cariPaidCrude = useMemo(() => {
    if (isViewer) return false;
    const bal = Number(cari?.balance) || 0;
    const hasOutstanding = cari?.type === 'musteri' ? bal > 0.01 : bal < -0.01;
    return !hasOutstanding;
  }, [isViewer, cari?.balance, cari?.type]);

  // ── Vade (Faz 2) — tahsis defteri: işlem başına KESİN kalan ─────────────────
  // Sunucu her ödeme/tahsilat/iadeyi açık vadeli borçlara FIFO tahsis eder (atomik
  // RPC içinde); burada yalnız OKUNUR. Kısmi ödemede en eski borç kapanır (yeşil),
  // kalan borçta "Kalan: X" gösterilir. Viewer'da kapalı (RLS zaten boş döndürür)
  // → Faz 1 davranışı sürer. crude susturucu KALIR: migration ÖNCESİ ödenmiş eski
  // borçların tahsis kaydı yok (backfill yok) — bakiye kapalıyken gecikme İDDİA ETME.
  const { data: tahsisOzeti } = useCariTahsisOzeti(id, !isViewer);

  // Başlık V.G. özeti: carinin TÜM vadeli borçları (sayfalı listeden değil — kısmi
  // sayfa yanlış toplam verir) + tahsis kalanları → gecikmiş adet/toplam.
  // crude susturucu burada da geçerli: bakiye kapalıysa şerit hiç çıkmaz.
  // Taksitli işlem id'leri: işlem-düzeyi vade (=ilk taksit) + işlem-bütünü kalan,
  // taksitli işlemde YANLIŞ "vadesi geçti" üretir (plan yolundayken bile). Satır
  // pill'i bu set ile taksit-farkındalı davranır.
  // Taksit birimleri (islem_id → vade sıralı taksitler): taksitli-islem seti +
  // swipe "Tahsil Et/Öde" ön-dolusu için sıradaki açık taksitin kalanı buradan.
  const { data: taksitBirimleri } = useCariTaksitBirimleri(id, !isViewer);
  const taksitliSet = useMemo(() => new Set(Object.keys(taksitBirimleri ?? {})), [taksitBirimleri]);

  // Dashboard özeti (RPC — sunucuda toplanır) + birim-farkındalı gecikmiş rozeti
  // (taksit birimleri dahil; liste sayfasıyla aynı kaynak/cache).
  const { data: cariOzet } = useCariOzet(id, !isViewer);
  // Vade satırları yalnız carinin EN AZ BİR vadeli işlemi varsa gösterilir
  // (kullanıcı isteği: vadesiz cari kartında vade lafı hiç geçmesin)
  const { data: vadeliBorclar } = useCariVadeliBorclar(id, !isViewer);
  const hasVadeliIslem = (vadeliBorclar?.length ?? 0) > 0;
  // NET-mahsuplu açık vadeli birimler (gecikenler akordiyonu bundan beslenir → ham kalan
  // yerine net'e göre mahsuplu; kart özetiyle tutarlı, hayalet vade çıkmaz).
  const { data: vadeDetay } = useCariVadeDetay(id, !isViewer);
  const { data: vadeRozetMap } = useCariVadeRozet(!isViewer);
  const cariVadeOzeti = useMemo(() => {
    // Crude susturucu (liste rozetiyle aynı kural): bakiye ilgili yönde açık değilse
    // gecikme İDDİA ETME (migration-öncesi tahsissiz ödenmiş geçmişte yanlış alarm olmasın)
    if (isViewer || cariPaidCrude || !cari || !vadeRozetMap) return null;
    const rozet = vadeRozetMap[cari.id];
    if (!rozet) return null;
    const bal = toNumber(cari.balance);
    const tutar = cari.type === 'tedarikci' ? toNumber(rozet.gecikmis_borc) : toNumber(rozet.gecikmis_alacak);
    const outstanding = cari.type === 'tedarikci' ? bal < -0.01 : bal > 0.01;
    if (!outstanding || !tutar || tutar <= 0.009) return null;
    return { toplam: tutar, adet: Number(rozet.gecikmis_adet) || 0 };
  }, [isViewer, cariPaidCrude, cari, vadeRozetMap]);

  // "Vadesi Geçen İşlemler" akordiyonu (plansız borçlar; taksitli planların
  // gecikmesi Taksit Takip'te birim bazında izlenir). En eski vade üstte.
  const [gecikenlerOpen, setGecikenlerOpen] = useState(false);
  const gecikmisBorclar = useMemo(() => {
    if (isViewer || cariPaidCrude || !vadeDetay) return [];
    const out: { id: string; type: string; description: string | null; vade: string; gun: number; kalan: number }[] = [];
    for (const u of vadeDetay) {
      if (u.taksit_id) continue; // plansız borçlar tek tek; taksit birimleri aşağıda toplu satır
      if (String(u.vade) > overdueTodayStr) continue; // yalnız gecikmiş
      // kalan zaten NET-mahsuplu ve > 0 (RPC filtreler)
      const gun = Math.round(
        (new Date(overdueTodayStr).getTime() - new Date(String(u.vade)).getTime()) / 86400000
      );
      out.push({ id: u.islem_id, type: u.type, description: u.description ?? null, vade: String(u.vade), gun, kalan: u.kalan });
    }
    out.sort((a, b) => (a.vade < b.vade ? -1 : 1));
    return out;
  }, [isViewer, cariPaidCrude, vadeDetay, overdueTodayStr]);

  // Taksitli planlarda geciken kısım — akordiyonda ayrı toplu satır (birim detayı
  // Taksit Takip'te). NET-mahsuplu vadeDetay'dan doğrudan: geciken taksit birimlerinin
  // real_kalan toplamı (plansız gecikmişlerle birlikte akordiyon = kart özeti).
  const taksitliGecikmisFark = useMemo(() => {
    if (isViewer || cariPaidCrude || !vadeDetay) return 0;
    return roundCurrency(
      vadeDetay
        .filter((u) => u.taksit_id && String(u.vade) <= overdueTodayStr)
        .reduce((s, u) => roundCurrency(s + u.kalan), 0)
    );
  }, [isViewer, cariPaidCrude, vadeDetay, overdueTodayStr]);

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
        <NoteListRow
          note={noteData}
          onEditId={setEditingNoteId}
          onDeleteId={handleNoteDelete}
          onToggleComplete={handleToggleNoteCompletion}
          onMarkAsTask={handleMarkAsTask}
          onPhotoPress={setNotePhotoPath}
          deleteLabel={deleteLabel}
          flush
        />
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
    // Vade (Faz 1): vade<bugün + susturucu geçerse "Vadesi geçti". != null guard: eski
    // persist-cache satırlarında alan undefined olabilir → vadesiz say (tipe yaslanma).
    // Vade (Faz 1): her vadeli islemde renkli "Vade: GG.AA.YYYY". Renk: paid=yesil (crude settled),
    // overdue=kirmizi (bugun/gecmis), soon=turuncu (<=7g), future=sari (>7g). != null persist-guard.
    let itemVadeText: string | null = null;
    let itemVadeState: 'paid' | 'overdue' | 'soon' | 'future' | undefined;
    let itemOnTahsil: (() => void) | undefined;
    let itemTahsilLabel: string | undefined;
    let itemTahsilAmount: number | undefined;
    if (islem.vade_tarihi != null) {
      const p = String(islem.vade_tarihi).split('-');
      if (p.length === 3) {
        // Faz 2 — tahsis-bazlı kesin kalan (yalnız veri geldiyse; yükleniyor/viewer → null).
        // İşlem tipi owner-canonical (islem.type) — tahsis defteri ham DB üzerindedir.
        const tahsisToplam = tahsisOzeti?.borcTahsisleri[islem.id] ?? 0;
        const itemKalan = tahsisOzeti
          ? Math.max(0, roundCurrency(toNumber(islem.amount) - tahsisToplam))
          : null;
        const isTaksitli = taksitliSet.has(islem.id);

        if (isTaksitli) {
          // TAKSİTLİ işlem: işlem vadesi = İLK taksit tarihi; işlem-bütünü kalanla
          // gün hesabı yapılırsa plan yolunda giderken bile "vadesi geçti" çıkar
          // (yanlış alarm — inceleme bulgusu). Satır tarafsız "3/12 taksit ödendi ·
          // Kalan: X" gösterir; gecikme kırılımı Taksit Takip/detayda birim bazında.
          const birimler = taksitBirimleri?.[islem.id];
          // Ödenen/toplam taksit ("3/12 taksit ödendi") — birim kalanlarından
          let taksitOran: string | null = null;
          if (birimler && birimler.length > 0 && tahsisOzeti) {
            const odenen = birimler.filter(
              (tk) => roundCurrency(tk.tutar - (tahsisOzeti.taksitTahsisleri?.[tk.id] ?? 0)) <= 0.009
            ).length;
            taksitOran = t('transactions:taksit.odenenOran', { odenen, toplam: birimler.length });
          }
          if (cariPaidCrude || (itemKalan !== null && itemKalan <= 0.009)) {
            itemVadeText = `${t('transactions:taksit.label')} · ${t('transactions:taksit.tamamlandi')}`;
            itemVadeState = 'paid';
          } else {
            // Oran ve kalan AYRI satırlarda: tek satırda sığmıyor/okunmuyordu
            itemVadeText = itemKalan !== null
              ? `${taksitOran ?? t('transactions:taksit.label')}\n${t('transactions:vade.kalan')}: ${formatCurrency(itemKalan, cari?.currency || 'TRY')}`
              : (taksitOran ?? t('transactions:taksit.label'));
            itemVadeState = 'future';
            if (!isViewer && canEditItem && (islem.type === 'cari_satis' || islem.type === 'cari_alis')) {
              const prefillType = islem.type === 'cari_satis' ? 'tahsilat' : 'odeme';
              itemTahsilLabel = t(prefillType === 'tahsilat' ? 'transactions:vade.tahsilEt' : 'transactions:vade.ode');
              // Ön-dolu tutar = SIRADAKİ açık taksitin kalanı (kullanıcı isteği:
              // taksit 40 binse 40 bin gelsin). İşlem-bütünü kalan DEĞİL — o,
              // "bu ayın taksitini alacaktım, tüm kalanı kaydettim" kazası üretir.
              // Hedefli retahsis zaten bu planın en eski açık taksitinden kapatır.
              if (birimler && tahsisOzeti) {
                for (const tk of birimler) {
                  const tkKalan = roundCurrency(tk.tutar - (tahsisOzeti.taksitTahsisleri?.[tk.id] ?? 0));
                  if (tkKalan > 0.009) { itemTahsilAmount = tkKalan; break; }
                }
              }
              const sonrakiTaksitKalan = itemTahsilAmount;
              itemOnTahsil = () => setTahsilPrefill({ type: prefillType, amount: sonrakiTaksitKalan, hedefBorcId: islem.id });
            }
          }
        } else {
          itemVadeText = `${t('transactions:vade.label')}: ${p[2]}.${p[1]}.${p[0]}`;
          if (cariPaidCrude || (itemKalan !== null && itemKalan <= 0.009)) {
            // paid: tahsislerle tamamen kapanmış borç VEYA crude susturucu (bakiye
            // kapalı — migration-öncesi geçmişte tahsis kaydı olmayan ödemeler).
            itemVadeState = 'paid';
          } else {
            const daysUntil = Math.round(
              (new Date(String(islem.vade_tarihi)).getTime() - new Date(overdueTodayStr).getTime()) / 86400000
            );
            itemVadeState = daysUntil <= 0 ? 'overdue' : daysUntil > 7 ? 'future' : 'soon';
            // Esnaf dili: tarih yerine gün farkı öne çıkar ("32 gün gecikti" / "15 gün sonra")
            itemVadeText += daysUntil < 0
              ? ` · ${t('transactions:vade.gunGecikti', { gun: -daysUntil })}`
              : daysUntil === 0
                ? ` · ${t('transactions:vade.bugunSon')}`
                : ` · ${t('transactions:vade.gunSonra', { gun: daysUntil })}`;
            // Kısmi tahsis: pill'e kalanı ekle ("Vade: 15.08.2026 · Kalan: ₺500").
            if (itemKalan !== null && tahsisToplam > 0 && itemKalan > 0) {
              itemVadeText += ` · ${t('transactions:vade.kalan')}: ${formatCurrency(itemKalan, cari?.currency || 'TRY')}`;
            }
            // Swipe hızlı aksiyon: açık vadeli borçta kalanı ön-dolu tahsilat/ödeme aç.
            // FIFO mahsup sunucuda otomatik (en eski vade önce); viewer'da kapalı.
            if (!isViewer && canEditItem && (islem.type === 'cari_satis' || islem.type === 'cari_alis')) {
              const prefillType = islem.type === 'cari_satis' ? 'tahsilat' : 'odeme';
              const prefillAmount = itemKalan ?? toNumber(islem.amount);
              itemTahsilLabel = t(prefillType === 'tahsilat' ? 'transactions:vade.tahsilEt' : 'transactions:vade.ode');
              itemTahsilAmount = prefillAmount;
              itemOnTahsil = () => setTahsilPrefill({ type: prefillType, amount: prefillAmount, hedefBorcId: islem.id });
            }
          }
        }
      }
    } else if (tahsisOzeti && (tahsisOzeti.odemeTahsisleri[islem.id] ?? 0) > 0) {
      // Faz 2 — ödeme/tahsilat/iade satırı: nereye mahsup olduğu + kalan avans.
      // Yalnız defterde payı olan ödemelerde görünür (legacy ödemeler temiz kalır).
      const mahsup = tahsisOzeti.odemeTahsisleri[islem.id];
      let cariEtki = toNumber(islem.amount);
      if (islem.type === 'cari_odeme' || islem.type === 'cari_tahsilat') {
        try {
          cariEtki = calculateTargetAmount(
            toNumber(islem.amount),
            islem.exchange_rate ? toNumber(islem.exchange_rate) : null,
            islem.source_currency || 'TRY',
            islem.target_currency || 'TRY',
          );
        } catch {
          // kur verisi bozuksa ham tutara düş (görsel bilgi — para matematiği değil)
        }
      }
      const avans = Math.max(0, roundCurrency(cariEtki - mahsup));
      itemVadeText = `${t('transactions:vade.mahsup')}: ${formatCurrency(mahsup, cari?.currency || 'TRY')}`;
      if (avans > 0.009) {
        itemVadeText += ` · ${t('transactions:vade.avans')}: ${formatCurrency(avans, cari?.currency || 'TRY')}`;
      }
      itemVadeState = 'paid';
    }
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
        t={t}
        deleteLabel={deleteLabel}
        copyLabel={copyLabel}
        currency={cari?.currency}
        canEdit={canEditItem}
        currentUserId={user?.id}
        otherPartyName={itemOtherPartyName}
        urunItems={getUrunItems(islem.id)}
        vadeText={itemVadeText}
        vadeState={itemVadeState}
        onTahsil={itemOnTahsil}
        tahsilLabel={itemTahsilLabel}
        tahsilAmount={itemTahsilAmount}
      />
    );
  }, [handlePressIslem, handleLongPressIslem, handlePressPhoto, handleDeleteIslem, handleCopyIslem, handleNoteDelete, handleToggleNoteCompletion, handleMarkAsTask, t, deleteLabel, copyLabel, cari?.currency, canEditTransactions, canDelete, user?.id, isletme?.id, typeMismatch, otherPartyIsletmeName, getUrunItems, cariPaidCrude, overdueTodayStr, tahsisOzeti, isViewer, taksitliSet, taksitBirimleri]);

  const keyExtractor = useCallback((item: TransactionListItem) => item.key, []);

  // === FlatList ListHeaderComponent ===
  const ListHeader = useMemo(() => {
    if (!cari) return null;
    // BUG 4: Viewer perspektifinden cari tipi kullan
    const isTedarikci = effectiveType === 'tedarikci';
    // Viewer perspektifinde bakiye ters cevrilerek gosterilir
    const displayBalance = shouldInvertBalance ? -Number(cari.balance) : Number(cari.balance);
    // Bağlantılı (paylaşılan) cari: ayrı kutu yerine özet kartının çerçevesi yeşil + üstte
    // kompakt "Bağlantılı · {paylaşan işletme}" şeridi gösterilir.
    const linkedOwnerName = (linkStatus?.is_linked && linkStatus.link?.owner_isletme?.name) || undefined;

    return (
      <View>
        {/* Cari Özeti — koyu kompakt dashboard (kullanıcının örnek ekranıyla aynı düzen):
            ortada isim, altında telefon, sağa dayalı değerli satırlar */}
        <View style={[styles.darkCard, linkedOwnerName && styles.summaryCardLinked]}>
          {linkedOwnerName && (
            <View style={styles.darkLinkedStrip}>
              <Link size={13} color={colors.white} />
              <Text style={styles.darkLinkedText} numberOfLines={1}>
                {t('clients:sharing.linkedBadge')}{'  ·  '}{linkedOwnerName}
              </Text>
            </View>
          )}

          {/* Üst satır: SOLDA isim + tip, SAĞDA kalan bakiye (aynı satır) */}
          <View style={styles.darkTopRow}>
            <View style={styles.darkTitleWrap}>
              <Text style={styles.darkTitle} numberOfLines={2}>{upperTr(cari.name)}</Text>
              <Text style={styles.darkType} numberOfLines={1}>
                {isTedarikci ? t('clients:types.tedarikci') : t('clients:types.musteri')}
                {cari.phone ? `  ·  ${cari.phone}` : ''}
              </Text>
            </View>
            <View style={styles.darkBalanceWrap}>
              <Text style={styles.darkLabel} numberOfLines={1}>
                {displayBalance < 0 ? t('clients:detayOzet.kalanBorc') : t('clients:detayOzet.kalanAlacak')}
              </Text>
              <Text style={styles.darkBalanceValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {formatCurrency(Math.abs(displayBalance), cari.currency)}
              </Text>
            </View>
          </View>

          {(() => {
            // Alt 4 satır: toplam alış/satış, toplam ödeme/tahsilat, vadesi geçen,
            // vadesi gelmemiş (= kalan − geçen). İadeler toplamdan netleştirilir.
            const oz = (k: keyof CariOzet) => cariOzet?.[k]?.toplam ?? 0;
            const toplam = isTedarikci
              ? roundCurrency(oz('cari_alis') - oz('cari_alis_iade'))
              : roundCurrency(oz('cari_satis') - oz('cari_satis_iade'));
            const odemeTahsilat = isTedarikci ? oz('cari_odeme') : oz('cari_tahsilat');
            const kalanAbs = Math.abs(displayBalance);
            const gecikmis = cariVadeOzeti?.toplam ?? 0;
            const vadesiGelmemis = Math.max(0, roundCurrency(kalanAbs - gecikmis));
            const rows: { label: string; value: string; danger?: boolean }[] = [
              {
                label: isTedarikci ? t('clients:detayOzet.toplamAlis') : t('clients:detayOzet.toplamSatis'),
                value: formatCurrency(toplam, cari.currency),
              },
              {
                label: isTedarikci ? t('clients:detayOzet.toplamOdeme') : t('clients:detayOzet.toplamTahsilat'),
                value: formatCurrency(odemeTahsilat, cari.currency),
              },
            ];
            // Vade satırları yalnız vadeli işlemi olan caride (kullanıcı isteği:
            // hiç vade kullanılmadıysa kartta vade lafı geçmesin)
            if (hasVadeliIslem) {
              rows.push({
                label: isTedarikci ? t('clients:detayOzet.vadesiGecenBorc') : t('clients:detayOzet.vadesiGecenAlacak'),
                value: formatCurrency(gecikmis, cari.currency),
                danger: gecikmis > 0,
              });
              rows.push({
                label: isTedarikci ? t('clients:detayOzet.vadesiGelmemisBorc') : t('clients:detayOzet.vadesiGelmemisAlacak'),
                value: formatCurrency(vadesiGelmemis, cari.currency),
              });
            }
            return (
              <View style={styles.darkRows}>
                {rows.map((r, i) => (
                  <View key={r.label}>
                    {/* Satırlar arası ince ayraç (ilk satırın üstünde de — üst bloğu ayırır) */}
                    <View style={[styles.darkRowDivider, i === 0 && styles.darkRowDividerTop]} />
                    <View style={styles.darkRow}>
                      <Text style={styles.darkLabel} numberOfLines={1}>{r.label}</Text>
                      <Text
                        style={[styles.darkValue, r.danger && styles.darkValueDanger]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                      >
                        {r.value}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          })()}
        </View>

        {/* Ara / WhatsApp kısayolları — telefon varsa (esnaf günlük akışı) */}
        {(() => {
          if (!cari.phone) return null;
          const telUrl = buildTelUrl(cari.phone);
          const waUrl = buildWhatsAppUrl(cari.phone);
          if (!telUrl && !waUrl) return null;
          return (
            <View style={styles.iletisimRow}>
              {telUrl && (
                <TouchableOpacity style={styles.iletisimBtn} activeOpacity={0.7} onPress={() => Linking.openURL(telUrl)}>
                  <Phone size={16} color={colors.primary} />
                  <Text style={styles.iletisimText}>{t('common:iletisim.ara')}</Text>
                </TouchableOpacity>
              )}
              {waUrl && (
                <TouchableOpacity style={styles.iletisimBtn} activeOpacity={0.7} onPress={() => Linking.openURL(waUrl)}>
                  <MessageCircle size={16} color={colors.success} />
                  <Text style={styles.iletisimText}>{t('common:iletisim.whatsapp')}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {/* Vadesi Geçen İşlemler akordiyonu — hızlı tahsilat + WhatsApp hatırlatma.
            Taksitli planlardaki gecikme de ayrı satırla temsil edilir (kart rozetiyle tutarlı). */}
        {(gecikmisBorclar.length > 0 || taksitliGecikmisFark > 0.009) && (
          <View style={styles.gecikenCard}>
            <TouchableOpacity
              style={styles.gecikenHeader}
              activeOpacity={0.7}
              onPress={() => setGecikenlerOpen((v) => !v)}
            >
              <CalendarClock size={16} color={colors.error} />
              <Text style={styles.gecikenTitle} numberOfLines={1}>
                {t('transactions:vade.gecikenler')} ({gecikmisBorclar.length + (taksitliGecikmisFark > 0.009 ? 1 : 0)})
              </Text>
              <Text style={styles.gecikenToplam} numberOfLines={1}>
                {formatCurrency(
                  roundCurrency(gecikmisBorclar.reduce((s, b) => roundCurrency(s + b.kalan), 0) + taksitliGecikmisFark),
                  cari.currency
                )}
              </Text>
              {gecikenlerOpen ? (
                <ChevronUp size={18} color={colors.textMuted} />
              ) : (
                <ChevronDown size={18} color={colors.textMuted} />
              )}
            </TouchableOpacity>

            {gecikenlerOpen && (
              <View style={styles.gecikenList}>
                {gecikmisBorclar.map((b) => {
                  const tipKey = getCariHareketLabelKey(b.type);
                  const p = b.vade.split('-');
                  return (
                    <View key={b.id} style={styles.gecikenRow}>
                      <View style={styles.gecikenInfo}>
                        <Text variant="body" numberOfLines={1} style={styles.gecikenDesc}>
                          {b.description || t(tipKey)}
                        </Text>
                        <Text variant="caption" color="secondary" numberOfLines={1}>
                          {t('transactions:vade.label')}: {p[2]}.{p[1]}.{p[0]}
                          {'  ·  '}
                          <Text variant="caption" style={styles.gecikenGun}>
                            {t('transactions:vade.gunGecikti', { gun: Math.max(1, b.gun) })}
                          </Text>
                        </Text>
                      </View>
                      <View style={styles.gecikenSag}>
                        <Text style={styles.gecikenKalan} numberOfLines={1}>
                          {formatCurrency(b.kalan, cari.currency)}
                        </Text>
                        {!isViewer && canEditTransactions && (
                          <TouchableOpacity
                            style={styles.gecikenTahsilBtn}
                            activeOpacity={0.8}
                            onPress={() => setTahsilPrefill({
                              type: cari.type === 'tedarikci' ? 'odeme' : 'tahsilat',
                              amount: b.kalan,
                              hedefBorcId: b.id,
                            })}
                          >
                            <HandCoins size={13} color={colors.white} />
                            <Text style={styles.gecikenTahsilText}>
                              {cari.type === 'tedarikci' ? t('transactions:vade.ode') : t('transactions:vade.tahsilEt')}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}

                {/* Taksitli planlarda geciken kısım — birim detayı Taksit Takip'te */}
                {taksitliGecikmisFark > 0.009 && (
                  <TouchableOpacity
                    style={styles.gecikenRow}
                    activeOpacity={0.7}
                    onPress={() => router.push('/taksit')}
                  >
                    <View style={styles.gecikenInfo}>
                      <Text variant="body" numberOfLines={1} style={styles.gecikenDesc}>
                        {t('transactions:taksit.label')}
                      </Text>
                      <Text variant="caption" color="secondary" numberOfLines={2}>
                        {t('transactions:taksit.gecikenPlanNot')}
                      </Text>
                    </View>
                    <View style={styles.gecikenSag}>
                      <Text style={styles.gecikenKalan} numberOfLines={1}>
                        {formatCurrency(taksitliGecikmisFark, cari.currency)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* WhatsApp ile kibar hatırlatma — hazır mesajla sohbet açar */}
                {(() => {
                  const toplam = gecikmisBorclar.reduce((s, b) => roundCurrency(s + b.kalan), 0);
                  const waUrl = buildWhatsAppUrl(
                    cari.phone,
                    t('transactions:vade.whatsappMesaj', {
                      isim: cari.name,
                      isletme: isletme?.name ?? '',
                      tutar: formatCurrency(toplam, cari.currency),
                    })
                  );
                  if (!waUrl) return null;
                  return (
                    <TouchableOpacity
                      style={styles.gecikenWaBtn}
                      activeOpacity={0.8}
                      onPress={() => Linking.openURL(waUrl)}
                    >
                      <MessageCircle size={15} color={colors.white} />
                      <Text style={styles.gecikenWaText}>{t('transactions:vade.whatsappHatirlat')}</Text>
                    </TouchableOpacity>
                  );
                })()}
              </View>
            )}
          </View>
        )}

        {/* Paylaşım İzin Modu Banner (görüntüleme/tam erişim) — tek yer, kart şeridiyle tekrar etmez */}
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

        {/* İleri Tarihli İşlemler ve Hareketler */}
        <View style={styles.section}>
          <IleriTarihliIslemlerSection
            ileriTarihliIslemler={ileriTarihliIslemler}
            isLoading={ileriTarihliLoading}
          />

          {/* "Hareketler" başlığı kaldırıldı (kullanıcı isteği) — işlemler
              dashboard'un hemen altından başlar */}
          {islemlerLoading && (
            <Text color="secondary">{t('common:status.loading')}</Text>
          )}
        </View>
      </View>
    );
  }, [cari, effectiveType, shouldInvertBalance, ileriTarihliIslemler, ileriTarihliLoading, islemlerLoading, baseCurrency, exchangeRates, t, handleUnarchive, unarchiveCari.isPending, linkStatus, isViewerViewOnly, isViewer, cariVadeOzeti, cariOzet, hasVadeliIslem, gecikmisBorclar, gecikenlerOpen, canEditTransactions, isletme?.name, taksitliGecikmisFark, router]);

  // === FlatList ListFooterComponent ===
  const ListFooter = useMemo(() => {
    if (!cari || islemlerLoading) return null;
    return (
      <>
        {hasNextPage && (
          <View style={styles.section}>
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
          </View>
        )}
        {/* Başlangıç bakiyesi: ayrı kart değil, işlem satırlarıyla bitişik düz satır */}
        <TouchableOpacity
          style={styles.initialBalanceFlatRow}
          onPress={isBalanceEditable ? handleOpenEditBalance : undefined}
          disabled={!isBalanceEditable}
          activeOpacity={0.7}
        >
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
              {/* #8: boş (0) + düzenlenebilirken belirgin "ekle" çağrısı; değer varsa ya da
                  kilitliyken (işlem var) yalnız değer + (düzenlenebilirse) kalem ipucu. */}
              {isBalanceEditable && initialBalance === 0 ? (
                <View style={styles.addBalanceCta}>
                  <Plus size={16} color={colors.primary} />
                  <Text variant="label" style={{ color: colors.primary }}>
                    {t('clients:details.addInitialBalance')}
                  </Text>
                </View>
              ) : (
                <>
                  <Text variant="h3" color={initialBalance >= 0 ? 'success' : 'error'}>
                    {formatCurrency(initialBalance, cari.currency)}
                  </Text>
                  {isBalanceEditable && (
                    <View style={styles.editBalanceBtn}>
                      <Pencil size={16} color={colors.primary} />
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </>
    );
  }, [cari, islemlerLoading, initialBalance, t, handleOpenEditBalance, isBalanceEditable, hasNextPage, fetchNextPage, isFetchingNextPage, formatDateShort]);

  // === FlatList ListEmptyComponent (#7) — hesaptaki desenle parite ===
  const ListEmpty = useMemo(() => {
    if (islemlerLoading) return null;
    return (
      <View style={styles.section}>
        <EmptyState title={t('clients:details.noTransactions')} />
      </View>
    );
  }, [islemlerLoading, t]);

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
          <FlashList
            data={groupedData}
            keyExtractor={keyExtractor}
            getItemType={getTransactionDetailItemType}
            renderItem={renderTransactionItem}
            ListHeaderComponent={ListHeader}
            ListFooterComponent={ListFooter}
            ListEmptyComponent={ListEmpty}
            showsVerticalScrollIndicator={false}
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
            // Mutabakat: linked cari'de gizli — viewer işlemleri isletme_id filtresine
            // takıldığından motor yanlış devir üretir (bkz. src/lib/mutabakat)
            { icon: Scale, label: t('mutabakat:menu.action'), visible: !isViewer && !linkStatus?.is_linked && !cari?.is_archived, onPress: () => { setShowMenu(false); router.push({ pathname: '/mutabakat/[cariId]', params: { cariId: id } }); } },
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

        {/* Faz 2: swipe "Tahsil Et/Öde" — kalan tutar ön-dolu tahsilat/ödeme.
            Bağlam-hedefli tahsis artık QTB'nin İÇİNDE (defaultHedefBorcId →
            "Nereye sayılsın?" chip'i seçili açılır; retahsis kaydın hemen ardından
            QTB tarafından tetiklenir — tek sahip, çift retahsis yok). */}
        <QuickTransactionBar
          visible={!!tahsilPrefill}
          onDismiss={() => setTahsilPrefill(null)}
          defaultCariId={cari?.id}
          defaultCariType={effectiveType}
          defaultType={tahsilPrefill?.type}
          defaultAmount={tahsilPrefill?.amount}
          defaultHedefBorcId={tahsilPrefill?.hedefBorcId}
          isViewer={isViewer}
          onSuccess={() => setTahsilPrefill(null)}
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

        {/* Floating FAB'lar: Not Ekle + Yeni İşlem */}
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

// Özet kartı zemini — marka koyu yeşili (antrasit beğenilmedi; EKLE/primary tonu)
const DARK_CARD_BG = colors.primary;

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
  },
  summaryCard: {
    margin: spacing.lg,
  },
  // Bağlantılı (paylaşılan) cari: kart çerçevesi yeşil
  summaryCardLinked: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  // Kart üstündeki kompakt "Bağlantılı · {paylaşan}" şeridi
  linkedStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + '22',
  },
  linkedStripText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  linkedStripPartner: {
    fontWeight: '400',
    color: colors.textSecondary,
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
  // Koyu kompakt cari dashboard'u (kullanıcının örnek ekranı düzeni)
  darkCard: {
    backgroundColor: DARK_CARD_BG,
    borderRadius: borderRadius.xl,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  darkLinkedStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  darkLinkedText: {
    color: '#CDE7DF',
    fontSize: fontSize.xs,
    fontWeight: '600',
    flexShrink: 1,
  },
  // Ara / WhatsApp kısayol satırı
  iletisimRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  iletisimBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iletisimText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  // Vadesi Geçen İşlemler akordiyonu
  gecikenCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.errorLight,
    overflow: 'hidden',
  },
  gecikenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  gecikenTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.error,
  },
  gecikenToplam: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.error,
    flexShrink: 1,
  },
  gecikenList: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  gecikenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  gecikenInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  gecikenDesc: {
    fontWeight: '600',
  },
  gecikenGun: {
    color: colors.error,
    fontWeight: '700',
  },
  gecikenSag: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 1,
  },
  gecikenKalan: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.error,
  },
  gecikenTahsilBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  gecikenTahsilText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },
  gecikenWaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: '#25D366',
  },
  gecikenWaText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  // Üst satır: isim solda, kalan bakiye sağda
  darkTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  darkTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  darkTitle: {
    color: colors.white,
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  darkType: {
    color: '#DFF0EA',
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  darkBalanceWrap: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 1,
    maxWidth: '55%',
  },
  darkBalanceValue: {
    color: colors.white,
    fontSize: fontSize['2xl'],
    fontWeight: '800',
  },
  darkRows: {},
  darkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  // Yeşil zeminde ince, hafif saydam ayraç — satırları görsel olarak ayırır
  darkRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  darkRowDividerTop: {
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  // Okunurluk: yeşil zeminde neredeyse-beyaz etiketler, kalın beyaz değerler
  darkLabel: {
    color: '#E9F5F0',
    fontSize: fontSize.md,
    fontWeight: '600',
    flexShrink: 1,
  },
  darkValue: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '800',
    flexShrink: 1,
  },
  darkValueDanger: {
    color: '#FFC4BD',
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
  // Başlangıç bakiyesi düz satırı — TransactionRow ile aynı dolgu/çizgi (bitişik görünüm)
  initialBalanceFlatRow: {
    backgroundColor: colors.surface,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
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
  addBalanceCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight + '20',
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
  fabSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.info,
  },
});
