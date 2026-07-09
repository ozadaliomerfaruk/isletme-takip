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
import { formatCurrency, formatCurrencyCompact, formatQuantity } from '@/lib/currency';
import { usePagePermission } from '@/hooks/usePagePermission';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { useNetWorthLenses, LensMode } from '@/hooks/useNetWorthLenses';

/**
 * AYLIK NET-VARLIK (GENEL DURUM) TREND RAPORU — çoklu lens (Nominal ₺ / Reel ₺ / USD / EUR /
 * Gram Altın). Reel = enflasyona göre bugünün lirası; döviz/altın = o ayki kur. Amaç: paranın
 * zaman değerini göstermek. Son nokta canlı "genel durum"a demirlidir.
 */
// ccy: para birimi kodu ('TRY'|'USD'|'EUR'|'GBP'...) ya da 'gram' (altın).
function fmtValue(v: number, ccy: string): string {
  return ccy === 'gram' ? `${formatQuantity(v)} gr` : formatCurrency(v, ccy);
}
function fmtCompact(v: number, ccy: string): string {
  return ccy === 'gram' ? `${formatQuantity(v)}` : formatCurrencyCompact(v, ccy);
}
function zeroLabel(ccy: string): string {
  return ccy === 'gram' ? '0 gr' : fmtValue(0, ccy);
}

