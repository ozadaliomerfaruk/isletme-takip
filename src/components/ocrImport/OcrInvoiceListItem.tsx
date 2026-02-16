import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertTriangle, FileText, Trash2, CreditCard, Receipt, Truck, ClipboardList, ArrowDownCircle, ArrowUpCircle, StickyNote, HelpCircle } from 'lucide-react-native';
import { Text, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { MultiInvoiceEntry, DOCUMENT_TYPE_DEFAULTS, OcrDocumentType } from '@/types/ocrImport';
import { formatCurrency } from '@/lib/currency';

const DOC_TYPE_ICONS: Record<string, typeof FileText> = {
  FileText,
  CreditCard,
  Receipt,
  Truck,
  ClipboardList,
  ArrowDownCircle,
  ArrowUpCircle,
  StickyNote,
  HelpCircle,
};

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
  // Item totalPrice'lar KDV haric — subtotal (KDV haric) ile karsilastir
  const compareTotal = invoice.subtotal
    ?? (invoice.grandTotal && invoice.vatTotal
      ? invoice.grandTotal - invoice.vatTotal
      : invoice.grandTotal);
  const hasMismatch = compareTotal
    ? Math.abs(compareTotal - lineSum) / Math.max(compareTotal, 1) > 0.01
    : false;

  // Document type badge
  const docType = invoice.documentType as OcrDocumentType;
  const docConfig = DOCUMENT_TYPE_DEFAULTS[docType] || DOCUMENT_TYPE_DEFAULTS.unknown;
  const DocIcon = DOC_TYPE_ICONS[docConfig.icon] || FileText;

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => onPress(index)}>
      <Card style={[styles.card, entry.isSaved && styles.cardSaved]}>
        <View style={styles.row}>
          <View style={[styles.iconContainer, { backgroundColor: docConfig.color + '18' }]}>
            <DocIcon size={22} color={entry.isSaved ? colors.success : docConfig.color} />
          </View>
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text variant="body" style={styles.supplierName} numberOfLines={1}>
                {invoice.supplierName || t('review.noCari')}
              </Text>
              <View style={[styles.docTypeBadge, { backgroundColor: docConfig.color + '18' }]}>
                <Text variant="caption" style={{ color: docConfig.color, fontSize: 10, fontWeight: '600' }}>
                  {t(`docType.${docType}`)}
                </Text>
              </View>
            </View>
            <Text variant="caption" color="secondary">
              {invoice.items.length > 0
                ? t('batch.itemCount', { count: invoice.items.length })
                : t(`saveMode.${entry.saveMode}`)}
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  supplierName: {
    fontWeight: '500',
    flexShrink: 1,
  },
  docTypeBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
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
