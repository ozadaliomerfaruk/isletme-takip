import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import {
  ShoppingCart,
  CreditCard,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
} from 'lucide-react-native';
import { IslemWithRelations } from '@/types/database';
import { formatCurrency, toNumber } from '@/lib/currency';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

interface EntityTransactionListProps {
  transactions: IslemWithRelations[];
  maxItems?: number;
  onViewAll?: () => void;
}

// İşlem tipine göre ikon ve renk
const getTransactionStyle = (type: string) => {
  switch (type) {
    case 'cari_alis':
      return { Icon: ShoppingCart, color: colors.error, label: 'Alış' };
    case 'cari_satis':
      return { Icon: TrendingUp, color: colors.success, label: 'Satış' };
    case 'cari_odeme':
      return { Icon: ArrowUpRight, color: colors.info, label: 'Ödeme' };
    case 'cari_tahsilat':
      return { Icon: ArrowDownLeft, color: colors.warning, label: 'Tahsilat' };
    case 'cari_alis_iade':
      return { Icon: RotateCcw, color: colors.success, label: 'Alış İade' };
    case 'cari_satis_iade':
      return { Icon: RotateCcw, color: colors.error, label: 'Satış İade' };
    case 'personel_gider':
      return { Icon: TrendingDown, color: colors.error, label: 'Gider' };
    case 'personel_odeme':
      return { Icon: CreditCard, color: colors.info, label: 'Ödeme' };
    case 'personel_tahsilat':
      return { Icon: ArrowDownLeft, color: colors.warning, label: 'Tahsilat' };
    default:
      return { Icon: CreditCard, color: colors.textMuted, label: type };
  }
};

export function EntityTransactionList({
  transactions,
  maxItems = 10,
  onViewAll,
}: EntityTransactionListProps) {
  const { t } = useTranslation(['reports', 'transactions']);
  const { formatDateNative } = useDateFormat();
  const router = useRouter();

  const displayTransactions = maxItems > 0 ? transactions.slice(0, maxItems) : transactions;
  const hasMore = transactions.length > maxItems;

  const handleTransactionPress = (transaction: IslemWithRelations) => {
    router.push({
      pathname: '/islemler/duzenle/[id]',
      params: { id: transaction.id },
    });
  };

  if (transactions.length === 0) {
    return (
      <Card style={styles.emptyCard}>
        <Text variant="body" color="secondary" style={styles.emptyText}>
          {t('reports:empty.noTransactions')}
        </Text>
      </Card>
    );
  }

  return (
    <View>
      <Card style={styles.card}>
        {displayTransactions.map((transaction, index) => {
          const { Icon, color, label } = getTransactionStyle(transaction.type);
          const isLast = index === displayTransactions.length - 1;
          const dateObj = new Date(transaction.date);

          return (
            <TouchableOpacity
              key={transaction.id}
              style={[styles.transactionItem, !isLast && styles.transactionBorder]}
              onPress={() => handleTransactionPress(transaction)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
                <Icon size={18} color={color} />
              </View>
              <View style={styles.transactionContent}>
                <View style={styles.transactionHeader}>
                  <Text variant="body" style={styles.transactionLabel}>
                    {t(`transactions:types.${transaction.type}`, { defaultValue: label })}
                  </Text>
                  <Text
                    variant="body"
                    style={[styles.transactionAmount, { color }]}
                  >
                    {formatCurrency(toNumber(transaction.amount))}
                  </Text>
                </View>
                <View style={styles.transactionFooter}>
                  <Text variant="caption" color="secondary">
                    {formatDateNative(dateObj)}
                  </Text>
                  {transaction.description && (
                    <Text
                      variant="caption"
                      color="secondary"
                      numberOfLines={1}
                      style={styles.transactionDescription}
                    >
                      {transaction.description}
                    </Text>
                  )}
                </View>
                {transaction.kategori && (
                  <View style={styles.categoryBadge}>
                    <Text variant="caption" color="secondary">
                      {transaction.kategori.name}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </Card>

      {hasMore && onViewAll && (
        <TouchableOpacity style={styles.viewAllButton} onPress={onViewAll}>
          <Text variant="body" color="primary">
            {t('reports:entityTransactions.viewAll', { count: transactions.length })}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  transactionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  transactionContent: {
    flex: 1,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionLabel: {
    fontWeight: '500',
  },
  transactionAmount: {
    fontWeight: '600',
  },
  transactionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: spacing.sm,
  },
  transactionDescription: {
    flex: 1,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: spacing.xs,
  },
  emptyCard: {
    padding: spacing.xl,
  },
  emptyText: {
    textAlign: 'center',
  },
  viewAllButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
});

export default EntityTransactionList;
