import { useRef, useEffect } from 'react';
import { View, Animated, StyleSheet, ViewStyle, DimensionValue } from 'react-native';

import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius: radius = borderRadius.md,
  style,
}: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
}

export function SkeletonText({ lines = 3 }: SkeletonTextProps) {
  return (
    <View style={styles.textContainer}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={14}
          width={i === lines - 1 ? '60%' : '100%'}
          style={{ marginBottom: spacing.sm }}
        />
      ))}
    </View>
  );
}

export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <Skeleton width={48} height={48} borderRadius={24} />
      <View style={styles.cardContent}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="40%" height={14} style={{ marginTop: spacing.sm }} />
      </View>
    </View>
  );
}

export function SkeletonListItem() {
  return (
    <View style={styles.listItem}>
      <Skeleton width={40} height={40} borderRadius={borderRadius.md} />
      <View style={styles.listItemContent}>
        <Skeleton width="60%" height={16} />
        <Skeleton width="30%" height={12} style={{ marginTop: spacing.xs }} />
      </View>
      <Skeleton width={60} height={16} />
    </View>
  );
}

export function SkeletonAccountList({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.accountList}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonListItem key={i} />
      ))}
    </View>
  );
}

export function SkeletonSummaryCard() {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryCardHeader}>
        <Skeleton width={100} height={14} />
        <Skeleton width={60} height={20} borderRadius={10} />
      </View>
      <Skeleton
        width={150}
        height={32}
        style={{ alignSelf: 'center', marginVertical: spacing.md }}
      />
      <Skeleton width={80} height={12} style={{ alignSelf: 'center', marginBottom: spacing.md }} />
      <Skeleton height={6} borderRadius={3} style={{ marginBottom: spacing.md }} />
      <View style={styles.summaryCardFooter}>
        <View style={styles.summaryCardFooterItem}>
          <Skeleton width={60} height={12} />
          <Skeleton width={70} height={16} style={{ marginTop: spacing.xs }} />
        </View>
        <Skeleton width={1} height={40} />
        <View style={[styles.summaryCardFooterItem, { alignItems: 'flex-end' }]}>
          <Skeleton width={60} height={12} />
          <Skeleton width={70} height={16} style={{ marginTop: spacing.xs }} />
        </View>
      </View>
    </View>
  );
}

export function SkeletonSummaryPair() {
  return (
    <View style={styles.summaryPair}>
      <View style={styles.summaryPairCard}>
        <Skeleton width={80} height={12} />
        <Skeleton width={100} height={24} style={{ marginTop: spacing.sm }} />
      </View>
      <View style={styles.summaryPairCard}>
        <Skeleton width={80} height={12} />
        <Skeleton width={100} height={24} style={{ marginTop: spacing.sm }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  textContainer: {
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  cardContent: {
    flex: 1,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    gap: spacing.md,
  },
  listItemContent: {
    flex: 1,
  },
  accountList: {
    gap: spacing.sm,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  summaryCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryCardFooterItem: {
    flex: 1,
  },
  summaryPair: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  summaryPairCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
});
