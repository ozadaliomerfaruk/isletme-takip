import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, shadows } from '@/constants/spacing';
import { AnimatedPressable } from './AnimatedPressable';

interface CardProps {
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function Card({
  variant = 'default',
  padding = 'md',
  onPress,
  style,
  children,
}: CardProps) {
  const cardStyle: StyleProp<ViewStyle> = [
    styles.base,
    variant === 'elevated' && [styles.elevated, shadows.md],
    variant === 'outlined' && styles.outlined,
    padding === 'sm' && styles.padding_sm,
    padding === 'md' && styles.padding_md,
    padding === 'lg' && styles.padding_lg,
    style,
  ];

  if (onPress) {
    return (
      <AnimatedPressable style={cardStyle} onPress={onPress} scaleValue={0.98}>
        {children}
      </AnimatedPressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
  },
  elevated: {
    // Shadow comes from shadows.md preset - soft Airbnb-style
  },
  outlined: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  padding_sm: {
    padding: spacing.sm,
  },
  padding_md: {
    padding: spacing.lg,
  },
  padding_lg: {
    padding: spacing.xl,
  },
});
