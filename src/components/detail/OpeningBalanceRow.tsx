import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Pencil } from 'lucide-react-native';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, fontWeight } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';

interface OpeningBalanceRowProps {
  /** Satır başlığı (ör. "Başlangıç Bakiyesi"). */
  label: string;
  /** Alt satır bağlamı (ör. "Hesap açılışı • 12 Oca 2026"). */
  subtitle: string;
  /** Açılış bakiyesi (işaretli; görüntüde mutlak değer + renkle yön). */
  amount: number;
  currency?: string | null;
  /** İşlem yokken düzenlenebilir (ilk giriş); satır tıklanır + kalem görünür. */
  editable?: boolean;
  onEdit?: () => void;
}

/**
 * Açılış/başlangıç bakiyesi satırı — standart işlem satırı diliyle (TransactionRow):
 * sol aksan bar (ikon kutusu yok), flat flush, ince çizgi ayrımı; değer işaretle
 * renklenir (pozitif=yeşil, negatif=kırmızı). Hesap/personel detay ORTAK.
 */
export function OpeningBalanceRow({
  label,
  subtitle,
  amount,
  currency,
  editable = false,
  onEdit,
}: OpeningBalanceRowProps) {
  const accent = amount >= 0 ? colors.success : colors.error;
  const canEdit = editable && !!onEdit;

  const inner = (
    <>
      <View style={[styles.bar, { backgroundColor: accent }]} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>{label}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, { color: accent }]} numberOfLines={1}>
          {formatCurrency(Math.abs(amount), currency)}
        </Text>
        {canEdit ? <Pencil size={15} color={colors.primary} /> : null}
      </View>
    </>
  );

  if (canEdit) {
    return (
      <TouchableOpacity style={styles.row} onPress={onEdit} activeOpacity={0.7}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={styles.row}>{inner}</View>;
}

const styles = StyleSheet.create({
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  bar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    color: colors.text,
    letterSpacing: 0.1,
  },
  subtitle: {
    fontSize: 12.5,
    fontWeight: fontWeight.normal,
    color: colors.textMuted,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  amount: {
    fontSize: 18,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
});
