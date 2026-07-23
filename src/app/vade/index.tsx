import { useMemo, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CalendarClock, ChevronRight } from 'lucide-react-native';
import { Text, EmptyState } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateShort, formatDateForDB } from '@/lib/date';
import { useVadeListesi, type VadeBirim } from '@/hooks/useIslemTahsis';
import { useState } from 'react';

/**
 * Vade Takibi (kullanıcı isteği): işletmedeki TÜM açık vadeli birimler
 * (plansız vadeli işlemler + taksit birimleri) vade sırasıyla tek ekranda.
 * Satış/Alış sekmeleri; Vadesi Geçen / Yaklaşan / İleri Tarihli bölümleri.
 * Satıra dokunuş carinin detayına götürür (yansıtma).
 */

type ListItem =
  | { kind: 'header'; key: string; label: string; count: number; tone: 'gec' | 'yakin' | 'ileri' }
  | { kind: 'birim'; key: string; birim: VadeBirim; gun: number };

// Satırlar yapışık; ayrım 1px gri çizgi (cariler listesi dili)
const VadeSeparator = () => <View style={styles.separator} />;

const TONE_COLOR = {
  gec: colors.error,
  yakin: colors.orange,
  ileri: colors.textSecondary,
} as const;

export default function VadeTakipPage() {
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
      for (const x of items) {
        out.push({
          kind: 'birim',
          key: `${x.b.islem_id}-${x.b.taksit_sira ?? 'i'}`,
          birim: x.b,
          gun: x.gun,
        });
      }
    };
    pushGroup(gec, 'gec', t('transactions:vade.bolumGecikmis'), 'gec');
    pushGroup(yakin, 'yakin', t('transactions:vade.yaklasan7'), 'yakin');
    pushGroup(ileri, 'ileri', t('transactions:vade.bolumIleri'), 'ileri');
    return out;
  }, [birimler, tab, bugunMs, t]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.kind === 'header') {
        return (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionHeaderText, { color: TONE_COLOR[item.tone] }]}>
              {item.label}
            </Text>
            <Text style={styles.sectionHeaderCount}>
              {t('transactions:vade.adetKisa', { adet: item.count })}
            </Text>
          </View>
        );
      }

      const { birim: b, gun } = item;
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
          style={styles.row}
          activeOpacity={0.7}
          onPress={() => router.push(`/cariler/${b.cari_id}` as Href)}
        >
          <View style={styles.rowInfo}>
            <Text style={styles.rowCariName}>{b.cari_name}</Text>
            <Text style={styles.rowAlt} numberOfLines={1}>
              {altText}
            </Text>
            <Text style={[styles.rowGun, { color: TONE_COLOR[tone] }]} numberOfLines={1}>
              {formatDateShort(String(b.vade))} · {gunText}
            </Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={[styles.rowKalan, { color: TONE_COLOR[tone] }]} numberOfLines={1}>
              {formatCurrency(b.kalan, b.currency)}
            </Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </View>
        </TouchableOpacity>
      );
    },
    [router, t],
  );

  return (
    <>
      <Stack.Screen options={{ headerTitle: t('transactions:vade.cardTitle') }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Satış / Alış sekmeleri (Taksit Takip ile aynı dil) */}
        <View style={styles.tabs}>
          {(['satis', 'alis'] as const).map((tabKey) => (
            <TouchableOpacity
              key={tabKey}
              style={[styles.tabButton, tab === tabKey && styles.tabButtonActive]}
              onPress={() => { userTouchedTab.current = true; setTab(tabKey); }}
            >
              <Text style={[styles.tabText, tab === tabKey && styles.tabTextActive]}>
                {tabKey === 'satis' ? t('transactions:taksit.satis') : t('transactions:taksit.alis')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={listData}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          ItemSeparatorComponent={VadeSeparator}
          contentContainerStyle={styles.listContent}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews={true}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            isLoading ? null : (
              <EmptyState
                icon={<CalendarClock size={44} color={colors.textMuted} />}
                title={t('transactions:vade.bosListe')}
                description={t('transactions:vade.bosListeAciklama')}
              />
            )
          }
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabs: {
    flexDirection: 'row',
    margin: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: 3,
    gap: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.text,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  sectionHeaderText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sectionHeaderCount: {
    fontSize: 13,
    color: colors.textMuted,
  },
  // Yapışık düz satır (cariler dili)
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowInfo: {
    flex: 1,
  },
  rowCariName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  rowAlt: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 1,
  },
  rowGun: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowKalan: {
    fontSize: 16,
    fontWeight: '700',
  },
});
