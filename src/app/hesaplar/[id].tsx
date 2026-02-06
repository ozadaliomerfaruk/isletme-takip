import { useState, useCallback, useRef, useMemo, memo } from 'react';
import { View, StyleSheet, FlatList, Alert, TouchableOpacity, Modal, TextInput, ListRenderItemInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  Wallet,
  CreditCard,
  Banknote,
  CircleDollarSign,
  Pencil,
  Trash2,
  Clock,
  MoreVertical,
  FileCheck,
  X,
  Share2,
  Image as ImageIcon,
} from 'lucide-react-native';
import { Text, Card, ExpandableCard, Button, EmptyState, IleriTarihliIslemlerSection, ArchivedBanner } from '@/components/ui';
import { BekleyenCeklerSection, CekKesSheet } from '@/components/cek';
import { QuickTransactionBar, CreditCardTransactionBar, TransactionType, PhotoViewerModal } from '@/components/transaction';
import { ExportSheet } from '@/components/export';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateShort, formatDateSmart, formatTime, isSameYear } from '@/lib/date';
import { useHesap, useDeleteHesap, useUpdateHesap } from '@/hooks/useHesaplar';
import { useUnarchiveHesap } from '@/hooks/useArchive';
import { useIslemlerByHesap, useDeleteIslem, useUpdateIslem } from '@/hooks/useIslemler';
import { useDeleteIslemPhoto, usePickImage, useTakePhoto, useUploadIslemPhoto } from '@/hooks/useIslemPhoto';
import { useAuthContext } from '@/contexts/AuthContext';
import { useIleriTarihliIslemlerByHesap } from '@/hooks/useIleriTarihliIslemler';
import { useCeklerByHesap } from '@/hooks/useCekler';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { useSettings } from '@/hooks/useSettings';
import { IslemWithRelations, Currency } from '@/types/database';
import { useTranslation } from 'react-i18next';

// ============================================================================
// MEMOIZED TRANSACTION ITEM COMPONENT
// ============================================================================

interface HesapTransactionItemProps {
  islem: IslemWithRelations;
  hesapId: string;
  hesapCurrency: Currency;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onViewPhoto: (path: string, islemId: string) => void;
  t: (key: string) => string;
}

// Helper fonksiyonlar - component dışında tanımlı (her render'da yeniden oluşturulmaz)
function getHareketIcon(type: string, isIncoming: boolean) {
  if (type === 'transfer') {
    return isIncoming
      ? <ArrowLeft size={20} color={colors.success} />
      : <ArrowRight size={20} color={colors.error} />;
  }
  if (type === 'gelir' || type === 'cari_tahsilat') {
    return <ArrowLeft size={20} color={colors.success} />;
  }
  return <ArrowRight size={20} color={colors.error} />;
}

function isIncomingTransaction(type: string, hedefHesapId: string | null, hesapId: string): boolean {
  if (type === 'transfer') {
    return hedefHesapId === hesapId;
  }
  return type === 'gelir' || type === 'cari_tahsilat';
}

function getAmountSign(type: string, hesapId: string, hedefHesapId: string | null): string {
  if (type === 'transfer') {
    return hedefHesapId === hesapId ? '+' : '-';
  }
  if (type === 'gelir' || type === 'cari_tahsilat') {
    return '+';
  }
  return '-';
}

function getAmountColor(type: string, hesapId: string, hedefHesapId: string | null): 'success' | 'error' | 'primary' {
  if (type === 'transfer') {
    return hedefHesapId === hesapId ? 'success' : 'error';
  }
  if (type === 'gelir' || type === 'cari_tahsilat') {
    return 'success';
  }
  return 'error';
}

