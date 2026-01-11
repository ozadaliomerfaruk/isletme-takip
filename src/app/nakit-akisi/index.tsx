import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, CreditCard } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Card, CategoryReportCard } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { useCashFlowByCategory, CashFlowItem } from '@/hooks/useCashFlowByCategory';

export default function NakitAkisiPage() {
  const { t } = useTranslation(['common']);
  const router = useRouter();
  const { startDate, endDate } = useLocalSearchParams<{
    startDate: string;
    endDate: string;
  }>();

  const {
    allOutflowItems,
    allInflowItems,
    allCreditCardSpendingItems,
    totalInflow,
    totalOutflow,
    totalCreditCardSpending,
    netCashFlow,
    isLoading,
  } = useCashFlowByCategory({
    startDate: startDate || '',
    endDate: endDate || '',
    limit: 100, // Tüm kategoriler
  });

  const handleCategoryPress = (item: CashFlowItem, type: 'gelir' | 'gider') => {
    router.push({
      pathname: '/raporlar/kategori/[id]',
      params: {
        id: item.kategori?.id || 'uncategorized',
        type,
        startDate,
        endDate,
        source: 'cash-flow', // Nakit akışı kaynaklı - tüm para çıkışlarını göster
      },
    } as any);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Ana Özet Kartı */}
        <Card style={styles.summaryCard}>
          <Text variant="caption" color="secondary" style={styles.summaryLabel}>
            {t('common:dashboard.netCashFlow')}
          </Text>
          <Text
            variant="h1"
            color={netCashFlow >= 0 ? 'success' : 'error'}
            style={styles.summaryValue}
          >
            {netCashFlow >= 0 ? '+' : ''}{formatCurrency(netCashFlow)}
          </Text>

          {/* Progress Bar */}
          <View style={styles.summaryProgressContainer}>
            <View style={styles.summaryProgressBar}>
              <View
                style={[
                  styles.summaryProgressFill,
                  styles.progressGreen,
                  { width: `${totalInflow + totalOutflow > 0 ? (totalInflow / (totalInflow + totalOutflow)) * 100 : 50}%` },
                ]}
              />
              <View
                style={[
                  styles.summaryProgressFill,
                  styles.progressRed,
                  { width: `${totalInflow + totalOutflow > 0 ? (totalOutflow / (totalInflow + totalOutflow)) * 100 : 50}%` },
                ]}
              />
            </View>
          </View>

          {/* Giriş/Çıkış Detayları */}
          <View style={styles.summaryDetails}>
            <View style={styles.summaryDetailItem}>
              <View style={styles.summaryDetailIcon}>
                <ArrowDownLeft size={18} color={colors.success} />
              </View>
              <View>
                <Text variant="caption" color="secondary">{t('common:dashboard.cashInflow')}</Text>
                <Text variant="body" color="success" style={styles.summaryDetailValue}>
                  {formatCurrency(totalInflow)}
                </Text>
              </View>
            </View>

            <View style={styles.summaryDetailDivider} />

            <View style={[styles.summaryDetailItem, { alignItems: 'flex-end' }]}>
              <View>
                <Text variant="caption" color="secondary" style={{ textAlign: 'right' }}>{t('common:dashboard.cashOutflow')}</Text>
                <Text variant="body" color="error" style={styles.summaryDetailValue}>
                  {formatCurrency(totalOutflow)}
                </Text>
              </View>
              <View style={styles.summaryDetailIcon}>
                <ArrowUpRight size={18} color={colors.error} />
              </View>
            </View>
          </View>
        </Card>

        {/* Cash Inflow Distribution */}
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          {t('common:dashboard.inflowDistributionCount', { count: allInflowItems.length })}
        </Text>

        {allInflowItems.length > 0 ? (
          allInflowItems.map((item, index) => (
            <CategoryReportCard
              key={item.kategori?.id || `uncategorized-gelir-${index}`}
              item={item}
              index={index}
              type="gelir"
              onPress={() => handleCategoryPress(item, 'gelir')}
            />
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Text variant="body" color="secondary">
              {t('common:dashboard.noInflowInPeriod')}
            </Text>
          </View>
        )}

        {/* Cash Outflow Distribution */}
        <Text variant="label" color="secondary" style={[styles.sectionTitle, { marginTop: spacing.xl }]}>
          {t('common:dashboard.outflowDistributionCount', { count: allOutflowItems.length })}
        </Text>

        {allOutflowItems.length > 0 ? (
          allOutflowItems.map((item, index) => (
            <CategoryReportCard
              key={item.kategori?.id || `uncategorized-gider-${index}`}
              item={item}
              index={index}
              type="gider"
              onPress={() => handleCategoryPress(item, 'gider')}
            />
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Text variant="body" color="secondary">
              {t('common:dashboard.noOutflowInPeriod')}
            </Text>
          </View>
        )}

        {/* Credit Card Spending Distribution */}
        {allCreditCardSpendingItems.length > 0 && (
          <>
            <View style={styles.creditCardSectionHeader}>
              <CreditCard size={20} color={colors.warning} />
              <Text variant="label" color="secondary" style={styles.creditCardSectionTitle}>
                {t('common:dashboard.creditCardSpendingCount', { count: allCreditCardSpendingItems.length })}
              </Text>
            </View>
            <Card style={styles.creditCardSummaryCard}>
              <Text variant="caption" color="secondary">{t('common:dashboard.totalCreditCardSpending')}</Text>
              <Text variant="h3" color="warning" style={styles.creditCardTotal}>
                {formatCurrency(totalCreditCardSpending)}
              </Text>
            </Card>
            {allCreditCardSpendingItems.map((item, index) => (
              <CategoryReportCard
                key={item.kategori?.id || `uncategorized-cc-${index}`}
                item={item}
                index={index}
                type="gider"
                onPress={() => handleCategoryPress(item, 'gider')}
              />
            ))}
          </>
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
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  summaryCard: {
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  summaryLabel: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  summaryValue: {
    textAlign: 'center',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  summaryProgressContainer: {
    marginBottom: spacing.md,
  },
  summaryProgressBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  summaryProgressFill: {
    height: '100%',
  },
  progressGreen: {
    backgroundColor: colors.success,
  },
  progressRed: {
    backgroundColor: colors.error,
  },
  summaryDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  summaryDetailIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryDetailValue: {
    fontWeight: '600',
  },
  summaryDetailDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  sectionTitle: {
    marginLeft: spacing.xs,
    marginBottom: spacing.sm,
  },
  emptyContainer: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  creditCardSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginLeft: spacing.xs,
    marginBottom: spacing.sm,
  },
  creditCardSectionTitle: {
    flex: 1,
  },
  creditCardSummaryCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.warningLight + '30',
    borderColor: colors.warning,
    borderWidth: 1,
  },
  creditCardTotal: {
    fontWeight: '600',
    marginTop: spacing.xs,
  },
});
