import { View, StyleSheet } from 'react-native';
import { TrendingDown } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Text, Card, CategoryReportCard } from '@/components/ui';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { useCategoryReport } from '@/hooks/useCategoryReport';
import type { TabContentProps } from './types';

export function GiderTabContent({ dateRange }: TabContentProps) {
  const router = useRouter();
  const { t } = useTranslation(['reports']);

  const giderRaporu = useCategoryReport('gider', {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  const handleCategoryPress = (kategoriId: string | null) => {
    const id = kategoriId || 'uncategorized';
    router.push({
      pathname: '/raporlar/kategori/[id]',
      params: {
        id,
        type: 'gider',
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      },
    });
  };

  return (
    <>
      {/* Toplam Gider */}
      <View style={styles.section}>
        <Card style={styles.totalCard}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: colors.errorLight, alignSelf: 'center' },
            ]}
          >
            <TrendingDown size={24} color={colors.error} />
          </View>
          <Text variant="caption" color="secondary" style={styles.totalLabel}>
            {t('reports:summary.totalExpense')}
          </Text>
          <Text variant="h1" color="error" style={styles.totalAmount}>
            {formatCurrency(giderRaporu.totalAmount)}
          </Text>
          <Text variant="caption" color="secondary">
            {t('reports:counts.transaction', { count: giderRaporu.items.reduce((acc, item) => acc + item.count, 0) })}
          </Text>
        </Card>
      </View>

      {/* Kategori Dagilimi */}
      <View style={styles.section}>
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          {t('reports:sections.categoryDistribution')}
        </Text>

        {giderRaporu.isLoading ? (
          <View style={styles.loadingContainer}>
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </View>
        ) : giderRaporu.items.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
              {t('reports:empty.noExpenseTransactions')}
            </Text>
          </Card>
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
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  totalCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  totalLabel: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  totalAmount: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  loadingContainer: {
    padding: spacing['2xl'],
    alignItems: 'center',
  },
  emptyCard: {
    padding: spacing.xl,
  },
});
