import { memo, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  ArrowRight,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  Store,
  Tags,
  TrendingDown,
  TrendingUp,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TabFilter } from '@/components/ui/TabFilter';
import { Text } from '@/components/ui/Text';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import { CollapsibleGroupHeader } from '@/components/reports/CollapsibleGroupHeader';
import { colors } from '@/constants/colors';
import { borderRadius, spacing } from '@/constants/spacing';
import type {
  ProductPriceChangeItem,
  ProductPriceChangeReportResult,
  ProductPriceHistoryKind,
} from '@/hooks/useProductPriceChangeReport';
import {
  formatCurrency,
  formatCurrencyWithSign,
  formatPercent,
  formatQuantity,
} from '@/lib/currency';
import { formatDateShort } from '@/lib/date';

type PriceFilter = 'all' | 'increase' | 'decrease';
type PriceSort = 'impact' | 'percent' | 'recent';
type PriceView = 'products' | 'categories';

const INITIAL_VISIBLE_ITEM_COUNT = 15;
const UNCATEGORIZED_KEY = '__uncategorized__';

interface ProductPriceChangesViewProps {
  report: ProductPriceChangeReportResult;
  baseCurrency: string;
}

interface PriceCategoryGroup {
  key: string;
  label: string;
  items: ProductPriceChangeItem[];
  totalExtraCostBase: number;
  totalSavingsBase: number;
}

function signedMoney(value: number, currency: string): string {
  return value === 0 ? formatCurrency(0, currency) : formatCurrencyWithSign(value, currency);
}

function itemKey(item: ProductPriceChangeItem): string {
  return `${item.urunId}:${item.priceCurrency}`;
}

function historyLabelKey(kind: ProductPriceHistoryKind): string {
  return `reports:purchaseSales.priceChanges.${kind}`;
}

