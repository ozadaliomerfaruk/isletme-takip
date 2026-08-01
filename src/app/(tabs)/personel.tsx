import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Animated,
  Alert,
  RefreshControl,
  Pressable,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import ReAnimated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarScroll, useRegisterScrollToTop } from '@/lib/tabBarScroll';
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
  MoreVertical,
  Zap,
  History,
  CalendarDays,
  FileSpreadsheet,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, FloatingSearchBar, Button, EmptyState, Card, ActionSheet, type ActionSheetOption, SkeletonAccountList, Avatar, AnimatedListItem, ExpandableCard, AddEntityButton, TabHeader, TAB_HEADER_ESTIMATED_HEIGHT, GlassFab, GlassFabMenuItem, GlassContainer, GlassIconButton, GLASS_MERGE_SPACING, FAB_SIZE, Screen } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useHaptics } from '@/hooks/useHaptics';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { searchMatchesTr } from '@/lib/turkishTextUtils';
import { compareBalanceListItems } from '@/lib/listSorting';
import { useSettings } from '@/hooks/useSettings';
import {
  useExchangeRates,
  formatConvertedHint,
  createConversionSum,
} from '@/hooks/useExchangeRates';
import { usePersonelList, useDeletePersonel } from '@/hooks/usePersonel';
import { useNotlar } from '@/hooks/useNotlar';
import {
  usePersonelLeaveQuotas,
  type LeaveQuotaMap,
} from '@/hooks/usePersonelLeaveQuotas';
import { useArchivePersonel } from '@/hooks/useArchive';
import type { Personel } from '@/types/database';
import { SharedIsletmeBanner } from '@/components/ui/SharedIsletmeBanner';
import { usePermissions } from '@/hooks/usePermissions';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { toErrorMessage, isLinkedRecordsError } from '@/lib/errors';
import { useAuthContext } from '@/contexts/AuthContext';
import { exportEntityListToExcel, type EntityListCell, type EntityListSummaryLine, type EntityListExportOptions } from '@/lib/excelExport';
import { exportEntityListToPdf } from '@/lib/entityListPdf';
import { ShareOptionsSheet, ListPdfPreviewSheet } from '@/components/export';
import { useTopAnchoredListSnapshot } from '@/hooks/useTopAnchoredListSnapshot';
import { permissionAccessSignature } from '@/lib/permissionCacheGuard';
import { getListEdgePosition, getListEdgeStyle } from '@/components/ui/listEdgeStyles';
import {
  createPerformanceTraceId,
  rememberEntityNavigationPerformanceTrace,
} from '@/lib/performanceTrace';

// Satırlar birbirine yapışık; aralarında yalnız 1px gri ayraç (cariler listesi dili)
const PersonelListSeparator = () => <View style={styles.separator} />;
const EMPTY_LEAVE_QUOTA_MAP: LeaveQuotaMap = {};

