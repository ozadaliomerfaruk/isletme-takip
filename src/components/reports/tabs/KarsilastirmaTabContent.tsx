import { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react-native';

import { Text, Card, TabFilter } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { useMonthSummary } from '@/hooks/useIslemler';
import type { TabContentProps } from './types';

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  summaryCard: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    gap: spacing.xs,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: 8,
  },
  netValue: {
    fontWeight: '700',
  },
  averageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  averageItem: {
    gap: 2,
  },
  listCard: {
    padding: 0,
    overflow: 'hidden',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  monthRowCurrent: {
    backgroundColor: colors.primaryLight,
  },
  monthRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  monthContent: {
    flex: 1,
    gap: spacing.xs,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currentMonthText: {
    fontWeight: '700',
    color: colors.primary,
  },
  barContainer: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
  },
  bar: {
    height: 4,
    borderRadius: 2,
  },
  otherMetrics: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});

export function KarsilastirmaTabContent(_props: TabContentProps) {
  const { t } = useTranslation(['reports']);
  const [comparisonMetric, setComparisonMetric] = useState<'income' | 'expense' | 'net'>('income');

  const COMPARISON_OPTIONS = [
    { label: t('reports:summary.income'), value: 'income' },
    { label: t('reports:summary.expense'), value: 'expense' },
    { label: t('reports:comparison.net'), value: 'net' },
  ];

  // 6 ay verisi
  const month1Summary = useMonthSummary('monthly', -5);
  const month2Summary = useMonthSummary('monthly', -4);
  const month3Summary = useMonthSummary('monthly', -3);
  const month4Summary = useMonthSummary('monthly', -2);
  const month5Summary = useMonthSummary('monthly', -1);
  const month6Summary = useMonthSummary('monthly', 0);

  const getSummaryData = (summary: typeof month1Summary) => ({
    income: summary.data?.income ?? 0,
    expense: summary.data?.expense ?? 0,
    periodLabel: summary.periodLabel,
  });

  const monthsData = useMemo(() => [
    getSummaryData(month1Summary),
    getSummaryData(month2Summary),
    getSummaryData(month3Summary),
    getSummaryData(month4Summary),
    getSummaryData(month5Summary),
    getSummaryData(month6Summary),
  ], [month1Summary, month2Summary, month3Summary, month4Summary, month5Summary, month6Summary]);

  // Toplam ve ortalama hesapla
  const totals = useMemo(() => {
    const totalIncome = monthsData.reduce((sum, m) => sum + m.income, 0);
    const totalExpense = monthsData.reduce((sum, m) => sum + m.expense, 0);
    const count = monthsData.length;
    return {
      income: totalIncome,
      expense: totalExpense,
      net: totalIncome - totalExpense,
      avgIncome: totalIncome / count,
      avgExpense: totalExpense / count,
      avgNet: (totalIncome - totalExpense) / count,
    };
  }, [monthsData]);

  const getMetricValue = (data: { income: number; expense: number }) => {
    switch (comparisonMetric) {
      case 'income': return data.income;
      case 'expense': return data.expense;
      case 'net': return data.income - data.expense;
    }
  };

  const getMetricColor = (value: number): 'success' | 'error' | 'secondary' => {
    if (comparisonMetric === 'expense') return 'error';
    if (comparisonMetric === 'income') return value > 0 ? 'success' : 'secondary';
    return value >= 0 ? 'success' : 'error';
  };

  // En yüksek değeri bul (bar genişliği hesabı için)
  const maxValue = useMemo(() => {
    return Math.max(...monthsData.map((d) => Math.abs(getMetricValue(d))), 1);
  }, [monthsData, comparisonMetric]);

  return (
    <>
      <View style={styles.section}>
        <TabFilter
          options={COMPARISON_OPTIONS}
          value={comparisonMetric}
          onChange={(v) => setComparisonMetric(v as 'income' | 'expense' | 'net')}
        />
      </View>

      {/* Özet Kart */}
      <View style={styles.section}>
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text variant="caption" color="secondary">
                {t('reports:summary.totalIncome')}
              </Text>
              <Text variant="h3" color="success">
                {formatCurrency(totals.income)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={[styles.summaryItem, { alignItems: 'flex-end' }]}>
              <Text variant="caption" color="secondary">
                {t('reports:summary.totalExpense')}
              </Text>
              <Text variant="h3" color="error">
                {formatCurrency(totals.expense)}
              </Text>
            </View>
          </View>

          <View style={styles.netRow}>
            <Text variant="body" color="secondary">
              {t('reports:comparison.net')}
            </Text>
            <Text
              variant="h3"
              color={totals.net >= 0 ? 'success' : 'error'}
              style={styles.netValue}
            >
              {totals.net >= 0 ? '+' : ''}{formatCurrency(totals.net)}
            </Text>
          </View>

          <View style={styles.averageRow}>
            <View style={styles.averageItem}>
              <Text variant="caption" color="secondary">
                {t('reports:comparison.average')} {t('reports:summary.income').toLowerCase()}
              </Text>
              <Text variant="body" color="success">
                {formatCurrency(totals.avgIncome)}
              </Text>
            </View>
            <View style={styles.averageItem}>
              <Text variant="caption" color="secondary">
                {t('reports:comparison.average')} {t('reports:summary.expense').toLowerCase()}
              </Text>
              <Text variant="body" color="error" style={{ textAlign: 'right' }}>
                {formatCurrency(totals.avgExpense)}
              </Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Ay Listesi */}
      <View style={styles.section}>
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          {t('reports:comparison.last6Months')}
        </Text>
        <Card style={styles.listCard}>
          {[...monthsData].reverse().map((month, index) => {
            const isCurrentMonth = index === 0;
            const value = getMetricValue(month);
            const barWidth = maxValue > 0 ? (Math.abs(value) / maxValue) * 100 : 0;
            const metricColor = getMetricColor(value);

            // Diğer iki metrik (caption olarak göster)
            const otherMetrics = [];
            if (comparisonMetric !== 'income') {
              otherMetrics.push({ label: t('reports:summary.income'), value: month.income, color: colors.success });
            }
            if (comparisonMetric !== 'expense') {
              otherMetrics.push({ label: t('reports:summary.expense'), value: month.expense, color: colors.error });
            }
            if (comparisonMetric !== 'net') {
              const net = month.income - month.expense;
              otherMetrics.push({ label: t('reports:comparison.net'), value: net, color: net >= 0 ? colors.success : colors.error });
            }

            return (
              <View
                key={index}
                style={[
                  styles.monthRow,
                  isCurrentMonth && styles.monthRowCurrent,
                  index < monthsData.length - 1 && styles.monthRowBorder,
                ]}
              >
                <View style={styles.monthContent}>
                  <View style={styles.monthHeader}>
                    <Text
                      variant="body"
                      style={isCurrentMonth ? styles.currentMonthText : undefined}
                    >
                      {month.periodLabel}
                    </Text>
                    <Text
                      variant="h3"
                      color={metricColor}
                    >
                      {comparisonMetric === 'net' && value >= 0 ? '+' : ''}
                      {formatCurrency(value)}
                    </Text>
                  </View>

                  {/* Mini bar */}
                  <View style={styles.barContainer}>
                    <View
                      style={[
                        styles.bar,
                        {
                          width: `${Math.max(barWidth, 2)}%`,
                          backgroundColor: metricColor === 'success' ? colors.success
                            : metricColor === 'error' ? colors.error
                            : colors.textMuted,
                          opacity: isCurrentMonth ? 1 : 0.6,
                        },
                      ]}
                    />
                  </View>

                  {/* Diğer metrikler */}
                  <View style={styles.otherMetrics}>
                    {otherMetrics.map((m, i) => (
                      <Text key={i} variant="caption" color="secondary">
                        {m.label}: <Text variant="caption" style={{ color: m.color }}>{formatCurrency(m.value)}</Text>
                      </Text>
                    ))}
                  </View>
                </View>

                {/* Trend ikonu */}
                {index < monthsData.length - 1 && (() => {
                  const prevMonth = [...monthsData].reverse()[index + 1];
                  const prevValue = getMetricValue(prevMonth);
                  const diff = value - prevValue;
                  if (diff > 0) return <TrendingUp size={16} color={colors.success} />;
                  if (diff < 0) return <TrendingDown size={16} color={colors.error} />;
                  return <Minus size={16} color={colors.textMuted} />;
                })()}
              </View>
            );
          })}
        </Card>
      </View>
    </>
  );
}
