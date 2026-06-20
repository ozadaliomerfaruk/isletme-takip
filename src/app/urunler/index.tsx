import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, Alert, TouchableOpacity, Animated, Pressable, Platform, RefreshControl, ListRenderItemInfo } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus, Package, Search, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Calendar, Edit3, Archive, ArchiveRestore, Trash2, ArrowUpDown, AlertTriangle, FileSpreadsheet, X } from 'lucide-react-native';
import { Text, Button, Input, EmptyState, TabFilter, ActionSheet, type ActionSheetOption } from '@/components/ui';
import { ProductRow, ArchivedProductRow } from '@/components/urunlerPage/ProductRow';
import { ProductPeriodPickers } from '@/components/urunlerPage/ProductPeriodPickers';
import { ProductCategoryFilter, CATEGORY_FILTER_ALL, CATEGORY_FILTER_UNCATEGORIZED } from '@/components/urunlerPage/ProductCategoryFilter';
import { styles } from '@/components/urunlerPage/styles';
import { QuickUrunBar } from '@/components/urun/QuickUrunBar';
import { useHaptics } from '@/hooks/useHaptics';
import { useDateFormat } from '@/hooks/useDateFormat';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useUrunler, useArchiveUrun, usePermanentDeleteUrun } from '@/hooks/useUrunler';
import { useArchivedUrunler, useUnarchiveUrun } from '@/hooks/useArchive';
import { useToast } from '@/contexts/ToastContext';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { UndoSnackbar } from '@/components/ui/UndoSnackbar';
import { useDonemUrunOzet } from '@/hooks/useUrunHareketler';
import { useKategoriler } from '@/hooks/useKategoriler';
import { Urun, BirimType } from '@/types/database';
import { formatDateForDB } from '@/lib/date';
import { exportUrunListesiToExcel, UrunListeItem } from '@/lib/excelExport';
import { useAuthContext } from '@/contexts/AuthContext';
import { PermissionGate } from '@/components/PermissionGate';
import { usePermissions } from '@/hooks/usePermissions';
import { SharedIsletmeBanner } from '@/components/ui/SharedIsletmeBanner';

type PeriodType = 'yearly' | 'monthly' | 'weekly' | 'daily' | 'custom';
type SortType = 'nameAZ' | 'nameZA' | 'purchaseMost' | 'purchaseLeast' | 'saleMost' | 'saleLeast';

