import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Card } from '@/components/ui';
import { ReportProductItemsModal } from './ReportProductItemsModal';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { parseDateFromDB } from '@/lib/date';
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
  Package,
} from 'lucide-react-native';
import type { IslemWithRelations } from '@/types/database';
import { formatCurrency, toNumber, getCrossCurrencyDisplay } from '@/lib/currency';
import { upperTr } from '@/lib/turkishTextUtils';
import { isLeaveType } from '@/constants/islemTypes';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useUrunKalemlerByIslemIds } from '@/hooks/useUrunHareketler';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useTransactionCreatorLabelResolver } from '@/hooks/useTransactionCreatorLabels';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  isPersonelIslemListRow,
  toPersonelTransactionCreatorSource,
  type PersonelIslemListRow,
} from '@/lib/personelTransactionProjection';
import {
  isCariIslemListRow,
  type CariIslemListRow,
} from '@/lib/cariTransactionProjection';
import { usePermissions } from '@/hooks/usePermissions';
import { getTransactionProductMutationDecision } from '@/lib/transactionProductMutationGate';

export type EntityReportTransaction =
  | IslemWithRelations
  | CariIslemListRow
  | PersonelIslemListRow;

function getEntityTransactionCurrencyDisplay(
  transaction: EntityReportTransaction,
) {
  if (
    !isPersonelIslemListRow(transaction)
    && !isCariIslemListRow(transaction)
  ) {
    return getCrossCurrencyDisplay(transaction);
  }

  // Paylaşımlı entity projection'ındaki `hesap` bilinçli olarak yalnız ad taşır.
  // Para birimi motoruna sadece RPC'nin doğruladığı işlem-düzeyi alanları verilir.
  return getCrossCurrencyDisplay({
    type: transaction.type,
    amount: transaction.amount,
    source_currency: transaction.source_currency,
    target_currency: transaction.target_currency,
    exchange_rate: transaction.exchange_rate,
  });
}

interface EntityTransactionListProps<
  TTransaction extends EntityReportTransaction,
