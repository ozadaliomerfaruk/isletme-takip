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
  ArrowLeftRight,
  RotateCcw,
  CalendarPlus,
  CalendarMinus,
  Wallet,
  Banknote,
} from 'lucide-react-native';
import { IslemWithRelations } from '@/types/database';
import { formatCurrency, toNumber, getCrossCurrencyDisplay } from '@/lib/currency';
import { isLeaveType } from '@/constants/islemTypes';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useAuthContext } from '@/contexts/AuthContext';

interface EntityTransactionListProps {
  transactions: IslemWithRelations[];
  maxItems?: number;
  onViewAll?: () => void;
  onTransactionPress?: (transaction: IslemWithRelations) => void;
}

// İşlem tipine göre ikon ve renk
const getTransactionStyle = (type: string, t: (key: string) => string) => {
  const iconMap: Record<string, { Icon: typeof CreditCard; color: string }> = {
    gelir: { Icon: Wallet, color: colors.success },
    gider: { Icon: Banknote, color: colors.error },
    transfer: { Icon: ArrowLeftRight, color: colors.textMuted },
    cari_alis: { Icon: ShoppingCart, color: colors.error },
    cari_satis: { Icon: TrendingUp, color: colors.success },
    cari_odeme: { Icon: ArrowUpRight, color: colors.info },
    cari_tahsilat: { Icon: ArrowDownLeft, color: colors.warning },
    cari_alis_iade: { Icon: RotateCcw, color: colors.success },
    cari_satis_iade: { Icon: RotateCcw, color: colors.error },
    personel_gider: { Icon: TrendingDown, color: colors.error },
    personel_odeme: { Icon: CreditCard, color: colors.info },
    personel_tahsilat: { Icon: ArrowDownLeft, color: colors.warning },
    personel_satis: { Icon: TrendingUp, color: colors.success },
    nakit_avans_taksit: { Icon: Banknote, color: colors.error },
    personel_izin_hakki: { Icon: CalendarPlus, color: colors.success },
    personel_izin_kullanimi: { Icon: CalendarMinus, color: colors.warning },
  };
  const match = iconMap[type];
  const label = t(`transactions:types.${type}`);
  if (match) {
    return { ...match, label };
  }
  return { Icon: CreditCard, color: colors.textMuted, label: label || type };
};

export function EntityTransactionList({
  transactions,
  maxItems = 10,
  onViewAll,
  onTransactionPress: onTransactionPressExternal,
}: EntityTransactionListProps) {
  const { t } = useTranslation(['reports', 'transactions', 'staff']);
  const { formatDateNative } = useDateFormat();
  const router = useRouter();
  const { user } = useAuthContext();

  const displayTransactions = maxItems > 0 ? transactions.slice(0, maxItems) : transactions;
  const hasMore = transactions.length > maxItems;

  const handleTransactionPress = (transaction: IslemWithRelations) => {
    if (onTransactionPressExternal) {
      onTransactionPressExternal(transaction);
    } else {
      router.push({
        pathname: '/islemler/duzenle/[id]',
        params: { id: transaction.id },
      });
    }
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
          const { Icon, color, label } = getTransactionStyle(transaction.type, t);
          const isLast = index === displayTransactions.length - 1;
          const dateObj = new Date(transaction.date);
          // İşlemi kendi (hedef taraf) para biriminde göster — yerleşik desen
          const xc = getCrossCurrencyDisplay(transaction);

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
                    {isLeaveType(transaction.type)
                      ? `${toNumber(transaction.amount)} ${t('staff:leave.days')}`
                      : formatCurrency(xc.mainAmount, xc.mainCurrency)}
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
                  {transaction.created_by && transaction.created_by !== user?.id && transaction.creator && (
                    <Text variant="caption" style={styles.creatorText} numberOfLines={1}>
                      {transaction.creator.display_name || transaction.creator.email}
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
  creatorText: {
    color: colors.primary,
    fontWeight: '500',
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
