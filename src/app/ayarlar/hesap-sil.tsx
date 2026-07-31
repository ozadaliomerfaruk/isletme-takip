import { useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Trash2, AlertTriangle, LogOut } from 'lucide-react-native';
import { Text, Button, Input, Card, Screen } from '@/components/ui';
import { useFooterBottomPadding } from '@/hooks/useFooterBottomPadding';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useAuthContext } from '@/contexts/AuthContext';
import { isAppleManualRevocationRequired } from '@/lib/appleAccountDeletion';

export default function HesapSilPage() {
  const footerInset = useFooterBottomPadding();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation(['settings', 'common', 'errors']);
  const {
    user,
    ownIsletme,
    accountDeletionScheduledAt,
    deleteAccount,
    cancelAccountDeletion,
    signOut,
  } = useAuthContext();
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const hasOwnedBusiness = Boolean(ownIsletme);
  const confirmationTarget = ownIsletme?.name || user?.email || '';
  const isConfirmValid = Boolean(confirmationTarget) && (
    confirmText.trim().toLocaleLowerCase()
    === confirmationTarget.trim().toLocaleLowerCase()
  );
  const hasPendingRequest = Boolean(accountDeletionScheduledAt);

  const submitDeletionRequest = async (
    allowManualAppleRevocation = false
  ) => {
    setIsDeleting(true);
    try {
      await deleteAccount({ allowManualAppleRevocation });
      Alert.alert(
        t('settings:account.deleteRequestCreated'),
        t('settings:account.deleteRequestCreatedMessage')
      );
    } catch (error) {
      if (__DEV__) {
        console.error('Delete account error:', error);
      }

      if (
        !allowManualAppleRevocation
        && isAppleManualRevocationRequired(error)
      ) {
        Alert.alert(
          t('settings:account.appleManualRevokeTitle'),
          t('settings:account.appleManualRevokeDescription'),
          [
            { text: t('common:buttons.cancel'), style: 'cancel' },
            {
              text: t('settings:account.continueDeletion'),
              style: 'destructive',
              onPress: () => {
                void submitDeletionRequest(true);
              },
            },
          ]
        );
        return;
      }

      Alert.alert(
        t('common:status.error'),
        t('settings:messages.deleteRequestFailed')
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = async () => {
    if (!isConfirmValid) {
      Alert.alert(
        t('common:status.error'),
        t(
          hasOwnedBusiness
            ? 'settings:messages.confirmBusinessName'
            : 'settings:messages.confirmAccountIdentifier'
        )
      );
      return;
    }

    Alert.alert(
      t('settings:account.deleteRequestTitle'),
      t(
        hasOwnedBusiness
          ? 'settings:account.deleteRequestDescription'
          : 'settings:account.deleteDescriptionNoBusiness'
      ),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('settings:account.confirmDeleteButton'),
          style: 'destructive',
          onPress: () => {
            void submitDeletionRequest();
          },
        },
      ]
    );
  };

  const handleCancelPendingRequest = () => {
    Alert.alert(
      t('settings:account.cancelDeletion'),
      t('common:confirm.areYouSure'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.yes'),
          onPress: async () => {
            setIsCancelling(true);
            try {
              await cancelAccountDeletion();
              Alert.alert(
                t('common:status.success'),
                t('settings:account.deleteRequestCancelledMessage')
              );
              router.replace('/(tabs)');
            } catch (error) {
              if (__DEV__) {
                console.error('Cancel account deletion error:', error);
              }
              Alert.alert(
                t('common:status.error'),
                t('settings:messages.cancelDeletionFailed')
              );
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
      >
        {/* Onay kutusu zorunlu olduğu için klavye mutlaka açılıyor: kaydırılabilir
            olmazsa "Hesabı Sil" satırı klavyenin altında kalıp erişilemez oluyordu */}
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + footerInset }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconContainer}>
            <AlertTriangle size={64} color={colors.error} />
          </View>

          <Text variant="h2" style={styles.title}>
            {t(
              hasPendingRequest
                ? 'settings:account.pendingDeletionTitle'
                : 'settings:account.deleteTitle'
            )}
          </Text>

          <Text variant="body" color="secondary" style={styles.description}>
            {t(
              hasPendingRequest
                ? 'settings:account.pendingDeletionDescription'
                : hasOwnedBusiness
                  ? 'settings:account.deleteDescription'
                  : 'settings:account.deleteDescriptionNoBusiness'
            )}
          </Text>

          {!hasPendingRequest && (
            <Card style={styles.warningCard}>
              {hasOwnedBusiness ? (
                <>
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
                </>
              ) : (
                <View style={styles.warningItem}>
                  <Text variant="body" color="secondary">
                    {t('settings:account.sharedRecordsPreserved')}
                  </Text>
                </View>
              )}
            </Card>
          )}

          {!hasPendingRequest && (
            <>
              <Text variant="body" color="secondary" style={styles.confirmLabel}>
                {t(
                  hasOwnedBusiness
                    ? 'settings:account.confirmLabel'
                    : 'settings:account.confirmAccountLabel'
                )}
              </Text>

              <Text variant="h3" color="primary" style={styles.isletmeAdi}>
                {`"${confirmationTarget}"`}
              </Text>

              <Input
                placeholder={t(
                  hasOwnedBusiness
                    ? 'settings:account.confirmPlaceholder'
                    : 'settings:account.confirmAccountPlaceholder'
                )}
                value={confirmText}
                onChangeText={setConfirmText}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={hasOwnedBusiness ? 'default' : 'email-address'}
              />
            </>
          )}

          <View style={styles.buttonContainer}>
            <Button
              variant="outline"
              onPress={hasPendingRequest ? signOut : () => router.back()}
              style={styles.cancelButton}
              disabled={isDeleting || isCancelling}
              icon={
                hasPendingRequest
                  ? <LogOut size={18} color={colors.text} />
                  : undefined
              }
            >
              {t(
                hasPendingRequest
                  ? 'settings:account.logout'
                  : 'common:buttons.cancel'
              )}
            </Button>

            <Button
              variant="primary"
              onPress={
                hasPendingRequest
                  ? handleCancelPendingRequest
                  : handleDelete
              }
              disabled={
                isDeleting
                || isCancelling
                || (!hasPendingRequest && !isConfirmValid)
              }
              loading={hasPendingRequest ? isCancelling : isDeleting}
              style={[
                styles.deleteButton,
                {
                  backgroundColor: hasPendingRequest
                    ? colors.primary
                    : isConfirmValid
                      ? colors.error
                      : colors.textMuted,
                },
              ]}
              icon={
                hasPendingRequest
                  ? undefined
                  : <Trash2 size={18} color={colors.surface} />
              }
            >
              {t(
                hasPendingRequest
                  ? 'settings:account.cancelDeletion'
                  : 'settings:account.deleteAccount'
              )}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
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
    flexGrow: 1,
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
