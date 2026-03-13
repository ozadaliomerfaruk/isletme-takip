import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { View, StyleSheet, FlatList, ScrollView, Alert, TouchableOpacity, Animated, Modal, Pressable, Platform, RefreshControl, ListRenderItemInfo } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus, Package, Search, ArrowRightLeft, History, X, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Calendar, MoreVertical, Edit3, Archive, ArchiveRestore, Trash2, ArrowUpDown, AlertTriangle } from 'lucide-react-native';
import { Text, Button, Input, EmptyState, ExpandableCard, TabFilter, ActionSheet, type ActionSheetOption } from '@/components/ui';
import { QuickUrunBar } from '@/components/urun/QuickUrunBar';
import { useHaptics } from '@/hooks/useHaptics';
import { useDateFormat } from '@/hooks/useDateFormat';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useUrunler, useDeleteUrun, useArchiveUrun, usePermanentDeleteUrun } from '@/hooks/useUrunler';
import { useArchivedUrunler, useUnarchiveUrun } from '@/hooks/useArchive';
import { useToast } from '@/contexts/ToastContext';
import { useDonemUrunOzet } from '@/hooks/useUrunHareketler';
import { useKategoriler } from '@/hooks/useKategoriler';
import { Urun, BirimType } from '@/types/database';
import { formatCurrency } from '@/lib/currency';
import { formatDateForDB } from '@/lib/date';
import { PermissionGate } from '@/components/PermissionGate';
import { usePermissions } from '@/hooks/usePermissions';

type PeriodType = 'yearly' | 'monthly' | 'weekly' | 'daily' | 'custom';
type SortType = 'nameAZ' | 'nameZA' | 'purchaseMost' | 'purchaseLeast' | 'saleMost' | 'saleLeast';

interface DonemOzet { giris: number; cikis: number }

// ============================================================================
// Memoized Product Row Components
// ============================================================================

interface ProductRowProps {
  urun: Urun;
  expanded: boolean;
  onToggle: (id: string) => void;
  onNewTransaction: (urun: Urun) => void;
  onViewMovements: (id: string) => void;
  onOpenActionSheet: (urun: Urun) => void;
  urunOzet?: DonemOzet;
  kategoriAdi?: string;
  getBirimLabel: (birim: BirimType) => string;
}

