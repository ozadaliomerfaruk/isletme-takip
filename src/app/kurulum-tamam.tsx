/**
 * Kurulum 3/3 — Kutlama + bildirim izni pre-prompt'u (Onboarding v1.5)
 *
 * "Defterin açıldı" + güncel kasa bakiyesi kartı. Bildirim izni TAM BURADA istenir:
 * kullanıcı değeri görmüşken ("Gün sonunda hatırlatayım mı?") önce kendi ekranımızla
 * sorulur, evet derse sistem izni gösterilir. Açılışta otomatik izin sorma kaldırıldı.
 */
import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, BarChart3, BellRing } from 'lucide-react-native';

import { Text, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useAuthContext } from '@/contexts/AuthContext';
import { registerForPushNotificationsAsync, savePushToken } from '@/lib/notifications';
import { logEvent } from '@/lib/appEvents';
import { clearNeedsSetup } from '@/lib/setupFlow';

export default function KurulumTamam() {
  const router = useRouter();
  const { t } = useTranslation(['auth']);
  const { user } = useAuthContext();
  const [requestingPermission, setRequestingPermission] = useState(false);

  const finish = () => {
    logEvent('setup_completed');
    clearNeedsSetup();
    router.replace('/(tabs)');
  };

  const handleAllowReminders = async () => {
    if (requestingPermission) return;
    setRequestingPermission(true);
    try {
      logEvent('push_preprompt_answered', { answer: 'yes' });
      const token = await registerForPushNotificationsAsync({ promptIfNeeded: true });
      if (token && user) {
        await savePushToken(user.id, token);
      }
      logEvent('push_permission_result', { granted: !!token });
    } catch {
      // İzin akışı hatası kutlamayı bloklamasın
    } finally {
      setRequestingPermission(false);
      finish();
    }
  };

  const handleNotNow = () => {
    logEvent('push_preprompt_answered', { answer: 'not_now' });
    finish();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.celebration}>
          <View style={styles.checkContainer}>
            <CheckCircle2 size={64} color={colors.success} />
          </View>
          <Text variant="h1" center style={styles.title}>
            {t('auth:setup.done.title')}
          </Text>
          <Text variant="body" color="secondary" center style={styles.subtitle}>
            {t('auth:setup.done.subtitle')}
          </Text>
        </View>

        <View style={styles.tipCard}>
          <View style={styles.tipIcon}>
            <BarChart3 size={22} color={colors.primary} />
          </View>
          <View style={styles.tipText}>
            <Text variant="body" style={styles.tipTitle}>
              {t('auth:setup.done.tip.title')}
            </Text>
            <Text variant="caption" color="secondary" style={styles.tipBody}>
              {t('auth:setup.done.tip.body')}
            </Text>
          </View>
        </View>

        <View style={styles.promptCard}>
          <View style={styles.promptIcon}>
            <BellRing size={24} color={colors.warning} />
          </View>
          <Text variant="body" style={styles.promptTitle}>
            {t('auth:setup.done.reminderTitle')}
          </Text>
          <Text variant="caption" color="secondary" center style={styles.promptDescription}>
            {t('auth:setup.done.reminderDescription')}
          </Text>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleAllowReminders}
            loading={requestingPermission}
            style={styles.promptButton}
          >
            {t('auth:setup.done.reminderYes')}
          </Button>
          <TouchableOpacity onPress={handleNotNow} disabled={requestingPermission} style={styles.notNowButton}>
            <Text variant="body" color="secondary" style={styles.notNowText}>
              {t('auth:setup.done.reminderNotNow')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  celebration: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  checkContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.success + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    marginBottom: spacing.sm,
  },
  subtitle: {
    paddingHorizontal: spacing.lg,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  tipIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: {
    flex: 1,
    gap: 2,
  },
  tipTitle: {
    fontWeight: '700',
  },
  tipBody: {
    lineHeight: 18,
  },
  promptCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  promptIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.warning + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  promptTitle: {
    fontWeight: '700',
    fontSize: 16,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  promptDescription: {
    marginBottom: spacing.lg,
  },
  promptButton: {
    marginBottom: spacing.sm,
  },
  notNowButton: {
    padding: spacing.sm,
  },
  notNowText: {
    textDecorationLine: 'underline',
  },
});
