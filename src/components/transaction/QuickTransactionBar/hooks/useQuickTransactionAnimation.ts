import { useRef, useEffect, useCallback, useState } from 'react';
import { Animated, Keyboard, KeyboardEvent, Platform, Easing, TextInput } from 'react-native';

interface UseQuickTransactionAnimationOptions {
  visible: boolean;
  amountInputRef: React.RefObject<TextInput | null>;
}

interface UseQuickTransactionAnimationReturn {
  // Animation values
  opacity: Animated.Value;
  translateY: Animated.Value;
  // Keyboard state
  keyboardHeight: number;
  isKeyboardVisible: boolean;
  // Animation functions
  animateOpen: () => void;
  animateClose: (callback?: () => void) => void;
}

export function useQuickTransactionAnimation({
  visible,
  amountInputRef,
}: UseQuickTransactionAnimationOptions): UseQuickTransactionAnimationReturn {
  // Animation refs
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(100)).current;
  const isAnimatingRef = useRef(false);

  // Keyboard state
  const keyboardHeightRef = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Keyboard listeners
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleShow = (e: KeyboardEvent) => {
      const height = e.endCoordinates.height;
      keyboardHeightRef.current = height;
      setKeyboardHeight(height);
      setIsKeyboardVisible(true);
    };

    const handleHide = () => {
      // Don't reset height - keep the last known height for positioning
      setIsKeyboardVisible(false);
    };

    const showSub = Keyboard.addListener(showEvent, handleShow);
    const hideSub = Keyboard.addListener(hideEvent, handleHide);

    return () => {
      showSub.remove();
      hideSub.remove();
      // Cleanup: Stop active animations
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [opacity, translateY]);

  // Open animation
  const animateOpen = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    // Reset values
    opacity.setValue(0);
    translateY.setValue(100);

    // Smooth open animation
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      isAnimatingRef.current = false;
      // Focus amount input after animation
      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 100);
    });
  }, [opacity, translateY, amountInputRef]);

  // Close animation
  const animateClose = useCallback(
    (callback?: () => void) => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;

      Keyboard.dismiss();

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 100,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        isAnimatingRef.current = false;
        callback?.();
      });
    },
    [opacity, translateY]
  );

  // Handle visibility changes
  useEffect(() => {
    if (visible) {
      animateOpen();
    }
  }, [visible, animateOpen]);

  return {
    opacity,
    translateY,
    keyboardHeight,
    isKeyboardVisible,
    animateOpen,
    animateClose,
  };
}
