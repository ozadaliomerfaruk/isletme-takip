import { useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('ocrImport');
  const ctx = useFotoImportContext();

  // When this page gains focus (e.g. swipe back from review), reset step to invoice-list if needed
  useFocusEffect(
    useCallback(() => {
      if ((ctx.step === 'review' || ctx.step === 'done') && ctx.entries.length > 0) {
        ctx.setStep('invoice-list');
        ctx.setSelectedIndex(null);
      }
    }, [ctx.step, ctx.entries.length])
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
          onSaveAllBuy={() => ctx.handleSaveAllWithDirection('giris')}
          onSaveAllSell={() => ctx.handleSaveAllWithDirection('cikis')}
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
