import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, Scale } from 'lucide-react-native';
import { Button, Card, Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';

interface SelectStepProps {
  cariName: string;
  balance: number;
  balanceLabel: string;
  currency?: string;
  onPickFile: () => void;
  picking: boolean;
}

export function SelectStep({ cariName, balance, balanceLabel, currency, onPickFile, picking }: SelectStepProps) {
  const { t } = useTranslation('mutabakat');
  return (
    <View style={styles.container}>
      <Card style={styles.cariCard}>
        <Text variant="h3">{cariName}</Text>
        <Text variant="bodySmall" color="secondary">
          {t('select.balanceLabel')}: {formatCurrency(Math.abs(balance), currency)} ({balanceLabel})
        </Text>
      </Card>

      <View style={styles.iconWrap}>
        <Scale size={48} color={colors.primary} />
      </View>
      <Text variant="h3" center>
        {t('select.heading')}
      </Text>
      <Text variant="bodySmall" color="secondary" center style={styles.hint}>
        {t('select.hint')}
      </Text>
      <Text variant="caption" color="muted" center style={styles.hint}>
        {t('select.currencyNote', { currency: currency ?? 'TRY' })}
      </Text>

      <Button
        onPress={onPickFile}
        loading={picking}
        icon={<FileSpreadsheet size={18} color={colors.white} />}
        style={styles.pickButton}
      >
        {t('select.pickFile')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cariCard: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  iconWrap: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  hint: {
    paddingHorizontal: spacing.lg,
  },
  pickButton: {
    marginTop: spacing.lg,
  },
});
