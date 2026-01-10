import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { colors } from '@/constants/colors';
import { borderRadius, spacing } from '@/constants/spacing';
import { CekDurum } from '@/types/database';

interface CekStatusBadgeProps {
  durum: CekDurum;
  size?: 'sm' | 'md';
}

const statusColors: Record<CekDurum, { bg: string; text: string }> = {
  beklemede: { bg: colors.warningLight, text: colors.warning },
  odendi: { bg: colors.successLight, text: colors.success },
  iptal: { bg: colors.errorLight, text: colors.error },
};

export function CekStatusBadge({ durum, size = 'sm' }: CekStatusBadgeProps) {
  const { t } = useTranslation('checks');
  const colorScheme = statusColors[durum];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colorScheme.bg },
        size === 'md' && styles.badgeMd,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: colorScheme.text },
          size === 'md' && styles.textMd,
        ]}
      >
        {t(`status.${durum}`)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  badgeMd: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
  textMd: {
    fontSize: 13,
  },
});
