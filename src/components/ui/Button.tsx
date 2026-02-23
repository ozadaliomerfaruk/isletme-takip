import { useCallback } from 'react';
import {
  StyleSheet,
  ActivityIndicator,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
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

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
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
        <View style={styles.content}>
          {icon && iconPosition === 'left' && <View style={styles.iconLeft}>{icon}</View>}
          <Text
            variant="label"
            style={{ color: textColors[variant] }}
          >
            {children}
          </Text>
          {icon && iconPosition === 'right' && <View style={styles.iconRight}>{icon}</View>}
        </View>
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
});
