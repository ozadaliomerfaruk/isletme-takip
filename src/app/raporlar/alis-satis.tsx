import { upperTr } from '@/lib/turkishTextUtils';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { logEvent } from '@/lib/appEvents';
import { View, ScrollView, StyleSheet, TouchableOpacity, Platform, Alert, RefreshControl, LayoutAnimation, UIManager } from 'react-native';
import { Stack, useRouter, Href } from 'expo-router';
import { CircleHelp, Package, ShoppingCart, Store, TrendingUp } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter, Card, Button, Screen } from '@/components/ui';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import { CollapsibleGroupHeader } from '@/components/reports/CollapsibleGroupHeader';
import { PeriodNavigator } from '@/components/reports/PeriodNavigator';
import { CustomDateRangePicker } from '@/components/reports/CustomDateRangePicker';
import { ReportExportButton } from '@/components/reports/ReportExportButton';
import { ConversionIncompleteWarning } from '@/components/reports/ConversionIncompleteWarning';
import { ProductPriceChangesView } from '@/components/reports/ProductPriceChangesView';
import { ProductPriceChangesHelpSheet } from '@/components/reports/ProductPriceChangesHelpSheet';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { useProductReport, ProductReportItem } from '@/hooks/useProductReport';
import { useProductPriceChangeReport } from '@/hooks/useProductPriceChangeReport';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useAuthContext } from '@/contexts/AuthContext';
import { useSettings } from '@/hooks/useSettings';
import { PeriodType } from '@/hooks/useIslemler';
// Alış-Satış işlem tipleri (useProductReport ile uyumlu)
const PURCHASE_TYPES = ['cari_alis', 'cari_alis_iade'];
const SALE_TYPES = ['cari_satis', 'personel_satis', 'cari_satis_iade'];
import { formatCurrency, formatQuantity, formatPercent } from '@/lib/currency';
import { formatDateForDB } from '@/lib/date';
import {
  exportProductPriceChangeReportToExcel,
  exportProductReportToExcel,
  ProductExcelTranslations,
  ProductPriceChangeExcelTranslations,
} from '@/lib/reportExcelExport';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabaseHelpers';
import { IslemWithRelations } from '@/types/database';
import { toErrorMessage } from '@/lib/errors';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { usePermissions } from '@/hooks/usePermissions';

type ReportDirection = 'alis' | 'satis';
type ReportView = ReportDirection | 'fiyat';

// İlk etkileşimi bloklamadan diğer standart sekmenin özetini arka planda hazırla.
// Fiyat raporu belirgin şekilde daha ağır olduğu için yalnız kullanıcı açtığında çalışır.
const STANDARD_REPORT_PREFETCH_DELAY_MS = 500;

export default function AlisSatisRaporPage() {
  return <AlisSatisRaporContent />;
}

