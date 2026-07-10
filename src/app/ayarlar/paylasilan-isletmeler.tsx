import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, LogOut } from 'lucide-react-native';
import { Text, Card, Input, Button, Avatar } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { useSharedIsletmeler, useAcceptInvite, useUpdateUserStatus } from '@/hooks/useMultiUser';

export default function PaylasilanIsletmelerPage() {
  const router = useRouter();
  const { t } = useTranslation(['multiUser', 'common']);
  const { user, switchToSharedIsletme } = useAuthContext();
  const { data: sharedIsletmeler, isLoading } = useSharedIsletmeler();
  const acceptInvite = useAcceptInvite();
  const updateUserStatus = useUpdateUserStatus();

  const [inviteCode, setInviteCode] = useState('');

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
          headerTitle: t('multiUser:shared.title'),
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
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
