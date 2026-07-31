import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, Alert, TouchableOpacity, Animated, Pressable, Platform, RefreshControl, ListRenderItemInfo } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import ReAnimated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarScroll, useRegisterScrollToTop } from '@/lib/tabBarScroll';
import { useRouter, Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus, Package, Search, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Calendar, Edit3, Archive, ArchiveRestore, Trash2, ArrowUpDown, AlertTriangle, FileSpreadsheet, BarChart3 } from 'lucide-react-native';
import { Text, EmptyState, TabFilter, ActionSheet, type ActionSheetOption, AddEntityButton, TabHeader, TAB_HEADER_ESTIMATED_HEIGHT, FloatingSearchBar, GlassFab, GlassFabMenuItem, GlassContainer, GlassIconButton, GLASS_MERGE_SPACING, FAB_SIZE, Screen, SkeletonAccountList } from '@/components/ui';
import { ProductRow, ArchivedProductRow } from '@/components/urunlerPage/ProductRow';
import { getListEdgePosition } from '@/components/ui/listEdgeStyles';
import { OzetModeToggle } from '@/components/urunlerPage/OzetModeToggle';
import { ProductPeriodPickers } from '@/components/urunlerPage/ProductPeriodPickers';
import { ProductCategoryFilter, CATEGORY_FILTER_ALL, CATEGORY_FILTER_UNCATEGORIZED } from '@/components/urunlerPage/ProductCategoryFilter';
import { styles } from '@/components/urunlerPage/styles';
import { QuickUrunBar } from '@/components/urun/QuickUrunBar';
import { useHaptics } from '@/hooks/useHaptics';
import { useDateFormat } from '@/hooks/useDateFormat';
import { colors } from '@/constants/colors';
import { spacing, HIT_SLOP } from '@/constants/spacing';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { useUrunler, useArchiveUrun, usePermanentDeleteUrun, countUrunLinkedMovements } from '@/hooks/useUrunler';
import { toErrorMessage } from '@/lib/errors';
import { useArchivedUrunler, useUnarchiveUrun } from '@/hooks/useArchive';
import { useToast } from '@/contexts/ToastContext';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { UndoSnackbar } from '@/components/ui/UndoSnackbar';
import { useDonemUrunOzet, type DonemUrunOzet } from '@/hooks/useUrunHareketler';
import { useKategoriSecimReferanslari } from '@/hooks/useKategoriSecimReferanslari';
import { useTopAnchoredListSnapshot } from '@/hooks/useTopAnchoredListSnapshot';
import { Urun, BirimType } from '@/types/database';
import { formatDateForDB } from '@/lib/date';
import { searchMatchesTr, upperTr } from '@/lib/turkishTextUtils';
import { compareEntityIdentity, compareMetricListItems } from '@/lib/listSorting';
import { permissionAccessSignature } from '@/lib/permissionCacheGuard';
import { exportUrunListesiToExcel, UrunListeItem } from '@/lib/excelExport';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { SharedIsletmeBanner } from '@/components/ui/SharedIsletmeBanner';

type PeriodType = 'yearly' | 'monthly' | 'weekly' | 'daily' | 'custom';
type SortType = 'nameAZ' | 'nameZA' | 'purchaseMost' | 'purchaseLeast' | 'saleMost' | 'saleLeast';
type MetricSortType = Extract<
  SortType,
  'purchaseMost' | 'purchaseLeast' | 'saleMost' | 'saleLeast'
>;

interface ProductPeriodSnapshot {
  ready: boolean;
  summary: DonemUrunOzet;
}

const EMPTY_PRODUCT_PERIOD_SNAPSHOT: ProductPeriodSnapshot = {
  ready: false,
  summary: {},
};

const METRIC_SORT_TYPES = new Set<MetricSortType>([
  'purchaseMost',
  'purchaseLeast',
  'saleMost',
  'saleLeast',
]);

function isMetricSortType(sort: SortType): sort is MetricSortType {
  return METRIC_SORT_TYPES.has(sort as MetricSortType);
}

// Satırlar yapışık; ayrım 1px gri çizgi (cariler listesi dili). Satır sarmalayıcısı
// yatay padding taşıdığından ayraç da aynı hizada başlar.
const UrunListSeparator = () => (
  <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg }} />
);

