import { useState, useCallback, useMemo, useEffect } from 'react';
import { logEvent } from '@/lib/appEvents';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, ScrollView, StyleSheet, TouchableOpacity, Platform, Alert, RefreshControl, LayoutAnimation, UIManager } from 'react-native';
import { Stack, useRouter, Href } from 'expo-router';
import { Package, ShoppingCart, Store, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter, Card, Button } from '@/components/ui';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import { PeriodNavigator } from '@/components/reports/PeriodNavigator';
import { CustomDateRangePicker } from '@/components/reports/CustomDateRangePicker';
import { ReportExportButton } from '@/components/reports/ReportExportButton';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { useProductReport, ProductReportItem } from '@/hooks/useProductReport';
import { useAuthContext } from '@/contexts/AuthContext';
import { useSettings } from '@/hooks/useSettings';
import { PeriodType } from '@/hooks/useIslemler';
// Alış-Satış işlem tipleri (useProductReport ile uyumlu)
const PURCHASE_TYPES = ['cari_alis'];
const SALE_TYPES = ['cari_satis', 'personel_satis'];
import { formatCurrency, formatQuantity } from '@/lib/currency';
import { formatDateForDB } from '@/lib/date';
import { exportProductReportToExcel, ProductExcelTranslations } from '@/lib/reportExcelExport';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabaseHelpers';
import { IslemWithRelations } from '@/types/database';
import { toErrorMessage } from '@/lib/errors';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { usePagePermission } from '@/hooks/usePagePermission';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

type ReportDirection = 'alis' | 'satis';

