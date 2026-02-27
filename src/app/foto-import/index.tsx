import { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '@/components/ui';
import {
  OcrCaptureStep,
  OcrBatchProcessingOverlay,
  OcrInvoiceList,
} from '@/components/ocrImport';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useFotoImportContext } from '@/contexts/FotoImportContext';

export default function FotoImportIndexPage() {
  const { t } = useTranslation(['ocrImport', 'common']);
  const ctx = useFotoImportContext();
  const navigation = useNavigation();
  const router = useRouter();
  const wasUnfocused = useRef(false);

  // Protect against accidental back navigation when entries exist.
  // - capture step with entries → back button returns to invoice-list, swipe disabled
  // - invoice-list step with unsaved entries → back button asks for confirmation, swipe disabled
  const hasUnsavedEntries = ctx.entries.length > 0 && ctx.entries.some(e => !e.isSaved);
  const inCaptureWithEntries = ctx.step === 'capture' && ctx.entries.length > 0;
  const inListWithEntries = (ctx.step === 'invoice-list' || (ctx.step === 'review' && ctx.entries.length > 0)) && hasUnsavedEntries;
  const shouldDisableGesture = inCaptureWithEntries || inListWithEntries;

  useEffect(() => {
    const getHeaderLeft = () => {
      if (inCaptureWithEntries) {
        // Return to invoice-list instead of leaving
        const CaptureBackButton = () => (
          <TouchableOpacity
            onPress={() => ctx.setStep('invoice-list')}
            style={{ padding: 8, marginLeft: Platform.OS === 'ios' ? -8 : 0 }}
            hitSlop={8}
          >
            <ChevronLeft size={28} color={colors.text} />
          </TouchableOpacity>
        );
        return CaptureBackButton;
      }
      if (inListWithEntries) {
        // Confirm before losing unsaved entries
        const ListBackButton = () => (
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                t('common:status.warning'),
                t('ocrImport:messages.unsavedWarning'),
                [
                  { text: t('common:buttons.cancel'), style: 'cancel' },
                  { text: t('common:buttons.leave'), style: 'destructive', onPress: () => router.back() },
                ]
              );
            }}
            style={{ padding: 8, marginLeft: Platform.OS === 'ios' ? -8 : 0 }}
            hitSlop={8}
          >
            <ChevronLeft size={28} color={colors.text} />
          </TouchableOpacity>
        );
        return ListBackButton;
      }
      return undefined;
    };

    navigation.setOptions({
      gestureEnabled: !shouldDisableGesture,
      headerLeft: getHeaderLeft(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, shouldDisableGesture, inCaptureWithEntries, inListWithEntries]);

  // Only reset step when page truly regains focus after being in the background
  // (e.g. native swipe-back from review). Do NOT reset on initial mount or
  // when step changes while this page is still focused.
  useFocusEffect(
    useCallback(() => {
      if (wasUnfocused.current) {
        // Coming back from review → show invoice list
        if (ctx.entries.length > 0) {
          ctx.setStep('invoice-list');
          ctx.setSelectedIndex(null);
        }
        wasUnfocused.current = false;
      }

      return () => {
        wasUnfocused.current = true;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx.entries.length])
  );

  // Determine what to show on index
  // When review route is active in the background, show invoice-list so native swipe reveals it
  const showInvoiceList = ctx.step === 'invoice-list' || (ctx.step === 'review' && ctx.entries.length > 0);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Capture step */}
      {ctx.step === 'capture' && (
        <OcrCaptureStep
          onTakePhoto={ctx.handleTakePhoto}
          onPickImages={ctx.handlePickImages}
          isLoading={ctx.isCameraLoading}
          capturedCount={ctx.pendingUris.length}
        />
      )}

      {/* Batch processing step */}
      {ctx.step === 'processing' && ctx.processingProgress && (
        <OcrBatchProcessingOverlay progress={ctx.processingProgress} />
      )}

      {/* Processing fallback (single) */}
      {ctx.step === 'processing' && !ctx.processingProgress && (
        <View style={styles.savingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text variant="h3" style={styles.savingTitle}>{t('processing.title')}</Text>
        </View>
      )}

      {/* Invoice list step (also shown as background during review for native swipe peek) */}
      {showInvoiceList && (
        <OcrInvoiceList
          entries={ctx.entries}
          onSelectInvoice={ctx.handleSelectInvoice}
          onRemoveEntry={ctx.handleRemoveEntry}
          onSaveAll={() => ctx.handleSaveAllWithDirection('giris')}
          onAddMore={ctx.handleAddMore}
          isSaving={ctx.isSaving}
        />
      )}

      {/* Saving step */}
      {ctx.step === 'saving' && (
        <View style={styles.savingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text variant="h3" style={styles.savingTitle}>
            {ctx.saveProgress?.phase === 'creating_products'
              ? t('saving.creatingProducts')
              : t('saving.creatingMovements')
            }
          </Text>
          {ctx.saveProgress && (
            <Text variant="body" color="secondary">
              {t('saving.progress', { current: ctx.saveProgress.current, total: ctx.saveProgress.total })}
            </Text>
          )}
          {ctx.saveProgress?.currentItemName ? (
            <Text variant="caption" color="muted">{ctx.saveProgress.currentItemName}</Text>
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  savingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  savingTitle: {
    marginTop: spacing.lg,
  },
});
