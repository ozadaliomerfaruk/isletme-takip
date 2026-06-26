import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  UserPlus,
  ChevronRight,
} from 'lucide-react-native';
import { Text, Card, Avatar, Button } from '@/components/ui';
import { UserEditSheet } from '@/components/multiUser/UserEditSheet';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useIsletmeUsers, useIsletmeInvites, useCancelInvite } from '@/hooks/useMultiUser';
import type { IsletmeUser } from '@/types/multiUser';
import { useRequireOwner } from '@/hooks/usePagePermission';

export default function KullaniciYonetimiPage() {
  const router = useRouter();
  const { t } = useTranslation(['multiUser', 'common']);
  useRequireOwner();
  const { data: users, isLoading: usersLoading, error: usersError } = useIsletmeUsers();
  const { data: invites, isLoading: invitesLoading, error: invitesError } = useIsletmeInvites();
  const cancelInvite = useCancelInvite();
  const [editingUser, setEditingUser] = useState<IsletmeUser | null>(null);

  const handleCancelInvite = (inviteId: string) => {
    Alert.alert(
      t('common:buttons.confirm'),
      t('multiUser:invites.cancelInvite') + '?',
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.confirm'),
          style: 'destructive',
          onPress: () => cancelInvite.mutate(inviteId),
        },
      ],
    );
  };


  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: t('multiUser:users.title'),
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Davet Butonu */}
        <View style={styles.section}>
          <Button
            onPress={() => router.push('/ayarlar/davet-olustur' as never)}
            variant="primary"
          >
            <View style={styles.inviteButtonContent}>
              <UserPlus size={20} color={colors.white} />
              <Text variant="body" style={{ color: colors.white, fontWeight: '600' }}>
                {t('multiUser:users.invite')}
              </Text>
            </View>
          </Button>
        </View>

        {/* Kullanıcılar */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            {t('multiUser:users.title')}
          </Text>
          {usersLoading ? (
            <Card>
              <Text variant="body" color="muted">{t('common:status.loading')}</Text>
            </Card>
          ) : usersError ? (
            <Card>
              <Text variant="body" style={{ color: colors.error }}>
                {t('common:status.error')}: {(usersError as Error).message}
              </Text>
            </Card>
          ) : !users?.length ? (
            <Card>
              <Text variant="body" color="muted">{t('multiUser:users.empty')}</Text>
            </Card>
          ) : (
            <Card padding="none">
              {users.map((user, index) => (
                <View key={user.id}>
                  {index > 0 && <View style={styles.divider} />}
                  <TouchableOpacity
                    style={styles.userRow}
                    onPress={() => setEditingUser(user)}
                    activeOpacity={0.7}
                  >
                    <Avatar
                      name={user.member_label ?? user.profile?.display_name ?? user.profile?.email ?? '?'}
                      size={40}
                    />
                    <View style={styles.userInfo}>
                      <Text variant="body" numberOfLines={1}>
                        {user.member_label ?? user.profile?.display_name ?? user.profile?.email ?? '?'}
                      </Text>
                      <Text variant="caption" color="muted">
                        {user.role_label ?? t(`multiUser:roles.${user.role}`)} ·{' '}
                        {t(`multiUser:status.${user.status}`)}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </Card>
          )}
        </View>

        {/* Bekleyen Davetler */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            {t('multiUser:invites.pendingInvites')}
          </Text>
          {invitesLoading ? (
            <Card>
              <Text variant="body" color="muted">{t('common:status.loading')}</Text>
            </Card>
          ) : invitesError ? (
            <Card>
              <Text variant="body" style={{ color: colors.error }}>
                {t('common:status.error')}: {(invitesError as Error).message}
              </Text>
            </Card>
          ) : !invites?.length ? (
            <Card>
              <Text variant="body" color="muted">{t('multiUser:invites.noInvites')}</Text>
            </Card>
          ) : (
            <Card padding="none">
              {invites.map((invite, index) => (
                <View key={invite.id}>
                  {index > 0 && <View style={styles.divider} />}
                  <View style={styles.inviteRow}>
                    <View style={styles.inviteInfo}>
                      <Text variant="body" style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                        {invite.invite_code}
                      </Text>
                      <Text variant="caption" color="muted">
                        {invite.role_label ?? t(`multiUser:roles.${invite.role}`)}
                        {invite.member_label
                          ? ` · ${invite.member_label}`
                          : invite.invited_email
                            ? ` · ${invite.invited_email}`
                            : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleCancelInvite(invite.id)}
                      style={styles.cancelButton}
                    >
                      <Text variant="caption" style={{ color: colors.error }}>
                        {t('multiUser:invites.cancelInvite')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>

      <UserEditSheet
        user={editingUser}
        visible={!!editingUser}
        onClose={() => setEditingUser(null)}
      />
    </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  inviteInfo: {
    flex: 1,
    gap: 2,
  },
  cancelButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  inviteButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
