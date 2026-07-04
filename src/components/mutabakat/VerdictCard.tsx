import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertCircle, AlertTriangle, XCircle, Share2 } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import type { MutabakatDurum } from '@/lib/mutabakat';

interface VerdictCardProps {
  durum: MutabakatDurum;
  kapanisFarkKurus: number | null;
  currency?: string;
  onShare: () => void;
}

const VERDICT_STYLE: Record<MutabakatDurum, { bg: string; fg: string }> = {
  mutabik: { bg: colors.successLight, fg: colors.success },
  fark_aciklandi: { bg: colors.orangeLight, fg: colors.orange },
  bakiye_teyitsiz: { bg: colors.warningLight, fg: colors.warning },
  mutabik_degil: { bg: colors.errorLight, fg: colors.error },
};

const VERDICT_ICON: Record<MutabakatDurum, typeof CheckCircle2> = {
  mutabik: CheckCircle2,
  fark_aciklandi: AlertCircle,
  bakiye_teyitsiz: AlertTriangle,
  mutabik_degil: XCircle,
};

export function VerdictCard({ durum, kapanisFarkKurus, currency, onShare }: VerdictCardProps) {
  const { t } = useTranslation('mutabakat');
  const style = VERDICT_STYLE[durum];
  const Icon = VERDICT_ICON[durum];
  const farkVar =
    (durum === 'mutabik_degil' || durum === 'fark_aciklandi') &&
    kapanisFarkKurus !== null &&
    kapanisFarkKurus !== 0;

  return (
    <View style={[styles.card, { backgroundColor: style.bg }]}>
      <View style={styles.headerRow}>
        <Icon size={28} color={style.fg} />
        <View style={styles.headerText}>
          <Text variant="h3" style={{ color: style.fg }}>
            {t(`verdict.${durum}`)}
          </Text>
          {farkVar ? (
            <Text variant="bodySmall" color="secondary">
              {t('verdict.closingDiff', {
                amount: formatCurrency(Math.abs(kapanisFarkKurus) / 100, currency),
              })}
            </Text>
          ) : null}
          <Text variant="bodySmall" color="secondary">
            {t(`verdict.${durum}Desc`)}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={styles.shareButton} onPress={onShare}>
        <Share2 size={16} color={colors.primary} />
        <Text variant="label" style={{ color: colors.primary }}>
          {t('share.button')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
});
