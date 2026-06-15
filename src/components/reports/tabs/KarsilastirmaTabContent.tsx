import { View, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import { Text } from '@/components/ui';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency, formatCurrencyWithSign } from '@/lib/currency';
import type { ComparisonReport } from '@/hooks/useComparisonReport';

// Net: kâr (>=0) işaretsiz + yeşil; zarar (<0) işaretli + kırmızı (mutlak değer
// işaretsiz basılırsa zarar kâr gibi okunuyordu).
const netColor = (v: number) => (v >= 0 ? colors.success : colors.error);
const formatNet = (v: number) => (v < 0 ? formatCurrencyWithSign(v) : formatCurrency(v));

export function KarsilastirmaTabContent({ report }: { report: ComparisonReport }) {
  const { t } = useTranslation(['reports']);
  const router = useRouter();
  const { period, displayRows, totals, isLoading } = report;

  // İlk yüklemede 12 satır ₺0,00 flash etmesin — iskelet göster (diğer tab'larla tutarlı).
  if (isLoading) {
    return (
      <View style={styles.section}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <SkeletonListItem key={i} />
        ))}
      </View>
    );
  }

  // En yeni dönem üstte (yeni → eski); Ortalama/Toplam en altta.
  const rows = displayRows;

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Text variant="label" color="secondary">
          {t('reports:comparison.last12Periods')}
        </Text>
        {isLoading && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      <View style={styles.table}>
        {/* Sütun başlıkları */}
        <View style={styles.headerRow}>
          <Text variant="caption" color="muted" style={styles.headerText}>
            {t('reports:summary.income')}
          </Text>
          <Text variant="caption" color="muted" style={styles.headerText}>
            {t('reports:summary.expense')}
          </Text>
          <Text variant="caption" color="muted" style={styles.headerText}>
            {t('reports:comparison.net')}
          </Text>
        </View>

        {/* Dönem satırları */}
        {rows.map((row, i) => {
          const empty = row.income === 0 && row.expense === 0;
          return (
            <TouchableOpacity
              key={i}
              style={styles.row}
              activeOpacity={0.6}
              onPress={() =>
                router.push({
                  pathname: '/raporlar/gelir-gider',
                  params: { period, periodOffset: String(row.offset) },
                })
              }
            >
              <Text variant="caption" style={styles.periodLabel}>
                {row.periodLabel}
              </Text>
              <View style={styles.valuesRow}>
                <Text
                  style={[styles.value, empty && styles.valueEmpty]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {formatCurrency(row.income)}
                </Text>
                <Text
                  style={[styles.value, empty && styles.valueEmpty]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {formatCurrency(row.expense)}
                </Text>
                <Text
                  style={[styles.value, styles.netValue, { color: empty ? colors.textMuted : netColor(row.net) }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {formatNet(row.net)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Ortalama (dönem başına) */}
        <View style={[styles.row, styles.summaryRow]}>
          <Text variant="caption" style={styles.avgLabel}>
            {t('reports:comparison.average')}
          </Text>
          <View style={styles.valuesRow}>
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {formatCurrency(totals.avgIncome)}
            </Text>
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {formatCurrency(totals.avgExpense)}
            </Text>
            <Text
              style={[styles.value, styles.netValue, { color: netColor(totals.avgNet) }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {formatNet(totals.avgNet)}
            </Text>
          </View>
        </View>

        {/* Toplam */}
        <View style={[styles.row, styles.totalRow]}>
          <Text variant="caption" style={styles.totalLabel}>
            {t('reports:comparison.total')}
          </Text>
          <View style={styles.valuesRow}>
            <Text style={[styles.value, styles.totalValue]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {formatCurrency(totals.income)}
            </Text>
            <Text style={[styles.value, styles.totalValue]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {formatCurrency(totals.expense)}
            </Text>
            <Text
              style={[styles.value, styles.totalValue, { color: netColor(totals.net) }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {formatNet(totals.net)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

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
  table: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerText: {
    flex: 1,
    textAlign: 'right',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  row: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  periodLabel: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 15,
    marginBottom: 4,
  },
  valuesRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  value: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  valueEmpty: {
    color: colors.textMuted,
    fontWeight: '400',
  },
  netValue: {
    fontWeight: '700',
  },
  totalRow: {
    borderBottomWidth: 0,
  },
  summaryRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  avgLabel: {
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  totalLabel: {
    color: colors.text,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  totalValue: {
    fontWeight: '700',
    color: colors.text,
  },
});
