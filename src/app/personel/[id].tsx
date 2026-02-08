import { useState, useCallback, useMemo, memo } from 'react';
import { View, StyleSheet, FlatList, Alert, TouchableOpacity, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  MinusCircle,
  Banknote,
  UserCircle,
  Phone,
  Briefcase,
  Zap,
  CircleDollarSign,
  Pencil,
  Trash2,
  ArrowDownCircle,
  MoreVertical,
  X,
  Share2,
} from 'lucide-react-native';
import { Text, Card, ExpandableCard, Button, EmptyState, IleriTarihliIslemlerSection, ArchivedBanner, BalanceDirectionSelector, BalanceDirection } from '@/components/ui';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { ExportSheet } from '@/components/export';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { formatDateShort } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { getInitials } from '@/lib/utils';
import { usePersonelById, useDeletePersonel, useUpdatePersonel } from '@/hooks/usePersonel';
import { useUnarchivePersonel } from '@/hooks/useArchive';
import { useIslemlerByPersonel, useDeleteIslem } from '@/hooks/useIslemler';
import { useIleriTarihliIslemlerByPersonel } from '@/hooks/useIleriTarihliIslemler';
import { IslemWithRelations } from '@/types/database';

// ============================================================================
// PURE HELPER FUNCTIONS (module-level, no re-creation per render)
// ============================================================================

function getHareketIcon(type: string) {
  switch (type) {
    case 'personel_gider':
      return <MinusCircle size={20} color={colors.error} />;
    case 'personel_odeme':
      return <Banknote size={20} color={colors.success} />;
    case 'personel_tahsilat':
      return <ArrowDownCircle size={20} color={colors.info} />;
    default:
      return <UserCircle size={20} color={colors.textMuted} />;
  }
}

function getIconBgColor(type: string) {
  switch (type) {
    case 'personel_odeme':
      return colors.successLight;
    case 'personel_tahsilat':
      return colors.infoLight;
    default:
      return colors.errorLight;
  }
}

function getAmountColor(type: string): 'success' | 'info' | 'error' {
  switch (type) {
    case 'personel_odeme':
      return 'success';
    case 'personel_tahsilat':
      return 'info';
    default:
      return 'error';
  }
}

function getAmountPrefix(type: string): string {
  switch (type) {
    case 'personel_odeme':
      return '+';
    case 'personel_tahsilat':
      return '↓ ';
    default:
      return '-';
  }
}

function getHareketLabelKey(type: string): string {
  switch (type) {
    case 'personel_gider':
      return 'staff:transactionLabels.gider';
    case 'personel_odeme':
      return 'staff:transactionLabels.odeme';
    case 'personel_tahsilat':
      return 'staff:transactionLabels.tahsilat';
    default:
      return type;
  }
}

// ============================================================================
// MEMOIZED TRANSACTION ITEM
// ============================================================================

interface PersonelTransactionItemProps {
  islem: IslemWithRelations;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  formatDateSmart: (date: string) => string;
  t: (key: string) => string;
  currency?: string;
}

