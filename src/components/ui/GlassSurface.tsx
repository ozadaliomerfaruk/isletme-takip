import { type ComponentType, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

/**
 * iOS 26 Liquid Glass (UIGlassEffect) için TEK erişim noktası.
 *
 * Neden tek dosya: cam native modül — iOS 26 altı, Android ve modülü içermeyen
 * eski dev client'larda YOK. Her yüzeyde ayrı ayrı "var mı?" dalı yazmak aynı
 * fallback mantığını N kez kopyalamak demekti. Kullanılabilirlik kontrolü ve
 * cam-yoksa görünümü burada bir kez tanımlı.
 *
 * require guard'lı: modül binary'de yoksa import patlamasın, sessizce fallback.
 */
let glassMod: {
  GlassView: ComponentType<Record<string, unknown>>;
  GlassContainer: ComponentType<Record<string, unknown>>;
  isLiquidGlassAvailable: () => boolean;
} | null = null;
try {
  // Koşullu yükleme: modül binary'de yoksa statik import bundle'ı patlatır,
  // require try/catch ile yakalanabilir.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  glassMod = require('expo-glass-effect');
} catch {
  glassMod = null;
}

/** Gerçek liquid glass bu cihazda çiziliyor mu (iOS 26+ ve modül mevcut). */
export let LIQUID_GLASS = false;
try {
  LIQUID_GLASS = Platform.OS === 'ios' && !!glassMod?.isLiquidGlassAvailable?.();
} catch {
  LIQUID_GLASS = false;
}

/**
 * Animasyonlu cam view — köşe/boyut animasyonu sürecek yüzeyler için
 * (ör. daralan tab bar). Cam yoksa null; çağıran taraf fallback'e düşer.
 */
export const AnimatedGlassView =
  LIQUID_GLASS && glassMod ? Animated.createAnimatedComponent(glassMod.GlassView) : null;

/**
 * Cam elemanları birbirine ERİTEN kapsayıcı (UIGlassEffectContainer).
 *
 * `spacing`, elemanların birbirini etkilemeye başladığı mesafe. Apple'ın kendi
 * örneğindeki (Landmarks/BadgesView) kalibrasyon: rozetler arası boşluk 14,
 * rozet yığını ile buton arası 20, container spacing 16 → yani spacing,
 * BİRLEŞMESİNİ istediğin boşluktan büyük, AYRI kalmasını istediğinden küçük
 * seçilir. Cam yoksa düz View — çocukları etkilemez, düzen aynı kalır.
 *
 * NOT: Apple'ın açılış morph'u `glassEffectID` + namespace ile çalışır;
 * expo-glass-effect bu API'yi dışa vermiyor → bizde yalnız yakınlık-erimesi var.
 */
export function GlassContainer({
  spacing,
  style,
  pointerEvents,
  children,
}: {
  spacing?: number;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  children?: ReactNode;
}) {
  // Cam yoksa düz View — `spacing` aktarılmaz (View tanımaz), düzen aynı kalır.
  if (!LIQUID_GLASS || !glassMod) {
    return (
      <View style={style} pointerEvents={pointerEvents}>
        {children}
      </View>
    );
  }
  const GC = glassMod.GlassContainer;
  return (
    <GC spacing={spacing} style={style} pointerEvents={pointerEvents}>
      {children}
    </GC>
  );
}

// ============================================================================
// SAYDAMLIK AYARLARI — yüzen kontrol katmanının tamamı buradan ayarlanır.
// İki YOL var ve ayrı ayrı ayarlanır:
//   • Cam yolu (iOS 26+): GLASS_TINT
//   • Fallback (iOS<26, Android, camsız dev client): FALLBACK_* değerleri
// Artırırken sınır OKUNABİLİRLİK: bar'ın altından koyu/yoğun bir liste
// satırı geçerken sekme yazıları ve arama placeholder'ı hâlâ okunmalı.
// ============================================================================

/**
 * Camın üstündeki tint. TINT YOK: camın en saydam hali, sistem neyi çiziyorsa o.
 * Buradan daha ileri gitmenin tek yolu `glassEffectStyle`'ı 'clear'a çevirmek
 * (GlassSurface prop'u) — o da açık zeminde fazla kaybolabilir, cihazda görülmeli.
 */
export const GLASS_TINT = 'transparent';

/** Fallback'te blur üstüne konan frost katmanı (tab bar gibi blur'lu yüzeyler). */
export const FALLBACK_FROST =
  Platform.OS === 'ios' ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.70)';

