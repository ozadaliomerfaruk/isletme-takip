import { type ReactNode } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { Text } from './Text';
import { colors } from '@/constants/colors';
import { spacing, HIT_SLOP } from '@/constants/spacing';

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
        <Text variant="h2" numberOfLines={1} style={styles.titleText}>{title}</Text>
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
      {right ? <View style={styles.right}>{right}</View> : null}
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
    gap: spacing.xs,
  },
});
