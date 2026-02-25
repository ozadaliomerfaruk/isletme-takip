import { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, Alert, TouchableOpacity, RefreshControl } from 'react-native';
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
  Trash2,
  CheckCircle2,
  Circle,
  CheckSquare,
  X,
  Camera,
  Link,
  ArrowUpDown,
  MoreVertical,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter, SearchInput, Button, EmptyState, Card, ActionSheet, type ActionSheetOption, SkeletonAccountList, Avatar, AnimatedListItem, ExpandableCard } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useHaptics } from '@/hooks/useHaptics';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { getCariIcon as _getCariIcon } from '@/lib/icons';
import { useCariler, useDeleteCari } from '@/hooks/useCariler';
import { useArchiveCari } from '@/hooks/useArchive';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';
import { Cari, CariType } from '@/types/database';
import { AcceptCodeSheet } from '@/components/cariSharing/AcceptCodeSheet';
import { ShareCodeModal } from '@/components/cariSharing/ShareCodeModal';
import { LinkedCariBadge } from '@/components/cariSharing/LinkedCariBadge';
import { useLinkedCariler, useRemoveCariLink } from '@/hooks/useCariSharing';
import type { SharingPermission } from '@/types/cariSharing';
import { PermissionGate } from '@/components/PermissionGate';
import { usePermissions } from '@/hooks/usePermissions';

// Merged cari type: own cari + optional link metadata
type MergedCari = Cari & {
  isLinked?: boolean;
  linkOwnerName?: string;
  linkPermission?: SharingPermission;
  linkId?: string;
};

