import { useState, useCallback, useRef, useMemo, useEffect, memo } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity, Modal, ListRenderItemInfo } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import {
  Wallet,
  CreditCard,
  Banknote,
  CircleDollarSign,
  Pencil,
  Trash2,
  MoreVertical,
  Share2,
  Zap,
} from 'lucide-react-native';
import { BackButton } from '@/components/ui/BackButton';
import { Text, Card, Button, EmptyState, ArchivedBanner } from '@/components/ui';
import { IleriTarihliIslemlerSection } from '@/components/ui/IleriTarihliIslemlerSection';
import { DetailExportSection, DetailActionMenu } from '@/components/detail';
import { TransactionRow, DateSectionHeader } from '@/components/ui/TransactionRow';
import { useUrunKalemlerByIslemIds, type UrunKalemOzet } from '@/hooks/useUrunHareketler';
import { SwipeableRow, SwipeableProvider } from '@/components/ui/SwipeableRow';
import { UndoSnackbar } from '@/components/ui/UndoSnackbar';
import { BekleyenCeklerSection, CekKesSheet } from '@/components/cek';
import { QuickTransactionBar, CreditCardTransactionBar, TransactionType, PhotoViewerModal, ProductDetailModal } from '@/components/transaction';
import { AddNoteButton } from '@/components/notes/AddNoteButton';
import { NoteListRow } from '@/components/notes/NoteListRow';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateSmart } from '@/lib/date';
import { preprocessTransactionsByDate, mergeNotesIntoGroupedData, getTransactionDetailItemType, TransactionListItem } from '@/lib/transactionGrouping';
import { useNotlarByEntity } from '@/hooks/useNotlar';
import { useDetailNoteHandlers } from '@/hooks/useDetailNoteHandlers';
import { NoteInputModal } from '@/components/notes/NoteInputModal';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useHesap, useDeleteHesap, useUpdateHesap } from '@/hooks/useHesaplar';
import { useUnarchiveHesap } from '@/hooks/useArchive';
import { useIslemlerByHesap, useDeleteIslem, useUpdateIslem } from '@/hooks/useIslemler';
import { useDeleteIslemPhoto, usePickImage, useTakePhoto, useUploadIslemPhoto } from '@/hooks/useIslemPhoto';
import { useAuthContext } from '@/contexts/AuthContext';
import { useIleriTarihliIslemlerByHesap } from '@/hooks/useIleriTarihliIslemler';
import { useCeklerByHesap } from '@/hooks/useCekler';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { useSettings } from '@/hooks/useSettings';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { IslemWithRelations, Currency, IslemType, Not } from '@/types/database';
import { isLeaveType } from '@/constants/islemTypes';
import { useTranslation } from 'react-i18next';
import { toErrorMessage } from '@/lib/errors';
import { usePermissions } from '@/hooks/usePermissions';

// ============================================================================
// MEMOIZED TRANSACTION ITEM COMPONENT
// ============================================================================

interface HesapTransactionItemProps {
  islem: IslemWithRelations;
  hesapId: string;
  hesapCurrency: Currency;
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
  onViewPhoto: (path: string, islemId: string) => void;
  t: (key: string) => string;
  deleteLabel: string;
  copyLabel: string;
  canEdit?: boolean;
  currentUserId?: string;
  urunItems?: UrunKalemOzet[];
}

function getCreatorName(islem: IslemWithRelations): string | null {
  if (!islem.creator) return null;
  return islem.creator.display_name || islem.creator.email || null;
}

// Helper fonksiyonlar - component dışında tanımlı (her render'da yeniden oluşturulmaz)

const COLOR_IN = '#059669';
const COLOR_OUT = '#DC2626';
const COLOR_NEUTRAL = '#6B7280';

