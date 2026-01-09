import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ChevronRight, ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { Text, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { useCashFlowByCategory, CashFlowItem } from '@/hooks/useCashFlowByCategory';

export default function NakitAkisiPage() {
  const router = useRouter();
  const { startDate, endDate } = useLocalSearchParams<{
    startDate: string;
    endDate: string;
  }>();

  const {
    allOutflowItems,
    allInflowItems,
    totalInflow,
    totalOutflow,
    netCashFlow,
    isLoading,
  } = useCashFlowByCategory({
    startDate: startDate || '',
    endDate: endDate || '',
    limit: 100, // Tüm kategoriler
  });

  const handleCategoryPress = (item: CashFlowItem, type: 'gelir' | 'gider') => {
    if (!item.kategori) return;

    router.push({
      pathname: '/raporlar/kategori/[id]',
      params: {
        id: item.kategori.id,
        type,
        startDate,
        endDate,
      },
    } as any);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Nakit Akışı' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const renderCategoryItem = (item: CashFlowItem, index: number, type: 'gelir' | 'gider') => (
    <TouchableOpacity
      key={item.kategori?.id || `uncategorized-${type}-${index}`}
      style={styles.categoryCard}
      onPress={() => handleCategoryPress(item, type)}
      activeOpacity={item.kategori ? 0.7 : 1}
      disabled={!item.kategori}
    >
      <View style={styles.categoryRow}>
        <View style={[styles.colorDot, { backgroundColor: item.color }]} />
        <View style={styles.categoryInfo}>
          <Text variant="body" numberOfLines={1}>
            {item.kategori?.name || 'Kategorisiz'}
          </Text>
          <Text variant="caption" color="secondary">
            %{item.percentage.toFixed(1)}
          </Text>
        </View>
        <View style={styles.amountContainer}>
          <Text variant="label" color={type === 'gelir' ? 'success' : 'error'}>
            {formatCurrency(item.total)}
          </Text>
          {item.kategori && (
            <ChevronRight size={16} color={colors.textMuted} />
          )}
        </View>
      </View>
      {/* Progress bar */}
      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBar,
            { width: `${item.percentage}%`, backgroundColor: item.color },
          ]}
        />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Nakit Akışı',
          headerBackTitle: 'Geri',
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Ana Özet Kartı */}
        <Card style={styles.summaryCard}>
          <Text variant="caption" color="secondary" style={styles.summaryLabel}>
            Net Nakit Akışı
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
                <Text variant="caption" color="secondary">Nakit Giriş</Text>
                <Text variant="body" color="success" style={styles.summaryDetailValue}>
                  {formatCurrency(totalInflow)}
                </Text>
              </View>
            </View>

            <View style={styles.summaryDetailDivider} />

            <View style={[styles.summaryDetailItem, { alignItems: 'flex-end' }]}>
              <View>
                <Text variant="caption" color="secondary" style={{ textAlign: 'right' }}>Nakit Çıkış</Text>
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

        {/* Nakit Giriş Dağılımı */}
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          NAKİT GİRİŞ DAĞILIMI ({allInflowItems.length} KATEGORİ)
        </Text>

        {allInflowItems.length > 0 ? (
          allInflowItems.map((item, index) => renderCategoryItem(item, index, 'gelir'))
        ) : (
          <View style={styles.emptyContainer}>
            <Text variant="body" color="secondary">
              Bu dönemde nakit girişi bulunamadı
            </Text>
          </View>
        )}

        {/* Nakit Çıkış Dağılımı */}
        <Text variant="label" color="secondary" style={[styles.sectionTitle, { marginTop: spacing.xl }]}>
          NAKİT ÇIKIŞ DAĞILIMI ({allOutflowItems.length} KATEGORİ)
        </Text>

        {allOutflowItems.length > 0 ? (
          allOutflowItems.map((item, index) => renderCategoryItem(item, index, 'gider'))
        ) : (
          <View style={styles.emptyContainer}>
            <Text variant="body" color="secondary">
              Bu dönemde nakit çıkışı bulunamadı
            </Text>
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
  categoryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.sm,
  },
  categoryInfo: {
    flex: 1,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: colors.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  emptyContainer: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
});