export default function CarilerPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(['clients', 'common', 'navigation']);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'balanceHigh' | 'balanceLow'>('balanceHigh');
  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filterOptions = [
    { label: t('clients:filters.all'), value: 'all' },
    { label: t('clients:titles.suppliers'), value: 'tedarikci' },
    { label: t('clients:titles.customers'), value: 'musteri' },
  ];

  // ExpandableCard için state
  const [expandedCariId, setExpandedCariId] = useState<string | null>(null);

  // QuickTransactionBar için state
  const [quickBarVisible, setQuickBarVisible] = useState(false);
  const [selectedCari, setSelectedCari] = useState<Cari | null>(null);

  // ActionSheet için state
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetCari, setActionSheetCari] = useState<Cari | null>(null);

  // Sort ActionSheet
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const sortSheetOptions: ActionSheetOption[] = [
    { label: t('common:sort.balanceHighLow'), icon: <ArrowUpDown size={20} color={sortBy === 'balanceHigh' ? colors.primary : colors.text} />, onPress: () => setSortBy('balanceHigh') },
    { label: t('common:sort.balanceLowHigh'), icon: <ArrowUpDown size={20} color={sortBy === 'balanceLow' ? colors.primary : colors.text} />, onPress: () => setSortBy('balanceLow') },
    { label: t('common:sort.nameAZ'), icon: <ArrowUpDown size={20} color={sortBy === 'name' ? colors.primary : colors.text} />, onPress: () => setSortBy('name') },
  ];

  // Cari paylaşım için state
  const [acceptCodeVisible, setAcceptCodeVisible] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareModalCari, setShareModalCari] = useState<{ id: string; name: string } | null>(null);

  // Mutations
  const archiveCari = useArchiveCari();
  const deleteCari = useDeleteCari();
  const removeCariLink = useRemoveCariLink();

  // Linked cariler (viewer olarak baglantili carileri getir)
  const { data: linkedCariler = [] } = useLinkedCariler();

  // Toast ve Haptics
  const { showToast } = useToast();
  const haptics = useHaptics();

  // Permissions
  const { canUpdate, canDelete } = usePermissions();

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
    try {
      await refetch();
      haptics.success();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch, haptics]);

  // Action sheet handlers
  const handleOpenActionSheet = useCallback((cari: Cari) => {
    setActionSheetCari(cari);
    setActionSheetVisible(true);
  }, []);

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
      // Linked carileri hariç tut - sadece kendi carilerimiz seçilebilir
      setSelectedIds(new Set(filteredCariler.filter(c => !c.isLinked).map(c => c.id)));
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

  const handleRemoveLink = (linkId: string) => {
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
              await removeCariLink.mutateAsync({ link_id: linkId });
              haptics.success();
              showToast(t('clients:sharing.linkRemoved'), 'success');
            } catch {
              haptics.error();
              showToast(t('common:messages.operationFailed'), 'error');
            }
          },
        },
      ]
    );
  };

  // Determine which action sheet options to show based on whether cari is linked
  const getActionSheetOptions = useCallback((cari: MergedCari): ActionSheetOption[] => {
    if (cari.isLinked) {
      // Linked cari: limited options
      const options: ActionSheetOption[] = [
        {
          label: t('clients:actions.viewTransactions'),
          icon: <History size={20} color={colors.primary} />,
          onPress: () => {
            if (actionSheetCari) router.push(`/cariler/${actionSheetCari.id}`);
          },
        },
      ];
      if (cari.linkPermission === 'full') {
        options.unshift({
          label: t('clients:details.newTransaction'),
          icon: <Zap size={20} color={colors.primary} />,
          onPress: () => {
            if (actionSheetCari) {
              setSelectedCari(actionSheetCari);
              setQuickBarVisible(true);
            }
          },
        });
      }
      options.push({
        label: t('clients:sharing.removeLink'),
        icon: <Trash2 size={20} color={colors.error} />,
        onPress: () => {
          if (cari.linkId) handleRemoveLink(cari.linkId);
        },
        destructive: true,
      });
      return options;
    }

    // Own cari: full options + share (permission-filtered)
    const options: ActionSheetOption[] = [
      {
        label: t('common:bulkSelect.select'),
        icon: <CheckSquare size={20} color={colors.info} />,
        onPress: handleEnterSelectMode,
      },
    ];

    if (canUpdate('cariler', cari.created_by ?? null)) {
      options.push({
        label: t('common:buttons.edit'),
        icon: <Edit3 size={20} color={colors.primary} />,
        onPress: () => {
          if (actionSheetCari) {
            router.push(`/cariler/duzenle/${actionSheetCari.id}`);
          }
        },
      });
    }

    options.push({
      label: t('clients:sharing.shareTitle'),
      icon: <Link size={20} color={colors.primary} />,
      onPress: () => {
        if (actionSheetCari) {
          const c = { id: actionSheetCari.id, name: actionSheetCari.name };
          setShareModalCari(c);
          setTimeout(() => setShareModalVisible(true), 250);
        }
      },
    });

    if (canUpdate('cariler', cari.created_by ?? null)) {
      options.push({
        label: t('common:archive.actions.archive'),
        icon: <Archive size={20} color={colors.warning} />,
        onPress: handleArchive,
      });
    }

    if (canDelete('cariler', cari.created_by ?? null)) {
      options.push({
        label: t('common:buttons.delete'),
        icon: <Trash2 size={20} color={colors.error} />,
        onPress: handleDelete,
        destructive: true,
      });
    }

    return options;
  }, [actionSheetCari, t, router, handleEnterSelectMode, handleArchive, handleDelete, canUpdate, canDelete]);

  const actionSheetOptions = useMemo(() => {
    if (!actionSheetCari) return [];
    // Check if actionSheetCari is a linked cari
    const mergedItem = mergedCariler?.find(c => c.id === actionSheetCari.id);
    return getActionSheetOptions(mergedItem ?? (actionSheetCari as MergedCari));
  }, [actionSheetCari, getActionSheetOptions]);

  // Merge own cariler + linked cariler
  const mergedCariler = useMemo((): MergedCari[] => {
    const ownItems: MergedCari[] = (cariler ?? []).map(c => ({ ...c }));

    // Transform linked cariler into MergedCari items
    const linkedItems: MergedCari[] = linkedCariler
      .filter(link => link.cari) // guard
      .map(link => ({
        // Map linked cari data to Cari shape
        id: link.cari!.id,
        name: link.cari!.name,
        balance: link.cari!.balance,
        currency: link.cari!.currency,
        type: link.viewer_type, // kabul edenin sectigi tip
        isletme_id: link.owner_isletme_id,
        phone: null,
        email: null,
        address: null,
        tax_number: null,
        notes: null,
        is_active: true,
        is_archived: false,
        created_at: link.created_at,
        updated_at: link.created_at,
        // Link metadata
        isLinked: true,
        linkOwnerName: link.owner_isletme?.name ?? '-',
        linkPermission: link.permission,
        linkId: link.id,
      } as MergedCari));

    return [...ownItems, ...linkedItems];
  }, [cariler, linkedCariler]);

  // Arama filtresi ve sıralama (aktif önce)
  const filteredCariler = mergedCariler
    .filter((cari) => {
      // Type filter
      if (filter !== 'all' && cari.type !== filter) return false;
      // Search filter
      if (searchQuery && !cari.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      // Own cariler önce, linked sonra
      if (a.isLinked !== b.isLinked) {
        return a.isLinked ? 1 : -1;
      }
      // Aktif olanlar önce
      if (a.is_active !== b.is_active) {
        return a.is_active ? -1 : 1;
      }
      // Kullanıcı sıralama tercihi
      if (sortBy === 'balanceHigh') {
        return Math.abs(toNumber(b.balance)) - Math.abs(toNumber(a.balance));
      }
      if (sortBy === 'balanceLow') {
        return Math.abs(toNumber(a.balance)) - Math.abs(toNumber(b.balance));
      }
      // Default: alphabetical
      return a.name.localeCompare(b.name, 'tr');
    });


  // FlatList renderItem fonksiyonu - performans için useCallback ile memoize edildi
  const renderCariItem = useCallback(({ item: cari, index }: { item: MergedCari; index: number }) => {
    const isSelected = selectedIds.has(cari.id);
    return (
      <AnimatedListItem index={index}>
      <View style={[!cari.is_active && styles.passiveItem, isSelectMode && isSelected && styles.selectedItem]}>
        {isSelectMode && !cari.isLinked ? (
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
              <Avatar name={cari.name} size={40} />
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
            onToggle={() => setExpandedCariId(expandedCariId === cari.id ? null : cari.id)}
            header={
              <View style={styles.cariHeader}>
                <Avatar name={cari.name} size={40} />
                <View style={styles.cariInfo}>
                  <View style={styles.cariNameRow}>
                    <Text variant="body">{cari.name}</Text>
                    {!cari.is_active && (
                      <EyeOff size={14} color={colors.textMuted} />
                    )}
                  </View>
                  {cari.isLinked ? (
                    <LinkedCariBadge
                      ownerIsletmeName={cari.linkOwnerName ?? ''}
                      permission={cari.linkPermission ?? 'view'}
                      variant="inline"
                    />
                  ) : (
                    <Text variant="caption" color="secondary">
                      {cari.type === 'tedarikci' ? t('clients:types.tedarikci') : t('clients:types.musteri')}
                      {cari.phone ? ` • ${cari.phone}` : ''}
                    </Text>
                  )}
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
                  onPress={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    handleOpenActionSheet(cari);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.moreButton}
                >
                  <MoreVertical size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            }
          >
            <View style={styles.actionButtons}>
              <Button
                variant="primary"
                size="sm"
                icon={<Zap size={16} color={colors.surface} />}
                onPress={() => {
                  setSelectedCari(cari);
                  setQuickBarVisible(true);
                }}
                style={styles.actionButton}
              >
                {t('common:archive.actions.makeTransaction')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<History size={16} color={colors.text} />}
                onPress={() => router.push(`/cariler/${cari.id}`)}
                style={styles.actionButton}
              >
                {t('clients:actions.viewTransactions')}
              </Button>
            </View>
          </ExpandableCard>
        )}
      </View>
      </AnimatedListItem>
    );
  }, [selectedIds, isSelectMode, expandedCariId, t, baseCurrency, exchangeRates, haptics, toggleSelection, handleOpenActionSheet, router]);

  // FlatList ListHeaderComponent - header, özet, arama ve filtre
  const ListHeader = useMemo(() => (
    <>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="h2">{t('clients:titles.clients')}</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => setSortSheetVisible(true)}
            activeOpacity={0.7}
          >
            <ArrowUpDown size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => setAcceptCodeVisible(true)}
            activeOpacity={0.7}
          >
            <Link size={18} color={colors.primary} />
          </TouchableOpacity>
          <PermissionGate module="cariler" action="create">
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={18} color={colors.white} />}
              onPress={() => router.push('/cariler/ekle')}
            >
              {t('common:buttons.add')}
            </Button>
          </PermissionGate>
        </View>
      </View>

      {/* Özet Kartları */}
      <View style={styles.summaryContainer}>
        <Card style={styles.summaryCard}>
          <Text variant="caption" color="secondary">{t('clients:balance.weOwe')}</Text>
          <Text variant="h3" color="error">{formatCurrency(payables.cari, baseCurrency)}</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <Text variant="caption" color="secondary">{t('clients:balance.theyOwe')}</Text>
          <Text variant="h3" color="success">{formatCurrency(receivables.cari, baseCurrency)}</Text>
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
        extraData={{ selectedIds, isSelectMode, sortBy, expandedCariId }}
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

      {/* Sort ActionSheet */}
      <ActionSheet
        visible={sortSheetVisible}
        onClose={() => setSortSheetVisible(false)}
        title={t('common:sort.sortBy')}
        options={sortSheetOptions}
        cancelLabel={t('common:buttons.cancel')}
      />

      {/* Accept Code Sheet */}
      <AcceptCodeSheet
        visible={acceptCodeVisible}
        onDismiss={() => setAcceptCodeVisible(false)}
      />

      {/* Share Code Modal */}
      {shareModalCari && (
        <ShareCodeModal
          visible={shareModalVisible}
          onDismiss={() => {
            setShareModalVisible(false);
            setShareModalCari(null);
          }}
          cariId={shareModalCari.id}
          cariName={shareModalCari.name}
        />
      )}

      {/* Camera FAB for photo import */}
      {!isSelectMode && (
        <TouchableOpacity
          style={[styles.fab, { bottom: spacing.lg + insets.bottom }]}
          onPress={() => {
            haptics.light();
            router.push('/foto-import' as any);
          }}
          activeOpacity={0.8}
        >
          <Camera size={24} color={colors.surface} />
        </TouchableOpacity>
      )}

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
              onPress={selectedIds.size === filteredCariler?.filter(c => !c.isLinked).length ? handleDeselectAll : handleSelectAll}
              style={styles.bulkActionSelectAll}
            >
              <Text variant="body" style={{ color: colors.primary }}>
                {selectedIds.size === filteredCariler?.filter(c => !c.isLinked).length
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
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sortButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
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
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  moreButton: {
    padding: spacing.xs,
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
  },
});