/**
 * Fallback'te blur'suz yüzeylerin (arama pill'i, kapatma X'i) arka planı.
 * Yarı saydam: altındaki liste seziliyor ama metin okunur kalıyor.
 * Android'de blur yok → daha opak, yoksa yazı zeminde kaybolur.
 *
 * DİKKAT — bu değer FALLBACK_FROST kadar düşürülemez: tab bar'ın altında blur
 * var, dolgu sıfıra yaklaşsa bile yüzeyin varlığı kalır. Buradaki yüzeylerde
 * blur YOK (gölgeyi korumak için; blur `overflow: hidden` ister), yani onları
 * ayakta tutan tek şey bu dolgu. 0.45'te tamamen kayboluyordu.
 */
export const FALLBACK_SURFACE =
  Platform.OS === 'ios' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.80)';

/**
 * Fallback yüzeylerin kenar çizgisi — AÇIK ZEMİNDE ŞEKLİ TANIMLAYAN ŞEY BUDUR.
 *
 * Beyaz dolgu, açık gri arka plan (#F5F5F5) ve beyaz kartların üstünde kaybolur;
 * kontrastı yaratan dolgu DEĞİL kenar + gölgedir. Bu yüzden "görünmüyor"
 * şikayetinin doğru çözümü alfayı yükseltmek değil (yüzeyi opaklaştırır, saydam
 * görünüm gider), kenarı belirginleştirmektir.
 *
 * colors.border (#E5E7EB) bu iş için fazla açıktı — arka planla neredeyse aynı.
 * WhatsApp/Instagram'da bu sorun yok çünkü onlar koyu temada; açık temada
 * saydam yüzey ancak kenarıyla okunur.
 */
export const FALLBACK_RIM = 'rgba(0,0,0,0.15)';

/**
 * Fallback yüzeylerin gölgesi. shadows.lg (opaklık 0.1, yayılım 16) açık gri
 * zeminde neredeyse görünmüyordu — daha derli toplu ve belirgin: yüzey
 * "içeriğin ÜSTÜNDE yüzüyor" okunsun.
 */
export const FALLBACK_SHADOW = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  android: { elevation: 6 },
  default: {},
});

/**
 * Fallback blur yoğunluğu. Saydamlıkta en güçlü kaldıraç BUDUR: frost katmanını
 * kısmak bir yere kadar gider, asıl beyazlatmayı blur'un kendisi yapar.
 *
 * SINIR: düştükçe arkadaki içerik bulanık değil KESKİN görünmeye başlar; o
 * noktadan sonra "cam" değil "yarı saydam plastik" hissi verir. 32 civarı bu
 * eşiğe yakın — daha da saydam isteniyorsa blur'u değil FALLBACK_SURFACE'ı düşür.
 */
export const FALLBACK_BLUR_INTENSITY = Platform.OS === 'ios' ? 32 : 24;

/**
 * Alt bölgedeki YÜZEN KONTROLLERİN ortak yüksekliği: FAB, arama pill'i ve
 * kapatma X'i. Üçü de aynı taban çizgisine (bottom = spacing.lg + insets.bottom)
 * çıpalı olduğundan, yükseklik eşit olunca DİKEY MERKEZLERİ de tam hizalanır.
 *
 * Neden ortak sabit: eskiden üçü ayrı ayrı yazılıydı (56 / 52 / 44) ve gözle
 * görülür şekilde ayrışmışlardı. Cam erimesi merkez hizasına duyarlıdır —
 * hizasızsa birleşme akışkan değil "yamuk damla" görünür.
 */
export const FLOATING_CONTROL_SIZE = 56;