export default function PersonelPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  /** search: true → FLOATING_SEARCH_CLEARANCE'ı hook'un kendisi ekler; alt boşluk
   *  hem cam tab bar'ı hem yüzen arama pill'ini TEK kaynaktan temizler. */
  const contentPaddingBottom = useContentBottomPadding({ search: true });
  const handleTabScroll = useTabBarScroll();
  const listRef = useRef<FlatList>(null);
  useRegisterScrollToTop('personel', () => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
  const { t } = useTranslation(['staff', 'common', 'navigation']);
  const [searchQuery, setSearchQuery] = useState('');
  // Arama aktifken (odak veya metin) FAB çekilir — bkz. FloatingSearchBar.onActiveChange
  const [searchActive, setSearchActive] = useState(false);
  // A2: input anlık searchQuery'ye bağlı; filtre/sıralama debouncedSearch + useMemo ile.
  const debouncedSearch = useDebouncedValue(searchQuery, 250);
  const [sortBy, setSortBy] = useState<'name' | 'balanceHigh' | 'balanceLow'>('name');
  const [quickBarVisible, setQuickBarVisible] = useState(false);
  const [selectedPersonelId, setSelectedPersonelId] = useState<string | null>(null);
  const [fabMenuVisible, setFabMenuVisible] = useState(false);

  // ExpandableCard için state
  const [expandedPersonelId, setExpandedPersonelId] = useState<string | null>(null);

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
  const {
    isletme,
    user,
    currentPermissions,
  } = useAuthContext();
  const listGeometryScopeKey = [
    isletme?.id ?? 'no-business',
    user?.id ?? 'no-user',
    permissionAccessSignature(currentPermissions),
  ].join(':');

  // Gerçek veriler - pasif personeli de dahil et
  const { data: personelList, isLoading, refetch } = usePersonelList(true);
  const { data: summaryPersonel } = usePersonelList();
  const leaveQuotaQuery = usePersonelLeaveQuotas();
  const { refetch: refetchLeaveQuotas } = leaveQuotaQuery;
  const readyLeaveQuotas =
    leaveQuotaQuery.isError || leaveQuotaQuery.isRefetchError
      ? EMPTY_LEAVE_QUOTA_MAP
      : leaveQuotaQuery.dataUpdatedAt === 0
        ? undefined
        : leaveQuotaQuery.data;
  const {
    stableAsyncMeta: leaveQuotas,
    headerHeight: headerH,
    onHeaderHeightChange: handleHeaderHeightChange,
    onScroll: handleGeometryScroll,
    onScrollBeginDrag: handleListScrollBeginDrag,
    onScrollEndDrag: handleListScrollEndDrag,
    onMomentumScrollBegin: handleListMomentumScrollBegin,
    onMomentumScrollEnd: handleListMomentumScrollEnd,
  } = useTopAnchoredListSnapshot({
    asyncMeta: readyLeaveQuotas,
    emptyAsyncMeta: EMPTY_LEAVE_QUOTA_MAP,
    initialHeaderHeight: insets.top + TAB_HEADER_ESTIMATED_HEIGHT,
    scopeKey: listGeometryScopeKey,
  });
  const handleListScroll = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    handleTabScroll(event);
    handleGeometryScroll(event);
  }, [handleGeometryScroll, handleTabScroll]);

  // Pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetch(), refetchLeaveQuotas()]);
      haptics.success();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch, refetchLeaveQuotas, haptics]);

  // ActionSheet için state
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetPersonel, setActionSheetPersonel] = useState<Personel | null>(null);

  // Mutations
  const archivePersonel = useArchivePersonel();
  const deletePersonel = useDeletePersonel();

  // Permissions
  const {
    canCreate,
    canUpdate,
    canDelete,
    canCreateTransactionType,
    canCreatePersonelMinimalTransactions,
  } = usePermissions();
  const canCreatePersonnel = canCreate('personel');
  const canCreatePersonelTransactions =
    canCreateTransactionType('personel_gider');
  const canCreatePersonelPayments =
    canCreateTransactionType('personel_odeme');
  const canSelectPersonel = useCallback(
    (personel: Pick<Personel, 'created_by'>): boolean =>
      canUpdate('personel', personel.created_by ?? null)
      || canDelete('personel', personel.created_by ?? null),
    [canDelete, canUpdate],
  );

  useEffect(() => {
    if (canCreatePersonelTransactions) return;
    setQuickBarVisible(false);
    setSelectedPersonelId(null);
    setFabMenuVisible(false);
  }, [canCreatePersonelTransactions]);

  // Settings ve döviz kurları
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;
  const personelSummary = useMemo(() => {
    const payableSum = createConversionSum(baseCurrency, exchangeRates);
    const receivableSum = createConversionSum(baseCurrency, exchangeRates);

    for (const personel of summaryPersonel ?? []) {
      const balance = toNumber(personel.balance);
      if (balance > 0) {
        receivableSum.add(balance, personel.currency || baseCurrency);
      } else if (balance < 0) {
        payableSum.add(Math.abs(balance), personel.currency || baseCurrency);
      }
    }

    return {
      payables: payableSum.total,
      receivables: receivableSum.total,
    };
  }, [summaryPersonel, baseCurrency, exchangeRates]);

  // Sort ActionSheet
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const sortSheetOptions: ActionSheetOption[] = [
    { label: t('common:sort.balanceHighLow'), icon: <ArrowUpDown size={20} color={sortBy === 'balanceHigh' ? colors.primary : colors.text} />, onPress: () => setSortBy('balanceHigh') },
    { label: t('common:sort.balanceLowHigh'), icon: <ArrowUpDown size={20} color={sortBy === 'balanceLow' ? colors.primary : colors.text} />, onPress: () => setSortBy('balanceLow') },
    { label: t('common:sort.nameAZ'), icon: <ArrowUpDown size={20} color={sortBy === 'name' ? colors.primary : colors.text} />, onPress: () => setSortBy('name') },
  ];

  // Action sheet handlers
  const handleOpenActionSheet = useCallback((personel: Personel) => {
    setActionSheetPersonel(personel);
    setActionSheetVisible(true);
  }, []);

  const handleArchive = useCallback(async () => {
    if (!actionSheetPersonel) return;
    if (!canUpdate('personel', actionSheetPersonel.created_by ?? null)) {
      haptics.error();
      showToast(t('common:errors.permissionDenied'), 'error');
      return;
    }
    try {
      await archivePersonel.mutateAsync(actionSheetPersonel.id);
      haptics.success();
      showToast(t('common:archive.messages.archiveSuccess'), 'success');
    } catch (error) {
      haptics.error();
      showToast(t('common:messages.operationFailed'), 'error');
    }
  }, [actionSheetPersonel, archivePersonel, canUpdate, haptics, showToast, t]);

  const handleDelete = useCallback(() => {
    if (!actionSheetPersonel) return;
    if (!canDelete('personel', actionSheetPersonel.created_by ?? null)) {
      haptics.error();
      showToast(t('common:errors.permissionDenied'), 'error');
      return;
    }
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
            if (!canDelete('personel', actionSheetPersonel.created_by ?? null)) {
              haptics.error();
              showToast(t('common:errors.permissionDenied'), 'error');
              return;
            }
            try {
              await deletePersonel.mutateAsync(actionSheetPersonel.id);
              haptics.success();
              showToast(t('common:messages.deletedSuccessfully'), 'success');
            } catch (error) {
              haptics.error();
              if (isLinkedRecordsError(error)) {
                Alert.alert(t('common:errors.cannotDeleteTitle'), toErrorMessage(error));
              } else {
                showToast(t('common:messages.operationFailed'), 'error');
              }
            }
          },
        },
      ]
    );
  }, [actionSheetPersonel, canDelete, deletePersonel, haptics, showToast, t]);

  // Multi-select handlers
  const handleEnterSelectMode = useCallback(() => {
    if (actionSheetPersonel && canSelectPersonel(actionSheetPersonel)) {
      setExpandedPersonelId(null); // Collapse expanded card to prevent layout jump
      setIsSelectMode(true);
      setSelectedIds(new Set([actionSheetPersonel.id]));
    }
  }, [actionSheetPersonel, canSelectPersonel]);

  const toggleSelection = useCallback((id: string) => {
    const personel = (personelList ?? []).find((item) => item.id === id);
    if (!personel || !canSelectPersonel(personel)) {
      showToast(t('common:errors.permissionDenied'), 'error');
      return;
    }
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
  }, [canSelectPersonel, haptics, personelList, showToast, t]);

  const handleSelectAll = () => {
    if (filteredPersonel) {
      setSelectedIds(new Set(
        filteredPersonel
          .filter(canSelectPersonel)
          .map((personel) => personel.id),
      ));
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
            const selectedRecords = (personelList ?? []).filter(
              (personel) => selectedIds.has(personel.id),
            );
            if (
              selectedRecords.length !== selectedIds.size
              || !selectedRecords.every((personel) =>
                canDelete('personel', personel.created_by ?? null))
            ) {
              haptics.error();
              showToast(t('common:errors.permissionDenied'), 'error');
              return;
            }
            try {
              for (const personel of selectedRecords) {
                await deletePersonel.mutateAsync(personel.id);
              }
              haptics.success();
              showToast(t('common:bulkSelect.deleteSuccess', { count }), 'success');
              handleCancelSelectMode();
            } catch (error) {
              haptics.error();
              if (isLinkedRecordsError(error)) {
                Alert.alert(t('common:errors.cannotDeleteTitle'), toErrorMessage(error));
              } else {
                showToast(t('common:messages.operationFailed'), 'error');
              }
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
            const selectedRecords = (personelList ?? []).filter(
              (personel) => selectedIds.has(personel.id),
            );
            if (
              selectedRecords.length !== selectedIds.size
              || !selectedRecords.every((personel) =>
                canUpdate('personel', personel.created_by ?? null))
            ) {
              haptics.error();
              showToast(t('common:errors.permissionDenied'), 'error');
              return;
            }
            try {
              for (const personel of selectedRecords) {
                await archivePersonel.mutateAsync(personel.id);
              }
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

  const actionSheetOptions: ActionSheetOption[] = useMemo(() => {
    const options: ActionSheetOption[] = [];
    if (actionSheetPersonel && canSelectPersonel(actionSheetPersonel)) {
      options.push({
        label: t('common:bulkSelect.select'),
        icon: <CheckSquare size={20} color={colors.info} />,
        onPress: handleEnterSelectMode,
      });
    }

    if (actionSheetPersonel && canUpdate('personel', actionSheetPersonel.created_by ?? null)) {
      options.push({
        label: t('common:buttons.edit'),
        icon: <Edit3 size={20} color={colors.primary} />,
        onPress: () => {
          if (actionSheetPersonel) {
            router.push(`/personel/duzenle/${actionSheetPersonel.id}`);
          }
        },
      });
      options.push({
        label: t('common:archive.actions.archive'),
        icon: <Archive size={20} color={colors.warning} />,
        onPress: handleArchive,
      });
    }

    if (actionSheetPersonel && canDelete('personel', actionSheetPersonel.created_by ?? null)) {
      options.push({
        label: t('common:buttons.delete'),
        icon: <Trash2 size={20} color={colors.error} />,
        onPress: handleDelete,
        destructive: true,
      });
    }

    return options;
  }, [actionSheetPersonel, t, handleEnterSelectMode, handleArchive, handleDelete, canUpdate, canDelete, canSelectPersonel, router]);

  // Arama iki not kaynağını da tarar: (1) personelin kendi `notes` kolonu (satırda
  // gösterilen, cariler dili) ve (2) Notlar modülünden personele iliştirilen notlar.
  // İkincisi tek sorguda çekilip personel_id → içerik haritasına indirgenir.
  const { data: personelNotlar } = useNotlar('personel');
  const personelNotMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const n of personelNotlar ?? []) {
      if (!n.entity_id) continue;
      map[n.entity_id] = map[n.entity_id] ? `${map[n.entity_id]} ${n.content}` : n.content;
    }
    return map;
  }, [personelNotlar]);

  // Arama ve sıralama (aktif önce). A2: useMemo + debouncedSearch → her tuşta değil, arama
  // durunca (veya liste/sıralama değişince) filter+sort tekrar çalışır.
  const filteredPersonel = useMemo(() => (personelList ?? [])
    .filter((p) =>
      searchMatchesTr(`${p.first_name} ${p.last_name ?? ''} ${p.notes ?? ''} ${personelNotMap[p.id] ?? ''}`, debouncedSearch)
    )
    .sort((a, b) => {
      // Aktif olanlar önce
      if (a.is_active !== b.is_active) {
        return a.is_active ? -1 : 1;
      }
      return compareBalanceListItems(
        {
          id: a.id,
          label: `${a.first_name} ${a.last_name ?? ''}`.trim(),
          balance: toNumber(a.balance),
        },
        {
          id: b.id,
          label: `${b.first_name} ${b.last_name ?? ''}`.trim(),
          balance: toNumber(b.balance),
        },
        sortBy,
      );
    }),
  [personelList, debouncedSearch, sortBy, personelNotMap]);

  // Ana sayfa "anlık liste" dışa aktarımı (cariler ile aynı zengin başlık/özet formatı; Excel + PDF)
  const [isExporting, setIsExporting] = useState(false);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);

  const buildStaffListOptions = useCallback((): EntityListExportOptions | null => {
    if (!filteredPersonel || filteredPersonel.length === 0 || !isletme) return null;

    // Yön konvansiyonu (cariler ile aynı): pozitif bakiye = alacağımız, negatif = borcumuz.
    const rows: EntityListCell[][] = filteredPersonel.map((p) => {
      const bal = toNumber(p.balance);
      const cur = p.currency || 'TRY';
      const durum = bal === 0
        ? t('staff:balance.noBalance')
        : bal > 0 ? t('staff:balance.theyOwe') : t('staff:balance.weOwe');
      return [
        `${p.first_name} ${p.last_name ?? ''}`.trim(),
        p.phone || '',
        { amount: bal !== 0 ? Math.abs(bal) : null, currency: cur },
        durum,
      ];
    });

    // Para birimi bazlı özet: toplam alacak / toplam borç
    const byCur: Record<string, { recv: number; pay: number }> = {};
    filteredPersonel.forEach((p) => {
      const bal = toNumber(p.balance);
      const cur = p.currency || 'TRY';
      if (!byCur[cur]) byCur[cur] = { recv: 0, pay: 0 };
      if (bal > 0) byCur[cur].recv += bal;
      else if (bal < 0) byCur[cur].pay += -bal;
    });
    const summary: EntityListSummaryLine[] = [];
    Object.entries(byCur).forEach(([cur, v]) => {
      if (v.recv > 0) summary.push({ label: `${t('staff:balance.theyOwe')} (${cur})`, amount: v.recv, currency: cur });
      if (v.pay > 0) summary.push({ label: `${t('staff:balance.weOwe')} (${cur})`, amount: v.pay, currency: cur });
    });

    const filterText = debouncedSearch.trim()
      ? `${t('common:export.listExport.search')}: ${debouncedSearch.trim()}`
      : undefined;

    const dateStr = new Date().toISOString().slice(0, 10);
    return {
      title: t('staff:export.staffList.title'),
      isletmeName: isletme.name || '',
      fileName: `${t('staff:export.staffList.fileName')}-${dateStr}`,
      shareDialogTitle: t('staff:export.staffList.shareDialogTitle'),
      sharingNotSupported: t('staff:export.sharingNotSupported'),
      noDataError: t('staff:export.staffList.noData'),
      columns: [
        { header: t('staff:export.staffList.columns.name'), width: 30 },
        { header: t('staff:export.staffList.columns.phone'), width: 16 },
        { header: t('staff:export.staffList.columns.balance'), width: 18, align: 'right' },
        { header: t('staff:export.staffList.columns.status'), width: 22 },
      ],
      rows,
      summary,
      filterText,
      labels: {
        business: t('common:export.excel.business'),
        createdAt: t('common:export.excel.createdAt'),
        recordCount: t('common:export.listExport.recordCount'),
        filter: t('common:export.listExport.filter'),
        summary: t('common:export.listExport.summary'),
        snapshotNote: t('common:export.listExport.snapshotNote'),
        generatedByApp: t('common:export.listExport.generatedByApp'),
      },
    };
  }, [filteredPersonel, isletme, debouncedSearch, t]);

  // PDF: önce önizleme aç. Excel: doğrudan üret.
  const [pdfPreview, setPdfPreview] = useState<EntityListExportOptions | null>(null);

  const handleExcelExport = useCallback(async () => {
    const opts = buildStaffListOptions();
    if (!opts) return;
    setIsExporting(true);
    try {
      await exportEntityListToExcel(opts);
    } catch {
      showToast(t('staff:export.error'), 'error');
    } finally {
      setIsExporting(false);
    }
  }, [buildStaffListOptions, showToast, t]);

  const openPdfPreview = useCallback(() => {
    const opts = buildStaffListOptions();
    if (opts) setPdfPreview(opts);
  }, [buildStaffListOptions]);

  const handleSharePreviewPdf = useCallback(async () => {
    if (!pdfPreview) return;
    setIsExporting(true);
    try {
      await exportEntityListToPdf(pdfPreview);
      setPdfPreview(null);
    } catch {
      showToast(t('staff:export.error'), 'error');
    } finally {
      setIsExporting(false);
    }
  }, [pdfPreview, showToast, t]);

  // #11: "Tümünü seç" durumunu sayı eşitliği yerine ÜYELİK ile belirle + filtre/arama
  // değişince bayat seçimleri buda (yanlış etiket / hayalet seçim önlenir).
  const visiblePersonelIds = useMemo(
    () => filteredPersonel
      .filter(canSelectPersonel)
      .map((personel) => personel.id),
    [canSelectPersonel, filteredPersonel]
  );
  const selectedPersonelRecords = useMemo(
    () => (personelList ?? []).filter((personel) =>
      selectedIds.has(personel.id)),
    [personelList, selectedIds],
  );
  const canBulkArchiveSelected = selectedIds.size > 0
    && selectedPersonelRecords.length === selectedIds.size
    && selectedPersonelRecords.every((personel) =>
      canUpdate('personel', personel.created_by ?? null));
  const canBulkDeleteSelected = selectedIds.size > 0
    && selectedPersonelRecords.length === selectedIds.size
    && selectedPersonelRecords.every((personel) =>
      canDelete('personel', personel.created_by ?? null));
  const allVisibleSelected = visiblePersonelIds.length > 0
    && visiblePersonelIds.every((id) => selectedIds.has(id));

  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visible = new Set(visiblePersonelIds);
    let changed = false;
    selectedIds.forEach((id) => { if (!visible.has(id)) changed = true; });
    if (changed) {
      setSelectedIds((prev) => {
        const next = new Set<string>();
        prev.forEach((id) => { if (visible.has(id)) next.add(id); });
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePersonelIds]);

  // Helper fonksiyonlar - useCallback ile memoize edildi (renderPersonelItem dependency)
  const getBalanceLabel = useCallback((balance: number): string => {
    if (balance === 0) return t('staff:balance.noBalance');
    if (balance < 0) return t('staff:balance.weOwe');
    return t('staff:balance.theyOwe');
  }, [t]);

  const getBalanceColor = useCallback((balance: number): 'secondary' | 'error' | 'success' => {
    if (balance === 0) return 'secondary';
    if (balance < 0) return 'error';
    return 'success';
  }, []);


  // FlatList renderItem fonksiyonu - performans için useCallback ile memoize edildi
  const handleOpenPersonelDetail = useCallback((personelId: string) => {
    const startedAt = Date.now();
    rememberEntityNavigationPerformanceTrace(
      'personel',
      personelId,
      createPerformanceTraceId('personel-navigation', startedAt),
      startedAt,
    );
    router.push(`/personel/${personelId}`);
  }, [router]);

  const renderPersonelItem = useCallback(({ item: personel, index }: { item: Personel; index: number }) => {
    const isSelected = selectedIds.has(personel.id);
    const edgeStyle = getListEdgeStyle(
      getListEdgePosition(index, filteredPersonel.length),
    );
    const lq = leaveQuotas?.[personel.id];
    const hasLeave = !!lq && (lq.hakEdilen > 0 || lq.kullanilan > 0);
    const hasMeta = !!personel.position || !!personel.phone || hasLeave;
    return (
      <AnimatedListItem index={index}>
      <View style={[edgeStyle, !personel.is_active && styles.passiveItem, isSelectMode && isSelected && styles.selectedItem]}>
        {isSelectMode && canSelectPersonel(personel) ? (
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
              <Avatar name={`${personel.first_name} ${personel.last_name ?? ''}`} size={40} />
              <View style={styles.personelInfo}>
                <View style={styles.personelNameRow}>
                  <Text style={styles.personelName}>
                    {personel.first_name} {personel.last_name ?? ''}
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
          <ExpandableCard
            style={styles.flatCard}
            showChevron={false}
            expanded={expandedPersonelId === personel.id}
            onToggle={() => setExpandedPersonelId(expandedPersonelId === personel.id ? null : personel.id)}
            header={
              <View style={styles.personelHeaderWrap}>
              <View style={styles.personelHeader}>
                <Avatar name={`${personel.first_name} ${personel.last_name ?? ''}`} size={40} />
                <View style={styles.personelInfo}>
                  <View style={styles.personelNameRow}>
                    <Text style={styles.personelName}>
                      {personel.first_name} {personel.last_name ?? ''}
                    </Text>
                    {!personel.is_active && (
                      <EyeOff size={14} color={colors.textMuted} />
                    )}
                  </View>
                  {/* Personel notu — isim altında, en fazla iki satır (cariler dili) */}
                  {personel.notes ? (
                    <Text style={styles.personelNote} numberOfLines={2}>
                      {personel.notes}
                    </Text>
                  ) : null}
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
                  {/* Kuru yoksa satır HİÇ çizilmez (eski `?? 0` → "~₺0,00") */}
                  {toNumber(personel.balance) !== 0 && (() => {
                    const hint = formatConvertedHint(Math.abs(toNumber(personel.balance)), personel.currency, baseCurrency, exchangeRates);
                    return hint ? <Text variant="caption" color="secondary">{hint}</Text> : null;
                  })()}
                </View>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    handleOpenActionSheet(personel);
                  }}
                  hitSlop={HIT_SLOP.md}
                  style={styles.moreButton}
                >
                  <MoreVertical size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              {/* Meta (pozisyon/telefon/izin) — tam genişlik alt satır, isim hizasında;
                  sağdaki tutarla çakışmaz. */}
              {hasMeta && (
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
                      <Phone size={12} color={colors.textMuted} style={personel.position ? { marginLeft: spacing.sm } : undefined} />
                      <Text variant="caption" color="secondary">
                        {personel.phone}
                      </Text>
                    </>
                  )}
                  {hasLeave && (
                    <>
                      <CalendarDays size={12} color={lq!.kalan >= 0 ? colors.success : colors.error} style={(personel.position || personel.phone) ? { marginLeft: spacing.sm } : undefined} />
                      <Text variant="caption" color={lq!.kalan >= 0 ? 'success' : 'error'}>
                        {t('staff:leave.remainingDays', { count: lq!.kalan })}
                      </Text>
                    </>
                  )}
                </View>
              )}
              </View>
            }
          >
            <View style={styles.actionButtons}>
              {canCreatePersonelTransactions && (
              <Button
                variant="primary"
                size="sm"
                icon={<Zap size={16} color={colors.surface} />}
                onPress={() => {
                  setSelectedPersonelId(personel.id);
                  setQuickBarVisible(true);
                }}
                style={styles.actionButton}
              >
                {t('common:archive.actions.makeTransaction')}
              </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                icon={<History size={16} color={colors.text} />}
                onPress={() => handleOpenPersonelDetail(personel.id)}
                style={styles.actionButton}
              >
                {t('staff:actions.viewTransactions')}
              </Button>
            </View>
          </ExpandableCard>
        )}
      </View>
      </AnimatedListItem>
    );
  }, [selectedIds, isSelectMode, expandedPersonelId, t, baseCurrency, exchangeRates, haptics, toggleSelection, handleOpenActionSheet, handleOpenPersonelDetail, getBalanceLabel, getBalanceColor, leaveQuotas, canCreatePersonelTransactions, canSelectPersonel, filteredPersonel.length]);

  // FlatList ListHeaderComponent - header, özet ve arama
  const ListHeader = useMemo(() => (
    <>
      <SharedIsletmeBanner />

      {/* Özet Kartları */}
      <View style={styles.summaryContainer}>
        <Card style={styles.summaryCard}>
          <Text variant="caption" color="secondary">{t('staff:balance.weOwe')}</Text>
          <Text variant="h3" color="error">{formatCurrency(personelSummary.payables, baseCurrency)}</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <Text variant="caption" color="secondary">{t('staff:balance.theyOwe')}</Text>
          <Text variant="h3" color="success">{formatCurrency(personelSummary.receivables, baseCurrency)}</Text>
        </Card>
      </View>

      {/* Loading state */}
      {isLoading && <SkeletonAccountList count={5} />}
    </>
  ), [t, router, personelSummary.payables, personelSummary.receivables, baseCurrency, isLoading, personelList]);

  // FlatList ListEmptyComponent
  const ListEmpty = useMemo(() => {
    if (isLoading) return null;
    return (
      <EmptyState
        icon={<UserCircle size={48} color={colors.textMuted} />}
        title={debouncedSearch ? t('staff:search.noResults') : t('staff:messages.noPersonnel')}
        description={
          debouncedSearch
            ? t('common:search.tryDifferent')
            : canCreatePersonnel
              ? t('staff:messages.addFirstPersonnel')
              : undefined
        }
        actionLabel={
          debouncedSearch || !canCreatePersonnel
            ? undefined
            : t('staff:titles.addPersonnel')
        }
        onAction={
          debouncedSearch || !canCreatePersonnel
            ? undefined
            : () => router.push('/personel/ekle')
        }
      />
    );
  }, [isLoading, debouncedSearch, t, router, canCreatePersonnel]);

  const listExtraData = useMemo(
    () => ({ selectedIds, isSelectMode, sortBy, expandedPersonelId }),
    [selectedIds, isSelectMode, sortBy, expandedPersonelId],
  );

  return (
    // Screen'e `top` VERİLMİYOR — bilinçli: cam modda üst safe-area boşluğunu
    // TabHeader kendisi taşıyor, Screen de verirse boşluk iki kez sayılır.
    <Screen>
      {/* CAM NAV BAR PİLOTU (yalnız bu ekran): header akıştan çıkıp listenin
          ÜSTÜNDE yüzüyor, liste onun arkasından akıyor — çentiğin altından da.
          Bu yüzden header listeden SONRA render ediliyor (üstte boyansın) ve
          listenin üst boşluğu ölçülen header yüksekliğine eşitleniyor. */}
      <FlatList
        ref={listRef}
        style={styles.scrollView}
        onScroll={handleListScroll}
        onScrollBeginDrag={handleListScrollBeginDrag}
        onScrollEndDrag={handleListScrollEndDrag}
        onMomentumScrollBegin={handleListMomentumScrollBegin}
        onMomentumScrollEnd={handleListMomentumScrollEnd}
        scrollEventThrottle={16}
        data={isLoading ? [] : filteredPersonel}
        keyExtractor={(item) => item.id}
        renderItem={renderPersonelItem}
        ItemSeparatorComponent={PersonelListSeparator}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        showsVerticalScrollIndicator={false}
        refreshControl={
          // progressViewOffset: spinner cam header'ın ALTINDA belirsin, arkasında değil.
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} progressViewOffset={headerH} colors={[colors.primary]} tintColor={colors.primary} />
        }
        // Performans optimizasyonları
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        // Extra data for re-renders when these change
        extraData={listExtraData}
        contentContainerStyle={[styles.listContainer, { paddingTop: headerH, paddingBottom: contentPaddingBottom }]}
      />

      <TabHeader
        glass
        onHeightChange={handleHeaderHeightChange}
        title={t('staff:titles.personnel')}
        // İlk kareden bir subtitle satırı rezerve edilir; veri gelince header
        // yüksekliği değişmez, yalnız boş metin gerçek sayaçla yer değiştirir.
        subtitle={
          personelList && personelList.length > 0
            ? t('staff:messages.personnelCount', { count: personelList.length })
            : '\u00A0'
        }
        right={
          <>
            {/* accessibilityLabel ŞART: buton yalnız ikon taşıyor, metin çocuğu
                olmadığı için ekran okuyucu adlandıramaz. */}
            <GlassIconButton
              onPress={() => { haptics.light(); setShareSheetVisible(true); }}
              disabled={isExporting}
              accessibilityLabel={t('staff:export.staffList.shareDialogTitle')}
            >
              <FileSpreadsheet size={18} color={isExporting ? colors.textMuted : colors.success} />
            </GlassIconButton>
            <GlassIconButton
              onPress={() => setSortSheetVisible(true)}
              accessibilityLabel={t('common:sort.sortBy')}
            >
              <ArrowUpDown size={18} color={colors.primary} />
            </GlassIconButton>
            <AddEntityButton />
          </>
        }
      />

      {/* Alta sabit yüzen arama çubuğu (Apple Notes tarzı); sağdaki FAB için boşluk bırakır */}
      <FloatingSearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={t('staff:search.searchPersonnel')}
        rightOffset={FAB_SIZE + spacing.md}
        onActiveChange={setSearchActive}
      />

      {/* FAB Backdrop */}
      {canCreatePersonelTransactions && fabMenuVisible && (
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
      {canCreatePersonelTransactions && !isSelectMode && fabMenuVisible && (
        <GlassContainer
          spacing={GLASS_MERGE_SPACING}
          style={[styles.fabMenuContainer, { bottom: spacing.lg + insets.bottom + FAB_SIZE + spacing.md }]}
        >
          {[
            ...(canCreatePersonelPayments ? [{
              label: t('staff:bulkActions.addPayment'),
              icon: <Banknote size={18} color={colors.success} />,
              onPress: () => {
                haptics.light();
                setFabMenuVisible(false);
                router.push('/personel/toplu-odeme');
              },
              index: 1,
            }] : []),
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
      {canCreatePersonelTransactions && !isSelectMode && !searchActive && (
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

      {/* Quick Transaction Bar */}
      {canCreatePersonelTransactions && (
      <QuickTransactionBar
        visible={quickBarVisible}
        onDismiss={() => {
          setQuickBarVisible(false);
          setSelectedPersonelId(null);
        }}
        defaultPersonelId={selectedPersonelId || undefined}
        createScope="personel"
        minimalAccountReferenceMode={
          canCreatePersonelMinimalTransactions ? 'personel' : undefined
        }
        onSuccess={() => {
          setQuickBarVisible(false);
          setSelectedPersonelId(null);
        }}
      />
      )}

      {/* Liste dışa aktar: PDF (önizleme) / Excel */}
      <ShareOptionsSheet
        visible={shareSheetVisible}
        onDismiss={() => setShareSheetVisible(false)}
        entityType="personel"
        onPdfPress={openPdfPreview}
        onExcelPress={handleExcelExport}
      />
      <ListPdfPreviewSheet
        visible={!!pdfPreview}
        options={pdfPreview}
        isSharing={isExporting}
        onDismiss={() => setPdfPreview(null)}
        onShare={handleSharePreviewPdf}
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
              onPress={allVisibleSelected ? handleDeselectAll : handleSelectAll}
              style={styles.bulkActionSelectAll}
            >
              <Text variant="body" style={{ color: colors.primary }}>
                {allVisibleSelected
                  ? t('common:bulkSelect.deselectAll')
                  : t('common:bulkSelect.selectAll')}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.bulkActionButtons}>
            <TouchableOpacity
              style={[styles.bulkActionButton, styles.bulkActionArchive]}
              onPress={handleBulkArchive}
              disabled={!canBulkArchiveSelected}
            >
              <Archive size={20} color={!canBulkArchiveSelected ? colors.textMuted : colors.warning} />
              <Text variant="caption" style={{ color: !canBulkArchiveSelected ? colors.textMuted : colors.warning }}>
                {t('common:archive.actions.archive')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkActionButton, styles.bulkActionDelete]}
              onPress={handleBulkDelete}
              disabled={!canBulkDeleteSelected}
            >
              <Trash2 size={20} color={!canBulkDeleteSelected ? colors.textMuted : colors.error} />
              <Text variant="caption" style={{ color: !canBulkDeleteSelected ? colors.textMuted : colors.error }}>
                {t('common:buttons.delete')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Screen>
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
  // sortButton → GlassIconButton'a taşındı.
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
  listContainer: {
    paddingHorizontal: spacing.lg,
    // Alt boşluk BURADA DEĞİL: inline paddingBottom (contentPaddingBottom) onu
    // eziyordu, yani buradaki değer ölüydü. İki yerde iki farklı cevap olması
    // "hangisi geçerli?" tuzağı kuruyor — tek kaynak useContentBottomPadding.
  },
  personelHeaderWrap: {
    flex: 1,
  },
  personelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  personelName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
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
  personelNote: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 1,
  },
  passiveItem: {
    opacity: 0.5,
  },
  personelMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingLeft: 40 + spacing.md, // avatar(40) + personelHeader gap(md) → isim hizası
  },
  personelBalance: {
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
  // FAB Styles
  /** Yalnız KONUM — boyut/görsel GlassFab'de (cam vs dolu disk orada ayrışır). */
  fab: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 10,
  },
  fabMenuContainer: {
    position: 'absolute',
    right: spacing.lg,
    alignItems: 'flex-end',
    gap: spacing.sm,
    zIndex: 9,
  },
  // fabMenuItem / fabMenuIcon / fabMenuLabel → GlassFabMenuItem'a taşındı.
  // Yapışık düz-liste görünümü (cariler dili)
  flatCard: {
    borderRadius: 0,
    marginBottom: 0,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  // Multi-select styles (düz-liste ile uyumlu: köşe/boşluk yok)
  selectedItem: {
    backgroundColor: colors.primaryLight,
  },
  selectableCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
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
