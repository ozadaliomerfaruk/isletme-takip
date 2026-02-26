import { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text, Card, TabFilter } from '@/components/ui';
import { PeriodComparisonChart } from '@/components/reports';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { useMonthSummary } from '@/hooks/useIslemler';
import type { TabContentProps } from './types';

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

  const chartData = useMemo(() => {
    return monthsData.map((summary, index) => {
      let value = 0;
      switch (comparisonMetric) {
        case 'income': value = summary.income; break;
        case 'expense': value = summary.expense; break;
        case 'net': value = summary.income - summary.expense; break;
      }
      return {
        label: summary.periodLabel,
        value,
        isCurrentPeriod: index === monthsData.length - 1,
      };
    });
  }, [monthsData, comparisonMetric]);

  const chartColor = comparisonMetric === 'expense' ? colors.error : colors.success;

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

  return (
    <>
      <View style={styles.section}>
        <TabFilter
          options={COMPARISON_OPTIONS}
          value={comparisonMetric}
          onChange={(v) => setComparisonMetric(v as 'income' | 'expense' | 'net')}
        />
      </View>

      <View style={styles.section}>
        <Card style={styles.comparisonCard}>
          <PeriodComparisonChart
            data={chartData}
            title={t('reports:comparison.last6Months')}
            color={chartColor}
            showTrend={true}
            height={220}
          />
        </Card>
      </View>

      {/* Detay Tablo */}
      <View style={styles.section}>
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          {t('reports:comparison.details')}
        </Text>
        <Card>
          <View style={styles.comparisonTable}>
            {/* Baslik satiri */}
            <View style={[styles.comparisonRow, styles.comparisonHeaderRow]}>
              <Text variant="caption" color="secondary" style={styles.comparisonCell}>
                {t('reports:comparison.period')}
              </Text>
              <Text variant="caption" color="secondary" style={styles.comparisonCell}>
                {t('reports:summary.income')}
              </Text>
              <Text variant="caption" color="secondary" style={styles.comparisonCell}>
                {t('reports:summary.expense')}
              </Text>
              <Text variant="caption" color="secondary" style={styles.comparisonCell}>
                {t('reports:comparison.net')}
              </Text>
            </View>
            {/* Veri satirlari */}
            {monthsData.map((summary, index) => {
              const net = summary.income - summary.expense;
              const isCurrentMonth = index === monthsData.length - 1;
              return (
                <View
                  key={index}
                  style={[
                    styles.comparisonRow,
                    isCurrentMonth && styles.comparisonCurrentRow,
                  ]}
                >
                  <Text
                    variant="body"
                    style={[styles.comparisonCell, isCurrentMonth && styles.comparisonCurrentText]}
                  >
                    {summary.periodLabel}
                  </Text>
                  <Text variant="body" color="success" style={styles.comparisonCell}>
                    {formatCurrency(summary.income)}
                  </Text>
                  <Text variant="body" color="error" style={styles.comparisonCell}>
                    {formatCurrency(summary.expense)}
                  </Text>
                  <Text
                    variant="body"
                    color={net >= 0 ? 'success' : 'error'}
                    style={styles.comparisonCell}
                  >
                    {net >= 0 ? '+' : ''}{formatCurrency(net)}
                  </Text>
                </View>
              );
            })}
            {/* Toplam satiri */}
            <View style={[styles.comparisonRow, styles.comparisonTotalRow]}>
              <Text variant="body" style={[styles.comparisonCell, styles.comparisonBoldText]}>
                {t('reports:comparison.total')}
              </Text>
              <Text variant="body" color="success" style={[styles.comparisonCell, styles.comparisonBoldText]}>
                {formatCurrency(totals.income)}
              </Text>
              <Text variant="body" color="error" style={[styles.comparisonCell, styles.comparisonBoldText]}>
                {formatCurrency(totals.expense)}
              </Text>
              <Text
                variant="body"
                color={totals.net >= 0 ? 'success' : 'error'}
                style={[styles.comparisonCell, styles.comparisonBoldText]}
              >
                {totals.net >= 0 ? '+' : ''}{formatCurrency(totals.net)}
              </Text>
            </View>
            {/* Ortalama satiri */}
            <View style={[styles.comparisonRow, styles.comparisonAverageRow]}>
              <Text variant="body" color="secondary" style={[styles.comparisonCell, styles.comparisonItalicText]}>
                {t('reports:comparison.average')}
              </Text>
              <Text variant="body" color="secondary" style={[styles.comparisonCell, styles.comparisonItalicText]}>
                {formatCurrency(totals.avgIncome)}
              </Text>
              <Text variant="body" color="secondary" style={[styles.comparisonCell, styles.comparisonItalicText]}>
                {formatCurrency(totals.avgExpense)}
              </Text>
              <Text variant="body" color="secondary" style={[styles.comparisonCell, styles.comparisonItalicText]}>
                {totals.avgNet >= 0 ? '+' : ''}{formatCurrency(totals.avgNet)}
              </Text>
            </View>
          </View>
        </Card>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  comparisonCard: {
    padding: spacing.lg,
  },
  comparisonTable: {
    gap: 0,
  },
  comparisonRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  comparisonHeaderRow: {
    backgroundColor: colors.surfaceLight,
    borderBottomWidth: 2,
  },
  comparisonCurrentRow: {
    backgroundColor: colors.primaryLight,
  },
  comparisonTotalRow: {
    backgroundColor: colors.surfaceLight,
    borderBottomWidth: 1,
    borderTopWidth: 2,
    borderTopColor: colors.border,
  },
  comparisonAverageRow: {
    borderBottomWidth: 0,
  },
  comparisonCell: {
    flex: 1,
    fontSize: 14,
  },
  comparisonCurrentText: {
    fontWeight: '600',
    color: colors.primary,
  },
  comparisonBoldText: {
    fontWeight: '700',
  },
  comparisonItalicText: {
    fontStyle: 'italic',
    fontSize: 13,
  },
});
