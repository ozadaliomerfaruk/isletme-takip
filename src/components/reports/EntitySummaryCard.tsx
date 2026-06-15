import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { Building2, Users, TrendingUp, TrendingDown, ArrowRight, CalendarDays } from 'lucide-react-native';
import { Cari, Personel, IslemWithRelations } from '@/types/database';
import { formatCurrency, toNumber } from '@/lib/currency';
import { useTranslation } from 'react-i18next';

type EntityType = 'cari' | 'personel';

interface EntitySummaryCardProps {
  type: EntityType;
  entity: Cari | Personel | null;
  transactions: IslemWithRelations[];
  periodLabel: string;
  leaveCarryOver?: number;
}

export function EntitySummaryCard({
  type,
  entity,
  transactions,
  periodLabel,
  leaveCarryOver = 0,
}: EntitySummaryCardProps) {
  const { t } = useTranslation(['reports', 'transactions', 'staff']);

  // Metrikleri hesapla
  const metrics = useMemo(() => {
    if (type === 'cari') {
      // Cari için: alışlar, satışlar, ödemeler, tahsilatlar
      const alislar = transactions
        .filter((tx) => tx.type === 'cari_alis')
        .reduce((sum, tx) => sum + toNumber(tx.amount), 0);

      const alisIadeleri = transactions
        .filter((tx) => tx.type === 'cari_alis_iade')
        .reduce((sum, tx) => sum + toNumber(tx.amount), 0);

      const satislar = transactions
        .filter((tx) => tx.type === 'cari_satis')
        .reduce((sum, tx) => sum + toNumber(tx.amount), 0);

      const satisIadeleri = transactions
        .filter((tx) => tx.type === 'cari_satis_iade')
        .reduce((sum, tx) => sum + toNumber(tx.amount), 0);

      const odemeler = transactions
        .filter((tx) => tx.type === 'cari_odeme')
        .reduce((sum, tx) => sum + toNumber(tx.amount), 0);

      const tahsilatlar = transactions
        .filter((tx) => tx.type === 'cari_tahsilat')
        .reduce((sum, tx) => sum + toNumber(tx.amount), 0);

      const netAlislar = alislar - alisIadeleri;
      const netSatislar = satislar - satisIadeleri;

      // Dönem içi bakiye değişimi:
      // Alışlar borcumuzu artırır (-), ödemeler borcumuzu azaltır (+)
      // Satışlar alacağımızı artırır (+), tahsilatlar alacağımızı azaltır (-)
      const balanceChange = (netSatislar - netAlislar) + (odemeler - tahsilatlar);

      return {
        primary: { label: t('reports:entitySummary.purchases'), value: netAlislar, isExpense: true },
        secondary: { label: t('reports:entitySummary.sales'), value: netSatislar, isExpense: false },
        payments: { label: t('reports:entitySummary.payments'), value: odemeler },
        collections: { label: t('reports:entitySummary.collections'), value: tahsilatlar },
        balanceChange,
      };
    } else {
      // Personel için: giderler, ödemeler
      const giderler = transactions
        .filter((tx) => tx.type === 'personel_gider')
        .reduce((sum, tx) => sum + toNumber(tx.amount), 0);

      const odemeler = transactions
        .filter((tx) => tx.type === 'personel_odeme')
        .reduce((sum, tx) => sum + toNumber(tx.amount), 0);

      const tahsilatlar = transactions
        .filter((tx) => tx.type === 'personel_tahsilat')
        .reduce((sum, tx) => sum + toNumber(tx.amount), 0);

      const satislar = transactions
        .filter((tx) => tx.type === 'personel_satis')
        .reduce((sum, tx) => sum + toNumber(tx.amount), 0);

      // Dönem içi bakiye değişimi (kanonik applyBalanceChange ile hizalı):
      //   personel_odeme (+), personel_satis (+); personel_gider (-), personel_tahsilat (-)
      const balanceChange = (odemeler + satislar) - (giderler + tahsilatlar);

      return {
        primary: { label: t('reports:entitySummary.expenses'), value: giderler, isExpense: true },
        secondary: null,
        payments: { label: t('reports:entitySummary.payments'), value: odemeler },
        collections: { label: t('reports:entitySummary.collections'), value: tahsilatlar },
        balanceChange,
      };
    }
  }, [transactions, type, t]);

  const leaveMetrics = useMemo(() => {
    if (type !== 'personel') return null;
    const entitled = transactions
      .filter((tx) => tx.type === 'personel_izin_hakki')
      .reduce((sum, tx) => sum + toNumber(tx.amount), 0);
    const used = transactions
      .filter((tx) => tx.type === 'personel_izin_kullanimi')
      .reduce((sum, tx) => sum + toNumber(tx.amount), 0);
    const remaining = leaveCarryOver + entitled - used;
    return { carryOver: leaveCarryOver, entitled, used, remaining };
  }, [transactions, type, leaveCarryOver]);

  const Icon = type === 'cari' ? Building2 : Users;
  const currentBalance = entity ? toNumber(entity.balance) : 0;

  const getBalanceLabel = (balance: number): string => {
    if (balance > 0) {
      return t('reports:entitySummary.theyOweUs');
    } else if (balance < 0) {
      return t('reports:entitySummary.weOweThem');
    }
    return t('reports:entitySummary.balanced');
  };

  const getEntityName = (): string => {
    if (!entity) return '';
    if (type === 'cari') {
      return (entity as Cari).name;
    }
    const personel = entity as Personel;
    return `${personel.first_name} ${personel.last_name ?? ''}`.trim();
  };

  if (!entity) {
    return null;
  }

  return (
    <Card style={styles.card}>
      {/* Header - only for cari */}
      {type === 'cari' && (
        <>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Icon size={24} color={colors.primary} />
            </View>
            <View style={styles.headerContent}>
              <Text variant="h3">{getEntityName()}</Text>
              <Text variant="caption" color="secondary">
                {t('reports:entitySummary.period')}: {periodLabel}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
        </>
      )}

      {/* Primary & Secondary Metrics */}
      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <View style={styles.metricHeader}>
            <TrendingDown size={16} color={colors.error} />
            <Text variant="caption" color="secondary">
              {metrics.primary.label}
            </Text>
          </View>
          <Text variant="h3" color="error">
            {formatCurrency(metrics.primary.value, entity.currency)}
          </Text>
        </View>

        {metrics.secondary && (
          <>
            <View style={styles.metricDivider} />
            <View style={[styles.metricItem, { alignItems: 'flex-end' }]}>
              <View style={styles.metricHeader}>
                <Text variant="caption" color="secondary">
                  {metrics.secondary.label}
                </Text>
                <TrendingUp size={16} color={colors.success} />
              </View>
              <Text variant="h3" color="success">
                {formatCurrency(metrics.secondary.value, entity.currency)}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Payments & Collections */}
      <View style={styles.subMetricsRow}>
        <View style={styles.subMetricItem}>
          <Text variant="caption" color="secondary">
            {metrics.payments.label}
          </Text>
          <Text variant="body">
            {formatCurrency(metrics.payments.value, entity.currency)}
          </Text>
        </View>
        <ArrowRight size={16} color={colors.textMuted} />
        <View style={[styles.subMetricItem, { alignItems: 'flex-end' }]}>
          <Text variant="caption" color="secondary">
            {metrics.collections.label}
          </Text>
          <Text variant="body">
            {formatCurrency(metrics.collections.value, entity.currency)}
          </Text>
        </View>
      </View>

      {/* Leave Summary - only for personel */}
      {leaveMetrics && (
        <>
          <View style={styles.divider} />
          <View style={styles.leaveSection}>
            <View style={styles.leaveTitleRow}>
              <CalendarDays size={16} color={colors.primary} />
              <Text variant="caption" color="secondary" style={styles.leaveTitleText}>
                {t('staff:leave.leaveStatus')}
              </Text>
            </View>
            <View style={styles.leaveRow}>
              <View style={styles.leaveItem}>
                <Text variant="caption" color="secondary">{t('staff:leave.entitled')}</Text>
                <Text variant="body" color="success" style={styles.leaveValue}>
                  {leaveMetrics.entitled} {t('staff:leave.days')}
                </Text>
              </View>
              <View style={styles.leaveItem}>
                <Text variant="caption" color="secondary">{t('staff:leave.used')}</Text>
                <Text variant="body" color="error" style={styles.leaveValue}>
                  {leaveMetrics.used} {t('staff:leave.days')}
                </Text>
              </View>
              <View style={styles.leaveItem}>
                <Text variant="caption" color="secondary">{t('staff:leave.remaining')}</Text>
                <Text
                  variant="body"
                  color={leaveMetrics.remaining >= 0 ? 'success' : 'error'}
                  style={styles.leaveValue}
                >
                  {leaveMetrics.remaining} {t('staff:leave.days')}
                </Text>
              </View>
            </View>
            {leaveMetrics.carryOver !== 0 && (
              <Text variant="caption" color="secondary" style={styles.leaveCarryOverText}>
                {t('staff:leave.carryOver')}: {leaveMetrics.carryOver} {t('staff:leave.days')}
              </Text>
            )}
          </View>
        </>
      )}

      <View style={styles.divider} />

      {/* Balance Change & Current Balance */}
      <View style={styles.balanceSection}>
        <View style={styles.balanceRow}>
          <Text variant="body" color="secondary">
            {t('reports:entitySummary.periodBalanceChange')}
          </Text>
          <Text
            variant="body"
            color={metrics.balanceChange >= 0 ? 'success' : 'error'}
            style={styles.balanceValue}
          >
            {metrics.balanceChange >= 0 ? '+' : ''}{formatCurrency(metrics.balanceChange, entity.currency)}
          </Text>
        </View>
        <View style={styles.balanceRow}>
          <Text variant="body" style={styles.currentBalanceLabel}>
            {t('reports:entitySummary.currentBalance')}
          </Text>
          <View style={styles.currentBalanceContainer}>
            <Text
              variant="h3"
              color={currentBalance >= 0 ? 'success' : 'error'}
            >
              {formatCurrency(Math.abs(currentBalance), entity.currency)}
            </Text>
            <Text variant="caption" color="secondary">
              {getBalanceLabel(currentBalance)}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  headerContent: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricItem: {
    flex: 1,
    gap: spacing.xs,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metricDivider: {
    width: 1,
    height: 50,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  subMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: 8,
    marginTop: spacing.md,
  },
  subMetricItem: {
    gap: 2,
  },
  balanceSection: {
    gap: spacing.sm,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceValue: {
    fontWeight: '700',
  },
  currentBalanceLabel: {
    fontWeight: '700',
  },
  currentBalanceContainer: {
    alignItems: 'flex-end',
    gap: 2,
  },
  leaveSection: {
    gap: spacing.sm,
  },
  leaveTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  leaveTitleText: {
    fontWeight: '600',
  },
  leaveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: 8,
  },
  leaveItem: {
    alignItems: 'center',
    gap: 2,
  },
  leaveValue: {
    fontWeight: '700',
  },
  leaveCarryOverText: {
    textAlign: 'center',
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
});

export default EntitySummaryCard;
