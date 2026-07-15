import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Animated, Alert, RefreshControl, Pressable } from 'react-native';
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
  MoreVertical,
  Zap,
  History,
  CalendarDays,
  FileSpreadsheet,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, SearchInput, Button, EmptyState, Card, ActionSheet, type ActionSheetOption, SkeletonAccountList, Avatar, AnimatedListItem, ExpandableCard, AddEntityButton, TabHeader } from '@/components/ui';
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
import { usePersonelList, useDeletePersonel } from '@/hooks/usePersonel';
import { usePersonelLeaveQuotas } from '@/hooks/usePersonelLeaveQuotas';
import { useArchivePersonel } from '@/hooks/useArchive';
import type { Personel } from '@/types/database';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';
import { SharedIsletmeBanner } from '@/components/ui/SharedIsletmeBanner';
import { usePermissions } from '@/hooks/usePermissions';
import { toErrorMessage, isLinkedRecordsError } from '@/lib/errors';
import { useAuthContext } from '@/contexts/AuthContext';
import { exportEntityListToExcel, type EntityListCell, type EntityListSummaryLine, type EntityListExportOptions } from '@/lib/excelExport';
import { exportEntityListToPdf } from '@/lib/entityListPdf';
import { ShareOptionsSheet, ListPdfPreviewSheet } from '@/components/export';