export default function AlisSatisRaporPage() {
  usePagePermission({ module: 'raporlar' });
  useEffect(() => { logEvent('report_viewed', { report_type: 'purchase_sales' }); }, []);
  const router = useRouter();
  const { t } = useTranslation(['reports', 'common', 'products']);
  const state = useReportRouteState();
  const [selectedDirection, setSelectedDirection] = useState<ReportDirection>('alis');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

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

  const alisRaporu = useProductReport('alis', {
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
  });

  const satisRaporu = useProductReport('satis', {
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
  });

  const activeReport = selectedDirection === 'alis' ? alisRaporu : satisRaporu;

  const { refreshing, onRefresh } = usePullToRefresh(alisRaporu.refetch, satisRaporu.refetch);

  // Group items by category and sort
  const groupedItems = useMemo(() => {
    const items = activeReport.items;
    if (items.length === 0) return [];

    // Sort items by amount (descending)
    const sorted = [...items].sort((a, b) => b.toplamTutar - a.toplamTutar);

    // Group by category
    const groups = new Map<string, { name: string; items: ProductReportItem[]; totalAmount: number; totalAmountKdvsiz: number; totalQuantity: number }>();
    const UNCATEGORIZED_KEY = '__uncategorized__';

    for (const item of sorted) {
      const key = item.kategoriId || UNCATEGORIZED_KEY;
      const name = item.kategoriAdi || t('reports:purchaseSales.uncategorized');
      if (!groups.has(key)) {
        groups.set(key, { name, items: [], totalAmount: 0, totalAmountKdvsiz: 0, totalQuantity: 0 });
      }
      const group = groups.get(key)!;
      group.items.push(item);
      group.totalAmount += item.toplamTutar;
      group.totalAmountKdvsiz += item.toplamTutarKdvsiz;
      group.totalQuantity += item.toplamMiktar;
    }

    // Sort groups by total amount (desc), uncategorized at end
    return Array.from(groups.entries())
      .sort(([keyA, a], [keyB, b]) => {
        if (keyA === UNCATEGORIZED_KEY) return 1;
        if (keyB === UNCATEGORIZED_KEY) return -1;
        return b.totalAmount - a.totalAmount;
      })
      .map(([key, group]) => ({ key, ...group }));
  }, [activeReport.items, t]);

  const toggleCategory = (key: string) => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
        date: t('common:export.excel.date'),
        description: t('common:export.excel.description'),
        account: t('common:export.excel.accountColumn'),
        clientStaff: t('common:export.reportExcel.clientStaff'),
        sheetName: t('common:export.productExcel.sheetName'),
        fileName: t('common:export.productExcel.fileName'),
        shareDialogTitle: t('common:export.shareDialogTitle'),
        sharingNotSupported: t('common:export.sharingNotSupported'),
        noDataError: t('common:export.noDataToExport'),
      };

      // Fetch actual transactions for detailed export
      const { startDate, endDate } = state.dateRange;
      const endDateTime = new Date(endDate + 'T00:00:00');
      endDateTime.setDate(endDateTime.getDate() + 1);
      const endDateNextDay = formatDateForDB(endDateTime);

      const buildQuery = (types: string[]) => () => {
        return supabase
          .from('islemler')
          .select(`
            *,
            hesap:hesaplar!islemler_hesap_id_fkey(id,name,currency,type,is_active),
            hedef_hesap:hesaplar!islemler_hedef_hesap_id_fkey(id,name,currency,type,is_active),
            kategori:kategoriler(id,name),
            cari:cariler(id,name,type,is_active),
            personel:personel(id,first_name,last_name,is_active)
          `)
          .eq('isletme_id', isletme.id)
          .in('type', types)
          .gte('date', startDate)
          .lt('date', endDateNextDay)
          .order('date', { ascending: true });
      };

      // Detay satirlari ozet (get_product_report) ile TUTARLI olsun: pasif
      // hesap/cari/personel islemlerini disla (NULL-guvenli: yalniz is_active === false).
      const excludePassive = (islem: IslemWithRelations) => {
        if (islem.hesap?.is_active === false) return false;
        if (islem.hedef_hesap?.is_active === false) return false;
        if (islem.cari?.is_active === false) return false;
        if (islem.personel?.is_active === false) return false;
        return true;
      };

      const [purchaseTxnsRaw, saleTxnsRaw] = await Promise.all([
        fetchAllPages<IslemWithRelations>(buildQuery(PURCHASE_TYPES)),
        fetchAllPages<IslemWithRelations>(buildQuery(SALE_TYPES)),
      ]);
      const purchaseTxns = purchaseTxnsRaw.filter(excludePassive);
      const saleTxns = saleTxnsRaw.filter(excludePassive);

      await exportProductReportToExcel({
        isletmeName: isletme.name,
        startDate,
        endDate,
        periodLabel: state.periodLabel,
        purchaseItems: alisRaporu.items,
        purchaseTotal: alisRaporu.totalAmount,
        purchaseReturnTotal: alisRaporu.returnTotal,
        purchaseNet: alisRaporu.netAmount,
        saleItems: satisRaporu.items,
        saleTotal: satisRaporu.totalAmount,
        saleReturnTotal: satisRaporu.returnTotal,
        saleNet: satisRaporu.netAmount,
        purchaseTransactions: purchaseTxns,
        saleTransactions: saleTxns,
        baseCurrency,
        translations,
      });
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('common:status.error'));
    } finally {
      setIsExporting(false);
    }
  }, [isletme, alisRaporu, satisRaporu, state.dateRange, state.periodLabel, baseCurrency, t]);

  return (
    <>
      <Stack.Screen
        options={{
          title: t('reports:titles.purchaseSales'),
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

          {/* Date Navigator + Alış/Satış Summary Tabs */}
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

          {/* Return info + KDV info */}
          {(activeReport.returnTotal > 0 || activeReport.totalAmountKdvsiz > 0) && (
            <View style={styles.returnInfo}>
              {activeReport.totalAmountKdvsiz > 0 && activeReport.totalAmount !== activeReport.totalAmountKdvsiz && (
                <Text variant="caption" color="secondary">
                  {t('reports:purchaseSales.kdvExcluded')}: {formatCurrency(activeReport.totalAmountKdvsiz)}
                  {'  '}|{'  '}{t('reports:purchaseSales.kdv')}: {formatCurrency(activeReport.totalAmount - activeReport.totalAmountKdvsiz)}
                </Text>
              )}
              {activeReport.returnTotal > 0 && (
                <Text variant="caption" color="secondary">
                  {t('reports:purchaseSales.returns')}: {formatCurrency(activeReport.returnTotal)}
                </Text>
              )}
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

          {/* Product List - Grouped by Category */}
          <View style={styles.productList}>
            {activeReport.error ? (
              <View style={styles.emptyContainer}>
                <Text variant="body" color="error" style={styles.emptyText}>
                  {t('reports:empty.dataLoadError')}
                </Text>
                <Button variant="ghost" onPress={() => activeReport.refetch()}>
                  {t('common:buttons.retry')}
                </Button>
              </View>
            ) : activeReport.isLoading ? (
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
              groupedItems.map((group) => {
                const isCollapsed = collapsedCategories.has(group.key);
                const showCategoryHeader = groupedItems.length > 1;
                return (
                  <View key={group.key}>
                    {showCategoryHeader && (
                      <TouchableOpacity
                        style={styles.categoryHeader}
                        onPress={() => toggleCategory(group.key)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.categoryHeaderLeft}>
                          {isCollapsed
                            ? <ChevronDown size={16} color={colors.textSecondary} />
                            : <ChevronUp size={16} color={colors.textSecondary} />}
                          <Text variant="body" style={styles.categoryHeaderText}>
                            {group.name}
                          </Text>
                          <Text variant="caption" color="secondary">
                            ({group.items.length})
                          </Text>
                        </View>
                        <Text variant="body" style={styles.categoryHeaderAmount}>
                          {formatCurrency(group.totalAmount)}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {!isCollapsed && group.items.map((item) => (
                      <ProductReportCard
                        key={item.urunId}
                        item={item}
                        direction={selectedDirection}
                        t={t}
                        onPress={() => router.push(`/urunler/${item.urunId}` as Href)}
                      />
                    ))}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

// ---- Product Report Card ----

function ProductReportCard({
  item,
  direction,
  t,
  onPress,
}: {
  item: ProductReportItem;
  direction: ReportDirection;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onPress?: () => void;
}) {
  const barColor = direction === 'alis' ? colors.orange : colors.success;
  const IconComponent = direction === 'alis' ? ShoppingCart : Store;

  return (
    <Card style={styles.productCard} onPress={onPress}>
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
          <Text variant="caption" color="secondary">
            {t('reports:purchaseSales.quantity', {
              count: item.toplamMiktar,
              formatted: formatQuantity(item.toplamMiktar),
              unit: t(`products:units.${item.urunBirim}`),
            })}
          </Text>
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
    gap: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  categoryHeaderText: {
    fontWeight: '600',
    color: colors.textSecondary,
  },
  categoryHeaderAmount: {
    fontWeight: '700',
    color: colors.text,
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
});
