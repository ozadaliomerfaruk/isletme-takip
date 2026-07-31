import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { borderRadius } from '@/constants/spacing';

export type ListEdgePosition = 'first' | 'middle' | 'last' | 'only';

export function getListEdgePosition(
  index: number,
  itemCount: number,
): ListEdgePosition {
  if (itemCount <= 1) return 'only';
  if (index === 0) return 'first';
  if (index === itemCount - 1) return 'last';
  return 'middle';
}

export function getGroupedListEdgePosition<T extends { type: string }>(
  items: readonly T[],
  index: number,
): ListEdgePosition {
  const isFirst = index === 0 || items[index - 1]?.type === 'header';
  const isLast =
    index === items.length - 1 || items[index + 1]?.type === 'header';

  if (isFirst && isLast) return 'only';
  if (isFirst) return 'first';
  if (isLast) return 'last';
  return 'middle';
}

const styles = StyleSheet.create({
  first: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  last: {
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  only: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
});

export function getListEdgeStyle(
  position: ListEdgePosition,
): StyleProp<ViewStyle> | undefined {
  if (position === 'first') return styles.first;
  if (position === 'last') return styles.last;
  if (position === 'only') return styles.only;
  return undefined;
}