const PersonelTransactionItem = memo(function PersonelTransactionItem({
  islem,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  formatDateSmart,
  t,
  currency,
}: PersonelTransactionItemProps) {
  const handleToggle = useCallback(() => onToggle(islem.id), [onToggle, islem.id]);
  const handleEdit = useCallback(() => onEdit(islem.id), [onEdit, islem.id]);
  const handleDelete = useCallback(() => onDelete(islem.id), [onDelete, islem.id]);

  const labelKey = getHareketLabelKey(islem.type);

  return (
    <ExpandableCard
      expanded={isExpanded}
      onToggle={handleToggle}
      disableAnimation
      header={
        <View style={styles.hareketHeader}>
          <View style={[styles.hareketIcon, { backgroundColor: getIconBgColor(islem.type) }]}>
            {getHareketIcon(islem.type)}
          </View>
          <View style={styles.hareketInfo}>
            <Text variant="body">{formatDateSmart(islem.date)}</Text>
            <Text variant="caption" color="secondary">
              {t(labelKey)}
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
          <Text variant="h3" color={getAmountColor(islem.type)}>
            {getAmountPrefix(islem.type)}
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
          onPress={handleEdit}
          style={styles.actionButton}
        >
          {t('common:buttons.edit')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={<Trash2 size={16} color={colors.error} />}
          onPress={handleDelete}
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

export default function PersonelHareketleriPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation(['staff', 'common', 'errors']);
  const { formatDateSmart } = useDateFormat();
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;

  const { data: personel, isLoading: personelLoading, refetch: refetchPersonel } = usePersonelById(id!);
  const { data: islemler, isLoading: islemlerLoading } = useIslemlerByPersonel(id!);
  const { data: ileriTarihliIslemler, isLoading: ileriTarihliLoading } = useIleriTarihliIslemlerByPersonel(id!);
  const deleteIslem = useDeleteIslem();
  const deletePersonel = useDeletePersonel();
  const updatePersonel = useUpdatePersonel();
  const unarchivePersonel = useUnarchivePersonel();

  const [expandedIslemId, setExpandedIslemId] = useState<string | null>(null);
  const [quickBarVisible, setQuickBarVisible] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [editBalanceModalVisible, setEditBalanceModalVisible] = useState(false);
  const [newInitialBalance, setNewInitialBalance] = useState('');
  const [balanceDirection, setBalanceDirection] = useState<BalanceDirection>('credit');
  // Edit transaction state
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);

  const fullName = personel ? `${personel.first_name} ${personel.last_name}` : t('common:status.loading');

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
      }
    });

    return toNumber(personel.balance) - totalEffect;
  }, [personel, islemler]);

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
              const transactionEffect = Number(personel!.balance) - initialBalance;
              const newPersonelBalance = newInitial + transactionEffect;

              await updatePersonel.mutateAsync({
                id: personel!.id,
                balance: newPersonelBalance,
              });

              setEditBalanceModalVisible(false);
              refetchPersonel();
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('errors:general.tryAgain'));
            }
          },
        },
      ]
    );
  }, [newInitialBalance, balanceDirection, personel, initialBalance, updatePersonel, refetchPersonel, t]);

  // Stable callback handlers for memoized item
  const handleToggle = useCallback((islemId: string) => {
    setExpandedIslemId(prev => prev === islemId ? null : islemId);
  }, []);

  const handleDeleteIslem = useCallback((islemId: string) => {
    Alert.alert(
      t('staff:deleteConfirm.transactionTitle'),
      t('staff:deleteConfirm.transactionMessage'),
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
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('errors:personel.deleteFailed'));
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
    } catch (error) {
      Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
    }
  }, [unarchivePersonel, id, t]);

  // Header right buttons
  const HeaderRightButtons = useCallback(() => (
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
  ), []);

  // ============================================================================
  // FlatList renderItem + key extractor
  // ============================================================================

  const renderTransactionItem = useCallback(({ item }: { item: IslemWithRelations }) => (
    <PersonelTransactionItem
      islem={item}
      isExpanded={expandedIslemId === item.id}
      onToggle={handleToggle}
      onEdit={handleEditIslem}
      onDelete={handleDeleteIslem}
      formatDateSmart={formatDateSmart}
      t={t}
      currency={personel?.currency}
    />
  ), [expandedIslemId, handleToggle, handleEditIslem, handleDeleteIslem, formatDateSmart, t]);

  const keyExtractor = useCallback((item: IslemWithRelations) => item.id, []);

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

        {/* Aksiyon Butonları */}
        {!personel.is_archived && (
          <View style={styles.actionButtons}>
            <Button
              variant="primary"
              size="md"
              icon={<Zap size={18} color={colors.surface} />}
              onPress={() => setQuickBarVisible(true)}
              style={styles.actionBtn}
            >
              {t('staff:details.newTransaction')}
            </Button>
          </View>
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
  }, [personel, fullName, baseCurrency, exchangeRates, ileriTarihliIslemler, ileriTarihliLoading, islemlerLoading, handleUnarchive, unarchivePersonel.isPending, t]);

  // ============================================================================
  // FlatList Footer (başlangıç bakiyesi kartı)
  // ============================================================================

  const ListFooter = useMemo(() => {
    if (!personel) return null;
    return (
      <View style={styles.section}>
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
  }, [personel, initialBalance, handleOpenEditBalance, t]);

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
          headerRight: () => <HeaderRightButtons />,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <FlatList
          data={islemler ?? []}
          keyExtractor={keyExtractor}
          renderItem={renderTransactionItem}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={(islemler && islemler.length > 0) ? ListFooter : undefined}
          ListEmptyComponent={ListEmpty}
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
              {/* Düzenle */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  router.push({ pathname: '/personel/duzenle/[id]', params: { id: id } });
                }}
              >
                <Pencil size={20} color={colors.text} />
                <Text variant="body">{t('common:buttons.edit')}</Text>
              </TouchableOpacity>

              {/* Sil */}
              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemDanger]}
                onPress={handleDeletePersonel}
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
          defaultPersonelId={personel?.id}
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
          defaultPersonelId={personel?.id}
          onSuccess={() => {
            setShowEditBar(false);
            setEditTransactionId(null);
          }}
        />

        {/* Export Sheet */}
        <ExportSheet
          visible={showExportSheet}
          onDismiss={() => setShowExportSheet(false)}
          entityType="personel"
          entityId={id!}
          entityName={fullName}
          currentBalance={Number(personel.balance)}
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
                <Text variant="h3">{t('staff:balance.editTitle')}</Text>
                <TouchableOpacity onPress={() => setEditBalanceModalVisible(false)}>
                  <X size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text variant="caption" color="secondary" style={styles.balanceWarning}>
                {t('staff:balance.editWarning')}
              </Text>
              <View style={styles.balanceInputContainer}>
                <Text variant="label" style={{ marginBottom: spacing.xs }}>{t('staff:form.balanceDirection.label')}</Text>
                <BalanceDirectionSelector
                  value={balanceDirection}
                  onChange={setBalanceDirection}
                  variant="staff"
                />
              </View>
              <View style={styles.balanceInputContainer}>
                <Text variant="label">{t('staff:balance.newInitialBalance')}</Text>
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
                  loading={updatePersonel.isPending}
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hareketInfo: {
    flex: 1,
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