function getHesapPerspectiveColor(type: string, hesapId: string, hedefHesapId: string | null): string {
  if (type === 'transfer') {
    return hedefHesapId === hesapId ? COLOR_IN : COLOR_OUT;
  }
  if (type === 'cari_alis_iade' || type === 'cari_satis_iade') {
    return COLOR_NEUTRAL;
  }
  // İzin işlemleri parasal değil, nötr göster
  if (type === 'personel_izin_hakki' || type === 'personel_izin_kullanimi') {
    return COLOR_NEUTRAL;
  }
  if (type === 'gelir' || type === 'cari_tahsilat' || type === 'cari_satis' || type === 'personel_tahsilat' || type === 'personel_satis') {
    return COLOR_IN;
  }
  return COLOR_OUT;
}

function getHesapPerspectivePrefix(type: string, hesapId: string, hedefHesapId: string | null): string {
  if (type === 'transfer') {
    return hedefHesapId === hesapId ? '+' : '-';
  }
  if (type === 'cari_alis_iade' || type === 'cari_satis_iade') {
    return '↩ ';
  }
  // İzin işlemleri parasal değil, prefix yok
  if (type === 'personel_izin_hakki' || type === 'personel_izin_kullanimi') {
    return '';
  }
  if (type === 'gelir' || type === 'cari_tahsilat' || type === 'cari_satis' || type === 'personel_tahsilat' || type === 'personel_satis') {
    return '+';
  }
  return '-';
}

function getTransactionTarget(islem: IslemWithRelations, hesapId: string): { name: string; incoming: boolean } | null {
  switch (islem.type) {
    case 'transfer': {
      const incoming = islem.hedef_hesap_id === hesapId;
      const name = incoming
        ? (islem.hesap?.name || null)
        : (islem.hedef_hesap?.name || null);
      return name ? { name, incoming } : null;
    }
    case 'cari_odeme':
    case 'cari_tahsilat':
    case 'cari_alis':
    case 'cari_satis':
      return islem.cari?.name ? { name: islem.cari.name, incoming: false } : null;
    case 'personel_odeme':
    case 'personel_gider': {
      if (islem.personel) {
        const name = `${islem.personel.first_name ?? ''} ${islem.personel.last_name ?? ''}`.trim();
        return name ? { name, incoming: false } : null;
      }
      return null;
    }
    default:
      return null;
  }
}

function calculateTargetAmountForDisplay(islem: IslemWithRelations): number {
  const sourceAmount = Number(islem.amount);
  if (!islem.source_currency || !islem.target_currency ||
      islem.source_currency === islem.target_currency ||
      !islem.exchange_rate || islem.exchange_rate <= 0) {
    return sourceAmount;
  }
  if (islem.source_currency === 'TRY') {
    return sourceAmount / islem.exchange_rate;
  } else {
    return sourceAmount * islem.exchange_rate;
  }
}

function getDisplayAmount(islem: IslemWithRelations, hesapId: string): number {
  const sourceAmount = Number(islem.amount);
  if (!islem.source_currency || !islem.target_currency ||
      islem.source_currency === islem.target_currency) {
    return sourceAmount;
  }
  const isTargetAccount = islem.hedef_hesap_id === hesapId;
  if (isTargetAccount) {
    return calculateTargetAmountForDisplay(islem);
  }
  return sourceAmount;
}

/**
 * Cross-currency işlemlerde hesap perspektifinden karşı taraftaki tutarı döner.
 * Kaynak hesaptan bakıyorsan: hedef tutarı döner
 * Hedef hesaptan bakıyorsan: kaynak tutarı döner
 */
function getCrossCurrencySubText(islem: IslemWithRelations, hesapId: string): string | null {
  if (!islem.source_currency || !islem.target_currency ||
      islem.source_currency === islem.target_currency ||
      !islem.exchange_rate) {
    return null;
  }
  const sourceAmount = Number(islem.amount);
  const targetAmount = calculateTargetAmountForDisplay(islem);
  const isTargetAccount = islem.hedef_hesap_id === hesapId;

  if (isTargetAccount) {
    // Hedef hesaptayız, kaynak tutarı göster
    return formatCurrency(sourceAmount, islem.source_currency as Currency);
  } else {
    // Kaynak hesaptayız, hedef tutarı göster
    return formatCurrency(targetAmount, islem.target_currency as Currency);
  }
}

