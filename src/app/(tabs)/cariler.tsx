import { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, Alert, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Users,
  Plus,
  History,
  Zap,
  EyeOff,
  Archive,
  Edit3,
  MoreVertical,
  Trash2,
  CheckCircle2,
  Circle,
  CheckSquare,
  X,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter, SearchInput, ExpandableCard, Button, EmptyState, Card, ActionSheet, type ActionSheetOption, SkeletonAccountList, SkeletonSummaryPair } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useHaptics } from '@/hooks/useHaptics';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { getCariIcon } from '@/lib/icons';
import { useCariler, useDeleteCari } from '@/hooks/useCariler';
import { useArchiveCari } from '@/hooks/useArchive';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';
import { Cari, CariType } from '@/types/database';

export default function CarilerPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(['clients', 'common', 'navigation']);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCariId, setExpandedCariId] = useState<string | null>(null);

  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filterOptions = [
    { label: t('clients:filters.all'), value: 'all' },
    { label: t('clients:titles.suppliers'), value: 'tedarikci' },
    { label: t('clients:titles.customers'), value: 'musteri' },
  ];

  // QuickTransactionBar için state
  const [quickBarVisible, setQuickBarVisible] = useState(false);
  const [selectedCari, setSelectedCari] = useState<Cari | null>(null);

  // ActionSheet için state
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetCari, setActionSheetCari] = useState<Cari | null>(null);

  // Mutations
  const archiveCari = useArchiveCari();
  const deleteCari = useDeleteCari();

  // Toast ve Haptics
  const { showToast } = useToast();
  const haptics = useHaptics();

  // Settings ve döviz kurları
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;

  // Gerçek veriler - pasif carileri de dahil et
  const { data: cariler, isLoading, refetch } = useCariler(
    filter === 'all' ? undefined : (filter as CariType),
    true // includePassive
  );
  const { payables, receivables } = useFinancialSummary();

  // Pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try { await refetch(); } finally { setIsRefreshing(false); }
  }, [refetch]);

  // Action sheet handlers
  const handleOpenActionSheet = (cari: Cari) => {
    setActionSheetCari(cari);
    setActionSheetVisible(true);
  };

  const handleArchive = async () => {
    if (!actionSheetCari) return;
    try {
      await archiveCari.mutateAsync(actionSheetCari.id);
      haptics.success();
      showToast(t('common:archive.messages.archiveSuccess'), 'success');
    } catch (error) {
      haptics.error();
      showToast(t('common:messages.operationFailed'), 'error');
    }
  };

  const handleDelete = () => {
    if (!actionSheetCari) return;
    Alert.alert(
      t('common:confirm.deleteTitle'),
      t('common:confirm.deleteMessage', { item: actionSheetCari.name }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCari.mutateAsync(actionSheetCari.id);
              haptics.success();
              showToast(t('common:messages.deletedSuccessfully'), 'success');
            } catch (error) {
              haptics.error();
              showToast(t('common:messages.operationFailed'), 'error');
            }
          },
        },
      ]
    );
  };

  // Multi-select handlers
  const handleEnterSelectMode = () => {
    if (actionSheetCari) {
      setIsSelectMode(true);
      setSelectedIds(new Set([actionSheetCari.id]));
      setExpandedCariId(null);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
    haptics.selection();
  };

  const handleSelectAll = () => {
    if (filteredCariler) {
      setSelectedIds(new Set(filteredCariler.map(c => c.id)));
      haptics.selection();
    }
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
    haptics.selection();
  };

  const handleCancelSelectMode = () => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    const count = selectedIds.size;
    Alert.alert(
      t('common:bulkSelect.confirmDeleteTitle'),
      t('common:bulkSelect.confirmDeleteMessage', { count }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const promises = Array.from(selectedIds).map(id => deleteCari.mutateAsync(id));
              await Promise.all(promises);
              haptics.success();
              showToast(t('common:bulkSelect.deleteSuccess', { count }), 'success');
              handleCancelSelectMode();
            } catch (error) {
              haptics.error();
              showToast(t('common:messages.operationFailed'), 'error');
            }
          },
        },
      ]
    );
  };

  const handleBulkArchive = () => {
    const count = selectedIds.size;
    Alert.alert(
      t('common:bulkSelect.confirmArchiveTitle'),
      t('common:bulkSelect.confirmArchiveMessage', { count }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:archive.actions.archive'),
          onPress: async () => {
            try {
              const promises = Array.from(selectedIds).map(id => archiveCari.mutateAsync(id));
              await Promise.all(promises);
              haptics.success();
              showToast(t('common:bulkSelect.archiveSuccess', { count }), 'success');
              handleCancelSelectMode();
            } catch (error) {
              haptics.error();
              showToast(t('common:messages.operationFailed'), 'error');
            }
          },
        },
      ]
    );
  };

  const actionSheetOptions: ActionSheetOption[] = [
    {
      label: t('common:bulkSelect.select'),
      icon: <CheckSquare size={20} color={colors.info} />,
      onPress: handleEnterSelectMode,
    },
    {
      label: t('common:buttons.edit'),
      icon: <Edit3 size={20} color={colors.primary} />,
      onPress: () => {
        if (actionSheetCari) {
          router.push(`/cariler/duzenle/${actionSheetCari.id}`);
        }
      },
    },
    {
      label: t('common:archive.actions.archive'),
      icon: <Archive size={20} color={colors.warning} />,
      onPress: handleArchive,
    },
    {
      label: t('common:buttons.delete'),
      icon: <Trash2 size={20} color={colors.error} />,
      onPress: handleDelete,
      destructive: true,
    },
  ];

  // Arama filtresi ve sıralama (aktif önce)
  const filteredCariler = cariler
    ?.filter((cari) => cari.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      // Aktif olanlar önce
      if (a.is_active !== b.is_active) {
        return a.is_active ? -1 : 1;
      }
      // Aynı durumda olanları alfabetik sırala
      return a.name.localeCompare(b.name, 'tr');
    });


  // FlatList renderItem fonksiyonu - performans için useCallback ile memoize edildi
  const renderCariItem = useCallback(({ item: cari }: { item: NonNullable<typeof cariler>[number] }) => {
    const isSelected = selectedIds.has(cari.id);
    return (
      <View style={[!cari.is_active && styles.passiveItem, isSelectMode && isSelected && styles.selectedItem]}>
        {isSelectMode ? (
          <TouchableOpacity
            style={styles.selectableCard}
            onPress={() => toggleSelection(cari.id)}
            activeOpacity={0.7}
          >
            <View style={styles.cariHeader}>
              {/* Selection checkbox */}
              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                {isSelected ? (
                  <CheckCircle2 size={24} color={colors.primary} />
                ) : (
                  <Circle size={24} color={colors.border} />
                )}
              </View>
              {getCariIcon(cari.type, 24)}
              <View style={styles.cariInfo}>
                <View style={styles.cariNameRow}>
                  <Text variant="body">{cari.name}</Text>
                  {!cari.is_active && (
                    <EyeOff size={14} color={colors.textMuted} />
                  )}
                </View>
              </View>
              <View style={styles.cariBalance}>
                <Text
                  variant="body"
                  color={
                    toNumber(cari.balance) === 0
                      ? 'secondary'
                      : toNumber(cari.balance) > 0
                      ? 'success'
                      : 'error'
                  }
                >
                  {formatCurrency(Math.abs(toNumber(cari.balance)), cari.currency)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <ExpandableCard
            expanded={expandedCariId === cari.id}
            onToggle={() => {
              haptics.selection();
              setExpandedCariId(expandedCariId === cari.id ? null : cari.id);
            }}
            header={
              <View style={styles.cariHeader}>
                {getCariIcon(cari.type, 24)}
                <View style={styles.cariInfo}>
                  <View style={styles.cariNameRow}>
                    <Text variant="body">{cari.name}</Text>
                    {!cari.is_active && (
                      <EyeOff size={14} color={colors.textMuted} />
                    )}
                  </View>
                  <Text variant="caption" color="secondary">
                    {cari.type === 'tedarikci' ? t('clients:types.tedarikci') : t('clients:types.musteri')}
                    {cari.phone ? ` • ${cari.phone}` : ''}
                  </Text>
                </View>
                <View style={styles.cariBalance}>
                  <Text variant="caption" color="secondary">
                    {toNumber(cari.balance) === 0
                      ? t('clients:balance.noBalance')
                      : cari.type === 'tedarikci'
                      ? toNumber(cari.balance) < 0
                        ? t('clients:balance.weOwe')
                        : t('clients:balance.theyOwe')
                      : toNumber(cari.balance) > 0
                      ? t('clients:balance.theyOwe')
                      : t('clients:balance.weOwe')}
                  </Text>
                  <Text
                    variant="h3"
                    color={
                      toNumber(cari.balance) === 0
                        ? 'secondary'
                        : toNumber(cari.balance) > 0
                        ? 'success'
                        : 'error'
                    }
                  >
                    {formatCurrency(Math.abs(toNumber(cari.balance)), cari.currency)}
                  </Text>
                  {cari.currency !== baseCurrency && exchangeRates && toNumber(cari.balance) !== 0 && (
                    <Text variant="caption" color="secondary">
                      ~{formatCurrency(convertCurrency(Math.abs(toNumber(cari.balance)), cari.currency, baseCurrency, exchangeRates) ?? 0, baseCurrency)}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.moreButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleOpenActionSheet(cari);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MoreVertical size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            }
          >
            <View style={styles.cariActions}>
              <Button
                variant="primary"
                size="sm"
                icon={<Zap size={16} color={colors.white} />}
                onPress={() => {
                  setSelectedCari(cari);
                  setQuickBarVisible(true);
                }}
                style={styles.actionButton}
              >
                {t('clients:details.newTransaction')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<History size={16} color={colors.text} />}
                onPress={() => router.push(`/cariler/${cari.id}`)}
                style={styles.actionButton}
              >
                {t('clients:details.transactions')}
              </Button>
            </View>
          </ExpandableCard>
        )}
      </View>
    );
  }, [selectedIds, isSelectMode, expandedCariId, t, baseCurrency, exchangeRates, haptics, toggleSelection, handleOpenActionSheet, router]);

  // FlatList ListHeaderComponent - header, özet, arama ve filtre
  const ListHeader = useMemo(() => (
    <>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="h2">{t('clients:titles.clients')}</Text>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={18} color={colors.white} />}
          onPress={() => router.push('/cariler/ekle')}
        >
          {t('common:buttons.add')}
        </Button>
      </View>

      {/* Özet Kartları */}
      <View style={styles.summaryContainer}>
        <Card style={styles.summaryCard}>
          <Text variant="caption" color="secondary">{t('clients:balance.weOwe')}</Text>
          <Text variant="h3" color="error">{formatCurrency(payables.cari)}</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <Text variant="caption" color="secondary">{t('clients:balance.theyOwe')}</Text>
          <Text variant="h3" color="success">{formatCurrency(receivables.cari)}</Text>
        </Card>
      </View>

      {/* Arama */}
      <View style={styles.searchContainer}>
        <SearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('clients:search.searchClients')}
        />
      </View>

      {/* Filtre */}
      <View style={styles.filterContainer}>
        <TabFilter options={filterOptions} value={filter} onChange={setFilter} />
      </View>

      {/* Loading state */}
      {isLoading && <SkeletonAccountList count={5} />}
    </>
  ), [t, router, payables.cari, receivables.cari, searchQuery, filterOptions, filter, isLoading]);

  // FlatList ListEmptyComponent
  const ListEmpty = useMemo(() => {
    if (isLoading) return null;
    return (
      <EmptyState
        icon={<Users size={48} color={colors.textMuted} />}
        title={searchQuery ? t('clients:search.noResults') : t('clients:messages.noClients')}
        description={
          searchQuery
            ? t('common:search.tryDifferent')
            : t('clients:messages.addFirstClient')
        }
        actionLabel={searchQuery ? undefined : t('clients:titles.addClient')}
        onAction={searchQuery ? undefined : () => router.push('/cariler/ekle')}
      />
    );
  }, [isLoading, searchQuery, t, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        style={styles.scrollView}
        data={isLoading ? [] : filteredCariler}
        keyExtractor={(item) => item.id}
        renderItem={renderCariItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
        // Performans optimizasyonları
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        // Extra data for re-renders when these change
        extraData={{ selectedIds, expandedCariId, isSelectMode }}
        contentContainerStyle={styles.listContainer}
      />

      {/* Quick Transaction Bar */}
      <QuickTransactionBar
        visible={quickBarVisible}
        onDismiss={() => {
          setQuickBarVisible(false);
          setSelectedCari(null);
        }}
        defaultCariId={selectedCari?.id}
        defaultCariType={selectedCari?.type}
        onSuccess={() => {
          setQuickBarVisible(false);
          setSelectedCari(null);
        }}
      />

      {/* Action Sheet */}
      <ActionSheet
        visible={actionSheetVisible}
        onClose={() => {
          setActionSheetVisible(false);
          setActionSheetCari(null);
        }}
        title={actionSheetCari?.name}
        options={actionSheetOptions}
        cancelLabel={t('common:buttons.cancel')}
      />

      {/* Bulk Action Bar */}
      {isSelectMode && (
        <View style={[styles.bulkActionBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <View style={styles.bulkActionHeader}>
            <TouchableOpacity onPress={handleCancelSelectMode} style={styles.bulkActionCancel}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
            <Text variant="body" bold>
              {t('common:bulkSelect.selected', { count: selectedIds.size })}
            </Text>
            <TouchableOpacity
              onPress={selectedIds.size === filteredCariler?.length ? handleDeselectAll : handleSelectAll}
              style={styles.bulkActionSelectAll}
            >
              <Text variant="body" style={{ color: colors.primary }}>
                {selectedIds.size === filteredCariler?.length
                  ? t('common:bulkSelect.deselectAll')
                  : t('common:bulkSelect.selectAll')}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.bulkActionButtons}>
            <TouchableOpacity
              style={[styles.bulkActionButton, styles.bulkActionArchive]}
              onPress={handleBulkArchive}
              disabled={selectedIds.size === 0}
            >
              <Archive size={20} color={selectedIds.size === 0 ? colors.textMuted : colors.warning} />
              <Text variant="caption" style={{ color: selectedIds.size === 0 ? colors.textMuted : colors.warning }}>
                {t('common:archive.actions.archive')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkActionButton, styles.bulkActionDelete]}
              onPress={handleBulkDelete}
              disabled={selectedIds.size === 0}
            >
              <Trash2 size={20} color={selectedIds.size === 0 ? colors.textMuted : colors.error} />
              <Text variant="caption" style={{ color: selectedIds.size === 0 ? colors.textMuted : colors.error }}>
                {t('common:buttons.delete')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  filterContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  listContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  cariHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cariInfo: {
    flex: 1,
  },
  cariNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  passiveItem: {
    opacity: 0.5,
  },
  cariBalance: {
    alignItems: 'flex-end',
  },
  cariActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  moreButton: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
  // Multi-select styles
  selectedItem: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.xs,
  },
  selectableCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  checkbox: {
    marginRight: spacing.xs,
  },
  checkboxSelected: {
    // Selected state handled by icon color
  },
  bulkActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  bulkActionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  bulkActionCancel: {
    padding: spacing.xs,
  },
  bulkActionSelectAll: {
    padding: spacing.xs,
  },
  bulkActionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  bulkActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
  },
  bulkActionArchive: {
    // Style handled by text/icon color
  },
  bulkActionDelete: {
    // Style handled by text/icon color
  },
});
