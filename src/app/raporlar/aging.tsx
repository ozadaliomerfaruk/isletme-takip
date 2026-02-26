import { useState, useMemo } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Card, TabFilter, FilterChips } from '@/components/ui';
import { SkeletonSummaryPair, SkeletonAccountList } from '@/components/ui/Skeleton';
import type { FilterChipItem } from '@/components/ui/FilterChips';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { useBalanceActivityReport, type BalanceActivityItem } from '@/hooks/useBalanceActivityReport';

type ActivityFilter = 'all' | '30+' | '60+';
type SortMode = 'balance' | 'activity';
type TabMode = 'receivables' | 'payables';

export default function AgingRaporPage() {
  const { t } = useTranslation(['reports']);
  const router = useRouter();
  const { receivables, payables, summary, isLoading } = useBalanceActivityReport();

  const [tab, setTab] = useState<TabMode>('receivables');
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [sort, setSort] = useState<SortMode>('balance');

  const TAB_OPTIONS = [
    { label: `${t('reports:activity.receivables')} (${summary.receivable_count})`, value: 'receivables' },
    { label: `${t('reports:activity.payables')} (${summary.payable_count})`, value: 'payables' },
  ];

  const FILTER_CHIPS: FilterChipItem[] = [
    { key: 'all', label: t('reports:activity.filterAll') },
    { key: '30+', label: t('reports:activity.filter30') },
    { key: '60+', label: t('reports:activity.filter60') },
  ];

  const SORT_OPTIONS = [
    { label: t('reports:activity.sortBalance'), value: 'balance' },
    { label: t('reports:activity.sortActivity'), value: 'activity' },
  ];

  const items = tab === 'receivables' ? receivables : payables;

  const filteredAndSorted = useMemo(() => {
    let filtered = items;

    // Apply inactivity filter
    if (filter === '30+') {
      filtered = items.filter((item) => item.days_since_last_tx == null || item.days_since_last_tx >= 30);
    } else if (filter === '60+') {
      filtered = items.filter((item) => item.days_since_last_tx == null || item.days_since_last_tx >= 60);
    }

    // Apply sort
    const sorted = [...filtered];
    if (sort === 'balance') {
      sorted.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    } else {
      // Sort by days_since_last_tx descending (oldest first), nulls first
      sorted.sort((a, b) => {
        if (a.days_since_last_tx == null && b.days_since_last_tx == null) return 0;
        if (a.days_since_last_tx == null) return -1;
        if (b.days_since_last_tx == null) return -1;
        return b.days_since_last_tx - a.days_since_last_tx;
      });
    }

    return sorted;
  }, [items, filter, sort]);

  const handleCariPress = (item: BalanceActivityItem) => {
    router.push({
      pathname: '/cariler/[id]',
      params: { id: item.id },
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ paddingTop: spacing.md }}>
            <SkeletonSummaryPair />
            <View style={{ paddingHorizontal: spacing.lg }}>
              <SkeletonAccountList count={5} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Summary */}
        <View style={styles.summaryContainer}>
          <Card style={styles.summaryCard}>
            <Text variant="caption" color="secondary">{t('reports:activity.receivables')}</Text>
            <Text variant="h3" color="success">{formatCurrency(summary.total_receivables)}</Text>
          </Card>
          <Card style={styles.summaryCard}>
            <Text variant="caption" color="secondary">{t('reports:activity.payables')}</Text>
            <Text variant="h3" color="error">{formatCurrency(summary.total_payables)}</Text>
          </Card>
        </View>

        {/* Tab Toggle */}
        <View style={styles.tabSection}>
          <TabFilter
            options={TAB_OPTIONS}
            value={tab}
            onChange={(v) => setTab(v as TabMode)}
          />
        </View>

        {/* Filter + Sort */}
        <View style={styles.filterSection}>
          <FilterChips
            chips={FILTER_CHIPS}
            activeKey={filter}
            onChange={(key) => setFilter(key as ActivityFilter)}
          />
        </View>
        <View style={styles.sortSection}>
          <TabFilter
            options={SORT_OPTIONS}
            value={sort}
            onChange={(v) => setSort(v as SortMode)}
          />
        </View>

        {/* List */}
        {filteredAndSorted.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text variant="body" color="secondary">{t('reports:activity.noBalance')}</Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredAndSorted.map((item) => {
              const isInactive = item.days_since_last_tx != null && item.days_since_last_tx >= 30;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.listItem}
                  onPress={() => handleCariPress(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.listItemLeft}>
                    <View style={styles.listItemNameRow}>
                      <Text variant="body" style={styles.listItemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {isInactive && (
                        <AlertTriangle size={14} color={colors.warning} />
                      )}
                    </View>
                    <Text variant="caption" color="secondary">
                      {item.days_since_last_tx != null
                        ? t('reports:activity.lastActivity', { days: item.days_since_last_tx })
                        : t('reports:activity.noActivity')
                      }
                    </Text>
                  </View>
                  <Text
                    variant="body"
                    color={item.balance > 0 ? 'success' : 'error'}
                    style={styles.listItemBalance}
                  >
                    {formatCurrency(Math.abs(item.balance))}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  tabSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  filterSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  sortSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  emptyContainer: {
    paddingVertical: spacing.xl * 2,
    alignItems: 'center',
  },
  listContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    paddingBottom: spacing.xl,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listItemLeft: {
    flex: 1,
    marginRight: spacing.md,
    gap: 2,
  },
  listItemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  listItemName: {
    fontWeight: '600',
    flexShrink: 1,
  },
  listItemBalance: {
    fontWeight: '700',
    fontSize: 15,
  },
});
