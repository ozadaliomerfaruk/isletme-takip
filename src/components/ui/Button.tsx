import { useCallback, useEffect } from 'react';
import {
  StyleSheet,
  ActivityIndicator,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { Text } from './Text';
import { AnimatedPressable } from './AnimatedPressable';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Show success check icon briefly (controlled by parent) */
  success?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Accessibility label - defaults to children text if string */
  accessibilityLabel?: string;
  /** Additional accessibility hint */
  accessibilityHint?: string;
}

const variantStyles = {
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryLight,
  },
  outline: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  danger: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
};

const sizeStyles = {
  sm: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 36,
  },
  md: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    height: 44,
  },
  lg: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    height: 52,
  },
};

const textColors = {
  primary: colors.white,
  secondary: colors.primary,
  outline: colors.text,
  ghost: colors.primary,
  danger: colors.white,
};

const checkSizes: Record<ButtonSize, number> = {
  sm: 16,
  md: 20,
  lg: 24,
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  success,
  icon,
  iconPosition = 'left',
  fullWidth,
  disabled,
  children,
  style,
  accessibilityLabel,
  accessibilityHint,
  onPress,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  // Success check animation
  const checkOpacity = useSharedValue(0);
  const checkScale = useSharedValue(0.5);
  const contentOpacity = useSharedValue(1);

  useEffect(() => {
    if (success) {
      // Fade out content, fade in check
      contentOpacity.value = withTiming(0, { duration: 150 });
      checkOpacity.value = withTiming(1, { duration: 200 });
      checkScale.value = withSequence(
        withTiming(1.2, { duration: 200, easing: Easing.out(Easing.back(2)) }),
        withTiming(1, { duration: 150 }),
      );
      // Auto-revert after 1.2s
      contentOpacity.value = withDelay(1200, withTiming(1, { duration: 200 }));
      checkOpacity.value = withDelay(1200, withTiming(0, { duration: 200 }));
      checkScale.value = withDelay(1200, withTiming(0.5, { duration: 200 }));
    }
  }, [success, checkOpacity, checkScale, contentOpacity]);

  const checkAnimStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
    transform: [{ scale: checkScale.value }],
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  // Derive accessibility label from children if not provided
  const derivedLabel = accessibilityLabel ||
    (typeof children === 'string' ? children : undefined);

  const handlePress = useCallback(() => {
    onPress?.();
  }, [onPress]);

  return (
    <AnimatedPressable
      onPress={handlePress}
      style={[
        styles.base,
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
      disabled={isDisabled}
      enableHaptic
      scaleValue={0.97}
      accessibilityRole="button"
      accessibilityLabel={derivedLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled: isDisabled,
        busy: loading,
      }}
    >
      {loading ? (
        <ActivityIndicator color={textColors[variant]} size="small" />
      ) : (
        <>
          <Animated.View style={[styles.content, contentAnimStyle]}>
            {icon && iconPosition === 'left' && <View style={styles.iconLeft}>{icon}</View>}
            <Text
              variant="label"
              style={{ color: textColors[variant] }}
            >
              {children}
            </Text>
            {icon && iconPosition === 'right' && <View style={styles.iconRight}>{icon}</View>}
          </Animated.View>
          <Animated.View style={[styles.checkOverlay, checkAnimStyle]}>
            <Check size={checkSizes[size]} color={textColors[variant]} strokeWidth={3} />
          </Animated.View>
        </>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconLeft: {
    marginRight: spacing.sm,
  },
  iconRight: {
    marginLeft: spacing.sm,
  },
  checkOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
