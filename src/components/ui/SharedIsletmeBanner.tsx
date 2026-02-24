import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Building2, X } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { Text } from './Text';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '@/contexts/AuthContext';

interface SharedIsletmeBannerProps {
  onExit?: () => void;
}

export function SharedIsletmeBanner({ onExit }: SharedIsletmeBannerProps) {
  const { t } = useTranslation('multiUser');
  const { isSharedMode, isletme, currentUserRole, switchToOwnIsletme } = useAuthContext();

  if (!isSharedMode) return null;

  const handleExit = () => {
    switchToOwnIsletme();
    onExit?.();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Building2 size={20} color={colors.info} style={styles.icon} />
        <View style={styles.textContainer}>
          <Text variant="label" numberOfLines={1}>
            {isletme?.name}
          </Text>
          <Text variant="caption" color="muted">
            {currentUserRole ? t(`roles.${currentUserRole}`) : ''}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.exitButton}
        onPress={handleExit}
        activeOpacity={0.7}
      >
        <X size={16} color={colors.info} />
        <Text variant="label" style={{ color: colors.info }}>
          {t('banner.exit')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.info,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    marginRight: spacing.sm,
  },
  textContainer: {
    flex: 1,
  },
  exitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
});
