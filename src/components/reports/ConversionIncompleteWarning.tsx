import { View, StyleSheet } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

/**
 * "Bazı döviz bakiyeleri çevrilemedi" uyarısı — TEK yerden.
 *
 * Kur bulunamadığında rapor toplamları ya kalemi hariç tutuyor (createConversionSum)
 * ya ham TRY'yi koruyor (createRpcTotalConverter). İkisi de sayıyı eksik/yanlış yapar;
 * fark, artık bunun SÖYLENMESİ. Bu bileşen olmadan bayrak üretiliyor ama hiçbir yerde
 * okunmuyordu — Raporlar > Genel ve Net Varlık Trendi dışındaki hiçbir rapor ekranı
 * kullanıcıya "bu sayı eksik" demiyordu.
 *
 * `visible` false ise HİÇ render etmez (boş satır bırakmaz).
 */
export function ConversionIncompleteWarning({ visible }: { visible?: boolean }) {
  const { t } = useTranslation('reports');
  if (!visible) return null;

  return (
    <View style={styles.row}>
      <AlertTriangle size={14} color={colors.error} />
      <Text variant="caption" color="error" style={styles.text}>
        {t('reports:summary.conversionIncomplete')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  text: {
    flex: 1,
    lineHeight: 16,
  },
});
