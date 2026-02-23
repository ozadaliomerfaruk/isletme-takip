import { memo, useRef } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';

const MAX_ANIMATED_INDEX = 6;

interface AnimatedListItemProps {
  index: number;
  children: React.ReactNode;
}

/**
 * Wrapper that applies staggered FadeInDown animation to list items.
 *
 * Constraints (performance rules):
 * - Only animates the first 6 items (MAX_ANIMATED_INDEX)
 * - Only animates on first mount (not on refresh/filter changes)
 * - Never triggers during scroll
 * - Uses Reanimated layout animations (UI thread, 60fps)
 */
export const AnimatedListItem = memo(function AnimatedListItem({
  index,
  children,
}: AnimatedListItemProps) {
  const hasAnimated = useRef(false);

  // Skip animation for items beyond threshold or already animated
  if (index >= MAX_ANIMATED_INDEX || hasAnimated.current) {
    hasAnimated.current = true;
    return <>{children}</>;
  }

  hasAnimated.current = true;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 60)
        .duration(350)
        .springify()
        .damping(18)
        .stiffness(140)}
    >
      {children}
    </Animated.View>
  );
});