export default function UrunlerPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const handleTabScroll = useTabBarScroll();
  const listRef = useRef<FlatList>(null);
  useRegisterScrollToTop('urunler', () => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
  const haptics = useHaptics();
  const { t } = useTranslation(['products', 'common', 'errors', 'reports', 'categories']);
  const { getDateRangeLabel, locale } = useDateFormat();
  const [searchQuery, setSearchQuery] = useState('');
  // Arama aktifken (odak veya metin) FAB çekilir — bkz. FloatingSearchBar.onActiveChange
  const [searchActive, setSearchActive] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>(CATEGORY_FILTER_ALL);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quickUrunVisible, setQuickUrunVisible] = useState(false);
  const [selectedUrun, setSelectedUrun] = useState<Urun | null>(null);
  const [fabMenuVisible, setFabMenuVisible] = useState(false);
  const [sortType, setSortType] = useState<SortType>('nameAZ');
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  /** Cam header akıştan çıktığı için yer kaplamıyor → listenin üst boşluğu bu.
   *  Başlangıç değeri çentiği de içerir; onHeightChange ilk layout'ta düzeltir. */
  const initialHeaderH = insets.top + TAB_HEADER_ESTIMATED_HEIGHT;
  /** search: true → FLOATING_SEARCH_CLEARANCE'ı hook'un kendisi ekler. Alt boşluk
   *  tek kaynaktan geliyor; paylaşılan styles.flatListContent'teki sabit değer bu
   *  inline'ın altında kalıp ölü durduğu için oradan kaldırıldı. */
  const contentPaddingBottom = useContentBottomPadding({ search: true });
  const [activeTab] = useState<'active' | 'archived'>('active');
  // Dönem özeti gösterimi: miktar mı tutar mı (per-ürün giriş/çıkış pill'leri)
  const [ozetMode, setOzetMode] = useState<'miktar' | 'tutar'>('miktar');

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
  // Dönem sekmeleri her daim BÜYÜK harf (kullanıcı tercihi)
  const PERIOD_OPTIONS = useMemo(() => [
    { label: upperTr(t('products:period.yearly')), value: 'yearly' },
    { label: upperTr(t('products:period.monthly')), value: 'monthly' },
    { label: upperTr(t('products:period.weekly')), value: 'weekly' },
    { label: upperTr(t('products:period.daily')), value: 'daily' },
    { label: upperTr(t('products:period.custom')), value: 'custom' },
  ], [t]);

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

  const { isletme, user, currentPermissions } = useAuthContext();
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const canCreateProduct = canCreate('urunler');

  // Açık bir yazma yüzeyi varken rol `view` seviyesine düşerse modal/FAB aynı
  // render döngüsünde fail-closed kapanır; eski görünür state yeniden kullanılamaz.
  useEffect(() => {
    if (canCreateProduct) return;
    setQuickUrunVisible(false);
    setSelectedUrun(null);
    setFabMenuVisible(false);
  }, [canCreateProduct]);
  const [isExporting, setIsExporting] = useState(false);
  const {
    data: urunler,
    isLoading,
    refetch: refetchUrunler,
  } = useUrunler();
  const { data: archivedUrunler, refetch: refetchArchived } = useArchivedUrunler();
  const archiveUrun = useArchiveUrun();
  const permanentDeleteUrun = usePermanentDeleteUrun();
  const unarchiveUrun = useUnarchiveUrun();

  // Pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Legacy urunler aktif gelir/gider kategorisine bagli olabildigi icin mevcut
  // etiket/filtre davranisini koru; dar RPC'den tum aktif tipleri iste.
  const { data: kategoriler } = useKategoriSecimReferanslari();
  const { showToast } = useToast();

  // DÃ¶nem bazlÄ± urun hareketleri Ã¶zeti
  const {
    data: donemUrunOzet,
    refetch: refetchDonemUrunOzet,
  } = useDonemUrunOzet({ startDate, endDate });
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchUrunler(),
        refetchArchived(),
        refetchDonemUrunOzet(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchUrunler, refetchArchived, refetchDonemUrunOzet]);
  const livePeriodSnapshot = useMemo<ProductPeriodSnapshot | undefined>(
    () => donemUrunOzet === undefined
      ? undefined
      : { ready: true, summary: donemUrunOzet },
    [donemUrunOzet],
  );
  const periodSnapshotScope = [
    isletme?.id ?? 'no-business',
    user?.id ?? 'no-user',
    permissionAccessSignature(currentPermissions),
    startDate,
    endDate,
  ].join(':');
  const {
    stableAsyncMeta: stablePeriodSnapshot,
    headerHeight: headerH,
    onHeaderHeightChange,
    onScroll: handleSnapshotScroll,
    onScrollBeginDrag: handleScrollBeginDrag,
    onScrollEndDrag: handleScrollEndDrag,
    onMomentumScrollBegin: handleMomentumScrollBegin,
    onMomentumScrollEnd: handleMomentumScrollEnd,
  } = useTopAnchoredListSnapshot({
    asyncMeta: livePeriodSnapshot,
    emptyAsyncMeta: EMPTY_PRODUCT_PERIOD_SNAPSHOT,
    initialHeaderHeight: initialHeaderH,
    scopeKey: periodSnapshotScope,
  });
  const stableDonemUrunOzet = stablePeriodSnapshot.summary;
  const areMetricSortOptionsDisabled =
    !stablePeriodSnapshot.ready || donemUrunOzet === undefined;
  const isMetricSortPending =
    isMetricSortType(sortType)
    && !stablePeriodSnapshot.ready;

  const handleProductListScroll = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    handleTabScroll(event);
    handleSnapshotScroll(event);
  }, [handleSnapshotScroll, handleTabScroll]);

  const scrollListToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  // Kategorisiz Ã¼rÃ¼n sayÄ±sÄ±
  const { pendingDeleteIds, requestDelete, undoDelete, dismissDelete, snackbar: undoSnackbar } = useUndoDelete<Urun>({
    onCommitDelete: (id) => permanentDeleteUrun.mutateAsync(id),
    onError: (error) => {
      haptics.error();
      showToast(
        toErrorMessage(error, t('common:messages.operationFailed')),
        'error',
      );
    },
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

      // Arama filtresi — ad + kod + kategori + açıklama (ürün kartındaki not) birlikte
      if (query) {
        const kategoriAdi = urun.kategori_id ? kategoriMap.get(urun.kategori_id) : '';
        const matches = searchMatchesTr(
          `${urun.ad} ${urun.kod ?? ''} ${kategoriAdi ?? ''} ${urun.aciklama ?? ''}`,
          debouncedSearch
        );
        if (!matches) return false;
      }

      return true;
    }) || [];

    // SÄ±ralama
    return [...filtered].sort((a, b) => {
      const ozetA = stableDonemUrunOzet[a.id];
      const ozetB = stableDonemUrunOzet[b.id];
      switch (sortType) {
        case 'nameAZ':
          return compareEntityIdentity(
            { id: a.id, label: a.ad },
            { id: b.id, label: b.ad },
          );
        case 'nameZA':
          return compareEntityIdentity(
            { id: a.id, label: a.ad },
            { id: b.id, label: b.ad },
            'desc',
          );
        // TUTAR bazlı sıralama (kullanıcı bulgusu: adet bazlıydı — 'en fazla alış'
        // deyince en yüksek TUTARLI beklenir, en çok adetli değil)
        case 'purchaseMost':
          return compareMetricListItems(
            { id: a.id, label: a.ad, metric: ozetA?.girisTutar ?? 0 },
            { id: b.id, label: b.ad, metric: ozetB?.girisTutar ?? 0 },
            'desc',
          );
        case 'purchaseLeast':
          return compareMetricListItems(
            { id: a.id, label: a.ad, metric: ozetA?.girisTutar ?? 0 },
            { id: b.id, label: b.ad, metric: ozetB?.girisTutar ?? 0 },
            'asc',
          );
        case 'saleMost':
          return compareMetricListItems(
            { id: a.id, label: a.ad, metric: ozetA?.cikisTutar ?? 0 },
            { id: b.id, label: b.ad, metric: ozetB?.cikisTutar ?? 0 },
            'desc',
          );
        case 'saleLeast':
          return compareMetricListItems(
            { id: a.id, label: a.ad, metric: ozetA?.cikisTutar ?? 0 },
            { id: b.id, label: b.ad, metric: ozetB?.cikisTutar ?? 0 },
            'asc',
          );
        default:
          return compareEntityIdentity(
            { id: a.id, label: a.ad },
            { id: b.id, label: b.ad },
          );
      }
    });
  }, [urunler, debouncedSearch, categoryFilter, kategoriMap, sortType, stableDonemUrunOzet, pendingDeleteIds, isUrunUncategorized]);

  // ArÅŸivlenmiÅŸ Ã¼rÃ¼nler filtresi (arama)
  const filteredArchivedUrunler = useMemo(() => {
    if (!archivedUrunler) return [];
    if (!debouncedSearch) return archivedUrunler;
    return archivedUrunler.filter((urun) => {
      const kategoriAdi = urun.kategori_id ? kategoriMap.get(urun.kategori_id) : '';
      return searchMatchesTr(
        `${urun.ad} ${urun.kod ?? ''} ${kategoriAdi ?? ''} ${urun.aciklama ?? ''}`,
        debouncedSearch
      );
    });
  }, [archivedUrunler, debouncedSearch, kategoriMap]);

  const archivedCount = archivedUrunler?.length ?? 0;

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
      disabled:
        isMetricSortType(opt.key)
        && areMetricSortOptionsDisabled,
      onPress: () => {
        scrollListToTop();
        setSortType(opt.key);
        haptics.light();
      },
    }));
  }, [sortType, t, haptics, areMetricSortOptionsDisabled, scrollListToTop]);

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

  const handleDelete = useCallback(async () => {
    if (!actionSheetUrun || !isletme) return;
    setActionSheetVisible(false);
    // GUARD (detay sayfasıyla tutarlı): işleme bağlı hareketi olan ürünü OPTIMISTIC
    // silmeden ÖNCE engelle. Eskiden undo-delete guard hatasını yutuyor, kullanıcı
    // "silinmiş" sanıyor, refetch'te ürün geri geliyordu.
    try {
      const linked = await countUrunLinkedMovements(actionSheetUrun.id, isletme.id);
      if (linked > 0) {
        Alert.alert(
          t('common:errors.cannotDeleteTitle'),
          t('common:errors.hasLinkedProductMovements', { count: linked })
        );
        return;
      }
    } catch (error) {
      haptics.error();
      showToast(
        toErrorMessage(error, t('common:messages.operationFailed')),
        'error',
      );
      return;
    }
    requestDelete(actionSheetUrun.id, actionSheetUrun, actionSheetUrun.ad);
  }, [actionSheetUrun, isletme, requestDelete, haptics, showToast, t]);

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
            } catch (error) {
              // Guard mesajını göster (ör. "…bağlı işlemler var, arşivleyin") — generic
              // "işlem başarısız" yerine gerçek nedeni ilet.
              haptics.error();
              showToast(toErrorMessage(error, t('common:messages.operationFailed')), 'error');
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
  }, [actionSheetUrun, t, router, activeTab, handleArchive, handleDelete, handleUnarchive, handlePermanentDelete, canUpdate, canDelete]);

  // HÄ±zlÄ± dÃ¶nem seÃ§imi fonksiyonlarÄ±
  const handlePeriodLabelPress = useCallback(() => {
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
  }, [period, periodOffset]);

  const goToYear = (year: number) => {
    const currentYear = new Date().getFullYear();
    scrollListToTop();
    setPeriodOffset(year - currentYear);
    setShowYearPicker(false);
  };

  const goToMonth = (year: number, month: number) => {
    const now = new Date();
    const monthsDiff = (year - now.getFullYear()) * 12 + (month - now.getMonth());
    scrollListToTop();
    setPeriodOffset(monthsDiff);
    setShowMonthYearPicker(false);
  };

  const goToDay = (date: Date) => {
    const now = new Date();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const daysDiff = Math.round((dateMidnight.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));
    scrollListToTop();
    setPeriodOffset(daysDiff);
    setShowDayPicker(false);
  };

  const goToWeekOfMonth = (year: number, month: number) => {
    const now = new Date();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const firstDayOfMonth = new Date(year, month, 1);
    const daysDiff = Math.round((firstDayOfMonth.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));
    const weeksDiff = Math.round(daysDiff / 7);
    scrollListToTop();
    setPeriodOffset(weeksDiff);
    setShowMonthYearPicker(false);
  };

  const handleCustomStartDateChange = useCallback((date: Date) => {
    scrollListToTop();
    setCustomStartDate(date);
  }, [scrollListToTop]);

  const handleCustomEndDateChange = useCallback((date: Date) => {
    scrollListToTop();
    setCustomEndDate(date);
  }, [scrollListToTop]);

  const getBirimLabel = useCallback((birim: BirimType) => {
    return t(`products:units.${birim}`);
  }, [t]);

  const handleToggle = useCallback((urunId: string) => {
    setExpandedId(prev => prev === urunId ? null : urunId);
  }, []);

  const handleNewTransaction = useCallback((urun: Urun) => {
    if (!canCreateProduct) return;
    setSelectedUrun(urun);
    setQuickUrunVisible(true);
  }, [canCreateProduct]);

  const handleViewMovements = useCallback((urunId: string) => {
    router.push(`/urunler/${urunId}` as Href);
  }, [router]);

  // FlatList renderItem for active products
  const renderActiveItem = useCallback(({ item: urun, index }: ListRenderItemInfo<Urun>) => (
    <ProductRow
      urun={urun}
      expanded={expandedId === urun.id}
      onToggle={handleToggle}
      onNewTransaction={handleNewTransaction}
      canCreateTransaction={canCreateProduct}
      canManage={
        canUpdate('urunler', urun.created_by ?? null) ||
        canDelete('urunler', urun.created_by ?? null)
      }
      onViewMovements={handleViewMovements}
      onOpenActionSheet={handleOpenActionSheet}
      urunOzet={stableDonemUrunOzet[urun.id]}
      kategoriAdi={urun.kategori_id ? kategoriMap.get(urun.kategori_id) : undefined}
      getBirimLabel={getBirimLabel}
      ozetMode={ozetMode}
      listPosition={getListEdgePosition(index, filteredUrunler.length)}
    />
  ), [expandedId, handleToggle, handleNewTransaction, canCreateProduct, canUpdate, canDelete, handleViewMovements, handleOpenActionSheet, stableDonemUrunOzet, kategoriMap, getBirimLabel, ozetMode, filteredUrunler.length]);

  // FlatList renderItem for archived products
  const renderArchivedItem = useCallback(({ item: urun, index }: ListRenderItemInfo<Urun>) => (
    <ArchivedProductRow
      urun={urun}
      expanded={expandedId === urun.id}
      onToggle={handleToggle}
      onViewMovements={handleViewMovements}
      onOpenActionSheet={handleOpenActionSheet}
      canManage={
        canUpdate('urunler', urun.created_by ?? null) ||
        canDelete('urunler', urun.created_by ?? null)
      }
      getBirimLabel={getBirimLabel}
      listPosition={getListEdgePosition(index, filteredArchivedUrunler.length)}
    />
  ), [expandedId, handleToggle, handleViewMovements, handleOpenActionSheet, canUpdate, canDelete, getBirimLabel, filteredArchivedUrunler.length]);

  const keyExtractor = useCallback((item: Urun) => item.id, []);

  // Stabil extraData — her render'da yeni obje literali FlatList'i gereksiz yeniden değerlendirtiyordu
  const listExtraData = useMemo(
    () => ({ expandedId, stableDonemUrunOzet, activeTab, ozetMode }),
    [expandedId, stableDonemUrunOzet, activeTab, ozetMode]
  );

  // List header: search, tabs, period selector
  const listHeaderComponent = useMemo(() => (
    <View>
      <SharedIsletmeBanner />

      {/* Arşiv sekmesi kaldırıldı — arşivlenmiş ürünler Daha → Arşiv sayfasında.
          Bu sayfa yalnızca aktif ürünleri gösterir. */}

      {/* Dönem Seçici + Miktar/Tutar geçişi aynı satırda (bir satır kazanımı):
          gezinme solda, toggle SAĞA dayalı; etiketler BÜYÜK harf */}
      {activeTab === 'active' && (urunler && urunler.length > 0) && (
        <View style={styles.periodSection}>
          <TabFilter
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(value) => {
              scrollListToTop();
              setPeriod(value as PeriodType);
              setPeriodOffset(0);
            }}
          />
          <View style={styles.periodRow}>
            {period === 'custom' ? (
              <View style={styles.customDateRow}>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowStartPicker(true)}
                >
                  <Calendar size={16} color={colors.primary} />
                  <Text variant="caption" numberOfLines={1}>{formatDateForDB(customStartDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowEndPicker(true)}
                >
                  <Calendar size={16} color={colors.primary} />
                  <Text variant="caption" numberOfLines={1}>{formatDateForDB(customEndDate)}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.periodNav}>
                {/* hitSlop: buton 34px, dokunma hedefi eşiği 44px — ortak
                    PeriodNavigator bileşeni de aynı sebeple hitSlop veriyor. */}
                <TouchableOpacity
                  onPress={() => {
                    haptics.light();
                    scrollListToTop();
                    setPeriodOffset(periodOffset - 1);
                  }}
                  style={styles.periodNavButton}
                  hitSlop={HIT_SLOP.sm}
                >
                  <ChevronLeft size={20} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { haptics.light(); handlePeriodLabelPress(); }} style={styles.periodLabelBtn}>
                  <Text variant="body" style={styles.periodLabel} numberOfLines={1}>{upperTr(periodLabel)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    haptics.light();
                    scrollListToTop();
                    setPeriodOffset(periodOffset + 1);
                  }}
                  style={styles.periodNavButton}
                  hitSlop={HIT_SLOP.sm}
                  disabled={periodOffset >= 0}
                >
                  <ChevronRight size={20} color={periodOffset >= 0 ? colors.textMuted : colors.primary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Paylaşılan bileşen: ürün detayındaki geçişin AYNISI (iki kopya ayrışıyordu) */}
            <OzetModeToggle mode={ozetMode} onChange={setOzetMode} onPressFeedback={haptics.light} />
          </View>
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
  ), [t, urunler, activeTab, period, PERIOD_OPTIONS, periodOffset, periodLabel, customStartDate, customEndDate, haptics, uncategorizedProductCount, categoryChips, categoryFilter, isFiltered, filteredUrunler, handleClearFilters, ozetMode, scrollListToTop, handlePeriodLabelPress]);

  // Empty component
  const listEmptyComponent = useMemo(() => {
    // Yükleniyorken iskelet BURADA gösteriliyor (eskiden erken return ile tüm ekran
    // "Yükleniyor…" metnine dönüyordu; başlık, cam butonlar ve arama çubuğu kaybolup
    // veri gelince geri geldiği için sekmeler arası geçişte chrome sıçraması oluyordu).
    // Diğer üç ana sekmenin kalıbı bu: chrome durur, yalnız liste alanı iskelete döner.
    if (isLoading || isMetricSortPending) {
      return (
        <View style={styles.listSection}>
          <SkeletonAccountList count={5} />
        </View>
      );
    }
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
            description={canCreateProduct ? t('products:empty.description') : undefined}
            actionLabel={canCreateProduct ? t('products:addProduct') : undefined}
            onAction={
              canCreateProduct
                ? () => router.push('/urunler/ekle' as Href)
                : undefined
            }
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
  }, [activeTab, t, router, isFiltered, searchQuery, handleClearFilters, isLoading, isMetricSortPending, canCreateProduct]);

  // Active list data
  const listData = activeTab === 'active' ? filteredUrunler : filteredArchivedUrunler;

  return (
    // Screen'e `top` VERİLMİYOR — cam modda üst safe-area boşluğunu TabHeader
    // kendisi taşıyor, Screen de verirse boşluk iki kez sayılır.
    <Screen>
      {/* Cam nav bar: header akıştan çıkıp listenin ÜSTÜNDE yüzüyor, liste onun
          arkasından akıyor. Bu yüzden header listeden SONRA render ediliyor
          (üstte boyansın) ve listenin üst boşluğu ölçülen yüksekliğe eşitleniyor. */}
      <FlatList
        ref={listRef}
        onScroll={handleProductListScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollBegin={handleMomentumScrollBegin}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={16}
        data={isLoading || isMetricSortPending ? [] : listData}
        keyExtractor={keyExtractor}
        renderItem={activeTab === 'active' ? renderActiveItem : renderArchivedItem}
        ItemSeparatorComponent={UrunListSeparator}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={listHeaderComponent}
        ListEmptyComponent={listEmptyComponent}
        contentContainerStyle={[styles.flatListContent, { paddingTop: headerH, paddingBottom: contentPaddingBottom }]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        extraData={listExtraData}
        refreshControl={
          // progressViewOffset: spinner cam header'ın ALTINDA belirsin, arkasında değil.
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} progressViewOffset={headerH} colors={[colors.primary]} tintColor={colors.primary} />
        }
      />

      <TabHeader
        glass
        onHeightChange={onHeaderHeightChange}
        title={t('products:title')}
        right={
          <>
            <GlassIconButton
              onPress={() => {
                haptics.light();
                router.push('/raporlar/alis-satis');
              }}
              accessibilityLabel={t('reports:titles.purchaseSales')}
            >
              <BarChart3 size={18} color={colors.info} />
            </GlassIconButton>
            {/* accessibilityLabel ŞART: buton yalnız ikon taşıyor, metin çocuğu
                olmadığı için ekran okuyucu adlandıramaz. */}
            {(urunler && urunler.length > 0) && (
              <GlassIconButton
                onPress={() => { haptics.light(); handleExportProductList(); }}
                disabled={isExporting}
                accessibilityLabel={t('products:export.productList.shareDialogTitle')}
              >
                <FileSpreadsheet size={18} color={isExporting ? colors.textMuted : colors.success} />
              </GlassIconButton>
            )}
            {(urunler && urunler.length > 0) && (
              <GlassIconButton
                onPress={() => { haptics.light(); setSortSheetVisible(true); }}
                accessibilityLabel={t('products:sort.title')}
              >
                <ArrowUpDown size={18} color={colors.primary} />
              </GlassIconButton>
            )}
            <AddEntityButton />
          </>
        }
      />

      {/* Alta sabit yüzen arama çubuğu (Apple Notes tarzı); aktif sekmede FAB için boşluk bırakır */}
      {((urunler && urunler.length > 0) || archivedCount > 0) && (
        <FloatingSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('products:search.placeholder')}
          rightOffset={activeTab === 'active' && canCreateProduct ? FAB_SIZE + spacing.md : 0}
          onActiveChange={setSearchActive}
        />
      )}

      {/* QuickUrunBar */}
      <QuickUrunBar
        visible={canCreateProduct && quickUrunVisible}
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
        setCustomStartDate={handleCustomStartDateChange}
        customEndDate={customEndDate}
        setCustomEndDate={handleCustomEndDateChange}
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
      {canCreateProduct && activeTab === 'active' && fabMenuVisible && (
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
      {canCreateProduct && activeTab === 'active' && fabMenuVisible && (
        <GlassContainer
          spacing={GLASS_MERGE_SPACING}
          style={[styles.fabMenuContainer, { bottom: spacing.lg + insets.bottom + FAB_SIZE + spacing.md }]}
        >
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
                // OPACITY YOK: içerideki satır cam (GlassFabMenuItem) ve cam
                // yüzeyin atasında alpha<1 malzemeyi çökertiyor — yazı görünür,
                // kapsül kaybolur. Geçiş yalnız transform ile. Bkz. GlassSurface.
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
              <GlassFabMenuItem icon={item.icon} label={item.label} onPress={item.onPress} />
            </Animated.View>
          ))}
        </GlassContainer>
      )}

      {/* FAB Button — arama aktifken de çekilir: pill tam genişliğe açılıp FAB'ın
          altına girer ve kapatma X'ini (44px) tamamen örterdi. Süre X'lerle aynı (150ms). */}
      {canCreateProduct && activeTab === 'active' && !searchActive && (
        <ReAnimated.View
          style={[styles.fab, { bottom: spacing.lg + insets.bottom }]}
          entering={ZoomIn.duration(150)}
          exiting={ZoomOut.duration(150)}
        >
          <GlassFab
            onPress={() => {
              haptics.light();
              setFabMenuVisible(!fabMenuVisible);
            }}
            renderIcon={({ color, size }) => (
              <Animated.View style={{
                transform: [{
                  rotate: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '45deg'],
                  }),
                }],
              }}>
                <Plus size={size} color={color} />
              </Animated.View>
            )}
          />
        </ReAnimated.View>
      )}
      <UndoSnackbar
        visible={undoSnackbar.visible}
        message={undoSnackbar.message}
        onUndo={undoDelete}
        onDismiss={dismissDelete}
      />
    </Screen>
  );
}

// Miktar / Tutar geçiş anahtarı (ürün detay sayfasındaki toggle ile aynı görünüm;
// dönem gezinme satırının sağında konumlanır)
