import { upperTr } from '@/lib/turkishTextUtils';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter, CategoryReportCard, Button, Screen } from '@/components/ui';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import { PeriodNavigator } from '@/components/reports/PeriodNavigator';
import { CustomDateRangePicker } from '@/components/reports/CustomDateRangePicker';
import { ReportExportButton } from '@/components/reports/ReportExportButton';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { useCashFlowByCategory, CashFlowItem } from '@/hooks/useCashFlowByCategory';
import { useAuthContext } from '@/contexts/AuthContext';
import { PeriodType } from '@/hooks/useIslemler';
import { formatCurrency } from '@/lib/currency';
import { exportCashFlowToExcel, CashFlowExcelTranslations } from '@/lib/reportExcelExport';
import { useSettings } from '@/hooks/useSettings';
import { toErrorMessage } from '@/lib/errors';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { usePagePermission } from '@/hooks/usePagePermission';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

type FlowType = 'inflow' | 'outflow';

export default function NakitAkisiPage() {
  const contentPaddingBottom = useContentBottomPadding();
  usePagePermission({ module: 'raporlar' });
  const router = useRouter();
  const { t } = useTranslation(['reports', 'common']);
  const state = useReportRouteState();
  const [selectedType, setSelectedType] = useState<FlowType>('outflow');

  const PERIOD_OPTIONS = [
    { label: upperTr(t('reports:period.yearly')), value: 'yearly' },
    { label: upperTr(t('reports:period.monthly')), value: 'monthly' },
    { label: upperTr(t('reports:period.weekly')), value: 'weekly' },
    { label: upperTr(t('reports:period.daily')), value: 'daily' },
    { label: upperTr(t('reports:period.custom')), value: 'custom' },
  ];

  const { isletme } = useAuthContext();
  const { currency: baseCurrency } = useSettings();
  const [isExporting, setIsExporting] = useState(false);

  const cashFlow = useCashFlowByCategory({
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
    limit: 100,
  });

  const activeItems = selectedType === 'inflow' ? cashFlow.allInflowItems : cashFlow.allOutflowItems;

  const { refreshing, onRefresh } = usePullToRefresh(cashFlow.refetch);

  const handleExport = useCallback(async () => {
    if (!isletme) return;
    setIsExporting(true);
    try {
      const translations: CashFlowExcelTranslations = {
        reportTitle: t('common:export.cashFlowExcel.reportTitle'),
        period: t('common:export.excel.period'),
        createdAt: t('common:export.excel.createdAt'),
        business: t('common:export.excel.business'),
        category: t('common:export.excel.category'),
        amount: t('common:export.reportExcel.amount'),
        percentage: t('common:export.cashFlowExcel.percentage'),
        transactionCount: t('common:export.reportExcel.transactionCount'),
        total: t('common:export.reportExcel.total'),
        inflow: t('common:export.cashFlowExcel.inflow'),
        outflow: t('common:export.cashFlowExcel.outflow'),
        netCashFlow: t('common:export.cashFlowExcel.netCashFlow'),
        sheetName: t('common:export.cashFlowExcel.sheetName'),
        fileName: t('common:export.cashFlowExcel.fileName'),
        shareDialogTitle: t('common:export.shareDialogTitle'),
        sharingNotSupported: t('common:export.sharingNotSupported'),
        noDataError: t('common:export.noDataToExport'),
      };
      await exportCashFlowToExcel({
        isletmeName: isletme.name,
        startDate: state.dateRange.startDate,
        endDate: state.dateRange.endDate,
        periodLabel: state.periodLabel,
        inflowItems: cashFlow.allInflowItems,
        outflowItems: cashFlow.allOutflowItems,
        totalInflow: cashFlow.totalInflow,
        totalOutflow: cashFlow.totalOutflow,
        netCashFlow: cashFlow.netCashFlow,
        baseCurrency,
        translations,
      });
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('common:status.error'));
    } finally {
      setIsExporting(false);
    }
  }, [isletme, cashFlow, state.dateRange, state.periodLabel, baseCurrency, t]);

  const handleCategoryPress = (item: CashFlowItem) => {
    const type = selectedType === 'inflow' ? 'gelir' : 'gider';
    router.push({
      pathname: '/raporlar/kategori/[id]',
      params: {
        id: item.kategori?.id || 'uncategorized',
        type,
        startDate: state.dateRange.startDate,
        endDate: state.dateRange.endDate,
        source: 'cash-flow',
      },
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('reports:cashFlow.title'),
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
      <Screen>
        <ScrollView
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
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

          {/* Date Navigator + Inflow/Outflow Summary Tabs */}
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
                  selectedType === 'inflow' && styles.summaryTabActiveInflow,
                ]}
                onPress={() => setSelectedType('inflow')}
              >
                <Text
                  variant="caption"
                  style={[
                    styles.summaryTabLabel,
                    selectedType === 'inflow' && styles.summaryTabLabelActiveInflow,
                  ]}
                >
                  {t('reports:cashFlow.inflow').toUpperCase()}
                </Text>
                <Text
                  variant="body"
                  style={[
                    styles.summaryTabAmount,
                    selectedType === 'inflow' && styles.summaryTabAmountActiveInflow,
                  ]}
                  numberOfLines={1}
                >
                  {formatCurrency(cashFlow.totalInflow)}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.summaryTab,
                  selectedType === 'outflow' && styles.summaryTabActiveOutflow,
                ]}
                onPress={() => setSelectedType('outflow')}
              >
                <Text
                  variant="caption"
                  style={[
                    styles.summaryTabLabel,
                    selectedType === 'outflow' && styles.summaryTabLabelActiveOutflow,
                  ]}
                >
                  {t('reports:cashFlow.outflow').toUpperCase()}
                </Text>
                <Text
                  variant="body"
                  style={[
                    styles.summaryTabAmount,
                    selectedType === 'outflow' && styles.summaryTabAmountActiveOutflow,
                  ]}
                  numberOfLines={1}
                >
                  {formatCurrency(cashFlow.totalOutflow)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Category List */}
          <View style={styles.categoryList}>
            {cashFlow.error ? (
              <View style={styles.emptyContainer}>
                <Text variant="body" color="error" style={styles.emptyText}>
                  {t('reports:empty.dataLoadError')}
                </Text>
                <Button variant="ghost" onPress={() => cashFlow.refetch()}>
                  {t('common:buttons.retry')}
                </Button>
              </View>
            ) : cashFlow.isLoading ? (
              <View style={styles.loadingContainer}>
                <SkeletonListItem />
                <SkeletonListItem />
                <SkeletonListItem />
              </View>
            ) : activeItems.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text variant="body" color="secondary" style={styles.emptyText}>
                  {selectedType === 'inflow'
                    ? t('reports:cashFlow.noInflow')
                    : t('reports:cashFlow.noOutflow')}
                </Text>
              </View>
            ) : (
              activeItems.map((item, index) => (
                <CategoryReportCard
                  key={item.kategori?.id || `uncategorized-${index}`}
                  item={item}
                  index={index}
                  type={selectedType === 'inflow' ? 'gelir' : 'gider'}
                  onPress={() => handleCategoryPress(item)}
                />
              ))
            )}
          </View>
        </ScrollView>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  periodFilter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  summaryBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
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
  summaryTabActiveInflow: {
    backgroundColor: colors.success + '12',
    borderColor: colors.success,
    borderWidth: 1.5,
  },
  summaryTabActiveOutflow: {
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
  summaryTabLabelActiveInflow: {
    color: colors.success,
  },
  summaryTabLabelActiveOutflow: {
    color: colors.error,
  },
  summaryTabAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
  },
  summaryTabAmountActiveInflow: {
    color: colors.success,
  },
  summaryTabAmountActiveOutflow: {
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
