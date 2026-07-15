import { View, StyleSheet, Modal, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateTime } from '@/lib/date';
import type { EntityListExportOptions } from '@/lib/excelExport';

interface ListPdfPreviewSheetProps {
  visible: boolean;
  options: EntityListExportOptions | null;
  isSharing?: boolean;
  onDismiss: () => void;
  onShare: () => void;
}

/**
 * Varlık listesi PDF'inin uygulama-içi önizlemesi (WebView yok — RN bileşenleriyle
 * çizilir). exportEntityListToPdf ile AYNI options'ı gösterir; üstteki "Paylaş"
 * gerçek PDF üretim + paylaşımını tetikler.
 */
export function ListPdfPreviewSheet({ visible, options, isSharing, onDismiss, onShare }: ListPdfPreviewSheetProps) {
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();

  const cellText = (cell: EntityListExportOptions['rows'][number][number]): string => {
    if (cell && typeof cell === 'object') {
      return cell.amount !== null && cell.amount !== undefined
        ? formatCurrency(cell.amount, cell.currency)
        : '';
    }
    return (cell as string) ?? '';
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onDismiss} style={styles.headerButton} disabled={isSharing}>
            <Text style={styles.headerButtonText}>{t('export.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('export.preview')}</Text>
          <TouchableOpacity
            onPress={onShare}
            style={[styles.headerButton, isSharing && styles.headerButtonDisabled]}
            disabled={isSharing}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.headerButtonText}>{t('export.share')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {options ? (
            <View style={styles.card}>
              {/* Başlık + meta */}
              <View style={styles.previewHeader}>
                <Text style={styles.title}>{options.title}</Text>
                <View style={styles.metaGrid}>
                  <MetaRow label={options.labels.business} value={options.isletmeName} bold />
                  <MetaRow label={options.labels.createdAt} value={formatDateTime(new Date().toISOString())} />
                  <MetaRow label={options.labels.recordCount} value={String(options.rows.length)} />
                  {options.filterText ? <MetaRow label={options.labels.filter} value={options.filterText} /> : null}
                </View>
                <Text style={styles.note}>{options.labels.snapshotNote}</Text>
              </View>

              {/* Tablo */}
              <View style={styles.tableHeader}>
                {options.columns.map((col, i) => (
                  <Text
                    key={i}
                    style={[styles.th, { flex: col.width }, col.align === 'right' && styles.thRight]}
                    numberOfLines={2}
                  >
                    {col.header}
                  </Text>
                ))}
              </View>

              {options.rows.map((row, ri) => (
                <View key={ri} style={[styles.tableRow, ri % 2 === 1 && styles.tableRowAlt]}>
                  {options.columns.map((col, ci) => (
                    <Text
                      key={ci}
                      style={[styles.td, { flex: col.width }, col.align === 'right' && styles.tdRight]}
                      numberOfLines={2}
                    >
                      {cellText(row[ci])}
                    </Text>
                  ))}
                </View>
              ))}

              {/* Özet */}
              {options.summary && options.summary.length > 0 && (
                <View style={styles.summaryBlock}>
                  <Text style={styles.summaryTitle}>{options.labels.summary}</Text>
                  {options.summary.map((line, i) => (
                    <View key={i} style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{line.label}</Text>
                      <Text style={styles.summaryAmount}>{formatCurrency(line.amount, line.currency)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>{options.labels.generatedByApp}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>{t('export.noDataToExport')}</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function MetaRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}:</Text>
      <Text style={[styles.metaValue, bold && styles.metaValueBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, minWidth: 60 },
  headerButtonDisabled: { opacity: 0.5 },
  headerButtonText: { fontSize: 16, fontWeight: '600', color: colors.primary },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  loadingText: { fontSize: 14, color: colors.textSecondary },

  card: {
    backgroundColor: 'white',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewHeader: { padding: spacing.md, borderBottomWidth: 2, borderBottomColor: '#4472C4' },
  title: { fontSize: 15, fontWeight: '700', color: '#1F4E79', marginBottom: 8 },
  metaGrid: { gap: 3 },
  metaRow: { flexDirection: 'row', gap: 6 },
  metaLabel: { fontSize: 11, fontWeight: '600', color: '#666', minWidth: 70 },
  metaValue: { fontSize: 11, color: '#333', flex: 1 },
  metaValueBold: { fontWeight: '700', color: '#1F4E79' },
  note: { fontSize: 10, fontStyle: 'italic', color: '#888', marginTop: 8 },

  tableHeader: { flexDirection: 'row', backgroundColor: '#4472C4', paddingVertical: 6, paddingHorizontal: 4 },
  th: { fontSize: 9, fontWeight: '700', color: 'white', paddingHorizontal: 3 },
  thRight: { textAlign: 'right' },

  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
    alignItems: 'flex-start',
  },
  tableRowAlt: { backgroundColor: '#F8F9FA' },
  td: { fontSize: 9, color: '#333', paddingHorizontal: 3 },
  tdRight: { textAlign: 'right', fontVariant: ['tabular-nums'] },

  summaryBlock: { padding: spacing.md, backgroundColor: '#E7E6E6' },
  summaryTitle: { fontSize: 10, fontWeight: '700', color: '#1F4E79', marginBottom: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  summaryLabel: { fontSize: 10, fontWeight: '600', color: '#1F4E79' },
  summaryAmount: { fontSize: 10, fontWeight: '700', color: '#1F4E79', fontVariant: ['tabular-nums'] },

  footer: { padding: spacing.md, borderTopWidth: 1, borderTopColor: '#D0D0D0' },
  footerText: { fontSize: 9, fontStyle: 'italic', color: '#888' },
});
