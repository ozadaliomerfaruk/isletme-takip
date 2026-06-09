import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency, formatCurrencyWithSign } from '@/lib/currency';
import type { ComparisonReport } from '@/hooks/useComparisonReport';

// Dönem kartları: yatay kaydırma YOK. Her dönemde en kritik metrik (Net) baskın/işaretli
// gösterilir; Gelir/Gider tam tutarla altında. NN/g "Illusion of Completeness" çözümü.
const netColorValue = (value: number) => (value >= 0 ? colors.success : colors.error);

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  summaryCard: {
    backgroundColor: colors.primaryLight,
    marginBottom: spacing.md,
  },
  card: {
    marginBottom: spacing.sm,
  },
  cardLabel: {
    marginBottom: spacing.sm,
  },
  netLabel: {
    letterSpacing: 0.5,
  },
  netValue: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  netValueSummary: {
    fontSize: 26,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  income: {
    color: colors.success,
  },
  expense: {
    color: colors.error,
  },
});

interface MetricRowProps {
  label: string;
  value: string;
  valueStyle: object;
}

function MetricRow({ label, value, valueStyle }: MetricRowProps) {
  return (
    <View style={styles.metricRow}>
      <Text variant="body" color="secondary">
        {label}
      </Text>
      <Text style={[styles.metricValue, valueStyle]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function KarsilastirmaTabContent({ report }: { report: ComparisonReport }) {
  const { t } = useTranslation(['reports']);
  const { displayRows, totals, isLoading } = report;

  const netLabel = t('reports:comparison.net');
  const incomeLabel = t('reports:summary.income');
  const expenseLabel = t('reports:summary.expense');

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Text variant="label" color="secondary">
          {t('reports:comparison.last12Periods')}
        </Text>
        {isLoading && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      {/* Özet (12 dönem toplamı) */}
      <Card style={styles.summaryCard}>
        <Text variant="label" color="secondary" style={styles.cardLabel}>
          {t('reports:comparison.total')}
        </Text>
        <Text variant="caption" color="secondary" style={styles.netLabel}>
          {netLabel.toUpperCase()}
        </Text>
        <Text
          style={[styles.netValue, styles.netValueSummary, { color: netColorValue(totals.net) }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {formatCurrencyWithSign(totals.net)}
        </Text>
        <View style={styles.divider} />
        <MetricRow label={incomeLabel} value={formatCurrency(totals.income)} valueStyle={styles.income} />
        <MetricRow label={expenseLabel} value={formatCurrency(totals.expense)} valueStyle={styles.expense} />
        <MetricRow
          label={`${t('reports:comparison.average')} ${netLabel}`}
          value={formatCurrencyWithSign(totals.avgNet)}
          valueStyle={{ color: netColorValue(totals.avgNet) }}
        />
      </Card>

      {/* Dönem kartları (en yeni üstte) */}
      {displayRows.map((row, index) => (
        <Card key={index} style={styles.card}>
          <Text variant="label" color="secondary" style={styles.cardLabel}>
            {row.periodLabel}
          </Text>
          <Text variant="caption" color="secondary" style={styles.netLabel}>
            {netLabel.toUpperCase()}
          </Text>
          <Text
            style={[styles.netValue, { color: netColorValue(row.net) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {formatCurrencyWithSign(row.net)}
          </Text>
          <View style={styles.divider} />
          <MetricRow label={incomeLabel} value={formatCurrency(row.income)} valueStyle={styles.income} />
          <MetricRow label={expenseLabel} value={formatCurrency(row.expense)} valueStyle={styles.expense} />
        </Card>
      ))}
    </View>
  );
}