function getTransactionTarget(islem: IslemWithRelations, hesapId: string): string | null {
  switch (islem.type) {
    case 'transfer':
      if (islem.hedef_hesap_id === hesapId) {
        return islem.hesap?.name || null;
      }
      return islem.hedef_hesap?.name || null;
    case 'cari_odeme':
    case 'cari_tahsilat':
    case 'cari_alis':
    case 'cari_satis':
      return islem.cari?.name || null;
    case 'personel_odeme':
    case 'personel_gider':
      if (islem.personel) {
        return `${islem.personel.first_name ?? ''} ${islem.personel.last_name ?? ''}`.trim() || null;
      }
      return null;
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

function getCrossCurrencyInfo(islem: IslemWithRelations): string | null {
  if (!islem.source_currency || !islem.target_currency || islem.source_currency === islem.target_currency) {
    return null;
  }
  const sourceAmount = Number(islem.amount);
  const targetAmount = calculateTargetAmountForDisplay(islem);
  const formattedSource = formatCurrency(sourceAmount, islem.source_currency as Currency);
  const formattedTarget = formatCurrency(targetAmount, islem.target_currency as Currency);
  return `(${formattedSource} → ${formattedTarget})`;
}

function getHareketLabelKey(type: string): string {
  switch (type) {
    case 'gelir': return 'accounts:transactionLabels.gelir';
    case 'gider': return 'accounts:transactionLabels.gider';
    case 'transfer': return 'accounts:transactionLabels.transfer';
    case 'cari_odeme': return 'accounts:transactionLabels.cariOdeme';
    case 'cari_tahsilat': return 'accounts:transactionLabels.cariTahsilat';
    case 'personel_odeme': return 'accounts:transactionLabels.personelOdeme';
    case 'personel_gider': return 'accounts:transactionLabels.personelGider';
    case 'nakit_avans_taksit': return 'accounts:transactionLabels.nakitAvansTaksit';
    default: return '';
  }
}

const HesapTransactionItem = memo(function HesapTransactionItem({
  islem,
  hesapId,
  hesapCurrency,
  isExpanded,
  onToggle,
  onDelete,
  onEdit,
  onViewPhoto,
  t,
}: HesapTransactionItemProps) {
  const sign = getAmountSign(islem.type, hesapId, islem.hedef_hesap_id);
  const colorType = getAmountColor(islem.type, hesapId, islem.hedef_hesap_id);
  const isIncoming = isIncomingTransaction(islem.type, islem.hedef_hesap_id, hesapId);
  const target = getTransactionTarget(islem, hesapId);
  const showTimeInExpanded = !isSameYear(islem.date);
  const crossCurrencyInfo = getCrossCurrencyInfo(islem);
  const labelKey = getHareketLabelKey(islem.type);

  return (
    <ExpandableCard
      expanded={isExpanded}
      onToggle={() => onToggle(islem.id)}
      disableAnimation
      header={
        <View style={styles.hareketHeader}>
          <View style={[
            styles.hareketIcon,
            {
              backgroundColor: colorType === 'success'
                ? colors.successLight
                : colorType === 'error'
                  ? colors.errorLight
                  : colors.infoLight
            }
          ]}>
            {getHareketIcon(islem.type, isIncoming)}
          </View>
          <View style={styles.hareketInfo}>
            <Text variant="body">{formatDateSmart(islem.date)}</Text>
            <Text variant="caption" color="secondary">
              {labelKey ? t(labelKey) : islem.type}
            </Text>
            {target && (
              <Text variant="caption" color="secondary">
                {target}
              </Text>
            )}
            {crossCurrencyInfo && (
              <Text variant="caption" style={styles.crossCurrencyText}>
                {crossCurrencyInfo}
              </Text>
            )}
            {islem.kategori?.name && (
              <Text variant="caption" color="secondary">
                {islem.kategori.name}
              </Text>
            )}
            {islem.description && (
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {islem.description}
              </Text>
            )}
          </View>
          <View style={styles.amountContainer}>
            {islem.photo_path && (
              <ImageIcon size={16} color={colors.primary} style={styles.photoIndicator} />
            )}
            <Text variant="h3" color={colorType}>
              {sign}{formatCurrency(getDisplayAmount(islem, hesapId), hesapCurrency)}
            </Text>
          </View>
        </View>
      }
    >
      {showTimeInExpanded && (
        <View style={styles.timeRow}>
          <Clock size={14} color={colors.textMuted} />
          <Text variant="caption" color="secondary">
            {t('accounts:details.time')} {formatTime(islem.date)}
          </Text>
        </View>
      )}
      <View style={styles.hareketActions}>
        {islem.photo_path && (
          <Button
            variant="secondary"
            size="sm"
            icon={<ImageIcon size={16} color={colors.primary} />}
            onPress={() => onViewPhoto(islem.photo_path!, islem.id)}
            style={styles.actionButton}
          >
            {t('common:photo.title')}
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          icon={<Pencil size={16} color={colors.text} />}
          onPress={() => onEdit(islem.id)}
          style={styles.actionButton}
        >
          {t('common:buttons.edit')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={<Trash2 size={16} color={colors.error} />}
          onPress={() => onDelete(islem.id)}
          style={styles.actionButton}
        >
          {t('common:buttons.delete')}
        </Button>
      </View>
    </ExpandableCard>
  );
}, (prev, next) => {
  return prev.islem.id === next.islem.id
    && prev.isExpanded === next.isExpanded
    && prev.islem.updated_at === next.islem.updated_at
    && prev.hesapCurrency === next.hesapCurrency;
});

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function HesapHareketleriPage() {
  if (__DEV__) {
    console.log('=== HESAP DETAY SAYFASI YUKLENDI ===');
  }
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation(['accounts', 'common', 'errors', 'checks']);

  const { data: hesap, isLoading: hesapLoading } = useHesap(id!);
  const { data: islemler, isLoading: islemlerLoading } = useIslemlerByHesap(id!);
  const { data: ileriTarihliIslemler, isLoading: ileriTarihliLoading } = useIleriTarihliIslemlerByHesap(id!);
  const { data: bekleyenCekler, isLoading: ceklerLoading } = useCeklerByHesap(id!);
  const deleteIslem = useDeleteIslem();
  const deleteHesap = useDeleteHesap();
  const updateHesap = useUpdateHesap();
  const unarchiveHesap = useUnarchiveHesap();
  const updateIslem = useUpdateIslem();
  const deletePhoto = useDeleteIslemPhoto();
  const pickImage = usePickImage();
  const takePhoto = useTakePhoto();
  const uploadPhoto = useUploadIslemPhoto();
  const { isletme } = useAuthContext();

  // Döviz kurları ve kullanıcı para birimi
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;
  const { currency: baseCurrency } = useSettings();

  const handleUnarchive = async () => {
    try {
      await unarchiveHesap.mutateAsync(id!);
      Alert.alert(t('common:status.success'), t('common:archive.messages.unarchiveSuccess'));
    } catch (error) {
      Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
    }
  };

  const [expandedIslemId, setExpandedIslemId] = useState<string | null>(null);
  const [showTransactionBar, setShowTransactionBar] = useState(false);
  const [transactionType, setTransactionType] = useState<TransactionType>('gelir');
  const [showMenu, setShowMenu] = useState(false);
  const [showCekKesSheet, setShowCekKesSheet] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [editBalanceModalVisible, setEditBalanceModalVisible] = useState(false);
  const [newBalanceInput, setNewBalanceInput] = useState('');
  // Edit transaction state
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);
  // Photo viewer state
  const [viewPhotoPath, setViewPhotoPath] = useState<string | null>(null);
  const [viewPhotoIslemId, setViewPhotoIslemId] = useState<string | null>(null);
  const [isPhotoActionLoading, setIsPhotoActionLoading] = useState(false);
  const isOpeningRef = useRef(false);

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

  // Bakiye düzenleme modal'ını aç
  const handleOpenEditBalance = useCallback(() => {
    setNewBalanceInput(String(Number(hesap?.balance) || 0));
    setEditBalanceModalVisible(true);
  }, [hesap?.balance]);

  // Bakiye kaydet
  const handleSaveBalance = async () => {
    const newBalance = parseFloat(newBalanceInput.replace(',', '.'));
    if (isNaN(newBalance)) {
      Alert.alert(t('common:status.error'), t('accounts:messages.invalidBalance'));
      return;
    }

    Alert.alert(
      t('accounts:balance.editBalance'),
      t('accounts:balance.confirmChange', {
        oldBalance: formatCurrency(Number(hesap?.balance) || 0, hesap?.currency),
        newBalance: formatCurrency(newBalance, hesap?.currency),
      }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.save'),
          onPress: async () => {
            try {
              await updateHesap.mutateAsync({ id: id!, balance: newBalance });
              setEditBalanceModalVisible(false);
              Alert.alert(t('common:status.success'), t('accounts:messages.balanceUpdated'));
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : t('common:messages.operationFailed');
              Alert.alert(t('common:status.error'), message);
            }
          },
        },
      ]
    );
  };

  // === MEMOIZED HANDLERS for FlatList items ===
  const handleToggleIslem = useCallback((islemId: string) => {
    setExpandedIslemId(prev => prev === islemId ? null : islemId);
  }, []);

  const handleDeleteIslem = useCallback((islemId: string) => {
    Alert.alert(
      t('accounts:deleteConfirm.transactionTitle'),
      t('accounts:deleteConfirm.transactionMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteIslem.mutateAsync(islemId);
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('errors:transaction.deleteFailed'));
            }
          },
        },
      ]
    );
  }, [deleteIslem, t]);

  const handleEditIslem = useCallback((islemId: string) => {
    setEditTransactionId(islemId);
    setShowEditBar(true);
    setExpandedIslemId(null);
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
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('errors:account.deleteFailed'));
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
  const HeaderRightButtons = () => (
    <View style={styles.headerRightContainer}>
      <TouchableOpacity
        onPress={() => setShowExportSheet(true)}
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
  );

  // === FlatList renderItem ===
  const renderTransactionItem = useCallback(({ item: islem }: ListRenderItemInfo<IslemWithRelations>) => {
    return (
      <HesapTransactionItem
        islem={islem}
        hesapId={id!}
        hesapCurrency={hesap?.currency as Currency}
        isExpanded={expandedIslemId === islem.id}
        onToggle={handleToggleIslem}
        onDelete={handleDeleteIslem}
        onEdit={handleEditIslem}
        onViewPhoto={handleViewPhoto}
        t={t}
      />
    );
  }, [id, hesap?.currency, expandedIslemId, handleToggleIslem, handleDeleteIslem, handleEditIslem, handleViewPhoto, t]);

  const keyExtractor = useCallback((item: IslemWithRelations) => item.id, []);

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
              <View style={styles.balanceRow}>
                <Text variant="h2" color={Number(hesap.balance) >= 0 ? 'primary' : 'error'}>
                  {formatCurrency(Math.abs(Number(hesap.balance)), hesap.currency)}
                </Text>
                <TouchableOpacity
                  onPress={handleOpenEditBalance}
                  style={styles.editBalanceBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Pencil size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
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
                  <Text variant="body" style={[styles.creditLimitValue, { color: colors.success }]}>{formatCurrency(hesap.credit_limit - Math.abs(Number(hesap.balance)), hesap.currency)}</Text>
                </View>
              </View>
            </View>
          )}
        </Card>

        {/* Hızlı İşlem Butonları */}
        <View style={styles.actionButtons}>
          <Button
            variant="primary"
            size="md"
            icon={hesap.type === 'kredi_karti' ? <CreditCard size={18} color={colors.surface} /> : <CircleDollarSign size={18} color={colors.surface} />}
            onPress={() => openTransaction(hesap.type === 'kredi_karti' ? 'kredi_karti_gider' as TransactionType : 'gelir')}
            style={styles.actionBtn}
          >
            {t('accounts:actions.addTransaction')}
          </Button>
          {/* Çek Kes - Sadece banka hesapları için */}
          {hesap.type === 'banka' && (
            <Button
              variant="outline"
              size="md"
              icon={<FileCheck size={18} color={colors.info} />}
              onPress={() => setShowCekKesSheet(true)}
              style={[styles.actionBtn, { borderColor: colors.info }]}
            >
              {t('checks:create')}
            </Button>
          )}
        </View>

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
  }, [hesap, ileriTarihliIslemler, ileriTarihliLoading, bekleyenCekler, ceklerLoading, islemlerLoading, baseCurrency, exchangeRates, id, t, handleOpenEditBalance, openTransaction, handleUnarchive, unarchiveHesap.isPending]);

  // === FlatList ListFooterComponent ===
  const ListFooter = useMemo(() => {
    if (!hesap || islemlerLoading) return null;
    return (
      <View style={styles.section}>
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
  }, [hesap, islemlerLoading, initialBalance, t]);

  // === FlatList ListEmptyComponent ===
  const ListEmpty = useMemo(() => {
    if (islemlerLoading) return null;
    return null; // Boş liste için özel bir şey göstermiyoruz, başlangıç bakiyesi footer'da
  }, [islemlerLoading]);

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
          headerRight: () => <HeaderRightButtons />,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <FlatList
          data={islemler ?? []}
          keyExtractor={keyExtractor}
          renderItem={renderTransactionItem}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={ListEmpty}
          showsVerticalScrollIndicator={false}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={true}
          extraData={expandedIslemId}
          contentContainerStyle={styles.flatListContent}
        />
      </SafeAreaView>

      {/* 3 Nokta Menüsü */}
      <Modal visible={showMenu} transparent animationType="fade">
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuContainer}>
            {/* Düzenle */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                router.push({ pathname: '/hesaplar/duzenle/[id]', params: { id: id } });
              }}
            >
              <Pencil size={20} color={colors.text} />
              <Text variant="body">{t('common:buttons.edit')}</Text>
            </TouchableOpacity>

            {/* Sil */}
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={handleDeleteHesap}
            >
              <Trash2 size={20} color={colors.error} />
              <Text variant="body" color="error">{t('common:buttons.delete')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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

      {/* Çek Kes Sheet */}
      <CekKesSheet
        visible={showCekKesSheet}
        onDismiss={() => setShowCekKesSheet(false)}
        defaultHesapId={id}
      />

      {/* Export Sheet */}
      <ExportSheet
        visible={showExportSheet}
        onDismiss={() => setShowExportSheet(false)}
        entityType="hesap"
        entityId={id!}
        entityName={hesap.name}
        entityCurrency={hesap.currency}
        currentBalance={Number(hesap.balance)}
      />

      {/* Bakiye Düzenleme Modal */}
      <Modal
        visible={editBalanceModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditBalanceModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.balanceModalOverlay}
          activeOpacity={1}
          onPress={() => setEditBalanceModalVisible(false)}
        >
          <View style={styles.balanceModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.balanceModalHeader}>
              <Text variant="h3">{t('accounts:balance.editBalance')}</Text>
              <TouchableOpacity onPress={() => setEditBalanceModalVisible(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text variant="caption" color="secondary" style={{ marginBottom: spacing.sm }}>
              {t('accounts:balance.currentBalance')}: {formatCurrency(Number(hesap?.balance) || 0, hesap?.currency)}
            </Text>

            <TextInput
              style={styles.balanceInput}
              value={newBalanceInput}
              onChangeText={setNewBalanceInput}
              keyboardType="numeric"
              placeholder={t('accounts:balance.newBalance')}
              placeholderTextColor={colors.textMuted}
              autoFocus
            />

            <View style={styles.balanceModalButtons}>
              <Button
                variant="outline"
                onPress={() => setEditBalanceModalVisible(false)}
                style={{ flex: 1 }}
              >
                {t('common:buttons.cancel')}
              </Button>
              <Button
                variant="primary"
                onPress={handleSaveBalance}
                style={{ flex: 1 }}
                loading={updateHesap.isPending}
              >
                {t('common:buttons.save')}
              </Button>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

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
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hareketInfo: {
    flex: 1,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  photoIndicator: {
    marginRight: 2,
  },
  hareketCard: {
    marginBottom: spacing.sm,
  },
  hareketActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  crossCurrencyText: {
    color: colors.info,
    fontStyle: 'italic',
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
  // Menu styles
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: spacing.md,
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  menuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
    paddingTop: spacing.md + spacing.xs,
  },
  // Balance editing styles
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editBalanceBtn: {
    padding: spacing.xs,
  },
  balanceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  balanceModalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  balanceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  balanceInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  balanceModalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