> {
  transactions: TTransaction[];
  maxItems?: number;
  onViewAll?: () => void;
  onTransactionPress?: (transaction: TTransaction) => void;
  canEditTransaction?: (transaction: TTransaction) => boolean;
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

export function EntityTransactionList<
  TTransaction extends EntityReportTransaction = IslemWithRelations,
>({
  transactions,
  maxItems = 10,
  onViewAll,
  onTransactionPress: onTransactionPressExternal,
  canEditTransaction,
}: EntityTransactionListProps<TTransaction>) {
  const { t } = useTranslation(['reports', 'transactions', 'staff']);
  const { formatDateNative } = useDateFormat();
  const router = useRouter();
  const { isletme } = useAuthContext();
  const {
    canAccessModule,
    canUpdate,
    isOwner,
  } = usePermissions();
  const resolveCreatorLabel = useTransactionCreatorLabelResolver();

  const displayTransactions = maxItems > 0 ? transactions.slice(0, maxItems) : transactions;
  const hasMore = transactions.length > maxItems;

  // Ürünlü işlem göstergesi (kutu ikonu): satırda ürün kalemi varsa Package rozeti.
  // Tek batch sorgu (islem_id → adet); early-return'den ÖNCE çağrılmalı (hooks kuralı).
  const {
    getUrunItems,
    getProductItemCount,
    isProductItemsResolved,
  } = useUrunKalemlerByIslemIds(
    displayTransactions.map((transaction) => transaction.id),
    true,
  );
  const productItemsSettled = isProductItemsResolved;
  const hasUrun = (islemId: string) =>
    productItemsSettled && getProductItemCount(islemId) > 0;
  const getUrunCount = (islemId: string) =>
    productItemsSettled ? getProductItemCount(islemId) : 0;

  // Ürün detay modalı (kutu ikonu standart davranışı — cari detay sayfasıyla AYNI).
  const [productModalIslemId, setProductModalIslemId] = useState<string | null>(null);
  // Ürün detay modalının para birimi: satır tutarının hesaplandığı AYNI değer.
  const productModalTransaction = productModalIslemId
    ? transactions.find((tr) => tr.id === productModalIslemId) ?? null
    : null;
  const productModalCurrency = productModalTransaction
    ? getEntityTransactionCurrencyDisplay(productModalTransaction).mainCurrency
    : undefined;
  const getEditDecision = (transaction: TTransaction) =>
    getTransactionProductMutationDecision({
      type: transaction.type,
      productItemsResolved: isProductItemsResolved,
      productItemCount: getProductItemCount(transaction.id),
      isOwner,
      canAccessModule,
      canMutateTransaction:
        canEditTransaction?.(transaction) ?? false,
      canMutateProduct:
        canUpdate('urunler', transaction.created_by ?? null),
    });
  const canEditProductTransaction =
    !!productModalTransaction
    && getEditDecision(productModalTransaction as TTransaction).allowed;

  const openEdit = (transaction: TTransaction) => {
    if (onTransactionPressExternal) {
      onTransactionPressExternal(transaction);
    } else if (canEditTransaction?.(transaction) === true) {
      router.push({
        pathname: '/islemler/duzenle/[id]',
        params: { id: transaction.id },
      });
    }
  };

  // Ürünlü işlem → önce alttan ürün detay modalı; ürünsüz → doğrudan düzenleme.
  const handleTransactionPress = (transaction: TTransaction) => {
    if (!productItemsSettled) return;
    if (hasUrun(transaction.id)) {
      setProductModalIslemId(transaction.id);
    } else {
      openEdit(transaction);
    }
  };

  // Modaldaki "Düzenle": modalı kapat, işlemi düzenlemeye aç (satır tıklamasıyla aynı akış).
  const handleProductEdit = (islemId: string) => {
    const tx = transactions.find((tr) => tr.id === islemId);
    setProductModalIslemId(null);
    if (tx) openEdit(tx);
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
          // 1970-guard: ham new Date() Hermes'te boşluklu/bozuk string'de Invalid olur
          const dateObj = parseDateFromDB(transaction.date);
          // İşlemi kendi (hedef taraf) para biriminde göster — yerleşik desen
          const xc = getEntityTransactionCurrencyDisplay(transaction);
          const creatorText = resolveCreatorLabel(
            isPersonelIslemListRow(transaction)
              ? toPersonelTransactionCreatorSource(
                  transaction,
                  isletme?.id,
                )
              : transaction,
          );

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
                  <View style={styles.transactionLabelRow}>
                    <Text variant="body" style={styles.transactionLabel} numberOfLines={1}>
                      {t(`transactions:types.${transaction.type}`, { defaultValue: label })}
                    </Text>
                    {hasUrun(transaction.id) && (
                      <View style={styles.urunBadge}>
                        <Package size={15} color={colors.primary} />
                        {getUrunCount(transaction.id) > 0 && (
                          <Text style={styles.urunCountText}>{getUrunCount(transaction.id)}</Text>
                        )}
                      </View>
                    )}
                  </View>
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
                  {creatorText ? (
                    <Text variant="caption" style={styles.creatorText} numberOfLines={1}>
                      {creatorText}
                    </Text>
                  ) : null}
                </View>
                {transaction.kategori && (
                  <View style={styles.categoryBadge}>
                    <Text variant="caption" color="secondary">
                      {upperTr(transaction.kategori.name)}
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

      {/* Ürünlü işleme tıklanınca alttan ürün detay modalı (paylaşılan, tek standart) */}
      <ReportProductItemsModal
        islemId={productModalIslemId}
        items={
          productModalIslemId
            ? getUrunItems(productModalIslemId)
            : []
        }
        isLoading={!productItemsSettled}
        // Satırdaki tutarla AYNI para birimi (kutu ikonu ≠ satır çelişkisi)
        currency={productModalCurrency}
        onDismiss={() => setProductModalIslemId(null)}
        onEdit={canEditProductTransaction ? handleProductEdit : undefined}
      />
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
  transactionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  transactionLabel: {
    fontWeight: '500',
    flexShrink: 1,
  },
  urunBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  urunCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
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
