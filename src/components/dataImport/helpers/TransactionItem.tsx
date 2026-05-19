import { View } from 'react-native';
import { Tag } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import i18n from '@/i18n';
import type { ParsedTransaction } from '@/lib/excelImport';
import { styles } from '../styles';

export function TransactionItem({ transaction }: { transaction: ParsedTransaction }) {
  const [datePart, timePart] = transaction.date.split('T');
  const time = timePart ? timePart.slice(0, 5) : '';
  const formattedDateTime = time ? `${datePart} ${time}` : datePart;

  const relatedEntity = transaction.personel
    || transaction.tedarikci
    || transaction.musteri
    || transaction.karsiHesap
    || '';

  return (
    <View style={styles.listItem}>
      <View style={styles.listItemLeft}>
        <Text variant="caption" color="muted">{formattedDateTime}</Text>
        <Text variant="body" numberOfLines={1}>{transaction.description || '-'}</Text>
        <Text variant="caption" color="secondary">
          {transaction.type || '-'} • {transaction.account || '-'}
          {relatedEntity ? ` → ${relatedEntity}` : ''}
        </Text>
        {transaction.category && (
          <View style={styles.categoryBadge}>
            <Tag size={10} color={colors.primary} />
            <Text variant="caption" color="primary" style={{ marginLeft: 4 }}>
              {transaction.category}
            </Text>
          </View>
        )}
      </View>
      <Text
        variant="body"
        style={{
          color: transaction.isExpense ? colors.expense : colors.income,
          fontWeight: '600',
        }}
      >
        {transaction.isExpense ? '-' : '+'}{transaction.amount.toLocaleString(i18n.language === 'tr' ? 'tr-TR' : 'en-US')}
      </Text>
    </View>
  );
}
