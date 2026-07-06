import { View, StyleSheet } from 'react-native';
import { Banknote, Landmark, CreditCard, PiggyBank, Wallet } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import type { AccountReportItem } from '@/hooks/useAccountReport';

// Hesap tipine göre ikon + renk
const TYPE_META: Record<string, { icon: typeof Banknote; color: string }> = {
  nakit: { icon: Banknote, color: '#10B981' },
  banka: { icon: Landmark, color: '#3B82F6' },
  kredi_karti: { icon: CreditCard, color: '#8B5CF6' },
  birikim: { icon: PiggyBank, color: '#F59E0B' },
  diger: { icon: Wallet, color: '#6B7280' },
};

interface AccountReportCardProps {
  item: AccountReportItem;
  type: 'gelir' | 'gider';
  currency?: string;
}

export function AccountReportCard({ item, type, currency }: AccountReportCardProps) {
  const { t } = useTranslation(['reports']);
  const meta = TYPE_META[item.hesap.type] ?? TYPE_META.diger;
  const Icon = meta.icon;
  const barColor = meta.color;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.leftSection}>
          <View style={[styles.iconContainer, { backgroundColor: barColor + '20' }]}>
            <Icon size={20} color={barColor} />
          </View>
          <View style={styles.textContainer}>
            <Text variant="body" numberOfLines={1} style={styles.name}>
              {item.hesap.name}
            </Text>
            <Text variant="caption" color="secondary">
              {t('reports:counts.transaction', { count: item.count })}
            </Text>
          </View>
        </View>

        <View style={styles.rightSection}>
          <View style={styles.amountContainer}>
            <Text color={type === 'gelir' ? 'success' : 'error'} style={styles.amount}>
              {formatCurrency(item.total, currency)}
            </Text>
            <View style={[styles.percentageBadge, { backgroundColor: barColor + '18' }]}>
              <Text style={[styles.percentageText, { color: barColor }]}>
                %{(item.percentage ?? 0).toFixed(1)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBar,
            { width: `${Math.min(item.percentage ?? 0, 100)}%`, backgroundColor: barColor },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  textContainer: {
    flex: 1,
  },
  name: {
    fontWeight: '600',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
  },
  percentageBadge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  percentageText: {
    fontSize: 11,
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: colors.surfaceLighter,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
});
