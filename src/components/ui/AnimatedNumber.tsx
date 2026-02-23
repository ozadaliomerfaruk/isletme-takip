import { memo } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';

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

function formatNumber(
  val: number,
  decSep: string,
  thousSep: string,
): string {
  const abs = Math.abs(val);
  const rounded = Math.round(abs * 100) / 100;
  const intPart = Math.floor(rounded);
  const decPart = Math.round((rounded - intPart) * 100);
  const decStr = decPart < 10 ? `0${decPart}` : `${decPart}`;
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
 * Displays a formatted number with locale-aware separators.
 */
export const AnimatedNumber = memo(function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  showSign = false,
  decimalSeparator = ',',
  thousandsSeparator = '.',
  style,
}: AnimatedNumberProps) {
  const formatted = formatNumber(value, decimalSeparator, thousandsSeparator);
  const sign = showSign ? (value >= 0 ? '+' : '-') : '';
  const suffixPart = suffix ? ` ${suffix}` : '';
  const text = `${sign}${prefix}${formatted}${suffixPart}`;

  return (
    <Text style={style}>
      {text}
    </Text>
  );
});
