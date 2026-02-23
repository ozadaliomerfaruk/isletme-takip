import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Animated, Alert, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  UserCircle,
  Plus,
  Phone,
  Briefcase,
  EyeOff,
  MinusCircle,
  Banknote,
  X,
  Archive,
  Edit3,
  Trash2,
  CheckCircle2,
  Circle,
  CheckSquare,
  ArrowUpDown,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, SearchInput, Button, EmptyState, Card, ActionSheet, type ActionSheetOption, SkeletonAccountList, SkeletonSummaryPair, Avatar, AnimatedListItem } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useHaptics } from '@/hooks/useHaptics';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { getInitials } from '@/lib/utils';
import { usePersonelList, useDeletePersonel } from '@/hooks/usePersonel';
import { useArchivePersonel } from '@/hooks/useArchive';
import type { Personel } from '@/types/database';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';

export default function PersonelPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(['staff', 'common', 'navigation']);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'balanceHigh' | 'balanceLow'>('balanceHigh');
  const [quickBarVisible, setQuickBarVisible] = useState(false);
  const [selectedPersonelId, setSelectedPersonelId] = useState<string | null>(null);
  const [fabMenuVisible, setFabMenuVisible] = useState(false);

  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // FAB animation
  const fabAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(fabAnim, {
      toValue: fabMenuVisible ? 1 : 0,
      damping: 15,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  }, [fabMenuVisible, fabAnim]);

  // Toast ve Haptics
  const { showToast } = useToast();
  const haptics = useHaptics();

  // Gerçek veriler - pasif personeli de dahil et
  const { data: personelList, isLoading, refetch } = usePersonelList(true);
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

  // ActionSheet için state
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetPersonel, setActionSheetPersonel] = useState<Personel | null>(null);

  // Mutations
  const archivePersonel = useArchivePersonel();
  const deletePersonel = useDeletePersonel();

  // Settings ve döviz kurları
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;

  // Sort ActionSheet
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const sortSheetOptions: ActionSheetOption[] = [
    { label: t('common:sort.balanceHighLow'), icon: <ArrowUpDown size={20} color={sortBy === 'balanceHigh' ? colors.primary : colors.text} />, onPress: () => setSortBy('balanceHigh') },
    { label: t('common:sort.balanceLowHigh'), icon: <ArrowUpDown size={20} color={sortBy === 'balanceLow' ? colors.primary : colors.text} />, onPress: () => setSortBy('balanceLow') },
    { label: t('common:sort.nameAZ'), icon: <ArrowUpDown size={20} color={sortBy === 'name' ? colors.primary : colors.text} />, onPress: () => setSortBy('name') },
  ];

  // Action sheet handlers
  const handleOpenActionSheet = (personel: Personel) => {
    setActionSheetPersonel(personel);
    setActionSheetVisible(true);
  };

  const handleArchive = async () => {
    if (!actionSheetPersonel) return;
    try {
      await archivePersonel.mutateAsync(actionSheetPersonel.id);
      haptics.success();
      showToast(t('common:archive.messages.archiveSuccess'), 'success');
    } catch (error) {
      haptics.error();
      showToast(t('common:messages.operationFailed'), 'error');
    }
  };

  const handleDelete = () => {
    if (!actionSheetPersonel) return;
    const name = `${actionSheetPersonel.first_name} ${actionSheetPersonel.last_name}`;
    Alert.alert(
      t('common:confirm.deleteTitle'),
      t('common:confirm.deleteMessage', { item: name }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePersonel.mutateAsync(actionSheetPersonel.id);
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
    if (actionSheetPersonel) {
      setIsSelectMode(true);
      setSelectedIds(new Set([actionSheetPersonel.id]));
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
    if (filteredPersonel) {
      setSelectedIds(new Set(filteredPersonel.map(p => p.id)));
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
              const promises = Array.from(selectedIds).map(id => deletePersonel.mutateAsync(id));
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
              const promises = Array.from(selectedIds).map(id => archivePersonel.mutateAsync(id));
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
        if (actionSheetPersonel) {
          router.push(`/personel/duzenle/${actionSheetPersonel.id}`);
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

  // Arama ve sıralama (aktif önce)
  const filteredPersonel = (personelList ?? [])
    .filter((p) =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
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
      return a.first_name.localeCompare(b.first_name, 'tr');
    });

  // Helper fonksiyonlar - nested ternary yerine daha okunabilir
  function getBalanceLabel(balance: number): string {
    if (balance === 0) return t('staff:balance.noBalance');
    if (balance < 0) return t('staff:balance.weOwe');
    return t('staff:balance.theyOwe');
  }

  function getBalanceColor(balance: number): 'secondary' | 'error' | 'success' {
    if (balance === 0) return 'secondary';
    if (balance < 0) return 'error';
    return 'success';
  }


  // FlatList renderItem fonksiyonu - performans için useCallback ile memoize edildi
  const renderPersonelItem = useCallback(({ item: personel, index }: { item: Personel; index: number }) => {
    const isSelected = selectedIds.has(personel.id);
    return (
      <AnimatedListItem index={index}>
      <View style={[!personel.is_active && styles.passiveItem, isSelectMode && isSelected && styles.selectedItem]}>
        {isSelectMode ? (
          <TouchableOpacity
            style={styles.selectableCard}
            onPress={() => toggleSelection(personel.id)}
            activeOpacity={0.7}
          >
            <View style={styles.personelHeader}>
              {/* Selection checkbox */}
              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                {isSelected ? (
                  <CheckCircle2 size={24} color={colors.primary} />
                ) : (
                  <Circle size={24} color={colors.border} />
                )}
              </View>
              <Avatar name={`${personel.first_name} ${personel.last_name}`} size={40} />
              <View style={styles.personelInfo}>
                <View style={styles.personelNameRow}>
                  <Text variant="body">
                    {personel.first_name} {personel.last_name}
                  </Text>
                  {!personel.is_active && (
                    <EyeOff size={14} color={colors.textMuted} />
                  )}
                </View>
              </View>
              <View style={styles.personelBalance}>
                <Text
                  variant="body"
                  color={getBalanceColor(toNumber(personel.balance))}
                >
                  {formatCurrency(Math.abs(toNumber(personel.balance)), personel.currency)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => router.push(`/personel/${personel.id}`)}
            onLongPress={() => {
              haptics.selection();
              handleOpenActionSheet(personel);
            }}
            activeOpacity={0.7}
            style={styles.entityCard}
          >
            <View style={styles.personelHeader}>
              <Avatar name={`${personel.first_name} ${personel.last_name}`} size={40} />
              <View style={styles.personelInfo}>
                <View style={styles.personelNameRow}>
                  <Text variant="body">
                    {personel.first_name} {personel.last_name}
                  </Text>
                  {!personel.is_active && (
                    <EyeOff size={14} color={colors.textMuted} />
                  )}
                </View>
                <View style={styles.personelMeta}>
                  {personel.position && (
                    <>
                      <Briefcase size={12} color={colors.textMuted} />
                      <Text variant="caption" color="secondary">
                        {personel.position}
                      </Text>
                    </>
                  )}
                  {personel.phone && (
                    <>
                      <Phone size={12} color={colors.textMuted} style={{ marginLeft: spacing.sm }} />
                      <Text variant="caption" color="secondary">
                        {personel.phone}
                      </Text>
                    </>
                  )}
                </View>
              </View>
              <View style={styles.personelBalance}>
                <Text variant="caption" color="secondary">
                  {getBalanceLabel(toNumber(personel.balance))}
                </Text>
                <Text
                  variant="h3"
                  color={getBalanceColor(toNumber(personel.balance))}
                >
                  {formatCurrency(Math.abs(toNumber(personel.balance)), personel.currency)}
                </Text>
                {personel.currency !== baseCurrency && exchangeRates && toNumber(personel.balance) !== 0 && (
                  <Text variant="caption" color="secondary">
                    ~{formatCurrency(convertCurrency(Math.abs(toNumber(personel.balance)), personel.currency, baseCurrency, exchangeRates) ?? 0, baseCurrency)}
                  </Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
      </View>
      </AnimatedListItem>
    );
  }, [selectedIds, isSelectMode, t, baseCurrency, exchangeRates, haptics, toggleSelection, handleOpenActionSheet, router, getBalanceLabel, getBalanceColor]);

  // FlatList ListHeaderComponent - header, özet ve arama
  const ListHeader = useMemo(() => (
    <>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="h2">{t('staff:titles.personnel')}</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => setSortSheetVisible(true)}
            activeOpacity={0.7}
          >
            <ArrowUpDown size={18} color={colors.primary} />
          </TouchableOpacity>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={18} color={colors.white} />}
            onPress={() => router.push('/personel/ekle')}
          >
            {t('common:buttons.add')}
          </Button>
        </View>
      </View>

      {/* Özet Kartları */}
      <View style={styles.summaryContainer}>
        <Card style={styles.summaryCard}>
          <Text variant="caption" color="secondary">{t('staff:balance.weOwe')}</Text>
          <Text variant="h3" color="error">{formatCurrency(payables.personel)}</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <Text variant="caption" color="secondary">{t('staff:balance.theyOwe')}</Text>
          <Text variant="h3" color="success">{formatCurrency(receivables.personel)}</Text>
        </Card>
      </View>

      {/* Arama */}
      <View style={styles.searchContainer}>
        <SearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('staff:search.searchPersonnel')}
        />
      </View>

      {/* Loading state */}
      {isLoading && <SkeletonAccountList count={5} />}
    </>
  ), [t, router, payables.personel, receivables.personel, searchQuery, isLoading]);

  // FlatList ListEmptyComponent
  const ListEmpty = useMemo(() => {
    if (isLoading) return null;
    return (
      <EmptyState
        icon={<UserCircle size={48} color={colors.textMuted} />}
        title={searchQuery ? t('staff:search.noResults') : t('staff:messages.noPersonnel')}
        description={
          searchQuery
            ? t('common:search.tryDifferent')
            : t('staff:messages.addFirstPersonnel')
        }
        actionLabel={searchQuery ? undefined : t('staff:titles.addPersonnel')}
        onAction={searchQuery ? undefined : () => router.push('/personel/ekle')}
      />
    );
  }, [isLoading, searchQuery, t, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        style={styles.scrollView}
        data={isLoading ? [] : filteredPersonel}
        keyExtractor={(item) => item.id}
        renderItem={renderPersonelItem}
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
        extraData={{ selectedIds, isSelectMode, sortBy }}
        contentContainerStyle={styles.listContainer}
      />

      {/* FAB Backdrop */}
      {fabMenuVisible && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setFabMenuVisible(false)}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.3)', opacity: fabAnim },
            ]}
          />
        </Pressable>
      )}

      {/* FAB Menu Items */}
      {!isSelectMode && fabMenuVisible && (
        <View style={[styles.fabMenuContainer, { bottom: spacing.lg + insets.bottom + 56 + spacing.md }]}>
          {[
            {
              label: t('staff:bulkActions.addPayment'),
              icon: <Banknote size={18} color={colors.success} />,
              onPress: () => {
                haptics.light();
                setFabMenuVisible(false);
                router.push('/personel/toplu-odeme');
              },
              index: 1,
            },
            {
              label: t('staff:bulkActions.addExpense'),
              icon: <MinusCircle size={18} color={colors.error} />,
              onPress: () => {
                haptics.light();
                setFabMenuVisible(false);
                router.push('/personel/toplu-gider');
              },
              index: 0,
            },
          ].map((item) => (
            <Animated.View
              key={item.label}
              style={{
                opacity: fabAnim,
                transform: [{
                  translateY: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20 + item.index * 10, 0],
                  }),
                }, {
                  scale: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  }),
                }],
              }}
            >
              <TouchableOpacity
                style={styles.fabMenuItem}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={styles.fabMenuIcon}>{item.icon}</View>
                <Text style={styles.fabMenuLabel}>{item.label}</Text>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>
      )}

      {/* FAB Button */}
      {!isSelectMode && (
        <TouchableOpacity
          style={[styles.fab, { bottom: spacing.lg + insets.bottom }]}
          onPress={() => {
            haptics.light();
            setFabMenuVisible(!fabMenuVisible);
          }}
          activeOpacity={0.8}
        >
          <Animated.View style={{
            transform: [{
              rotate: fabAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '45deg'],
              }),
            }],
          }}>
            <Plus size={24} color={colors.surface} />
          </Animated.View>
        </TouchableOpacity>
      )}

      {/* Quick Transaction Bar */}
      <QuickTransactionBar
        visible={quickBarVisible}
        onDismiss={() => {
          setQuickBarVisible(false);
          setSelectedPersonelId(null);
        }}
        defaultPersonelId={selectedPersonelId || undefined}
        onSuccess={() => {
          setQuickBarVisible(false);
          setSelectedPersonelId(null);
        }}
      />

      {/* Action Sheet */}
      <ActionSheet
        visible={actionSheetVisible}
        onClose={() => {
          setActionSheetVisible(false);
          setActionSheetPersonel(null);
        }}
        title={actionSheetPersonel ? `${actionSheetPersonel.first_name} ${actionSheetPersonel.last_name}` : undefined}
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
              onPress={selectedIds.size === filteredPersonel?.length ? handleDeselectAll : handleSelectAll}
              style={styles.bulkActionSelectAll}
            >
              <Text variant="body" style={{ color: colors.primary }}>
                {selectedIds.size === filteredPersonel?.length
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
    marginBottom: spacing.lg,
  },
  listContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  personelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personelInfo: {
    flex: 1,
  },
  personelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  passiveItem: {
    opacity: 0.5,
  },
  personelMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  personelBalance: {
    alignItems: 'flex-end',
  },
  entityCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  // FAB Styles
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
  fabMenuContainer: {
    position: 'absolute',
    right: spacing.lg,
    alignItems: 'flex-end',
    gap: spacing.sm,
    zIndex: 9,
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    gap: spacing.sm,
  },
  fabMenuIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabMenuLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
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
    marginBottom: spacing.xs,
  },
  checkbox: {
    marginRight: spacing.sm,
  },
  checkboxSelected: {
    // Additional styling for selected state if needed
  },
  // Bulk action bar styles
  bulkActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  bulkActionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
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
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  bulkActionArchive: {
    borderColor: colors.warning,
    backgroundColor: colors.warningLight,
  },
  bulkActionDelete: {
    borderColor: colors.error,
    backgroundColor: colors.errorLight,
  },
});
