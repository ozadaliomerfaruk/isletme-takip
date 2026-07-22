import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertCircle, AlertTriangle, XCircle, Share as ShareIcon } from 'lucide-react-native';
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

// bg: açık zemin · icon: parlak vurgu (ikon) · text: KOYU ton (başlık, açık zeminde okunur)
const VERDICT_STYLE: Record<MutabakatDurum, { bg: string; icon: string; text: string }> = {
  mutabik: { bg: colors.successLight, icon: colors.success, text: colors.successDark },
  fark_aciklandi: { bg: colors.orangeLight, icon: colors.orange, text: colors.orangeDark },
  bakiye_teyitsiz: { bg: colors.warningLight, icon: colors.warning, text: colors.warningDark },
  mutabik_degil: { bg: colors.errorLight, icon: colors.error, text: colors.errorDark },
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
        <Icon size={34} color={style.icon} />
        <View style={styles.headerText}>
          <Text variant="h2" bold style={{ color: style.text }}>
            {t(`verdict.${durum}`)}
          </Text>
          {farkVar ? (
            <Text variant="body" bold style={{ color: style.text }}>
              {t('verdict.closingDiff', {
                amount: formatCurrency(Math.abs(kapanisFarkKurus) / 100, currency),
              })}
            </Text>
          ) : null}
          <Text variant="body" color="secondary">
            {t(`verdict.${durum}Desc`)}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={styles.shareButton} onPress={onShare}>
        <ShareIcon size={18} color={colors.primary} />
        <Text variant="body" bold style={{ color: colors.primary }}>
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
