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
export const GlassContainer: ComponentType<{
  spacing?: number;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  children?: ReactNode;
}> = (glassMod?.GlassContainer as never) ?? (View as never);

export interface GlassSurfaceProps {
  /** Kapsayıcı stil — KÖŞE YARIÇAPI dahil (cam kendi native köşesini çizer). */
  style?: StyleProp<ViewStyle>;
  /**
   * 'regular' = standart cam; 'clear' = daha saydam (odak/vurgu durumları için).
   * Odak göstergesini renkli çerçeveyle değil bu geçişle vermek native dildir.
   */
  glassStyle?: 'regular' | 'clear';
  /** Camın üstündeki tint. ÇOK hafif tutulmalı — ağırlaşırsa cam "buzlu"ya döner. */
  tintColor?: string;
  /** Cam dokunuşa fiziksel tepki versin mi (butonlar için). */
  interactive?: boolean;
  /** Cam YOKKEN kullanılacak blur yoğunluğu. */
  fallbackIntensity?: number;
  /** Cam YOKKEN blur üstüne konan düz katman (okunabilirlik). */
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
  glassStyle = 'regular',
  tintColor,
  interactive = false,
  fallbackIntensity = Platform.OS === 'ios' ? 70 : 24,
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
        style={style}
      >
        {children}
      </GV>
    );
  }

  // Fallback: iOS<26 + Android + camsız dev client. Blur clip'li olmalı
  // (cam yolundan farklı olarak burada köşeyi RN kırpıyor).
  return (
    <View style={[styles.fallback, style]}>
      <BlurView intensity={fallbackIntensity} tint="light" style={StyleSheet.absoluteFill} />
      {fallbackOverlay ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackOverlay }]} />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
});
