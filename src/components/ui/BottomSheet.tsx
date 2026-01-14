import { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  PanResponder,
  Dimensions,
  TouchableWithoutFeedback,
  Platform,
  Keyboard,
  KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { borderRadius } from '@/constants/spacing';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 150;
const VELOCITY_THRESHOLD = 500;

export interface BottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  snapPoints?: number[];
  currentSnapIndex?: number;
  onSnapChange?: (index: number) => void;
  enablePanDownToClose?: boolean;
  enableBackdropDismiss?: boolean;
}

export function BottomSheet({
  visible,
  onDismiss,
  children,
  snapPoints = [0.5],
  currentSnapIndex = 0,
  onSnapChange,
  enablePanDownToClose = true,
  enableBackdropDismiss = true,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const lastGestureDy = useRef(0);
  const currentSnapIndexRef = useRef(currentSnapIndex);
  const isKeyboardVisibleRef = useRef(false);

  // Cleanup animations on unmount
  useEffect(() => {
    return () => {
      translateY.stopAnimation();
      backdropOpacity.stopAnimation();
    };
  }, [translateY, backdropOpacity]);

  // Track keyboard height
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Calculate heights from snap points
  const getHeightForSnap = useCallback(
    (index: number) => {
      const snapPoint = snapPoints[index] ?? snapPoints[0];
      return SCREEN_HEIGHT * snapPoint;
    },
    [snapPoints]
  );

  // Calculate target translateY - accounts for keyboard
  const getTargetY = useCallback(
    (snapIndex: number, kbHeight: number) => {
      const height = getHeightForSnap(snapIndex);
      // Base position: sheet at bottom of screen
      // With keyboard: sheet positioned so bottom is at keyboard top
      return SCREEN_HEIGHT - height - kbHeight;
    },
    [getHeightForSnap]
  );

  // Animate to snap point
  const animateToSnap = useCallback(
    (index: number, velocity = 0, kbHeight = keyboardHeight) => {
      const toValue = getTargetY(index, kbHeight);

      Animated.spring(translateY, {
        toValue,
        velocity: velocity * -1,
        damping: 20,
        stiffness: 300,
        mass: 1,
        useNativeDriver: true,
      }).start();

      currentSnapIndexRef.current = index;
      onSnapChange?.(index);
    },
    [getTargetY, translateY, onSnapChange, keyboardHeight]
  );

  // Animate backdrop
  const animateBackdrop = useCallback(
    (toValue: number, duration = 200) => {
      Animated.timing(backdropOpacity, {
        toValue,
        duration,
        useNativeDriver: true,
      }).start();
    },
    [backdropOpacity]
  );

  // Open sheet
  const open = useCallback(() => {
    translateY.setValue(SCREEN_HEIGHT);
    animateToSnap(currentSnapIndex, 0, keyboardHeight);
    animateBackdrop(0.5);
  }, [translateY, animateToSnap, animateBackdrop, currentSnapIndex, keyboardHeight]);

  // Close sheet
  const close = useCallback(() => {
    Keyboard.dismiss();
    Animated.spring(translateY, {
      toValue: SCREEN_HEIGHT,
      damping: 20,
      stiffness: 300,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
    });
    animateBackdrop(0);
  }, [translateY, animateBackdrop, onDismiss]);

  // Keyboard listeners
  useEffect(() => {
    const handleKeyboardShow = (e: KeyboardEvent) => {
      const kbHeight = e.endCoordinates.height;
      if (__DEV__) {
        console.log('[BottomSheet] Keyboard SHOW, height:', kbHeight);
      }
      isKeyboardVisibleRef.current = true;
      setKeyboardHeight(kbHeight);

      // Animate sheet to new position above keyboard
      if (visible) {
        const toValue = getTargetY(currentSnapIndexRef.current, kbHeight);
        Animated.spring(translateY, {
          toValue,
          damping: 25,
          stiffness: 400,
          mass: 0.8,
          useNativeDriver: true,
        }).start();
      }
    };

    const handleKeyboardHide = () => {
      if (__DEV__) {
        console.log('[BottomSheet] Keyboard HIDE');
      }
      isKeyboardVisibleRef.current = false;
      setKeyboardHeight(0);

      // Animate sheet back to original position
      if (visible) {
        const toValue = getTargetY(currentSnapIndexRef.current, 0);
        Animated.spring(translateY, {
          toValue,
          damping: 25,
          stiffness: 400,
          mass: 0.8,
          useNativeDriver: true,
        }).start();
      }
    };

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSub = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible, translateY, getTargetY]);

  // Pan responder for drag gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (isKeyboardVisibleRef.current) return false;
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        lastGestureDy.current = 0;
      },
      onPanResponderMove: (_, gestureState) => {
        const currentHeight = getHeightForSnap(currentSnapIndexRef.current);
        const baseY = SCREEN_HEIGHT - currentHeight;
        const newY = baseY + gestureState.dy;

        if (gestureState.dy < 0) {
          const resistance = 0.3;
          translateY.setValue(baseY + gestureState.dy * resistance);
        } else {
          translateY.setValue(newY);
        }

        lastGestureDy.current = gestureState.dy;

        const progress = Math.min(1, Math.max(0, 1 - gestureState.dy / currentHeight));
        backdropOpacity.setValue(progress * 0.5);
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dy, vy } = gestureState;

        if (enablePanDownToClose && (dy > DISMISS_THRESHOLD || vy > VELOCITY_THRESHOLD)) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          close();
          return;
        }

        if (vy > 0 && currentSnapIndexRef.current > 0) {
          animateToSnap(currentSnapIndexRef.current - 1, vy);
        } else if (vy < -VELOCITY_THRESHOLD && currentSnapIndexRef.current < snapPoints.length - 1) {
          animateToSnap(currentSnapIndexRef.current + 1, vy);
        } else {
          animateToSnap(currentSnapIndexRef.current);
        }

        animateBackdrop(0.5);
      },
    })
  ).current;

  // Track if we've already opened for this visible state
  const hasOpenedRef = useRef(false);

  // Handle visibility changes
  useEffect(() => {
    if (visible && !hasOpenedRef.current) {
      hasOpenedRef.current = true;
      open();
    } else if (!visible) {
      hasOpenedRef.current = false;
    }
  }, [visible, open]);

  // Handle snap index changes from parent
  useEffect(() => {
    if (visible && currentSnapIndex !== currentSnapIndexRef.current) {
      animateToSnap(currentSnapIndex);
    }
  }, [visible, currentSnapIndex, animateToSnap]);

  const handleBackdropPress = useCallback(() => {
    if (enableBackdropDismiss) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      close();
    }
  }, [enableBackdropDismiss, close]);

  if (!visible) return null;

  const sheetHeight = getHeightForSnap(currentSnapIndex);
  if (__DEV__) {
    console.log('[BottomSheet] Render - height:', sheetHeight, 'kbHeight:', keyboardHeight);
  }

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      </TouchableWithoutFeedback>

      {/* Sheet - positioned absolutely from top */}
      <Animated.View
        style={[
          styles.sheet,
          {
            height: sheetHeight,
            paddingBottom: keyboardHeight > 0 ? 0 : insets.bottom,
            transform: [{ translateY }],
          },
        ]}
        pointerEvents="box-none"
        {...panResponder.panHandlers}
      >
        {/* Drag Handle */}
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        {/* Content */}
        <View style={styles.content}>{children}</View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.black,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    minHeight: 200,
    maxHeight: SCREEN_HEIGHT * 0.92,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 16,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: borderRadius.sm,
  },
  content: {
    flex: 1,
  },
});
