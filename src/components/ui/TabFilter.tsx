import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { Text } from './Text';
import { useHaptics } from '@/hooks/useHaptics';

const SPRING_CONFIG = {
  damping: 18,
  stiffness: 180,
  mass: 0.8,
};

interface TabFilterOption {
  label: string;
  value: string;
}

interface TabFilterProps {
  options: TabFilterOption[];
  value: string;
  onChange: (value: string) => void;
}

export function TabFilter({ options, value, onChange }: TabFilterProps) {
  const haptics = useHaptics();
  const [tabWidths, setTabWidths] = useState<number[]>([]);
  const translateX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);

  const activeIndex = options.findIndex((o) => o.value === value);

  // Calculate indicator position when tab widths or active index changes
  useEffect(() => {
    if (tabWidths.length === options.length && activeIndex >= 0) {
      let x = 0;
      for (let i = 0; i < activeIndex; i++) {
        x += tabWidths[i];
      }
      translateX.value = withSpring(x, SPRING_CONFIG);
      indicatorWidth.value = withSpring(tabWidths[activeIndex], SPRING_CONFIG);
    }
  }, [activeIndex, tabWidths, options.length, translateX, indicatorWidth]);

  const handleTabLayout = useCallback(
    (index: number) => (event: LayoutChangeEvent) => {
      const { width } = event.nativeEvent.layout;
      setTabWidths((prev) => {
        const next = [...prev];
        next[index] = width;
        return next;
      });
    },
    [],
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: indicatorWidth.value,
  }));

  return (
    <View style={styles.container}>
      {/* Sliding indicator */}
      <Animated.View style={[styles.indicator, indicatorStyle]} />

      {/* Tabs */}
      {options.map((option, index) => {
        const isActive = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={styles.tab}
            onPress={() => { if (option.value !== value) haptics.selection(); onChange(option.value); }}
            onLayout={handleTabLayout(index)}
            activeOpacity={0.7}
          >
            <Text
              variant="label"
              style={{ color: isActive ? colors.white : colors.textSecondary }}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceLighter,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    bottom: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    zIndex: 1,
  },
});
