import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useRouter } from 'expo-router';
import { Share2, Calendar, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter, CategoryReportCard, Button } from '@/components/ui';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import { PeriodNavigator } from '@/components/reports/PeriodNavigator';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { useReportExcelExport } from '@/hooks/useReportExcelExport';
import { useCategoryReport } from '@/hooks/useCategoryReport';
import { PeriodType } from '@/hooks/useIslemler';
import { formatCurrency } from '@/lib/currency';
import { formatDateForDB } from '@/lib/date';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
type ReportType = 'gelir' | 'gider';

export default function GelirGiderRaporPage() {
  const router = useRouter();
  const { t } = useTranslation(['reports', 'common']);
  const state = useReportRouteState();
  const [selectedType, setSelectedType] = useState<ReportType>('gider');

  const { isExporting, exportReport } = useReportExcelExport(selectedType === 'gelir' ? 'gelir' : 'gider');

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

  const gelirRaporu = useCategoryReport('gelir', {
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
  });

  const giderRaporu = useCategoryReport('gider', {
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
    percentageReferenceTotal: gelirRaporu.totalAmount,
  });

  const activeReport = selectedType === 'gelir' ? gelirRaporu : giderRaporu;

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

  const handleExport = () => {
    exportReport(state.dateRange.startDate, state.dateRange.endDate, state.periodLabel);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('reports:titles.categoryDistribution'),
          headerRight: () => (
            <TouchableOpacity
              onPress={handleExport}
              disabled={isExporting}
              style={styles.headerBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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

          {/* Date Navigator + Gelir/Gider Summary Tabs */}
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

          {/* Category List */}
          <View style={styles.categoryList}>
            {activeReport.isLoading ? (
              <View style={styles.loadingContainer}>
                <SkeletonListItem />
                <SkeletonListItem />
                <SkeletonListItem />
              </View>
            ) : activeReport.items.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text variant="body" color="secondary" style={styles.emptyText}>
                  {selectedType === 'gelir'
                    ? t('reports:empty.noIncomeTransactions')
                    : t('reports:empty.noExpenseTransactions')}
                </Text>
              </View>
            ) : (
              activeReport.items.map((item, index) => (
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
                  value={showStartPicker ? state.customStartDate : state.customEndDate}
                  mode="date"
                  display="inline"
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
                {t('common:buttons.ok', { defaultValue: 'Tamam' })}
              </Button>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Custom Date Pickers - Android */}
      {Platform.OS === 'android' && showStartPicker && (
        <DateTimePicker
          value={state.customStartDate}
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
          value={state.customEndDate}
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