function getHareketLabelKey(type: string): string {
  switch (type) {
    case 'gelir': return 'accounts:transactionLabels.gelir';
    case 'gider': return 'accounts:transactionLabels.gider';
    case 'transfer': return 'accounts:transactionLabels.transfer';
    case 'cari_alis': return 'accounts:transactionLabels.cariAlis';
    case 'cari_satis': return 'accounts:transactionLabels.cariSatis';
    case 'cari_odeme': return 'accounts:transactionLabels.cariOdeme';
    case 'cari_tahsilat': return 'accounts:transactionLabels.cariTahsilat';
    case 'cari_alis_iade': return 'accounts:transactionLabels.cariAlisIade';
    case 'cari_satis_iade': return 'accounts:transactionLabels.cariSatisIade';
    case 'personel_odeme': return 'accounts:transactionLabels.personelOdeme';
    case 'personel_gider': return 'accounts:transactionLabels.personelGider';
    case 'personel_tahsilat': return 'accounts:transactionLabels.personelTahsilat';
    case 'personel_satis': return 'accounts:transactionLabels.personelSatis';
    case 'personel_izin_hakki': return 'accounts:transactionLabels.izinHakki';
    case 'personel_izin_kullanimi': return 'accounts:transactionLabels.izinKullanimi';
    default: return '';
  }
}

