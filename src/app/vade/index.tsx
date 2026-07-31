import { useMemo, useCallback, useEffect, useRef } from 'react';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Stack, useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CalendarClock, CalendarDays, ChevronRight, CircleAlert, Clock3 } from 'lucide-react-native';
import { Text, EmptyState, Screen } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateShort, formatDateForDB } from '@/lib/date';
import { useVadeListesi, type VadeBirim } from '@/hooks/useIslemTahsis';
import { useState } from 'react';
import { TrackingQuickStartCard } from '@/components/tracking/TrackingQuickStartCard';
import {
  getListEdgePosition,
  getListEdgeStyle,
  type ListEdgePosition,
} from '@/components/ui/listEdgeStyles';

/**
 * Vade Takibi (kullanıcı isteği): işletmedeki TÜM açık vadeli birimler
 * (plansız vadeli işlemler + taksit birimleri) vade sırasıyla tek ekranda.
 * Satış/Alış sekmeleri; Vadesi Geçen / Yaklaşan / İleri Tarihli bölümleri.
 * Satıra dokunuş carinin detayına götürür (yansıtma).
 */

type ListItem =
  | { kind: 'header'; key: string; label: string; count: number; tone: 'gec' | 'yakin' | 'ileri' }
  | { kind: 'birim'; key: string; birim: VadeBirim; gun: number; position: ListEdgePosition };

const TONE_COLOR = {
  gec: colors.errorDark,
  yakin: colors.orangeDark,
  ileri: colors.textSecondary,
} as const;

const TONE_BACKGROUND = {
  gec: colors.errorLight,
  yakin: colors.orangeLight,
  ileri: colors.surfaceLighter,
} as const;

