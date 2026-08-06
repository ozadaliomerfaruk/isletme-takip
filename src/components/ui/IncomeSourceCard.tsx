import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Banknote, Landmark, CreditCard, PiggyBank, Wallet, User, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatPercent, signedCurrencyText } from '@/lib/currency';
import { useSettings } from '@/hooks/useSettings';
import type { IncomeSourceItem } from '@/hooks/useAccountReport';
import {
  formatReportLensValue,
  type IncomeExpenseLens,
} from '@/lib/reportLens';

// Kaynak (hesap tipi / cari / personel) → ikon + renk
const META: Record<string, { icon: LucideIcon; color: string }> = {
  nakit: { icon: Banknote, color: '#10B981' },
  banka: { icon: Landmark, color: '#3B82F6' },
  kredi_karti: { icon: CreditCard, color: '#8B5CF6' },
  birikim: { icon: PiggyBank, color: '#F59E0B' },
  diger: { icon: Wallet, color: '#6B7280' },
  cari: { icon: User, color: '#06B6D4' },
  personel: { icon: User, color: '#EC4899' },
};

interface IncomeSourceCardProps {
  item: IncomeSourceItem;
  lens?: IncomeExpenseLens;
  onPress?: () => void;
}

export function IncomeSourceCard({ item, lens = 'nominal', onPress }: IncomeSourceCardProps) {
  const { t } = useTranslation(['reports']);
  const { currency: baseCurrency } = useSettings();
  const metaKey = item.kind === 'hesap' ? item.type : item.kind;
  const meta = META[metaKey] ?? META.diger;
  const Icon = meta.icon;
  const barColor = meta.color;
  const showBase = lens === 'nominal' && item.currency !== baseCurrency;
  const displayTotal = lens === 'nominal' ? item.totalNative : item.total;
  const displayAmount = lens === 'nominal'
    ? signedCurrencyText(item.totalNative, item.currency)
    : formatReportLensValue(item.total, lens);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <View style={styles.leftSection}>
          <View style={[styles.iconContainer, { backgroundColor: barColor + '20' }]}>
            <Icon size={20} color={barColor} />
          </View>
          <View style={styles.textContainer}>
            <Text variant="body" numberOfLines={1} style={styles.name}>
              {item.name}
            </Text>
            <Text variant="caption" color="secondary">
              {t('reports:counts.transaction', { count: item.count })}
            </Text>
          </View>
        </View>

        <View style={styles.rightSection}>
          <View style={styles.amountContainer}>
            {/* Net NEGATİF olabilir (iade > satış). formatCurrency işareti düşürdüğü
                ve renk sabit "success" olduğu için böyle bir kaynak hem artı hem
                YEŞİL görünüyordu — yani zarar kâr gibi okunuyordu. */}
            <Text color={displayTotal < 0 ? 'error' : 'success'} style={styles.amount}>
              {displayAmount}
            </Text>
            {showBase && (
              <Text variant="caption" color="secondary" style={styles.baseAmount}>
                ≈ {signedCurrencyText(item.total, baseCurrency)}
              </Text>
            )}
            <View style={[styles.percentageBadge, { backgroundColor: barColor + '18' }]}>
              <Text style={[styles.percentageText, { color: barColor }]}>
                {formatPercent(item.percentage ?? 0, 1)}
              </Text>
            </View>
          </View>
          {onPress && <ChevronRight size={18} color={colors.textMuted} />}
        </View>
      </View>

      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBar, { width: `${Math.min(item.percentage ?? 0, 100)}%`, backgroundColor: barColor }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Yapışık düz-liste görünümü (cariler dili): kutu değil satır, ayrım 1px çizgi
  container: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  leftSection: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconContainer: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  textContainer: { flex: 1 },
  name: { fontWeight: '600' },
  rightSection: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  amountContainer: { alignItems: 'flex-end' },
  amount: { fontSize: 16, fontWeight: '700' },
  baseAmount: { fontSize: 11, marginTop: 1 },
  percentageBadge: { borderRadius: borderRadius.sm, paddingHorizontal: spacing.xs, paddingVertical: 1, marginTop: 2 },
  percentageText: { fontSize: 11, fontWeight: '600' },
  progressBarContainer: { height: 6, backgroundColor: colors.surfaceLighter, borderRadius: borderRadius.full, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: borderRadius.full },
});
