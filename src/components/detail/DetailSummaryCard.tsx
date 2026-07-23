import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize } from '@/constants/spacing';

export interface DetailSummaryRow {
  label: string;
  value: string;
  /** Kırmızımsı vurgulu değer (ör. vadesi geçen). */
  danger?: boolean;
  /** Değeri tür rengine göre boya (danger'ı ezer; verilmezse koyu metin). */
  color?: string;
}

interface DetailSummaryCardProps {
  /** Sol üst büyük başlık (çağıran upperTr uygular). */
  title: string;
  /** Başlık altı küçük satır(lar) — tip · telefon vb. */
  subtitle?: string;
  subtitle2?: string;
  /** Sağ üst: etiket + büyük değer (ör. Kalan Borcumuz). */
  balanceLabel: string;
  balanceValue: string;
  /**
   * Büyük bakiye değerini yön rengiyle boya: true=borç(kırmızı), false=alacak/varlık(yeşil).
   * undefined → nötr (koyu metin). Para bakiyeli kartlar geçer; ürün(stok) geçmez.
   */
  balanceNegative?: boolean;
  /** Alt satırlar (etiket solda, değer sağda; aralarında ince ayraç). */
  rows: DetailSummaryRow[];
  /** Kartın en üstünde opsiyonel şerit (ör. bağlantılı-cari). */
  topStrip?: React.ReactNode;
}

/**
 * Detay sayfası özet kartı (cari/personel/ürün ortak) — beyaz zemin (ana sayfa dili),
 * solda başlık + meta, sağda kalan/stok, altında ayraçlı etiket-değer satırları.
 */
export function DetailSummaryCard({
  title,
  subtitle,
  subtitle2,
  balanceLabel,
  balanceValue,
  balanceNegative,
  rows,
  topStrip,
}: DetailSummaryCardProps) {
  const balanceColor = balanceNegative === undefined
    ? undefined
    : (balanceNegative ? colors.error : colors.success);
  return (
    <View style={styles.card}>
      {topStrip}
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          {subtitle2 ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle2}</Text> : null}
        </View>
        <View style={styles.balanceWrap}>
          <Text style={styles.label} numberOfLines={1}>{balanceLabel}</Text>
          <Text
            style={[styles.balanceValue, balanceColor ? { color: balanceColor } : null]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {balanceValue}
          </Text>
        </View>
      </View>

      <View>
        {rows.map((r, i) => (
          <View key={r.label}>
            {/* Satırlar arası ince ayraç (ilk satırın üstündeki, üst bloğu ayırır) */}
            <View style={[styles.rowDivider, i === 0 && styles.rowDividerTop]} />
            <View style={styles.row}>
              <Text style={styles.label} numberOfLines={1}>{r.label}</Text>
              <Text
                style={[styles.value, r.color ? { color: r.color } : (r.danger && styles.valueDanger)]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {r.value}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.primary,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  balanceWrap: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 1,
    maxWidth: '55%',
  },
  balanceValue: {
    color: colors.text,
    fontSize: fontSize['2xl'],
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
  },
  rowDividerTop: {
    backgroundColor: colors.border,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '600',
    flexShrink: 1,
  },
  value: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '800',
    flexShrink: 1,
  },
  valueDanger: {
    color: colors.error,
  },
});
