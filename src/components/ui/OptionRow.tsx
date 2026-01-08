import { useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';

export interface OptionRowProps {
  icon: React.ReactNode;
  label: string;
  value?: string;
  placeholder?: string;
  onPress?: () => void;
  showChevron?: boolean;
  disabled?: boolean;
  error?: boolean;
}

export function OptionRow({
  icon,
  label,
  value,
  placeholder,
  onPress,
  showChevron = true,
  disabled = false,
  error = false,
}: OptionRowProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      damping: 20,
      stiffness: 400,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      damping: 20,
      stiffness: 400,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  }, [onPress]);

  const displayValue = value || placeholder;
  const isPlaceholder = !value;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ scale: scaleAnim }] },
        error && styles.containerError,
      ]}
    >
      <TouchableOpacity
        style={styles.touchable}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        activeOpacity={1}
      >
        {/* Icon */}
        <View style={styles.iconContainer}>{icon}</View>

        {/* Label */}
        <Text style={[styles.label, disabled && styles.labelDisabled]}>
          {label}
        </Text>

        {/* Value */}
        <View style={styles.valueContainer}>
          <Text
            style={[
              styles.value,
              isPlaceholder && styles.valuePlaceholder,
              disabled && styles.valueDisabled,
            ]}
            numberOfLines={1}
          >
            {displayValue}
          </Text>

          {/* Chevron */}
          {showChevron && !disabled && (
            <ChevronRight
              size={20}
              color="#86868B"
              style={styles.chevron}
            />
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  containerError: {
    backgroundColor: '#FEE2E2',
  },
  touchable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  iconContainer: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 17,
    fontWeight: '400',
    color: '#1D1D1F',
    marginLeft: 12,
    flex: 1,
  },
  labelDisabled: {
    color: '#86868B',
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '45%',
  },
  value: {
    fontSize: 17,
    fontWeight: '400',
    color: '#86868B',
  },
  valuePlaceholder: {
    color: '#C7C7CC',
  },
  valueDisabled: {
    color: '#C7C7CC',
  },
  chevron: {
    marginLeft: 4,
  },
});
