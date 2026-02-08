import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { View, StyleSheet, FlatList, Alert, TouchableOpacity, Modal, TextInput, ListRenderItemInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ShoppingCart,
  Banknote,
  Receipt,
  Building2,
  User,
  Phone,
  CircleDollarSign,
  Pencil,
  Trash2,
  Zap,
  RotateCcw,
  MoreVertical,
  FileCheck,
  X,
  Share2,
  Package,
} from 'lucide-react-native';
import { Text, Card, ExpandableCard, Button, EmptyState, IleriTarihliIslemlerSection, ArchivedBanner, BalanceDirectionSelector, BalanceDirection } from '@/components/ui';
import { BekleyenCeklerSection, CekKesSheet } from '@/components/cek';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { ExportSheet } from '@/components/export';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { formatDateShort } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { useCari, useDeleteCari, useUpdateCari } from '@/hooks/useCariler';
import { useUnarchiveCari } from '@/hooks/useArchive';
import { useIslemlerByCari, useDeleteIslem } from '@/hooks/useIslemler';
import { useIslemlerWithStok } from '@/hooks/useStokHareketler';
import { useIleriTarihliIslemlerByCari } from '@/hooks/useIleriTarihliIslemler';
import { useCeklerByCari } from '@/hooks/useCekler';
import { IslemWithRelations } from '@/types/database';

// ============================================================================
// MEMOIZED TRANSACTION ITEM COMPONENT
// ============================================================================

interface CariTransactionItemProps {
  islem: IslemWithRelations;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  hasStokFn: (id: string) => boolean;
  formatDateSmart: (date: string) => string;
  t: (key: string) => string;
  currency?: string;
}

