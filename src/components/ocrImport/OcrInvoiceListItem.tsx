import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertTriangle, FileText, Trash2 } from 'lucide-react-native';
import { Text, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { MultiInvoiceEntry } from '@/types/ocrImport';
import { formatCurrency } from '@/lib/currency';

interface OcrInvoiceListItemProps {
  entry: MultiInvoiceEntry;
  index: number;
  onPress: (index: number) => void;
  onRemove: (index: number) => void;
}

export function OcrInvoiceListItem({ entry, index, onPress, onRemove }: OcrInvoiceListItemProps) {
  const { t } = useTranslation('ocrImport');
  const { invoice } = entry;

  const lineSum = invoice.items.reduce((sum, item) => sum + item.totalPrice, 0);
  const hasMismatch = invoice.grandTotal
    ? Math.abs(invoice.grandTotal - lineSum) / Math.max(invoice.grandTotal, 1) > 0.01
    : false;

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => onPress(index)}>
      <Card style={[styles.card, entry.isSaved && styles.cardSaved]}>
        <View style={styles.row}>
          <View style={styles.iconContainer}>
            <FileText size={22} color={entry.isSaved ? colors.success : colors.primary} />
          </View>
          <View style={styles.info}>
            <Text variant="body" style={styles.supplierName} numberOfLines={1}>
              {invoice.supplierName || t('review.noCari')}
            </Text>
            <Text variant="caption" color="secondary">
              {t('batch.itemCount', { count: invoice.items.length })}
              {invoice.invoiceDate ? ` · ${invoice.invoiceDate}` : ''}
            </Text>
          </View>
          <View style={styles.rightSection}>
            <Text variant="h3" style={styles.amount}>
              {formatCurrency(invoice.grandTotal || lineSum)}
            </Text>
            <View style={styles.badges}>
              {hasMismatch && !entry.isSaved && (
                <View style={styles.warningBadge}>
                  <AlertTriangle size={12} color={colors.warning} />
                  <Text variant="caption" style={{ color: colors.warning }}>{t('batch.totalMismatchShort')}</Text>
                </View>
              )}
              {entry.isSaved && (
                <View style={styles.savedBadge}>
                  <CheckCircle size={12} color={colors.success} />
                  <Text variant="caption" style={{ color: colors.success }}>{t('batch.savedBadge')}</Text>
                </View>
              )}
            </View>
          </View>
          {!entry.isSaved && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={(e) => {
                e.stopPropagation();
                onRemove(index);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Trash2 size={18} color={colors.error} />
            </TouchableOpacity>
          )}
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
  },
  cardSaved: {
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  supplierName: {
    fontWeight: '500',
  },
  rightSection: {
    alignItems: 'flex-end',
    gap: 4,
  },
  amount: {
    fontWeight: '600',
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.warningLight,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.successLight,
  },
  deleteButton: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
});
