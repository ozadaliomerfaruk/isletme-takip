import { useState, useEffect } from 'react';
import { logEvent } from '@/lib/appEvents';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter, CategoryReportCard, AccountReportCard, Button } from '@/components/ui';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import { PeriodNavigator } from '@/components/reports/PeriodNavigator';
import { CustomDateRangePicker } from '@/components/reports/CustomDateRangePicker';
import { ReportExportButton } from '@/components/reports/ReportExportButton';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { useReportExcelExport } from '@/hooks/useReportExcelExport';
import { useCategoryReport } from '@/hooks/useCategoryReport';
import { useAccountReport } from '@/hooks/useAccountReport';
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

  // Hesap bazlı GELİR kırılımı (hangi banka/nakit ne kadar gelir getirdi) — yalnız
  // Gelir görünümünde gösterilir; gider tarafında kategori kırılımı yeterli.
  const hesapRaporu = useAccountReport('gelir', {
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
  });

  const { refreshing, onRefresh } = usePullToRefresh(
    gelirRaporu.refetch,
    giderRaporu.refetch,
    hesapRaporu.refetch,
  );

  // Rapora GERİ DÖNÜNCE anlık tazele (ör. başka ekranda ürün kategorisi/işlem değişince).
  // İlk odak atlanır (mount zaten çeker); sonraki odaklarda stale veri yenilenir.
  useRefetchOnFocus([gelirRaporu.refetch, giderRaporu.refetch, hesapRaporu.refetch]);

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

  // Hesap kartına tıklayınca: o hesabın dönem GELİR işlemleri (drill-down)
  const handleAccountPress = (hesapId: string, hesapName: string) => {
    router.push({
      pathname: '/raporlar/hesap/[id]',
      params: {
        id: hesapId,
        hesapName,
        type: 'gelir',
        startDate: state.dateRange.startDate,
        endDate: state.dateRange.endDate,
      },
    });
  };

  const handleExport = () => {
    exportReport(state.dateRange.startDate, state.dateRange.endDate, state.periodLabel);
  };

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

          {/* GİDER → kategori kırılımı · GELİR → hesap kırılımı (hangi banka/nakit ne kadar
              gelir getirdi; hesaba tıklayınca o hesabın dönem gelir işlemleri açılır). */}
          <View style={styles.categoryList}>
            {selectedType === 'gider' ? (
              giderRaporu.error ? (
                <View style={styles.emptyContainer}>
                  <Text variant="body" color="error" style={styles.emptyText}>
                    {t('reports:empty.dataLoadError')}
                  </Text>
                  <Button variant="ghost" onPress={() => giderRaporu.refetch()}>
                    {t('common:buttons.retry')}
                  </Button>
                </View>
              ) : giderRaporu.isLoading ? (
                <View style={styles.loadingContainer}>
                  <SkeletonListItem />
                  <SkeletonListItem />
                  <SkeletonListItem />
                </View>
              ) : giderRaporu.items.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text variant="body" color="secondary" style={styles.emptyText}>
                    {t('reports:empty.noExpenseTransactions')}
                  </Text>
                </View>
              ) : (
                giderRaporu.items.map((item, index) => (
                  <CategoryReportCard
                    key={item.kategori?.id || 'uncategorized'}
                    item={item}
                    index={index}
                    type="gider"
                    onPress={() => handleCategoryPress(item.kategori?.id || null)}
                  />
                ))
              )
            ) : hesapRaporu.error ? (
              <View style={styles.emptyContainer}>
                <Text variant="body" color="error" style={styles.emptyText}>
                  {t('reports:empty.dataLoadError')}
                </Text>
                <Button variant="ghost" onPress={() => hesapRaporu.refetch()}>
                  {t('common:buttons.retry')}
                </Button>
              </View>
            ) : hesapRaporu.isLoading ? (
              <View style={styles.loadingContainer}>
                <SkeletonListItem />
                <SkeletonListItem />
                <SkeletonListItem />
              </View>
            ) : hesapRaporu.items.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text variant="body" color="secondary" style={styles.emptyText}>
                  {t('reports:empty.noAccountIncome')}
                </Text>
              </View>
            ) : (
              hesapRaporu.items.map((item) => (
                <AccountReportCard
                  key={item.hesap.id}
                  item={item}
                  type="gelir"
                  onPress={() => handleAccountPress(item.hesap.id, item.hesap.name)}
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