export default function VadeTakipPage() {
  const contentPaddingBottom = useContentBottomPadding();
  const { t } = useTranslation(['transactions', 'common', 'clients']);
  const router = useRouter();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const { data: birimler, isLoading, refetch, isRefetching } = useVadeListesi();
  const [tab, setTab] = useState<'satis' | 'alis'>(tabParam === 'alis' ? 'alis' : 'satis');
  // Akıllı varsayılan sekme: kullanıcı elle değiştirmedi + tabParam yoksa, VERİ OLAN
  // sekmeyle aç. Aksi halde yalnız vadeli ALIŞ olan (Satış boş) işletmede sayfa "vadeli
  // yok" gösteriyordu — halbuki Alış sekmesinde kayıt var (cihaz bulgusu).
  const userTouchedTab = useRef(false);
  useEffect(() => {
    if (userTouchedTab.current || tabParam || !birimler) return;
    const hasSatis = birimler.some((b) => b.type === 'cari_satis' && b.taksit_sira == null);
    const hasAlis = birimler.some((b) => b.type === 'cari_alis' && b.taksit_sira == null);
    if (!hasSatis && hasAlis) setTab('alis');
  }, [birimler, tabParam]);

  const bugunStr = formatDateForDB(new Date());
  const bugunMs = new Date(bugunStr + 'T00:00:00').getTime();

  const listData = useMemo((): ListItem[] => {
    const tip = tab === 'satis' ? 'cari_satis' : 'cari_alis';
    // Taksit birimleri BİLEREK dışarıda (kullanıcı isteği: taksitler ayrı konu —
    // Taksit Takip sayfası var); burada yalnız plansız vadeli işlemler listelenir.
    const filtreli = (birimler ?? []).filter((b) => b.type === tip && b.taksit_sira == null);

    const withGun = filtreli.map((b) => ({
      b,
      gun: Math.round((new Date(String(b.vade) + 'T00:00:00').getTime() - bugunMs) / 86400000),
    }));
    const gec = withGun.filter((x) => x.gun <= 0);
    const yakin = withGun.filter((x) => x.gun > 0 && x.gun <= 7);
    const ileri = withGun.filter((x) => x.gun > 7);

    const out: ListItem[] = [];
    const pushGroup = (
      items: typeof withGun,
      key: string,
      label: string,
      tone: 'gec' | 'yakin' | 'ileri',
    ) => {
      if (items.length === 0) return;
      out.push({ kind: 'header', key: `h-${key}`, label, count: items.length, tone });
      for (const [index, x] of items.entries()) {
        out.push({
          kind: 'birim',
          key: `${x.b.islem_id}-${x.b.taksit_sira ?? 'i'}`,
          birim: x.b,
          gun: x.gun,
          position: getListEdgePosition(index, items.length),
        });
      }
    };
    pushGroup(gec, 'gec', t('transactions:vade.bolumGecikmis'), 'gec');
    pushGroup(yakin, 'yakin', t('transactions:vade.yaklasan7'), 'yakin');
    pushGroup(ileri, 'ileri', t('transactions:vade.bolumIleri'), 'ileri');
    return out;
  }, [birimler, tab, bugunMs, t]);

  const overview = useMemo(() => {
    const counts = { gec: 0, yakin: 0, ileri: 0 };
    for (const item of listData) {
      if (item.kind === 'header') counts[item.tone] = item.count;
    }
    return {
      ...counts,
      total: counts.gec + counts.yakin + counts.ileri,
    };
  }, [listData]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.kind === 'header') {
        return (
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderTitle}>
              <View style={[styles.sectionDot, { backgroundColor: TONE_COLOR[item.tone] }]} />
              <Text style={styles.sectionHeaderText}>{item.label}</Text>
            </View>
            <View style={[styles.sectionCountPill, { backgroundColor: TONE_BACKGROUND[item.tone] }]}>
              <Text style={[styles.sectionHeaderCount, { color: TONE_COLOR[item.tone] }]}>
                {t('transactions:vade.adetKisa', { adet: item.count })}
              </Text>
            </View>
          </View>
        );
      }

      const { birim: b, gun, position } = item;
      const tone: 'gec' | 'yakin' | 'ileri' = gun <= 0 ? 'gec' : gun <= 7 ? 'yakin' : 'ileri';
      const gunText =
        gun < 0
          ? t('transactions:vade.gunGecikti', { gun: -gun })
          : gun === 0
            ? t('transactions:vade.bugunSon')
            : t('transactions:vade.gunSonra', { gun });
      const altText = b.taksit_sira
        ? t('transactions:vade.taksitBirim', { sira: b.taksit_sira, toplam: b.taksit_toplam ?? '?' })
        : b.description ||
          (b.type === 'cari_satis' ? t('transactions:tabs.satis') : t('transactions:tabs.alis'));

      return (
        <TouchableOpacity
          style={[
            styles.row,
            getListEdgeStyle(position),
            position !== 'last' && position !== 'only' && styles.rowDivider,
          ]}
          activeOpacity={0.7}
          onPress={() => router.push(`/cariler/${b.cari_id}` as Href)}
          accessibilityRole="button"
          accessibilityLabel={`${b.cari_name}, ${formatCurrency(b.kalan, b.currency)}, ${gunText}`}
        >
          <View style={styles.rowTop}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowCariName} numberOfLines={1}>{b.cari_name}</Text>
              <Text style={styles.rowAlt} numberOfLines={1}>
                {altText}
              </Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={[styles.rowKalan, { color: TONE_COLOR[tone] }]} numberOfLines={1}>
                {formatCurrency(b.kalan, b.currency)}
              </Text>
              <ChevronRight size={17} color={colors.textMuted} />
            </View>
          </View>

          <View style={[styles.duePill, { backgroundColor: TONE_BACKGROUND[tone] }]}>
            <Clock3 size={13} color={TONE_COLOR[tone]} />
            <Text style={[styles.rowGun, { color: TONE_COLOR[tone] }]} numberOfLines={1}>
              {formatDateShort(String(b.vade))} · {gunText}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [router, t],
  );

  return (
    <>
      <Stack.Screen options={{ headerTitle: t('transactions:vade.cardTitle') }} />
      <Screen>
        <FlatList
          data={listData}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: contentPaddingBottom }]}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews={true}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <TrackingQuickStartCard kind="vade" />

              <View style={styles.listHeadingRow}>
                <Text variant="h3">{t('transactions:vade.openItemsTitle')}</Text>
                <Text variant="caption" color="secondary">
                  {t('transactions:vade.openItemCount', { adet: overview.total })}
                </Text>
              </View>

              <View style={styles.tabs}>
                {(['satis', 'alis'] as const).map((tabKey) => (
                  <TouchableOpacity
                    key={tabKey}
                    style={[styles.tabButton, tab === tabKey && styles.tabButtonActive]}
                    onPress={() => { userTouchedTab.current = true; setTab(tabKey); }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: tab === tabKey }}
                  >
                    <Text style={[styles.tabText, tab === tabKey && styles.tabTextActive]}>
                      {tabKey === 'satis' ? t('transactions:taksit.satis') : t('transactions:taksit.alis')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.statusPanel}>
                <View style={styles.statusItem}>
                  <View style={[styles.statusIcon, styles.statusIconLate]}>
                    <CircleAlert size={17} color={colors.errorDark} />
                  </View>
                  <Text style={[styles.statusCount, styles.statusCountLate]}>{overview.gec}</Text>
                  <Text style={styles.statusLabel} numberOfLines={1}>
                    {t('transactions:vade.statusOverdue')}
                  </Text>
                </View>
                <View style={styles.statusDivider} />
                <View style={styles.statusItem}>
                  <View style={[styles.statusIcon, styles.statusIconSoon]}>
                    <Clock3 size={17} color={colors.orangeDark} />
                  </View>
                  <Text style={[styles.statusCount, styles.statusCountSoon]}>{overview.yakin}</Text>
                  <Text style={styles.statusLabel} numberOfLines={1}>
                    {t('transactions:vade.statusUpcoming')}
                  </Text>
                </View>
                <View style={styles.statusDivider} />
                <View style={styles.statusItem}>
                  <View style={[styles.statusIcon, styles.statusIconLater]}>
                    <CalendarDays size={17} color={colors.textSecondary} />
                  </View>
                  <Text style={styles.statusCount}>{overview.ileri}</Text>
                  <Text style={styles.statusLabel} numberOfLines={1}>
                    {t('transactions:vade.statusLater')}
                  </Text>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            isLoading ? null : (
              <View style={styles.emptyWrap}>
                <EmptyState
                  icon={<CalendarClock size={44} color={colors.textMuted} />}
                  title={t('transactions:vade.bosListe')}
                  description={t('transactions:vade.emptyGuidedDescription')}
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
    paddingBottom: spacing.xs,
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
  statusPanel: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    paddingVertical: spacing.md,
  },
  statusItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.xs,
  },
  statusIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statusIconLate: {
    backgroundColor: colors.errorLight,
  },
  statusIconSoon: {
    backgroundColor: colors.orangeLight,
  },
  statusIconLater: {
    backgroundColor: colors.surfaceLighter,
  },
  statusCount: {
    fontSize: 20,
    lineHeight: 23,
    fontWeight: '800',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  statusCountLate: {
    color: colors.errorDark,
  },
  statusCountSoon: {
    color: colors.orangeDark,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  statusDivider: {
    width: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.xs,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    flexGrow: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  sectionCountPill: {
    borderRadius: borderRadius.full,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  sectionHeaderCount: {
    fontSize: 11,
    fontWeight: '700',
  },
  row: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowInfo: {
    flex: 1,
  },
  rowCariName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  rowAlt: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 1,
  },
  rowGun: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '48%',
  },
  rowKalan: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  duePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: borderRadius.full,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
  },
  emptyWrap: {
    paddingTop: spacing.xl,
  },
});