function getCariHareketIcon(type: string) {
  switch (type) {
    case 'cari_alis':
      return <ShoppingCart size={20} color={colors.error} />;
    case 'cari_odeme':
      return <Banknote size={20} color={colors.success} />;
    case 'cari_satis':
      return <Receipt size={20} color={colors.success} />;
    case 'cari_tahsilat':
      return <Banknote size={20} color={colors.info} />;
    case 'cari_alis_iade':
      return <RotateCcw size={20} color={colors.warning} />;
    case 'cari_satis_iade':
      return <RotateCcw size={20} color={colors.warning} />;
    default:
      return <Receipt size={20} color={colors.textMuted} />;
  }
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

function getCariIconBgColor(type: string): string {
  if (type === 'cari_alis' || type === 'cari_satis') return colors.errorLight;
  if (type === 'cari_alis_iade' || type === 'cari_satis_iade') return colors.warningLight;
  return colors.successLight;
}

function getCariAmountColor(type: string): 'error' | 'warning' | 'success' {
  if (type === 'cari_alis' || type === 'cari_satis') return 'error';
  if (type === 'cari_alis_iade' || type === 'cari_satis_iade') return 'warning';
  return 'success';
}

function getCariAmountPrefix(type: string): string {
  if (type === 'cari_alis' || type === 'cari_satis') return '-';
  if (type === 'cari_alis_iade' || type === 'cari_satis_iade') return '↩ ';
  if (type === 'cari_odeme' || type === 'cari_tahsilat') return '+';
  return '';
}

const CariTransactionItem = memo(function CariTransactionItem({
  islem,
  isExpanded,
  onToggle,
  onDelete,
  onEdit,
  hasStokFn,
  formatDateSmart,
  t,
  currency,
}: CariTransactionItemProps) {
  const labelKey = getCariHareketLabelKey(islem.type);

  return (
    <ExpandableCard
      expanded={isExpanded}
      onToggle={() => onToggle(islem.id)}
      disableAnimation
      header={
        <View style={styles.hareketHeader}>
          <View style={[
            styles.hareketIcon,
            { backgroundColor: getCariIconBgColor(islem.type) }
          ]}>
            {getCariHareketIcon(islem.type)}
          </View>
          <View style={styles.hareketInfo}>
            <View style={styles.hareketTitleRow}>
              <Text variant="body">{formatDateSmart(islem.date)}</Text>
              {hasStokFn(islem.id) && (
                <View style={styles.stokBadge}>
                  <Package size={12} color={colors.primary} />
                </View>
              )}
            </View>
            <Text variant="caption" color="secondary">
              {labelKey ? t(labelKey) : islem.type}
            </Text>
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
          <Text
            variant="h3"
            color={getCariAmountColor(islem.type)}
          >
            {getCariAmountPrefix(islem.type)}
            {formatCurrency(Number(islem.amount), currency)}
          </Text>
        </View>
      }
    >
      <View style={styles.hareketActions}>
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
    && prev.islem.updated_at === next.islem.updated_at;
});

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function CariHareketleriPage() {
  const { id, expandIslemId } = useLocalSearchParams<{ id: string; expandIslemId?: string }>();
  const router = useRouter();
  const { t } = useTranslation(['clients', 'common', 'errors', 'checks']);
  const { formatDateSmart } = useDateFormat();
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;

  const { data: cari, isLoading: cariLoading, refetch: refetchCari } = useCari(id!);
  const { data: islemler, isLoading: islemlerLoading } = useIslemlerByCari(id!);
  const { data: ileriTarihliIslemler, isLoading: ileriTarihliLoading } = useIleriTarihliIslemlerByCari(id!);
  const { data: bekleyenCekler, isLoading: ceklerLoading } = useCeklerByCari(id!);

  // İşlemlerin stoklu olup olmadığını kontrol et
  const islemIds = islemler?.map(i => i.id) || [];
  const { hasStok } = useIslemlerWithStok(islemIds);
  const deleteIslem = useDeleteIslem();
  const deleteCari = useDeleteCari();
  const updateCari = useUpdateCari();
  const unarchiveCari = useUnarchiveCari();

  const [expandedIslemId, setExpandedIslemId] = useState<string | null>(null);
  const [quickBarVisible, setQuickBarVisible] = useState(false);

  // URL'den gelen expandIslemId parametresini işle
  useEffect(() => {
    if (expandIslemId) {
      setExpandedIslemId(expandIslemId);
    }
  }, [expandIslemId]);
  const [showMenu, setShowMenu] = useState(false);
  const [showCekKesSheet, setShowCekKesSheet] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [editBalanceModalVisible, setEditBalanceModalVisible] = useState(false);
  const [newInitialBalance, setNewInitialBalance] = useState('');
  const [balanceDirection, setBalanceDirection] = useState<BalanceDirection>('debt');
  // Edit transaction state
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);

  // Başlangıç bakiyesini hesapla - MEMOIZED
  const initialBalance = useMemo(() => {
    if (!cari || !islemler) return 0;

    let totalEffect = 0;
    islemler.forEach((islem) => {
      const amount = toNumber(islem.amount);
      if (islem.type === 'cari_alis') {
        totalEffect -= amount;
      } else if (islem.type === 'cari_odeme') {
        totalEffect += amount;
      } else if (islem.type === 'cari_satis') {
        totalEffect += amount;
      } else if (islem.type === 'cari_tahsilat') {
        totalEffect -= amount;
      } else if (islem.type === 'cari_alis_iade') {
        totalEffect += amount;
      } else if (islem.type === 'cari_satis_iade') {
        totalEffect -= amount;
      }
    });

    return toNumber(cari.balance) - totalEffect;
  }, [cari, islemler]);

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
              const transactionEffect = Number(cari!.balance) - initialBalance;
              const newCariBalance = newInitial + transactionEffect;

              await updateCari.mutateAsync({
                id: cari!.id,
                balance: newCariBalance,
              });

              setEditBalanceModalVisible(false);
              refetchCari();
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('errors:general.tryAgain'));
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
      t('clients:deleteConfirm.transactionTitle'),
      t('clients:deleteConfirm.transactionMessage'),
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
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('errors:cari.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  const handleUnarchive = async () => {
    try {
      await unarchiveCari.mutateAsync(id!);
      Alert.alert(t('common:status.success'), t('common:archive.messages.unarchiveSuccess'));
    } catch (error) {
      Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
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
      <CariTransactionItem
        islem={islem}
        isExpanded={expandedIslemId === islem.id}
        onToggle={handleToggleIslem}
        onDelete={handleDeleteIslem}
        onEdit={handleEditIslem}
        hasStokFn={hasStok}
        formatDateSmart={formatDateSmart}
        t={t}
        currency={cari?.currency}
      />
    );
  }, [expandedIslemId, handleToggleIslem, handleDeleteIslem, handleEditIslem, hasStok, formatDateSmart, t]);

  const keyExtractor = useCallback((item: IslemWithRelations) => item.id, []);

  // === FlatList ListHeaderComponent ===
  const ListHeader = useMemo(() => {
    if (!cari) return null;
    const isTedarikci = cari.type === 'tedarikci';

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
                {Number(cari.balance) < 0 ? t('clients:balance.weOwe') : t('clients:balance.theyOwe')}
              </Text>
              <Text variant="h2" color={Number(cari.balance) < 0 ? 'error' : 'success'}>
                {formatCurrency(Math.abs(Number(cari.balance)), cari.currency)}
              </Text>
              {cari.currency !== baseCurrency && exchangeRates && toNumber(cari.balance) !== 0 && (
                <Text variant="caption" color="secondary">
                  ~{formatCurrency(convertCurrency(Math.abs(toNumber(cari.balance)), cari.currency, baseCurrency, exchangeRates) ?? 0, baseCurrency)}
                </Text>
              )}
            </View>
          </View>
        </Card>

        {/* Arşiv Banner */}
        {cari.is_archived && (
          <View style={styles.bannerContainer}>
            <ArchivedBanner
              onUnarchive={handleUnarchive}
              loading={unarchiveCari.isPending}
            />
          </View>
        )}

        {/* Aksiyon Butonlari */}
        {!cari.is_archived && (
          <View style={styles.actionButtons}>
            <Button
              variant="primary"
              size="md"
              icon={<Zap size={18} color={colors.surface} />}
              onPress={() => setQuickBarVisible(true)}
              style={styles.actionBtn}
            >
              {t('clients:details.newTransaction')}
            </Button>
            {cari.type === 'tedarikci' && (
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
        )}

        {/* İleri Tarihli İşlemler ve Hareketler */}
        <View style={styles.section}>
          <IleriTarihliIslemlerSection
            ileriTarihliIslemler={ileriTarihliIslemler}
            isLoading={ileriTarihliLoading}
          />

          {cari?.type === 'tedarikci' && (
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
  }, [cari, ileriTarihliIslemler, ileriTarihliLoading, bekleyenCekler, ceklerLoading, islemlerLoading, baseCurrency, exchangeRates, t, handleUnarchive, unarchiveCari.isPending]);

  // === FlatList ListFooterComponent ===
  const ListFooter = useMemo(() => {
    if (!cari || islemlerLoading) return null;
    return (
      <View style={styles.section}>
        <Card style={styles.hareketCard}>
          <View style={styles.hareketHeader}>
            <View style={[styles.hareketIcon, { backgroundColor: colors.primaryLight + '30' }]}>
              <CircleDollarSign size={20} color={colors.primary} />
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
  }, [cari, islemlerLoading, initialBalance, t, handleOpenEditBalance]);

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
          headerTitle: cari.name,
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
          showsVerticalScrollIndicator={false}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={true}
          extraData={expandedIslemId}
          contentContainerStyle={styles.flatListContent}
        />

        {/* 3 Nokta Menüsü */}
        <Modal visible={showMenu} transparent animationType="fade">
          <TouchableOpacity
            style={styles.menuBackdrop}
            activeOpacity={1}
            onPress={() => setShowMenu(false)}
          >
            <View style={styles.menuContainer}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  router.push({ pathname: '/cariler/duzenle/[id]', params: { id: id } });
                }}
              >
                <Pencil size={20} color={colors.text} />
                <Text variant="body">{t('common:buttons.edit')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemDanger]}
                onPress={handleDeleteCari}
              >
                <Trash2 size={20} color={colors.error} />
                <Text variant="body" color="error">{t('common:buttons.delete')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Quick Transaction Bar - Create Mode */}
        <QuickTransactionBar
          visible={quickBarVisible}
          onDismiss={() => setQuickBarVisible(false)}
          defaultCariId={cari?.id}
          defaultCariType={cari?.type}
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
          defaultCariType={cari?.type}
          onSuccess={() => {
            setShowEditBar(false);
            setEditTransactionId(null);
          }}
        />

        {/* Çek Kes Sheet */}
        <CekKesSheet
          visible={showCekKesSheet}
          onDismiss={() => setShowCekKesSheet(false)}
          defaultCariId={cari?.id}
        />

        {/* Export Sheet */}
        <ExportSheet
          visible={showExportSheet}
          onDismiss={() => setShowExportSheet(false)}
          entityType="cari"
          entityId={id!}
          entityName={cari.name}
          currentBalance={Number(cari.balance)}
          cariType={cari.type as 'musteri' | 'tedarikci'}
        />

        {/* Başlangıç Bakiyesi Düzenleme Modal */}
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
                <Text variant="h3">{t('clients:balance.editTitle')}</Text>
                <TouchableOpacity onPress={() => setEditBalanceModalVisible(false)}>
                  <X size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text variant="caption" color="secondary" style={styles.balanceWarning}>
                {t('clients:balance.editWarning')}
              </Text>
              <View style={styles.balanceInputContainer}>
                <Text variant="label" style={{ marginBottom: spacing.xs }}>{t('clients:balanceDirection.label')}</Text>
                <BalanceDirectionSelector
                  value={balanceDirection}
                  onChange={setBalanceDirection}
                  variant={cari?.type === 'tedarikci' ? 'supplier' : 'customer'}
                />
              </View>
              <View style={styles.balanceInputContainer}>
                <Text variant="label">{t('clients:balance.newInitialBalance')}</Text>
                <TextInput
                  style={styles.balanceInput}
                  value={newInitialBalance}
                  onChangeText={setNewInitialBalance}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.balanceModalButtons}>
                <Button
                  variant="secondary"
                  onPress={() => setEditBalanceModalVisible(false)}
                  style={{ flex: 1 }}
                >
                  {t('common:buttons.cancel')}
                </Button>
                <Button
                  variant="primary"
                  onPress={handleSaveInitialBalance}
                  loading={updateCari.isPending}
                  style={{ flex: 1 }}
                >
                  {t('common:buttons.save')}
                </Button>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
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
  bannerContainer: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hareketInfo: {
    flex: 1,
  },
  hareketTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stokBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
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
  // Initial balance edit styles
  initialBalanceRow: {
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
    maxWidth: 320,
  },
  balanceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  balanceWarning: {
    marginBottom: spacing.lg,
  },
  balanceInputContainer: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  balanceInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  balanceModalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
