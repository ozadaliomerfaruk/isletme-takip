import { type ReactNode } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { Text } from './Text';
import { GlassContainer, GLASS_MERGE_SPACING } from './GlassSurface';
import { colors } from '@/constants/colors';
import { spacing, HIT_SLOP } from '@/constants/spacing';
import { upperTr } from '@/lib/turkishTextUtils';

interface TabHeaderProps {
  /** Sol taraftaki başlık (ekran adı veya işletme adı). */
  title: string;
  /** Başlığın altındaki opsiyonel ikinci satır (ör. "12 personel"). */
  subtitle?: string;
  /** Sağ taraftaki aksiyonlar (arama, sıralama, AddEntityButton…). */
  right?: ReactNode;
  /** Verilirse başlık tıklanabilir olur (ör. işletme değiştir) — yanında chevron çıkar. */
  onTitlePress?: () => void;
}

/**
 * Tüm tab ekranlarının en üstündeki SABİT (sticky) header satırı.
 *
 * Scroll-container'ın DIŞINA konur → kaydırınca en üstte yapışık kalır (#3).
 * Sabit yükseklik/padding → her sayfada aynı boyut (#2).
 */
export function TabHeader({ title, subtitle, right, onTitlePress }: TabHeaderProps) {
  const titleBlock = (
    <>
      <View style={styles.titleRow}>
        <Text variant="h2" numberOfLines={1} style={styles.titleText}>{upperTr(title)}</Text>
        {onTitlePress ? <ChevronDown size={18} color={colors.textMuted} /> : null}
      </View>
      {subtitle ? (
        <Text variant="caption" color="secondary" numberOfLines={1}>{subtitle}</Text>
      ) : null}
    </>
  );

  return (
    <View style={styles.header}>
      {onTitlePress ? (
        <TouchableOpacity
          style={styles.left}
          onPress={onTitlePress}
          activeOpacity={0.7}
          hitSlop={HIT_SLOP.sm}
          accessibilityRole="button"
        >
          {titleBlock}
        </TouchableOpacity>
      ) : (
        <View style={styles.left}>{titleBlock}</View>
      )}
      {/**
        * Sağ aksiyon grubu GlassContainer: yan yana duran CAM butonlar
        * birbirine erir ve tek kapsül olur (Apple'ın ToolbarItemGroup dili).
        * Kaldıraç markup değil BOŞLUK: styles.right'ın gap'i spacing.xs = 4 ve
        * 4 < GLASS_MERGE_SPACING (10) → erirler. Bir butonu gruptan AYIRMAK
        * istersen aradaki boşluğu spacing.md = 12'ye çıkar (12 > 10 → ayrı kalır).
        *
        * AddEntityButton (+EKLE) cam olmadığı için erimeye katılmaz, kendiliğinden
        * ayrı durur — ama container'ın İÇİNDE kalmalı, dışarı alınırsa hizalama bozulur.
        */}
      {right ? (
        <GlassContainer spacing={GLASS_MERGE_SPACING} style={styles.right}>
          {right}
        </GlassContainer>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    minHeight: 44,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  left: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  titleText: {
    flexShrink: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    /**
     * GRUP-İÇİ BOŞLUK — erimeyi de nefes payını da bu belirliyor.
     *
     * spacing.sm = 8: butonlar 36px olduğundan ikon merkezleri 44px arayla
     * düşer (Apple'ın native toolbar grubunda ~44-48). Eskiden spacing.xs = 4
     * idi, merkezler 40px'e iniyordu ve grup sıkışık okunuyordu.
     *
     * 8 < GLASS_MERGE_SPACING (10) → cam butonlar hâlâ tek kapsüle erir.
     * Bu değer 9'u GEÇEMEZ; daha fazla nefes gerekiyorsa doğru kaldıraç gap
     * değil buton çapıdır (36 → 40, minHeight 44'e sığar) — o zaman erime
     * matematiğine hiç dokunulmaz.
     */
    gap: spacing.sm,
  },
});