export function ProductPriceChangesView({
  report,
  baseCurrency,
}: ProductPriceChangesViewProps) {
  const { t } = useTranslation(['reports', 'common', 'products']);
  const [filter, setFilter] = useState<PriceFilter>('all');
  const [sort, setSort] = useState<PriceSort>('recent');
  const [view, setView] = useState<PriceView>('products');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [collapsedCategoryKeys, setCollapsedCategoryKeys] = useState<Set<string>>(
    new Set(),
  );
  const [visibleItemCount, setVisibleItemCount] = useState(INITIAL_VISIBLE_ITEM_COUNT);

  const visibleItems = useMemo(() => {
    const filtered = report.items.filter((item) => {
      if (filter === 'increase') return item.hadIncrease;
      if (filter === 'decrease') return item.hadDecrease;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sort === 'percent') {
        return Math.abs(b.periodChangePercent) - Math.abs(a.periodChangePercent);
      }
      if (sort === 'recent') {
        return Date.parse(b.lastChangeDate) - Date.parse(a.lastChangeDate);
      }
      const impactFor = (item: ProductPriceChangeItem) => {
        if (filter === 'increase') return item.extraCostBase ?? -1;
        if (filter === 'decrease') return item.estimatedSavingsBase ?? -1;
        return Math.max(item.extraCostBase ?? -1, item.estimatedSavingsBase ?? -1);
      };
      return impactFor(b) - impactFor(a);
    });
  }, [filter, report.items, sort]);

  useEffect(() => {
    setVisibleItemCount(INITIAL_VISIBLE_ITEM_COUNT);
    setExpandedKey(null);
  }, [filter, report.items, sort, view]);

  const displayedItems = useMemo(
    () => visibleItems.slice(0, visibleItemCount),
    [visibleItemCount, visibleItems],
  );
  const displayedItemKeys = useMemo(
    () => new Set(displayedItems.map(itemKey)),
    [displayedItems],
  );

  const categoryGroups = useMemo<PriceCategoryGroup[]>(() => {
    const groups = new Map<string, PriceCategoryGroup>();

    visibleItems.forEach((item) => {
      const key = item.kategoriId ?? UNCATEGORIZED_KEY;
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(item);
        existing.totalExtraCostBase += item.extraCostBase ?? 0;
        existing.totalSavingsBase += item.estimatedSavingsBase ?? 0;
        return;
      }

      groups.set(key, {
        key,
        label: item.kategoriAdi || t('reports:purchaseSales.uncategorized'),
        items: [item],
        totalExtraCostBase: item.extraCostBase ?? 0,
        totalSavingsBase: item.estimatedSavingsBase ?? 0,
      });
    });

    return Array.from(groups.values());
  }, [t, visibleItems]);

  const toggleCategory = (key: string) => {
    setCollapsedCategoryKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleKpiPress = (nextFilter: PriceFilter) => {
    if (nextFilter === 'all') {
      setFilter('all');
      return;
    }
    setFilter((current) => current === nextFilter ? 'all' : nextFilter);
  };

  if (report.error) {
    return (
      <View style={styles.emptyContainer}>
        <Text variant="body" color="error" style={styles.centeredText}>
          {t('reports:empty.dataLoadError')}
        </Text>
        <Button variant="ghost" size="sm" onPress={() => report.refetch()}>
          {t('common:buttons.retry')}
        </Button>
      </View>
    );
  }

  if (report.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <SkeletonListItem />
        <SkeletonListItem />
        <SkeletonListItem />
      </View>
    );
  }

  if (report.items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text variant="body" color="secondary" style={styles.centeredText}>
          {t('reports:purchaseSales.priceChanges.noChanges')}
        </Text>
      </View>
    );
  }

  const sortOptions: Array<{ value: PriceSort; label: string }> = [
    { value: 'impact', label: t('reports:purchaseSales.priceChanges.sortByCost') },
    { value: 'percent', label: t('reports:purchaseSales.priceChanges.sortByPercent') },
    { value: 'recent', label: t('reports:purchaseSales.priceChanges.sortByRecent') },
  ];

  return (
    <View>
      <View style={styles.kpiRow}>
        <PriceKpi
          icon={ArrowRightLeft}
          label={t('reports:purchaseSales.priceChanges.allChanges')}
          value={t('reports:purchaseSales.priceChanges.productCount', {
            count: report.changedCount,
          })}
          color={colors.infoDark}
          backgroundColor={colors.infoLight}
          active={filter === 'all'}
          onPress={() => handleKpiPress('all')}
        />
        <PriceKpi
          icon={TrendingUp}
          label={t('reports:purchaseSales.priceChanges.increased')}
          value={t('reports:purchaseSales.priceChanges.productCount', {
            count: report.increasedCount,
          })}
          detail={t('reports:purchaseSales.priceChanges.extraPaidShort', {
            amount: formatCurrency(report.totalExtraCost, baseCurrency),
          })}
          color={colors.errorDark}
          backgroundColor={colors.errorLight}
          active={filter === 'increase'}
          onPress={() => handleKpiPress('increase')}
        />
        <PriceKpi
          icon={TrendingDown}
          label={t('reports:purchaseSales.priceChanges.decreased')}
          value={t('reports:purchaseSales.priceChanges.productCount', {
            count: report.decreasedCount,
          })}
          detail={t('reports:purchaseSales.priceChanges.savingsShort', {
            amount: formatCurrency(report.totalSavings, baseCurrency),
          })}
          color={colors.successDark}
          backgroundColor={colors.successLight}
          active={filter === 'decrease'}
          onPress={() => handleKpiPress('decrease')}
        />
      </View>

      {report.conversionIncomplete && (
        <View style={styles.conversionWarning}>
          <Text variant="caption" style={styles.warningText}>
            {t('reports:purchaseSales.priceChanges.conversionIncomplete')}
          </Text>
        </View>
      )}

      <View style={styles.viewSwitch}>
        <TabFilter
          options={[
            { label: t('reports:purchaseSales.priceChanges.viewProducts'), value: 'products' },
            { label: t('reports:purchaseSales.priceChanges.viewCategories'), value: 'categories' },
          ]}
          value={view}
          onChange={(value) => setView(value as PriceView)}
        />
      </View>

      <View style={styles.sortRow}>
        <Text variant="bodySmall" style={styles.sortLabel}>
          {t('reports:purchaseSales.priceChanges.sortLabel')}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.sortScroll}
          contentContainerStyle={styles.sortControls}
        >
          {sortOptions.map((option) => (
            <FilterPill
              key={option.value}
              active={sort === option.value}
              label={option.label}
              onPress={() => setSort(option.value)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.calculationStrip}>
        <Text variant="bodySmall" color="secondary" style={styles.calculationNote}>
          {t('reports:purchaseSales.priceChanges.calculationNote')}
        </Text>
      </View>

      {visibleItems.length === 0 ? (
        <View style={styles.filteredEmptyContainer}>
          <Text variant="bodySmall" color="secondary" style={styles.centeredText}>
            {t('reports:purchaseSales.priceChanges.noFilteredResults')}
          </Text>
          <Button variant="ghost" size="sm" onPress={() => setFilter('all')}>
            {t('reports:purchaseSales.priceChanges.showAll')}
          </Button>
        </View>
      ) : (
        <>
          <View style={styles.cardList}>
            {view === 'products'
              ? displayedItems.map((item) => (
                  <ProductPriceChangeCard
                    key={itemKey(item)}
                    item={item}
                    expanded={expandedKey === itemKey(item)}
                    onToggle={() => setExpandedKey((current) => (
                      current === itemKey(item) ? null : itemKey(item)
                    ))}
                  />
                ))
              : categoryGroups.map((group) => {
                  const itemsToRender = group.items.filter((item) => (
                    displayedItemKeys.has(itemKey(item))
                  ));
                  if (itemsToRender.length === 0) return null;

                  const collapsed = collapsedCategoryKeys.has(group.key);
                  return (
                    <View key={group.key}>
                      <CollapsibleGroupHeader
                        label={group.label}
                        count={group.items.length}
                        amount={group.totalSavingsBase > group.totalExtraCostBase
                          ? t('reports:purchaseSales.priceChanges.categorySavings', {
                              amount: formatCurrency(group.totalSavingsBase, baseCurrency),
                            })
                          : t('reports:purchaseSales.priceChanges.categoryExtraCost', {
                              amount: formatCurrency(group.totalExtraCostBase, baseCurrency),
                            })}
                        collapsed={collapsed}
                        onToggle={() => toggleCategory(group.key)}
                      />
                      {!collapsed && itemsToRender.map((item) => (
                        <ProductPriceChangeCard
                          key={itemKey(item)}
                          item={item}
                          expanded={expandedKey === itemKey(item)}
                          onToggle={() => setExpandedKey((current) => (
                            current === itemKey(item) ? null : itemKey(item)
                          ))}
                        />
                      ))}
                    </View>
                  );
                })}
          </View>

          {displayedItems.length < visibleItems.length && (
            <Button
              variant="ghost"
              size="sm"
              style={styles.showMoreButton}
              onPress={() => setVisibleItemCount((current) => (
                current + INITIAL_VISIBLE_ITEM_COUNT
              ))}
            >
              {t('reports:purchaseSales.priceChanges.showMore', {
                count: visibleItems.length - displayedItems.length,
              })}
            </Button>
          )}
        </>
      )}
    </View>
  );
}

function PriceKpi({
  icon: Icon,
  label,
  value,
  color,
  backgroundColor,
  active,
  onPress,
  detail,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  color: string;
  backgroundColor: string;
  active: boolean;
  onPress: () => void;
  detail?: string;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.kpiCard,
        { backgroundColor },
        active && { borderColor: color, borderWidth: 1.5 },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={styles.kpiHeader}>
        <Icon size={18} color={color} />
        <Text variant="caption" style={[styles.kpiLabel, { color }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text
        variant="body"
        style={[styles.kpiValue, { color }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {detail && (
        <Text variant="caption" style={[styles.kpiDetail, { color }]} numberOfLines={1}>
          {detail}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function FilterPill({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.filterPill, active && styles.filterPillActive]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        variant="caption"
        style={[styles.filterPillText, active && styles.filterPillTextActive]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const ProductPriceChangeCard = memo(function ProductPriceChangeCard({
  item,
  expanded,
  onToggle,
}: {
  item: ProductPriceChangeItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation(['reports', 'products']);
  const isIncrease = item.periodChangeAmount > 0;
  const isDecrease = item.periodChangeAmount < 0;
  const changeColor = isIncrease
    ? colors.errorDark
    : isDecrease
      ? colors.successDark
      : colors.infoDark;
  const changeBackground = isIncrease
    ? colors.errorLight
    : isDecrease
      ? colors.successLight
      : colors.infoLight;
  const unitLabel = t(`products:units.${item.urunBirim}`);
  const showSavings = (
    item.periodChangeAmount < 0
    || item.estimatedSavings > item.extraCost
  );

  return (
    <Card padding="sm" variant="outlined" style={styles.priceCard}>
      <View style={styles.cardHeader}>
        <View style={[styles.productIcon, { backgroundColor: changeBackground }]}>
          {isIncrease
            ? <TrendingUp size={19} color={changeColor} />
            : isDecrease
              ? <TrendingDown size={19} color={changeColor} />
              : <ArrowRightLeft size={19} color={changeColor} />}
        </View>
        <View style={styles.cardTitleBlock}>
          <Text variant="body" style={styles.productName} numberOfLines={1}>
            {item.urunAdi}
          </Text>
          <Text variant="caption" color="secondary" style={styles.productSubtitle} numberOfLines={1}>
            {item.kategoriAdi || t('reports:purchaseSales.uncategorized')}
            {' · '}
            {t('reports:purchaseSales.priceChanges.changeCount', { count: item.changeCount })}
          </Text>
        </View>
        <View style={[styles.changeBadge, { backgroundColor: changeBackground }]}>
          <Text variant="caption" style={[styles.changeBadgeText, { color: changeColor }]}>
            {item.periodChangeAmount > 0 ? '+' : ''}
            {formatPercent(item.periodChangePercent, 1)}
          </Text>
        </View>
      </View>

      <View style={styles.priceRail}>
        <View style={styles.priceCell}>
          <Text variant="caption" color="secondary" style={styles.priceLabel}>
            {t('reports:purchaseSales.priceChanges.referencePrice')}
          </Text>
          <Text variant="body" style={styles.priceValue}>
            {formatCurrency(item.referencePrice, item.priceCurrency)}
          </Text>
        </View>
        <ArrowRight size={18} color={colors.textMuted} />
        <View style={[styles.priceCell, styles.priceCellRight]}>
          <Text variant="caption" color="secondary" style={styles.priceLabel}>
            {t('reports:purchaseSales.priceChanges.currentPrice')}
          </Text>
          <Text variant="body" style={[styles.priceValue, { color: changeColor }]}>
            {formatCurrency(item.currentPrice, item.priceCurrency)}
          </Text>
        </View>
      </View>

      <View style={styles.impactRow}>
        <View style={styles.impactCell}>
          <Text variant="caption" color="secondary" style={styles.impactLabel}>
            {t('reports:purchaseSales.priceChanges.periodChange')}
          </Text>
          <Text variant="bodySmall" style={[styles.impactValue, { color: changeColor }]}>
            {signedMoney(item.periodChangeAmount, item.priceCurrency)}
          </Text>
        </View>
        <View style={styles.impactDivider} />
        <View style={[styles.impactCell, styles.impactCellRight]}>
          <Text variant="caption" color="secondary" style={styles.impactLabel}>
            {showSavings
              ? t('reports:purchaseSales.priceChanges.estimatedSavings')
              : t('reports:purchaseSales.priceChanges.extraCost')}
          </Text>
          <Text
            variant="bodySmall"
            style={showSavings ? styles.savingsValue : styles.extraCostValue}
          >
            {formatCurrency(
              showSavings ? item.estimatedSavings : item.extraCost,
              item.priceCurrency,
            )}
          </Text>
        </View>
      </View>

      <Text variant="caption" color="secondary" style={styles.quantityLine}>
        {t(showSavings
          ? 'reports:purchaseSales.priceChanges.lowerPriceQuantityValue'
          : 'reports:purchaseSales.priceChanges.higherPriceQuantityValue', {
          quantity: formatQuantity(
            showSavings ? item.lowerPriceQuantity : item.higherPriceQuantity,
          ),
          unit: unitLabel,
        })}
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.purchaseContext}>
          {item.latestBrandName && (
            <View style={styles.brandLine}>
              <Tags size={14} color={colors.textMuted} />
              <Text variant="caption" color="secondary" numberOfLines={1} style={styles.brandName}>
                {item.latestBrandName}
              </Text>
            </View>
          )}
          <View style={styles.supplierLine}>
            <Store size={14} color={colors.textMuted} />
            <Text variant="caption" color="secondary" numberOfLines={1} style={styles.supplierName}>
              {item.latestSupplierName || '-'}
            </Text>
          </View>
        </View>
        <Text variant="caption" color="secondary" style={styles.changeDate}>
          {formatDateShort(item.lastChangeDate)}
        </Text>
      </View>

      <View style={styles.actionRow}>
        {item.supplierChanged && (
          <View style={styles.supplierBadge}>
            <Store size={13} color={colors.infoDark} />
            <Text variant="caption" style={styles.supplierBadgeText}>
              {t('reports:purchaseSales.priceChanges.supplierChanged')}
            </Text>
          </View>
        )}

        {item.brandChanged && (
          <View style={styles.brandBadge}>
            <Tags size={13} color={colors.warningDark} />
            <Text variant="caption" style={styles.brandBadgeText}>
              {t('reports:purchaseSales.priceChanges.brandChanged')}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.historyToggle}
          onPress={onToggle}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text variant="caption" style={styles.historyToggleText}>
            {expanded
              ? t('reports:purchaseSales.priceChanges.hideHistory')
              : t('reports:purchaseSales.priceChanges.showHistory')}
          </Text>
          {expanded
            ? <ChevronUp size={16} color={colors.primary} />
            : <ChevronDown size={16} color={colors.primary} />}
        </TouchableOpacity>
      </View>

      {expanded && (
        <View style={styles.historyList}>
          {item.priceHistory.map((point, index) => {
            const pointColor = point.kind === 'brand_change'
              ? colors.warningDark
              : point.changeAmount === null
                ? colors.textMuted
              : point.changeAmount >= 0
                ? colors.errorDark
                : colors.successDark;
            return (
              <View key={`${point.date}:${index}`} style={styles.historyRow}>
                <View style={[styles.historyDot, { backgroundColor: pointColor }]} />
                <View style={styles.historyInfo}>
                  <Text variant="caption" style={styles.historyLabel}>
                    {t(historyLabelKey(point.kind))}
                  </Text>
                  <Text variant="caption" color="secondary" numberOfLines={1}>
                    {formatDateShort(point.date)} · {[point.brandName, point.supplierName]
                      .filter(Boolean)
                      .join(' · ') || '-'}
                  </Text>
                </View>
                <View style={styles.historyAmount}>
                  <Text variant="bodySmall" style={styles.historyPrice}>
                    {formatCurrency(point.price, item.priceCurrency)}
                  </Text>
                  {point.changePercent !== null && (
                    <Text variant="caption" style={{ color: pointColor }}>
                      {point.changeAmount !== null && point.changeAmount > 0 ? '+' : ''}
                      {formatPercent(point.changePercent, 1)}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}, (previous, next) => (
  previous.item === next.item
  && previous.expanded === next.expanded
));

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  kpiCard: {
    flex: 1,
    minHeight: 70,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.transparent,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  kpiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  kpiLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 15,
  },
  kpiValue: {
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 20,
  },
  kpiDetail: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },
  conversionWarning: {
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  warningText: {
    color: colors.warningDark,
    fontSize: 13,
    lineHeight: 17,
  },
  viewSwitch: {
    marginBottom: spacing.sm,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sortLabel: {
    fontWeight: '700',
    color: colors.textSecondary,
  },
  sortScroll: {
    flex: 1,
  },
  sortControls: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.xs,
  },
  filterPill: {
    height: 32,
    justifyContent: 'center',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  filterPillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  filterPillText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: colors.primary,
  },
  calculationStrip: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  calculationNote: {
    fontSize: 13,
    lineHeight: 18,
  },
  cardList: {
    gap: spacing.sm,
  },
  priceCard: {
    borderColor: colors.borderLight,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  productIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleBlock: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  productSubtitle: {
    fontSize: 13,
    lineHeight: 17,
  },
  changeBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  changeBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  priceRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  priceCell: {
    flex: 1,
  },
  priceCellRight: {
    alignItems: 'flex-end',
  },
  priceLabel: {
    fontSize: 13,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 1,
  },
  impactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  impactCell: {
    flex: 1,
  },
  impactCellRight: {
    alignItems: 'flex-end',
  },
  impactDivider: {
    width: 1,
    height: 34,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  impactLabel: {
    fontSize: 13,
  },
  impactValue: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 1,
  },
  extraCostValue: {
    color: colors.orangeDark,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 1,
  },
  savingsValue: {
    color: colors.successDark,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 1,
  },
  quantityLine: {
    fontSize: 13,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  purchaseContext: {
    flex: 1,
    gap: 2,
  },
  brandLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  brandName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  supplierLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  supplierName: {
    flex: 1,
    fontSize: 13,
  },
  changeDate: {
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  supplierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 30,
    borderRadius: borderRadius.full,
    backgroundColor: colors.infoLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  supplierBadgeText: {
    color: colors.infoDark,
    fontSize: 13,
    fontWeight: '600',
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 30,
    borderRadius: borderRadius.full,
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  brandBadgeText: {
    color: colors.warningDark,
    fontSize: 13,
    fontWeight: '600',
  },
  historyToggle: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 30,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  historyToggleText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  historyList: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 42,
    gap: spacing.sm,
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  historyInfo: {
    flex: 1,
  },
  historyLabel: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },
  historyAmount: {
    alignItems: 'flex-end',
  },
  historyPrice: {
    fontSize: 14,
    fontWeight: '700',
  },
  showMoreButton: {
    marginTop: spacing.xs,
    alignSelf: 'center',
  },
  loadingContainer: {
    paddingVertical: spacing.lg,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  filteredEmptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  centeredText: {
    textAlign: 'center',
  },
});
