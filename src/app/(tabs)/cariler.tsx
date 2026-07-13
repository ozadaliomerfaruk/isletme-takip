import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, FlatList, Alert, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Users,
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
  Link,
  ArrowUpDown,
  MoreVertical,
  Share2,
  FileSpreadsheet,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter, SearchInput, Button, EmptyState, Card, ActionSheet, type ActionSheetOption, SkeletonAccountList, Avatar, AnimatedListItem, ExpandableCard, AddEntityButton, TabHeader } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useHaptics } from '@/hooks/useHaptics';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { textIncludes } from '@/lib/turkishTextUtils';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { useCariler, useDeleteCari } from '@/hooks/useCariler';
import { useArchiveCari } from '@/hooks/useArchive';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';
import { Cari, CariType } from '@/types/database';
import { AcceptCodeSheet } from '@/components/cariSharing/AcceptCodeSheet';
import { ShareCodeModal } from '@/components/cariSharing/ShareCodeModal';
import { LinkedCariBadge } from '@/components/cariSharing/LinkedCariBadge';
import { useLinkedCariler, useCariLinks, useRemoveCariLink } from '@/hooks/useCariSharing';
import type { SharingPermission } from '@/types/cariSharing';
import { SharedIsletmeBanner } from '@/components/ui/SharedIsletmeBanner';
import { usePermissions } from '@/hooks/usePermissions';
import { toErrorMessage, isLinkedRecordsError } from '@/lib/errors';
import { DetailExportSection } from '@/components/detail';
import { exportCariListesiToExcel, type CariListeItem } from '@/lib/excelExport';
import { useAuthContext } from '@/contexts/AuthContext';
import { hasTypeMismatch } from '@/lib/cariTransactionMapper';

