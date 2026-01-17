import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export function useHaptics() {
  const isHapticsAvailable = Platform.OS !== 'web';

  const light = useCallback(() => {
    if (isHapticsAvailable) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [isHapticsAvailable]);

  const medium = useCallback(() => {
    if (isHapticsAvailable) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [isHapticsAvailable]);

  const heavy = useCallback(() => {
    if (isHapticsAvailable) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  }, [isHapticsAvailable]);

  const success = useCallback(() => {
    if (isHapticsAvailable) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [isHapticsAvailable]);

  const error = useCallback(() => {
    if (isHapticsAvailable) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [isHapticsAvailable]);

  const warning = useCallback(() => {
    if (isHapticsAvailable) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [isHapticsAvailable]);

  const selection = useCallback(() => {
    if (isHapticsAvailable) {
      Haptics.selectionAsync();
    }
  }, [isHapticsAvailable]);

  return {
    light,
    medium,
    heavy,
    success,
    error,
    warning,
    selection,
    isHapticsAvailable,
  };
}
