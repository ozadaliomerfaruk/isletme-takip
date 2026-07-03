import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, Scale, Upload } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';

interface SelectStepProps {
  cariName: string;
  balance: number;
  balanceLabel: string;
  currency?: string;
  onPickFile: () => void;
  picking: boolean;
}

export function SelectStep({ cariName, balance, balanceLabel, currency, onPickFile, picking }: SelectStepProps) {
  const { t } = useTranslation('mutabakat');
  const steps = [t('select.step1'), t('select.step2'), t('select.step3')];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Scale size={34} color={colors.primary} />
        </View>
        <Text variant="h2" center>
          {t('select.heading')}
        </Text>
        <Text variant="body" color="secondary" center style={styles.subtitle}>
          {t('select.subtitle')}
        </Text>
      </View>

      {/* Cari + bakiye */}
      <View style={styles.cariCard}>
        <Text variant="h3" numberOfLines={1}>
          {cariName}
        </Text>
        <Text variant="body" color="secondary">
          {t('select.balanceLabel')}:{' '}
          <Text variant="body" bold color={balance < 0 ? 'error' : 'success'}>
            {formatCurrency(Math.abs(balance), currency)}
          </Text>{' '}
          ({balanceLabel})
        </Text>
      </View>

      {/* Nasıl çalışır */}
      <View style={styles.steps}>
        {steps.map((label, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text variant="label" style={{ color: colors.primary }}>
                {i + 1}
              </Text>
            </View>
            <Text variant="body" style={styles.stepText}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      {/* Yükleme kartı */}
      <TouchableOpacity
        style={styles.uploadCard}
        onPress={onPickFile}
        disabled={picking}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ disabled: picking, busy: picking }}
      >
        {picking ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Upload size={32} color={colors.primary} />
        )}
        <Text variant="h3" style={{ color: colors.primary }}>
          {t('select.uploadTitle')}
        </Text>
        <Text variant="bodySmall" color="secondary" center>
          {t('select.uploadHint')}
        </Text>
        <View style={styles.formatChips}>
          {['.xlsx', '.xls', '.csv'].map((ext) => (
            <View key={ext} style={styles.chip}>
              <FileSpreadsheet size={13} color={colors.textSecondary} />
              <Text variant="label" color="secondary">
                {ext}
              </Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>

      <Text variant="caption" color="muted" center>
        {t('select.formats')}
      </Text>
      <Text variant="caption" color="muted" center style={styles.currencyNote}>
        {t('select.currencyNote', { currency: currency ?? 'TRY' })}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    paddingHorizontal: spacing.md,
  },
  cariCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  steps: {
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
  },
  uploadCard: {
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.lg,
  },
  formatChips: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  currencyNote: {
    paddingHorizontal: spacing.lg,
  },
});