const HesapTransactionItem = memo(function HesapTransactionItem({
  islem,
  hesapId,
  hesapCurrency,
  onPress,
  onDelete,
  onCopy,
  onViewPhoto,
  t,
  deleteLabel,
  copyLabel,
  canEdit = true,
  currentUserId,
  urunItems,
}: HesapTransactionItemProps) {
  const handleDelete = useCallback(() => onDelete(islem.id), [onDelete, islem.id]);
  const handleCopy = useCallback(() => onCopy(islem.id), [onCopy, islem.id]);
  const handlePhotoPress = useCallback(() => {
    if (islem.photo_path) onViewPhoto(islem.photo_path, islem.id);
  }, [onViewPhoto, islem.photo_path, islem.id]);

  const target = getTransactionTarget(islem, hesapId);
  const labelKey = getHareketLabelKey(islem.type);
  const typeLabel = labelKey ? t(labelKey) : islem.type;
  const entityText = target
    ? `${target.incoming ? '← ' : '→ '}${target.name}`
    : null;
  const creatorText = (islem.created_by && islem.created_by !== currentUserId) ? getCreatorName(islem) : null;

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
        amount={getDisplayAmount(islem, hesapId)}
        date={formatDateSmart(islem.date)}
        typeLabel={typeLabel}
        entityText={entityText}
        secondaryText={islem.kategori?.name || null}
        tertiaryText={islem.description || null}
        creatorText={creatorText}
        hasPhoto={!!islem.photo_path}
        hasUrunler={(urunItems?.length ?? 0) > 0}
        urunCount={urunItems?.length ?? 0}
        currency={hesapCurrency}
        urunItems={urunItems}
        subAmount={getCrossCurrencySubText(islem, hesapId)}
        overrideColor={getHesapPerspectiveColor(islem.type, hesapId, islem.hedef_hesap_id)}
        overridePrefix={getHesapPerspectivePrefix(islem.type, hesapId, islem.hedef_hesap_id)}
        onPress={onPress}
        onPhotoPress={handlePhotoPress}
      />
    </SwipeableRow>
  );
}, (prev, next) => {
  return prev.islem.id === next.islem.id
    && prev.islem.updated_at === next.islem.updated_at
    && prev.islem.photo_path === next.islem.photo_path
    && prev.hesapCurrency === next.hesapCurrency
    && prev.canEdit === next.canEdit
    && prev.currentUserId === next.currentUserId
    && prev.urunItems === next.urunItems;
});

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function HesapHareketleriPage() {
  if (__DEV__) {
    console.log('=== HESAP DETAY SAYFASI YUKLENDI ===');
  }
  const { id, expandIslemId } = useLocalSearchParams<{ id: string; expandIslemId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(['accounts', 'common', 'errors', 'checks']);
  const { formatDateMedium, formatDateShort } = useDateFormat();

  const { data: hesap, isLoading: hesapLoading, refetch: refetchHesap } = useHesap(id!);
  const { data: islemler, isLoading: islemlerLoading, hasNextPage, fetchNextPage, isFetchingNextPage, refetch: refetchIslemler } = useIslemlerByHesap(id!);
  // Ürün kalemleri (satırda önizleme) — tek batch sorgu, N+1 yok
  const islemIdList = useMemo(() => (islemler || []).map((i) => i.id), [islemler]);
  const { getUrunItems } = useUrunKalemlerByIslemIds(islemIdList);
  const { data: ileriTarihliIslemler, isLoading: ileriTarihliLoading } = useIleriTarihliIslemlerByHesap(id!);
  const { data: bekleyenCekler, isLoading: ceklerLoading } = useCeklerByHesap(id!);
  const { data: entityNotes } = useNotlarByEntity('hesap', id!);
  const { canUpdate, canDelete } = usePermissions();
  const deleteIslem = useDeleteIslem();
  const deleteHesap = useDeleteHesap();
  const updateHesap = useUpdateHesap();
  const unarchiveHesap = useUnarchiveHesap();
  const updateIslem = useUpdateIslem();
  const deletePhoto = useDeleteIslemPhoto();
  const pickImage = usePickImage();
  const takePhoto = useTakePhoto();
  const uploadPhoto = useUploadIslemPhoto();
  const { isletme, user } = useAuthContext();
  const {
    editingNoteId, setEditingNoteId, editingNote,
    handleNoteUpdate, handleNoteDelete, handleToggleNoteCompletion, handleMarkAsTask,
    isUpdatingNote,
  } = useDetailNoteHandlers({ entityType: 'hesap', entityId: id!, entityNotes, isletmeId: isletme?.id });

  // Döviz kurları ve kullanıcı para birimi
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;
  const { currency: baseCurrency } = useSettings();

  const handleUnarchive = useCallback(async () => {
    try {
      await unarchiveHesap.mutateAsync(id!);
      Alert.alert(t('common:status.success'), t('common:archive.messages.unarchiveSuccess'));
      router.back();
    } catch (error) {
      Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
    }
  }, [unarchiveHesap, id, t, router]);

  const [showTransactionBar, setShowTransactionBar] = useState(false);
  const [transactionType, setTransactionType] = useState<TransactionType>('gelir');
  const [showMenu, setShowMenu] = useState(false);
  const [showCekKesSheet, setShowCekKesSheet] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  // Edit transaction state
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);
  // Ürün detay modal state (ürünlü işleme tıklanınca)
  const [productDetailIslemId, setProductDetailIslemId] = useState<string | null>(null);
  // Copy transaction state
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [showCopyBar, setShowCopyBar] = useState(false);
  // Photo viewer state
  const [viewPhotoPath, setViewPhotoPath] = useState<string | null>(null);
  const [viewPhotoIslemId, setViewPhotoIslemId] = useState<string | null>(null);
  const [notePhotoPath, setNotePhotoPath] = useState<string | null>(null);
  const [isPhotoActionLoading, setIsPhotoActionLoading] = useState(false);
  const isOpeningRef = useRef(false);

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

  const paymentDueDayInfo = useMemo(() => {
    if (hesap?.type !== 'kredi_karti' || !hesap.payment_due_day) return null;
    const today = new Date();
    const currentDay = today.getDate();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowDay = tomorrow.getDate();
    const isToday = currentDay === hesap.payment_due_day;
    const isTomorrow = tomorrowDay === hesap.payment_due_day;
    const hint = isToday
      ? ` (${t('accounts:creditCard.paymentDueDayToday')})`
      : isTomorrow
        ? ` (${t('accounts:creditCard.paymentDueDayTomorrow')})`
        : '';
    return { day: hesap.payment_due_day, isToday, isTomorrow, hint };
  }, [hesap?.type, hesap?.payment_due_day, t]);

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
      await Promise.all([refetchHesap(), refetchIslemler()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchHesap, refetchIslemler]);

  // Debounced transaction opener to prevent race conditions
  const openTransaction = useCallback((type: TransactionType) => {
    if (isOpeningRef.current) return;
    isOpeningRef.current = true;

    setTransactionType(type);
    setShowTransactionBar(true);

    // Reset guard after animation completes
    setTimeout(() => {
      isOpeningRef.current = false;
    }, 500);
  }, []);

  // Cross-currency işlemler için hesabın para birimi cinsinden tutarı al
  const getAmountInAccountCurrency = useCallback((islem: IslemWithRelations): number => {
    const sourceAmount = Number(islem.amount);
    if (!islem.source_currency || !islem.target_currency ||
        islem.source_currency === islem.target_currency) {
      return sourceAmount;
    }
    if (!islem.exchange_rate || islem.exchange_rate <= 0) {
      return sourceAmount;
    }
    const isTargetAccount = islem.hedef_hesap_id === id;
    if (isTargetAccount) {
      if (islem.source_currency === 'TRY') {
        return sourceAmount / islem.exchange_rate;
      } else {
        return sourceAmount * islem.exchange_rate;
      }
    }
    return sourceAmount;
  }, [id]);

  // Başlangıç bakiyesini hesapla - MEMOIZED
  const calculatedInitialBalance = useMemo(() => {
    if (!hesap || !islemler) return 0;

    let totalEffect = 0;
    islemler.forEach((islem) => {
      // İzin işlemleri gün bazlıdır, parasal bakiye hesaplamasına dahil edilmez
      if (isLeaveType(islem.type as IslemType)) return;

      const amount = getAmountInAccountCurrency(islem as IslemWithRelations);
      if (islem.type === 'transfer') {
        if (islem.hedef_hesap_id === id) {
          totalEffect += amount;
        } else {
          totalEffect -= amount;
        }
      } else if (islem.type === 'gelir' || islem.type === 'cari_tahsilat') {
        totalEffect += amount;
      } else {
        totalEffect -= amount;
      }
    });

    return Number(hesap.balance) - totalEffect;
  }, [hesap, islemler, id, getAmountInAccountCurrency]);

  const initialBalance = hesap?.initial_balance !== undefined && hesap?.initial_balance !== null
    ? Number(hesap.initial_balance)
    : calculatedInitialBalance;

  // === MEMOIZED HANDLERS for FlatList items ===
  const handlePressIslem = useCallback((islemId: string) => {
    // Ürünlü işlem → ürün detay modalı; değilse düzenleme barı (cariler ile aynı standart)
    if ((getUrunItems(islemId)?.length ?? 0) > 0) {
      setProductDetailIslemId(islemId);
      return;
    }
    setEditTransactionId(islemId);
    setShowEditBar(true);
  }, [getUrunItems]);

  const handleDeleteIslem = useCallback((islemId: string) => {
    const islem = (islemler || []).find(i => i.id === islemId);
    if (islem) {
      const labelKey = getHareketLabelKey(islem.type);
      const desc = islem.description || (labelKey.includes(':') ? t(labelKey) : t(`transactions:types.${islem.type}`));
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

  const handleViewPhoto = useCallback((path: string, islemId: string) => {
    setViewPhotoPath(path);
    setViewPhotoIslemId(islemId);
  }, []);

  const handleDeleteHesap = () => {
    setShowMenu(false);
    Alert.alert(
      t('accounts:deleteConfirm.accountTitle'),
      t('accounts:deleteConfirm.accountMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteHesap.mutateAsync(id!);
              router.replace('/(tabs)');
            } catch (error) {
              Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:account.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  // Photo delete handler
  const handleDeletePhoto = async () => {
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
  };

  // Photo change handler
  const handleChangePhoto = () => {
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
  };

  // Upload new photo (for change)
  const uploadNewPhoto = async (uri: string) => {
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
  };

  const getHesapIcon = (type: string) => {
    switch (type) {
      case 'nakit':
        return <Banknote size={32} color={colors.success} />;
      case 'banka':
        return <CreditCard size={32} color={colors.info} />;
      case 'kredi_karti':
        return <CreditCard size={32} color={colors.warning} />;
      default:
        return <Wallet size={32} color={colors.primary} />;
    }
  };

  // Header right buttons (share + menu)
  const headerRightElement = useMemo(() => (
    <View style={styles.headerRightContainer}>
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
  ), []);

  // === DATE GROUPING ===
  const groupedData = useMemo(() => {
    if (!islemler) return [];
    const filtered = islemler.filter(i => !pendingDeleteIds.has(i.id));
    const txnData = preprocessTransactionsByDate(
      filtered,
      t('common:date.today'),
      t('common:date.yesterday'),
      formatDateMedium,
    );
    return mergeNotesIntoGroupedData(
      txnData,
      entityNotes ?? [],
      t('common:date.today'),
      t('common:date.yesterday'),
      formatDateMedium,
    );
  }, [islemler, pendingDeleteIds, t, formatDateMedium, entityNotes]);

  // Localized labels for swipe actions (stable refs)
  const deleteLabel = t('common:buttons.delete');
  const copyLabel = t('common:buttons.copy');

  // === FlatList renderItem ===
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
        />
      );
    }
    const islem = item.data;
    const canEditItem = canDelete('islemler', islem.created_by ?? null);
    return (
      <HesapTransactionItem
        islem={islem}
        hesapId={id!}
        hesapCurrency={(hesap?.currency ?? 'TRY') as Currency}
        onPress={handlePressIslem}
        onDelete={handleDeleteIslem}
        onCopy={handleCopyIslem}
        onViewPhoto={handleViewPhoto}
        t={t}
        deleteLabel={deleteLabel}
        copyLabel={copyLabel}
        canEdit={canEditItem}
        currentUserId={user?.id}
        urunItems={getUrunItems(islem.id)}
      />
    );
  }, [id, hesap?.currency, handlePressIslem, handleDeleteIslem, handleCopyIslem, handleViewPhoto, handleNoteDelete, handleToggleNoteCompletion, handleMarkAsTask, t, deleteLabel, copyLabel, canDelete, user?.id, getUrunItems]);

  const keyExtractor = useCallback((item: TransactionListItem) => item.key, []);

  // === FlatList ListHeaderComponent ===
  const ListHeader = useMemo(() => {
    if (!hesap) return null;
    return (
      <View>
        {/* Arşiv Banner */}
        {hesap.is_archived && (
          <View style={styles.bannerContainer}>
            <ArchivedBanner
              onUnarchive={handleUnarchive}
              loading={unarchiveHesap.isPending}
            />
          </View>
        )}

        {/* Hesap Özeti */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryIcon}>
              {getHesapIcon(hesap.type)}
            </View>
            <View style={styles.summaryInfo}>
              <Text variant="caption" color="secondary">
                {hesap.type === 'kredi_karti' ? t('accounts:creditCard.currentDebt') : t('accounts:balance.currentBalance')}
              </Text>
              <Text variant="h2" color={Number(hesap.balance) >= 0 ? 'primary' : 'error'}>
                {formatCurrency(Math.abs(Number(hesap.balance)), hesap.currency)}
              </Text>
              {/* Farklı para birimindeyse base currency karşılığını göster */}
              {hesap.currency !== baseCurrency && exchangeRates && (
                <Text variant="body" color="secondary">
                  ~{formatCurrency(
                    convertCurrency(Math.abs(Number(hesap.balance)), hesap.currency, baseCurrency, exchangeRates) ?? 0,
                    baseCurrency
                  )}
                </Text>
              )}
            </View>
          </View>

          {/* Kredi Kartı Limit Bilgileri */}
          {hesap.type === 'kredi_karti' && hesap.credit_limit && hesap.credit_limit > 0 && (
            <View style={styles.creditLimitSection}>
              <View style={styles.creditLimitRow}>
                <View style={styles.creditLimitItem}>
                  <Text variant="caption" color="secondary">{t('accounts:creditCard.creditLimit')}</Text>
                  <Text variant="body" style={styles.creditLimitValue}>{formatCurrency(hesap.credit_limit, hesap.currency)}</Text>
                </View>
                <View style={styles.creditLimitItem}>
                  <Text variant="caption" color="secondary">{t('accounts:creditCard.usedCredit')}</Text>
                  <Text variant="body" style={[styles.creditLimitValue, { color: colors.error }]}>{formatCurrency(Math.abs(Number(hesap.balance)), hesap.currency)}</Text>
                </View>
                <View style={styles.creditLimitItem}>
                  <Text variant="caption" color="secondary">{t('accounts:creditCard.availableCredit')}</Text>
                  <Text variant="body" style={[styles.creditLimitValue, { color: colors.success }]}>{formatCurrency(Math.max(0, hesap.credit_limit - Math.abs(Number(hesap.balance))), hesap.currency)}</Text>
                </View>
              </View>
            </View>
          )}
          {/* Kredi Kartı Son Ödeme Günü */}
          {paymentDueDayInfo && (
            <View style={styles.paymentDueDayRow}>
              <Text variant="caption" color="secondary">{t('accounts:creditCard.paymentDueDay')}</Text>
              <Text variant="body" style={[styles.creditLimitValue, (paymentDueDayInfo.isToday || paymentDueDayInfo.isTomorrow) && { color: colors.warning }]}>
                {t('accounts:creditCard.paymentDueDayLabel', { day: paymentDueDayInfo.day })}{paymentDueDayInfo.hint}
              </Text>
            </View>
          )}
        </Card>

        {/* İleri Tarihli İşlemler */}
        <View style={styles.section}>
          <IleriTarihliIslemlerSection
            ileriTarihliIslemler={ileriTarihliIslemler}
            isLoading={ileriTarihliLoading}
          />

          {/* Bekleyen Çekler - Sadece banka hesapları için */}
          {hesap?.type === 'banka' && (
            <BekleyenCeklerSection
              cekler={bekleyenCekler}
              isLoading={ceklerLoading}
              hesapId={id}
            />
          )}

          {/* Hareketler */}
          <Text variant="h3" style={styles.sectionTitle}>
            {t('accounts:details.transactions')}
          </Text>

          {islemlerLoading && (
            <Text color="secondary">{t('common:status.loading')}</Text>
          )}
        </View>
      </View>
    );
  }, [hesap, ileriTarihliIslemler, ileriTarihliLoading, bekleyenCekler, ceklerLoading, islemlerLoading, baseCurrency, exchangeRates, id, t, handleUnarchive, unarchiveHesap.isPending, paymentDueDayInfo]);

  // === FlatList ListFooterComponent ===
  const ListFooter = useMemo(() => {
    if (!hesap || islemlerLoading) return null;
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
        {/* Başlangıç Bakiyesi - düzenleme/silme yok */}
        <Card style={styles.hareketCard}>
          <View style={styles.hareketHeader}>
            <View style={[styles.hareketIcon, { backgroundColor: colors.primaryLight + '30' }]}>
              <CircleDollarSign size={20} color={colors.primary} />
            </View>
            <View style={styles.hareketInfo}>
              <Text variant="body">{t('accounts:details.initialBalance')}</Text>
              <Text variant="caption" color="secondary">
                {t('accounts:details.accountOpening')} • {formatDateShort(hesap?.created_at || '')}
              </Text>
            </View>
            <Text variant="h3" color={initialBalance >= 0 ? 'primary' : 'error'}>
              {formatCurrency(initialBalance, hesap.currency)}
            </Text>
          </View>
        </Card>
      </View>
    );
  }, [hesap, islemlerLoading, initialBalance, t, hasNextPage, fetchNextPage, isFetchingNextPage]);

  // === FlatList ListEmptyComponent ===
  const ListEmpty = useMemo(() => {
    if (islemlerLoading) return null;
    return (
      <View style={styles.section}>
        <EmptyState
          title={t('accounts:details.noTransactions')}
        />
      </View>
    );
  }, [islemlerLoading, t]);

  if (hesapLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hesap) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon={<Wallet size={48} color={colors.textMuted} />}
          title={t('errors:account.notFound')}
          description={t('accounts:details.notFoundDescription')}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: hesap.name,
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
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
          />
        </SwipeableProvider>
      </SafeAreaView>

      <DetailActionMenu
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        actions={[
          { icon: Pencil, label: t('common:buttons.edit'), visible: canUpdate('hesaplar', hesap?.created_by ?? null), onPress: () => { setShowMenu(false); router.push({ pathname: '/hesaplar/duzenle/[id]', params: { id: id } }); } },
          { icon: Trash2, label: t('common:buttons.delete'), visible: canDelete('hesaplar', hesap?.created_by ?? null), danger: true, onPress: handleDeleteHesap },
        ]}
      />

      {/* Quick Transaction Bar - kredi kartı için özel bar */}
      {hesap.type === 'kredi_karti' ? (
        <CreditCardTransactionBar
          visible={showTransactionBar}
          onDismiss={() => setShowTransactionBar(false)}
          creditCard={hesap}
        />
      ) : (
        <QuickTransactionBar
          visible={showTransactionBar}
          onDismiss={() => setShowTransactionBar(false)}
          defaultType={transactionType}
          defaultHesapId={id}
        />
      )}

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
        defaultHesapId={id}
        onSuccess={() => {
          setShowCopyBar(false);
          setCopySourceId(null);
        }}
      />

      {/* Çek Kes Sheet */}
      <CekKesSheet
        visible={showCekKesSheet}
        onDismiss={() => setShowCekKesSheet(false)}
        defaultHesapId={id}
        defaultCurrency={hesap?.currency}
      />

      <DetailExportSection
        visible={showShareOptions}
        onDismiss={() => setShowShareOptions(false)}
        entityType="hesap"
        entityId={id!}
        entityName={hesap.name}
        entityCurrency={hesap.currency}
        currentBalance={Number(hesap.balance)}
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

      {/* Floating Not Ekle + Yeni İşlem FAB - arşivlenmiş hesaplarda gizle */}
      {!hesap.is_archived && (
        <>
          <AddNoteButton
            entityType="hesap"
            entityId={id!}
            style={{ position: 'absolute', right: spacing.lg, bottom: spacing.lg + insets.bottom + 70 }}
          />
          <TouchableOpacity
            style={[styles.fab, { bottom: spacing.lg + insets.bottom }]}
            onPress={() => {
              openTransaction(hesap.type === 'kredi_karti' ? 'kredi_karti_gider' as TransactionType : 'gelir');
            }}
            activeOpacity={0.8}
          >
            <Zap size={24} color={colors.surface} />
          </TouchableOpacity>
        </>
      )}
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
        entityType="hesap"
        entityId={id!}
        existingPhotoPath={editingNote?.photo_path}
      />
      <PhotoViewerModal
        visible={!!notePhotoPath}
        photoPath={notePhotoPath}
        onClose={() => setNotePhotoPath(null)}
      />
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
  },
  bannerContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  summaryCard: {
    margin: spacing.lg,
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
    backgroundColor: colors.primaryLight + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryInfo: {
    flex: 1,
  },
  creditLimitSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  creditLimitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  creditLimitItem: {
    alignItems: 'center',
    flex: 1,
  },
  creditLimitValue: {
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  paymentDueDayRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
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
