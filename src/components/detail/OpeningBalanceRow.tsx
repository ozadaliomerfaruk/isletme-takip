import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Pencil, Plus } from 'lucide-react-native';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontWeight } from '@/constants/spacing';
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
  /**
   * Düzenlenebilir VE bakiye 0 iken tutar yerine gösterilecek "ekle" çağrısı
   * (ör. "Başlangıç bakiyesi ekle"); verilmezse 0 tutar olarak basılır.
   */
  emptyCta?: string;
}

/**
 * Açılış/başlangıç bakiyesi satırı — standart işlem satırı diliyle (TransactionRow):
 * sol aksan bar (ikon kutusu yok), flat flush, ince çizgi ayrımı; değer işaretle
 * renklenir (pozitif=yeşil, negatif=kırmızı). Cari/hesap/personel detay ORTAK.
 */
export function OpeningBalanceRow({
  label,
  subtitle,
  amount,
  currency,
  editable = false,
  onEdit,
  emptyCta,
}: OpeningBalanceRowProps) {
  const accent = amount >= 0 ? colors.success : colors.error;
  const canEdit = editable && !!onEdit;
  // Boş + düzenlenebilir: "0,00" yerine belirgin ekleme çağrısı (ilk giriş yolu).
  const showEmptyCta = canEdit && !!emptyCta && Math.abs(amount) < 0.005;

  const inner = (
    <>
      <View style={[styles.bar, { backgroundColor: accent }]} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>{label}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <View style={styles.right}>
        {showEmptyCta ? (
          <View style={styles.cta}>
            <Plus size={16} color={colors.primary} />
            <Text style={styles.ctaText} numberOfLines={1}>{emptyCta}</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.amount, { color: accent }]} numberOfLines={1}>
              {formatCurrency(Math.abs(amount), currency)}
            </Text>
            {canEdit ? <Pencil size={15} color={colors.primary} /> : null}
          </>
        )}
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
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight + '20',
  },
  ctaText: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  amount: {
    fontSize: 18,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
});