function AlisSatisRaporContent() {
  const contentPaddingBottom = useContentBottomPadding();
  useEffect(() => { logEvent('report_viewed', { report_type: 'purchase_sales' }); }, []);
  const router = useRouter();
  const { t } = useTranslation(['reports', 'common', 'products']);
  const state = useReportRouteState();
  const [selectedDirection, setSelectedDirection] = useState<ReportView>('alis');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [priceHelpVisible, setPriceHelpVisible] = useState(false);

  const PERIOD_OPTIONS = [
    { label: upperTr(t('reports:period.yearly')), value: 'yearly' },
    { label: upperTr(t('reports:period.monthly')), value: 'monthly' },
    { label: upperTr(t('reports:period.weekly')), value: 'weekly' },
    { label: upperTr(t('reports:period.daily')), value: 'daily' },
    { label: upperTr(t('reports:period.custom')), value: 'custom' },
  ];

  const { isletme, user } = useAuthContext();
  const {
    canAccessModule,
    canExportModule,
    isOwner,
  } = usePermissions();
  const canExport = canExportModule('raporlar');
  const canOpenProductDetails = canAccessModule('urunler');
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;
  const [isExporting, setIsExporting] = useState(false);
  const latestExportAccessRef = useRef({
    canExport,
    isletmeId: isletme?.id ?? null,
    userId: user?.id ?? null,
  });
  latestExportAccessRef.current = {
    canExport,
    isletmeId: isletme?.id ?? null,
    userId: user?.id ?? null,
  };

  useEffect(() => () => {
    latestExportAccessRef.current.canExport = false;
  }, []);

  const reportRangeKey = `${state.dateRange.startDate}:${state.dateRange.endDate}`;
  const [prefetchedStandardRangeKey, setPrefetchedStandardRangeKey] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (selectedDirection === 'fiyat') return;

    const timeout = setTimeout(() => {
      setPrefetchedStandardRangeKey(reportRangeKey);
    }, STANDARD_REPORT_PREFETCH_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [reportRangeKey, selectedDirection]);

  const shouldPrefetchStandardReports = (
    selectedDirection !== 'fiyat'
    && prefetchedStandardRangeKey === reportRangeKey
  );

  const alisRaporu = useProductReport('alis', {
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
    enabled: selectedDirection === 'alis' || shouldPrefetchStandardReports,
  });

  const satisRaporu = useProductReport('satis', {
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
    enabled: selectedDirection === 'satis' || shouldPrefetchStandardReports,
  });

  const fiyatRaporu = useProductPriceChangeReport({
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
    enabled: selectedDirection === 'fiyat',
  });

  const activeReport = selectedDirection === 'satis' ? satisRaporu : alisRaporu;

  const activeRefetch = selectedDirection === 'fiyat'
    ? fiyatRaporu.refetch
    : selectedDirection === 'satis'
      ? satisRaporu.refetch
      : alisRaporu.refetch;
  const { refreshing, onRefresh } = usePullToRefresh(activeRefetch);

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
    if (!isletme || !canExport) return;
    setIsExporting(true);
    try {
      const expectedIsletmeId = isletme.id;
      const expectedUserId = user?.id ?? null;
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

      const { startDate, endDate } = state.dateRange;
      if (selectedDirection === 'fiyat') {
        const latestAccess = latestExportAccessRef.current;
        if (
          !latestAccess.canExport
          || latestAccess.isletmeId !== expectedIsletmeId
          || latestAccess.userId !== expectedUserId
        ) {
          Alert.alert(
            t('common:status.error'),
            t('common:errors.permissionDenied'),
          );
          return;
        }

        const priceTranslations: ProductPriceChangeExcelTranslations = {
          reportTitle: t('common:export.priceChangeExcel.reportTitle'),
          period: t('common:export.excel.period'),
          createdAt: t('common:export.excel.createdAt'),
          business: t('common:export.excel.business'),
          productName: t('common:export.priceChangeExcel.productName'),
          unit: t('common:export.priceChangeExcel.unit'),
          currency: t('common:export.priceChangeExcel.currency'),
          referencePrice: t('common:export.priceChangeExcel.referencePrice'),
          previousPrice: t('common:export.priceChangeExcel.previousPrice'),
          currentPrice: t('common:export.priceChangeExcel.currentPrice'),
          periodChange: t('common:export.priceChangeExcel.periodChange'),
          periodChangePercent: t('common:export.priceChangeExcel.periodChangePercent'),
          higherPriceQuantity: t('common:export.priceChangeExcel.higherPriceQuantity'),
          lowerPriceQuantity: t('common:export.priceChangeExcel.lowerPriceQuantity'),
          extraCost: t('common:export.priceChangeExcel.extraCost'),
          extraCostBase: t('common:export.priceChangeExcel.extraCostBase'),
          estimatedSavings: t('common:export.priceChangeExcel.estimatedSavings'),
          estimatedSavingsBase: t('common:export.priceChangeExcel.estimatedSavingsBase'),
          changeCount: t('common:export.priceChangeExcel.changeCount'),
          lastChangeDate: t('common:export.priceChangeExcel.lastChangeDate'),
          supplier: t('common:export.priceChangeExcel.supplier'),
          supplierChanged: t('common:export.priceChangeExcel.supplierChanged'),
          brand: t('common:export.priceChangeExcel.brand'),
          brandChanged: t('common:export.priceChangeExcel.brandChanged'),
          yes: t('common:export.priceChangeExcel.yes'),
          no: t('common:export.priceChangeExcel.no'),
          total: t('common:export.priceChangeExcel.total'),
          sheetName: t('common:export.priceChangeExcel.sheetName'),
          fileName: t('common:export.priceChangeExcel.fileName'),
          shareDialogTitle: t('common:export.shareDialogTitle'),
          sharingNotSupported: t('common:export.sharingNotSupported'),
          noDataError: t('common:export.noDataToExport'),
        };

        await exportProductPriceChangeReportToExcel({
          isletmeName: isletme.name,
          startDate,
          endDate,
          periodLabel: state.periodLabel,
          items: fiyatRaporu.items,
          baseCurrency,
          translations: priceTranslations,
        });
        return;
      }

      let purchaseTxns: IslemWithRelations[] | undefined;
      let saleTxns: IslemWithRelations[] | undefined;

      if (isOwner) {
        // Owner'ın mevcut detay sayfası korunur. Shared reports-only export,
        // ek geniş SELECT çalıştırmadan ekrandaki dar product aggregate'ını yazar.
        const endDateTime = new Date(endDate + 'T00:00:00');
        endDateTime.setDate(endDateTime.getDate() + 1);
        const endDateNextDay = formatDateForDB(endDateTime);
        const buildQuery = (types: string[]) => () =>
          supabase
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
            .order('date', { ascending: true })
            .order('id', { ascending: true });

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
        purchaseTxns = purchaseTxnsRaw.filter(excludePassive);
        saleTxns = saleTxnsRaw.filter(excludePassive);
      }

      const latestAccess = latestExportAccessRef.current;
      if (
        !latestAccess.canExport
        || latestAccess.isletmeId !== expectedIsletmeId
        || latestAccess.userId !== expectedUserId
      ) {
        Alert.alert(
          t('common:status.error'),
          t('common:errors.permissionDenied'),
        );
        return;
      }

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
        exchangeRates,
        translations,
      });
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('common:status.error'));
    } finally {
      setIsExporting(false);
    }
  }, [
    isletme,
    user?.id,
    canExport,
    isOwner,
    alisRaporu,
    satisRaporu,
    fiyatRaporu.items,
    selectedDirection,
    state.dateRange,
    state.periodLabel,
    baseCurrency,
    exchangeRates,
    t,
  ]);

  return (
    <>
      <Stack.Screen
        options={{
          title: t('reports:titles.purchaseSales'),
          headerBackVisible: true,
          gestureEnabled: true,
          headerRight: () => (
            selectedDirection === 'fiyat' || canExport ? (
              <View style={styles.headerRightContainer}>
                {selectedDirection === 'fiyat' ? (
                  <TouchableOpacity
                    onPress={() => setPriceHelpVisible(true)}
                    style={styles.headerButton}
                    hitSlop={HIT_SLOP.md}
                    accessibilityRole="button"
                    accessibilityLabel={t('reports:purchaseSales.priceChanges.help.accessibilityLabel')}
                  >
                    <CircleHelp size={22} color={colors.text} />
                  </TouchableOpacity>
                ) : null}
                {canExport ? (
                  <ReportExportButton
                    onPress={handleExport}
                    isExporting={isExporting}
                    accessibilityLabel={t('reports:export.exportExcel')}
                  />
                ) : null}
              </View>
            ) : null
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
          {/* Kur bulunamadıysa toplamlar çevrilmemiş — sessiz kalmıyor */}
          <ConversionIncompleteWarning
            visible={selectedDirection !== 'fiyat' && activeReport.conversionIncomplete}
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
                  {alisRaporu.isReady ? formatCurrency(alisRaporu.netAmount) : '—'}
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
                  {satisRaporu.isReady ? formatCurrency(satisRaporu.netAmount) : '—'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.summaryTab,
                  selectedDirection === 'fiyat' && styles.summaryTabActiveFiyat,
                ]}
                onPress={() => setSelectedDirection('fiyat')}
              >
                <View style={styles.summaryTabLabelRow}>
                  <TrendingUp
                    size={12}
                    color={selectedDirection === 'fiyat' ? colors.infoDark : colors.textMuted}
                  />
                  <Text
                    variant="caption"
                    style={[
                      styles.summaryTabLabel,
                      selectedDirection === 'fiyat' && styles.summaryTabLabelActiveFiyat,
                    ]}
                  >
                    {t('reports:purchaseSales.priceChanges.tab')}
                  </Text>
                </View>
                <Text
                  variant="body"
                  style={[
                    styles.summaryTabAmount,
                    selectedDirection === 'fiyat' && styles.summaryTabAmountActiveFiyat,
                  ]}
                  numberOfLines={1}
                >
                  {fiyatRaporu.isReady
                    ? t('reports:purchaseSales.priceChanges.changedProducts', {
                        count: fiyatRaporu.changedCount,
                      })
                    : selectedDirection === 'fiyat' && fiyatRaporu.isLoading
                      ? t('reports:purchaseSales.priceChanges.calculating')
                      : t('reports:purchaseSales.priceChanges.tapToCalculate')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {selectedDirection === 'fiyat' ? (
            <View style={styles.priceChangesContainer}>
              <ProductPriceChangesView
                report={fiyatRaporu}
                baseCurrency={baseCurrency}
              />
            </View>
          ) : (
            <>
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
                      <CollapsibleGroupHeader
                        label={group.name}
                        count={group.items.length}
                        amount={formatCurrency(group.totalAmount)}
                        collapsed={isCollapsed}
                        onToggle={() => toggleCategory(group.key)}
                      />
                    )}
                    {!isCollapsed && group.items.map((item) => (
                      <ProductReportCard
                        key={item.urunId}
                        item={item}
                        direction={selectedDirection === 'satis' ? 'satis' : 'alis'}
                        t={t}
                            onPress={
                              canOpenProductDetails
                                ? () =>
                                    router.push(
                                      `/urunler/${item.urunId}` as Href,
                                    )
                                : undefined
                            }
                      />
                    ))}
                  </View>
                );
              })
            )}
          </View>
            </>
          )}
        </ScrollView>
      </Screen>
      {priceHelpVisible ? (
        <ProductPriceChangesHelpSheet
          visible
          onDismiss={() => setPriceHelpVisible(false)}
        />
      ) : null}
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
            {formatPercent(item.percentage)}
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
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.sm,
  },
  headerButton: {
    padding: spacing.xs,
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
  summaryTabActiveFiyat: {
    backgroundColor: colors.infoLight,
    borderColor: colors.info,
    borderWidth: 1.5,
  },
  summaryTabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
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
  summaryTabLabelActiveFiyat: {
    color: colors.infoDark,
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
  summaryTabAmountActiveFiyat: {
    color: colors.infoDark,
  },
  priceChangesContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
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
