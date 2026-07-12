/**
 * FinishSetupCard — ana ekranda "Kurulumu bitir" kartı (onboarding v1.5).
 *
 * Yarım-kurulum işletmelere 4 adımlık ilerleme gösterir: sektör · banka · cari ·
 * ilk işlem. Tamamlanan adım üstü çizili + yeşil tik; eksik adıma dokununca ilgili
 * ekrana gider. Sağ üstteki X ile "şimdilik gizle".
 *
 * Salt sunum bileşeni — veri/gösterim kararı useSetupProgress'te, rota yönlendirmesi
 * çağıran ekranda (onStepPress).
 */
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import type { DimensionValue } from 'react-native';
import { CheckCircle2, Circle, ChevronRight, Sparkles, X } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';
import { Text } from './Text';
import { useTranslation } from 'react-i18next';
import type { SetupStep, SetupStepKey } from '@/hooks/useSetupProgress';

interface FinishSetupCardProps {
  steps: SetupStep[];
  completedCount: number;
  totalCount: number;
  onStepPress: (key: SetupStepKey) => void;
  onDismiss: () => void;
}

export function FinishSetupCard({
  steps,
  completedCount,
  totalCount,
  onStepPress,
  onDismiss,
}: FinishSetupCardProps) {
  const { t } = useTranslation('common');

  const progressWidth = `${Math.round((completedCount / totalCount) * 100)}%` as DimensionValue;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Sparkles size={20} color={colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text variant="body" style={styles.title}>
            {t('setupCard.title')}
          </Text>
          <Text variant="caption" color="secondary">
            {t('setupCard.subtitle', { done: completedCount, total: totalCount })}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={HIT_SLOP.md}
          style={styles.dismissBtn}
          accessibilityLabel={t('buttons.close')}
        >
          <X size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: progressWidth }]} />
      </View>

      <View style={styles.steps}>
        {steps.map((step) => (
          <TouchableOpacity
            key={step.key}
            style={styles.stepRow}
            onPress={() => onStepPress(step.key)}
            activeOpacity={step.done ? 1 : 0.6}
            disabled={step.done}
          >
            {step.done ? (
              <CheckCircle2 size={20} color={colors.success} />
            ) : (
              <Circle size={20} color={colors.textMuted} />
            )}
            <Text variant="body" style={[styles.stepLabel, step.done && styles.stepLabelDone]}>
              {t(`setupCard.steps.${step.key}`)}
            </Text>
            {!step.done && <ChevronRight size={18} color={colors.textMuted} />}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '33',
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontWeight: '700',
    color: colors.text,
  },
  dismissBtn: {
    padding: spacing.xs,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  steps: {
    marginTop: spacing.xs,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  stepLabel: {
    flex: 1,
    color: colors.text,
  },
  stepLabelDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
});
