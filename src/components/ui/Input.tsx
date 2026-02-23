import { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  TextInputProps,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  TextStyle,
  type NativeSyntheticEvent,
  type TargetedEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  interpolateColor,
} from 'react-native-reanimated';
import { Eye, EyeOff } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize } from '@/constants/spacing';
import { Text } from './Text';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: StyleProp<TextStyle>;
}

const LABEL_DURATION = 200;

export function Input({
  label,
  error,
  leftIcon,
  rightIcon,
  secureTextEntry,
  value,
  placeholder,
  multiline,
  style,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isPassword = secureTextEntry !== undefined;
  const inputRef = useRef<TextInput>(null);

  // Floating label animation: 0 = resting (inside), 1 = floating (above)
  const labelProgress = useSharedValue(value ? 1 : 0);
  const focusProgress = useSharedValue(0);

  const hasValue = !!(value && value.length > 0);

  useEffect(() => {
    const shouldFloat = isFocused || hasValue;
    labelProgress.value = withTiming(shouldFloat ? 1 : 0, { duration: LABEL_DURATION });
  }, [isFocused, hasValue, labelProgress]);

  useEffect(() => {
    focusProgress.value = withTiming(isFocused ? 1 : 0, { duration: LABEL_DURATION });
  }, [isFocused, focusProgress]);

  const labelAnimStyle = useAnimatedStyle(() => {
    const translateY = interpolate(labelProgress.value, [0, 1], [0, -24]);
    const scale = interpolate(labelProgress.value, [0, 1], [1, 0.78]);

    return {
      transform: [{ translateY }, { scale }],
    };
  });

  const labelColorStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      focusProgress.value,
      [0, 1],
      [colors.textMuted, colors.primary],
    );
    return { color };
  });

  const borderAnimStyle = useAnimatedStyle(() => {
    const borderColor = error
      ? colors.error
      : interpolateColor(
          focusProgress.value,
          [0, 1],
          [colors.border, colors.primary],
        );
    return { borderColor };
  });

  const handleFocus = (e: NativeSyntheticEvent<TargetedEvent>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: NativeSyntheticEvent<TargetedEvent>) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  // Determine if we should show a floating label or static label
  const useFloatingLabel = !!label && !multiline;

  const inputStyles: StyleProp<TextStyle> = [
    styles.input,
    leftIcon ? styles.inputWithLeftIcon : undefined,
    useFloatingLabel ? styles.inputWithFloatingLabel : undefined,
    multiline ? styles.inputMultiline : undefined,
    style,
  ];

  return (
    <View style={styles.container}>
      {/* Static label for multiline (floating label doesn't work well with multiline) */}
      {label && multiline && (
        <Text variant="label" color="secondary" style={styles.staticLabel}>
          {label}
        </Text>
      )}

      <Animated.View
        style={[
          styles.inputContainer,
          error ? styles.inputError : undefined,
          !error ? borderAnimStyle : undefined,
        ]}
      >
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}

        {/* Floating label */}
        {useFloatingLabel && (
          <Animated.Text
            style={[
              styles.floatingLabel,
              leftIcon ? styles.floatingLabelWithIcon : undefined,
              labelAnimStyle,
              labelColorStyle,
            ]}
            onPress={() => inputRef.current?.focus()}
            numberOfLines={1}
          >
            {label}
          </Animated.Text>
        )}

        <TextInput
          ref={inputRef}
          style={inputStyles}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isPassword && !showPassword}
          value={value}
          placeholder={useFloatingLabel ? (isFocused ? placeholder : undefined) : placeholder}
          multiline={multiline}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
        {isPassword && (
          <TouchableOpacity
            style={styles.rightIcon}
            onPress={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff size={20} color={colors.textMuted} />
            ) : (
              <Eye size={20} color={colors.textMuted} />
            )}
          </TouchableOpacity>
        )}
        {rightIcon && !isPassword && <View style={styles.rightIcon}>{rightIcon}</View>}
      </Animated.View>
      {error && (
        <Text variant="caption" color="error" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  staticLabel: {
    marginBottom: spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  inputWithLeftIcon: {
    paddingLeft: spacing.sm,
  },
  inputWithFloatingLabel: {
    paddingTop: spacing.lg + 4,
    paddingBottom: spacing.sm,
  },
  inputMultiline: {
    textAlignVertical: 'top',
  },
  floatingLabel: {
    position: 'absolute',
    left: spacing.lg,
    top: spacing.md + 2,
    fontSize: fontSize.lg,
    color: colors.textMuted,
    backgroundColor: 'transparent',
    zIndex: 1,
    // transform origin top-left via anchor
    transformOrigin: 'left top',
  },
  floatingLabelWithIcon: {
    left: spacing.lg + 20 + spacing.sm, // leftIcon padding + icon size + gap
  },
  leftIcon: {
    paddingLeft: spacing.lg,
  },
  rightIcon: {
    paddingRight: spacing.lg,
  },
  error: {
    marginTop: spacing.xs,
  },
});
