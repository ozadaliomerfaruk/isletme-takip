import { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Pressable, Platform, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack } from 'expo-router';
import { ChevronLeft, ChevronRight, Calendar, X, Package, ShoppingCart, Store, Share2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter, Card, Button } from '@/components/ui';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { useProductReport, ProductReportItem } from '@/hooks/useProductReport';
import { useAuthContext } from '@/contexts/AuthContext';
import { PeriodType } from '@/hooks/useIslemler';
import { formatCurrency } from '@/lib/currency';
import { formatDateForDB } from '@/lib/date';
import { exportProductReportToExcel, ProductExcelTranslations } from '@/lib/reportExcelExport';
import { toErrorMessage } from '@/lib/errors';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';

type ReportDirection = 'alis' | 'satis';

export default function AlisSatisRaporPage() {
  const { t } = useTranslation(['reports', 'common', 'products']);
  const state = useReportRouteState();
  const [selectedDirection, setSelectedDirection] = useState<ReportDirection>('alis');

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
  const [isExporting, setIsExporting] = useState(false);

  const alisRaporu = useProductReport('alis', {
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
  });

  const satisRaporu = useProductReport('satis', {
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
  });

  const activeReport = selectedDirection === 'alis' ? alisRaporu : satisRaporu;

  const handleExport = useCallback(async () => {
    if (!isletme) return;
    setIsExporting(true);
    try {
      const translations: ProductExcelTranslations = {
        reportTitle: t('common:export.productExcel.reportTitle'),
        period: t('common:export.excel.period'),
        createdAt: t('common:export.excel.createdAt'),
        business: t('common:export.excel.business'),
        productName: t('common:export.productExcel.productName'),
        unit: t('common:export.productExcel.unit'),
        quantity: t('common:export.productExcel.quantity'),
        category: t('common:export.excel.category'),
        amount: t('common:export.reportExcel.amount'),
        percentage: t('common:export.productExcel.percentage'),
        total: t('common:export.reportExcel.total'),
        transactionCount: t('common:export.reportExcel.transactionCount'),
        productBreakdown: t('common:export.productExcel.productBreakdown'),
        purchases: t('common:export.productExcel.purchases'),
        sales: t('common:export.productExcel.sales'),
        returns: t('common:export.productExcel.returns'),
        net: t('common:export.productExcel.net'),
        sheetName: t('common:export.productExcel.sheetName'),
        fileName: t('common:export.productExcel.fileName'),
        shareDialogTitle: t('common:export.shareDialogTitle'),
        sharingNotSupported: t('common:export.sharingNotSupported'),
      };
      await exportProductReportToExcel({
        isletmeName: isletme.name,
        startDate: state.dateRange.startDate,
        endDate: state.dateRange.endDate,
        periodLabel: state.periodLabel,
        purchaseItems: alisRaporu.items,
        purchaseTotal: alisRaporu.totalAmount,
        purchaseReturnTotal: alisRaporu.returnTotal,
        purchaseNet: alisRaporu.netAmount,
        saleItems: satisRaporu.items,
        saleTotal: satisRaporu.totalAmount,
        saleReturnTotal: satisRaporu.returnTotal,
        saleNet: satisRaporu.netAmount,
        translations,
      });
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('common:status.error'));
    } finally {
      setIsExporting(false);
    }
  }, [isletme, alisRaporu, satisRaporu, state.dateRange, state.periodLabel, t]);

  return (
    <>
      <Stack.Screen
        options={{
          title: t('reports:titles.purchaseSales'),
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

          {/* Date Navigator + Alış/Satış Summary Tabs */}
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
                  selectedDirection === 'alis' && styles.summaryTabActiveAlis,
                ]}
                onPress={() => setSelectedDirection('alis')}
              >
                <Text
                  variant="caption"
                  style={[
                    styles.summaryTabLabel,
                    selectedDirection === 'alis' && styles.summaryTabLabelActiveAlis,
                  ]}
                >
                  {t('reports:purchaseSales.purchases')}
                </Text>
                <Text
                  variant="body"
                  style={[
                    styles.summaryTabAmount,
                    selectedDirection === 'alis' && styles.summaryTabAmountActiveAlis,
                  ]}
                  numberOfLines={1}
                >
                  {formatCurrency(alisRaporu.netAmount)}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.summaryTab,
                  selectedDirection === 'satis' && styles.summaryTabActiveSatis,
                ]}
                onPress={() => setSelectedDirection('satis')}
              >
                <Text
                  variant="caption"
                  style={[
                    styles.summaryTabLabel,
                    selectedDirection === 'satis' && styles.summaryTabLabelActiveSatis,
                  ]}
                >
                  {t('reports:purchaseSales.sales')}
                </Text>
                <Text
                  variant="body"
                  style={[
                    styles.summaryTabAmount,
                    selectedDirection === 'satis' && styles.summaryTabAmountActiveSatis,
                  ]}
                  numberOfLines={1}
                >
                  {formatCurrency(satisRaporu.netAmount)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Return info */}
          {activeReport.returnTotal > 0 && (
            <View style={styles.returnInfo}>
              <Text variant="caption" color="secondary">
                {t('reports:purchaseSales.returns')}: {formatCurrency(activeReport.returnTotal)}
              </Text>
            </View>
          )}

          {/* Product Breakdown Label */}
          <View style={styles.sectionHeader}>
            <Text variant="label" color="secondary">
              {t('reports:purchaseSales.productBreakdown')}
            </Text>
            <Text variant="caption" color="secondary">
              {t('reports:counts.transaction', { count: activeReport.totalTransactions })}
            </Text>
          </View>

          {/* Product List */}
          <View style={styles.productList}>
            {activeReport.isLoading ? (
              <View style={styles.loadingContainer}>
                <SkeletonListItem />
                <SkeletonListItem />
                <SkeletonListItem />
              </View>
            ) : activeReport.items.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text variant="body" color="secondary" style={styles.emptyText}>
                  {selectedDirection === 'alis'
                    ? t('reports:purchaseSales.noPurchases')
                    : t('reports:purchaseSales.noSales')}
                </Text>
              </View>
            ) : (
              activeReport.items.map((item, index) => (
                <ProductReportCard
                  key={item.urunId}
                  item={item}
                  index={index}
                  direction={selectedDirection}
                  t={t}
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

// ---- Product Report Card ----

function ProductReportCard({
  item,
  index,
  direction,
  t,
}: {
  item: ProductReportItem;
  index: number;
  direction: ReportDirection;
  t: (key: string, opts?: any) => string;
}) {
  const barColor = direction === 'alis' ? colors.orange : colors.success;
  const IconComponent = direction === 'alis' ? ShoppingCart : Store;

  return (
    <Card style={styles.productCard}>
      <View style={styles.productRow}>
        <View style={[styles.productIcon, { backgroundColor: barColor + '18' }]}>
          {item.kategoriAdi ? (
            <Package size={20} color={barColor} />
          ) : (
            <IconComponent size={20} color={barColor} />
          )}
        </View>
        <View style={styles.productInfo}>
          <Text variant="body" numberOfLines={1}>{item.urunAdi}</Text>
          <View style={styles.productMeta}>
            <Text variant="caption" color="secondary">
              {t('reports:purchaseSales.quantity', {
                count: item.toplamMiktar,
                unit: t(`products:units.${item.urunBirim}`),
              })}
            </Text>
            {item.kategoriAdi && (
              <>
                <Text variant="caption" color="muted"> · </Text>
                <Text variant="caption" color="muted">{item.kategoriAdi}</Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.productAmount}>
          <Text variant="body" style={{ fontWeight: '700' }}>
            {formatCurrency(item.toplamTutar)}
          </Text>
          <Text variant="caption" color="secondary" style={{ textAlign: 'right' }}>
            %{item.percentage}
          </Text>
        </View>
      </View>
      {/* Percentage bar */}
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(item.percentage, 2)}%`, backgroundColor: barColor }]} />
      </View>
    </Card>
  );
}

// ---- Styles ----

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
  summaryTabActiveAlis: {
    backgroundColor: colors.orange + '12',
    borderColor: colors.orange,
    borderWidth: 1.5,
  },
  summaryTabActiveSatis: {
    backgroundColor: colors.success + '12',
    borderColor: colors.success,
    borderWidth: 1.5,
  },
  summaryTabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  summaryTabLabelActiveAlis: {
    color: colors.orange,
  },
  summaryTabLabelActiveSatis: {
    color: colors.success,
  },
  summaryTabAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
  },
  summaryTabAmountActiveAlis: {
    color: colors.orange,
  },
  summaryTabAmountActiveSatis: {
    color: colors.success,
  },
  returnInfo: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
    alignItems: 'flex-end',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  productList: {
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
  // Product Card
  productCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  productIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: {
    flex: 1,
  },
  productMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  productAmount: {
    alignItems: 'flex-end',
  },
  barTrack: {
    height: 4,
    backgroundColor: colors.surfaceLighter,
    borderRadius: 2,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
  headerBtn: {
    padding: 6,
  },
  // Custom date pickers
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
