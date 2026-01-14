import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { CURRENCY_SYMBOL } from '@/constants';
import { colors } from '@/constants/colors';
import { formatCurrencyInput } from '@/lib/currency';

export interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  size?: 'large' | 'medium';
  onSubmit?: () => void;
  editable?: boolean;
  onPress?: () => void;
}

export function AmountInput({
  value,
  onChange,
  autoFocus = false,
  size = 'large',
  onSubmit,
  editable = true,
  onPress,
}: AmountInputProps) {
  const inputRef = useRef<TextInput>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [isFocused, setIsFocused] = useState(false);

  // Format value for display
  const displayValue = formatCurrencyInput(value) || '0';

  // Scale animation on value change
  const animateScale = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.98,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        damping: 15,
        stiffness: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim]);

  // Handle text change
  const handleChange = useCallback(
    (text: string) => {
      // Remove all non-numeric characters except comma
      const cleaned = text.replace(/[^\d,]/g, '');

      // Limit to one comma and 2 decimal places
      const parts = cleaned.split(',');
      let newValue = parts[0];
      if (parts.length > 1) {
        newValue += ',' + parts[1].slice(0, 2);
      }

      // Animate and haptic on change
      if (newValue !== value) {
        animateScale();
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }

      onChange(newValue);
    },
    [value, onChange, animateScale]
  );

  // Focus on mount if autoFocus
  useEffect(() => {
    if (autoFocus && editable) {
      const timerId = setTimeout(() => {
        inputRef.current?.focus();
      }, 300);

      // Cleanup on unmount
      return () => clearTimeout(timerId);
    }
  }, [autoFocus, editable]);

  const isLarge = size === 'large';

  // If not editable, render as touchable display
  if (!editable) {
    return (
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Animated.View
          style={[
            styles.amountContainer,
            { transform: [{ scale: scaleAnim }] },
          ]}
        >
          <Text
            style={[
              styles.currencySymbol,
              isLarge ? styles.symbolLarge : styles.symbolMedium,
            ]}
          >
            {CURRENCY_SYMBOL}
          </Text>
          <Text
            style={[
              styles.amount,
              isLarge ? styles.amountLarge : styles.amountMedium,
            ]}
          >
            {displayValue}
          </Text>
        </Animated.View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.amountContainer,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Text
          style={[
            styles.currencySymbol,
            isLarge ? styles.symbolLarge : styles.symbolMedium,
          ]}
        >
          {CURRENCY_SYMBOL}
        </Text>
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            isLarge ? styles.inputLarge : styles.inputMedium,
          ]}
          value={displayValue === '0' && !isFocused ? '' : displayValue}
          onChangeText={handleChange}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onSubmitEditing={onSubmit}
          returnKeyType="done"
          selectionColor={colors.primary + '80'}
          maxLength={15}
        />
      </Animated.View>

      {/* Subtle underline when focused */}
      <View
        style={[
          styles.underline,
          isFocused && styles.underlineFocused,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  currencySymbol: {
    color: colors.textMuted,
    marginRight: 4,
    marginTop: 8,
  },
  symbolLarge: {
    fontSize: 28,
    fontWeight: '300',
  },
  symbolMedium: {
    fontSize: 20,
    fontWeight: '400',
    marginTop: 4,
  },
  amount: {
    color: colors.text,
  },
  amountLarge: {
    fontSize: 48,
    fontWeight: '300',
    letterSpacing: -1,
  },
  amountMedium: {
    fontSize: 32,
    fontWeight: '400',
    letterSpacing: -0.5,
  },
  input: {
    color: colors.text,
    minWidth: 60,
    textAlign: 'center',
    padding: 0,
  },
  inputLarge: {
    fontSize: 48,
    fontWeight: '300',
    letterSpacing: -1,
  },
  inputMedium: {
    fontSize: 32,
    fontWeight: '400',
    letterSpacing: -0.5,
  },
  underline: {
    width: 80,
    height: 2,
    backgroundColor: colors.border,
    marginTop: 8,
    borderRadius: 1,
  },
  underlineFocused: {
    backgroundColor: colors.primary + '66',
    width: 120,
  },
});
