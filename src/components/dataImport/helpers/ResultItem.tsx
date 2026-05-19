import { Text, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import i18n from '@/i18n';
import { styles } from '../styles';

export function ResultItem({ label, value, isDryRun = false }: { label: string; value: number; isDryRun?: boolean }) {
  return (
    <Card style={styles.resultCard}>
      <Text variant="h3" style={[styles.resultValue, isDryRun && { color: colors.info }]}>
        {value.toLocaleString(i18n.language === 'tr' ? 'tr-TR' : 'en-US')}
      </Text>
      <Text variant="caption" color="secondary">{label}</Text>
    </Card>
  );
}
