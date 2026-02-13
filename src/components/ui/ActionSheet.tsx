import { View, StyleSheet, TouchableOpacity, Modal, Animated, Pressable, Easing, Dimensions } from 'react-native';
import { useRef, useEffect, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { Text } from './Text';
import * as Haptics from 'expo-haptics';

export interface ActionSheetOption {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  options: ActionSheetOption[];
  cancelLabel?: string;
}

export function ActionSheet({
  visible,
  onClose,
  title,
  options,
  cancelLabel,
}: ActionSheetProps) {
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const resolvedCancelLabel = cancelLabel ?? t('buttons.cancel');
  const dismissDistance = Dimensions.get('window').height * 0.6;
  const translateY = useRef(new Animated.Value(dismissDistance)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    translateY.setValue(dismissDistance);
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        damping: 20,
        stiffness: 300,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0.5,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateY, backdropOpacity, dismissDistance]);

  const animateOut = useCallback((callback?: () => void) => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: dismissDistance,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(callback);
  }, [translateY, backdropOpacity, dismissDistance]);

  useEffect(() => {
    if (visible) {
      animateIn();
    }
  }, [visible, animateIn]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateOut(() => onClose());
  }, [animateOut, onClose]);

  const handleOptionPress = useCallback((option: ActionSheetOption) => {
    if (option.disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Animasyonu baslat, bitince modal'i kapat
    animateOut(() => onClose());
    // Aksiyonu animasyon bitmeden atesle - kullaniciya anlik his verir
    setTimeout(() => option.onPress(), 150);
  }, [animateOut, onClose]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Animated.View style={[styles.backdropInner, { opacity: backdropOpacity }]} />
      </Pressable>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + spacing.md,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Options Group */}
        <View style={styles.optionsGroup}>
          {/* Title */}
          {title && (
            <View style={styles.titleContainer}>
              <Text variant="caption" color="secondary" style={styles.title}>
                {title}
              </Text>
            </View>
          )}

          {/* Options */}
          {options.map((option, index) => (
            <TouchableOpacity
              key={option.label}
              style={[
                styles.option,
                index === 0 && !title && styles.optionFirst,
                index === options.length - 1 && styles.optionLast,
                option.disabled && styles.optionDisabled,
              ]}
              onPress={() => handleOptionPress(option)}
              disabled={option.disabled}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ disabled: option.disabled }}
              accessibilityHint={option.destructive ? 'Dikkat: Bu işlem geri alınamaz' : undefined}
            >
              {option.icon && <View style={styles.optionIcon}>{option.icon}</View>}
              <Text
                variant="body"
                style={[
                  styles.optionLabel,
                  option.destructive && styles.destructiveLabel,
                  option.disabled && styles.disabledLabel,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Cancel Button */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleClose}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={resolvedCancelLabel}
        >
          <Text variant="label" color="primary">
            {resolvedCancelLabel}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdropInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.black,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  optionsGroup: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  titleContainer: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionFirst: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
  optionLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionIcon: {
    marginRight: spacing.sm,
  },
  optionLabel: {
    textAlign: 'center',
  },
  destructiveLabel: {
    color: colors.error,
  },
  disabledLabel: {
    color: colors.textMuted,
  },
  cancelButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
});
