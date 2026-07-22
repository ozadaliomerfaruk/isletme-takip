import { TouchableOpacity, ActivityIndicator } from 'react-native';
import { Share as ShareIcon } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { HIT_SLOP } from '@/constants/spacing';

interface ReportExportButtonProps {
  onPress: () => void;
  isExporting: boolean;
  accessibilityLabel?: string;
}

/**
 * Rapor ekranlarinda header'daki "paylas/disa aktar" (Excel) butonu.
 * gelir-gider ve alis-satis ekranlarinda birebir ayniydi.
 * Not: karsilastirma ekrani PDF disa aktarir ve kasitli olarak farkli
 * gorunume (yesil FileSpreadsheet + daire) sahiptir; bu bileseni kullanmaz.
 */
export function ReportExportButton({ onPress, isExporting, accessibilityLabel }: ReportExportButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isExporting}
      style={{ padding: 6 }}
      hitSlop={HIT_SLOP.md}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {isExporting ? (
        <ActivityIndicator size="small" color={colors.text} />
      ) : (
        <ShareIcon size={22} color={colors.text} />
      )}
    </TouchableOpacity>
  );
}

export default ReportExportButton;
