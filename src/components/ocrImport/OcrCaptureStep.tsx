import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Camera, Images, Lightbulb, ScanLine, AlertTriangle } from 'lucide-react-native';
import { Text, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';

interface OcrCaptureStepProps {
  onTakePhoto: () => void;
  onPickImages: () => void;
  isLoading: boolean;
  capturedCount?: number;
  remainingUsage?: number;
  dailyLimit?: number;
}

export function OcrCaptureStep({
  onTakePhoto,
  onPickImages,
  isLoading,
  capturedCount = 0,
  remainingUsage,
  dailyLimit = 20,
}: OcrCaptureStepProps) {
  const { t } = useTranslation('ocrImport');

  const isExhausted = remainingUsage !== undefined && remainingUsage <= 0;
  const isLow = remainingUsage !== undefined && remainingUsage > 0 && remainingUsage <= 5;

  const quotaBannerColor = isExhausted
    ? colors.error
    : isLow
      ? colors.warning
      : colors.primary;

  const quotaBannerBg = isExhausted
    ? colors.errorLight
    : isLow
      ? colors.warningLight
      : colors.primaryLight;

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Camera size={64} color={colors.primary} />
        {capturedCount > 0 && (
          <View style={styles.badge}>
            <Text variant="caption" style={styles.badgeText}>{capturedCount}</Text>
          </View>
        )}
      </View>
      <Text variant="h2" style={styles.title}>{t('capture.title')}</Text>
      {capturedCount > 0 && (
        <Text variant="body" color="success" style={styles.capturedInfo}>
          {t('batch.photosAdded', { count: capturedCount })}
        </Text>
      )}

      {/* Quota banner */}
      {remainingUsage !== undefined && (
        <View style={[styles.quotaBanner, { backgroundColor: quotaBannerBg, borderColor: quotaBannerColor + '40' }]}>
          {isExhausted ? (
            <AlertTriangle size={16} color={quotaBannerColor} />
          ) : (
            <ScanLine size={16} color={quotaBannerColor} />
          )}
          <Text variant="caption" style={{ color: quotaBannerColor, fontWeight: '600', flex: 1 }}>
            {isExhausted
              ? `Günlük tarama limitine ulaştınız (${dailyLimit}/${dailyLimit})`
              : `${remainingUsage}/${dailyLimit} tarama hakkı`
            }
          </Text>
        </View>
      )}

      {/* Tips */}
      <View style={styles.tipsContainer}>
        <View style={styles.tipsHeader}>
          <Lightbulb size={16} color={colors.warning} />
          <Text variant="label" color="secondary">{t('capture.tips')}</Text>
        </View>
        <Text variant="caption" color="secondary" style={styles.tipText}>{t('capture.tip1')}</Text>
        <Text variant="caption" color="secondary" style={styles.tipText}>{t('capture.tip2')}</Text>
        <Text variant="caption" color="secondary" style={styles.tipText}>{t('capture.tip3')}</Text>
        <Text variant="caption" color="secondary" style={styles.tipText}>{t('capture.tip4')}</Text>
      </View>

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        <Button
          variant="primary"
          size="lg"
          icon={<Camera size={20} color={isExhausted ? colors.textMuted : colors.white} />}
          iconPosition="left"
          onPress={onTakePhoto}
          loading={isLoading}
          disabled={isExhausted}
          style={styles.button}
        >
          {t('capture.takePhoto')}
        </Button>
        <Button
          variant="outline"
          size="lg"
          icon={<Images size={20} color={isExhausted ? colors.textMuted : colors.primary} />}
          iconPosition="left"
          onPress={onPickImages}
          loading={isLoading}
          disabled={isExhausted}
          style={styles.button}
        >
          {t('capture.pickImages')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  quotaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  tipsContainer: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tipText: {
    paddingLeft: spacing.lg,
  },
  buttonContainer: {
    width: '100%',
    gap: spacing.md,
  },
  button: {
    width: '100%',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 12,
  },
  capturedInfo: {
    marginBottom: spacing.md,
  },
});
