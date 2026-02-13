/**
 * LinkedCariBadge - Eslesmis cari gosterim badge'i (v2)
 *
 * Iki variant:
 * - inline: Cari listesinde cari adinin altinda gosterilir
 * - card: Cari detay sayfasinda gosterilir
 */

import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Link, Eye, Edit3 } from 'lucide-react-native';

import { Text } from '@/components/ui/Text';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import type { SharingPermission } from '@/types/cariSharing';

interface LinkedCariBadgeProps {
  ownerIsletmeName: string;
  permission: SharingPermission;
  variant?: 'inline' | 'card';
}

export function LinkedCariBadge({
  ownerIsletmeName,
  permission,
  variant = 'card',
}: LinkedCariBadgeProps) {
  const { t } = useTranslation(['clients']);

  if (variant === 'inline') {
    return (
      <View style={styles.inlineContainer}>
        <Link size={12} color={colors.primary} />
        <Text style={styles.inlineText} numberOfLines={1}>
          {t('clients:sharing.linkedFrom', { name: ownerIsletmeName })}
        </Text>
        {permission === 'view' ? (
          <Eye size={12} color={colors.warning} />
        ) : (
          <Edit3 size={12} color={colors.success} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Ust kisim - baglanti ikonu ve etiket */}
      <View style={styles.headerRow}>
        <View style={styles.badgeIcon}>
          <Link size={14} color={colors.primary} />
        </View>
        <Text style={styles.badgeLabel}>
          {t('clients:sharing.linkedBadge')}
        </Text>
      </View>

      {/* Partner isletme bilgisi */}
      <View style={styles.partnerRow}>
        <Text style={styles.partnerLabel}>
          {t('clients:sharing.partnerBusiness')}
        </Text>
        <Text style={styles.partnerName}>{ownerIsletmeName}</Text>
      </View>

      {/* Izin gostergesi */}
      <View style={[
        styles.permissionRow,
        { backgroundColor: permission === 'view' ? colors.warningLight : colors.successLight },
      ]}>
        {permission === 'view' ? (
          <Eye size={14} color={colors.warning} />
        ) : (
          <Edit3 size={14} color={colors.success} />
        )}
        <Text style={[
          styles.permissionText,
          { color: permission === 'view' ? colors.warning : colors.success },
        ]}>
          {permission === 'view'
            ? t('clients:sharing.viewOnlyBanner')
            : t('clients:sharing.fullAccess')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Card variant
  container: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badgeIcon: {
    width: 26,
    height: 26,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  partnerRow: {
    paddingLeft: spacing.xs,
  },
  partnerLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  partnerName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    alignSelf: 'flex-start',
  },
  permissionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Inline variant
  inlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  inlineText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
    flex: 1,
  },
});
