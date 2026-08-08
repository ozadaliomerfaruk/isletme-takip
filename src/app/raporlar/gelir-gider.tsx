import { upperTr } from '@/lib/turkishTextUtils';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { useState, useEffect } from 'react';
import { logEvent } from '@/lib/appEvents';
import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter, CategoryReportCard, IncomeSourceCard, Button, Screen } from '@/components/ui';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import { CollapsibleGroupHeader } from '@/components/reports/CollapsibleGroupHeader';
import { PeriodNavigator } from '@/components/reports/PeriodNavigator';
import { CustomDateRangePicker } from '@/components/reports/CustomDateRangePicker';
import { ReportExportButton } from '@/components/reports/ReportExportButton';
import { ConversionIncompleteWarning } from '@/components/reports/ConversionIncompleteWarning';
import {
  IncomeExpenseLensPicker,
  INCOME_EXPENSE_LENS_STICKY_SPACE,
} from '@/components/reports/IncomeExpenseLensPicker';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { useReportExcelExport } from '@/hooks/useReportExcelExport';
import { useCategoryReport } from '@/hooks/useCategoryReport';
import { useIncomeSourceReport, IncomeSourceItem } from '@/hooks/useAccountReport';
import { PeriodType } from '@/hooks/useIslemler';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { usePagePermission } from '@/hooks/usePagePermission';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { useSettings } from '@/hooks/useSettings';
import {
  formatReportLensValue,
  IncomeExpenseLens,
  isIncomeExpenseLens,
  reportLensCurrency,
} from '@/lib/reportLens';
type ReportType = 'gelir' | 'gider';

