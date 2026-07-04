import { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  PanResponder,
  useWindowDimensions,
  TouchableWithoutFeedback,
  Platform,
  Keyboard,
  KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { borderRadius } from '@/constants/spacing';
import * as Haptics from 'expo-haptics';

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
  // Yükseklik pencereyle güncellenmeli: modül kapsamında donmuş değer, iPad
  // Split View / Mac penceresi yeniden boyutlanınca sheet'i görünür alanın
  // dışına konumlandırıyordu. Callback'ler ve PanResponder ref üzerinden okur.
  const { height: screenHeight } = useWindowDimensions();
  const screenHeightRef = useRef(screenHeight);
  screenHeightRef.current = screenHeight;
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const lastGestureDy = useRef(0);
  const currentSnapIndexRef = useRef(currentSnapIndex);
  const isKeyboardVisibleRef = useRef(false);
  const keyboardHeightRef = useRef(0);

  // Keep a state version for paddingBottom render only
  const [kbVisible, setKbVisible] = useState(false);

  // Store latest props in refs for PanResponder access
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const onSnapChangeRef = useRef(onSnapChange);
  onSnapChangeRef.current = onSnapChange;
  const enablePanDownToCloseRef = useRef(enablePanDownToClose);
  enablePanDownToCloseRef.current = enablePanDownToClose;
  const snapPointsRef = useRef(snapPoints);
  snapPointsRef.current = snapPoints;

  // Cleanup animations on unmount
  useEffect(() => {
    return () => {
      translateY.stopAnimation();
      backdropOpacity.stopAnimation();
    };
  }, [translateY, backdropOpacity]);

  // Calculate heights from snap points
  const getHeightForSnap = useCallback(
    (index: number) => {
      const sp = snapPointsRef.current[index] ?? snapPointsRef.current[0];
      return screenHeightRef.current * sp;
    },
    []
  );

  // Calculate target translateY - accounts for keyboard
  const getTargetY = useCallback(
    (snapIndex: number, kbHeight: number) => {
      const height = getHeightForSnap(snapIndex);
      return screenHeightRef.current - height - kbHeight;
    },
    [getHeightForSnap]
  );

  // Animate to snap point
  const animateToSnap = useCallback(
    (index: number, velocity = 0, kbHeight?: number) => {
      const kb = kbHeight ?? keyboardHeightRef.current;
      const toValue = getTargetY(index, kb);

      Animated.spring(translateY, {
        toValue,
        velocity: velocity * -1,
        damping: 36,
        stiffness: 340,
        mass: 0.8,
        useNativeDriver: true,
      }).start();

      currentSnapIndexRef.current = index;
      onSnapChangeRef.current?.(index);
    },
    [getTargetY, translateY]
  );

  // Animate backdrop
  const animateBackdrop = useCallback(
    (toValue: number, duration = 280) => {
      Animated.timing(backdropOpacity, {
        toValue,
        duration,
        useNativeDriver: true,
      }).start();
    },
    [backdropOpacity]
  );

  // Close sheet
  const close = useCallback(() => {
    Keyboard.dismiss();
    Animated.spring(translateY, {
      toValue: screenHeightRef.current,
      damping: 32,
      stiffness: 300,
      mass: 0.8,
      useNativeDriver: true,
    }).start(() => {
      onDismissRef.current();
    });
    animateBackdrop(0, 220);
  }, [translateY, animateBackdrop]);

  // Store close in ref for PanResponder
  const closeRef = useRef(close);
  closeRef.current = close;
  const animateToSnapRef = useRef(animateToSnap);
  animateToSnapRef.current = animateToSnap;

  // Keyboard listeners
  useEffect(() => {
    const handleKeyboardShow = (e: KeyboardEvent) => {
      const kbHeight = e.endCoordinates.height;
      isKeyboardVisibleRef.current = true;
      keyboardHeightRef.current = kbHeight;
      setKbVisible(true);

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
      isKeyboardVisibleRef.current = false;
      keyboardHeightRef.current = 0;
      setKbVisible(false);

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

  // Pan responder for drag gesture — uses refs to avoid stale closures
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
        const snapPt = snapPointsRef.current[currentSnapIndexRef.current] ?? snapPointsRef.current[0];
        const currentHeight = screenHeightRef.current * snapPt;
        const baseY = screenHeightRef.current - currentHeight;

        if (gestureState.dy < 0) {
          const resistance = 0.3;
          translateY.setValue(baseY + gestureState.dy * resistance);
        } else {
          translateY.setValue(baseY + gestureState.dy);
        }

        lastGestureDy.current = gestureState.dy;

        const progress = Math.min(1, Math.max(0, 1 - gestureState.dy / currentHeight));
        backdropOpacity.setValue(progress * 0.5);
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dy, vy } = gestureState;

        if (enablePanDownToCloseRef.current && (dy > DISMISS_THRESHOLD || vy > VELOCITY_THRESHOLD)) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          closeRef.current();
          return;
        }

        if (vy > 0 && currentSnapIndexRef.current > 0) {
          animateToSnapRef.current(currentSnapIndexRef.current - 1, vy);
        } else if (vy < -VELOCITY_THRESHOLD && currentSnapIndexRef.current < snapPointsRef.current.length - 1) {
          animateToSnapRef.current(currentSnapIndexRef.current + 1, vy);
        } else {
          animateToSnapRef.current(currentSnapIndexRef.current);
        }

        backdropOpacity.setValue(0.5);
      },
    })
  ).current;

  // Track if we've already opened for this visible state
  const hasOpenedRef = useRef(false);

  // Handle visibility changes — only depend on `visible`
  useEffect(() => {
    if (visible && !hasOpenedRef.current) {
      hasOpenedRef.current = true;
      translateY.setValue(screenHeightRef.current);
      animateToSnap(currentSnapIndex, 0, 0);
      animateBackdrop(0.5);
    } else if (!visible) {
      hasOpenedRef.current = false;
    }
  }, [visible, animateToSnap, animateBackdrop, currentSnapIndex, translateY]);

  // Sheet açıkken pencere yüksekliği değişirse (iPad Split View / Mac
  // penceresi) aktif snap noktasına yeniden hizala
  const prevHeightRef = useRef(screenHeight);
  useEffect(() => {
    if (prevHeightRef.current === screenHeight) return;
    prevHeightRef.current = screenHeight;
    if (visible && hasOpenedRef.current) {
      animateToSnap(currentSnapIndexRef.current);
    }
  }, [screenHeight, visible, animateToSnap]);

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
            maxHeight: screenHeight * 0.92,
            paddingBottom: kbVisible ? 0 : insets.bottom,
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
