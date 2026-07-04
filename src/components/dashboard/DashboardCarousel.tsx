import { useRef, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, FlatList, useWindowDimensions, type ViewToken } from 'react-native';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { HeroCard } from './HeroCard';
import { IncomeExpenseCard } from './IncomeExpenseCard';
import { CashFlowCard } from './CashFlowCard';

const CARD_PADDING = spacing.lg;

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
  onIncomeExpensePress?: () => void;
  // CashFlowCard
  totalInflow: number;
  totalOutflow: number;
  netCashFlow: number;
  onCashFlowPress?: () => void;
  // Shared
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
  onIncomeExpensePress,
  totalInflow,
  totalOutflow,
  netCashFlow,
  onCashFlowPress,
  periodBadge,
}: DashboardCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const listRef = useRef<FlatList<number>>(null);

  // Genişlik pencereyle birlikte güncellenmeli: iPad Split View / Mac penceresi
  // yeniden boyutlanınca modül-kapsamı Dimensions değeri bayat kalıyordu ve
  // kart viewport'tan sapıp içerik yana kaymış görünüyordu.
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = windowWidth - CARD_PADDING * 2;
  const snapInterval = cardWidth + spacing.sm;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
        activeIndexRef.current = viewableItems[0].index;
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  // Pencere genişliği değişince aktif kartın snap hizasını koru
  useEffect(() => {
    listRef.current?.scrollToOffset({
      offset: activeIndexRef.current * snapInterval,
      animated: false,
    });
  }, [snapInterval]);

  const renderItem = useCallback(({ index }: { index: number }) => {
    return (
      <View style={{ width: cardWidth }}>
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
            periodBadge={periodBadge}
            onPress={onIncomeExpensePress}
          />
        )}
        {index === 2 && (
          <CashFlowCard
            totalInflow={totalInflow}
            totalOutflow={totalOutflow}
            netCashFlow={netCashFlow}
            periodBadge={periodBadge}
            onPress={onCashFlowPress}
          />
        )}
      </View>
    );
  }, [generalStatus, assets, receivables, payables, onHeroPress, income, expense, onIncomeExpensePress, totalInflow, totalOutflow, netCashFlow, onCashFlowPress, periodBadge, cardWidth]);

  const data = useRef(Array.from({ length: CARD_COUNT }, (_, i) => i)).current;

  return (
    <View>
      <FlatList
        ref={listRef}
        data={data}
        renderItem={renderItem}
        keyExtractor={(item) => String(item)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
        decelerationRate="fast"
        contentContainerStyle={styles.listContent}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        extraData={cardWidth}
        getItemLayout={(_, index) => ({
          length: snapInterval,
          offset: snapInterval * index,
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
