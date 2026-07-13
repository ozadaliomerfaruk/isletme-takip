import { type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

interface TabHeaderProps {
  /** Sol taraftaki başlık (ekran adı). */
  title: string;
  /** Başlığın altındaki opsiyonel ikinci satır (ör. "12 personel"). */
  subtitle?: string;
  /** Sağ taraftaki aksiyonlar (arama, sıralama, AddEntityButton…). */
  right?: ReactNode;
}

/**
 * Tüm tab ekranlarının en üstündeki SABİT (sticky) header satırı.
 *
 * Scroll-container'ın DIŞINA konur → kaydırınca en üstte yapışık kalır (#3).
 * Sabit yükseklik/padding → her sayfada aynı boyut (#2).
 */
export function TabHeader({ title, subtitle, right }: TabHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.left}>
        <Text variant="h2" numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text variant="caption" color="secondary" numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
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
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
