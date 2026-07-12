import { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Pressable, Platform, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Calendar, X, Share2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter, CategoryReportCard, Button } from '@/components/ui';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { useCashFlowByCategory, CashFlowItem } from '@/hooks/useCashFlowByCategory';
import { useAuthContext } from '@/contexts/AuthContext';
import { PeriodType } from '@/hooks/useIslemler';
import { formatCurrency } from '@/lib/currency';
import { formatDateForDB, ensureValidDate } from '@/lib/date';
import { exportCashFlowToExcel, CashFlowExcelTranslations } from '@/lib/reportExcelExport';
import { useSettings } from '@/hooks/useSettings';
import { toErrorMessage } from '@/lib/errors';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';
import { usePagePermission } from '@/hooks/usePagePermission';

type FlowType = 'inflow' | 'outflow';

export default function NakitAkisiPage() {
  usePagePermission({ module: 'raporlar' });
  const router = useRouter();
  const { t } = useTranslation(['reports', 'common']);
  const state = useReportRouteState();
  const [selectedType, setSelectedType] = useState<FlowType>('outflow');

  // Custom date pickers
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const PERIOD_OPTIONS = [
    { label: t('reports:period.yearly'), value: 'yearly' },
    { label: t('reports:period.monthly'), value: 'monthly' },
    { label: t('reports:period.weekly'), value: 'weekly' },
    { label: t('reports:period.daily'), value: 'daily' },
    { label: t('reports:period.custom'), value: 'custom' },
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
            <TouchableOpacity
              onPress={handleExport}
              disabled={isExporting}
              style={styles.headerBtn}
              hitSlop={HIT_SLOP.md}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Share2 size={22} color={colors.text} />
              )}
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView showsVerticalScrollIndicator={false}>
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
              <View style={styles.customDateRow}>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowStartPicker(true)}
                >
                  <Calendar size={14} color={colors.primary} />
                  <Text variant="caption">{formatDateForDB(state.customStartDate)}</Text>
                </TouchableOpacity>
                <Text variant="caption" style={styles.dateSeparator}>-</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowEndPicker(true)}
                >
                  <Calendar size={14} color={colors.primary} />
                  <Text variant="caption">{formatDateForDB(state.customEndDate)}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.dateNav}>
                <TouchableOpacity
                  style={styles.navBtn}
                  onPress={() => state.setPeriodOffset(state.periodOffset - 1)}
                >
                  <ChevronLeft size={18} color={colors.primary} />
                </TouchableOpacity>
                <Text variant="body" style={styles.dateLabel}>
                  {state.periodLabel}
                </Text>
                <TouchableOpacity
                  style={styles.navBtn}
                  onPress={() => state.setPeriodOffset(state.periodOffset + 1)}
                >
                  <ChevronRight size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
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
            {cashFlow.isLoading ? (
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
      </SafeAreaView>

      {/* Custom Date Pickers - iOS */}
      {Platform.OS === 'ios' && (showStartPicker || showEndPicker) && (
        <Modal visible={showStartPicker || showEndPicker} transparent animationType="slide">
          <Pressable
            style={styles.pickerModalOverlay}
            onPress={() => { setShowStartPicker(false); setShowEndPicker(false); }}
          >
            <Pressable style={styles.pickerModalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.pickerModalHeader}>
                <Text variant="h3">
                  {showStartPicker ? t('reports:period.startDateTitle') : t('reports:period.endDateTitle')}
                </Text>
                <TouchableOpacity onPress={() => { setShowStartPicker(false); setShowEndPicker(false); }}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={{ alignItems: 'center' }}>
                <DateTimePicker
                  value={ensureValidDate(showStartPicker ? state.customStartDate : state.customEndDate)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  themeVariant="light"
                  accentColor={colors.primary}
                  locale={state.locale}
                  style={{ height: 350 }}
                  onChange={(_, date) => {
                    if (date) {
                      if (showStartPicker) {
                        const newEnd = date > state.customEndDate ? date : state.customEndDate;
                        state.setCustomStartDate(date);
                        state.setCustomEndDate(newEnd);
                      } else {
                        state.setCustomEndDate(date);
                      }
                    }
                  }}
                  minimumDate={showEndPicker ? state.customStartDate : undefined}
                  maximumDate={new Date()}
                />
              </View>
              <Button variant="primary" onPress={() => { setShowStartPicker(false); setShowEndPicker(false); }}>
                {t('common:buttons.ok')}
              </Button>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Custom Date Pickers - Android */}
      {Platform.OS === 'android' && showStartPicker && (
        <DateTimePicker
          value={ensureValidDate(state.customStartDate)}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowStartPicker(false);
            if (event.type === 'set' && date) {
              const newEnd = date > state.customEndDate ? date : state.customEndDate;
              state.setCustomStartDate(date);
              state.setCustomEndDate(newEnd);
            }
          }}
          maximumDate={new Date()}
        />
      )}
      {Platform.OS === 'android' && showEndPicker && (
        <DateTimePicker
          value={ensureValidDate(state.customEndDate)}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowEndPicker(false);
            if (event.type === 'set' && date) {
              state.setCustomEndDate(date);
            }
          }}
          minimumDate={state.customStartDate}
          maximumDate={new Date()}
        />
      )}
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
  headerBtn: {
    padding: 6,
  },
  customDateRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dateSeparator: {
    color: colors.textMuted,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: '70%',
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
});
