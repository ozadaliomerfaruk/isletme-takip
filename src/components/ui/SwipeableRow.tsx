import React, { useRef, useCallback } from 'react';
import { View, StyleSheet, Animated, TouchableOpacity, I18nManager } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Pencil, Trash2 } from 'lucide-react-native';
import { Text } from './Text';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';

const ACTION_WIDTH = 72;

export interface SwipeableRowProps {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  enabled?: boolean;
  editLabel?: string;
  deleteLabel?: string;
}

export function SwipeableRow({
  children,
  onEdit,
  onDelete,
  enabled = true,
  editLabel = 'Düzenle',
  deleteLabel = 'Sil',
}: SwipeableRowProps) {
  const swipeableRef = useRef<Swipeable>(null);

  const close = useCallback(() => {
    swipeableRef.current?.close();
  }, []);

  const handleEdit = useCallback(() => {
    close();
    onEdit?.();
  }, [close, onEdit]);

  const handleDelete = useCallback(() => {
    close();
    onDelete?.();
  }, [close, onDelete]);

  const renderRightActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>) => {
      const translateX = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [ACTION_WIDTH * 2, 0],
        extrapolate: 'clamp',
      });

      return (
        <Animated.View style={[styles.actionsContainer, { transform: [{ translateX }] }]}>
          {onEdit && (
            <TouchableOpacity
              style={[styles.actionButton, styles.editAction]}
              onPress={handleEdit}
              activeOpacity={0.7}
            >
              <Pencil size={20} color={colors.white} />
              <Text style={styles.actionText}>{editLabel}</Text>
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteAction]}
              onPress={handleDelete}
              activeOpacity={0.7}
            >
              <Trash2 size={20} color={colors.white} />
              <Text style={styles.actionText}>{deleteLabel}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      );
    },
    [onEdit, onDelete, handleEdit, handleDelete, editLabel, deleteLabel],
  );

  if (!enabled || (!onEdit && !onDelete)) {
    return <>{children}</>;
  }

  const actionCount = (onEdit ? 1 : 0) + (onDelete ? 1 : 0);

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      dragOffsetFromLeftEdge={40}
      renderRightActions={renderRightActions}
      containerStyle={styles.swipeableContainer}
    >
      {children}
    </Swipeable>
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
  editAction: {
    backgroundColor: colors.info,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
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
