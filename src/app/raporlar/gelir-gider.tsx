import { useState, useEffect } from 'react';
import { logEvent } from '@/lib/appEvents';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronUp, ChevronDown } from 'lucide-react-native';
import { Text, TabFilter, CategoryReportCard, IncomeSourceCard, Button } from '@/components/ui';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import { PeriodNavigator } from '@/components/reports/PeriodNavigator';
import { CustomDateRangePicker } from '@/components/reports/CustomDateRangePicker';
import { ReportExportButton } from '@/components/reports/ReportExportButton';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { useReportExcelExport } from '@/hooks/useReportExcelExport';
import { useCategoryReport } from '@/hooks/useCategoryReport';
import { useIncomeSourceReport, IncomeSourceItem } from '@/hooks/useAccountReport';
import { PeriodType } from '@/hooks/useIslemler';
import { formatCurrency } from '@/lib/currency';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { usePagePermission } from '@/hooks/usePagePermission';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
type ReportType = 'gelir' | 'gider';

export default function GelirGiderRaporPage() {
  usePagePermission({ module: 'raporlar' });
  useEffect(() => { logEvent('report_viewed', { report_type: 'income_expense' }); }, []);
  const router = useRouter();
  const { t } = useTranslation(['reports', 'common']);
  const state = useReportRouteState();
  const [selectedType, setSelectedType] = useState<ReportType>('gider');
  // Yalnız GELİR görünümünde kırılım seçimi: kategoriye göre ↔ hesaba göre.
  // Gider tarafında her zaman kategori (hesap kırılımına ihtiyaç yok).
  const [gelirGroupBy, setGelirGroupBy] = useState<'kategori' | 'hesap'>('hesap');

  const { isExporting, exportReport } = useReportExcelExport(selectedType === 'gelir' ? 'gelir' : 'gider');

  const PERIOD_OPTIONS = [
    { label: t('reports:period.yearly'), value: 'yearly' },
    { label: t('reports:period.monthly'), value: 'monthly' },
    { label: t('reports:period.weekly'), value: 'weekly' },
    { label: t('reports:period.daily'), value: 'daily' },
    { label: t('reports:period.custom'), value: 'custom' },
  ];

  const gelirRaporu = useCategoryReport('gelir', {
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
  });

  const giderRaporu = useCategoryReport('gider', {
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
    percentageReferenceTotal: gelirRaporu.totalAmount,
  });

  // GELİR KAYNAK kırılımı: hesaplar (banka/nakit/kk) + cari (kredili satış) + personel
  // satışları, türe göre gruplu. Yalnız Gelir görünümünde; gider tarafı kategori.
  const kaynakRaporu = useIncomeSourceReport({
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
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
      },
    });
  };

  const handleExport = () => {
    exportReport(state.dateRange.startDate, state.dateRange.endDate, state.periodLabel);
  };

  // Hesap görünümü yalnız GELİR + "hesap" kırılımında. Diğer tüm durumlar kategori
  // (gider→giderRaporu; gelir+kategori→gelirRaporu).
  const showAccounts = selectedType === 'gelir' && gelirGroupBy === 'hesap';
  const catReport = selectedType === 'gider' ? giderRaporu : gelirRaporu;

  return (
    <>
      <Stack.Screen
        options={{
          title: t('reports:titles.categoryDistribution'),
          headerBackVisible: true,
          gestureEnabled: true,
          headerRight: () => (
            <ReportExportButton
              onPress={handleExport}
              isExporting={isExporting}
              accessibilityLabel={t('reports:export.exportExcel')}
            />
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
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
                  {formatCurrency(gelirRaporu.totalAmount)}
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
                  {formatCurrency(giderRaporu.totalAmount)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

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
                        <TouchableOpacity
                          style={styles.groupHeader}
                          onPress={() => toggleGroup(group.key)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.groupHeaderLeft}>
                            {collapsed
                              ? <ChevronDown size={16} color={colors.textSecondary} />
                              : <ChevronUp size={16} color={colors.textSecondary} />}
                            <Text variant="body" style={styles.groupHeaderText}>
                              {t(`reports:incomeSource.groups.${group.key}`, { defaultValue: group.key })}
                            </Text>
                            <Text variant="caption" color="secondary">
                              ({group.items.length})
                            </Text>
                          </View>
                          <Text variant="body" style={styles.groupHeaderAmount}>
                            {formatCurrency(group.total)}
                          </Text>
                        </TouchableOpacity>
                        {!collapsed && group.items.map((item) => (
                          <IncomeSourceCard
                            key={`${item.kind}-${item.id}`}
                            item={item}
                            onPress={() => handleSourcePress(item)}
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
                  onPress={() => handleCategoryPress(item.kategori?.id || null)}
                />
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  periodFilter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
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
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  groupHeaderText: {
    fontWeight: '600',
  },
  groupHeaderAmount: {
    fontWeight: '700',
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  navBtn: {
    padding: spacing.xs,
  },
  dateLabel: {
    fontWeight: '600',
    color: colors.primary,
    minWidth: 140,
    textAlign: 'center',
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
