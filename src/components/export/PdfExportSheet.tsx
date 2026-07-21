import { upperTr } from '@/lib/turkishTextUtils';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { View, StyleSheet, Modal, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePickerRN, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SlidersHorizontal, Calendar } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { getDateRange, PeriodType, formatDateForDB, ensureValidDate, getLocale } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import { formatCurrency } from '@/lib/currency';
import { usePdfExport } from '@/hooks/usePdfExport';
import { useAuthContext } from '@/contexts/AuthContext';
import { EntityType } from '@/lib/excelExport';
import { Currency } from '@/types/database';

interface PdfExportSheetProps {
  visible: boolean;
  onDismiss: () => void;
  entityType: EntityType;
  entityId: string;
  entityName: string;
  entityCurrency?: Currency | string;
  currentBalance: number;
  cariType?: 'musteri' | 'tedarikci';
  currentIsletmeId?: string;
  typeMismatch?: boolean;
  phone?: string;
}

type PeriodOption = {
  key: string;
  label: string;
  period: PeriodType;
  offset?: number;
};

export function PdfExportSheet({
  visible,
  onDismiss,
  entityType,
  entityId,
  entityName,
  entityCurrency,
  currentBalance,
  cariType,
  currentIsletmeId,
  typeMismatch,
  phone,
}: PdfExportSheetProps) {
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const { formatDateShort } = useDateFormat();
  const { isletme } = useAuthContext();
  const [selectedPeriod, setSelectedPeriod] = useState<string>('thisMonth');
  const [showFilter, setShowFilter] = useState(true);
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [activePicker, setActivePicker] = useState<'start' | 'end'>('start');

  const { isExporting, isLoadingPreview, previewData, loadPreview, exportPdf } = usePdfExport({
    entityType, entityId, entityName, entityCurrency, currentBalance,
    cariType, currentIsletmeId, typeMismatch, phone,
  });

  const periodOptions: PeriodOption[] = useMemo(() => [
    { key: 'thisMonth', label: upperTr(t('date.thisMonth')), period: 'monthly', offset: 0 },
    { key: 'lastMonth', label: upperTr(t('date.lastMonth')), period: 'monthly', offset: -1 },
    { key: 'last3Months', label: upperTr(t('date.last3Months')), period: 'monthly', offset: -2 },
    { key: 'thisYear', label: upperTr(t('date.thisYear')), period: 'yearly', offset: 0 },
    { key: 'allTime', label: upperTr(t('period.allTime')), period: 'yearly', offset: -100 },
    { key: 'custom', label: upperTr(t('period.custom')), period: 'custom' },
  ], [t]);

  const dateRange = useMemo(() => {
    if (selectedPeriod === 'custom') {
      return {
        startDate: formatDateForDB(customStartDate),
        endDate: formatDateForDB(customEndDate),
      };
    }
    const option = periodOptions.find(p => p.key === selectedPeriod);
    if (!option) return { startDate: '', endDate: '' };

    if (option.key === 'allTime') {
      return { startDate: '2020-01-01', endDate: formatDateForDB(new Date()) };
    }
    if (option.key === 'last3Months') {
      const now = new Date();
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return {
        startDate: formatDateForDB(threeMonthsAgo),
        endDate: formatDateForDB(now),
      };
    }

    const range = getDateRange(option.period, option.offset || 0);
    return { startDate: range.startDate, endDate: range.endDate };
  }, [selectedPeriod, customStartDate, customEndDate, periodOptions]);

  const dateRangeLabel = useMemo(() => {
    if (!dateRange.startDate || !dateRange.endDate) return '';
    return `${formatDateShort(dateRange.startDate)} - ${formatDateShort(dateRange.endDate)}`;
  }, [dateRange, formatDateShort]);

  useEffect(() => {
    if (visible && dateRange.startDate && dateRange.endDate) {
      loadPreview(dateRange.startDate, dateRange.endDate);
    }
  }, [visible, dateRange.startDate, dateRange.endDate]);

  const handleSend = useCallback(() => {
    if (dateRange.startDate && dateRange.endDate) {
      exportPdf(dateRange.startDate, dateRange.endDate);
    }
  }, [dateRange, exportPdf]);

  const handleDateChange = useCallback((_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartPicker(false);
      setShowEndPicker(false);
      if (date) {
        const safe = ensureValidDate(date);
        if (activePicker === 'start') {
          setCustomStartDate(safe);
        } else {
          setCustomEndDate(safe);
        }
        setSelectedPeriod('custom');
      }
    } else {
      if (date) setTempDate(ensureValidDate(date));
    }
  }, [activePicker]);

  const confirmDate = useCallback(() => {
    const safe = ensureValidDate(tempDate);
    if (activePicker === 'start') {
      setCustomStartDate(safe);
    } else {
      setCustomEndDate(safe);
    }
    setSelectedPeriod('custom');
    setShowStartPicker(false);
    setShowEndPicker(false);
  }, [tempDate, activePicker]);

  const openStartPicker = useCallback(() => {
    setActivePicker('start');
    setTempDate(customStartDate);
    setShowStartPicker(true);
  }, [customStartDate]);

  const openEndPicker = useCallback(() => {
    setActivePicker('end');
    setTempDate(customEndDate);
    setShowEndPicker(true);
  }, [customEndDate]);

  const now = new Date();
  const pdfLocale = getLocale();
  const dateStr = now.toLocaleDateString(pdfLocale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString(pdfLocale, { hour: '2-digit', minute: '2-digit' });

  // Açılış/kapanış bakiyesi kolon eşlemesi generatePdfHtml ile aynı olmalı:
  // cari + personel borç-bakiyeli (pozitif = bize borçlu → Borç kolonu),
  // hesap alacak-bakiyeli. Sabit "negatif→Borç" eşlemesi cari/personelde
  // bakiyeyi yanlış kolonda gösteriyordu.
  const isDebitNormal = entityType === 'cari' || entityType === 'personel';
  const balanceDebit = (v: number) =>
    (isDebitNormal ? v > 0 : v < 0) ? formatCurrency(Math.abs(v), entityCurrency) : '';
  const balanceCredit = (v: number) =>
    (isDebitNormal ? v < 0 : v >= 0) ? formatCurrency(Math.abs(v), entityCurrency) : '';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onDismiss} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>{t('export.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('export.report')}</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setShowFilter(!showFilter)} style={styles.filterButton}>
              <SlidersHorizontal size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSend}
              style={[styles.headerButton, isExporting && styles.headerButtonDisabled]}
              disabled={isExporting || isLoadingPreview}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.headerButtonText}>{t('export.send')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter Panel */}
        {showFilter && (
          <View style={styles.filterPanel}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodRow}>
              {periodOptions.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.periodChip, selectedPeriod === option.key && styles.periodChipActive]}
                  onPress={() => {
                    if (option.key === 'custom') {
                      setSelectedPeriod('custom');
                    } else {
                      setSelectedPeriod(option.key);
                    }
                  }}
                >
                  <Text style={[styles.periodChipText, selectedPeriod === option.key && styles.periodChipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {selectedPeriod === 'custom' && (
              <View style={styles.customDateRow}>
                <TouchableOpacity style={styles.dateButton} onPress={openStartPicker}>
                  <Calendar size={14} color={colors.primary} />
                  {/* ensureValidDate + Date geç: geçersizde .toISOString() RangeError atar ve 1970 gösterir */}
                  <Text style={styles.dateButtonText}>{formatDateShort(ensureValidDate(customStartDate))}</Text>
                </TouchableOpacity>
                <Text style={styles.dateSeparator}>—</Text>
                <TouchableOpacity style={styles.dateButton} onPress={openEndPicker}>
                  <Calendar size={14} color={colors.primary} />
                  <Text style={styles.dateButtonText}>{formatDateShort(ensureValidDate(customEndDate))}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Preview */}
        <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewContent}>
          {isLoadingPreview ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>{t('export.preparing')}</Text>
            </View>
          ) : previewData ? (
            <View style={styles.previewCard}>
              {/* Preview Header */}
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle}>
                  {entityType === 'hesap' ? t('export.excel.accountStatement')
                    : entityType === 'cari' ? t('export.excel.clientStatement')
                    : t('export.excel.staffStatement')}
                </Text>
                {isletme?.name ? (
                  <Text style={styles.previewIsletme}>{isletme.name}</Text>
                ) : null}
                <View style={styles.previewHeaderDivider} />
                <View style={styles.previewMetaGrid}>
                  <View style={styles.previewMetaRow}>
                    <Text style={styles.previewMetaLabel}>
                      {entityType === 'hesap' ? t('export.excel.account')
                        : entityType === 'cari' ? t('export.excel.client')
                        : t('export.excel.staff')}:
                    </Text>
                    <Text style={styles.previewMetaValue}>{entityName}</Text>
                  </View>
                  {phone ? (
                    <View style={styles.previewMetaRow}>
                      <Text style={styles.previewMetaLabel}>{t('export.pdf.phone')}:</Text>
                      <Text style={styles.previewMetaValue}>{phone}</Text>
                    </View>
                  ) : null}
                  <View style={styles.previewMetaRow}>
                    <Text style={styles.previewMetaLabel}>{t('export.pdf.date')}:</Text>
                    <Text style={styles.previewMetaValue}>{dateStr}</Text>
                  </View>
                  <View style={styles.previewMetaRow}>
                    <Text style={styles.previewMetaLabel}>{t('export.pdf.time')}:</Text>
                    <Text style={styles.previewMetaValue}>{timeStr}</Text>
                  </View>
                  {dateRangeLabel ? (
                    <View style={styles.previewMetaRow}>
                      <Text style={styles.previewMetaLabel}>{t('export.excel.period')}:</Text>
                      <Text style={styles.previewMetaValue}>{dateRangeLabel}</Text>
                    </View>
                  ) : null}
                  <View style={styles.previewMetaRow}>
                    <Text style={styles.previewMetaLabel}>{t('export.pdf.balance')}:</Text>
                    <Text style={[styles.previewMetaValue, styles.previewBalanceValue]}>
                      {formatCurrency(previewData.closingBalance, entityCurrency)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.th, styles.thDate]}>{t('export.excel.date')}</Text>
                <Text style={[styles.th, styles.thType]}>{t('export.excel.transactionType')}</Text>
                <Text style={[styles.th, styles.thDesc]}>{t('export.excel.description')}</Text>
                <Text style={[styles.th, styles.thAmount]}>{t('export.excel.debit')}</Text>
                <Text style={[styles.th, styles.thAmount]}>{t('export.excel.credit')}</Text>
              </View>

              {/* Opening Balance */}
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryText, { flex: 1 }]}>{t('export.excel.openingBalance')}</Text>
                <Text style={[styles.summaryAmount, styles.thAmount]}>
                  {balanceDebit(previewData.openingBalance)}
                </Text>
                <Text style={[styles.summaryAmount, styles.thAmount]}>
                  {balanceCredit(previewData.openingBalance)}
                </Text>
              </View>

              {/* Transaction Rows */}
              {previewData.rows.map((row, i) => (
                <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                  <Text style={[styles.td, styles.thDate]}>{row.date}</Text>
                  <Text style={[styles.td, styles.thType]}>{row.type}</Text>
                  <Text style={[styles.td, styles.thDesc]}>{row.description}</Text>
                  <Text style={[styles.td, styles.thAmount, styles.tdAmount]}>
                    {row.debit ? formatCurrency(row.debit, entityCurrency) : ''}
                  </Text>
                  <Text style={[styles.td, styles.thAmount, styles.tdAmount]}>
                    {row.credit ? formatCurrency(row.credit, entityCurrency) : ''}
                  </Text>
                </View>
              ))}

              {/* Period Total */}
              <View style={styles.totalRow}>
                <Text style={[styles.totalText, { flex: 1 }]}>{t('export.excel.periodTotal')}</Text>
                <Text style={[styles.totalAmount, styles.thAmount]}>
                  {previewData.totalDebit > 0 ? formatCurrency(previewData.totalDebit, entityCurrency) : ''}
                </Text>
                <Text style={[styles.totalAmount, styles.thAmount]}>
                  {previewData.totalCredit > 0 ? formatCurrency(previewData.totalCredit, entityCurrency) : ''}
                </Text>
              </View>

              {/* Closing Balance */}
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryText, { flex: 1 }]}>{t('export.excel.closingBalance')}</Text>
                <Text style={[styles.summaryAmount, styles.thAmount]}>
                  {balanceDebit(previewData.closingBalance)}
                </Text>
                <Text style={[styles.summaryAmount, styles.thAmount]}>
                  {balanceCredit(previewData.closingBalance)}
                </Text>
              </View>

              {/* Footer */}
              <View style={styles.previewFooter}>
                <Text style={styles.footerText}>{t('export.pdf.totalRecords')}: {previewData.rows.length}</Text>
                <Text style={styles.footerText}>
                  {t('export.excel.debit')}: {formatCurrency(previewData.totalDebit, entityCurrency)} | {t('export.excel.credit')}: {formatCurrency(previewData.totalCredit, entityCurrency)}
                </Text>
              </View>
              <View style={styles.previewFooterBalance}>
                <Text style={styles.footerBalanceText}>
                  {t('export.pdf.balance')}: {formatCurrency(previewData.closingBalance, entityCurrency)}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>{t('export.noDataToExport')}</Text>
            </View>
          )}
        </ScrollView>

        {/* iOS Date Picker Modal */}
        {Platform.OS === 'ios' && (showStartPicker || showEndPicker) && (
          <Modal transparent animationType="fade">
            <Pressable style={styles.datePickerOverlay} onPress={() => { setShowStartPicker(false); setShowEndPicker(false); }}>
              <Pressable style={styles.datePickerContainer} onPress={(e) => e.stopPropagation()}>
                <View style={styles.datePickerHeader}>
                  <TouchableOpacity onPress={() => { setShowStartPicker(false); setShowEndPicker(false); }}>
                    <Text style={styles.datePickerCancel}>{t('buttons.cancel')}</Text>
                  </TouchableOpacity>
                  <Text style={styles.datePickerTitle}>
                    {activePicker === 'start' ? t('date.startDate') : t('date.endDate')}
                  </Text>
                  <TouchableOpacity onPress={confirmDate}>
                    <Text style={styles.datePickerDone}>{t('buttons.done')}</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePickerRN value={tempDate} mode="date" display="spinner" onChange={handleDateChange} locale="tr" themeVariant="light" />
              </Pressable>
            </Pressable>
          </Modal>
        )}
        {Platform.OS === 'android' && showStartPicker && (
          <DateTimePickerRN value={customStartDate} mode="date" onChange={handleDateChange} />
        )}
        {Platform.OS === 'android' && showEndPicker && (
          <DateTimePickerRN value={customEndDate} mode="date" onChange={handleDateChange} />
        )}
      </View>
    </Modal>
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
  headerButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  headerButtonDisabled: { opacity: 0.5 },
  headerButtonText: { fontSize: 16, fontWeight: '600', color: colors.primary },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterButton: { padding: spacing.xs },

  filterPanel: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  periodRow: { paddingHorizontal: spacing.md, gap: spacing.xs },
  periodChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodChipText: { fontSize: 13, color: colors.textSecondary },
  periodChipTextActive: { color: 'white', fontWeight: '600' },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  dateButtonText: { fontSize: 14, fontWeight: '500', color: colors.text },
  dateSeparator: { fontSize: 14, color: colors.textSecondary },

  previewScroll: { flex: 1 },
  previewContent: { padding: spacing.md },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  loadingText: { marginTop: spacing.md, fontSize: 14, color: colors.textSecondary },

  previewCard: {
    backgroundColor: 'white',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewHeader: {
    padding: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: '#4472C4',
  },
  previewTitle: { fontSize: 15, fontWeight: '700', color: '#1F4E79', marginBottom: 2 },
  previewIsletme: { fontSize: 12, color: '#666', marginBottom: 8 },
  previewHeaderDivider: { height: 1, backgroundColor: '#D0D0D0', marginBottom: 8 },
  previewMetaGrid: { gap: 3 },
  previewMetaRow: { flexDirection: 'row', gap: 6 },
  previewMetaLabel: { fontSize: 11, fontWeight: '600', color: '#666', minWidth: 60 },
  previewMetaValue: { fontSize: 11, color: '#333', flex: 1 },
  previewBalanceValue: { fontWeight: '700', color: '#1F4E79' },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#4472C4',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  th: { fontSize: 8, fontWeight: '700', color: 'white', textAlign: 'center' },
  thDate: { width: 58 },
  thType: { width: 70 },
  thDesc: { flex: 1, textAlign: 'left', paddingLeft: 4 },
  thAmount: { width: 65, textAlign: 'right' },

  summaryRow: {
    flexDirection: 'row',
    backgroundColor: '#E7E6E6',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  summaryText: { fontSize: 9, fontWeight: '700', color: '#1F4E79' },
  summaryAmount: { fontSize: 9, fontWeight: '700', color: '#1F4E79', textAlign: 'right' },

  totalRow: {
    flexDirection: 'row',
    backgroundColor: '#5B9BD5',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  totalText: { fontSize: 9, fontWeight: '700', color: 'white' },
  totalAmount: { fontSize: 9, fontWeight: '700', color: 'white', textAlign: 'right' },

  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
    alignItems: 'flex-start',
  },
  tableRowAlt: { backgroundColor: '#F8F9FA' },
  td: { fontSize: 9, color: '#333' },
  tdAmount: { textAlign: 'right', fontVariant: ['tabular-nums'] },

  previewFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#D0D0D0',
  },
  footerText: { fontSize: 10, color: '#666' },
  previewFooterBalance: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  footerBalanceText: { fontSize: 10, fontWeight: '600', color: '#1F4E79' },

  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  datePickerContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 20,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D0D0D0',
  },
  datePickerTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  datePickerCancel: { fontSize: 16, color: colors.textSecondary },
  datePickerDone: { fontSize: 16, fontWeight: '600', color: colors.primary },
});
