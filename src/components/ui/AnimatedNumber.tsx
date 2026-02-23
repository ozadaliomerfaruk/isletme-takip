import { memo, useEffect } from 'react';
import { TextStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { TextInput } from 'react-native';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface AnimatedNumberProps {
  value: number;
  /** Prefix shown before the number (e.g. "₺" or "$") */
  prefix?: string;
  /** Suffix shown after the number (e.g. "gr") */
  suffix?: string;
  /** Show sign indicator (+/-) before prefix */
  showSign?: boolean;
  /** Decimal separator: ',' for Turkish, '.' for English */
  decimalSeparator?: ',' | '.';
  /** Thousands separator: '.' for Turkish, ',' for English */
  thousandsSeparator?: '.' | ',';
  style?: StyleProp<TextStyle>;
  duration?: number;
}

/**
 * Worklet-safe number formatter. No Intl/toLocaleString dependency.
 * Works reliably on Reanimated UI thread.
 */
function formatWorklet(
  val: number,
  decSep: string,
  thousSep: string,
): string {
  'worklet';
  const abs = Math.abs(val);
  // Round to 2 decimal places
  const rounded = Math.round(abs * 100) / 100;
  const intPart = Math.floor(rounded);
  const decPart = Math.round((rounded - intPart) * 100);
  // Pad decimal part
  const decStr = decPart < 10 ? `0${decPart}` : `${decPart}`;
  // Format integer part with thousands separator
  const intStr = `${intPart}`;
  let formatted = '';
  for (let i = 0; i < intStr.length; i++) {
    if (i > 0 && (intStr.length - i) % 3 === 0) {
      formatted += thousSep;
    }
    formatted += intStr[i];
  }
  return `${formatted}${decSep}${decStr}`;
}

/**
 * Animates number changes with a smooth interpolation (0.7s default).
 * Uses Reanimated animated props on a hidden TextInput for 60fps UI-thread animation.
 * No slot-machine effect - just clean value interpolation.
 * Worklet-safe: no Intl/toLocaleString.
 */
export const AnimatedNumber = memo(function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  showSign = false,
  decimalSeparator = ',',
  thousandsSeparator = '.',
  style,
  duration = 700,
}: AnimatedNumberProps) {
  const animatedValue = useSharedValue(value);

  useEffect(() => {
    animatedValue.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration, animatedValue]);

  const animatedProps = useAnimatedProps(() => {
    const current = animatedValue.value;
    const formatted = formatWorklet(current, decimalSeparator, thousandsSeparator);
    const sign = showSign ? (current >= 0 ? '+' : '-') : '';
    const suffixPart = suffix ? ` ${suffix}` : '';
    const result = `${sign}${prefix}${formatted}${suffixPart}`;
    return {
      text: result,
      defaultValue: result,
    };
  });

  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
      editable={false}
      style={[{ padding: 0, margin: 0 }, style]}
      animatedProps={animatedProps}
    />
  );
});
