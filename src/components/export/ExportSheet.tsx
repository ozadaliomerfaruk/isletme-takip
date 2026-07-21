import { upperTr } from '@/lib/turkishTextUtils';
/**
 * Export Sheet Component
 * Tarih aralığı seçimi ve Excel export için bottom sheet
 */

import { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Modal, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import DateTimePickerRN, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Calendar, FileSpreadsheet, Check } from 'lucide-react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatDateForDB, getDateRange, PeriodType, ensureValidDate } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useExcelExport } from '@/hooks/useExcelExport';
import { EntityType } from '@/lib/excelExport';
import { Currency } from '@/types/database';

interface ExportSheetProps {
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
}

type PeriodOption = {
  key: string;
  label: string;
  period: PeriodType;
  offset?: number;
  icon?: string;
};

export function ExportSheet({
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
}: ExportSheetProps) {
  const { t } = useTranslation('common');
  const { formatDateShort } = useDateFormat();
  const [selectedPeriod, setSelectedPeriod] = useState<string>('thisMonth');
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  const { isExporting, exportExcel } = useExcelExport({
    entityType,
    entityId,
    entityName,
    entityCurrency,
    currentBalance,
    cariType,
    currentIsletmeId,
    typeMismatch,
  });

  // Dönem seçenekleri
  const periodOptions: PeriodOption[] = useMemo(() => [
    { key: 'today', label: upperTr(t('date.today')), period: 'daily', offset: 0 },
    { key: 'thisWeek', label: upperTr(t('date.thisWeek')), period: 'weekly', offset: 0 },
    { key: 'thisMonth', label: upperTr(t('date.thisMonth')), period: 'monthly', offset: 0 },
    { key: 'lastMonth', label: upperTr(t('date.lastMonth')), period: 'monthly', offset: -1 },
    { key: 'last3Months', label: upperTr(t('date.last3Months')), period: 'monthly', offset: -2 },
    { key: 'thisYear', label: upperTr(t('date.thisYear')), period: 'yearly', offset: 0 },
    { key: 'allTime', label: upperTr(t('period.allTime')), period: 'yearly', offset: -100 },
    { key: 'custom', label: upperTr(t('period.custom')), period: 'custom' },
  ], [t]);

  // Seçilen döneme göre tarih aralığını hesapla
  const dateRange = useMemo(() => {
    if (selectedPeriod === 'custom') {
      return {
        startDate: formatDateForDB(customStartDate),
        endDate: formatDateForDB(customEndDate),
      };
    }

    if (selectedPeriod === 'last3Months') {
      // Son 3 ay için özel hesaplama
      const now = new Date();
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const endOfThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        startDate: formatDateForDB(threeMonthsAgo),
        endDate: formatDateForDB(endOfThisMonth),
      };
    }

    if (selectedPeriod === 'allTime') {
      // Tüm zamanlar için çok geniş bir aralık
      return {
        startDate: '2000-01-01',
        endDate: formatDateForDB(new Date()),
      };
    }

    const option = periodOptions.find((p) => p.key === selectedPeriod);
    if (!option) {
      return getDateRange('monthly', 0);
    }

    return getDateRange(option.period, option.offset || 0);
  }, [selectedPeriod, customStartDate, customEndDate, periodOptions]);

  const handleExport = async () => {
    await exportExcel(dateRange.startDate, dateRange.endDate);
  };

  // Period seçimi - useCallback ile optimize edildi
  const handlePeriodSelect = useCallback((key: string) => {
    setSelectedPeriod(key);
    if (key === 'custom') {
      setTempDate(customStartDate);
    }
  }, [customStartDate]);

  const handleStartDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartPicker(false);
      if (event.type === 'set' && selectedDate) {
        setCustomStartDate(selectedDate);
      }
    } else {
      if (selectedDate) {
        setTempDate(selectedDate);
      }
    }
  };

  const handleEndDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndPicker(false);
      if (event.type === 'set' && selectedDate) {
        setCustomEndDate(selectedDate);
      }
    } else {
      if (selectedDate) {
        setTempDate(selectedDate);
      }
    }
  };

  const confirmIOSDate = (type: 'start' | 'end') => {
    if (type === 'start') {
      setCustomStartDate(tempDate);
      setShowStartPicker(false);
    } else {
      setCustomEndDate(tempDate);
      setShowEndPicker(false);
    }
  };

  const renderIOSDateModal = (type: 'start' | 'end') => {
    const isVisible = type === 'start' ? showStartPicker : showEndPicker;
    const currentValue = type === 'start' ? customStartDate : customEndDate;

    return (
      <Modal visible={isVisible} transparent animationType="slide">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => type === 'start' ? setShowStartPicker(false) : setShowEndPicker(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {type === 'start' ? t('date.startDate') : t('date.endDate')}
              </Text>
              <TouchableOpacity
                onPress={() => type === 'start' ? setShowStartPicker(false) : setShowEndPicker(false)}
              >
                <Text style={styles.modalConfirm}>{t('buttons.done')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.datePickerWrapper}>
              <DateTimePickerRN
                value={ensureValidDate(currentValue)}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(event, date) => {
                  if (date) {
                    if (type === 'start') {
                      setCustomStartDate(date);
                      if (date > customEndDate) {
                        setCustomEndDate(date);
                      }
                    } else {
                      setCustomEndDate(date);
                    }
                  }
                }}
                minimumDate={type === 'end' ? customStartDate : undefined}
                maximumDate={new Date()}
                locale={i18n.language === 'tr' ? 'tr-TR' : 'en-US'}
                themeVariant="light"
                accentColor={colors.primary}
                style={{ height: 350 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      snapPoints={[0.6]}
    >
      <View style={styles.container}>
        {/* Başlık */}
        <View style={styles.header}>
          <FileSpreadsheet size={24} color={colors.success} />
          <Text style={styles.title}>{t('export.shareAsExcel')}</Text>
        </View>

        {/* Entity bilgisi */}
        <View style={styles.entityInfo}>
          <Text style={styles.entityLabel}>
            {entityType === 'hesap' ? t('labels.account') : entityType === 'cari' ? t('labels.client') : t('labels.staff')}
          </Text>
          <Text style={styles.entityName}>{entityName}</Text>
        </View>

        {/* Dönem Seçimi - Grid Layout */}
        <Text style={styles.sectionTitle}>{t('period.selectPeriod')}</Text>
        <View style={styles.periodGrid}>
          {periodOptions.map((option) => {
            const isSelected = selectedPeriod === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.periodCard,
                  isSelected && styles.periodCardActive,
                ]}
                onPress={() => handlePeriodSelect(option.key)}
                activeOpacity={0.7}
              >
                {isSelected && (
                  <View style={styles.checkIcon}>
                    <Check size={12} color={colors.white} strokeWidth={3} />
                  </View>
                )}
                <Text
                  style={[
                    styles.periodCardText,
                    isSelected && styles.periodCardTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Özel Tarih Seçimi */}
        {selectedPeriod === 'custom' && (
          <View style={styles.customDateContainer}>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => {
                setTempDate(customStartDate);
                setShowEndPicker(false); // Önce diğer picker'ı kapat
                setShowStartPicker(true);
              }}
              activeOpacity={0.7}
            >
              <Calendar size={18} color={colors.primary} />
              <View style={styles.dateButtonContent}>
                <Text style={styles.dateButtonLabel}>{t('date.startDate')}</Text>
                <Text style={styles.dateButtonValue}>{formatDateShort(customStartDate)}</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.dateSeparator}>
              <View style={styles.dateSeparatorLine} />
              <Text style={styles.dateSeparatorText}>→</Text>
              <View style={styles.dateSeparatorLine} />
            </View>

            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => {
                setTempDate(customEndDate);
                setShowStartPicker(false); // Önce diğer picker'ı kapat
                setShowEndPicker(true);
              }}
              activeOpacity={0.7}
            >
              <Calendar size={18} color={colors.primary} />
              <View style={styles.dateButtonContent}>
                <Text style={styles.dateButtonLabel}>{t('date.endDate')}</Text>
                <Text style={styles.dateButtonValue}>{formatDateShort(customEndDate)}</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Seçilen Tarih Aralığı */}
        {selectedPeriod !== 'custom' && (
          <View style={styles.customDateContainer}>
            <View style={styles.dateDisplayBox}>
              <Calendar size={18} color={colors.primary} />
              <View style={styles.dateButtonContent}>
                <Text style={styles.dateButtonLabel}>{t('date.startDate')}</Text>
                <Text style={styles.dateButtonValue}>{formatDateShort(dateRange.startDate)}</Text>
              </View>
            </View>

            <View style={styles.dateSeparator}>
              <View style={styles.dateSeparatorLine} />
              <Text style={styles.dateSeparatorText}>→</Text>
              <View style={styles.dateSeparatorLine} />
            </View>

            <View style={styles.dateDisplayBox}>
              <Calendar size={18} color={colors.primary} />
              <View style={styles.dateButtonContent}>
                <Text style={styles.dateButtonLabel}>{t('date.endDate')}</Text>
                <Text style={styles.dateButtonValue}>{formatDateShort(dateRange.endDate)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Export Butonu */}
        <View style={styles.footer}>
          <Button
            onPress={handleExport}
            disabled={isExporting}
            style={styles.exportButton}
          >
            {isExporting ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.white} />
                <Text style={styles.exportButtonText}>{t('export.preparing')}</Text>
              </View>
            ) : (
              <View style={styles.buttonContent}>
                <FileSpreadsheet size={20} color={colors.white} />
                <Text style={styles.exportButtonText}>{t('export.shareAsExcel')}</Text>
              </View>
            )}
          </Button>
        </View>
      </View>

      {/* iOS Date Pickers */}
      {Platform.OS === 'ios' && renderIOSDateModal('start')}
      {Platform.OS === 'ios' && renderIOSDateModal('end')}

      {/* Android Date Pickers */}
      {Platform.OS === 'android' && showStartPicker && (
        <DateTimePickerRN
          value={ensureValidDate(customStartDate)}
          mode="date"
          display="default"
          onChange={handleStartDateChange}
          maximumDate={new Date()}
        />
      )}
      {Platform.OS === 'android' && showEndPicker && (
        <DateTimePickerRN
          value={ensureValidDate(customEndDate)}
          mode="date"
          display="default"
          onChange={handleEndDateChange}
          maximumDate={new Date()}
        />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  entityInfo: {
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  entityLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  entityName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  // Period Grid Styles
  periodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  periodCard: {
    width: '23%',
    minWidth: 70,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  periodCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodCardText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'center',
  },
  periodCardTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  checkIcon: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Custom Date Styles
  customDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  dateDisplayBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  dateButtonContent: {
    flex: 1,
  },
  dateButtonLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  dateButtonValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 30,
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dateSeparatorText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginHorizontal: 2,
  },
  // Footer
  footer: {
    marginTop: 'auto',
    paddingVertical: spacing.md,
  },
  exportButton: {
    backgroundColor: colors.primary,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  exportButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  // iOS Date Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingBottom: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  modalCancel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  modalConfirm: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  datePickerWrapper: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
});
