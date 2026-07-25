import { Text, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { formatCount } from '@/lib/currency';
import { styles } from '../styles';

export function ResultItem({ label, value, isDryRun = false }: { label: string; value: number; isDryRun?: boolean }) {
  return (
    <Card style={styles.resultCard}>
      <Text variant="h3" style={[styles.resultValue, isDryRun && { color: colors.info }]}>
        {formatCount(value)}
      </Text>
      <Text variant="caption" color="secondary">{label}</Text>
    </Card>
  );
}
