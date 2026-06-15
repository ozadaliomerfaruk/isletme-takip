import { TouchableOpacity, ActivityIndicator } from 'react-native';
import { Share2 } from 'lucide-react-native';
import { colors } from '@/constants/colors';

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
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {isExporting ? (
        <ActivityIndicator size="small" color={colors.text} />
      ) : (
        <Share2 size={22} color={colors.text} />
      )}
    </TouchableOpacity>
  );
}

export default ReportExportButton;
