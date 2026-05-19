import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

interface TrendIndicatorProps {
  currentValue: number;
  previousValue: number;
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function TrendIndicator({
  currentValue,
  previousValue,
  label,
  showPercentage = true,
  size = 'md',
}: TrendIndicatorProps) {
  const { t } = useTranslation(['reports']);

  // Hesaplamalar
  const difference = currentValue - previousValue;
  const percentageChange = previousValue !== 0
    ? ((difference / previousValue) * 100)
    : (currentValue > 0 ? 100 : 0);

  const isPositive = difference > 0;
  const isNegative = difference < 0;
  const isNeutral = difference === 0;

  // Stil ayarları
  const getColor = () => {
    if (isPositive) return colors.success;
    if (isNegative) return colors.error;
    return colors.textMuted;
  };

  const getBackgroundColor = () => {
    if (isPositive) return colors.successLight;
    if (isNegative) return colors.errorLight;
    return colors.surfaceLight;
  };

  const getIcon = () => {
    if (isPositive) return TrendingUp;
    if (isNegative) return TrendingDown;
    return Minus;
  };

  const getLabel = () => {
    if (isPositive) return t('reports:comparison.increase');
    if (isNegative) return t('reports:comparison.decrease');
    return t('reports:comparison.noChange');
  };

  const sizeStyles = {
    sm: {
      iconSize: 14,
      containerPadding: spacing.xs,
      fontSize: 12,
    },
    md: {
      iconSize: 16,
      containerPadding: spacing.sm,
      fontSize: 14,
    },
    lg: {
      iconSize: 20,
      containerPadding: spacing.md,
      fontSize: 16,
    },
  };

  const Icon = getIcon();
  const color = getColor();
  const backgroundColor = getBackgroundColor();
  const { iconSize, containerPadding, fontSize } = sizeStyles[size];

  return (
    <View style={[styles.container, { backgroundColor, padding: containerPadding }]}>
      <Icon size={iconSize} color={color} />
      {showPercentage && (
        <Text style={[styles.percentageText, { color, fontSize }]}>
          {isPositive ? '+' : ''}{percentageChange.toFixed(1)}%
        </Text>
      )}
      {label && (
        <Text style={[styles.labelText, { fontSize: fontSize - 2 }]} color="secondary">
          {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    gap: spacing.xs,
  },
  percentageText: {
    fontWeight: '600',
  },
  labelText: {},
});

export default TrendIndicator;
