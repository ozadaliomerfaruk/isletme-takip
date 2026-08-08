import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';

interface CollapsibleGroupHeaderProps {
  label: string;
  count: number;
  /** Biçimlenmiş tutar metni (para birimi çağıranda belirlenir). */
  amount: string;
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * Rapor listelerinde katlanır grup başlığı (chevron + ad + (adet) + tutar).
 * gelir-gider (kaynak grubu) ve alis-satis (kategori grubu) ekranlarında yapı
 * birebir aynıydı ama görsel dil ayrışmıştı; zeminli varyant standart alındı.
 */
export function CollapsibleGroupHeader({
  label,
  count,
  amount,
  collapsed,
  onToggle,
}: CollapsibleGroupHeaderProps) {
  return (
    <TouchableOpacity style={styles.header} onPress={onToggle} activeOpacity={0.7}>
      <View style={styles.left}>
        {collapsed
          ? <ChevronDown size={16} color={colors.textSecondary} />
          : <ChevronUp size={16} color={colors.textSecondary} />}
        <Text variant="body" style={styles.label}>{label}</Text>
        <Text variant="caption" color="secondary">({count})</Text>
      </View>
      <Text variant="body" style={styles.amount}>{amount}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  label: {
    fontWeight: '600',
    color: colors.textSecondary,
  },
  amount: {
    fontWeight: '700',
    color: colors.text,
  },
});

export default CollapsibleGroupHeader;
