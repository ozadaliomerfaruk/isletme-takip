import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { View, Platform, StyleSheet, Text, type LayoutChangeEvent } from 'react-native';
import { useSegments, useRouter, Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Home, Users, UserCircle, Package, MoreHorizontal, type LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, interpolate, runOnJS } from 'react-native-reanimated';
import { colors } from '@/constants/colors';
import { usePermissions } from '@/hooks/usePermissions';
import { goToTab } from '@/lib/tabNav';
import { tabBarCollapsed, resetTabBarCollapse } from '@/lib/tabBarScroll';
import { AnimatedGlassView, GLASS_TINT, FALLBACK_FROST, FALLBACK_BLUR_INTENSITY } from './GlassSurface';
import type { ModuleName } from '@/types/multiUser';

type TabConfig = {
  key: string;
  route: Href;
  icon: LucideIcon;
  labelKey: string;
  module?: ModuleName;
};

const TABS: TabConfig[] = [
  { key: 'home', route: '/(tabs)' as Href, icon: Home, labelKey: 'tabs.home' },
  { key: 'cariler', route: '/(tabs)/cariler' as Href, icon: Users, labelKey: 'tabs.clients', module: 'cariler' },
  { key: 'personel', route: '/(tabs)/personel' as Href, icon: UserCircle, labelKey: 'tabs.personnel', module: 'personel' },
  { key: 'urunler', route: '/(tabs)/urunler' as Href, icon: Package, labelKey: 'tabs.stock', module: 'urunler' },
  { key: 'daha', route: '/(tabs)/daha' as Href, icon: MoreHorizontal, labelKey: 'tabs.more' },
];

function getActiveTab(segments: string[]): string | null {
  const first = segments[0];
  const second = segments[1];

  if (first === '(auth)' || first === 'onboarding' || first === 'verify') return null;

  if (first === '(tabs)') {
    if (!second || second === 'index') return 'home';
    if (second === 'cariler') return 'cariler';
    if (second === 'personel') return 'personel';
    if (second === 'urunler') return 'urunler';
    if (second === 'daha') return 'daha';
    return 'home';
  }

  if (first === 'cariler') return 'cariler';
  if (first === 'personel') return 'personel';
  if (first === 'urunler') return 'urunler';
  if (first === 'hesaplar') return 'home';
  if (first === 'islemler') return 'home';
  if (first === 'nakit-akisi') return 'home';
  if (first === 'arama') return 'home';
  if (first === 'foto-import') return 'home';

  if (first === 'raporlar') return 'daha';
  if (first === 'ayarlar') return 'daha';
  if (first === 'kategoriler') return 'daha';
  if (first === 'notlar') return 'daha';
  if (first === 'arsiv') return 'daha';
  if (first === 'taksit') return 'daha';
  if (first === 'yasal') return 'daha';

  return 'home';
}

// Floating cam pill ölçüleri.
// EŞMERKEZLİ KÖŞE: iOS 26 iç içe köşeleri eşmerkezli hizalar (iç yarıçap =
// dış yarıçap − aradaki boşluk). Bu yalnız boşluk HER İKİ eksende eşitse
// mümkün → yatay (ROW_PAD + PILL_INSET) ile dikey (PILL_INSET + PILL_GAP_V)
// ikisi de INNER_GAP olmalı. Bozulursa köşeler hizasız kalır; tek tek fark
// edilmeyen ama toplamda "Apple değil" hissi üreten detay budur.
const INNER_GAP = 7;
const ROW_PAD = 4;
const PILL_INSET = 3; // ROW_PAD + PILL_INSET = INNER_GAP (yatay)
const PILL_GAP_V = INNER_GAP - PILL_INSET; // dikey de INNER_GAP'e tamamlanır
const PILL_H = 66;
const PILL_H_COLLAPSED = 52;

