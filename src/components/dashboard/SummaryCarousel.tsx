import { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { CashFlowCard } from './CashFlowCard';
import { colors } from '@/constants/colors';
import { formatCurrency } from '@/lib/currency';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 16;
const CARD_WIDTH = SCREEN_WIDTH - CARD_PADDING * 2;

interface SummaryCarouselProps {
  // Genel Durum
  assets: number;
  receivables: number;
  payables: number;
  generalStatus: number;
  // Gelir/Gider
  income: number;
  expense: number;
  periodLabel: string;
  // Nakit Akışı (4. kart)
  totalInflow?: number;
  totalOutflow?: number;
  netCashFlow?: number;
  // Tarih parametreleri (nakit akışı detay sayfası için)
  startDate?: string;
  endDate?: string;
}

export function SummaryCarousel({
  assets,
  receivables,
  payables,
  generalStatus,
  income,
  expense,
  periodLabel,
  totalInflow = 0,
  totalOutflow = 0,
  netCashFlow = 0,
  startDate,
  endDate,
}: SummaryCarouselProps) {
  const { t } = useTranslation(['common']);
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Memoize calculations to avoid re-computing on every render
  const calculations = useMemo(() => {
    const netProfit = income - expense;
    const netBalance = receivables - payables;

    // Calculate percentages for progress bars
    const totalAssetReceivable = assets + receivables;
    const totalAll = totalAssetReceivable + payables;
    const positivePercent = totalAll > 0 ? (totalAssetReceivable / totalAll) * 100 : 50;

    const totalFlow = income + expense;
    const incomePercent = totalFlow > 0 ? (income / totalFlow) * 100 : 50;

    const totalDebtCredit = receivables + payables;
    const receivablesPercent = totalDebtCredit > 0 ? (receivables / totalDebtCredit) * 100 : 50;

    return { netProfit, netBalance, positivePercent, incomePercent, receivablesPercent };
  }, [income, expense, receivables, payables, assets]);

  const { netProfit, netBalance, positivePercent, incomePercent, receivablesPercent } = calculations;

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / CARD_WIDTH);
    if (newIndex !== activeIndex && newIndex >= 0 && newIndex <= 3) {
      setActiveIndex(newIndex);
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync();
      }
    }
  }, [activeIndex]);

  const scrollToIndex = useCallback((index: number) => {
    scrollViewRef.current?.scrollTo({ x: index * CARD_WIDTH, animated: true });
    setActiveIndex(index);
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Page 1: Genel Durum */}
        <View style={[styles.page, { width: CARD_WIDTH }]}>
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/raporlar')}
            activeOpacity={0.8}
          >
            {/* Header */}
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{t('common:dashboard.generalStatus')}</Text>
              <Text style={styles.periodBadge}>{t('common:period.instant')}</Text>
            </View>

            {/* Main Value */}
            <View style={styles.mainValue}>
              <Text style={[
                styles.bigNumber,
                { color: generalStatus >= 0 ? colors.success : colors.error }
              ]}>
                {generalStatus >= 0 ? '+' : ''}{formatCurrency(generalStatus)}
              </Text>
              <Text style={styles.mainLabel}>{t('common:dashboard.netWorth')}</Text>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, styles.progressGreen, { width: `${positivePercent}%` }]} />
                <View style={[styles.progressFill, styles.progressRed, { width: `${100 - positivePercent}%` }]} />
              </View>
            </View>

            {/* Details Row - 3 columns */}
            <View style={styles.detailsRowThree}>
              <View style={styles.detailItemThree}>
                <View style={styles.detailHeader}>
                  <View style={[styles.dotIndicator, { backgroundColor: colors.success }]} />
                  <Text style={styles.detailLabel}>{t('common:dashboard.accounts')}</Text>
                </View>
                <Text style={[styles.detailValueSmall, { color: colors.success }]}>
                  {formatCurrency(assets)}
                </Text>
              </View>

              <View style={styles.detailDivider} />

              <View style={styles.detailItemThree}>
                <View style={styles.detailHeader}>
                  <View style={[styles.dotIndicator, { backgroundColor: colors.info }]} />
                  <Text style={styles.detailLabel}>{t('common:dashboard.receivables')}</Text>
                </View>
                <Text style={[styles.detailValueSmall, { color: colors.info }]}>
                  {formatCurrency(receivables)}
                </Text>
              </View>

              <View style={styles.detailDivider} />

              <View style={[styles.detailItemThree, styles.detailItemRight]}>
                <View style={styles.detailHeader}>
                  <Text style={styles.detailLabel}>{t('common:dashboard.payables')}</Text>
                  <View style={[styles.dotIndicator, { backgroundColor: colors.error }]} />
                </View>
                <Text style={[styles.detailValueSmall, { color: colors.error }]}>
                  {formatCurrency(payables)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Page 2: Nakit Akışı (Gelir & Gider) */}
        <View style={[styles.page, { width: CARD_WIDTH }]}>
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/raporlar?tab=gider')}
            activeOpacity={0.8}
          >
            {/* Header */}
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{t('common:dashboard.incomeExpense')}</Text>
              <Text style={styles.periodBadge}>{periodLabel}</Text>
            </View>

            {/* Main Value */}
            <View style={styles.mainValue}>
              <Text style={[
                styles.bigNumber,
                { color: netProfit >= 0 ? colors.success : colors.error }
              ]}>
                {netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit)}
              </Text>
              <Text style={styles.mainLabel}>{t('common:dashboard.netProfitLoss')}</Text>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, styles.progressGreen, { width: `${incomePercent}%` }]} />
                <View style={[styles.progressFill, styles.progressRed, { width: `${100 - incomePercent}%` }]} />
              </View>
            </View>

            {/* Details Row */}
            <View style={styles.detailsRow}>
              <View style={styles.detailItem}>
                <View style={styles.detailHeader}>
                  <View style={[styles.dotIndicator, { backgroundColor: colors.success }]} />
                  <Text style={styles.detailLabel}>{t('common:dashboard.income')}</Text>
                </View>
                <Text style={[styles.detailValue, { color: colors.success }]}>
                  {formatCurrency(income)}
                </Text>
              </View>

              <View style={styles.detailDivider} />

              <View style={[styles.detailItem, styles.detailItemRight]}>
                <View style={styles.detailHeader}>
                  <Text style={styles.detailLabel}>{t('common:dashboard.expense')}</Text>
                  <View style={[styles.dotIndicator, { backgroundColor: colors.error }]} />
                </View>
                <Text style={[styles.detailValue, { color: colors.error }]}>
                  {formatCurrency(expense)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Page 3: Cari Durum (Alacaklar & Borçlar) */}
        <View style={[styles.page, { width: CARD_WIDTH }]}>
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/(tabs)/cariler')}
            activeOpacity={0.8}
          >
            {/* Header */}
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{t('common:dashboard.clientStatus')}</Text>
              <Text style={styles.periodBadge}>{t('common:dashboard.total')}</Text>
            </View>

            {/* Main Value */}
            <View style={styles.mainValue}>
              <Text style={[
                styles.bigNumber,
                { color: netBalance >= 0 ? colors.info : colors.warning }
              ]}>
                {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance)}
              </Text>
              <Text style={styles.mainLabel}>{t('common:dashboard.netBalance')}</Text>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, styles.progressBlue, { width: `${receivablesPercent}%` }]} />
                <View style={[styles.progressFill, styles.progressOrange, { width: `${100 - receivablesPercent}%` }]} />
              </View>
            </View>

            {/* Details Row */}
            <View style={styles.detailsRow}>
              <View style={styles.detailItem}>
                <View style={styles.detailHeader}>
                  <View style={[styles.dotIndicator, { backgroundColor: colors.info }]} />
                  <Text style={styles.detailLabel}>{t('common:dashboard.receivables')}</Text>
                </View>
                <Text style={[styles.detailValue, { color: colors.info }]}>
                  {formatCurrency(receivables)}
                </Text>
              </View>

              <View style={styles.detailDivider} />

              <View style={[styles.detailItem, styles.detailItemRight]}>
                <View style={styles.detailHeader}>
                  <Text style={styles.detailLabel}>{t('common:dashboard.payables')}</Text>
                  <View style={[styles.dotIndicator, { backgroundColor: colors.warning }]} />
                </View>
                <Text style={[styles.detailValue, { color: colors.warning }]}>
                  {formatCurrency(payables)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Page 4: Cash Flow */}
        <View style={[styles.page, { width: CARD_WIDTH }]}>
          <CashFlowCard
            totalInflow={totalInflow}
            totalOutflow={totalOutflow}
            netCashFlow={netCashFlow}
            periodLabel={periodLabel}
            onPress={() => router.push({
              pathname: '/nakit-akisi',
              params: startDate && endDate ? { startDate, endDate } : undefined,
            })}
          />
        </View>
      </ScrollView>

      {/* Dot Indicators */}
      <View style={styles.pagination}>
        {[0, 1, 2, 3].map((index) => (
          <TouchableOpacity
            key={index}
            onPress={() => scrollToIndex(index)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View
              style={[
                styles.dot,
                activeIndex === index && styles.dotActive,
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: CARD_PADDING,
  },
  page: {
    paddingRight: 0,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    marginRight: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  periodBadge: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  mainValue: {
    alignItems: 'center',
    marginBottom: 16,
  },
  bigNumber: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 4,
  },
  mainLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  progressFill: {
    height: '100%',
  },
  progressGreen: {
    backgroundColor: colors.success,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
  },
  progressRed: {
    backgroundColor: colors.error,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  progressBlue: {
    backgroundColor: colors.info,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
  },
  progressOrange: {
    backgroundColor: colors.warning,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsRowThree: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailItem: {
    flex: 1,
  },
  detailItemThree: {
    flex: 1,
    alignItems: 'center',
  },
  detailItemRight: {
    alignItems: 'flex-end',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  dotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  detailValueSmall: {
    fontSize: 15,
    fontWeight: '600',
  },
  detailDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 18,
    borderRadius: 3,
  },
});
