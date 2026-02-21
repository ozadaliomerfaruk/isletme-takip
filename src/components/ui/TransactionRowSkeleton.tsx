import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from './Skeleton';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';

export function TransactionRowSkeleton() {
  return (
    <View style={styles.container}>
      <Skeleton width={44} height={44} borderRadius={22} />
      <View style={styles.content}>
        <View style={styles.line1}>
          <Skeleton width={100} height={14} borderRadius={4} />
          <Skeleton width={50} height={12} borderRadius={4} />
        </View>
        <View style={styles.line2}>
          <Skeleton width={140} height={12} borderRadius={4} />
        </View>
      </View>
      <Skeleton width={80} height={18} borderRadius={4} />
    </View>
  );
}

export function TransactionRowSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <TransactionRowSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  content: {
    flex: 1,
    gap: 6,
  },
  line1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  line2: {
    flexDirection: 'row',
  },
});
