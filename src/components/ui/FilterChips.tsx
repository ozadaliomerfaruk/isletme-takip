import { useCallback, cloneElement, isValidElement } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { Text } from './Text';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const SPRING_CONFIG = { damping: 15, stiffness: 300, mass: 0.6 };

export interface FilterChipItem {
  key: string;
  label: string;
  icon?: React.ReactElement;
  activeColor?: string; // opsiyonel — aktifken ikon rengi override
}

interface FilterChipsProps {
  chips: FilterChipItem[];
  activeKey: string;
  onChange: (key: string) => void;
}

// ============================================================================
// SINGLE CHIP (animated)
// ============================================================================

function Chip({
  chip,
  isActive,
  onPress,
}: {
  chip: FilterChipItem;
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.93, SPRING_CONFIG);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, SPRING_CONFIG);
  }, [scale]);

  // İkon rengini override et
  const iconElement =
    chip.icon && isValidElement(chip.icon)
      ? cloneElement(chip.icon as React.ReactElement<{ color?: string; size?: number }>, {
          color: isActive ? colors.white : (chip.icon.props as { color?: string }).color ?? colors.textMuted,
          size: 14,
        })
      : null;

  return (
    <AnimatedTouchable
      style={[
        styles.chip,
        isActive ? styles.chipActive : styles.chipInactive,
        animatedStyle,
      ]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.8}
    >
      {iconElement}
      <Text
        style={[
          styles.chipLabel,
          isActive ? styles.chipLabelActive : styles.chipLabelInactive,
        ]}
      >
        {chip.label}
      </Text>
    </AnimatedTouchable>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FilterChips({ chips, activeKey, onChange }: FilterChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          chip={chip}
          isActive={chip.key === activeKey}
          onPress={() => onChange(chip.key)}
        />
      ))}
    </ScrollView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipInactive: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: colors.white,
  },
  chipLabelInactive: {
    color: colors.textSecondary,
  },
});
