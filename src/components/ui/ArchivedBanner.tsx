import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Archive } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { Text } from './Text';
import { useTranslation } from 'react-i18next';

interface ArchivedBannerProps {
  onUnarchive?: () => void;
  loading?: boolean;
}

export function ArchivedBanner({ onUnarchive, loading }: ArchivedBannerProps) {
  const { t } = useTranslation('common');

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Archive size={20} color={colors.warning} style={styles.icon} />
        <Text variant="body" style={styles.text}>
          {t('archive.messages.archivedBanner')}
        </Text>
      </View>
      {onUnarchive && (
        <TouchableOpacity
          style={styles.button}
          onPress={onUnarchive}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text variant="label" color="primary">
            {t('archive.actions.unarchive')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: spacing.sm,
  },
  text: {
    flex: 1,
    color: colors.text,
  },
  button: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
});
