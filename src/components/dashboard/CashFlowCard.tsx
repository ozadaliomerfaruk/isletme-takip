import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { PeriodDropdown } from './PeriodDropdown';
import { colors } from '@/constants/colors';
import { formatCurrency } from '@/lib/currency';
import type { PeriodType } from '@/lib/date';

interface CashFlowCardProps {
  totalInflow: number;
  totalOutflow: number;
  netCashFlow: number;
  periodLabel: string;
  onPress?: () => void;
  // Period selection
  periodType?: PeriodType;
  onPeriodChange?: (type: PeriodType) => void;
  onPeriodNavigate?: (direction: -1 | 1) => void;
  onCustomDatePress?: () => void;
}

export function CashFlowCard({
  totalInflow,
  totalOutflow,
  netCashFlow,
  periodLabel,
  onPress,
  periodType = 'monthly',
  onPeriodChange,
  onPeriodNavigate,
  onCustomDatePress,
}: CashFlowCardProps) {
  const { t } = useTranslation(['common']);
  // Progress bar calculation
  const total = totalInflow + totalOutflow;
  const inflowPercent = total > 0 ? (totalInflow / total) * 100 : 50;

  const Wrapper = onPress ? TouchableOpacity : View;
  const wrapperProps = onPress ? { style: styles.card, onPress, activeOpacity: 0.8 } : { style: styles.card };

  return (
    <Wrapper {...wrapperProps}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{t('common:dashboard.cashFlow')}</Text>
        {onPeriodChange && onPeriodNavigate ? (
          <PeriodDropdown
            periodLabel={periodLabel}
            periodType={periodType}
            onPeriodChange={onPeriodChange}
            onNavigate={onPeriodNavigate}
            onCustomDatePress={onCustomDatePress}
          />
        ) : (
          <Text style={styles.periodBadge}>{periodLabel}</Text>
        )}
      </View>

      {/* Main Value */}
      <View style={styles.mainValue}>
        <Text style={[
          styles.bigNumber,
          { color: netCashFlow >= 0 ? colors.success : colors.error }
        ]}>
          {netCashFlow >= 0 ? '+' : ''}{formatCurrency(netCashFlow)}
        </Text>
        <Text style={styles.mainLabel}>{t('common:dashboard.netCashFlow')}</Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, styles.progressGreen, { width: `${inflowPercent}%` }]} />
          <View style={[styles.progressFill, styles.progressRed, { width: `${100 - inflowPercent}%` }]} />
        </View>
      </View>

      {/* Details Row */}
      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <View style={styles.detailHeader}>
            <View style={[styles.dotIndicator, { backgroundColor: colors.success }]} />
            <Text style={styles.detailLabel}>{t('common:dashboard.inflow')}</Text>
          </View>
          <Text style={[styles.detailValue, { color: colors.success }]}>
            {formatCurrency(totalInflow)}
          </Text>
        </View>

        <View style={styles.detailDivider} />

        <View style={[styles.detailItem, styles.detailItemRight]}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailLabel}>{t('common:dashboard.outflow')}</Text>
            <View style={[styles.dotIndicator, { backgroundColor: colors.error }]} />
          </View>
          <Text style={[styles.detailValue, { color: colors.error }]}>
            {formatCurrency(totalOutflow)}
          </Text>
        </View>
      </View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    marginRight: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  periodBadge: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  mainValue: {
    alignItems: 'center',
    marginBottom: 12,
  },
  bigNumber: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 4,
  },
  mainLabel: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  progressFill: {
    height: '100%',
  },
  progressGreen: {
    backgroundColor: colors.success,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
  },
  progressRed: {
    backgroundColor: colors.error,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailItem: {
    flex: 1,
  },
  detailItemRight: {
    alignItems: 'flex-end',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  dotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 20,
    fontWeight: '600',
  },
  detailDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },
});