export default function UrunlerPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const { t } = useTranslation(['products', 'common', 'errors', 'reports', 'categories']);
  const { getDateRangeLabel, locale } = useDateFormat();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>(CATEGORY_FILTER_ALL);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quickUrunVisible, setQuickUrunVisible] = useState(false);
  const [selectedUrun, setSelectedUrun] = useState<Urun | null>(null);
  const [fabMenuVisible, setFabMenuVisible] = useState(false);
  const [sortType, setSortType] = useState<SortType>('nameAZ');
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  // ActionSheet iÃ§in state
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetUrun, setActionSheetUrun] = useState<Urun | null>(null);

  // DÃ¶nem seÃ§ici state'leri
  const [period, setPeriod] = useState<PeriodType>('monthly');
  const [periodOffset, setPeriodOffset] = useState(0);

  // Ã–zel tarih aralÄ±ÄŸÄ± state'leri
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // HÄ±zlÄ± dÃ¶nem seÃ§imi iÃ§in state'ler
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // DÃ¶nem seÃ§ici seÃ§enekleri
  const PERIOD_OPTIONS = [
    { label: t('products:period.yearly'), value: 'yearly' },
    { label: t('products:period.monthly'), value: 'monthly' },
    { label: t('products:period.weekly'), value: 'weekly' },
    { label: t('products:period.daily'), value: 'daily' },
    { label: t('products:period.custom'), value: 'custom' },
  ];

  // DÃ¶nem tarih aralÄ±ÄŸÄ±nÄ± hesapla
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

  // Arama debounce: her tuş vuruşunda tüm listeyi yeniden filtrelememek için
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const { isletme } = useAuthContext();
  const { canUpdate, canDelete } = usePermissions();
  const [isExporting, setIsExporting] = useState(false);
  const { data: urunler, isLoading, refetch } = useUrunler();
  const { data: archivedUrunler, refetch: refetchArchived } = useArchivedUrunler();
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

  // DÃ¶nem bazlÄ± urun hareketleri Ã¶zeti
  const { data: donemUrunOzet } = useDonemUrunOzet({ startDate, endDate });

  // Kategorisiz Ã¼rÃ¼n sayÄ±sÄ±
  const { pendingDeleteIds, requestDelete, undoDelete, dismissDelete, snackbar: undoSnackbar } = useUndoDelete<Urun>({
    onCommitDelete: (id) => permanentDeleteUrun.mutateAsync(id),
  });

  // Kategori id -> ad map'i
  const kategoriMap = useMemo(() => new Map(kategoriler?.map(k => [k.id, k.name]) || []), [kategoriler]);

  // "Kategorisiz" = kategori_id null VEYA artık mevcut olmayan (silinmiş/pasif) bir kategoriye
  // işaret ediyor. Silinmiş kategoriye bağlı ürünler de kategorisiz sayılır; aksi halde adı
  // çözülemediği için ayrı ve kafa karıştırıcı bir '?' grubu oluşuyordu.
  const isUrunUncategorized = useCallback(
    (u: Urun) => !u.kategori_id || !kategoriMap.has(u.kategori_id),
    [kategoriMap]
  );

  const uncategorizedProductCount = useMemo(
    () => (urunler || []).filter(isUrunUncategorized).length,
    [urunler, isUrunUncategorized]
  );

  // Üründe fiilen kullanılan (hâlâ mevcut) kategoriler, sayaçlarıyla — filtre çipleri için
  const categoryChips = useMemo(() => {
    const counts = new Map<string, number>();
    (urunler || []).forEach((u) => {
      if (u.kategori_id && kategoriMap.has(u.kategori_id)) {
        counts.set(u.kategori_id, (counts.get(u.kategori_id) || 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .map(([id, count]) => ({ id, name: kategoriMap.get(id)!, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [urunler, kategoriMap]);

  const isFiltered = searchQuery.trim().length > 0 || categoryFilter !== CATEGORY_FILTER_ALL;

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setDebouncedSearch('');
    setCategoryFilter(CATEGORY_FILTER_ALL);
  }, []);

  // Seçili kategori filtresi silinmiş/yok olmuşsa otomatik "Tümü"ye dön
  // (aksi halde liste sessizce boşalır, aktif çip görünmez)
  useEffect(() => {
    if (
      categoryFilter !== CATEGORY_FILTER_ALL &&
      categoryFilter !== CATEGORY_FILTER_UNCATEGORIZED &&
      !kategoriMap.has(categoryFilter)
    ) {
      setCategoryFilter(CATEGORY_FILTER_ALL);
    }
  }, [categoryFilter, kategoriMap]);

  // ÃœrÃ¼n listesi export
  const handleExportProductList = useCallback(async () => {
    if (!urunler || urunler.length === 0 || !isletme) return;
    setIsExporting(true);
    try {
      const items: UrunListeItem[] = urunler.map((u) => ({
        ad: u.ad,
        kod: u.kod,
        kategori: u.kategori_id ? kategoriMap.get(u.kategori_id) || null : null,
        birim: t(`products:units.${u.birim}`),
        miktar: u.miktar,
        alis_fiyati: u.alis_fiyati,
        satis_fiyati: u.satis_fiyati,
        kdv_orani: u.kdv_orani,
        currency: u.currency || 'TRY',
      }));
      await exportUrunListesiToExcel({
        urunler: items,
        translations: {
          title: t('products:export.productList.title'),
          fileName: t('products:export.productList.fileName'),
          isletmeName: isletme.name || '',
          shareDialogTitle: t('products:export.productList.shareDialogTitle'),
          sharingNotSupported: t('products:export.sharingNotSupported'),
          noDataError: t('products:export.productList.noData'),
          columns: {
            name: t('products:export.productList.columns.name'),
            code: t('products:export.productList.columns.code'),
            category: t('products:export.productList.columns.category'),
            unit: t('products:export.productList.columns.unit'),
            stock: t('products:export.productList.columns.stock'),
            purchasePrice: t('products:export.productList.columns.purchasePrice'),
            salePrice: t('products:export.productList.columns.salePrice'),
            vatRate: t('products:export.productList.columns.vatRate'),
          },
        },
      });
    } catch {
      showToast(t('products:export.error'), 'error');
    } finally {
      setIsExporting(false);
    }
  }, [urunler, isletme, kategoriMap, t, showToast]);

  // Arama (Ã¼rÃ¼n adÄ±, kodu ve kategori adÄ±) + kategori filtresi
  const filteredUrunler = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    const filtered = urunler?.filter((urun) => {
      if (pendingDeleteIds.has(urun.id)) return false;

      // Kategori filtresi
      if (categoryFilter === CATEGORY_FILTER_UNCATEGORIZED) {
        if (!isUrunUncategorized(urun)) return false;
      } else if (categoryFilter !== CATEGORY_FILTER_ALL) {
        if (urun.kategori_id !== categoryFilter) return false;
      }

      // Arama filtresi
      if (query) {
        const kategoriAdi = urun.kategori_id ? kategoriMap.get(urun.kategori_id)?.toLowerCase() : '';
        const matches =
          urun.ad.toLowerCase().includes(query) ||
          (urun.kod && urun.kod.toLowerCase().includes(query)) ||
          (kategoriAdi && kategoriAdi.includes(query));
        if (!matches) return false;
      }

      return true;
    }) || [];

    // SÄ±ralama
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
  }, [urunler, debouncedSearch, categoryFilter, kategoriMap, sortType, donemUrunOzet, pendingDeleteIds, isUrunUncategorized]);

  // ArÅŸivlenmiÅŸ Ã¼rÃ¼nler filtresi (arama)
  const filteredArchivedUrunler = useMemo(() => {
    if (!archivedUrunler) return [];
    if (!debouncedSearch) return archivedUrunler;
    const query = debouncedSearch.toLowerCase();
    return archivedUrunler.filter((urun) => {
      const kategoriAdi = urun.kategori_id ? kategoriMap.get(urun.kategori_id)?.toLowerCase() : '';
      return (
        urun.ad.toLowerCase().includes(query) ||
        (urun.kod && urun.kod.toLowerCase().includes(query)) ||
        (kategoriAdi && kategoriAdi.includes(query))
      );
    });
  }, [archivedUrunler, debouncedSearch, kategoriMap]);

  const archivedCount = archivedUrunler?.length ?? 0;

  // Tab seÃ§enekleri
  const TAB_OPTIONS = useMemo(() => [
    { label: t('products:tabs.active'), value: 'active' },
    { label: archivedCount > 0 ? `${t('products:tabs.archived')} (${archivedCount})` : t('products:tabs.archived'), value: 'archived' },
  ], [t, archivedCount]);

  // SÄ±ralama seÃ§enekleri
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
    setActionSheetVisible(false);
    requestDelete(actionSheetUrun.id, actionSheetUrun, actionSheetUrun.ad);
  }, [actionSheetUrun, requestDelete]);

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
      // ArÅŸiv modunda: ArÅŸivden Ã§Ä±kar + KalÄ±cÄ± sil
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

    // Aktif modunda: DÃ¼zenle + ArÅŸivle + Sil
    const options: ActionSheetOption[] = [];

    if (actionSheetUrun && canUpdate('urunler', actionSheetUrun.created_by ?? null)) {
      options.push({
        label: t('common:buttons.edit'),
        icon: <Edit3 size={20} color={colors.primary} />,
        onPress: () => {
          if (actionSheetUrun) {
            router.push(`/urunler/duzenle/${actionSheetUrun.id}` as Href);
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

  // HÄ±zlÄ± dÃ¶nem seÃ§imi fonksiyonlarÄ±
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
    router.push(`/urunler/${urunId}` as Href);
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

  // List header: search, tabs, period selector
  const listHeaderComponent = useMemo(() => (
    <View>
      <SharedIsletmeBanner />
      {/* Header */}
      <View style={styles.header}>
        <Text variant="h2">{t('products:title')}</Text>
        <View style={styles.headerButtons}>
          {(urunler && urunler.length > 0) && (
            <TouchableOpacity
              style={styles.sortButton}
              onPress={() => {
                haptics.light();
                handleExportProductList();
              }}
              activeOpacity={0.7}
              disabled={isExporting}
            >
              <FileSpreadsheet size={18} color={isExporting ? colors.textMuted : colors.success} />
            </TouchableOpacity>
          )}
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
              onPress={() => router.push('/urunler/ekle' as Href)}
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
            rightIcon={searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ) : undefined}
          />
        </View>
      )}

      {/* Aktif / ArÅŸiv Tab */}
      {archivedCount > 0 && (
        <View style={styles.tabSection}>
          <TabFilter
            options={TAB_OPTIONS}
            value={activeTab}
            onChange={(v) => setActiveTab(v as 'active' | 'archived')}
          />
        </View>
      )}

      {/* DÃ¶nem SeÃ§ici */}
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

      {/* Kategori filtresi */}
      {activeTab === 'active' && (urunler && urunler.length > 0) && (
        <ProductCategoryFilter
          chips={categoryChips}
          totalCount={urunler.length}
          uncategorizedCount={uncategorizedProductCount}
          value={categoryFilter}
          onChange={setCategoryFilter}
          isFiltered={isFiltered}
          resultCount={filteredUrunler.length}
          onClearFilters={handleClearFilters}
        />
      )}

      {/* Kategorisiz Ã¼rÃ¼n uyarÄ±sÄ± (tÄ±klanÄ±nca o Ã¼rÃ¼nleri filtreler) */}
      {activeTab === 'active' && uncategorizedProductCount > 0 && (
        <View style={styles.warningSection}>
          <TouchableOpacity
            style={styles.warningBanner}
            activeOpacity={0.7}
            onPress={() => {
              haptics.light();
              setCategoryFilter(CATEGORY_FILTER_UNCATEGORIZED);
            }}
          >
            <AlertTriangle size={16} color={colors.warning} />
            <Text variant="caption" style={styles.warningText}>
              {t('categories:warnings.uncategorizedProducts', { count: uncategorizedProductCount })}
            </Text>
            <ChevronRight size={16} color={colors.warning} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  ), [t, urunler, archivedCount, searchQuery, activeTab, TAB_OPTIONS, period, PERIOD_OPTIONS, periodOffset, periodLabel, customStartDate, customEndDate, haptics, router, uncategorizedProductCount, categoryChips, categoryFilter, isFiltered, filteredUrunler, handleClearFilters, isExporting]);

  // Empty component
  const listEmptyComponent = useMemo(() => {
    if (activeTab === 'active') {
      // Arama/kategori filtresi aktifken boÅŸ â†’ "sonuÃ§ yok"; aksi halde "Ã¼rÃ¼n yok".
      // (urunler.length yerine isFiltered: undo penceresinde tÃ¼m Ã¼rÃ¼nler silinince
      //  yanlÄ±ÅŸ "filtreyi deÄŸiÅŸtir" mesajÄ± gÃ¶sterilmesin)
      if (isFiltered) {
        return (
          <View style={styles.listSection}>
            <EmptyState
              icon={<Search size={48} color={colors.textMuted} />}
              title={t('products:empty.noResultsTitle')}
              description={t('products:empty.noResultsDescription')}
              actionLabel={t('products:filter.clear')}
              onAction={handleClearFilters}
            />
          </View>
        );
      }
      return (
        <View style={styles.listSection}>
          <EmptyState
            icon={<Package size={48} color={colors.textMuted} />}
            title={t('products:empty.title')}
            description={t('products:empty.description')}
            actionLabel={t('products:addProduct')}
            onAction={() => router.push('/urunler/ekle' as Href)}
          />
        </View>
      );
    }
    // ArÅŸiv: arama aktifken boÅŸ â†’ "sonuÃ§ yok"
    if (searchQuery.trim().length > 0) {
      return (
        <View style={styles.listSection}>
          <EmptyState
            icon={<Search size={48} color={colors.textMuted} />}
            title={t('products:empty.noResultsTitle')}
            description={t('products:empty.noResultsDescription')}
            actionLabel={t('products:filter.clear')}
            onAction={handleClearFilters}
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
  }, [activeTab, t, router, isFiltered, searchQuery, handleClearFilters]);

  // Active list data
  const listData = activeTab === 'active' ? filteredUrunler : filteredArchivedUrunler;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text color="secondary">{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

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
        extraData={{ expandedId, donemUrunOzet, activeTab }}
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

      <ProductPeriodPickers
        period={period}
        periodOffset={periodOffset}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        showYearPicker={showYearPicker}
        setShowYearPicker={setShowYearPicker}
        showMonthYearPicker={showMonthYearPicker}
        setShowMonthYearPicker={setShowMonthYearPicker}
        showDayPicker={showDayPicker}
        setShowDayPicker={setShowDayPicker}
        showStartPicker={showStartPicker}
        setShowStartPicker={setShowStartPicker}
        showEndPicker={showEndPicker}
        setShowEndPicker={setShowEndPicker}
        customStartDate={customStartDate}
        setCustomStartDate={setCustomStartDate}
        customEndDate={customEndDate}
        setCustomEndDate={setCustomEndDate}
        goToYear={goToYear}
        goToMonth={goToMonth}
        goToDay={goToDay}
        goToWeekOfMonth={goToWeekOfMonth}
        locale={locale}
        t={{
          selectYear: t('reports:period.selectYear'),
          selectMonthYear: t('reports:period.selectMonthYear'),
          daily: t('products:period.daily'),
          startDate: t('products:period.startDate'),
          endDate: t('products:period.endDate'),
          ok: t('common:buttons.ok'),
          monthsShort: (() => { const m = t('common:date.monthsShort', { returnObjects: true }); return Array.isArray(m) ? m : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; })() as string[],
        }}
      />

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
                router.push('/urunler/toplu-giris' as Href);
              },
              index: 1,
            },
            {
              label: t('products:bulk.stockOut'),
              icon: <TrendingDown size={18} color={colors.error} />,
              onPress: () => {
                haptics.light();
                setFabMenuVisible(false);
                router.push('/urunler/toplu-cikis' as Href);
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
      <UndoSnackbar
        visible={undoSnackbar.visible}
        message={undoSnackbar.message}
        onUndo={undoDelete}
        onDismiss={dismissDelete}
      />
    </SafeAreaView>
  );
}
