import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Button, Avatar } from '@/components/ui';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { RoleSelector } from './RoleSelector';
import { PermissionEditor } from './PermissionEditor';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
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
        permissions: role === 'custom' ? permissions : undefined,
      });
      onClose();
    } catch (error: any) {
      Alert.alert(t('common:status.error'), error?.message ?? t('common:status.error'));
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
            <Text variant="h3" numberOfLines={1}>{displayName}</Text>
            {user.profile?.email && (
              <Text variant="caption" color="muted">{user.profile.email}</Text>
            )}
            <Text variant="caption" color="muted">
              {t(`multiUser:status.${user.status}`)}
            </Text>
          </View>
        </View>

        {/* Rol Seçimi */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            {t('multiUser:invites.selectRole')}
          </Text>
          <RoleSelector value={role} onChange={handleRoleChange} />
        </View>

        {/* Özel Yetki Düzenleme (custom rol seçildiğinde) */}
        {role === 'custom' && (
          <View style={styles.section}>
            <PermissionEditor value={permissions} onChange={setPermissions} />
          </View>
        )}

        {/* Aksiyon Butonları */}
        <View style={styles.section}>
          <Button
            onPress={handleSave}
            loading={updateUser.isPending}
            variant="primary"
          >
            {t('common:buttons.save')}
          </Button>
        </View>

        <View style={styles.section}>
          <Button
            onPress={handleToggleStatus}
            loading={updateStatus.isPending}
            variant="secondary"
          >
            {user.status === 'active'
              ? t('multiUser:users.suspendUser')
              : t('multiUser:users.activateUser')}
          </Button>
        </View>

        <View style={[styles.section, { marginBottom: spacing['3xl'] }]}>
          <Button
            onPress={handleRemove}
            variant="danger"
          >
            {t('multiUser:users.removeUser')}
          </Button>
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
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
    marginBottom: spacing.lg,
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
});
