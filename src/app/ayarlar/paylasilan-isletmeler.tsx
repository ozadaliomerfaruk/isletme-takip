import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, LogOut, UserPlus, ChevronRight } from 'lucide-react-native';
import { Text, Card, Input, Button, Avatar } from '@/components/ui';
import { UserEditSheet } from '@/components/multiUser/UserEditSheet';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  useSharedIsletmeler,
  useAcceptInvite,
  useUpdateUserStatus,
  useIsletmeUsers,
  useIsletmeInvites,
  useCancelInvite,
} from '@/hooks/useMultiUser';
import type { IsletmeUser } from '@/types/multiUser';

export default function PaylasilanIsletmelerPage() {
  const router = useRouter();
  const { t } = useTranslation(['multiUser', 'common']);
  const { user, isOwner, switchToSharedIsletme } = useAuthContext();

  // Üyelik tarafı (herkes)
  const { data: sharedIsletmeler, isLoading } = useSharedIsletmeler();
  const acceptInvite = useAcceptInvite();
  const updateUserStatus = useUpdateUserStatus();
  const [inviteCode, setInviteCode] = useState('');

  // Sahiplik tarafı (yalnızca işletme sahibi) — hook'lar koşulsuz çağrılır,
  // isOwner değilse bölüm render edilmez.
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

  const handleAcceptInvite = async () => {
    if (!inviteCode.trim()) return;
    try {
      await acceptInvite.mutateAsync(inviteCode.trim());
      setInviteCode('');
      Alert.alert(t('multiUser:success.inviteAccepted'));
    } catch (error: unknown) {
      Alert.alert(t('common:status.error'), (error as Error)?.message ?? t('common:status.error'));
    }
  };

  const handleSwitchTo = async (item: typeof sharedIsletmeler extends (infer T)[] | undefined ? T : never) => {
    if (!item?.isletme || !item.permissions || !user) return;
    try {
      // Sunucudan taze izinleri doğrula
      const { data: freshData, error } = await supabase
        .from('isletme_users')
        .select('permissions, role, status')
        .eq('isletme_id', item.isletme_id)
        .eq('user_id', user.id)
        .single();

      if (error || !freshData || freshData.status !== 'active') {
        Alert.alert(t('common:status.error'), t('multiUser:errors.accessRevoked'));
        return;
      }

      await switchToSharedIsletme(item.isletme, freshData.permissions, freshData.role);
      // dismissTo (POP_TO): kök Stack'i mevcut (tabs)'a collapse eder. Bu ekran her zaman (tabs)
      // DIŞINDA (ayarlar detayı) olduğundan koşulsuz. replace YENİ (tabs) kopyası yığardı (RN7).
      router.dismissTo('/(tabs)');
    } catch {
      Alert.alert(t('common:status.error'), t('multiUser:errors.switchFailed'));
    }
  };

  const handleLeave = (item: typeof sharedIsletmeler extends (infer T)[] | undefined ? T : never) => {
    Alert.alert(
      t('common:buttons.confirm'),
      t('multiUser:shared.leaveConfirm'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.confirm'),
          style: 'destructive',
          onPress: () => {
            updateUserStatus.mutate({
              userId: user!.id,
              isletmeId: item.isletme_id,
              status: 'removed',
            });
          },
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: t('multiUser:shared.pageTitle'),
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* ── SAHİPLİK TARAFI: Bu işletmeyi paylaş (yalnızca sahip) ── */}
        {isOwner && (
          <>
            {/* Davet Butonu */}
            <View style={styles.section}>
              <Text variant="label" color="secondary" style={styles.sectionTitle}>
                {t('multiUser:shared.ownerSectionTitle')}
              </Text>
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

            <View style={styles.sectionDivider} />
          </>
        )}

        {/* ── ÜYELİK TARAFI: Bana paylaşılan işletmeler (herkes) ── */}

        {/* Davet Kodu Gir */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            {t('multiUser:shared.enterCode')}
          </Text>
          <Card>
            <View style={styles.codeInputContainer}>
              <Input
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder={t('multiUser:shared.codePlaceholder')}
                autoCapitalize="characters"
                style={styles.codeInput}
              />
              <Button
                onPress={handleAcceptInvite}
                loading={acceptInvite.isPending}
                variant="primary"
                disabled={!inviteCode.trim()}
              >
                {t('multiUser:shared.acceptInvite')}
              </Button>
            </View>
          </Card>
        </View>

        {/* Paylaşılan İşletmeler */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            {t('multiUser:shared.title')}
          </Text>
          {isLoading ? (
            <Card>
              <Text variant="body" color="muted">{t('common:status.loading')}</Text>
            </Card>
          ) : !sharedIsletmeler?.length ? (
            <Card>
              <Text variant="body" color="muted">{t('multiUser:shared.empty')}</Text>
            </Card>
          ) : (
            <Card padding="none">
              {sharedIsletmeler.map((item, index) => (
                <View key={item.id}>
                  {index > 0 && <View style={styles.divider} />}
                  <View style={styles.isletmeRow}>
                    <Avatar name={item.isletme?.name ?? '?'} size={40} />
                    <View style={styles.isletmeInfo}>
                      <Text variant="body" numberOfLines={1}>
                        {item.isletme?.name ?? '?'}
                      </Text>
                      <Text variant="caption" color="muted">
                        {item.role_label ?? t(`multiUser:roles.${item.role}`)}
                      </Text>
                    </View>
                    <View style={styles.isletmeActions}>
                      <TouchableOpacity
                        style={styles.switchButton}
                        onPress={() => handleSwitchTo(item)}
                      >
                        <ArrowRightLeft size={14} color={colors.primary} />
                        <Text variant="caption" style={{ color: colors.primary }}>
                          {t('multiUser:shared.switchTo')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.leaveButton}
                        onPress={() => handleLeave(item)}
                      >
                        <LogOut size={14} color={colors.error} />
                      </TouchableOpacity>
                    </View>
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
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
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
  codeInputContainer: {
    gap: spacing.md,
  },
  codeInput: {
    fontFamily: 'monospace',
    textAlign: 'center',
    fontSize: 18,
    letterSpacing: 4,
  },
  isletmeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  isletmeInfo: {
    flex: 1,
    gap: 2,
  },
  isletmeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
  },
  leaveButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