export default function PersonelPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(['staff', 'common', 'navigation']);
  const [searchQuery, setSearchQuery] = useState('');
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
  const { isletme } = useAuthContext();

  // Gerçek veriler - pasif personeli de dahil et
  const { data: personelList, isLoading, refetch } = usePersonelList(true);
  const { data: leaveQuotas } = usePersonelLeaveQuotas();
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

  // Permissions
  const { canUpdate, canDelete } = usePermissions();

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
  const handleOpenActionSheet = useCallback((personel: Personel) => {
    setActionSheetPersonel(personel);
    setActionSheetVisible(true);
  }, []);

  const handleArchive = useCallback(async () => {
    if (!actionSheetPersonel) return;
    try {
      await archivePersonel.mutateAsync(actionSheetPersonel.id);
      haptics.success();
      showToast(t('common:archive.messages.archiveSuccess'), 'success');
    } catch (error) {
      haptics.error();
      showToast(t('common:messages.operationFailed'), 'error');
    }
  }, [actionSheetPersonel, archivePersonel, haptics, showToast, t]);

  const handleDelete = useCallback(() => {
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
  }, [actionSheetPersonel, deletePersonel, haptics, showToast, t]);

  // Multi-select handlers
  const handleEnterSelectMode = useCallback(() => {
    if (actionSheetPersonel) {
      setExpandedPersonelId(null); // Collapse expanded card to prevent layout jump
      setIsSelectMode(true);
      setSelectedIds(new Set([actionSheetPersonel.id]));
    }
  }, [actionSheetPersonel]);

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

  const actionSheetOptions: ActionSheetOption[] = useMemo(() => {
    const options: ActionSheetOption[] = [
      {
        label: t('common:bulkSelect.select'),
        icon: <CheckSquare size={20} color={colors.info} />,
        onPress: handleEnterSelectMode,
      },
    ];

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
  }, [actionSheetPersonel, t, handleEnterSelectMode, handleArchive, handleDelete, canUpdate, canDelete, router]);

  // Arama ve sıralama (aktif önce). A2: useMemo + debouncedSearch → her tuşta değil, arama
  // durunca (veya liste/sıralama değişince) filter+sort tekrar çalışır.
  const filteredPersonel = useMemo(() => (personelList ?? [])
    .filter((p) =>
      textIncludes(`${p.first_name} ${p.last_name}`, debouncedSearch)
    )
    .sort((a, b) => {
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
      return a.first_name.localeCompare(b.first_name, 'tr');
    }),
  [personelList, debouncedSearch, sortBy]);

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
    () => filteredPersonel.map((p) => p.id),
    [filteredPersonel]
  );
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
              <Avatar name={`${personel.first_name} ${personel.last_name ?? ''}`} size={40} />
              <View style={styles.personelInfo}>
                <View style={styles.personelNameRow}>
                  <Text variant="body">
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
            expanded={expandedPersonelId === personel.id}
            onToggle={() => setExpandedPersonelId(expandedPersonelId === personel.id ? null : personel.id)}
            header={
              <View style={styles.personelHeader}>
                <Avatar name={`${personel.first_name} ${personel.last_name ?? ''}`} size={40} />
                <View style={styles.personelInfo}>
                  <View style={styles.personelNameRow}>
                    <Text variant="body">
                      {personel.first_name} {personel.last_name ?? ''}
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
                    {leaveQuotas?.[personel.id] && (leaveQuotas[personel.id].hakEdilen > 0 || leaveQuotas[personel.id].kullanilan > 0) && (
                      <>
                        <CalendarDays size={12} color={leaveQuotas[personel.id].kalan >= 0 ? colors.success : colors.error} style={{ marginLeft: spacing.sm }} />
                        <Text variant="caption" color={leaveQuotas[personel.id].kalan >= 0 ? 'success' : 'error'}>
                          {t('staff:leave.remainingDays', { count: leaveQuotas[personel.id].kalan })}
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
            }
          >
            <View style={styles.actionButtons}>
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
              <Button
                variant="outline"
                size="sm"
                icon={<History size={16} color={colors.text} />}
                onPress={() => router.push(`/personel/${personel.id}`)}
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
  }, [selectedIds, isSelectMode, expandedPersonelId, t, baseCurrency, exchangeRates, haptics, toggleSelection, handleOpenActionSheet, router, getBalanceLabel, getBalanceColor, leaveQuotas]);

  // FlatList ListHeaderComponent - header, özet ve arama
  const ListHeader = useMemo(() => (
    <>
      <SharedIsletmeBanner />

      {/* Özet Kartları */}
      <View style={styles.summaryContainer}>
        <Card style={styles.summaryCard}>
          <Text variant="caption" color="secondary">{t('staff:balance.weOwe')}</Text>
          <Text variant="h3" color="error">{formatCurrency(payables.personel, baseCurrency)}</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <Text variant="caption" color="secondary">{t('staff:balance.theyOwe')}</Text>
          <Text variant="h3" color="success">{formatCurrency(receivables.personel, baseCurrency)}</Text>
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
  ), [t, router, payables.personel, receivables.personel, baseCurrency, searchQuery, isLoading, personelList]);

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
            : t('staff:messages.addFirstPersonnel')
        }
        actionLabel={debouncedSearch ? undefined : t('staff:titles.addPersonnel')}
        onAction={debouncedSearch ? undefined : () => router.push('/personel/ekle')}
      />
    );
  }, [isLoading, debouncedSearch, t, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TabHeader
        title={t('staff:titles.personnel')}
        subtitle={personelList && personelList.length > 0 ? t('staff:messages.personnelCount', { count: personelList.length }) : undefined}
        right={
          <>
            <TouchableOpacity style={styles.sortButton} onPress={() => { haptics.light(); setShareSheetVisible(true); }} activeOpacity={0.7} disabled={isExporting}>
              <FileSpreadsheet size={18} color={isExporting ? colors.textMuted : colors.success} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.sortButton} onPress={() => setSortSheetVisible(true)} activeOpacity={0.7}>
              <ArrowUpDown size={18} color={colors.primary} />
            </TouchableOpacity>
            <AddEntityButton />
          </>
        }
      />
      <FlatList
        style={styles.scrollView}
        data={isLoading ? [] : filteredPersonel}
        keyExtractor={(item) => item.id}
        renderItem={renderPersonelItem}
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
        extraData={{ selectedIds, isSelectMode, sortBy, expandedPersonelId }}
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
  },
  selectableCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
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