export default function GelirGiderRaporPage() {
  const contentPaddingBottom = useContentBottomPadding();
  usePagePermission({ module: 'raporlar' });
  useEffect(() => { logEvent('report_viewed', { report_type: 'income_expense' }); }, []);
  const router = useRouter();
  const { t } = useTranslation(['reports', 'common']);
  const state = useReportRouteState();
  const { currency: baseCurrency } = useSettings();
  const { lens: lensParam } = useLocalSearchParams<{ lens?: string }>();
  const [selectedType, setSelectedType] = useState<ReportType>('gider');
  const [selectedLens, setSelectedLens] = useState<IncomeExpenseLens>(() =>
    baseCurrency === 'TRY' && isIncomeExpenseLens(lensParam) ? lensParam : 'nominal',
  );
  // Yalnız GELİR görünümünde kırılım seçimi: kategoriye göre ↔ hesaba göre.
  // Gider tarafında her zaman kategori (hesap kırılımına ihtiyaç yok).
  const [gelirGroupBy, setGelirGroupBy] = useState<'kategori' | 'hesap'>('kategori');

  useEffect(() => {
    if (baseCurrency !== 'TRY' && selectedLens !== 'nominal') {
      setSelectedLens('nominal');
    }
  }, [baseCurrency, selectedLens]);

  useEffect(() => {
    if (baseCurrency === 'TRY' && isIncomeExpenseLens(lensParam)) {
      setSelectedLens(lensParam);
    }
  }, [baseCurrency, lensParam]);

  const {
    isExporting,
    canExport,
    exportReport,
    exportLensSummary,
  } = useReportExcelExport(selectedType === 'gelir' ? 'gelir' : 'gider');

  const PERIOD_OPTIONS = [
    { label: upperTr(t('reports:period.yearly')), value: 'yearly' },
    { label: upperTr(t('reports:period.monthly')), value: 'monthly' },
    { label: upperTr(t('reports:period.weekly')), value: 'weekly' },
    { label: upperTr(t('reports:period.daily')), value: 'daily' },
    { label: upperTr(t('reports:period.custom')), value: 'custom' },
  ];

  const gelirRaporu = useCategoryReport('gelir', {
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
    lens: selectedLens,
  });

  const giderRaporu = useCategoryReport('gider', {
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
    percentageReferenceTotal: gelirRaporu.totalAmount,
    lens: selectedLens,
  });

  // GELİR KAYNAK kırılımı: hesaplar (banka/nakit/kk) + cari (kredili satış) + personel
  // satışları, türe göre gruplu. Yalnız Gelir görünümünde; gider tarafı kategori.
  const kaynakRaporu = useIncomeSourceReport({
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
    lens: selectedLens,
  });
  // Açık/kapalı gruplar (varsayılan hepsi açık)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const { refreshing, onRefresh } = usePullToRefresh(
    gelirRaporu.refetch,
    giderRaporu.refetch,
    kaynakRaporu.refetch,
  );

  // Rapora GERİ DÖNÜNCE anlık tazele (ör. başka ekranda ürün kategorisi/işlem değişince).
  // İlk odak atlanır (mount zaten çeker); sonraki odaklarda stale veri yenilenir.
  useRefetchOnFocus([gelirRaporu.refetch, giderRaporu.refetch, kaynakRaporu.refetch]);

  const handleCategoryPress = (kategoriId: string | null) => {
    const id = kategoriId || 'uncategorized';
    router.push({
      pathname: '/raporlar/kategori/[id]',
      params: {
        id,
        type: selectedType,
        startDate: state.dateRange.startDate,
        endDate: state.dateRange.endDate,
        lens: selectedLens,
      },
    });
  };

  // Kaynak kartına tıklayınca: o kaynağın (hesap/cari/personel) dönem gelir işlemleri
  const handleSourcePress = (item: IncomeSourceItem) => {
    router.push({
      pathname: '/raporlar/hesap/[id]',
      params: {
        id: item.id,
        hesapName: item.name,
        hesapCurrency: item.currency,
        kind: item.kind,
        type: 'gelir',
        startDate: state.dateRange.startDate,
        endDate: state.dateRange.endDate,
        lens: selectedLens,
      },
    });
  };

  // Hesap görünümü yalnız GELİR + "hesap" kırılımında. Diğer tüm durumlar kategori
  // (gider→giderRaporu; gelir+kategori→gelirRaporu).
  const showAccounts = selectedType === 'gelir'
    && gelirGroupBy === 'hesap';
  const catReport = selectedType === 'gider' ? giderRaporu : gelirRaporu;
  const activeReport = showAccounts ? kaynakRaporu : catReport;
  const historicalConversionIncomplete = selectedLens !== 'nominal'
    && activeReport.conversionIncomplete === true;
  const historicalMissingRateCount = selectedLens === 'nominal'
      ? 0
      : (activeReport.missingRateCount ?? 0);
  const selectedLensTranslationKey = selectedLens === 'reel'
    ? 'real'
    : selectedLens === 'altin'
      ? 'gold'
      : selectedLens;
  const selectedLensLabel = t(
    `reports:incomeExpenseLens.${selectedLensTranslationKey}`,
  );

  const handleExport = () => {
    if (selectedLens === 'nominal') {
      void exportReport(
        state.dateRange.startDate,
        state.dateRange.endDate,
        state.periodLabel,
      );
      return;
    }

    void exportLensSummary({
      startDate: state.dateRange.startDate,
      endDate: state.dateRange.endDate,
      periodLabel: state.periodLabel,
      lens: selectedLens,
      lensLabel: selectedLensLabel,
      lensDescription: t(
        `reports:incomeExpenseLens.description.${selectedLens}`,
      ),
      dimensionLabel: showAccounts
        ? t('reports:groupBy.account')
        : t('reports:groupBy.category'),
      currency: reportLensCurrency(selectedLens) ?? 'TRY',
      rows: showAccounts
        ? kaynakRaporu.groups.flatMap((group) => group.items.map((item) => ({
            category: item.name,
            transactionCount: item.count,
            amount: item.total,
          })))
        : catReport.items.map((item) => ({
            category: item.kategori?.name ?? t('reports:titles.uncategorized'),
            transactionCount: item.count,
            amount: item.total,
          })),
      totalAmount: activeReport.totalAmount,
      conversionIncomplete: historicalConversionIncomplete,
      missingRateCount: historicalMissingRateCount,
    });
  };
  // Seçili yönün dönem İADE toplamı (net'ten düşülmüştür; şeffaflık için ayrı satırda).
  const activeReturnTotal = selectedType === 'gelir' ? gelirRaporu.returnTotal : giderRaporu.returnTotal;

  return (
    <>
      <Stack.Screen
        options={{
          title: t('reports:titles.categoryDistribution'),
          headerBackVisible: true,
          gestureEnabled: true,
          headerRight: () => canExport ? (
              <ReportExportButton
                onPress={handleExport}
                isExporting={isExporting}
                accessibilityLabel={t('reports:export.exportExcel')}
              />
            ) : null,
        }}
      />
      <Screen>
        <ScrollView
          contentContainerStyle={{
            paddingTop: baseCurrency === 'TRY' ? INCOME_EXPENSE_LENS_STICKY_SPACE : 0,
            paddingBottom: contentPaddingBottom,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          {/* Kur bulunamadıysa toplamlar eksik/çevrilmemiş — sessiz kalmıyor */}
          <ConversionIncompleteWarning
            visible={
              selectedLens === 'nominal' && (showAccounts
                ? kaynakRaporu.conversionIncomplete
                : catReport.conversionIncomplete)
            }
          />

          {/* Period Tabs */}
          <View style={styles.periodFilter}>
            <TabFilter
              options={PERIOD_OPTIONS}
              value={state.period}
              onChange={(v) => {
                state.setPeriod(v as PeriodType);
                state.setPeriodOffset(0);
              }}
            />
          </View>

          {historicalConversionIncomplete ? (
            <View style={styles.historicalWarning}>
              <Text variant="caption" color="error">
                {t('reports:incomeExpenseLens.incomplete', {
                  count: historicalMissingRateCount,
                })}
              </Text>
            </View>
          ) : null}

          {/* Date Navigator + Gelir/Gider Summary Tabs */}
          <View style={styles.summaryBar}>
            {state.period === 'custom' ? (
              <CustomDateRangePicker
                startDate={state.customStartDate}
                endDate={state.customEndDate}
                onChange={(s, e) => {
                  state.setCustomStartDate(s);
                  state.setCustomEndDate(e);
                }}
                locale={state.locale}
              />
            ) : (
              <PeriodNavigator
                period={state.period}
                periodOffset={state.periodOffset}
                periodLabel={state.periodLabel}
                setPeriodOffset={state.setPeriodOffset}
              />
            )}

            <View style={styles.summaryTabs}>
              <TouchableOpacity
                style={[
                  styles.summaryTab,
                  selectedType === 'gelir' && styles.summaryTabActiveGelir,
                ]}
                onPress={() => setSelectedType('gelir')}
              >
                <Text
                  variant="caption"
                  style={[
                    styles.summaryTabLabel,
                    selectedType === 'gelir' && styles.summaryTabLabelActiveGelir,
                  ]}
                >
                  {t('reports:summary.income').toUpperCase()}
                </Text>
                <Text
                  variant="body"
                  style={[
                    styles.summaryTabAmount,
                    selectedType === 'gelir' && styles.summaryTabAmountActiveGelir,
                  ]}
                  numberOfLines={1}
                >
                  {formatReportLensValue(
                    showAccounts
                      ? kaynakRaporu.totalAmount
                      : gelirRaporu.totalAmount,
                    selectedLens,
                  )}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.summaryTab,
                  selectedType === 'gider' && styles.summaryTabActiveGider,
                ]}
                onPress={() => setSelectedType('gider')}
              >
                <Text
                  variant="caption"
                  style={[
                    styles.summaryTabLabel,
                    selectedType === 'gider' && styles.summaryTabLabelActiveGider,
                  ]}
                >
                  {t('reports:summary.expense').toUpperCase()}
                </Text>
                <Text
                  variant="body"
                  style={[
                    styles.summaryTabAmount,
                    selectedType === 'gider' && styles.summaryTabAmountActiveGider,
                  ]}
                  numberOfLines={1}
                >
                  {formatReportLensValue(giderRaporu.totalAmount, selectedLens)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* İade satırı: iadeler yukarıdaki net toplamdan zaten DÜŞÜLDÜ; şeffaflık için göster. */}
          {activeReturnTotal > 0 && (
            <View style={styles.iadeRow}>
              <Text variant="caption" color="secondary">
                {t('reports:purchaseSales.returns')}: −{formatReportLensValue(activeReturnTotal, selectedLens)}
              </Text>
            </View>
          )}

          {/* GELİR görünümünde kırılım seçimi (Kategori ↔ Hesap). Gider hep kategori. */}
          {selectedType === 'gelir' && (
            <View style={styles.groupByBar}>
              <TabFilter
                options={[
                  { label: t('reports:groupBy.category'), value: 'kategori' },
                  { label: t('reports:groupBy.account'), value: 'hesap' },
                ]}
                value={gelirGroupBy}
                onChange={(v) => setGelirGroupBy(v as 'kategori' | 'hesap')}
              />
            </View>
          )}

          {/* Liste: hesap kırılımı (gelir+hesap) ya da kategori kırılımı */}
          <View style={styles.categoryList}>
            {showAccounts ? (
              kaynakRaporu.error ? (
                <View style={styles.emptyContainer}>
                  <Text variant="body" color="error" style={styles.emptyText}>
                    {t('reports:empty.dataLoadError')}
                  </Text>
                  <Button variant="ghost" onPress={() => kaynakRaporu.refetch()}>
                    {t('common:buttons.retry')}
                  </Button>
                </View>
              ) : kaynakRaporu.isLoading ? (
                <View style={styles.loadingContainer}>
                  <SkeletonListItem />
                  <SkeletonListItem />
                  <SkeletonListItem />
                </View>
              ) : kaynakRaporu.groups.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text variant="body" color="secondary" style={styles.emptyText}>
                    {t('reports:empty.noAccountIncome')}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.sectionHeader}>
                    <Text variant="caption" color="secondary" style={styles.sectionHeaderText}>
                      {t('reports:incomeSource.title')}
                    </Text>
                    <Text variant="caption" color="secondary">
                      {t('reports:counts.transaction', { count: kaynakRaporu.totalCount })}
                    </Text>
                  </View>
                  {kaynakRaporu.groups.map((group) => {
                    const collapsed = collapsedGroups.has(group.key);
                    return (
                      <View key={group.key}>
                        <CollapsibleGroupHeader
                          label={t(`reports:incomeSource.groups.${group.key}`, { defaultValue: group.key })}
                          count={group.items.length}
                          amount={formatReportLensValue(group.total, selectedLens)}
                          collapsed={collapsed}
                          onToggle={() => toggleGroup(group.key)}
                        />
                        {!collapsed && group.items.map((item) => (
                          <IncomeSourceCard
                            key={`${item.kind}-${item.id}`}
                            item={item}
                            lens={selectedLens}
                            onPress={
                              kaynakRaporu.canOpenDetails
                                ? () => handleSourcePress(item)
                                : undefined
                            }
                          />
                        ))}
                      </View>
                    );
                  })}
                </>
              )
            ) : catReport.error ? (
              <View style={styles.emptyContainer}>
                <Text variant="body" color="error" style={styles.emptyText}>
                  {t('reports:empty.dataLoadError')}
                </Text>
                <Button variant="ghost" onPress={() => catReport.refetch()}>
                  {t('common:buttons.retry')}
                </Button>
              </View>
            ) : catReport.isLoading ? (
              <View style={styles.loadingContainer}>
                <SkeletonListItem />
                <SkeletonListItem />
                <SkeletonListItem />
              </View>
            ) : catReport.items.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text variant="body" color="secondary" style={styles.emptyText}>
                  {selectedType === 'gelir'
                    ? t('reports:empty.noIncomeTransactions')
                    : t('reports:empty.noExpenseTransactions')}
                </Text>
              </View>
            ) : (
              catReport.items.map((item, index) => (
                <CategoryReportCard
                  key={item.kategori?.id || 'uncategorized'}
                  item={item}
                  index={index}
                  type={selectedType}
                  lens={selectedLens}
                  onPress={() => handleCategoryPress(item.kategori?.id || null)}
                />
              ))
            )}
          </View>
        </ScrollView>
        <IncomeExpenseLensPicker
          value={selectedLens}
          onChange={setSelectedLens}
          visible={baseCurrency === 'TRY'}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  periodFilter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  historicalWarning: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  summaryBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  groupByBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  iadeRow: {
    paddingHorizontal: spacing.lg,
    alignItems: 'flex-end',
    marginBottom: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionHeaderText: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  summaryTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTabActiveGelir: {
    backgroundColor: colors.success + '12',
    borderColor: colors.success,
    borderWidth: 1.5,
  },
  summaryTabActiveGider: {
    backgroundColor: colors.error + '12',
    borderColor: colors.error,
    borderWidth: 1.5,
  },
  summaryTabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  summaryTabLabelActiveGelir: {
    color: colors.success,
  },
  summaryTabLabelActiveGider: {
    color: colors.error,
  },
  summaryTabAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
  },
  summaryTabAmountActiveGelir: {
    color: colors.success,
  },
  summaryTabAmountActiveGider: {
    color: colors.error,
  },
  categoryList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  loadingContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
});
