import { type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { GlassSurface, LIQUID_GLASS, FLOATING_CONTROL_SIZE } from './GlassSurface';

/** Alt bölgedeki yüzen kontrollerle ORTAK — ayrı bir sayı yazma, bkz. sabit. */
export const FAB_SIZE = FLOATING_CONTROL_SIZE;

interface GlassFabProps {
  onPress: () => void;
  /** Butonun DOYGUN rengi (camın arkasındaki disk). Sembol her iki yolda beyaz. */
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
 * Yüzen aksiyon butonu — doygun renkli disk + üstünde cam ("prominent glass").
 * Disk ve beyaz sembol HER İKİ YOLDA aynı; camlı cihazda üstüne parlama, kenar
 * ışığı ve basma tepkisi biniyor. Yani platformlar arası kimlik farkı YOK —
 * bir ara "iOS'ta cam, Android'de dolu yeşil, iki marka kimliği" endişesi
 * vardı, bu kurulumda kendiliğinden ortadan kalktı.
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
  const round = { width: size, height: size, borderRadius: size / 2 };

  return (
    // RENK CAMIN ARKASINDA — "prominent glass" yaklaşımı.
    //
    // Neden tintColor değil: tintColor doğrudan UIGlassEffect.tintColor'a gidiyor
    // ve o özellik tanımı gereği SAYDAM biniyor — camın arkadan örneklediği rengin
    // üstüne ince bir katman koyuyor. Arkada açık gri sayfa varken sonuç kaçınılmaz
    // olarak pastel çıkıyordu; alfayı yükseltmek de kurtarmıyor, cam olmaktan
    // çıkıp renkli buzlu cama dönüyor.
    //
    // Apple'ın bu görünüm için resmî varyantı prominent glass (.glassProminent):
    // doygun dolgu + üstünde camın parlaması. expo-glass-effect onu dışa vermiyor
    // (GlassStyle yalnız clear/regular/none), o yüzden iki katmanla yaklaşıyoruz:
    // altta opak doygun disk, üstünde 'clear' cam. Cam arkasındakini örnekliyor,
    // arkasında artık açık gri sayfa değil doygun disk var → renk canlı kalıyor,
    // parlama/kenar ışığı/basma tepkisi camdan geliyor.
    //
    // Mevcut kuralla çelişmiyor: "cam yolunda üstüne düz katman koyma" kuralı
    // ÜSTÜNÜ kastediyordu; bu katman ALTTA, rim lighting'i perdelemiyor.
    //
    // SINIR: bu tarif yalnız FAB'lara. Opak disk GlassContainer erimesine
    // katılmaz — birleşmesi gereken yüzeylerde (header daireleri) kullanılmaz,
    // orada nötr cam + GLASS_TINT_CONTROL doğru olan.
    <View style={[round, styles.fabFallback, { backgroundColor: color }, style]}>
      <GlassSurface style={[styles.fill, { borderRadius: size / 2 }]} glassStyle="clear">
        {/* Dokunma TouchableOpacity'si camın İÇİNDE olmak zorunda: dışına
            alınırsa activeOpacity basılıyken alpha<1 yapar ve cam çöker
            (GlassSurface'taki ALTIN KURAL). */}
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
    </View>
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
  /**
   * Cam katmanı doygun diskin üstünü kaplar. RN clip maskesi (overflow:hidden)
   * YOK — cam kendi native köşesini çiziyor, maske rim lighting'i bozardı.
   */
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  // Diskin gölgesi — cam katmanın ALTINDAKİ view'de, yani rim lighting'i
  // perdelemiyor. Cam yoksa da aynı görünüm (bugünkü hali birebir).
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
