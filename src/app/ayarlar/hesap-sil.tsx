import { useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Trash2, AlertTriangle, Clock } from 'lucide-react-native';
import { Text, Button, Input, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useAuthContext } from '@/contexts/AuthContext';

export default function HesapSilPage() {
  const router = useRouter();
  const { t } = useTranslation(['settings', 'common', 'errors']);
  const { isletme, deleteAccount, loading } = useAuthContext();
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const isletmeAdi = isletme?.name || '';
  const isConfirmValid = confirmText.trim().toLowerCase() === isletmeAdi.trim().toLowerCase();

  const handleDelete = async () => {
    if (!isConfirmValid) {
      Alert.alert(t('common:status.error'), t('settings:messages.confirmBusinessName'));
      return;
    }

    Alert.alert(
      t('settings:account.deleteRequestTitle'),
      t('settings:account.deleteRequestDescription'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('settings:account.confirmDeleteButton'),
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteAccount();
              Alert.alert(
                t('settings:account.deleteRequestCreated'),
                t('settings:account.deleteRequestCreatedMessage')
              );
            } catch (error) {
              if (__DEV__) {
                console.error('Delete account error:', error);
              }
              setIsDeleting(false);
              Alert.alert(t('common:status.error'), t('settings:messages.deleteRequestFailed'));
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <AlertTriangle size={64} color={colors.error} />
          </View>

          <Text variant="h2" style={styles.title}>
            {t('settings:account.deleteTitle')}
          </Text>

          <Text variant="body" color="secondary" style={styles.description}>
            {t('settings:account.deleteDescription')}
          </Text>

          <Card style={styles.warningCard}>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">{t('settings:account.deleteWarnings.transactions')}</Text>
            </View>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">{t('settings:account.deleteWarnings.accounts')}</Text>
            </View>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">{t('settings:account.deleteWarnings.clients')}</Text>
            </View>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">{t('settings:account.deleteWarnings.personnel')}</Text>
            </View>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">{t('settings:account.deleteWarnings.categories')}</Text>
            </View>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">{t('settings:account.deleteWarnings.business')}</Text>
            </View>
          </Card>

          <Text variant="body" color="secondary" style={styles.confirmLabel}>
            {t('settings:account.confirmLabel')}
          </Text>

          <Text variant="h3" color="primary" style={styles.isletmeAdi}>
            "{isletmeAdi}"
          </Text>

          <Input
            placeholder={t('settings:account.confirmPlaceholder')}
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.buttonContainer}>
            <Button
              variant="outline"
              onPress={() => router.back()}
              style={styles.cancelButton}
              disabled={isDeleting}
            >
              {t('common:buttons.cancel')}
            </Button>

            <Button
              variant="primary"
              onPress={handleDelete}
              disabled={!isConfirmValid || isDeleting}
              loading={isDeleting}
              style={[styles.deleteButton, { backgroundColor: isConfirmValid ? colors.error : colors.textMuted }]}
              icon={<Trash2 size={18} color={colors.surface} />}
            >
              {t('settings:account.deleteAccount')}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  description: {
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  warningCard: {
    backgroundColor: colors.errorLight,
    marginBottom: spacing.xl,
  },
  warningItem: {
    marginBottom: spacing.xs,
  },
  confirmLabel: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  isletmeAdi: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  cancelButton: {
    flex: 1,
  },
  deleteButton: {
    flex: 1,
  },
});
