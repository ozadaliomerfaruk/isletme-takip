import { View, FlatList, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react-native';
import { Text, Card } from '@/components/ui';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';
import { useCategoryReport } from '@/hooks/useCategoryReport';

interface QuickInsightsProps {
  dateRange: { startDate: string; endDate: string };
}

interface InsightItem {
  id: string;
  label: string;
  value: string;
  color: string;
  icon: typeof TrendingUp;
}

export function QuickInsights({ dateRange }: QuickInsightsProps) {
  const { t } = useTranslation(['reports']);
  const summary = useFinancialSummary();
  const categoryReport = useCategoryReport('gider', dateRange);

  const isLoading = summary.isLoading || categoryReport.isLoading;

  const generalStatus = summary.generalStatus;
  const topExpenseCategory = categoryReport.items.length > 0 ? categoryReport.items[0] : null;

  const insights: InsightItem[] = [
    {
      id: 'net',
      label: t('reports:home.netPosition'),
      value: `${generalStatus >= 0 ? '+' : ''}${formatCurrency(generalStatus)}`,
      color: generalStatus >= 0 ? colors.success : colors.error,
      icon: generalStatus >= 0 ? TrendingUp : TrendingDown,
    },
    {
      id: 'topExpense',
      label: topExpenseCategory
        ? t('reports:home.topExpense', { category: topExpenseCategory.kategori?.name ?? t('reports:category.uncategorized') })
        : t('reports:home.topExpense', { category: '-' }),
      value: topExpenseCategory ? formatCurrency(topExpenseCategory.total) : '-',
      color: colors.error,
      icon: ArrowDownRight,
    },
    {
      id: 'receivables',
      label: t('reports:home.totalReceivables'),
      value: formatCurrency(summary.receivables.total),
      color: colors.success,
      icon: ArrowUpRight,
    },
    {
      id: 'payables',
      label: t('reports:home.totalPayables'),
      value: formatCurrency(summary.payables.total),
      color: colors.warning,
      icon: ArrowDownRight,
    },
  ];

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text variant="label" color="secondary" style={styles.title}>
          {t('reports:home.quickInsights')}
        </Text>
        <View style={[styles.listContent, { flexDirection: 'row' }]}>
          {[1, 2, 3].map((i) => (
            <Card key={i} style={styles.card}>
              <Skeleton width={28} height={28} borderRadius={14} />
              <Skeleton width={100} height={12} borderRadius={4} style={{ marginTop: spacing.xs }} />
              <Skeleton width={70} height={16} borderRadius={4} style={{ marginTop: spacing.xs }} />
            </Card>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="label" color="secondary" style={styles.title}>
        {t('reports:home.quickInsights')}
      </Text>
      <FlatList
        data={insights}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const Icon = item.icon;
          return (
            <Card style={styles.card}>
              <View style={[styles.iconContainer, { backgroundColor: item.color + '15' }]}>
                <Icon size={16} color={item.color} />
              </View>
              <Text variant="caption" color="secondary" numberOfLines={1} style={styles.label}>
                {item.label}
              </Text>
              <Text variant="body" style={[styles.value, { color: item.color }]}>
                {item.value}
              </Text>
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  title: {
    marginBottom: spacing.sm,
    marginLeft: spacing.lg,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  card: {
    width: 150,
    padding: spacing.md,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    marginBottom: spacing.xs,
  },
  value: {
    fontWeight: '700',
    fontSize: 15,
  },
});
