import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, AnimatedNumber } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, shadows } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import useSettings from '@/hooks/useSettings';

interface HeroCardProps {
  generalStatus: number;
  assets: number;
  receivables: number;
  payables: number;
  onPress?: () => void;
}

export function HeroCard({
  generalStatus,
  assets,
  receivables,
  payables,
  onPress,
}: HeroCardProps) {
  const { t } = useTranslation(['common']);
  const { currencyConfig: config } = useSettings();

  const currencyConfig = {
    prefix: config.symbol,
    decimalSeparator: (config.locale.startsWith('en') || config.locale.startsWith('de')) ? ('.' as const) : (',' as const),
    thousandsSeparator: (config.locale.startsWith('en') || config.locale.startsWith('de')) ? (',' as const) : ('.' as const),
  };

  const totalPositive = assets + receivables;
  const totalAll = totalPositive + payables;
  const positivePercent = totalAll > 0 ? (totalPositive / totalAll) * 100 : 50;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('common:dashboard.generalStatus')}</Text>
        <Text style={styles.badge}>{t('common:period.instant')}</Text>
      </View>

      {/* Hero Value */}
      <View style={styles.heroValue}>
        <AnimatedNumber
          value={generalStatus}
          showSign
          prefix={currencyConfig.prefix}
          decimalSeparator={currencyConfig.decimalSeparator}
          thousandsSeparator={currencyConfig.thousandsSeparator}
          style={[
            styles.bigNumber,
            { color: generalStatus >= 0 ? colors.success : colors.error },
          ]}
        />
        <Text style={styles.heroLabel}>{t('common:dashboard.netWorth')}</Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, styles.progressGreen, { width: `${positivePercent}%` }]} />
          <View style={[styles.progressFill, styles.progressRed, { width: `${100 - positivePercent}%` }]} />
        </View>
      </View>

      {/* Details Row */}
      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <View style={styles.detailHeader}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <Text style={styles.detailLabel}>{t('common:dashboard.assets')}</Text>
          </View>
          <Text style={[styles.detailValue, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(assets)}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailItem}>
          <View style={styles.detailHeader}>
            <View style={[styles.dot, { backgroundColor: colors.info }]} />
            <Text style={styles.detailLabel}>{t('common:dashboard.receivables')}</Text>
          </View>
          <Text style={[styles.detailValue, { color: colors.info }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(receivables)}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={[styles.detailItem, styles.detailItemRight]}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailLabel}>{t('common:dashboard.payables')}</Text>
            <View style={[styles.dot, { backgroundColor: colors.error }]} />
          </View>
          <Text style={[styles.detailValue, { color: colors.error }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(payables)}
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
