/**
 * Export Sheet Component
 * Tarih aralığı seçimi ve Excel export için bottom sheet
 */

import { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePickerRN from '@react-native-community/datetimepicker';
import { Calendar, FileSpreadsheet, Check } from 'lucide-react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatDateShort, formatDateForDB, getDateRange, PeriodType } from '@/lib/date';
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
}: ExportSheetProps) {
  const { t } = useTranslation();
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
  });

  // Dönem seçenekleri
  const periodOptions: PeriodOption[] = useMemo(() => [
    { key: 'today', label: t('common:date.today'), period: 'daily', offset: 0 },
    { key: 'thisWeek', label: t('common:date.thisWeek'), period: 'weekly', offset: 0 },
    { key: 'thisMonth', label: t('common:date.thisMonth'), period: 'monthly', offset: 0 },
    { key: 'lastMonth', label: t('common:date.lastMonth'), period: 'monthly', offset: -1 },
    { key: 'last3Months', label: 'Son 3 Ay', period: 'monthly', offset: -2 },
    { key: 'thisYear', label: t('common:date.thisYear'), period: 'yearly', offset: 0 },
    { key: 'allTime', label: t('common:period.allTime'), period: 'yearly', offset: -100 },
    { key: 'custom', label: t('common:period.custom'), period: 'custom' },
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

  const handleStartDateChange = (event: any, selectedDate?: Date) => {
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

  const handleEndDateChange = (event: any, selectedDate?: Date) => {
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

    return (
      <Modal visible={isVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => type === 'start' ? setShowStartPicker(false) : setShowEndPicker(false)}
              >
                <Text style={styles.modalCancel}>{t('common:buttons.cancel')}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {type === 'start' ? t('common:date.startDate') : t('common:date.endDate')}
              </Text>
              <TouchableOpacity onPress={() => confirmIOSDate(type)}>
                <Text style={styles.modalConfirm}>{t('common:buttons.done')}</Text>
              </TouchableOpacity>
            </View>
            <DateTimePickerRN
              value={tempDate}
              mode="date"
              display="spinner"
              onChange={type === 'start' ? handleStartDateChange : handleEndDateChange}
              maximumDate={new Date()}
              locale="tr-TR"
            />
          </View>
        </View>
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
          <Text style={styles.title}>Excel Olarak Paylaş</Text>
        </View>

        {/* Entity bilgisi */}
        <View style={styles.entityInfo}>
          <Text style={styles.entityLabel}>
            {entityType === 'hesap' ? 'Hesap' : entityType === 'cari' ? 'Cari' : 'Personel'}
          </Text>
          <Text style={styles.entityName}>{entityName}</Text>
        </View>

        {/* Dönem Seçimi - Grid Layout */}
        <Text style={styles.sectionTitle}>Dönem Seçin</Text>
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
                setShowStartPicker(true);
              }}
              activeOpacity={0.7}
            >
              <Calendar size={18} color={colors.primary} />
              <View style={styles.dateButtonContent}>
                <Text style={styles.dateButtonLabel}>{t('common:date.startDate')}</Text>
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
                setShowEndPicker(true);
              }}
              activeOpacity={0.7}
            >
              <Calendar size={18} color={colors.primary} />
              <View style={styles.dateButtonContent}>
                <Text style={styles.dateButtonLabel}>{t('common:date.endDate')}</Text>
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
                <Text style={styles.dateButtonLabel}>{t('common:date.startDate')}</Text>
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
                <Text style={styles.dateButtonLabel}>{t('common:date.endDate')}</Text>
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
                <Text style={styles.exportButtonText}>Hazırlanıyor...</Text>
              </View>
            ) : (
              <View style={styles.buttonContent}>
                <FileSpreadsheet size={20} color={colors.white} />
                <Text style={styles.exportButtonText}>Excel Olarak Paylaş</Text>
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
          value={customStartDate}
          mode="date"
          display="default"
          onChange={handleStartDateChange}
          maximumDate={new Date()}
        />
      )}
      {Platform.OS === 'android' && showEndPicker && (
        <DateTimePickerRN
          value={customEndDate}
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
});
