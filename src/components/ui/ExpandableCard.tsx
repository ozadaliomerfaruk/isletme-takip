import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
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
  // Performance: FlatList içinde LayoutAnimation kapatmak için (compat, artık gerek yok)
  disableAnimation?: boolean;
}

const TIMING_CONFIG = {
  duration: 250,
  easing: Easing.out(Easing.cubic),
};

export function ExpandableCard({
  header,
  children,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onToggle,
}: ExpandableCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);

  // Controlled veya uncontrolled mod
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;

  // Content opacity + height animation
  const contentOpacity = useSharedValue(expanded ? 1 : 0);
  const [showContent, setShowContent] = useState(expanded);

  const animatedContentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const handleHideContent = useCallback(() => {
    setShowContent(false);
  }, []);

  const toggleExpand = useCallback(() => {
    if (isControlled && onToggle) {
      // For controlled mode, parent manages the state
      // We animate based on the new value in next render
      onToggle();
    } else {
      setInternalExpanded((prev) => !prev);
    }
  }, [isControlled, onToggle]);

  // Sync animation with expanded state
  if (expanded && !showContent) {
    // Opening: show content immediately, fade in
    setShowContent(true);
    contentOpacity.value = withTiming(1, TIMING_CONFIG);
  } else if (!expanded && showContent) {
    // Closing: fade out, then hide content
    contentOpacity.value = withTiming(0, { ...TIMING_CONFIG, duration: 150 }, (finished) => {
      if (finished) {
        runOnJS(handleHideContent)();
      }
    });
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggleExpand}
        activeOpacity={0.7}
      >
        <View style={styles.headerContent}>{header}</View>
        <View style={styles.chevron}>
          {expanded ? (
            <ChevronUp size={20} color={colors.textMuted} />
          ) : (
            <ChevronDown size={20} color={colors.textMuted} />
          )}
        </View>
      </TouchableOpacity>
      {showContent && (
        <Animated.View style={[styles.content, animatedContentStyle]}>
          <View style={styles.divider} />
          {children}
        </Animated.View>
      )}
    </View>
  );
}

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