// Merged cari type: own cari + optional link metadata
type MergedCari = Cari & {
  isLinked?: boolean;
  isSharedByMe?: boolean;
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
  // A2: SearchInput value'su anlık searchQuery'ye bağlı; filtre/sıralama debouncedSearch
  // kullanır ve useMemo ile sarılır → binlerce caride her tuşta filter+sort tekrarlanmaz.
  const debouncedSearch = useDebouncedValue(searchQuery, 250);
  const [sortBy, setSortBy] = useState<'name' | 'balanceHigh' | 'balanceLow'>('name');
  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filterOptions = useMemo(() => [
    { label: t('clients:filters.all'), value: 'all' },
    { label: t('clients:titles.suppliers'), value: 'tedarikci' },
    { label: t('clients:titles.customers'), value: 'musteri' },
  ], [t]);

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
  const pendingExportRef = useRef<Cari | null>(null);
  // Export section state
  const [exportSectionVisible, setExportSectionVisible] = useState(false);
  const [exportCari, setExportCari] = useState<Cari | null>(null);

  // Mutations
  const archiveCari = useArchiveCari();
  const deleteCari = useDeleteCari();
  const removeCariLink = useRemoveCariLink();

  // Linked cariler (viewer olarak baglantili carileri getir)
  const { data: linkedCariler = [] } = useLinkedCariler();
  // BUG 1: Owner'in paylastigi carileri tespit et (tum linkler)
  const { data: allCariLinks = [] } = useCariLinks();
  const sharedOwnCariIds = useMemo(() => {
    return new Set(
      allCariLinks
        .filter(link => link.owner_isletme_id !== undefined && link.cari_id !== undefined)
        .map(link => link.cari_id)
    );
  }, [allCariLinks]);

  // Toast ve Haptics
  const { showToast } = useToast();
  const haptics = useHaptics();

  // Export için işletme + link metadata (detay ekranıyla aynı ekstre için)
  const { isletme } = useAuthContext();

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

  const handleArchive = useCallback(async () => {
    if (!actionSheetCari) return;
    try {
      await archiveCari.mutateAsync(actionSheetCari.id);
      haptics.success();
      showToast(t('common:archive.messages.archiveSuccess'), 'success');
    } catch (error) {
      haptics.error();
      showToast(t('common:messages.operationFailed'), 'error');
    }
  }, [actionSheetCari, archiveCari, haptics, showToast, t]);

  const handleDelete = useCallback(() => {
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
  }, [actionSheetCari, deleteCari, haptics, showToast, t]);

  // Multi-select handlers
  const handleEnterSelectMode = useCallback(() => {
    if (actionSheetCari) {
      setExpandedCariId(null); // Collapse expanded card to prevent layout jump
      setIsSelectMode(true);
      setSelectedIds(new Set([actionSheetCari.id]));
    }
  }, [actionSheetCari]);

  const toggleSelection = useCallback((id: string) => {
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
  }, [haptics]);

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

  const handleRemoveLink = useCallback((linkId: string) => {
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
  }, [removeCariLink, haptics, showToast, t]);

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
      label: t('common:buttons.share'),
      icon: <Share2 size={20} color={colors.primary} />,
      onPress: () => {
        if (actionSheetCari) {
          pendingExportRef.current = actionSheetCari;
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
  }, [actionSheetCari, t, router, handleEnterSelectMode, handleArchive, handleDelete, handleRemoveLink, canUpdate, canDelete]);

  const actionSheetOptions = useMemo(() => {
    if (!actionSheetCari) return [];
    // Check if actionSheetCari is a linked cari
    const mergedItem = mergedCariler?.find(c => c.id === actionSheetCari.id);
    return getActionSheetOptions(mergedItem ?? (actionSheetCari as MergedCari));
  }, [actionSheetCari, getActionSheetOptions]);

  // Merge own cariler + linked cariler
  const mergedCariler = useMemo((): MergedCari[] => {
    const ownItems: MergedCari[] = (cariler ?? []).map(c => ({
      ...c,
      isSharedByMe: sharedOwnCariIds.has(c.id),
    }));

    // Transform linked cariler into MergedCari items
    const linkedItems: MergedCari[] = linkedCariler
      .filter(link => link.cari) // guard
      .map(link => {
        // Bakiye owner perspektifinde saklanir. Tipler farkliysa viewer icin negate et.
        const ownerType = link.cari!.type;
        const viewerType = link.viewer_type;
        const invertBalance = ownerType !== viewerType;
        const balance = invertBalance ? -Number(link.cari!.balance) : Number(link.cari!.balance);
        return {
        // Map linked cari data to Cari shape
        id: link.cari!.id,
        name: link.cari!.name,
        balance,
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
      } as MergedCari;
      });

    return [...ownItems, ...linkedItems];
  }, [cariler, linkedCariler, sharedOwnCariIds]);

  // Arama filtresi ve sıralama (aktif önce). A2: useMemo + debouncedSearch → her tuşta değil,
  // yalnız arama 250ms durunca (veya diğer girdiler değişince) filter+sort tekrar çalışır.
  const filteredCariler = useMemo(() => mergedCariler
    .filter((cari) => {
      // Type filter
      if (filter !== 'all' && cari.type !== filter) return false;
      // Search filter
      if (debouncedSearch && !textIncludes(cari.name, debouncedSearch)) return false;
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
        const aVal = toNumber(a.balance);
        const bVal = toNumber(b.balance);
        // Borçlarımız (negatif) önce, alacaklarımız (pozitif) sonra, sıfır en sonda
        const aGroup = aVal < 0 ? 0 : aVal > 0 ? 1 : 2;
        const bGroup = bVal < 0 ? 0 : bVal > 0 ? 1 : 2;
        if (aGroup !== bGroup) return aGroup - bGroup;
        // Aynı grup içinde mutlak değere göre büyükten küçüğe
        return Math.abs(bVal) - Math.abs(aVal);
      }
      if (sortBy === 'balanceLow') {
        const aVal = toNumber(a.balance);
        const bVal = toNumber(b.balance);
        // Alacaklarımız (pozitif) önce, borçlarımız (negatif) sonra, sıfır en sonda
        const aGroup = aVal > 0 ? 0 : aVal < 0 ? 1 : 2;
        const bGroup = bVal > 0 ? 0 : bVal < 0 ? 1 : 2;
        if (aGroup !== bGroup) return aGroup - bGroup;
        // Aynı grup içinde mutlak değere göre küçükten büyüğe
        return Math.abs(aVal) - Math.abs(bVal);
      }
      // Default: alphabetical
      return a.name.localeCompare(b.name, 'tr');
    }),
  [mergedCariler, filter, debouncedSearch, sortBy]);

  // #8: açık tab'ın (tip filtresi + arama + sıralama uygulanmış) anlık listesini Excel'e aktar
  const [isExporting, setIsExporting] = useState(false);
  const handleExportClientList = useCallback(async () => {
    if (!filteredCariler || filteredCariler.length === 0 || !isletme) return;
    setIsExporting(true);
    try {
      const items: CariListeItem[] = filteredCariler.map((c) => {
        const bal = toNumber(c.balance);
        const durum = bal === 0
          ? t('clients:balance.noBalance')
          : c.type === 'tedarikci'
            ? (bal < 0 ? t('clients:balance.weOwe') : t('clients:balance.theyOwe'))
            : (bal > 0 ? t('clients:balance.theyOwe') : t('clients:balance.weOwe'));
        return {
          ad: c.name,
          tip: t(`clients:types.${c.type}`),
          telefon: c.phone || '',
          bakiye: bal,
          durum,
          currency: c.currency || 'TRY',
        };
      });
      const dateStr = new Date().toISOString().slice(0, 10);
      const tabKey = filter === 'all' ? 'tumu' : filter;
      await exportCariListesiToExcel({
        cariler: items,
        translations: {
          title: t('clients:export.clientList.title'),
          fileName: `${t('clients:export.clientList.fileName')}-${tabKey}-${dateStr}`,
          isletmeName: isletme.name || '',
          shareDialogTitle: t('clients:export.clientList.shareDialogTitle'),
          sharingNotSupported: t('clients:export.sharingNotSupported'),
          noDataError: t('clients:export.clientList.noData'),
          columns: {
            name: t('clients:export.clientList.columns.name'),
            type: t('clients:export.clientList.columns.type'),
            phone: t('clients:export.clientList.columns.phone'),
            balance: t('clients:export.clientList.columns.balance'),
            status: t('clients:export.clientList.columns.status'),
          },
        },
      });
    } catch {
      showToast(t('clients:export.error'), 'error');
    } finally {
      setIsExporting(false);
    }
  }, [filteredCariler, isletme, filter, t, showToast]);

  // #11: "Tümünü seç" durumunu sayı eşitliği yerine ÜYELİK ile belirle. Filtre/arama
  // değişince selectedIds bayat id'ler tutabiliyor; saf sayı karşılaştırması yanlış
  // etiket gösteriyordu. Görünür (linked olmayan) tüm carilerin seçili olup olmadığına bak.
  const selectableVisibleIds = useMemo(
    () => filteredCariler.filter((c) => !c.isLinked).map((c) => c.id),
    [filteredCariler]
  );
  const allVisibleSelected = selectableVisibleIds.length > 0
    && selectableVisibleIds.every((id) => selectedIds.has(id));

  // Filtre/arama değişince artık görünür olmayan seçimleri buda (bayat seçim temizliği)
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visible = new Set(selectableVisibleIds);
    let changed = false;
    selectedIds.forEach((id) => { if (!visible.has(id)) changed = true; });
    if (changed) {
      setSelectedIds((prev) => {
        const next = new Set<string>();
        prev.forEach((id) => { if (visible.has(id)) next.add(id); });
        return next;
      });
    }
    // selectedIds'i dep'e koymuyoruz: yalnızca görünür küme değişince budama yapılır,
    // her seçim değişiminde değil (sonsuz döngü/agresif budama olmaz).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectableVisibleIds]);

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
                  {/* #9: cari oluşturulurken yazılan not (cari.notes) — isim altında, tek satır */}
                  {cari.notes ? (
                    <Text variant="caption" color="secondary" numberOfLines={1} style={styles.notePreview}>
                      {cari.notes}
                    </Text>
                  ) : null}
                  {cari.isLinked ? (
                    <LinkedCariBadge
                      ownerIsletmeName={cari.linkOwnerName ?? ''}
                      permission={cari.linkPermission ?? 'view'}
                      variant="inline"
                    />
                  ) : cari.isSharedByMe ? (
                    <View style={styles.sharedByMeRow}>
                      <Link size={12} color={colors.primary} />
                      <Text variant="caption" color="primary">
                        {t('clients:sharing.sharedByMe')}
                      </Text>
                      <Text variant="caption" color="secondary">
                        {' • '}{cari.type === 'tedarikci' ? t('clients:types.tedarikci') : t('clients:types.musteri')}
                      </Text>
                    </View>
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
                  hitSlop={HIT_SLOP.md}
                  style={styles.moreButton}
                >
                  <MoreVertical size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            }
          >
            <View style={styles.actionButtons}>
              {/* BUG 7: View-only linkli carilerde İşlem Yap butonu gizle */}
              {!(cari.isLinked && cari.linkPermission === 'view') && (
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
              )}
              <Button
                variant="outline"
                size="sm"
                icon={<History size={16} color={colors.text} />}
                onPress={() => router.push(`/cariler/${cari.id}`)}
                style={[styles.actionButton, cari.isLinked && cari.linkPermission === 'view' && { flex: 1 }]}
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
      <SharedIsletmeBanner />
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
  ), [t, router, payables.cari, receivables.cari, searchQuery, filterOptions, filter, isLoading, baseCurrency]);

  // FlatList ListEmptyComponent
  const ListEmpty = useMemo(() => {
    if (isLoading) return null;
    return (
      <EmptyState
        icon={<Users size={48} color={colors.textMuted} />}
        title={debouncedSearch ? t('clients:search.noResults') : t('clients:messages.noClients')}
        description={
          debouncedSearch
            ? t('common:search.tryDifferent')
            : t('clients:messages.addFirstClient')
        }
        actionLabel={debouncedSearch ? undefined : t('clients:titles.addClient')}
        onAction={debouncedSearch ? undefined : () => router.push('/cariler/ekle')}
      />
    );
  }, [isLoading, debouncedSearch, t, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TabHeader
        title={t('clients:titles.clients')}
        right={
          <>
            {filteredCariler.length > 0 && (
              <TouchableOpacity style={styles.sortButton} onPress={() => { haptics.light(); handleExportClientList(); }} activeOpacity={0.7} disabled={isExporting}>
                <FileSpreadsheet size={18} color={isExporting ? colors.textMuted : colors.success} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.sortButton} onPress={() => setSortSheetVisible(true)} activeOpacity={0.7}>
              <ArrowUpDown size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkButton} onPress={() => setAcceptCodeVisible(true)} activeOpacity={0.7}>
              <Link size={18} color={colors.primary} />
            </TouchableOpacity>
            <AddEntityButton />
          </>
        }
      />
      <FlatList
        style={styles.scrollView}
        data={isLoading ? [] : filteredCariler}
        keyExtractor={(item) => item.id}
        renderItem={renderCariItem}
        keyboardShouldPersistTaps="handled"
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
          if (pendingExportRef.current) {
            const cariData = pendingExportRef.current;
            pendingExportRef.current = null;
            requestAnimationFrame(() => {
              setExportCari(cariData);
              setExportSectionVisible(true);
            });
          }
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

      {/* Export/Share Section */}
      {exportCari && (
        <DetailExportSection
          visible={exportSectionVisible}
          onDismiss={() => {
            // setExportCari(null) BURADA ÇAĞRILMAMALI: ShareOptionsSheet
            // seçenekleri asıl işi 300ms setTimeout ile erteliyor; null'lamak
            // DetailExportSection'ı (PDF/Excel sheet'leriyle) unmount edip
            // ertelenen açılışı sessizce yutuyordu. exportCari bir sonraki
            // seçimde zaten üzerine yazılıyor.
            setExportSectionVisible(false);
          }}
          entityType="cari"
          entityId={exportCari.id}
          entityName={exportCari.name}
          entityCurrency={exportCari.currency}
          currentBalance={Number(exportCari.balance)}
          cariType={exportCari.type as 'musteri' | 'tedarikci'}
          currentIsletmeId={isletme?.id}
          typeMismatch={hasTypeMismatch(
            exportCari.type,
            allCariLinks.find((l) => l.cari_id === exportCari.id)?.viewer_type
          )}
          phone={exportCari.phone ?? undefined}
          onSharePress={() => {
            setExportSectionVisible(false);
            requestAnimationFrame(() => {
              setShareModalCari({ id: exportCari.id, name: exportCari.name });
              setShareModalVisible(true);
            });
          }}
        />
      )}

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
  notePreview: {
    marginTop: 1,
  },
  cariInfo: {
    flex: 1,
  },
  cariNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sharedByMeRow: {
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
  },
  selectableCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
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
