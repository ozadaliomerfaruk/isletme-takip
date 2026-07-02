import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertTriangle, XCircle, Share2 } from 'lucide-react-native';
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
  bakiye_teyitsiz: { bg: colors.warningLight, fg: colors.warning },
  mutabik_degil: { bg: colors.errorLight, fg: colors.error },
};

export function VerdictCard({ durum, kapanisFarkKurus, currency, onShare }: VerdictCardProps) {
  const { t } = useTranslation('mutabakat');
  const style = VERDICT_STYLE[durum];
  const Icon = durum === 'mutabik' ? CheckCircle2 : durum === 'bakiye_teyitsiz' ? AlertTriangle : XCircle;

  return (
    <View style={[styles.card, { backgroundColor: style.bg }]}>
      <View style={styles.headerRow}>
        <Icon size={28} color={style.fg} />
        <View style={styles.headerText}>
          <Text variant="h3" style={{ color: style.fg }}>
            {t(`verdict.${durum}`)}
          </Text>
          {durum === 'mutabik_degil' && kapanisFarkKurus !== null && kapanisFarkKurus !== 0 ? (
            <Text variant="bodySmall" color="secondary">
              {t('verdict.closingDiff', {
                amount: formatCurrency(Math.abs(kapanisFarkKurus) / 100, currency),
              })}
            </Text>
          ) : durum !== 'mutabik_degil' ? (
            <Text variant="bodySmall" color="secondary">
              {t(`verdict.${durum}Desc`)}
            </Text>
          ) : null}
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