const ProductRow = memo(function ProductRow({
  urun, expanded, onToggle, onNewTransaction, onViewMovements, onOpenActionSheet,
  urunOzet, kategoriAdi, getBirimLabel,
}: ProductRowProps) {
  const { t } = useTranslation(['products', 'common']);
  const hasMovements = urunOzet && (urunOzet.giris > 0 || urunOzet.cikis > 0);

  const handleToggle = useCallback(() => onToggle(urun.id), [onToggle, urun.id]);
  const handleTransaction = useCallback(() => onNewTransaction(urun), [onNewTransaction, urun]);
  const handleMovements = useCallback(() => onViewMovements(urun.id), [onViewMovements, urun.id]);
  const handleActionSheet = useCallback((e: any) => {
    e.stopPropagation();
    onOpenActionSheet(urun);
  }, [onOpenActionSheet, urun]);

  return (
    <View style={rowStyles.wrapper}>
      <ExpandableCard
        expanded={expanded}
        onToggle={handleToggle}
        header={
          <View style={rowStyles.header}>
            <View style={rowStyles.iconWrap}>
              <Package size={18} color={colors.primary} />
            </View>
            <View style={rowStyles.info}>
              <View style={rowStyles.nameRow}>
                <Text variant="body" style={rowStyles.name} numberOfLines={1}>{urun.ad}</Text>
                {urun.kod ? (
                  <View style={rowStyles.codeBadge}>
                    <Text style={rowStyles.codeBadgeText}>{urun.kod}</Text>
                  </View>
                ) : null}
              </View>
              <View style={rowStyles.metaRow}>
                <Text variant="caption" color="secondary">
                  {urun.miktar} {getBirimLabel(urun.birim)}
                </Text>
                {urun.satis_fiyati > 0 && (
                  <Text variant="caption" color="secondary">
                    {formatCurrency(urun.satis_fiyati, urun.currency)}/{getBirimLabel(urun.birim)}
                  </Text>
                )}
                {kategoriAdi && (
                  <View style={rowStyles.categoryChip}>
                    <Text style={rowStyles.categoryChipText}>{kategoriAdi}</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={rowStyles.periodSummary}>
              {hasMovements ? (
                <>
                  {urunOzet.giris > 0 && (
                    <View style={rowStyles.pillIn}>
                      <Text style={rowStyles.pillInText}>+{urunOzet.giris}</Text>
                    </View>
                  )}
                  {urunOzet.cikis > 0 && (
                    <View style={rowStyles.pillOut}>
                      <Text style={rowStyles.pillOutText}>-{urunOzet.cikis}</Text>
                    </View>
                  )}
                </>
              ) : null}
            </View>
            <TouchableOpacity
              style={rowStyles.moreBtn}
              onPress={handleActionSheet}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MoreVertical size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        }
      >
        <View style={rowStyles.actions}>
          <Button
            variant="primary"
            size="sm"
            icon={<ArrowRightLeft size={16} color={colors.white} />}
            iconPosition="left"
            onPress={handleTransaction}
            style={rowStyles.actionBtn}
          >
            {t('products:actions.newTransaction')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<History size={16} color={colors.primary} />}
            iconPosition="left"
            onPress={handleMovements}
            style={rowStyles.actionBtn}
          >
            {t('products:actions.viewMovements')}
          </Button>
        </View>
      </ExpandableCard>
    </View>
  );
});

interface ArchivedProductRowProps {
  urun: Urun;
  expanded: boolean;
  onToggle: (id: string) => void;
  onViewMovements: (id: string) => void;
  onOpenActionSheet: (urun: Urun) => void;
  getBirimLabel: (birim: BirimType) => string;
}

const ArchivedProductRow = memo(function ArchivedProductRow({
  urun, expanded, onToggle, onViewMovements, onOpenActionSheet, getBirimLabel,
}: ArchivedProductRowProps) {
  const { t } = useTranslation(['products', 'common']);

  const handleToggle = useCallback(() => onToggle(urun.id), [onToggle, urun.id]);
  const handleMovements = useCallback(() => onViewMovements(urun.id), [onViewMovements, urun.id]);
  const handleActionSheet = useCallback((e: any) => {
    e.stopPropagation();
    onOpenActionSheet(urun);
  }, [onOpenActionSheet, urun]);

  return (
    <View style={rowStyles.wrapper}>
      <ExpandableCard
        expanded={expanded}
        onToggle={handleToggle}
        header={
          <View style={rowStyles.header}>
            <Package size={24} color={colors.textMuted} />
            <View style={rowStyles.info}>
              <Text variant="body" color="secondary">{urun.ad}</Text>
              <Text variant="caption" color="muted">
                {urun.miktar} {getBirimLabel(urun.birim)}
                {urun.kod && ` • ${urun.kod}`}
              </Text>
            </View>
            <TouchableOpacity
              style={rowStyles.moreBtn}
              onPress={handleActionSheet}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MoreVertical size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        }
      >
        <View style={rowStyles.actions}>
          <Button
            variant="outline"
            size="sm"
            icon={<History size={16} color={colors.primary} />}
            iconPosition="left"
            onPress={handleMovements}
            style={rowStyles.actionBtn}
          >
            {t('products:actions.viewMovements')}
          </Button>
        </View>
      </ExpandableCard>
    </View>
  );
});

const rowStyles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  codeBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
  },
  codeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  categoryChip: {
    backgroundColor: colors.background,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  periodSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillIn: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  pillInText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.success,
  },
  pillOut: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  pillOutText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.error,
  },
  moreBtn: {
    padding: spacing.xs,
    marginLeft: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionBtn: {
    flex: 1,
  },
});

// ============================================================================
// Main Page Component
// ============================================================================