/**
 * Kayan vurgunun yayı: yalnız transform sürüyor (GPU), o yüzden hafif
 * eksik-sönümlü — sekmeye varınca minik bir oturma hissi verir. Yay, timing
 * eğrisinin aksine hedef değişince hızı koruyarak yeniden yönlenir; hızlı
 * sekme değişiminde eğri baştan başlamaz, "mekanik" durmaz.
 */
const SLIDE_SPRING = { duration: 420, dampingRatio: 0.82 };
const LABEL_H = 14;
const TOP_PAD = 6;
const OUTER_PAD_H = 12;
const NARROW = 34; // daralınca pill'in her yandan içeri girmesi (YATAY küçülme)

/** Bar'ın home-indicator ÜSTÜNDEKİ görsel yüksekliği (üst boşluk + pill). Overlay olduğundan
 *  ekranların alt-boşluğu bunu + gerçek safe-area'yı temizlemeli — _layout modifiedInsets bunu ekler. */
export const TAB_BAR_CONTENT_HEIGHT = TOP_PAD + PILL_H;

export function PersistentTabBar() {
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('navigation');
  const { canAccessModule } = usePermissions();

  const activeTab = getActiveTab(segments as string[]);

  const visibleTabs = TABS.filter((tab) => !tab.module || canAccessModule(tab.module));
  const n = visibleTabs.length;
  const activeIndex = Math.max(0, visibleTabs.findIndex((tab) => tab.key === activeTab));

  const [outerW, setOuterW] = useState(0);
  const fullRowContent = outerW > 0 ? outerW - OUTER_PAD_H * 2 - ROW_PAD * 2 : 0;

  const idx = useSharedValue(0);
  const idxMeasured = useRef(false);

  useEffect(() => {
    if (!idxMeasured.current) {
      idx.value = activeIndex;
      idxMeasured.current = true;
    } else {
      idx.value = withSpring(activeIndex, SLIDE_SPRING);
    }
  }, [activeIndex, idx]);

  useEffect(() => {
    resetTabBarCollapse();
  }, [activeTab]);

  const barAnim = useAnimatedStyle(() => ({
    marginHorizontal: OUTER_PAD_H + interpolate(tabBarCollapsed.value, [0, 1], [0, NARROW]),
    height: interpolate(tabBarCollapsed.value, [0, 1], [PILL_H, PILL_H_COLLAPSED]),
  }));
  // Kapsül köşesi = yükseklik/2. iOS 26 camı köşeyi kendi native corner
  // configuration'ıyla çizer (squircle + rim lighting) — radius CAM view'ün
  // stilinde olmalı, dış sarmalayıcıda RN clip maskesi OLMAMALI.
  const radiusAnim = useAnimatedStyle(() => ({
    borderRadius: interpolate(tabBarCollapsed.value, [0, 1], [PILL_H, PILL_H_COLLAPSED]) / 2,
  }));
  const labelAnim = useAnimatedStyle(() => ({
    height: interpolate(tabBarCollapsed.value, [0, 1], [LABEL_H, 0]),
    opacity: interpolate(tabBarCollapsed.value, [0, 1], [1, 0]),
    marginTop: interpolate(tabBarCollapsed.value, [0, 1], [2, 0]),
  }));
  const activePillAnim = useAnimatedStyle(() => {
    const c = tabBarCollapsed.value;
    // İç yarıçap = dış yarıçap − INNER_GAP. Dış yarıçap barH/2 olduğundan bu,
    // iç pill'in de tam kapsül olması demek (yüksekliği barH − 2·INNER_GAP).
    // Dış köşe animasyonlu → iç köşe de animasyonlu olmalı; sabit bırakılırsa
    // yalnız tek durumda hizalı olur (eskiden sabit 20: açıkken 6px hatalı).
    const innerRadius = (interpolate(c, [0, 1], [PILL_H, PILL_H_COLLAPSED]) - INNER_GAP * 2) / 2;
    if (fullRowContent <= 0 || n <= 0) {
      return { width: 0, opacity: 0, borderRadius: innerRadius, transform: [{ translateX: 0 }] };
    }
    const slot = (fullRowContent - c * 2 * NARROW) / n;
    return {
      width: slot - PILL_INSET * 2,
      opacity: 1,
      borderRadius: innerRadius,
      transform: [{ translateX: idx.value * slot }],
    };
  });

  const onOuterLayout = useCallback((e: LayoutChangeEvent) => {
    setOuterW(e.nativeEvent.layout.width);
  }, []);

  // activeTab ref'i: hızlı sürüklemede segments gecikirse mükerrer navigasyonu eler.
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  /** Parmağın ŞU AN üstünde olduğu sekme — navigasyon değil, yalnız işaret. */
  const hoveredRef = useRef(-1);

  /** x → sekme indeksi. Daralmışken slot da dar → güncel tabBarCollapsed ile hesap. */
  const indexAt = useCallback((x: number) => {
    if (fullRowContent <= 0 || n <= 0) return -1;
    const slot = (fullRowContent - tabBarCollapsed.value * 2 * NARROW) / n;
    if (slot <= 0) return -1;
    return Math.max(0, Math.min(n - 1, Math.floor((x - ROW_PAD) / slot)));
  }, [fullRowContent, n]);

  /**
   * Parmağın altındaki sekmeyi işaretle: vurgu oraya kayar, haptik tık atar.
   * NAVİGASYON YOK — sürüklerken sayfa değişmez.
   */
  const hoverAt = useCallback((x: number) => {
    const i = indexAt(x);
    if (i < 0 || i === hoveredRef.current || !visibleTabs[i]) return;
    hoveredRef.current = i;
    idx.value = withSpring(i, SLIDE_SPRING);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [indexAt, visibleTabs, idx]);

  /**
   * PARMAK KALKINCA sayfayı aç — sürüklerken değil.
   *
   * Eskiden parmak her sekmeye girdiğinde anında navigasyon vardı: bar boyunca
   * sürüklemek 5 ayrı ekran değişimi tetikliyor, her biri JS thread'inde
   * mount/render yapıyordu → sürükleme takılıyordu.
   *
   * İndeksi hoveredRef'ten DEĞİL doğrudan son dokunma konumundan hesaplıyor:
   * hoveredRef'i dolduran hoverAt runOnJS ile asenkron çalışıyor ve hızlı bir
   * TIKLAMADA onFinalize ondan önce yetişebiliyordu → tıklama sekme değiştirmiyordu.
   */
  const commitAt = useCallback((x: number) => {
    hoveredRef.current = -1;
    const i = indexAt(x);
    if (i < 0) return;
    const tab = visibleTabs[i];
    if (!tab) return;
    if (tab.key !== activeTabRef.current) {
      goToTab(router, segments as string[], tab.route);
    }
  }, [indexAt, visibleTabs, router, segments]);

  /** Son dokunma x'i — onFinalize'ın event'i olmadığı için UI thread'de saklanır. */
  const lastX = useSharedValue(-1);

  // Bar üstünde TIKLA veya PARMAĞI SÜRÜKLE. Pan bar'a özel, liste scroll'uyla
  // çakışmaz (bar ayrı overlay). onBegin tıklamayı, onUpdate sürüklemeyi karşılar;
  // ikisi de yalnız VURGUYU taşır, sayfa onFinalize'da (parmak kalkınca) açılır.
  const panGesture = useMemo(
    () => Gesture.Pan()
      .onBegin((e) => { lastX.value = e.x; runOnJS(hoverAt)(e.x); })
      .onUpdate((e) => { lastX.value = e.x; runOnJS(hoverAt)(e.x); })
      .onFinalize(() => { runOnJS(commitAt)(lastX.value); }),
    [hoverAt, commitAt, lastX]
  );

  if (activeTab === null) return null;

  const bottomInset = insets.bottom > 0 ? insets.bottom : 10;

  return (
    <View style={styles.outer} pointerEvents="box-none" onLayout={onOuterLayout}>
      <View pointerEvents="box-none" style={{ paddingTop: TOP_PAD, paddingBottom: bottomInset }}>
        <Animated.View style={barAnim}>
          {AnimatedGlassView ? (
            // Gerçek liquid glass: tint çok hafif, üstünde beyaz overlay YOK
            // (overlay lensing'i perdeleyip buzlu gosteriyor).
            <AnimatedGlassView
              glassEffectStyle="regular"
              // tintColor = paketin native API'si (UIGlassEffect.tintColor);
              // backgroundColor camın ÜSTÜNE düz katman koyup lensing'i perdeler.
              tintColor={GLASS_TINT}
              style={[StyleSheet.absoluteFill, styles.glass, radiusAnim]}
            />
          ) : (
            // iOS<26 + Android: bugünkü görünüm (blur + frost overlay), clip'li.
            <Animated.View style={[StyleSheet.absoluteFill, styles.fallbackClip, radiusAnim]}>
              <BlurView
                intensity={FALLBACK_BLUR_INTENSITY}
                tint="light"
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.pillOverlay} />
            </Animated.View>
          )}

          <GestureDetector gesture={panGesture}>
            <View style={styles.row}>
              {fullRowContent > 0 ? (
                <Animated.View style={[styles.activePill, activePillAnim]} />
              ) : null}

              {visibleTabs.map((tab) => {
                const focused = activeTab === tab.key;
                const color = focused ? colors.primary : colors.textMuted;
                const Icon = tab.icon;
                return (
                  <View
                    key={tab.key}
                    style={styles.tabButton}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: focused }}
                    accessibilityLabel={t(tab.labelKey)}
                  >
                    <Icon size={27} color={color} strokeWidth={focused ? 2.4 : 2} />
                    <Animated.View style={[styles.labelWrap, labelAnim]}>
                      <Text
                        style={[styles.label, { color, fontWeight: focused ? '700' : '500' }]}
                        numberOfLines={1}
                      >
                        {t(tab.labelKey)}
                      </Text>
                    </Animated.View>
                  </View>
                );
              })}
            </View>
          </GestureDetector>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  // Liquid glass: köşe geometrisi cam view'ün KENDİ stilinde (native squircle +
  // rim lighting) — dış clip maskesi, gölge ve border YOK. Tint `tintColor`
  // prop'uyla (styles'ta backgroundColor ile DEĞİL) — bkz. GLASS_TINT.
  glass: {
    borderCurve: 'continuous',
  },
  // iOS<26 + Android fallback: bugüne kadarki görünüm.
  fallbackClip: {
    overflow: 'hidden',
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    // GLASS: iOS'ta ŞEFFAF — BlurView alttaki içeriği buğulandırsın (beyazı değil). Android: beyaz.
    backgroundColor: Platform.OS === 'android' ? colors.surface : 'transparent',
    elevation: 8,
  },
  pillOverlay: {
    ...StyleSheet.absoluteFillObject,
    // Frost katmanı — alttan kayan içerik görünsün diye hafif. Değer
    // GlassSurface'ta ortak (cam yolundaki tint'le birlikte ayarlanır).
    backgroundColor: FALLBACK_FROST,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: ROW_PAD,
    alignItems: 'stretch',
  },
  activePill: {
    position: 'absolute',
    // Yatay ve dikey boşluk EŞİT (INNER_GAP) — eşmerkezli köşenin ön koşulu.
    left: ROW_PAD + PILL_INSET,
    top: PILL_INSET + PILL_GAP_V,
    bottom: PILL_INSET + PILL_GAP_V,
    borderCurve: 'continuous',
    backgroundColor: colors.primaryLight,
    // borderRadius activePillAnim'de (dış köşeyle birlikte animasyonlu).
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  labelWrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
  },
});
