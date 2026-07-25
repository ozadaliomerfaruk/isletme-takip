import { type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { GlassSurface, LIQUID_GLASS, FLOATING_CONTROL_SIZE } from './GlassSurface';

/** Alt bölgedeki yüzen kontrollerle ORTAK — ayrı bir sayı yazma, bkz. sabit. */
export const FAB_SIZE = FLOATING_CONTROL_SIZE;

/** '#RRGGBB' → 'rgba(r,g,b,a)'. Hex değilse olduğu gibi döner. */
function withAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#') || color.length !== 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface GlassFabProps {
  onPress: () => void;
  /**
   * Butonun rengi: camda TINT, cam yoksa DİSK rengi. Sembol her iki yolda beyaz.
   *
   * Apple'ın Landmarks örneğindeki yüzen köşe butonu tint'SİZ nötr camdı (renk
   * içerikte yaşar). Biz bilinçli olarak ayrılıyoruz: nötr cam bizim AÇIK
   * temamızda (arka plan #F5F5F5, kartlar beyaz) neredeyse beyaz bir daireye
   * dönüşüyor ve birincil aksiyonun çıpası kayboluyor — GlassSurface'taki
   * "küçük/tekil yüzey + açık zemin → tint şart" kuralının ta kendisi.
   */
  color?: string;
  /** İkon, tint'i verilerek çağrılır. */
  renderIcon: (props: { color: string; size: number }) => ReactNode;
  /** Konumlandırma çağırana ait (position/right/bottom/zIndex). */
  style?: StyleProp<ViewStyle>;
  /** Çap. Varsayılan FAB_SIZE (56); ikincil FAB'lar daha küçük olabilir. */
  size?: number;
  iconSize?: number;
  accessibilityLabel?: string;
  disabled?: boolean;
}

/**
 * Yüzen aksiyon butonu — cam varsa nötr cam gövde + renkli sembol,
 * yoksa bugünkü dolu renkli disk + beyaz sembol.
 *
 * Fallback'te iki platformda iki farklı kimlik oluşur (cam vs dolu yeşil); bu
 * bilinçli — cam yokken saydam bir buton okunmaz, dolu disk tek doğru seçenek.
 */
export function GlassFab({
  onPress,
  color = colors.primary,
  renderIcon,
  style,
  size = FAB_SIZE,
  iconSize = 24,
  accessibilityLabel,
  disabled,
}: GlassFabProps) {
  return (
    <GlassSurface
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
      fallbackStyle={[styles.fabFallback, { backgroundColor: color }]}
      // Marka renginde tint — bkz. `color` prop'unun gerekçesi.
      tintColor={withAlpha(color, 0.45)}
      // DİKKAT: dokunma TouchableOpacity'si cam yüzeyin İÇİNDE olmak zorunda.
      // Dışına alınırsa activeOpacity basılıyken alpha<1 yapar ve cam çöker
      // (GlassSurface'taki ALTIN KURAL).
    >
      <TouchableOpacity
        style={styles.touchable}
        onPress={onPress}
        activeOpacity={0.8}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {renderIcon({ color: colors.surface, size: iconSize })}
      </TouchableOpacity>
    </GlassSurface>
  );
}

interface GlassFabMenuItemProps {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}

/**
 * FAB açılınca beliren yüzen menü satırı.
 *
 * Apple'ın Landmarks/BadgesView'ı bunun birebir karşılığı: sağ-alt köşedeki
 * yüzen buton + açılan dikey cam liste, hepsi tek GlassEffectContainer'da.
 * Öğeler arası boşluk container spacing'inden KÜÇÜK seçilirse birbirlerine
 * erirler (bkz. GlassContainer dokümantasyonu) — çağıran taraf menü kabını
 * GlassContainer(spacing) yapar, aradaki gap spacing.sm=8 < 10.
 *
 * Camda ikonun arkasındaki gri daire YOK: gri disk cam üstünde çamurlu durur,
 * ikon zaten semantik renkte (Apple da rengi içerikte taşıyor). Fallback'te
 * daire korunuyor — orada beyaz zeminde ikona zemin gerekiyor.
 */
export function GlassFabMenuItem({ icon, label, onPress }: GlassFabMenuItemProps) {
  return (
    <GlassSurface style={styles.menuItem} fallbackStyle={styles.menuItemFallback} interactive>
      <TouchableOpacity
        style={styles.menuItemInner}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {LIQUID_GLASS ? icon : <View style={styles.menuIconCircle}>{icon}</View>}
        <Text style={styles.menuLabel}>{label}</Text>
      </TouchableOpacity>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  // Yalnız cam yokken: dolu disk + gölge (bugünkü görünüm birebir).
  fabFallback: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  touchable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- FAB menü satırı ---
  menuItem: {
    borderRadius: borderRadius.full,
  },
  menuItemFallback: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  menuItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  menuIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
