import { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

export type PasswordStrength = 'weak' | 'medium' | 'strong';

interface PasswordStrengthIndicatorProps {
  password: string;
  onStrengthChange?: (strength: PasswordStrength) => void;
}

function calculatePasswordStrength(password: string): { score: number; strength: PasswordStrength } {
  let score = 0;

  if (!password) {
    return { score: 0, strength: 'weak' };
  }

  // Length checks
  if (password.length >= 6) score += 1;
  if (password.length >= 8) score += 1;

  // Character type checks
  if (/[a-z]/.test(password)) score += 1; // lowercase
  if (/[A-Z]/.test(password)) score += 1; // uppercase
  if (/[0-9]/.test(password)) score += 1; // numbers
  if (/[^a-zA-Z0-9]/.test(password)) score += 1; // special characters

  // Determine strength level
  let strength: PasswordStrength;
  if (score <= 2) {
    strength = 'weak';
  } else if (score <= 4) {
    strength = 'medium';
  } else {
    strength = 'strong';
  }

  return { score, strength };
}

export function PasswordStrengthIndicator({
  password,
  onStrengthChange,
}: PasswordStrengthIndicatorProps) {
  const { t } = useTranslation(['auth']);

  const { score, strength } = useMemo(() => calculatePasswordStrength(password), [password]);

  useEffect(() => {
    onStrengthChange?.(strength);
  }, [strength, onStrengthChange]);

  // Don't show if password is empty
  if (!password) {
    return null;
  }

  const getStrengthColor = () => {
    switch (strength) {
      case 'weak':
        return colors.error;
      case 'medium':
        return colors.warning;
      case 'strong':
        return colors.success;
    }
  };

  const getStrengthLabel = () => {
    switch (strength) {
      case 'weak':
        return t('auth:password.weak');
      case 'medium':
        return t('auth:password.medium');
      case 'strong':
        return t('auth:password.strong');
    }
  };

  const strengthColor = getStrengthColor();

  // Calculate segment fill: 3 segments total
  // weak: 1 segment, medium: 2 segments, strong: 3 segments
  const getSegmentCount = () => {
    if (score <= 2) return 1;
    if (score <= 4) return 2;
    return 3;
  };

  const filledSegments = getSegmentCount();

  return (
    <View style={styles.container}>
      <View style={styles.barContainer}>
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            style={[
              styles.segment,
              index < filledSegments
                ? { backgroundColor: strengthColor }
                : { backgroundColor: colors.border },
            ]}
          />
        ))}
      </View>
      <Text variant="caption" style={[styles.label, { color: strengthColor }]}>
        {getStrengthLabel()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  barContainer: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  label: {
    textAlign: 'right',
  },
});
