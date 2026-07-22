import React, { useRef, useCallback, useContext, createContext, useEffect } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Trash2, Zap, Copy } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
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
  onCopy?: () => void;
  enabled?: boolean;
  deleteLabel?: string;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  copyLabel?: string;
  /** FlashList recycle güvenliği: değişince açık swipe durumunu kapatır (eski satırın açık hali yeni kayda sızmasın). */
  itemKey?: string | number;
  /** true: satır altı boşluk yok (bitişik düz-liste görünümü; ayrım satırın kendi çizgisinden). */
  flush?: boolean;
}

export function SwipeableRow({
  children,
  onDelete,
  onAction,
  onCopy,
  enabled = true,
  deleteLabel,
  actionLabel,
  actionIcon,
  copyLabel,
  itemKey,
  flush,
}: SwipeableRowProps) {
  const { t } = useTranslation(['common']);
  const swipeableRef = useRef<SwipeableMethods>(null);
  const { registerOpen } = useContext(SwipeableContext);

  // FlashList recycle: hücre farklı bir kayda yeniden kullanıldığında (itemKey değişince)
  // açık swipe durumunu kapat — eski satırın açık hali yeni kayda sızmasın.
  useEffect(() => {
    swipeableRef.current?.close();
  }, [itemKey]);

  const resolvedDeleteLabel = deleteLabel ?? t('common:buttons.delete');
  const resolvedActionLabel = actionLabel ?? t('common:buttons.action', { defaultValue: 'Action' });
  const resolvedCopyLabel = copyLabel ?? t('common:buttons.copy');

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

  const handleCopy = useCallback(() => {
    close();
    onCopy?.();
  }, [close, onCopy]);

  const handleSwipeOpen = useCallback(() => {
    registerOpen(close);
  }, [registerOpen, close]);

  // Sağ tarafta kaç buton var?
  const rightButtonCount = (onAction ? 1 : 0) + (onCopy ? 1 : 0) + (onDelete ? 1 : 0);
  const totalRightWidth = rightButtonCount * ACTION_WIDTH;

  const renderRightActions = useCallback(
    (_progress: SharedValue<number>, drag: SharedValue<number>) => {
      return (
        <RightActions
          drag={drag}
          onAction={onAction ? handleAction : undefined}
          onCopy={onCopy ? handleCopy : undefined}
          onDelete={onDelete ? handleDelete : undefined}
          actionLabel={resolvedActionLabel}
          actionIcon={actionIcon}
          copyLabel={resolvedCopyLabel}
          deleteLabel={resolvedDeleteLabel}
          totalWidth={totalRightWidth}
        />
      );
    },
    [handleAction, handleCopy, handleDelete, resolvedActionLabel, actionIcon, resolvedCopyLabel, resolvedDeleteLabel, onAction, onCopy, onDelete, totalRightWidth],
  );

  if (!enabled || (!onDelete && !onAction && !onCopy)) {
    return <>{children}</>;
  }

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={1.5}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      overshootFriction={8}
      dragOffsetFromLeftEdge={80}
      dragOffsetFromRightEdge={40}
      enableTrackpadTwoFingerGesture
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={handleSwipeOpen}
      containerStyle={flush ? undefined : styles.swipeableContainer}
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
  onCopy?: () => void;
  onDelete?: () => void;
  actionLabel: string;
  actionIcon?: React.ReactNode;
  copyLabel: string;
  deleteLabel: string;
  totalWidth: number;
}

function RightActions({
  drag,
  onAction,
  onCopy,
  onDelete,
  actionLabel,
  actionIcon,
  copyLabel,
  deleteLabel,
  totalWidth,
}: RightActionsProps) {
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + totalWidth }],
  }));

  // En sağdaki buton rounded olmalı
  const isDeleteLast = !!onDelete;
  const isCopyLast = !onDelete && !!onCopy;
  const isActionLast = !onDelete && !onCopy && !!onAction;

  return (
    <Reanimated.View style={[styles.actionsContainer, animStyle]}>
      {onAction && (
        <TouchableOpacity
          style={[styles.actionButton, styles.primaryAction, isActionLast && styles.actionRoundedRight]}
          onPress={onAction}
          activeOpacity={0.7}
        >
          {actionIcon || <Zap size={20} color={colors.white} />}
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
      {onCopy && (
        <TouchableOpacity
          style={[styles.actionButton, styles.copyAction, isCopyLast && styles.actionRoundedRight]}
          onPress={onCopy}
          activeOpacity={0.7}
        >
          <Copy size={20} color={colors.white} />
          <Text style={styles.actionText}>{copyLabel}</Text>
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
  copyAction: {
    backgroundColor: colors.info,
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
