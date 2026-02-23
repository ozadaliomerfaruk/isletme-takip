import { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, Dimensions, type ViewToken } from 'react-native';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { HeroCard } from './HeroCard';
import { IncomeExpenseCard } from './IncomeExpenseCard';
import { CashFlowCard } from './CashFlowCard';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_PADDING = spacing.lg;
const CARD_WIDTH = SCREEN_WIDTH - CARD_PADDING * 2;

interface DashboardCarouselProps {
  // HeroCard
  generalStatus: number;
  assets: number;
  receivables: number;
  payables: number;
  onHeroPress?: () => void;
  // IncomeExpenseCard
  income: number;
  expense: number;
  // CashFlowCard
  totalInflow: number;
  totalOutflow: number;
  netCashFlow: number;
  // Shared
  startDate?: string;
  endDate?: string;
  periodBadge?: string;
}

const CARD_COUNT = 3;

export function DashboardCarousel({
  generalStatus,
  assets,
  receivables,
  payables,
  onHeroPress,
  income,
  expense,
  totalInflow,
  totalOutflow,
  netCashFlow,
  startDate,
  endDate,
  periodBadge,
}: DashboardCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderItem = useCallback(({ index }: { index: number }) => {
    return (
      <View style={styles.cardContainer}>
        {index === 0 && (
          <HeroCard
            generalStatus={generalStatus}
            assets={assets}
            receivables={receivables}
            payables={payables}
            onPress={onHeroPress}
          />
        )}
        {index === 1 && (
          <IncomeExpenseCard
            income={income}
            expense={expense}
            startDate={startDate}
            endDate={endDate}
            periodBadge={periodBadge}
          />
        )}
        {index === 2 && (
          <CashFlowCard
            totalInflow={totalInflow}
            totalOutflow={totalOutflow}
            netCashFlow={netCashFlow}
            startDate={startDate}
            endDate={endDate}
            periodBadge={periodBadge}
          />
        )}
      </View>
    );
  }, [generalStatus, assets, receivables, payables, onHeroPress, income, expense, totalInflow, totalOutflow, netCashFlow, startDate, endDate, periodBadge]);

  const data = useRef(Array.from({ length: CARD_COUNT }, (_, i) => i)).current;

  return (
    <View>
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item) => String(item)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + spacing.sm}
        decelerationRate="fast"
        contentContainerStyle={styles.listContent}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: CARD_WIDTH + spacing.sm,
          offset: (CARD_WIDTH + spacing.sm) * index,
          index,
        })}
      />

      {/* Dot Indicators */}
      <View style={styles.dots}>
        {Array.from({ length: CARD_COUNT }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === activeIndex ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: CARD_PADDING,
    gap: spacing.sm,
  },
  cardContainer: {
    width: CARD_WIDTH,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  dot: {
    borderRadius: 4,
    height: 6,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.primary,
  },
  dotInactive: {
    width: 6,
    backgroundColor: colors.border,
  },
});
