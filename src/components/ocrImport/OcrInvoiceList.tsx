import { View, FlatList, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Camera, ImagePlus } from 'lucide-react-native';
import { Text, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { MultiInvoiceEntry } from '@/types/ocrImport';
import { OcrInvoiceListItem } from './OcrInvoiceListItem';
import { formatCurrency } from '@/lib/currency';

interface OcrInvoiceListProps {
  entries: MultiInvoiceEntry[];
  onSelectInvoice: (index: number) => void;
  onRemoveEntry: (index: number) => void;
  onSaveAll: () => void;
  onAddMore: () => void;
  isSaving: boolean;
}

export function OcrInvoiceList({
  entries,
  onSelectInvoice,
  onRemoveEntry,
  onSaveAll,
  onAddMore,
  isSaving,
}: OcrInvoiceListProps) {
  const { t } = useTranslation('ocrImport');

  const unsavedCount = entries.filter(e => !e.isSaved).length;
  const allSaved = unsavedCount === 0;

  const grandTotal = entries.reduce((sum, e) => {
    const lineSum = e.invoice.items.reduce((s, item) => s + item.totalPrice, 0);
    return sum + (e.invoice.grandTotal || lineSum);
  }, 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="h3">
          {t('batch.invoiceCount', { count: entries.length })}
        </Text>
        {!allSaved && (
          <Text variant="caption" color="warning">
            {t('batch.unsavedCount', { count: unsavedCount })}
          </Text>
        )}
        {allSaved && (
          <Text variant="caption" color="success">
            {t('batch.allSaved')}
          </Text>
        )}
      </View>

      {/* Invoice list */}
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <OcrInvoiceListItem
            entry={item}
            index={index}
            onPress={onSelectInvoice}
            onRemove={onRemoveEntry}
          />
        )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerTop}>
          <View style={styles.footerInfo}>
            <Text variant="caption" color="secondary">
              {t('batch.invoiceCount', { count: entries.length })}
            </Text>
            <Text variant="h3" color="success">
              {formatCurrency(grandTotal)}
            </Text>
          </View>
          <Button
            variant="outline"
            size="sm"
            icon={<ImagePlus size={16} color={colors.primary} />}
            iconPosition="left"
            onPress={onAddMore}
          >
            {t('batch.addMore')}
          </Button>
        </View>

        {!allSaved && (
          <>
            <Text variant="caption" color="muted" style={styles.saveAllDesc}>
              {t('batch.saveAllDesc')}
            </Text>
            <Button
              variant="primary"
              size="lg"
              loading={isSaving}
              onPress={onSaveAll}
            >
              {t('batch.saveAll')}
            </Button>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  separator: {
    height: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  footerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerInfo: {
    gap: 2,
  },
  saveAllDesc: {
    textAlign: 'center',
  },
});
