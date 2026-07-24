import { type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { GlassSurface, LIQUID_GLASS } from './GlassSurface';

export const FAB_SIZE = 56;

interface GlassFabProps {
  onPress: () => void;
  /**
   * Marka rengi. CAM yolunda SEMBOLÜN rengi, cam YOKKEN DİSKİN rengi.
   *
   * Apple'ın deseni (Landmarks/BadgesView): yüzen köşe butonu `.buttonStyle(.glass)`
   * — yani tint'siz NÖTR cam; renk camda değil İÇERİKTE yaşıyor (rozetin arkasındaki
   * hexagon badgeColor'da, toggle sembolü badgeShowHideColor'da). Camı marka rengiyle
   * tint'lemek saydam uygulandığı için 56px'lik dolu diski soluk bir tona çevirir ve
   * birincil aksiyonun kontrastını düşürür.
   */
  color?: string;
  /** İkon, doğru tint verilerek çağrılır (cam: color, fallback: beyaz). */
  renderIcon: (props: { color: string; size: number }) => ReactNode;
  /** Konumlandırma çağırana ait (position/right/bottom/zIndex). */
  style?: StyleProp<ViewStyle>;
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
  iconSize = 24,
  accessibilityLabel,
  disabled,
}: GlassFabProps) {
  // Camda sembol marka renginde, dolu diskte beyaz.
  const iconColor = LIQUID_GLASS ? color : colors.surface;

  return (
    <GlassSurface
      style={[styles.fab, style]}
      fallbackStyle={[styles.fabFallback, { backgroundColor: color }]}
      interactive
    >
      <TouchableOpacity
        style={styles.touchable}
        onPress={onPress}
        activeOpacity={0.8}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {renderIcon({ color: iconColor, size: iconSize })}
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
  // Geometri — iki yolda da. Cam köşeyi kendi native corner configuration'ıyla
  // çizer; RN clip maskesi/gölge/border EKLENMEZ (rim lighting'i perdeler).
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
  },
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
