import { useState, useMemo, useEffect } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LineChart } from 'react-native-gifted-charts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react-native';
import { Text, Card, TabFilter } from '@/components/ui';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import { logEvent } from '@/lib/appEvents';
import { colors } from '@/constants/colors';
import { spacing, fontSize } from '@/constants/spacing';
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency';
import { useSettings } from '@/hooks/useSettings';
import { usePagePermission } from '@/hooks/usePagePermission';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { useNetWorthTrend, NetWorthTrendPoint } from '@/hooks/useNetWorthTrend';

/**
 * AYLIK NET-VARLIK (GENEL DURUM) TREND RAPORU.
 * Her ay-sonundaki genel durum (varlıklar + alacaklar − borçlar) — çizgi grafik + tablo.
 * Son nokta canlı "genel durum" değerine demirlidir (bkz. useNetWorthTrend).
 */
export default function NetVarlikTrendPage() {
  usePagePermission({ module: 'raporlar' });
  useEffect(() => { logEvent('report_viewed', { report_type: 'net_worth_trend' }); }, []);
  const { t } = useTranslation(['reports', 'common']);
  const { currency: baseCurrency } = useSettings();
  const { width: windowWidth } = useWindowDimensions();

  const [monthsBack, setMonthsBack] = useState(12);
  const { points, isLoading, isFetching, error, refetch } = useNetWorthTrend(monthsBack);

  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  useRefetchOnFocus([refetch]);

  const RANGE_OPTIONS = [
    { label: t('reports:netWorthTrend.range6'), value: '6' },
    { label: t('reports:netWorthTrend.range12'), value: '12' },
    { label: t('reports:netWorthTrend.range24'), value: '24' },
  ];

  // Özet: bugün (son) + pencere başına göre değişim.
  const summary = useMemo(() => {
    if (points.length === 0) return null;
    const last = points[points.length - 1];
    const first = points[0];
    const diff = last.netWorth - first.netWorth;
    const pct = first.netWorth !== 0 ? (diff / Math.abs(first.netWorth)) * 100 : null;
    const dir: 'up' | 'down' | 'flat' = diff > 0.005 ? 'up' : diff < -0.005 ? 'down' : 'flat';
    return { last, first, diff, pct, dir };
  }, [points]);

  const chartWidth = windowWidth - spacing.lg * 4;

  // Grafik verisi + ARALIĞA-GÖRE ÖLÇEK (sıfırdan değil → tek ekrana sığar, trend belirgin).
  // Yöntem: veriyi shift ile pozitife kaydır (böylece negatif "below-axis" mekanizması —
  // grafiği 2 ekran yapan sebep — DEVREYE GİRMEZ), formatYLabel'da shift'i geri ekle.
  // X eksenini seyreltme: ~6 etiket; yalnız son (bugünkü) nokta vurgulu.
  const chart = useMemo(() => {
    const n = points.length;
    if (n === 0) return null;
    const vals = points.map((p) => p.netWorth);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    let span = maxV - minV;
    if (span < 1) span = Math.max(Math.abs(maxV), Math.abs(minV), 1); // düz seri → biraz aralık
    const pad = span * 0.18; // overshoot + nefes payı
    const shift = minV - pad; // grafiğin en altındaki gerçek değer
    const maxValue = maxV + pad - shift; // toplam aralık (span + 2*pad)
    const step = Math.max(1, Math.round(n / 6));
    const data = points.map((p, i) => ({
      value: p.netWorth - shift, // pozitife kaydır
      label: i % step === 0 || i === n - 1 ? p.label : '',
      hideDataPoint: i !== n - 1,
      dataPointColor: colors.primary,
      dataPointRadius: 4,
    }));
    return { data, shift, maxValue };
  }, [points]);

  const renderDelta = (change: number) => {
    const up = change > 0.005;
    const down = change < -0.005;
    const color = up ? colors.success : down ? colors.error : colors.textMuted;
    const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
    return (
      <View style={styles.deltaCell}>
        <Icon size={14} color={color} />
        <Text style={[styles.deltaText, { color }]} numberOfLines={1}>
          {up ? '+' : ''}{formatCurrency(change, baseCurrency)}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerTitle: t('reports:netWorthTrend.title') }} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Aralık seçici */}
        <View style={styles.rangeBar}>
          <TabFilter
            options={RANGE_OPTIONS}
            value={String(monthsBack)}
            onChange={(v) => setMonthsBack(Number(v))}
          />
        </View>

        {isLoading ? (
          <View style={styles.stateBox}>
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </View>
        ) : error ? (
          <Card style={styles.card}>
            <Text color="error" style={styles.centerText}>{t('reports:empty.dataLoadError')}</Text>
          </Card>
        ) : (
          <>
            {/* Özet şerit */}
            {summary && (
              <Card style={styles.card}>
                <Text variant="caption" color="secondary" style={styles.summaryLabel}>
                  {t('reports:netWorthTrend.currentStatus')}
                </Text>
                <Text
                  style={[styles.bigValue, { color: summary.last.netWorth >= 0 ? colors.success : colors.error }]}
                >
                  {formatCurrency(summary.last.netWorth, baseCurrency)}
                </Text>
                <View style={styles.summaryCompareRow}>
                  {summary.dir === 'up' ? (
                    <TrendingUp size={16} color={colors.success} />
                  ) : summary.dir === 'down' ? (
                    <TrendingDown size={16} color={colors.error} />
                  ) : (
                    <Minus size={16} color={colors.textMuted} />
                  )}
                  <Text
                    variant="body"
                    style={{ color: summary.dir === 'up' ? colors.success : summary.dir === 'down' ? colors.error : colors.textMuted }}
                  >
                    {summary.diff >= 0 ? '+' : ''}{formatCurrency(summary.diff, baseCurrency)}
                    {summary.pct !== null ? ` (${summary.pct >= 0 ? '+' : ''}${summary.pct.toFixed(1)}%)` : ''}
                  </Text>
                </View>
                <Text variant="caption" color="secondary">
                  {t('reports:netWorthTrend.sinceLabel', { period: summary.first.label, months: monthsBack })}
                </Text>
              </Card>
            )}

            {/* Çizgi grafik — sabit yükseklik, aralığa-göre ölçekli (tek ekran) */}
            {chart && chart.data.length > 1 && (
              <Card style={styles.card}>
                <Text variant="label" color="secondary" style={styles.sectionTitle}>
                  {t('reports:netWorthTrend.chartTitle')}
                </Text>
                <View style={styles.chartWrap}>
                  <LineChart
                    data={chart.data}
                    width={chartWidth}
                    height={190}
                    maxValue={chart.maxValue}
                    noOfSections={4}
                    thickness={2.5}
                    color={colors.primary}
                    hideDataPoints={false}
                    dataPointsColor={colors.primary}
                    areaChart
                    startFillColor={colors.primary}
                    startOpacity={0.16}
                    endFillColor={colors.primary}
                    endOpacity={0.01}
                    curved
                    curvature={0.18}
                    yAxisThickness={0}
                    xAxisThickness={1}
                    xAxisColor={colors.border}
                    yAxisTextStyle={styles.axisText}
                    xAxisLabelTextStyle={styles.axisText}
                    rulesType="dashed"
                    rulesColor={colors.borderLight}
                    dashWidth={3}
                    dashGap={6}
                    // Veri shift ile pozitife kaydırıldı → gerçek değeri geri ekleyip göster.
                    formatYLabel={(val) => formatCurrencyCompact(Number(val) + chart.shift, baseCurrency)}
                    overflowTop={10}
                    initialSpacing={10}
                    endSpacing={10}
                    isAnimated
                    animationDuration={400}
                    adjustToWidth
                  />
                </View>
              </Card>
            )}

            {/* Aylık tablo */}
            <Card style={styles.card}>
              <Text variant="label" color="secondary" style={styles.sectionTitle}>
                {t('reports:netWorthTrend.tableTitle')}
              </Text>
              <View style={styles.tableHeader}>
                <Text variant="caption" color="secondary" style={styles.colMonth}>{t('reports:netWorthTrend.colMonth')}</Text>
                <Text variant="caption" color="secondary" style={styles.colNet}>{t('reports:netWorthTrend.colNet')}</Text>
                <Text variant="caption" color="secondary" style={styles.colDelta}>{t('reports:netWorthTrend.colChange')}</Text>
              </View>
              {[...points].reverse().map((p: NetWorthTrendPoint, idx) => (
                <View key={p.month} style={[styles.tableRow, idx < points.length - 1 && styles.tableRowBorder]}>
                  <Text variant="body" style={styles.colMonth}>{p.label}</Text>
                  <Text
                    variant="body"
                    style={[styles.colNet, styles.netValue, { color: p.netWorth >= 0 ? colors.text : colors.error }]}
                    numberOfLines={1}
                  >
                    {formatCurrency(p.netWorth, baseCurrency)}
                  </Text>
                  <View style={styles.colDelta}>{renderDelta(p.change)}</View>
                </View>
              ))}
            </Card>

            {/* Şeffaflık dipnotu */}
            <Text variant="caption" color="secondary" style={styles.footnote}>
              {t('reports:netWorthTrend.footnote')} {t('reports:netWorthTrend.footnoteFx')}
            </Text>
          </>
        )}

        {isFetching && !isLoading ? (
          <Text variant="caption" color="secondary" style={styles.centerText}>{t('common:status.loading')}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing['3xl'], gap: spacing.md },
  rangeBar: { marginBottom: spacing.xs },
  card: { padding: spacing.lg },
  stateBox: { gap: spacing.sm },
  centerText: { textAlign: 'center' },

  summaryLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  bigValue: { fontSize: 30, fontWeight: '700', marginTop: 2 },
  summaryCompareRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs, marginBottom: 2 },

  sectionTitle: { marginBottom: spacing.md },
  chartWrap: { marginLeft: -spacing.sm },
  axisText: { fontSize: 10, color: colors.textMuted },

  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  colMonth: { flex: 1.1 },
  colNet: { flex: 1.6, textAlign: 'right' },
  colDelta: { flex: 1.6, alignItems: 'flex-end' },
  netValue: { fontWeight: '700', fontSize: fontSize.lg },
  deltaCell: { flexDirection: 'row', alignItems: 'center', gap: 3, justifyContent: 'flex-end' },
  deltaText: { fontWeight: '600', fontSize: fontSize.sm },

  footnote: { lineHeight: 16, paddingHorizontal: spacing.xs },
});
