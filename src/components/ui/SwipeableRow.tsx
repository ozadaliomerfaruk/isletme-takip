import React, { useRef, useCallback, useContext, createContext, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Trash2 } from 'lucide-react-native';
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
  enabled?: boolean;
  deleteLabel?: string;
}

export function SwipeableRow({
  children,
  onDelete,
  enabled = true,
  deleteLabel = 'Sil',
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

  const handleSwipeOpen = useCallback(() => {
    registerOpen(close);
  }, [registerOpen, close]);

  const renderRightActions = useCallback(
    (_progress: SharedValue<number>, drag: SharedValue<number>) => {
      return (
        <RightAction
          drag={drag}
          onDelete={handleDelete}
          deleteLabel={deleteLabel}
        />
      );
    },
    [handleDelete, deleteLabel],
  );

  if (!enabled || !onDelete) {
    return <>{children}</>;
  }

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={1.5}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      overshootFriction={8}
      dragOffsetFromLeftEdge={40}
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
// Right action (Reanimated - UI thread)
// ============================================================================

interface RightActionProps {
  drag: SharedValue<number>;
  onDelete: () => void;
  deleteLabel: string;
}

function RightAction({ drag, onDelete, deleteLabel }: RightActionProps) {
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + ACTION_WIDTH }],
  }));

  return (
    <Reanimated.View style={[styles.actionsContainer, animStyle]}>
      <TouchableOpacity
        style={[styles.actionButton, styles.deleteAction]}
        onPress={onDelete}
        activeOpacity={0.7}
      >
        <Trash2 size={20} color={colors.white} />
        <Text style={styles.actionText}>{deleteLabel}</Text>
      </TouchableOpacity>
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