export default function NetVarlikTrendPage() {
  usePagePermission({ module: 'raporlar' });
  useEffect(() => { logEvent('report_viewed', { report_type: 'net_worth_trend' }); }, []);
  const { t } = useTranslation(['reports', 'common']);
  const { width: windowWidth } = useWindowDimensions();

  // Tarih aralığı: 'all' = veri girilen ilk aydan bugüne (hook veri-öncesi boş ayları kırpar),
  // '12' = son 12 ay (çok verisi olan için yakınlaşma). Varsayılan 'all' (esnaf tüm yolculuğu görür).
  const [rangeMode, setRangeMode] = useState<'all' | '12'>('all');
  const monthsBack = rangeMode === 'all' ? 120 : 12; // 120 = güvenli üst sınır; kırpma gerçeği belirler
  const [mode, setMode] = useState<LensMode>('nominal');
  const { byMode, baseCurrency, repricingSupported, isLoading, isFetching, refetch } = useNetWorthLenses(monthsBack);
  const lens = byMode[mode];

  // TRY-base değilse repricing lensleri desteklenmez → yalnız Nominal; başka moda geçilmişse geri al.
  useEffect(() => {
    if (!repricingSupported && mode !== 'nominal') setMode('nominal');
  }, [repricingSupported, mode]);

  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  useRefetchOnFocus([refetch]);

  const RANGE_OPTIONS = [
    { label: t('reports:netWorthTrend.allTime'), value: 'all' },
    { label: t('reports:netWorthTrend.range12'), value: '12' },
  ];
  const LENS_OPTIONS = repricingSupported
    ? [
        { label: t('reports:netWorthTrend.lensNominal'), value: 'nominal' },
        { label: t('reports:netWorthTrend.lensReal'), value: 'reel' },
        { label: 'USD', value: 'usd' },
        { label: 'EUR', value: 'eur' },
        { label: t('reports:netWorthTrend.lensGold'), value: 'altin' },
      ]
    : [{ label: t('reports:netWorthTrend.lensNominal'), value: 'nominal' }];
  const shortLabel: Record<LensMode, string> = {
    nominal: t('reports:netWorthTrend.shortNominal'),
    reel: t('reports:netWorthTrend.shortReal'),
    usd: 'USD', eur: 'EUR',
    altin: t('reports:netWorthTrend.shortGold'),
  };

  const chartWidth = windowWidth - spacing.lg * 4;
  // Gösterim para birimi: nominal → ana para birimi (TRY/USD/EUR/GBP); reel → TRY; usd/eur → USD/EUR;
  // altın → gram. (Repricing yalnız TRY-base'de aktif olduğundan reel her zaman TRY'dir.)
  const dispCcy = mode === 'nominal' ? baseCurrency : mode === 'reel' ? 'TRY' : mode === 'usd' ? 'USD' : mode === 'eur' ? 'EUR' : 'gram';

  // Grafik: seçili lensin değerleriyle, aralığa-göre ölçek (shift ile pozitife kaydır → tek
  // ekran, negatif "below-axis" şişmesi yok). Null (eksik gösterge) noktalar hariç.
  const chart = useMemo(() => {
    const pts = lens.points.filter((p) => p.value != null) as Array<{ value: number; label: string; labelFull: string; isCurrent: boolean; rate: number | null }>;
    const n = pts.length;
    if (n < 2) return null;
    const vals = pts.map((p) => p.value);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    let span = maxV - minV;
    if (span < 1) span = Math.max(Math.abs(maxV), Math.abs(minV), 1);
    const pad = span * 0.18;
    const shift = minV - pad;
    const maxValue = maxV + pad - shift;
    const step = Math.max(1, Math.round(n / 6));
    const data = pts.map((p, i) => ({
      value: p.value - shift,
      label: i % step === 0 || i === n - 1 ? p.label : '',
      monthLabel: p.labelFull,
      isCurrent: p.isCurrent,
      trueValue: p.value,
      rate: p.rate,
      hideDataPoint: i !== n - 1,
      dataPointColor: colors.primary,
      dataPointRadius: 4,
    }));
    const crossesZero = minV < 0 && maxV > 0;
    return { data, shift, maxValue, crossesZero, zeroPos: -shift };
  }, [lens]);

  // Tabloda gösterilecek satırlar: değer (lens birimi) + önceki geçerli aya göre değişim.
  const tableRows = useMemo(() => {
    const pts = lens.points;
    return pts.map((p, i) => {
      let change: number | null = null;
      if (p.value != null && i > 0 && pts[i - 1].value != null) change = p.value - (pts[i - 1].value as number);
      return { month: p.month, label: p.label, value: p.value, change };
    });
  }, [lens]);

  const renderDelta = (change: number | null) => {
    if (change == null) return <Text variant="caption" color="secondary" style={styles.deltaText}>—</Text>;
    const up = change > 0.005;
    const down = change < -0.005;
    const color = up ? colors.success : down ? colors.error : colors.textMuted;
    const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
    return (
      <View style={styles.deltaCell}>
        <Icon size={14} color={color} />
        <Text style={[styles.deltaText, { color }]} numberOfLines={1}>
          {up ? '+' : ''}{fmtValue(change, dispCcy)}
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
        {/* Bu sayfa ne işe yarar? — esnaf için sade açıklama */}
        <Card style={styles.introCard}>
          <Text variant="bodySmall" style={styles.introLead}>{t('reports:netWorthTrend.intro')}</Text>
          {repricingSupported && (
            <Text variant="bodySmall" color="secondary" style={styles.introText}>
              {t('reports:netWorthTrend.introTabs')}
            </Text>
          )}
        </Card>

        {/* Aralık + Lens seçiciler */}
        <View style={styles.rangeBar}>
          <TabFilter options={RANGE_OPTIONS} value={rangeMode} onChange={(v) => setRangeMode(v as 'all' | '12')} />
        </View>
        <View style={styles.rangeBar}>
          <TabFilter options={LENS_OPTIONS} value={mode} onChange={(v) => setMode(v as LensMode)} />
        </View>
        {/* Seçili sekmenin ne gösterdiğini sade anlat */}
        <Text variant="bodySmall" color="secondary" style={styles.lensDesc}>
          {t(`reports:netWorthTrend.lensDesc.${mode}`)}
        </Text>

        {isLoading ? (
          <View style={styles.stateBox}>
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </View>
        ) : lens.current == null && !lens.available ? (
          <Card style={styles.card}>
            <Text color="secondary" style={styles.centerText}>{t('reports:netWorthTrend.noData')}</Text>
          </Card>
        ) : (
          <>
            {/* Özet şerit */}
            <Card style={styles.card}>
              <Text variant="caption" color="secondary" style={styles.summaryLabel}>
                {t('reports:netWorthTrend.currentStatus')}
                {mode === 'reel' ? ` · ${t('reports:netWorthTrend.realSubtitle')}` : ''}
              </Text>
              <Text style={[styles.bigValue, { color: (lens.current ?? 0) >= 0 ? colors.success : colors.error }]}>
                {lens.current != null ? fmtValue(lens.current, dispCcy) : '—'}
              </Text>

              {mode === 'nominal' ? (
                lens.lensPct != null && (
                  <View style={styles.summaryCompareRow}>
                    {lens.lensPct >= 0 ? <TrendingUp size={16} color={colors.success} /> : <TrendingDown size={16} color={colors.error} />}
                    <Text variant="body" style={{ color: lens.lensPct >= 0 ? colors.success : colors.error }}>
                      {lens.lensPct >= 0 ? '+' : ''}{lens.lensPct.toFixed(1)}%
                    </Text>
                  </View>
                )
              ) : (
                // Çift metrik: Nominal % vs lens %
                lens.available && lens.lensPct != null && lens.nominalPct != null && (
                  <View style={styles.dualRow}>
                    <View style={styles.dualItem}>
                      <Text variant="caption" color="secondary">{t('reports:netWorthTrend.shortNominal')}</Text>
                      <Text variant="body" style={[styles.dualPct, { color: lens.nominalPct >= 0 ? colors.success : colors.error }]}>
                        {lens.nominalPct >= 0 ? '+' : ''}{lens.nominalPct.toFixed(1)}%
                      </Text>
                    </View>
                    <View style={styles.dualDivider} />
                    <View style={styles.dualItem}>
                      <Text variant="caption" color="secondary">{shortLabel[mode]}</Text>
                      <Text variant="body" style={[styles.dualPct, { color: lens.lensPct >= 0 ? colors.success : colors.error }]}>
                        {lens.lensPct >= 0 ? '+' : ''}{lens.lensPct.toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                )
              )}

              {/* İçgörü cümlesi (borç/varlık × enflasyon çerçevesi) */}
              {lens.insight && (
                <Text
                  variant="bodySmall"
                  style={[styles.insight, { color: lens.insight.tone === 'up' ? colors.success : colors.error }]}
                >
                  {t(`reports:netWorthTrend.insight.${lens.insight.kind}`, {
                    lens: t(`reports:netWorthTrend.basis.${mode}`),
                    pct: Math.abs(lens.insight.lensPct),
                    nom: lens.insight.nominalPct,
                    months: monthsBack,
                  })}
                </Text>
              )}
            </Card>

            {/* Çizgi grafik */}
            {chart && chart.data.length > 1 ? (
              <Card style={styles.card}>
                <View style={styles.chartHeaderRow}>
                  <Text variant="label" color="secondary" style={styles.sectionTitle}>{t('reports:netWorthTrend.chartTitle')}</Text>
                  <Text variant="caption" color="secondary">{t('reports:netWorthTrend.dragHint')}</Text>
                </View>
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
                    formatYLabel={(val) => fmtCompact(Number(val) + chart.shift, dispCcy)}
                    overflowTop={12}
                    initialSpacing={10}
                    endSpacing={10}
                    isAnimated
                    animationDuration={400}
                    adjustToWidth
                    showReferenceLine1={chart.crossesZero}
                    referenceLine1Position={chart.zeroPos}
                    referenceLine1Config={{
                      thickness: 1,
                      color: colors.textMuted,
                      dashWidth: 4,
                      dashGap: 4,
                      labelText: zeroLabel(dispCcy),
                      labelTextStyle: { color: colors.textMuted, fontSize: 10 },
                    }}
                    pointerConfig={{
                      activatePointersOnLongPress: true,
                      activatePointersDelay: 120,
                      pointerVanishDelay: 2500,
                      autoAdjustPointerLabelPosition: true,
                      pointerColor: colors.primary,
                      radius: 5,
                      pointerStripColor: colors.border,
                      pointerStripWidth: 1,
                      strokeDashArray: [3, 4],
                      pointerLabelWidth: 160,
                      pointerLabelHeight: 68,
                      pointerLabelComponent: (items: Array<{ trueValue?: number; monthLabel?: string; isCurrent?: boolean; rate?: number | null }>) => {
                        const it = items?.[0];
                        if (!it) return null;
                        const v = it.trueValue ?? 0;
                        // Kur satırı yalnız döviz/altın merceğinde (o ay kullanılan gerçek kur/fiyat).
                        const showRate = it.rate != null && (mode === 'usd' || mode === 'eur' || mode === 'altin');
                        return (
                          <View style={styles.pointerLabel}>
                            <Text style={styles.pointerMonth} numberOfLines={1}>
                              {it.monthLabel} · {it.isCurrent ? t('reports:netWorthTrend.today') : t('reports:netWorthTrend.monthEnd')}
                            </Text>
                            <Text style={[styles.pointerValue, { color: v >= 0 ? colors.success : colors.error }]} numberOfLines={1}>
                              {fmtValue(v, dispCcy)}
                            </Text>
                            {showRate && (
                              <Text style={styles.pointerRate} numberOfLines={1}>
                                {t(`reports:netWorthTrend.basis.${mode}`)} {formatCurrency(it.rate as number, 'TRY')}{mode === 'altin' ? '/gr' : ''}
                              </Text>
                            )}
                          </View>
                        );
                      },
                    }}
                  />
                </View>
              </Card>
            ) : mode !== 'nominal' ? (
              <Card style={styles.card}>
                <Text color="secondary" style={styles.centerText}>{t('reports:netWorthTrend.noData')}</Text>
              </Card>
            ) : null}

            {/* Aylık tablo */}
            <Card style={styles.card}>
              <Text variant="label" color="secondary" style={styles.tableTitle}>{t('reports:netWorthTrend.tableTitle')}</Text>
              {/* Bu merceğin satırları ne demek — esnaf için */}
              <Text variant="caption" color="secondary" style={styles.tableSubtitle}>
                {t(`reports:netWorthTrend.lensDesc.${mode}`)}
              </Text>
              <View style={styles.tableHeader}>
                <Text variant="caption" color="secondary" style={styles.colMonth}>{t('reports:netWorthTrend.colMonth')}</Text>
                <Text variant="caption" color="secondary" style={styles.colNet}>{t('reports:netWorthTrend.colNet')}</Text>
                <Text variant="caption" color="secondary" style={styles.colDelta}>{t('reports:netWorthTrend.colChange')}</Text>
              </View>
              {[...tableRows].reverse().map((r, idx) => (
                <View key={r.month} style={[styles.tableRow, idx < tableRows.length - 1 && styles.tableRowBorder]}>
                  <Text variant="body" style={styles.colMonth}>{r.label}</Text>
                  <Text
                    variant="body"
                    style={[styles.colNet, styles.netValue, { color: r.value == null ? colors.textMuted : r.value >= 0 ? colors.text : colors.error }]}
                    numberOfLines={1}
                  >
                    {r.value != null ? fmtValue(r.value, dispCcy) : '—'}
                  </Text>
                  <View style={styles.colDelta}>{renderDelta(r.change)}</View>
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

  introCard: { padding: spacing.md, gap: spacing.xs },
  introLead: { lineHeight: 20 },
  introText: { lineHeight: 20 },
  lensDesc: { marginTop: -2, marginBottom: spacing.xs, lineHeight: 19, paddingHorizontal: spacing.xs },

  summaryLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  bigValue: { fontSize: 30, fontWeight: '700', marginTop: 2 },
  summaryCompareRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs, marginBottom: 2 },
  dualRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  dualItem: { flex: 1, alignItems: 'center', gap: 2 },
  dualDivider: { width: 1, height: 32, backgroundColor: colors.border },
  dualPct: { fontWeight: '700', fontSize: fontSize.lg },
  insight: { marginTop: spacing.sm, lineHeight: 20 },

  sectionTitle: { marginBottom: spacing.md },
  tableTitle: { marginBottom: 2 },
  tableSubtitle: { marginBottom: spacing.md, lineHeight: 17 },
  chartHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chartWrap: { marginLeft: -spacing.sm },
  axisText: { fontSize: 10, color: colors.textMuted },
  pointerLabel: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  pointerMonth: { fontSize: 11, color: colors.textMuted, marginBottom: 1 },
  pointerValue: { fontSize: 14, fontWeight: '700' },
  pointerRate: { fontSize: 11, color: colors.textMuted, marginTop: 1 },

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
