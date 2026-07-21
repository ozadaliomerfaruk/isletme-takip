import { useState, useCallback, useEffect, useRef, memo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';

interface ExpandableCardProps {
  header: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  // Controlled mode props
  expanded?: boolean;
  onToggle?: () => void;
  /** Uzun basma (ör. önizleme kartı açmak için) — verilmezse davranış değişmez. */
  onLongPress?: () => void;
  /** Konteyner stil override'ı (ör. düz-liste görünümü: radius/margin sıfırlama). */
  style?: StyleProp<ViewStyle>;
  /** false: sağdaki aç/kapa oku çizilmez (satır yine tıklanabilir). Varsayılan true. */
  showChevron?: boolean;
  // Compat prop (no longer needed, kept for API compatibility)
  disableAnimation?: boolean;
}

const TIMING_CONFIG = {
  duration: 250,
  easing: Easing.out(Easing.cubic),
};

export const ExpandableCard = memo(function ExpandableCard({
  header,
  children,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onToggle,
  onLongPress,
  style,
  showChevron = true,
}: ExpandableCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);

  // Controlled veya uncontrolled mod
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;

  // Track previous expanded to detect changes
  const prevExpanded = useRef(expanded);
  const [showContent, setShowContent] = useState(expanded);
  const contentOpacity = useSharedValue(expanded ? 1 : 0);

  const animatedContentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const handleHideContent = useCallback(() => {
    setShowContent(false);
  }, []);

  // Sync animation when expanded state changes
  useEffect(() => {
    if (expanded === prevExpanded.current) return;
    prevExpanded.current = expanded;

    if (expanded) {
      // Opening: show content, fade in
      setShowContent(true);
      contentOpacity.value = withTiming(1, TIMING_CONFIG);
    } else {
      // Closing: fade out, then unmount content
      contentOpacity.value = withTiming(0, { ...TIMING_CONFIG, duration: 150 }, (finished) => {
        if (finished) {
          runOnJS(handleHideContent)();
        }
      });
    }
  }, [expanded, contentOpacity, handleHideContent]);

  const toggleExpand = useCallback(() => {
    if (isControlled && onToggle) {
      onToggle();
    } else {
      setInternalExpanded((prev) => !prev);
    }
  }, [isControlled, onToggle]);

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggleExpand}
        onLongPress={onLongPress}
        delayLongPress={350}
        activeOpacity={0.7}
      >
        <View style={styles.headerContent}>{header}</View>
        {showChevron && (
          <View style={styles.chevron}>
            {expanded ? (
              <ChevronUp size={20} color={colors.textMuted} />
            ) : (
              <ChevronDown size={20} color={colors.textMuted} />
            )}
          </View>
        )}
      </TouchableOpacity>
      {showContent && (
        <Animated.View style={[styles.content, animatedContentStyle]}>
          <View style={styles.divider} />
          {children}
        </Animated.View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  headerContent: {
    flex: 1,
  },
  chevron: {
    marginLeft: spacing.md,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
});
