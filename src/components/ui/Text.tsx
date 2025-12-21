import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';
import { colors } from '@/constants/colors';
import { fontSize, fontWeight } from '@/constants/spacing';

type TextVariant = 'h1' | 'h2' | 'h3' | 'body' | 'bodySmall' | 'caption' | 'label';
type TextColor = 'primary' | 'secondary' | 'muted' | 'success' | 'error' | 'warning';

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: TextColor;
  bold?: boolean;
  center?: boolean;
}

const variantStyles = {
  h1: { fontSize: fontSize['4xl'], fontWeight: fontWeight.bold },
  h2: { fontSize: fontSize['2xl'], fontWeight: fontWeight.semibold },
  h3: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
  body: { fontSize: fontSize.lg, fontWeight: fontWeight.normal },
  bodySmall: { fontSize: fontSize.md, fontWeight: fontWeight.normal },
  caption: { fontSize: fontSize.sm, fontWeight: fontWeight.normal },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
};

const colorStyles = {
  primary: colors.text,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  success: colors.success,
  error: colors.error,
  warning: colors.warning,
};

export function Text({
  variant = 'body',
  color = 'primary',
  bold,
  center,
  style,
  ...props
}: TextProps) {
  return (
    <RNText
      style={[
        styles.base,
        variantStyles[variant],
        { color: colorStyles[color] },
        bold && { fontWeight: fontWeight.bold },
        center && { textAlign: 'center' },
        style,
      ]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    color: colors.text,
  },
});
