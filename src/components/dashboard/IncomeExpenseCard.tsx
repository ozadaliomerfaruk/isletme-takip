import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, AnimatedNumber } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, shadows } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import useSettings from '@/hooks/useSettings';

interface IncomeExpenseCardProps {
  income: number;
  expense: number;
  periodBadge?: string;
  onPress?: () => void;
}

export function IncomeExpenseCard({
  income,
  expense,
  periodBadge,
  onPress,
}: IncomeExpenseCardProps) {
  const { t } = useTranslation(['common']);
  const { currencyConfig: config } = useSettings();

  const currencyConfig = {
    prefix: config.symbol,
    decimalSeparator: (config.locale.startsWith('en') || config.locale.startsWith('de')) ? ('.' as const) : (',' as const),
    thousandsSeparator: (config.locale.startsWith('en') || config.locale.startsWith('de')) ? (',' as const) : ('.' as const),
  };

  const netProfit = income - expense;
  const total = income + expense;
  const incomePercent = total > 0 ? (income / total) * 100 : 50;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={onPress}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('common:dashboard.incomeExpense')}</Text>
        {periodBadge ? (
          <Text style={styles.badge}>{periodBadge}</Text>
        ) : null}
      </View>

      {/* Hero Value */}
      <View style={styles.heroValue}>
        <AnimatedNumber
          value={netProfit}
          showSign
          prefix={currencyConfig.prefix}
          decimalSeparator={currencyConfig.decimalSeparator}
          thousandsSeparator={currencyConfig.thousandsSeparator}
          style={[
            styles.bigNumber,
            { color: netProfit >= 0 ? colors.success : colors.error },
          ]}
        />
        <Text style={styles.heroLabel}>{t('common:dashboard.netProfitLoss')}</Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, styles.progressGreen, { width: `${incomePercent}%` }]} />
          <View style={[styles.progressFill, styles.progressRed, { width: `${100 - incomePercent}%` }]} />
        </View>
      </View>

      {/* Details Row */}
      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <View style={styles.detailHeader}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <Text style={styles.detailLabel}>{t('common:dashboard.income')}</Text>
          </View>
          <Text style={[styles.detailValue, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(income)}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={[styles.detailItem, styles.detailItemRight]}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailLabel}>{t('common:dashboard.expense')}</Text>
            <View style={[styles.dot, { backgroundColor: colors.error }]} />
          </View>
          <Text style={[styles.detailValue, { color: colors.error }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(expense)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    padding: spacing.md,
    ...shadows.md,
    ...Platform.select({
      android: { elevation: 3 },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  badge: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  heroValue: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  bigNumber: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 2,
    textAlign: 'center',
    width: '100%',
  },
  heroLabel: {
    fontSize: 15,
    color: colors.textMuted,
    fontWeight: '500',
  },
  progressContainer: {
    marginBottom: spacing.sm,
  },
  progressBar: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  progressFill: {
    height: '100%',
  },
  progressGreen: {
    backgroundColor: colors.success,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },
  progressRed: {
    backgroundColor: colors.error,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailItem: {
    flex: 1,
    alignItems: 'center',
  },
  detailItemRight: {
    alignItems: 'flex-end',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 17,
    fontWeight: '700',
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
    marginHorizontal: 6,
  },
});
