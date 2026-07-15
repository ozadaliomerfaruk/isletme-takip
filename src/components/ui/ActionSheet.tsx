import { useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { Text } from './Text';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 80;

const SPRING_OPEN = { damping: 28, stiffness: 220, mass: 0.8 };
const SPRING_CLOSE = { damping: 22, stiffness: 300, mass: 0.7 };

export interface ActionSheetOption {
  label: string;
  /** İsteğe bağlı ikinci satır — kullanıcı seçeneğin ne olduğunu bilsin (ör. ekle-picker). */
  description?: string;
  icon?: React.ReactNode;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  options: ActionSheetOption[];
  cancelLabel?: string;
}

// ============================================================================
// ANIMATED OPTION ROW
// ============================================================================

function OptionRow({
  option,
  index,
  isLast,
  onPress,
  sheetProgress,
}: {
  option: ActionSheetOption;
  index: number;
  isLast: boolean;
  onPress: (option: ActionSheetOption) => void;
  sheetProgress: SharedValue<number>;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    const delay = index * 30;
    const itemProgress = interpolate(
      sheetProgress.value,
      [0, 0.5, 1],
      [0, Math.max(0, 1 - delay / 200), 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: itemProgress,
      transform: [
        { scale: scale.value },
        {
          translateY: interpolate(
            itemProgress,
            [0, 1],
            [8, 0],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 400 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  }, [scale]);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        style={({ pressed }) => [
          styles.option,
          isLast && styles.optionLast,
          option.disabled && styles.optionDisabled,
          pressed && !option.disabled && styles.optionPressed,
        ]}
        onPress={() => onPress(option)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={option.disabled}
        accessibilityRole="button"
        accessibilityLabel={option.label}
        accessibilityState={{ disabled: option.disabled }}
      >
        {option.icon && <View style={styles.optionIcon}>{option.icon}</View>}
        <View style={styles.optionTextCol}>
          <Text
            style={[
              styles.optionLabel,
              option.destructive && styles.destructiveLabel,
              option.disabled && styles.disabledLabel,
            ]}
            numberOfLines={1}
          >
            {option.label}
          </Text>
          {option.description ? (
            <Text style={styles.optionDescription} numberOfLines={2}>
              {option.description}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ActionSheet({
  visible,
  onClose,
  title,
  options,
  cancelLabel,
}: ActionSheetProps) {
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const resolvedCancelLabel = cancelLabel ?? t('buttons.cancel');

  // Shared animation values
  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);
  const backdropProgress = useSharedValue(0);
  const sheetProgress = useSharedValue(0);
  const cancelScale = useSharedValue(1);

  // Open animation
  const animateOpen = useCallback(() => {
    sheetTranslateY.value = withSpring(0, SPRING_OPEN);
    backdropProgress.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
    sheetProgress.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
  }, [sheetTranslateY, backdropProgress, sheetProgress]);

  // Close animation
  const animateClose = useCallback((callback?: () => void) => {
    'worklet';
    sheetTranslateY.value = withSpring(SCREEN_HEIGHT, SPRING_CLOSE, (finished) => {
      if (finished && callback) {
        runOnJS(callback)();
      }
    });
    backdropProgress.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) });
    sheetProgress.value = withTiming(0, { duration: 200 });
  }, [sheetTranslateY, backdropProgress, sheetProgress]);

  // Handle visibility
  useEffect(() => {
    if (visible) {
      animateOpen();
    }
  }, [visible, animateOpen]);

  // Close handler
  const handleClose = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    animateClose(onClose);
  }, [animateClose, onClose]);

  // Option press handler
  const handleOptionPress = useCallback((option: ActionSheetOption) => {
    if (option.disabled) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    animateClose(onClose);
    setTimeout(() => option.onPress(), 150);
  }, [animateClose, onClose]);

  // Pan gesture for drag-to-dismiss
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        sheetTranslateY.value = event.translationY;
        // Fade backdrop as sheet drags down
        const progress = 1 - Math.min(1, event.translationY / (SCREEN_HEIGHT * 0.4));
        backdropProgress.value = progress;
      }
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_THRESHOLD || event.velocityY > 500) {
        if (Platform.OS !== 'web') {
          runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
        }
        sheetTranslateY.value = withSpring(SCREEN_HEIGHT, SPRING_CLOSE, (finished) => {
          if (finished) {
            runOnJS(onClose)();
          }
        });
        backdropProgress.value = withTiming(0, { duration: 200 });
        sheetProgress.value = withTiming(0, { duration: 200 });
      } else {
        // Snap back
        sheetTranslateY.value = withSpring(0, SPRING_OPEN);
        backdropProgress.value = withTiming(1, { duration: 200 });
      }
    });

  // Animated styles
  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropProgress.value,
  }));

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const cancelAnimatedStyle = useAnimatedStyle(() => {
    const itemProgress = interpolate(
      sheetProgress.value,
      [0, 0.6, 1],
      [0, 0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: itemProgress,
      transform: [
        { scale: cancelScale.value },
        {
          translateY: interpolate(
            itemProgress,
            [0, 1],
            [10, 0],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <GestureHandlerRootView style={styles.container}>
        {/* Blur Backdrop */}
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose}>
          <Animated.View style={[StyleSheet.absoluteFill, backdropAnimatedStyle]}>
            <BlurView
              intensity={Platform.OS === 'ios' ? 40 : 15}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.backdropOverlay} />
          </Animated.View>
        </Pressable>

        {/* Sheet */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, spacing.lg) },
              sheetAnimatedStyle,
            ]}
          >
            {/* Drag Handle */}
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>

            {/* Title */}
            {title && (
              <View style={styles.titleContainer}>
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
              </View>
            )}

            {/* Options */}
            <View style={styles.optionsContainer}>
              {options.map((option, index) => (
                <OptionRow
                  key={option.label}
                  option={option}
                  index={index}
                  isLast={index === options.length - 1}
                  onPress={handleOptionPress}
                  sheetProgress={sheetProgress}
                />
              ))}
            </View>

            {/* Separator */}
            <View style={styles.separator} />

            {/* Cancel */}
            <Animated.View style={cancelAnimatedStyle}>
              <Pressable
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && styles.cancelPressed,
                ]}
                onPress={handleClose}
                onPressIn={() => {
                  cancelScale.value = withSpring(0.97, { damping: 15, stiffness: 400 });
                }}
                onPressOut={() => {
                  cancelScale.value = withSpring(1, { damping: 15, stiffness: 400 });
                }}
                accessibilityRole="button"
                accessibilityLabel={resolvedCancelLabel}
              >
                <Text style={styles.cancelLabel}>{resolvedCancelLabel}</Text>
              </Pressable>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingHorizontal: spacing.lg,
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: {
        elevation: 24,
      },
    }),
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: borderRadius.full,
  },
  titleContainer: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optionsContainer: {
    gap: 2,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
  },
  optionLast: {
    // no special style needed
  },
  optionDisabled: {
    opacity: 0.4,
  },
  optionPressed: {
    backgroundColor: colors.surfaceLight,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  optionTextCol: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  optionDescription: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.textMuted,
    marginTop: 3,
  },
  destructiveLabel: {
    color: colors.error,
  },
  disabledLabel: {
    color: colors.textMuted,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
    marginHorizontal: spacing.sm,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
  },
  cancelPressed: {
    backgroundColor: colors.surfaceLight,
  },
  cancelLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
