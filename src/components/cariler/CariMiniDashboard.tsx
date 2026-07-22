import { useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, useWindowDimensions, type ViewToken } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CalendarClock, CalendarRange, CheckCircle2 } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, shadows, fontSize, fontWeight } from '@/constants/spacing';
import { formatCurrency, roundCurrency } from '@/lib/currency';
import { upperTr } from '@/lib/turkishTextUtils';
import { useVadeOzet, useVadeListesi, type VadeOzetSatiri } from '@/hooks/useIslemTahsis';
import { useBuAyTaksitOzeti, useTaksitPlanListesi } from '@/hooks/useTaksit';

const CARD_PADDING = spacing.lg;
/** Ana sayfa carousel'inin aksine BİLEREK kısa (kompakt özet).
    114: taksit kartındaki üç satırlı sütun (bu ay + toplam) sığsın. */
const CARD_HEIGHT = 114;

/** Kartlar dinamik: veri yoksa kart hiç gösterilmez (kullanıcı isteği). */
type CardKey = 'genel' | 'vade' | 'taksit';

interface CariMiniDashboardProps {
  /** Cari yönlü toplamlar (useFinancialSummary.payables/receivables.cari). */
  borcumuz: number;
  alacagimiz: number;
  baseCurrency: string;
  onGenelPress?: () => void;
  /** Vade kartı dokunuşu — Vade Takibi sayfasına gider. */
  onVadePress?: () => void;
  onTaksitPress?: () => void;
}

/**
 * Cariler sayfası mini-dashboard'u: ana sayfadaki gibi kaydırmalı/noktalı ama kısa.
 * 3 kart — Cari Durum (borç/alacak → cari raporu), Vade Takibi (gecikmiş + yaklaşan
 * → listeye gecikmiş filtresi), Bu Ay Taksit (→ Taksit Takip).
 * Vade/taksit verisini kendi çeker; çapraz-para toplamı YOK.
 */
