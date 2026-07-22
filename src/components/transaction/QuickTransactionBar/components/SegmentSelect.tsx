import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, type LayoutChangeEvent } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { borderRadius } from '@/constants/spacing';
import { useHaptics } from '@/hooks/useHaptics';

/**
 * QTB satır-içi tekli seçim: TabFilter'ın görsel imzası (gri ray + KAYAN dolu
 * pill + beyaz yazı + haptic) — ama sekme değil, içerik-genişlikli ve yatay
 * kaydırılabilir. Seçili durum dolgu pill'le NET; basışta haptic + spring kayış.
 * Chip/hap dizisi bilinçli olarak kullanılmıyor (yapay görünüm geri bildirimi).
 */

export interface SegmentOption {
  key: string;
  label: string;
  /** Opsiyonel önek renk noktası (ör. kategori rengi). */
  dotColor?: string | null;
}

interface SegmentSelectProps {
  options: SegmentOption[];
  /** Seçili option key'i; listede yoksa pill gizlenir (genişlik 0'a yaylanır). */
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

const SPRING_CONFIG = { damping: 18, stiffness: 180, mass: 0.8 };

export function SegmentSelect({ options, selectedKey, onSelect }: SegmentSelectProps) {
  const haptics = useHaptics();
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const translateX = useSharedValue(0);
  const pillWidth = useSharedValue(0);

  const selectedLayout = selectedKey ? layouts[selectedKey] : undefined;

  useEffect(() => {
    if (selectedLayout) {
      translateX.value = withSpring(selectedLayout.x, SPRING_CONFIG);
      pillWidth.value = withSpring(selectedLayout.width, SPRING_CONFIG);
    } else {
      pillWidth.value = withSpring(0, SPRING_CONFIG);
    }
  }, [selectedLayout, translateX, pillWidth]);

  const handleLayout = useCallback(
    (key: string) => (e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      setLayouts((prev) => {
        const cur = prev[key];
        if (cur && cur.x === x && cur.width === width) return prev;
        return { ...prev, [key]: { x, width } };
      });
    },
    [],
  );

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: pillWidth.value,
  }));

  return (
    <View style={s.track}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
      >
        {/* Kayan seçim pill'i — segmentlerin ARKASINDA, içerikle birlikte kayar */}
        <Animated.View style={[s.pill, pillStyle]} />
        {options.map((opt) => {
          const isActive = opt.key === selectedKey;
          return (
            <TouchableOpacity
              key={opt.key}
              style={s.segment}
              onLayout={handleLayout(opt.key)}
              onPress={() => {
                if (opt.key !== selectedKey) haptics.selection();
                onSelect(opt.key);
              }}
              activeOpacity={0.6}
            >
              {opt.dotColor ? (
                <View style={[s.dot, { backgroundColor: opt.dotColor }]} />
              ) : null}
              <Text
                style={[s.segmentText, isActive && s.segmentTextActive]}
                numberOfLines={1}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  track: {
    backgroundColor: colors.surfaceLighter,
    borderRadius: borderRadius.lg,
    height: 36,
  },
  content: {
    alignItems: 'center',
    padding: 3,
  },
  // left:0 — segment layout.x zaten content padding'ini (3) içerir; translateX ham x alır
  pill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 0,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.white,
  },
});