/**
 * GlassContainer için ortak `spacing`. Apple'ın kalibrasyonu (Landmarks/
 * BadgesView): rozet arası 14 < spacing 16 < yığın↔buton 20 — yani spacing,
 * BİRLEŞMESİNİ istediğin boşluktan büyük, AYRI kalmasını istediğinden küçük.
 *
 * Bizim boşluklarımız: grup içi spacing.sm = 8 (arama pill'i↔X, FAB menü
 * satırları), gruplar arası spacing.md = 12 (menü↔FAB). 8 < 10 < 12 → grup içi
 * erir, gruplar ayrı kalır. Bu sabiti değiştirmeden önce iki boşluğu da kontrol et.
 */
export const GLASS_MERGE_SPACING = 10;

export interface GlassSurfaceProps {
  /**
   * HER İKİ yolda uygulanan stil: geometri (boyut, köşe yarıçapı, flex).
   * Görsel dolgu (arka plan, border, gölge) buraya DEĞİL fallbackStyle'a —
   * cam yolunda bunlar native rim lighting'i perdeler.
   */
  style?: StyleProp<ViewStyle>;
  /** YALNIZ cam yokken uygulanır: bugünkü opak görünüm (bg + border + gölge). */
  fallbackStyle?: StyleProp<ViewStyle>;
  /**
   * 'regular' = standart cam; 'clear' = daha saydam (medya üstü içerik için).
   * Odak/etkin durumu renkli çerçeveyle değil bu geçişle vermek native dildir.
   */
  glassStyle?: 'regular' | 'clear';
  /** Camın üstündeki tint. Verilmezse GLASS_TINT. */
  tintColor?: string;
  /** Cam dokunuşa fiziksel tepki versin mi (butonlar için). */
  interactive?: boolean;
  /**
   * Cam yokken altına BlurView koy. Varsayılan false — çoğu yüzeyin fallback'i
   * bugünkü opak görünüm olmalı (blur, arkası hareketli olan yüzeyler için).
   */
  fallbackBlur?: boolean;
  fallbackIntensity?: number;
  /** fallbackBlur ile birlikte: blur üstüne konan düz katman (okunabilirlik). */
  fallbackOverlay?: string;
  children?: ReactNode;
}

/**
 * Tek bir cam yüzey. Animasyon gerekmeyen yerler için (arama pill'i, yuvarlak
 * ikon butonları, fotoğraf üstü kontroller). Animasyon gereken yerler
 * AnimatedGlassView'i doğrudan kullanır.
 *
 * Cam yolunda ÜSTÜNE düz katman/gölge/border KOYMA: native rim lighting ve
 * lensing perdelenir, yüzey "yapıştırılmış sticker" gibi durur.
 */
export function GlassSurface({
  style,
  fallbackStyle,
  glassStyle = 'regular',
  tintColor = GLASS_TINT,
  interactive = false,
  fallbackBlur = false,
  fallbackIntensity = FALLBACK_BLUR_INTENSITY,
  fallbackOverlay,
  children,
}: GlassSurfaceProps) {
  if (LIQUID_GLASS && glassMod) {
    const GV = glassMod.GlassView;
    return (
      <GV
        glassEffectStyle={glassStyle}
        tintColor={tintColor}
        isInteractive={interactive}
        style={[styles.glass, style]}
      >
        {children}
      </GV>
    );
  }

  // Fallback: iOS<26 + Android + camsız dev client.
  // Blur varsa köşeyi RN kırpmalı (cam yolunda bunu native köşe yapıyordu);
  // blur yoksa kırpma YOK — gölge overflow:hidden ile birlikte çizilmez.
  return (
    <View style={[fallbackBlur && styles.clip, style, fallbackStyle]}>
      {fallbackBlur ? (
        <>
          <BlurView intensity={fallbackIntensity} tint="light" style={StyleSheet.absoluteFill} />
          {fallbackOverlay ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackOverlay }]} />
          ) : null}
        </>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    borderCurve: 'continuous',
  },
  clip: {
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
});
