import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Shield, UserX, Pause, Play } from 'lucide-react-native';
import { Text, Button, Avatar } from '@/components/ui';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { RoleSelector } from './RoleSelector';
import { PermissionEditor } from './PermissionEditor';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontWeight } from '@/constants/spacing';
import { useTranslation } from 'react-i18next';
import { useUpdateIsletmeUser, useUpdateUserStatus } from '@/hooks/useMultiUser';
import type { IsletmeUser, UserRole, Permissions } from '@/types/multiUser';

interface UserEditSheetProps {
  user: IsletmeUser | null;
  visible: boolean;
  onClose: () => void;
}

// Boş permissions objesi
const EMPTY_PERMISSIONS: Permissions = {
  modules: {
    dashboard: true,
    hesaplar: false,
    cariler: false,
    personel: false,
    islemler: false,
    kategoriler: false,
    raporlar: false,
    cekler: false,
    nakit_avans: false,
    ileri_tarihli: false,
    urunler: false,
    arsiv: false,
    ayarlar: false,
  },
  actions: {},
  visibility: {
    can_see_passive: false,
    can_see_archived: false,
    can_see_all_users_data: false,
  },
};

const STATUS_CONFIG = {
  active: { color: colors.success, bg: colors.successLight },
  suspended: { color: colors.warning, bg: colors.warningLight },
  removed: { color: colors.error, bg: colors.errorLight },
} as const;

export function UserEditSheet({ user, visible, onClose }: UserEditSheetProps) {
  const { t } = useTranslation(['multiUser', 'common']);
  const updateUser = useUpdateIsletmeUser();
  const updateStatus = useUpdateUserStatus();

  const [role, setRole] = useState<UserRole>('operator');
  const [permissions, setPermissions] = useState<Permissions>(EMPTY_PERMISSIONS);

  // Reset form when user changes
  useEffect(() => {
    if (user) {
      setRole(user.role);
      setPermissions(user.permissions ?? EMPTY_PERMISSIONS);
    }
  }, [user]);

  if (!user) return null;

  const handleRoleChange = (newRole: UserRole, defaultPermissions?: Permissions) => {
    setRole(newRole);
    if (newRole !== 'custom' && defaultPermissions) {
      setPermissions(defaultPermissions);
    }
  };

  const handleSave = async () => {
    try {
      await updateUser.mutateAsync({
        userId: user.user_id,
        isletmeId: user.isletme_id,
        role,
        permissions,
      });
      onClose();
    } catch (error) {
      Alert.alert(t('common:status.error'), error instanceof Error ? error.message : t('common:status.error'));
    }
  };

  const handleToggleStatus = () => {
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    updateStatus.mutate({
      userId: user.user_id,
      isletmeId: user.isletme_id,
      status: newStatus,
    });
    onClose();
  };

  const handleRemove = () => {
    Alert.alert(
      t('multiUser:users.removeUser'),
      t('multiUser:users.removeConfirm'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.confirm'),
          style: 'destructive',
          onPress: () => {
            updateStatus.mutate({
              userId: user.user_id,
              isletmeId: user.isletme_id,
              status: 'removed',
            });
            onClose();
          },
        },
      ],
    );
  };

  const displayName = user.profile?.display_name ?? user.profile?.email ?? '?';
  const statusConfig = STATUS_CONFIG[user.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.active;

  return (
    <BottomSheet visible={visible} onDismiss={onClose} snapPoints={[0.85]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Profil Bilgisi */}
        <View style={styles.profileSection}>
          <Avatar name={displayName} size={48} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
            {user.profile?.email && (
              <Text variant="caption" color="muted" style={styles.profileEmail}>
                {user.profile.email}
              </Text>
            )}
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
              <Text style={[styles.statusText, { color: statusConfig.color }]}>
                {t(`multiUser:status.${user.status}`)}
              </Text>
            </View>
          </View>
        </View>

        {/* Rol Seçimi */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Shield size={16} color={colors.textMuted} />
            <Text style={styles.sectionTitle}>
              {t('multiUser:invites.selectRole')}
            </Text>
          </View>
          <RoleSelector value={role} onChange={handleRoleChange} />
        </View>

        {/* Özel Yetki Düzenleme (custom rol seçildiğinde) */}
        {role === 'custom' && (
          <View style={styles.section}>
            <PermissionEditor value={permissions} onChange={setPermissions} />
          </View>
        )}

        {/* Kaydet */}
        <View style={styles.saveSection}>
          <Button
            onPress={handleSave}
            loading={updateUser.isPending}
            variant="primary"
          >
            {t('common:buttons.save')}
          </Button>
        </View>

        {/* Yönetim Aksiyonları */}
        <View style={styles.managementSection}>
          <View style={styles.managementRow}>
            <Button
              onPress={handleToggleStatus}
              loading={updateStatus.isPending}
              variant="ghost"
            >
              <View style={styles.managementButtonContent}>
                {user.status === 'active'
                  ? <Pause size={16} color={colors.warning} />
                  : <Play size={16} color={colors.success} />
                }
                <Text style={[styles.managementButtonText, {
                  color: user.status === 'active' ? colors.warning : colors.success,
                }]}>
                  {user.status === 'active'
                    ? t('multiUser:users.suspendUser')
                    : t('multiUser:users.activateUser')}
                </Text>
              </View>
            </Button>
          </View>
          <View style={styles.divider} />
          <View style={styles.managementRow}>
            <Button
              onPress={handleRemove}
              variant="ghost"
            >
              <View style={styles.managementButtonContent}>
                <UserX size={16} color={colors.error} />
                <Text style={[styles.managementButtonText, { color: colors.error }]}>
                  {t('multiUser:users.removeUser')}
                </Text>
              </View>
            </Button>
          </View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 20,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  profileEmail: {
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  saveSection: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  managementSection: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing['3xl'],
  },
  managementRow: {
    paddingHorizontal: spacing.xs,
  },
  managementButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  managementButtonText: {
    fontSize: 15,
    fontWeight: fontWeight.medium,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.lg,
  },
});