export default function UrunlerPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const { t } = useTranslation(['products', 'common', 'errors', 'reports', 'categories']);
  const { getDateRangeLabel, locale } = useDateFormat();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quickUrunVisible, setQuickUrunVisible] = useState(false);
  const [selectedUrun, setSelectedUrun] = useState<Urun | null>(null);
  const [fabMenuVisible, setFabMenuVisible] = useState(false);
  const [sortType, setSortType] = useState<SortType>('nameAZ');
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  // ActionSheet için state
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetUrun, setActionSheetUrun] = useState<Urun | null>(null);

  // Dönem seçici state'leri
  const [period, setPeriod] = useState<PeriodType>('monthly');
  const [periodOffset, setPeriodOffset] = useState(0);

  // Özel tarih aralığı state'leri
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Hızlı dönem seçimi için state'ler
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Dönem seçici seçenekleri
  const PERIOD_OPTIONS = [
    { label: t('products:period.yearly'), value: 'yearly' },
    { label: t('products:period.monthly'), value: 'monthly' },
    { label: t('products:period.weekly'), value: 'weekly' },
    { label: t('products:period.daily'), value: 'daily' },
    { label: t('products:period.custom'), value: 'custom' },
  ];

  // Dönem tarih aralığını hesapla
  const customRange = period === 'custom' ? {
    startDate: formatDateForDB(customStartDate),
    endDate: formatDateForDB(customEndDate),
  } : undefined;
  const { startDate, endDate, label: periodLabel } = getDateRangeLabel(period, periodOffset, customRange);

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

  const { canUpdate, canDelete } = usePermissions();
  const { data: urunler, isLoading, refetch } = useUrunler();
  const { data: archivedUrunler, refetch: refetchArchived } = useArchivedUrunler();
  const deleteUrun = useDeleteUrun();
  const archiveUrun = useArchiveUrun();
  const permanentDeleteUrun = usePermanentDeleteUrun();
  const unarchiveUrun = useUnarchiveUrun();

  // Pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetch(), refetchArchived()]);
    } finally { setIsRefreshing(false); }
  }, [refetch, refetchArchived]);
  const { data: kategoriler } = useKategoriler();
  const { showToast } = useToast();

  // Dönem bazlı urun hareketleri özeti
  const { data: donemUrunOzet } = useDonemUrunOzet({ startDate, endDate });

  // Kategorisiz ürün sayısı
  const uncategorizedProductCount = useMemo(
    () => (urunler || []).filter(u => !u.kategori_id).length,
    [urunler]
  );

  // Kategori id -> ad map'i
  const kategoriMap = useMemo(() => new Map(kategoriler?.map(k => [k.id, k.name]) || []), [kategoriler]);

  // Arama filtresi (ürün adı, kodu ve kategori adı)
  const filteredUrunler = useMemo(() => {
    const filtered = urunler?.filter((urun) => {
      const query = searchQuery.toLowerCase();
      const kategoriAdi = urun.kategori_id ? kategoriMap.get(urun.kategori_id)?.toLowerCase() : '';
      return (
        urun.ad.toLowerCase().includes(query) ||
        (urun.kod && urun.kod.toLowerCase().includes(query)) ||
        (kategoriAdi && kategoriAdi.includes(query))
      );
    }) || [];

    // Sıralama
    return [...filtered].sort((a, b) => {
      const ozetA = donemUrunOzet?.[a.id];
      const ozetB = donemUrunOzet?.[b.id];
      switch (sortType) {
        case 'nameAZ':
          return a.ad.localeCompare(b.ad, 'tr');
        case 'nameZA':
          return b.ad.localeCompare(a.ad, 'tr');
        case 'purchaseMost':
          return (ozetB?.giris ?? 0) - (ozetA?.giris ?? 0);
        case 'purchaseLeast':
          return (ozetA?.giris ?? 0) - (ozetB?.giris ?? 0);
        case 'saleMost':
          return (ozetB?.cikis ?? 0) - (ozetA?.cikis ?? 0);
        case 'saleLeast':
          return (ozetA?.cikis ?? 0) - (ozetB?.cikis ?? 0);
        default:
          return 0;
      }
    });
  }, [urunler, searchQuery, kategoriMap, sortType, donemUrunOzet]);

  // Arşivlenmiş ürünler filtresi
  const filteredArchivedUrunler = useMemo(() => {
    if (!archivedUrunler) return [];
    if (!searchQuery) return archivedUrunler;
    const query = searchQuery.toLowerCase();
    return archivedUrunler.filter((urun) => {
      const kategoriAdi = urun.kategori_id ? kategoriMap.get(urun.kategori_id)?.toLowerCase() : '';
      return (
        urun.ad.toLowerCase().includes(query) ||
        (urun.kod && urun.kod.toLowerCase().includes(query)) ||
        (kategoriAdi && kategoriAdi.includes(query))
      );
    });
  }, [archivedUrunler, searchQuery, kategoriMap]);

  const archivedCount = archivedUrunler?.length ?? 0;

  // Tab seçenekleri
  const TAB_OPTIONS = useMemo(() => [
    { label: t('products:tabs.active'), value: 'active' },
    { label: archivedCount > 0 ? `${t('products:tabs.archived')} (${archivedCount})` : t('products:tabs.archived'), value: 'archived' },
  ], [t, archivedCount]);

  // Sıralama seçenekleri
  const sortOptions: ActionSheetOption[] = useMemo(() => {
    const options: { key: SortType; label: string }[] = [
      { key: 'nameAZ', label: t('products:sort.nameAZ') },
      { key: 'nameZA', label: t('products:sort.nameZA') },
      { key: 'purchaseMost', label: t('products:sort.purchaseMost') },
      { key: 'purchaseLeast', label: t('products:sort.purchaseLeast') },
      { key: 'saleMost', label: t('products:sort.saleMost') },
      { key: 'saleLeast', label: t('products:sort.saleLeast') },
    ];
    return options.map(opt => ({
      label: opt.key === sortType ? `✓  ${opt.label}` : `    ${opt.label}`,
      onPress: () => {
        setSortType(opt.key);
        haptics.light();
      },
    }));
  }, [sortType, t, haptics]);

  // ActionSheet handlers
  const handleOpenActionSheet = useCallback((urun: Urun) => {
    setActionSheetUrun(urun);
    setActionSheetVisible(true);
  }, []);

  const handleArchive = useCallback(async () => {
    if (!actionSheetUrun) return;
    try {
      await archiveUrun.mutateAsync(actionSheetUrun.id);
      haptics.success();
      showToast(t('common:archive.messages.archiveSuccess'), 'success');
    } catch {
      haptics.error();
      showToast(t('common:messages.operationFailed'), 'error');
    }
  }, [actionSheetUrun, archiveUrun, haptics, showToast, t]);

  const handleDelete = useCallback(() => {
    if (!actionSheetUrun) return;
    Alert.alert(
      t('common:confirm.deleteTitle'),
      t('common:confirm.deleteMessage', { item: actionSheetUrun.ad }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUrun.mutateAsync(actionSheetUrun.id);
              haptics.success();
              showToast(t('common:messages.deletedSuccessfully'), 'success');
            } catch {
              haptics.error();
              showToast(t('common:messages.operationFailed'), 'error');
            }
          },
        },
      ]
    );
  }, [actionSheetUrun, deleteUrun, haptics, showToast, t]);

  const handleUnarchive = useCallback(async () => {
    if (!actionSheetUrun) return;
    try {
      await unarchiveUrun.mutateAsync(actionSheetUrun.id);
      haptics.success();
      showToast(t('common:archive.messages.unarchiveSuccess'), 'success');
    } catch {
      haptics.error();
      showToast(t('common:messages.operationFailed'), 'error');
    }
  }, [actionSheetUrun, unarchiveUrun, haptics, showToast, t]);

  const handlePermanentDelete = useCallback(() => {
    if (!actionSheetUrun) return;
    Alert.alert(
      t('common:confirm.deleteTitle'),
      t('common:confirm.deleteMessage', { item: actionSheetUrun.ad }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await permanentDeleteUrun.mutateAsync(actionSheetUrun.id);
              haptics.success();
              showToast(t('common:messages.deletedSuccessfully'), 'success');
            } catch {
              haptics.error();
              showToast(t('common:messages.operationFailed'), 'error');
            }
          },
        },
      ]
    );
  }, [actionSheetUrun, permanentDeleteUrun, haptics, showToast, t]);

  const actionSheetOptions: ActionSheetOption[] = useMemo(() => {
    if (activeTab === 'archived') {
      // Arşiv modunda: Arşivden çıkar + Kalıcı sil
      const options: ActionSheetOption[] = [];
      if (actionSheetUrun && canUpdate('urunler', actionSheetUrun.created_by ?? null)) {
        options.push({
          label: t('common:archive.actions.unarchive'),
          icon: <ArchiveRestore size={20} color={colors.primary} />,
          onPress: handleUnarchive,
        });
      }
      if (actionSheetUrun && canDelete('urunler', actionSheetUrun.created_by ?? null)) {
        options.push({
          label: t('common:archive.actions.permanentDelete'),
          icon: <Trash2 size={20} color={colors.error} />,
          onPress: handlePermanentDelete,
          destructive: true,
        });
      }
      return options;
    }

    // Aktif modunda: Düzenle + Arşivle + Sil
    const options: ActionSheetOption[] = [];

    if (actionSheetUrun && canUpdate('urunler', actionSheetUrun.created_by ?? null)) {
      options.push({
        label: t('common:buttons.edit'),
        icon: <Edit3 size={20} color={colors.primary} />,
        onPress: () => {
          if (actionSheetUrun) {
            router.push(`/urunler/duzenle/${actionSheetUrun.id}` as any);
          }
        },
      });
      options.push({
        label: t('common:archive.actions.archive'),
        icon: <Archive size={20} color={colors.warning} />,
        onPress: handleArchive,
      });
    }

    if (actionSheetUrun && canDelete('urunler', actionSheetUrun.created_by ?? null)) {
      options.push({
        label: t('common:buttons.delete'),
        icon: <Trash2 size={20} color={colors.error} />,
        onPress: handleDelete,
        destructive: true,
      });
    }

    return options;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionSheetUrun, t, router, activeTab, handleArchive, handleDelete, handleUnarchive, handlePermanentDelete, canUpdate, canDelete]);

  // Hızlı dönem seçimi fonksiyonları
  const handlePeriodLabelPress = () => {
    switch (period) {
      case 'yearly':
        setShowYearPicker(true);
        break;
      case 'monthly':
      case 'weekly': {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const targetDate = new Date(currentYear, currentMonth + periodOffset, 1);
        setSelectedYear(targetDate.getFullYear());
        setShowMonthYearPicker(true);
        break;
      }
      case 'daily':
        setShowDayPicker(true);
        break;
    }
  };

  const goToYear = (year: number) => {
    const currentYear = new Date().getFullYear();
    setPeriodOffset(year - currentYear);
    setShowYearPicker(false);
  };

  const goToMonth = (year: number, month: number) => {
    const now = new Date();
    const monthsDiff = (year - now.getFullYear()) * 12 + (month - now.getMonth());
    setPeriodOffset(monthsDiff);
    setShowMonthYearPicker(false);
  };

  const goToDay = (date: Date) => {
    const now = new Date();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const daysDiff = Math.round((dateMidnight.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));
    setPeriodOffset(daysDiff);
    setShowDayPicker(false);
  };

  const goToWeekOfMonth = (year: number, month: number) => {
    const now = new Date();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const firstDayOfMonth = new Date(year, month, 1);
    const daysDiff = Math.round((firstDayOfMonth.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));
    const weeksDiff = Math.round(daysDiff / 7);
    setPeriodOffset(weeksDiff);
    setShowMonthYearPicker(false);
  };

  const getBirimLabel = useCallback((birim: BirimType) => {
    return t(`products:units.${birim}`);
  }, [t]);

  const handleToggle = useCallback((urunId: string) => {
    setExpandedId(prev => prev === urunId ? null : urunId);
  }, []);

  const handleNewTransaction = useCallback((urun: Urun) => {
    setSelectedUrun(urun);
    setQuickUrunVisible(true);
  }, []);

  const handleViewMovements = useCallback((urunId: string) => {
    router.push(`/urunler/${urunId}` as any);
  }, [router]);

  // FlatList renderItem for active products
  const renderActiveItem = useCallback(({ item: urun }: ListRenderItemInfo<Urun>) => (
    <ProductRow
      urun={urun}
      expanded={expandedId === urun.id}
      onToggle={handleToggle}
      onNewTransaction={handleNewTransaction}
      onViewMovements={handleViewMovements}
      onOpenActionSheet={handleOpenActionSheet}
      urunOzet={donemUrunOzet?.[urun.id]}
      kategoriAdi={urun.kategori_id ? kategoriMap.get(urun.kategori_id) : undefined}
      getBirimLabel={getBirimLabel}
    />
  ), [expandedId, handleToggle, handleNewTransaction, handleViewMovements, handleOpenActionSheet, donemUrunOzet, kategoriMap, getBirimLabel]);

  // FlatList renderItem for archived products
  const renderArchivedItem = useCallback(({ item: urun }: ListRenderItemInfo<Urun>) => (
    <ArchivedProductRow
      urun={urun}
      expanded={expandedId === urun.id}
      onToggle={handleToggle}
      onViewMovements={handleViewMovements}
      onOpenActionSheet={handleOpenActionSheet}
      getBirimLabel={getBirimLabel}
    />
  ), [expandedId, handleToggle, handleViewMovements, handleOpenActionSheet, getBirimLabel]);

  const keyExtractor = useCallback((item: Urun) => item.id, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text color="secondary">{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // List header: search, tabs, period selector
  const listHeaderComponent = useMemo(() => (
    <View>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="h2">{t('products:title')}</Text>
        <View style={styles.headerButtons}>
          {(urunler && urunler.length > 0) && (
            <TouchableOpacity
              style={styles.sortButton}
              onPress={() => {
                haptics.light();
                setSortSheetVisible(true);
              }}
              activeOpacity={0.7}
            >
              <ArrowUpDown size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
          <PermissionGate module="urunler" action="create">
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={18} color={colors.white} />}
              iconPosition="left"
              onPress={() => router.push('/urunler/ekle' as any)}
            >
              {t('common:buttons.add')}
            </Button>
          </PermissionGate>
        </View>
      </View>

      {/* Arama */}
      {((urunler && urunler.length > 0) || archivedCount > 0) && (
        <View style={styles.searchSection}>
          <Input
            placeholder={t('products:search.placeholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon={<Search size={20} color={colors.textMuted} />}
          />
        </View>
      )}

      {/* Aktif / Arşiv Tab */}
      {archivedCount > 0 && (
        <View style={styles.tabSection}>
          <TabFilter
            options={TAB_OPTIONS}
            value={activeTab}
            onChange={(v) => setActiveTab(v as 'active' | 'archived')}
          />
        </View>
      )}

      {/* Dönem Seçici */}
      {activeTab === 'active' && (urunler && urunler.length > 0) && (
        <View style={styles.periodSection}>
          <TabFilter
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(value) => {
              setPeriod(value as PeriodType);
              setPeriodOffset(0);
            }}
          />
          {period === 'custom' ? (
            <View style={styles.customDateRow}>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowStartPicker(true)}
              >
                <Calendar size={16} color={colors.primary} />
                <Text variant="caption">{t('products:period.startDate')}: {formatDateForDB(customStartDate)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowEndPicker(true)}
              >
                <Calendar size={16} color={colors.primary} />
                <Text variant="caption">{t('products:period.endDate')}: {formatDateForDB(customEndDate)}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.periodNav}>
              <TouchableOpacity
                onPress={() => {
                  haptics.light();
                  setPeriodOffset(periodOffset - 1);
                }}
                style={styles.periodNavButton}
              >
                <ChevronLeft size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { haptics.light(); handlePeriodLabelPress(); }}>
                <Text variant="body" style={styles.periodLabel}>{periodLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  haptics.light();
                  setPeriodOffset(periodOffset + 1);
                }}
                style={styles.periodNavButton}
                disabled={periodOffset >= 0}
              >
                <ChevronRight size={20} color={periodOffset >= 0 ? colors.textMuted : colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Kategorisiz ürün uyarısı */}
      {activeTab === 'active' && uncategorizedProductCount > 0 && (
        <View style={styles.warningSection}>
          <View style={styles.warningBanner}>
            <AlertTriangle size={16} color={colors.warning} />
            <Text variant="caption" style={styles.warningText}>
              {t('categories:warnings.uncategorizedProducts', { count: uncategorizedProductCount })}
            </Text>
          </View>
        </View>
      )}
    </View>
  ), [t, urunler, archivedCount, searchQuery, activeTab, TAB_OPTIONS, period, PERIOD_OPTIONS, periodOffset, periodLabel, customStartDate, customEndDate, haptics, router, uncategorizedProductCount]);

  // Empty component
  const listEmptyComponent = useMemo(() => {
    if (activeTab === 'active') {
      return (
        <View style={styles.listSection}>
          <EmptyState
            icon={<Package size={48} color={colors.textMuted} />}
            title={t('products:empty.title')}
            description={t('products:empty.description')}
            actionLabel={t('products:addProduct')}
            onAction={() => router.push('/urunler/ekle' as any)}
          />
        </View>
      );
    }
    return (
      <View style={styles.listSection}>
        <EmptyState
          icon={<Archive size={48} color={colors.textMuted} />}
          title={t('products:empty.archivedTitle')}
          description={t('products:empty.archivedDescription')}
        />
      </View>
    );
  }, [activeTab, t, router]);

  // Active list data
  const listData = activeTab === 'active' ? filteredUrunler : filteredArchivedUrunler;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={listData}
        keyExtractor={keyExtractor}
        renderItem={activeTab === 'active' ? renderActiveItem : renderArchivedItem}
        ListHeaderComponent={listHeaderComponent}
        ListEmptyComponent={listEmptyComponent}
        contentContainerStyle={styles.flatListContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
      />

      {/* QuickUrunBar */}
      <QuickUrunBar
        visible={quickUrunVisible}
        onDismiss={() => {
          setQuickUrunVisible(false);
          setSelectedUrun(null);
        }}
        urun={selectedUrun}
      />

      {/* ActionSheet */}
      <ActionSheet
        visible={actionSheetVisible}
        onClose={() => {
          setActionSheetVisible(false);
          setActionSheetUrun(null);
        }}
        title={actionSheetUrun?.ad}
        options={actionSheetOptions}
        cancelLabel={t('common:buttons.cancel')}
      />

      {/* Sort ActionSheet */}
      <ActionSheet
        visible={sortSheetVisible}
        onClose={() => setSortSheetVisible(false)}
        title={t('products:sort.title')}
        options={sortOptions}
        cancelLabel={t('common:buttons.cancel')}
      />

      {/* Date Pickers for Custom Period - iOS */}
      {Platform.OS === 'ios' && (showStartPicker || showEndPicker) && (
        <Modal visible={showStartPicker || showEndPicker} transparent animationType="slide">
          <Pressable
            style={styles.datePickerOverlay}
            onPress={() => {
              setShowStartPicker(false);
              setShowEndPicker(false);
            }}
          >
            <Pressable style={styles.datePickerModal} onPress={(e) => e.stopPropagation()}>
              <View style={styles.datePickerHeader}>
                <Text variant="h3">
                  {showStartPicker ? t('products:period.startDate') : t('products:period.endDate')}
                </Text>
                <TouchableOpacity onPress={() => {
                  setShowStartPicker(false);
                  setShowEndPicker(false);
                }}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.datePickerWrapper}>
                <DateTimePicker
                  value={showStartPicker ? customStartDate : customEndDate}
                  mode="date"
                  display="inline"
                  themeVariant="light"
                  accentColor={colors.primary}
                  locale={locale}
                  style={{ height: 350 }}
                  onChange={(_, date) => {
                    if (date) {
                      if (showStartPicker) {
                        setCustomStartDate(date);
                        if (date > customEndDate) {
                          setCustomEndDate(date);
                        }
                      } else {
                        setCustomEndDate(date);
                      }
                    }
                  }}
                  minimumDate={showEndPicker ? customStartDate : undefined}
                  maximumDate={new Date()}
                />
              </View>
              <Button variant="primary" onPress={() => {
                setShowStartPicker(false);
                setShowEndPicker(false);
              }}>
                {t('common:buttons.ok')}
              </Button>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Date Pickers for Custom Period - Android */}
      {Platform.OS === 'android' && showStartPicker && (
        <DateTimePicker
          value={customStartDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowStartPicker(false);
            if (event.type === 'set' && date) {
              setCustomStartDate(date);
              if (date > customEndDate) {
                setCustomEndDate(date);
              }
            }
          }}
          maximumDate={new Date()}
        />
      )}
      {Platform.OS === 'android' && showEndPicker && (
        <DateTimePicker
          value={customEndDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowEndPicker(false);
            if (event.type === 'set' && date) {
              setCustomEndDate(date);
            }
          }}
          minimumDate={customStartDate}
          maximumDate={new Date()}
        />
      )}

      {/* Yıl Picker Modal */}
      <Modal
        visible={showYearPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowYearPicker(false)}
      >
        <Pressable
          style={styles.pickerModalOverlay}
          onPress={() => setShowYearPicker(false)}
        >
          <Pressable style={styles.pickerModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerModalHeader}>
              <Text variant="h3">{t('reports:period.selectYear')}</Text>
              <TouchableOpacity onPress={() => setShowYearPicker(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.yearGrid}>
              {Array.from({ length: 12 }, (_, i) => 2020 + i).map((year) => {
                const isSelected = year === new Date().getFullYear() + periodOffset;
                return (
                  <TouchableOpacity
                    key={year}
                    style={[styles.yearGridCell, isSelected && styles.yearGridCellActive]}
                    onPress={() => goToYear(year)}
                  >
                    <Text
                      variant="body"
                      style={isSelected ? styles.yearGridTextActive : undefined}
                    >
                      {year}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Ay + Yıl Picker Modal */}
      <Modal
        visible={showMonthYearPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMonthYearPicker(false)}
      >
        <Pressable
          style={styles.pickerModalOverlay}
          onPress={() => setShowMonthYearPicker(false)}
        >
          <Pressable style={styles.pickerModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerModalHeader}>
              <Text variant="h3">{t('reports:period.selectMonthYear')}</Text>
              <TouchableOpacity onPress={() => setShowMonthYearPicker(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Yıl seçici */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.yearScrollView}
              contentContainerStyle={styles.yearScrollContent}
            >
              {Array.from({ length: 12 }, (_, i) => 2020 + i).map((year) => (
                <TouchableOpacity
                  key={year}
                  style={[
                    styles.yearChip,
                    selectedYear === year && styles.yearChipActive,
                  ]}
                  onPress={() => setSelectedYear(year)}
                >
                  <Text
                    variant="body"
                    style={selectedYear === year ? styles.yearChipTextActive : styles.yearChipText}
                  >
                    {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Ay grid */}
            <View style={styles.monthGrid}>
              {((() => { const m = t('common:date.monthsShort', { returnObjects: true }); return Array.isArray(m) ? m : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; })() as string[]).map((monthName, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.monthCell}
                  onPress={() => {
                    if (period === 'weekly') {
                      goToWeekOfMonth(selectedYear, index);
                    } else {
                      goToMonth(selectedYear, index);
                    }
                  }}
                >
                  <Text variant="body">{monthName}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Günlük DatePicker Modal (iOS) */}
      {Platform.OS === 'ios' && showDayPicker && (
        <Modal
          visible={showDayPicker}
          transparent
          animationType="slide"
        >
          <Pressable
            style={styles.pickerModalOverlay}
            onPress={() => setShowDayPicker(false)}
          >
            <Pressable style={styles.pickerModalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.pickerModalHeader}>
                <Text variant="h3">{t('products:period.daily')}</Text>
                <TouchableOpacity onPress={() => setShowDayPicker(false)}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={{ alignItems: 'center' }}>
                <DateTimePicker
                  value={(() => {
                    const now = new Date();
                    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + periodOffset);
                    return d;
                  })()}
                  mode="date"
                  display="inline"
                  themeVariant="light"
                  accentColor={colors.primary}
                  locale={locale}
                  style={{ height: 350 }}
                  onChange={(_, date) => { if (date) goToDay(date); }}
                  maximumDate={new Date()}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Günlük DatePicker (Android) */}
      {Platform.OS === 'android' && showDayPicker && (
        <DateTimePicker
          value={(() => {
            const now = new Date();
            return new Date(now.getFullYear(), now.getMonth(), now.getDate() + periodOffset);
          })()}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowDayPicker(false);
            if (event.type === 'set' && date) goToDay(date);
          }}
          maximumDate={new Date()}
        />
      )}

      {/* FAB Backdrop */}
      {activeTab === 'active' && fabMenuVisible && (
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
      {activeTab === 'active' && fabMenuVisible && (
        <View style={[styles.fabMenuContainer, { bottom: spacing.lg + insets.bottom + 56 + spacing.md }]}>
          {[
            {
              label: t('products:bulk.stockIn'),
              icon: <TrendingUp size={18} color={colors.success} />,
              onPress: () => {
                haptics.light();
                setFabMenuVisible(false);
                router.push('/urunler/toplu-giris' as any);
              },
              index: 1,
            },
            {
              label: t('products:bulk.stockOut'),
              icon: <TrendingDown size={18} color={colors.error} />,
              onPress: () => {
                haptics.light();
                setFabMenuVisible(false);
                router.push('/urunler/toplu-cikis' as any);
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
      {activeTab === 'active' && (
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flatListContent: {
    paddingBottom: spacing['3xl'],
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
  searchSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  tabSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  periodSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  periodNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  periodNavButton: {
    padding: spacing.sm,
  },
  periodLabel: {
    fontWeight: '600',
    minWidth: 120,
    textAlign: 'center',
  },
  customDateRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerModal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  datePickerWrapper: {
    alignItems: 'center',
  },
  listSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  // Picker Modal Styles
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  yearGridCell: {
    width: '23%',
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  yearGridCellActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  yearGridTextActive: {
    color: colors.surface,
    fontWeight: '600',
  },
  yearScrollView: {
    marginBottom: spacing.lg,
  },
  yearScrollContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  yearChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  yearChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  yearChipText: {
    color: colors.text,
  },
  yearChipTextActive: {
    color: colors.surface,
    fontWeight: '600',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  monthCell: {
    width: '31%',
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Warning Styles
  warningSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning + '15',
    borderWidth: 1,
    borderColor: colors.warning + '40',
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  warningText: {
    flex: 1,
    color: colors.text,
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
});
