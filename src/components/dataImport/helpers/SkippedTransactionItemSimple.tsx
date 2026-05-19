import { View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import i18n from '@/i18n';
import { useTranslation } from 'react-i18next';
import type { SkippedTransaction } from '@/hooks/useDataImport';
import { styles } from '../styles';

export function SkippedTransactionItemSimple({ item }: { item: SkippedTransaction }) {
  const { t } = useTranslation('settings');
  const { transaction, reason, rowNumber } = item;

  const [datePart, timePart] = transaction.date.split('T');
  const time = timePart ? timePart.slice(0, 5) : '';
  const formattedDateTime = time ? `${datePart} ${time}` : datePart;

  return (
    <View style={styles.skippedItem}>
      <View style={styles.skippedItemHeader}>
        <View style={styles.rowNumberBadge}>
          <Text variant="caption" style={{ color: colors.warning, fontWeight: '600' }}>
            {t('dataImport.labels.row')} {rowNumber}
          </Text>
        </View>
        <Text variant="caption" color="muted">{formattedDateTime}</Text>
      </View>

      <Text variant="body" numberOfLines={1} style={{ marginBottom: 4 }}>
        {transaction.description || '-'}
      </Text>
      <Text variant="caption" color="secondary">
        {transaction.type || '-'} • {transaction.account || '-'}
        {transaction.personel ? ` • ${transaction.personel}` : ''}
        {transaction.tedarikci ? ` • ${transaction.tedarikci}` : ''}
        {transaction.musteri ? ` • ${transaction.musteri}` : ''}
        {transaction.karsiHesap ? ` → ${transaction.karsiHesap}` : ''}
      </Text>

      <Text
        variant="body"
        style={{
          color: transaction.isExpense ? colors.expense : colors.income,
          fontWeight: '600',
          marginTop: 4,
        }}
      >
        {transaction.isExpense ? '-' : '+'}{transaction.amount.toLocaleString(i18n.language === 'tr' ? 'tr-TR' : 'en-US')}
      </Text>

      <View style={styles.skipReasonContainer}>
        <AlertTriangle size={14} color={colors.warning} />
        <Text variant="caption" style={{ color: colors.warning, flex: 1, marginLeft: 6 }}>
          {reason}
        </Text>
      </View>
    </View>
  );
}