export function CariMiniDashboard({
  borcumuz,
  alacagimiz,
  baseCurrency,
  onGenelPress,
  onVadePress,
  onTaksitPress,
}: CariMiniDashboardProps) {
  const { t } = useTranslation(['clients', 'transactions']);
  const { data: vadeRows } = useVadeOzet();
  const { data: taksitOzet } = useBuAyTaksitOzeti();
  // Kart görünürlüğü PLAN VARLIĞINA bağlı (bu-ay özetine değil): yeni planın ilk
  // taksiti çoğu zaman GELECEK ayda başlar — "bu ay boş" diye kartı gizlemek
  // "taksit ekledim, kart açılmadı" hissi veriyordu (cihaz bulgusu).
  const { data: taksitPlanlar } = useTaksitPlanListesi();
  // Vade kartı görünürlüğü PLANSIZ vadeli işleme bağlı: vade özeti taksit
  // birimlerini de sayar; yalnız-taksitli kullanıcıda Vade kartı çıkıp boş
  // /vade sayfasına götürüyordu (sadelik: kullanılmayan özellik hiç görünmesin).
  const { data: vadeBirimler } = useVadeListesi();

  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const listRef = useRef<FlatList<CardKey>>(null);
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = windowWidth - CARD_PADDING * 2;
  const snapInterval = cardWidth + spacing.sm;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveIndex(viewableItems[0].index);
      activeIndexRef.current = viewableItems[0].index;
    }
  }).current;
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: activeIndexRef.current * snapInterval, animated: false });
  }, [snapInterval]);

  // Vade özeti — ana para birimi satırı (TRY öncelikli); yön ayrı, karışık toplam yok
  const rows: VadeOzetSatiri[] = vadeRows ?? [];
  const num = (v: number | null | undefined) => Number(v) || 0;
  const ana = rows.find((r) => r.currency === 'TRY') ?? rows[0];
  const vadeCur = ana?.currency || 'TRY';
  const gecAlacak = num(ana?.gecikmis_alacak);
  const gecBorc = num(ana?.gecikmis_borc);
  const yaklasan = num(ana?.yaklasan_alacak) + num(ana?.yaklasan_borc);
  const vadeTemiz = gecAlacak <= 0 && gecBorc <= 0 && yaklasan <= 0;

  // Ok işareti (ChevronRight) kullanıcı isteğiyle kaldırıldı — kartlar yine tıklanabilir
  const renderHeader = (
    Icon: typeof CalendarClock | null,
    iconColor: string,
    iconBg: string,
    title: string
  ) => (
    <View style={styles.cardHeader}>
      {Icon && (
        <View style={[styles.iconChip, { backgroundColor: iconBg }]}>
          <Icon size={13} color={iconColor} />
        </View>
      )}
      <Text style={styles.cardTitle} numberOfLines={1}>{upperTr(title)}</Text>
    </View>
  );

  const renderStat = (label: string, value: string, color: string, key?: string) => (
    <View style={styles.stat} key={key}>
      <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {upperTr(label)}
      </Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
    </View>
  );

  const renderItem = useCallback(({ item }: { item: CardKey }) => (
    <View style={{ width: cardWidth }}>
      {item === 'genel' && (
        <TouchableOpacity style={styles.card} activeOpacity={0.75} onPress={onGenelPress}>
          {renderHeader(null, colors.primary, colors.primaryLight, t('clients:miniDashboard.genelTitle'))}
          <View style={styles.statsRow}>
            {renderStat(t('clients:balance.weOwe'), formatCurrency(borcumuz, baseCurrency), colors.error)}
            <View style={styles.divider} />
            {renderStat(t('clients:balance.theyOwe'), formatCurrency(alacagimiz, baseCurrency), colors.success)}
          </View>
        </TouchableOpacity>
      )}
      {item === 'vade' && (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.75}
          onPress={onVadePress}
        >
          {renderHeader(CalendarClock, colors.error, colors.errorLight, t('transactions:vade.cardTitle'))}
          {vadeTemiz ? (
            <View style={styles.emptyWrap}>
              <CheckCircle2 size={14} color={colors.success} />
              <Text style={styles.emptyText}>{upperTr(t('transactions:vade.temiz'))}</Text>
            </View>
          ) : (
            <View style={styles.statsRow}>
              {renderStat(
                t('transactions:vade.gecAlacakKisa'),
                formatCurrency(gecAlacak, vadeCur),
                gecAlacak > 0 ? colors.error : colors.textMuted
              )}
              <View style={styles.divider} />
              {renderStat(
                t('transactions:vade.gecBorcKisa'),
                formatCurrency(gecBorc, vadeCur),
                gecBorc > 0 ? colors.error : colors.textMuted
              )}
              <View style={styles.divider} />
              {renderStat(
                t('transactions:vade.yaklasan7'),
                formatCurrency(yaklasan, vadeCur),
                yaklasan > 0 ? colors.warning : colors.textMuted
              )}
            </View>
          )}
        </TouchableOpacity>
      )}
      {item === 'taksit' && (() => {
        // Kullanıcı isteği: BU AY değerinin altında KALAN TOPLAM taksit tutarı da
        // görünsün. Toplamlar plan listesinden (Taksit Takip ile aynı kural:
        // TRY öncelikli tek para birimi, çapraz-kur toplanmaz).
        const acikPlanlar = (taksitPlanlar ?? []).filter(
          (p) => roundCurrency(p.toplam - p.odenen) > 0.009
        );
        const tCur = acikPlanlar.some((p) => p.currency === 'TRY')
          ? 'TRY'
          : acikPlanlar[0]?.currency || taksitOzet?.currency || 'TRY';
        const toplamKalan = (tip: 'cari_satis' | 'cari_alis') =>
          roundCurrency(
            acikPlanlar
              .filter((p) => p.currency === tCur && p.type === tip)
              .reduce((s, p) => s + Math.max(0, p.toplam - p.odenen), 0)
          );
        const topTahsil = toplamKalan('cari_satis');
        const topOde = toplamKalan('cari_alis');
        const buAyCur = taksitOzet?.currency || tCur;
        const buAyTahsil = taksitOzet?.tahsilKalan ?? 0;
        const buAyOde = taksitOzet?.odemeKalan ?? 0;
        return (
          <TouchableOpacity style={styles.card} activeOpacity={0.75} onPress={onTaksitPress}>
            {renderHeader(CalendarRange, colors.info, colors.infoLight, t('clients:miniDashboard.buAyTaksitTitle'))}
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statLabel} numberOfLines={1}>{upperTr(t('clients:miniDashboard.tahsil'))}</Text>
                <Text
                  style={[styles.statValue, { color: buAyTahsil > 0 ? colors.success : colors.textMuted }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {formatCurrency(buAyTahsil, buAyCur)}
                </Text>
                <Text style={styles.statSub} numberOfLines={1}>
                  {t('clients:miniDashboard.toplam')}: {formatCurrency(topTahsil, tCur)}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.stat}>
                <Text style={styles.statLabel} numberOfLines={1}>{upperTr(t('clients:miniDashboard.odeme'))}</Text>
                <Text
                  style={[styles.statValue, { color: buAyOde > 0 ? colors.error : colors.textMuted }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {formatCurrency(buAyOde, buAyCur)}
                </Text>
                <Text style={styles.statSub} numberOfLines={1}>
                  {t('clients:miniDashboard.toplam')}: {formatCurrency(topOde, tCur)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })()}
    </View>
  ), [cardWidth, t, borcumuz, alacagimiz, baseCurrency, onGenelPress, onVadePress, onTaksitPress, vadeTemiz, gecAlacak, gecBorc, yaklasan, vadeCur, taksitOzet]);

  // Kartlar DİNAMİK (kullanıcı isteği): hiç vadeli/taksitli kayıt yoksa o kart
  // hiç gösterilmez — Genel Durum her zaman, Vade yalnız açık vadeli birim varsa
  // (get_vade_ozet satırı = en az bir açık vadeli birim), Taksit yalnız bu ay
  // taksit varsa.
  const cards: CardKey[] = ['genel'];
  if ((vadeBirimler ?? []).some((b) => b.taksit_sira == null)) cards.push('vade');
  if ((taksitPlanlar?.length ?? 0) > 0) cards.push('taksit');

  return (
    <View style={styles.wrapper}>
      <FlatList
        ref={listRef}
        data={cards}
        renderItem={renderItem}
        keyExtractor={(item) => item}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
        decelerationRate="fast"
        contentContainerStyle={styles.listContent}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        extraData={cardWidth}
        getItemLayout={(_, index) => ({ length: snapInterval, offset: snapInterval * index, index })}
      />
      {cards.length > 1 && (
        <View style={styles.dots}>
          {cards.map((key, i) => (
            <View key={key} style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
    // Cariler liste konteynerinin yatay padding'inden (spacing.lg) kaçış: carousel
    // tam ekran genişliğinde konumlanır, kart marjını kendi padding'i verir.
    // Aksi halde kartlar sola 2×, sağa 0 boşlukla kayıyor ve sağ kenar taşıyordu.
    marginHorizontal: -CARD_PADDING,
  },
  listContent: {
    paddingHorizontal: CARD_PADDING,
    gap: spacing.sm,
  },
  card: {
    height: CARD_HEIGHT,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  cardActive: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconChip: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 0.4,
    flexShrink: 1,
  },
  // flex:1 + center: içerik başlıkla alt kenar arasında DİKEYDE ORTALANIR
  // (önceden alta yapışıktı)
  statsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    minWidth: 0,
  },
  statLabel: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.3,
    maxWidth: '100%',
  },
  statValue: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    maxWidth: '100%',
  },
  statSub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
    maxWidth: '100%',
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.xs,
  },
  emptyWrap: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginTop: spacing.sm,
  },
  dot: {
    borderRadius: 3,
    height: 5,
  },
  dotActive: {
    width: 14,
    backgroundColor: colors.primary,
  },
  dotInactive: {
    width: 5,
    backgroundColor: colors.border,
  },
});
