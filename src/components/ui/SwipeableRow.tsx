import React, { useRef, useCallback, useContext, createContext } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Trash2, Zap } from 'lucide-react-native';
import { Text } from './Text';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';

const ACTION_WIDTH = 72;

// ============================================================================
// Context: sadece bir SwipeableRow aynı anda açık olabilir
// ============================================================================

type SwipeableContextType = {
  registerOpen: (close: () => void) => void;
};

const SwipeableContext = createContext<SwipeableContextType>({
  registerOpen: () => {},
});

/**
 * Bu provider'ı FlatList veya ScrollView etrafında kullanarak
 * sadece bir satırın aynı anda açık olmasını sağla.
 */
export function SwipeableProvider({ children }: { children: React.ReactNode }) {
  const currentCloseRef = useRef<(() => void) | null>(null);

  const registerOpen = useCallback((close: () => void) => {
    if (currentCloseRef.current && currentCloseRef.current !== close) {
      currentCloseRef.current();
    }
    currentCloseRef.current = close;
  }, []);

  return (
    <SwipeableContext.Provider value={{ registerOpen }}>
      {children}
    </SwipeableContext.Provider>
  );
}

// ============================================================================
// SwipeableRow
// ============================================================================

export interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete?: () => void;
  onAction?: () => void;
  enabled?: boolean;
  deleteLabel?: string;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
}

export function SwipeableRow({
  children,
  onDelete,
  onAction,
  enabled = true,
  deleteLabel = 'Sil',
  actionLabel = 'İşlem Yap',
  actionIcon,
}: SwipeableRowProps) {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const { registerOpen } = useContext(SwipeableContext);

  const close = useCallback(() => {
    swipeableRef.current?.close();
  }, []);

  const handleDelete = useCallback(() => {
    close();
    onDelete?.();
  }, [close, onDelete]);

  const handleAction = useCallback(() => {
    close();
    onAction?.();
  }, [close, onAction]);

  const handleSwipeOpen = useCallback(() => {
    registerOpen(close);
  }, [registerOpen, close]);

  // Sağ tarafta kaç buton var?
  const rightButtonCount = (onAction ? 1 : 0) + (onDelete ? 1 : 0);
  const totalRightWidth = rightButtonCount * ACTION_WIDTH;

  const renderRightActions = useCallback(
    (_progress: SharedValue<number>, drag: SharedValue<number>) => {
      return (
        <RightActions
          drag={drag}
          onAction={onAction ? handleAction : undefined}
          onDelete={onDelete ? handleDelete : undefined}
          actionLabel={actionLabel}
          actionIcon={actionIcon}
          deleteLabel={deleteLabel}
          totalWidth={totalRightWidth}
        />
      );
    },
    [handleAction, handleDelete, actionLabel, actionIcon, deleteLabel, onAction, onDelete, totalRightWidth],
  );

  if (!enabled || (!onDelete && !onAction)) {
    return <>{children}</>;
  }

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={1.5}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      overshootFriction={8}
      dragOffsetFromRightEdge={40}
      enableTrackpadTwoFingerGesture
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={handleSwipeOpen}
      containerStyle={styles.swipeableContainer}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

// ============================================================================
// Right actions (Reanimated - UI thread)
// ============================================================================

interface RightActionsProps {
  drag: SharedValue<number>;
  onAction?: () => void;
  onDelete?: () => void;
  actionLabel: string;
  actionIcon?: React.ReactNode;
  deleteLabel: string;
  totalWidth: number;
}

function RightActions({
  drag,
  onAction,
  onDelete,
  actionLabel,
  actionIcon,
  deleteLabel,
  totalWidth,
}: RightActionsProps) {
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + totalWidth }],
  }));

  return (
    <Reanimated.View style={[styles.actionsContainer, animStyle]}>
      {onAction && (
        <TouchableOpacity
          style={[styles.actionButton, styles.primaryAction, !onDelete && styles.actionRoundedRight]}
          onPress={onAction}
          activeOpacity={0.7}
        >
          {actionIcon || <Zap size={20} color={colors.white} />}
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
      {onDelete && (
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteAction]}
          onPress={onDelete}
          activeOpacity={0.7}
        >
          <Trash2 size={20} color={colors.white} />
          <Text style={styles.actionText}>{deleteLabel}</Text>
        </TouchableOpacity>
      )}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  swipeableContainer: {
    marginBottom: spacing.sm,
  },
  actionsContainer: {
    flexDirection: 'row',
  },
  actionButton: {
    width: ACTION_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  primaryAction: {
    backgroundColor: colors.primary,
  },
  actionRoundedRight: {
    borderTopRightRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  deleteAction: {
    backgroundColor: colors.error,
    borderTopRightRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  actionText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '600',
  },
});
