import { useMemo, useState, useCallback } from 'react';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronRight } from 'lucide-react-native';
import { Text, EmptyState, Screen } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency, roundCurrency } from '@/lib/currency';
import { formatDateShort } from '@/lib/date';
import { useTaksitPlanListesi, type TaksitPlanOzet } from '@/hooks/useTaksit';
import { TrackingQuickStartCard } from '@/components/tracking/TrackingQuickStartCard';
import {
  getListEdgePosition,
  getListEdgeStyle,
} from '@/components/ui/listEdgeStyles';

/**
 * Taksit Takip (Faz 3) — işletmedeki tüm taksit planları.
 * Ödenen/kalan değerleri tahsis defterinden türer (get_taksit_plan_listesi RPC).
 */
export default function TaksitTakipPage() {
  const contentPaddingBottom = useContentBottomPadding();
  const { t } = useTranslation(['transactions', 'common', 'clients']);
  const router = useRouter();
  const { data: planlar, isLoading, refetch, isRefetching } = useTaksitPlanListesi();
  const [tab, setTab] = useState<'satis' | 'alis'>('satis');

  const filtreli = useMemo(
    () => (planlar ?? []).filter((p) => (tab === 'satis' ? p.type === 'cari_satis' : p.type === 'cari_alis')),
    [planlar, tab],
  );

  // Üst özet: açık planların kalan toplamları (yön bazlı). Çapraz-para toplanmaz —
  // TRY varsa TRY, yoksa ilk görülen para birimi baz alınır (mini-dashboard kuralı).
  const ozet = useMemo(() => {
    const acik = (planlar ?? []).filter((p) => Math.max(0, roundCurrency(p.toplam - p.odenen)) > 0.009);
    if (acik.length === 0) return null;
    const cur = acik.some((p) => p.currency === 'TRY') ? 'TRY' : acik[0].currency;
    const sum = (type: 'cari_satis' | 'cari_alis') =>
      roundCurrency(
        acik
          .filter((p) => p.currency === cur && p.type === type)
          .reduce((s, p) => s + Math.max(0, p.toplam - p.odenen), 0)
      );
    return {
      cur,
      tahsil: sum('cari_satis'),
      ode: sum('cari_alis'),
      // Adet de TUTARLA aynı para birimi süzgecinden geçer: aksi halde "₺10.000 · 5 plan"
      // yazıp tutarın yalnız 3 planı kapsadığı yanıltıcı özet çıkıyor.
      tahsilAdet: acik.filter((p) => p.currency === cur && p.type === 'cari_satis').length,
      odeAdet: acik.filter((p) => p.currency === cur && p.type === 'cari_alis').length,
    };
  }, [planlar]);

  const renderItem = useCallback(
    ({ item, index }: { item: TaksitPlanOzet; index: number }) => {
      const tamamlandi = item.odenen_taksit_adedi >= item.taksit_adedi;
      const oran = item.toplam > 0 ? Math.min(1, item.odenen / item.toplam) : 0;
      const position = getListEdgePosition(index, filtreli.length);
      return (
        <TouchableOpacity
          style={[
            styles.card,
            getListEdgeStyle(position),
            position !== 'last' && position !== 'only' && styles.cardDivider,
          ]}
          activeOpacity={0.7}
          onPress={() => router.push(`/taksit/${item.plan_id}` as Href)}
          accessibilityRole="button"
          accessibilityLabel={`${item.cari_name}, ${t('transactions:vade.kalan')} ${formatCurrency(Math.max(0, item.toplam - item.odenen), item.currency)}`}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleWrap}>
              <Text variant="body" style={styles.cariName} numberOfLines={1}>
                {item.cari_name}
              </Text>
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {t('transactions:taksit.odenenOran', { odenen: item.odenen_taksit_adedi, toplam: item.taksit_adedi })}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </View>

          <View style={styles.amountRow}>
            <View style={styles.amountCopy}>
              <Text variant="caption" color="secondary">
                {t('transactions:vade.kalan')}
              </Text>
              <Text variant="h3" color={tamamlandi ? 'success' : undefined} numberOfLines={1} style={styles.kalanAmount}>
                {formatCurrency(Math.max(0, item.toplam - item.odenen), item.currency)}
              </Text>
            </View>
            <View
              style={[
                styles.statusPill,
                tamamlandi
                  ? styles.statusPillComplete
                  : item.gecikmis_adet > 0
                    ? styles.statusPillLate
                    : styles.statusPillOpen,
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  tamamlandi
                    ? styles.statusTextComplete
                    : item.gecikmis_adet > 0
                      ? styles.statusTextLate
                      : styles.statusTextOpen,
                ]}
                numberOfLines={1}
              >
                {tamamlandi
                  ? t('transactions:taksit.tamamlandi')
                  : item.gecikmis_adet > 0
                    ? t('transactions:taksit.gecikmisAdet', { adet: item.gecikmis_adet })
                    : item.sonraki_vade
                      ? formatDateShort(item.sonraki_vade)
                      : t('transactions:taksit.open')}
              </Text>
            </View>
          </View>

          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${oran * 100}%` }, tamamlandi && { backgroundColor: colors.success }]} />
          </View>

          <View style={styles.metaRow}>
            <Text variant="caption" color="secondary">
              {t('transactions:taksit.odenenLabel')}: {formatCurrency(item.odenen, item.currency)} / {formatCurrency(item.toplam, item.currency)}
            </Text>
            {!tamamlandi && item.gecikmis_adet === 0 && item.sonraki_vade ? (
              <Text variant="caption" color="secondary">
                {t('transactions:taksit.sonrakiVade')}: {formatDateShort(item.sonraki_vade)}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [filtreli.length, router, t],
  );

  return (
    <>
      <Stack.Screen options={{ headerTitle: t('transactions:taksit.title') }} />
      <Screen>
        <FlatList
          data={filtreli}
          keyExtractor={(item) => item.plan_id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: contentPaddingBottom }]}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <TrackingQuickStartCard kind="taksit" />

              {ozet ? (
                <View style={styles.summaryPanel}>
                  <View style={styles.summaryItem}>
                    <View style={styles.summaryLabelRow}>
                      <View style={[styles.summaryIcon, styles.summaryIconReceive]}>
                        <ArrowDownLeft size={16} color={colors.successDark} />
                      </View>
                      <Text style={styles.summaryLabel} numberOfLines={1}>
                        {t('transactions:taksit.ozetTahsil')}
                      </Text>
                    </View>
                    <Text style={[styles.summaryValue, styles.summaryValueReceive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                      {formatCurrency(ozet.tahsil, ozet.cur)}
                    </Text>
                    <Text variant="caption" color="secondary">
                      {t('transactions:taksit.planAdet', { adet: ozet.tahsilAdet })}
                    </Text>
                  </View>

                  <View style={styles.summaryDivider} />

                  <View style={styles.summaryItem}>
                    <View style={styles.summaryLabelRow}>
                      <View style={[styles.summaryIcon, styles.summaryIconPay]}>
                        <ArrowUpRight size={16} color={colors.errorDark} />
                      </View>
                      <Text style={styles.summaryLabel} numberOfLines={1}>
                        {t('transactions:taksit.ozetOde')}
                      </Text>
                    </View>
                    <Text style={[styles.summaryValue, styles.summaryValuePay]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                      {formatCurrency(ozet.ode, ozet.cur)}
                    </Text>
                    <Text variant="caption" color="secondary">
                      {t('transactions:taksit.planAdet', { adet: ozet.odeAdet })}
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.listHeadingRow}>
                <Text variant="h3">{t('transactions:taksit.plansTitle')}</Text>
                <Text variant="caption" color="secondary">
                  {t('transactions:taksit.planAdet', { adet: filtreli.length })}
                </Text>
              </View>

              <View style={styles.tabs}>
                {(['satis', 'alis'] as const).map((tabKey) => (
                  <TouchableOpacity
                    key={tabKey}
                    style={[styles.tabButton, tab === tabKey && styles.tabButtonActive]}
                    onPress={() => setTab(tabKey)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: tab === tabKey }}
                  >
                    <Text style={[styles.tabText, tab === tabKey && styles.tabTextActive]}>
                      {tabKey === 'satis' ? t('transactions:taksit.satis') : t('transactions:taksit.alis')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={
            isLoading ? null : (
              <View style={styles.emptyWrap}>
                <EmptyState
                  icon={<CalendarClock size={44} color={colors.textMuted} />}
                  title={t('transactions:taksit.bos')}
                  description={t('transactions:taksit.emptyGuidedDescription')}
                />
              </View>
            )
          }
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  listHeader: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  summaryPanel: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  summaryItem: {
    flex: 1,
    paddingHorizontal: spacing.xs,
    gap: 3,
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryIcon: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIconReceive: {
    backgroundColor: colors.successLight,
  },
  summaryIconPay: {
    backgroundColor: colors.errorLight,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: 19,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  summaryValueReceive: {
    color: colors.successDark,
  },
  summaryValuePay: {
    color: colors.errorDark,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.sm,
  },
  listHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceLighter,
    borderRadius: borderRadius.xl,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.white,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    flexGrow: 1,
  },
  card: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  cardDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardTitleWrap: {
    flex: 1,
    gap: 1,
  },
  cariName: {
    fontWeight: '700',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  amountCopy: {
    flex: 1,
  },
  kalanAmount: {
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
  },
  statusPill: {
    maxWidth: '48%',
    borderRadius: borderRadius.full,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
  },
  statusPillComplete: {
    backgroundColor: colors.successLight,
  },
  statusPillLate: {
    backgroundColor: colors.errorLight,
  },
  statusPillOpen: {
    backgroundColor: colors.primaryLight,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusTextComplete: {
    color: colors.successDark,
  },
  statusTextLate: {
    color: colors.errorDark,
  },
  statusTextOpen: {
    color: colors.primary,
  },
  progressBar: {
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLighter,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  emptyWrap: {
    paddingTop: spacing.xl,
  },
});
