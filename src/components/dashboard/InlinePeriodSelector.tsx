import { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, ActionSheet, type ActionSheetOption } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import type { PeriodType } from '@/hooks/useIslemler';

const PERIOD_SHORT_LABELS: Record<PeriodType, string> = {
  yearly: 'period.yearly',
  monthly: 'period.monthly',
  weekly: 'period.weekly',
  daily: 'period.daily',
  custom: 'period.custom',
};

interface InlinePeriodSelectorProps {
  period: PeriodType;
  periodLabel: string;
  onPeriodChange: (period: PeriodType) => void;
  onPrevious: () => void;
  onNext: () => void;
  onLabelPress: () => void;
  isCustom: boolean;
  customStartLabel?: string;
  customEndLabel?: string;
  onStartDatePress?: () => void;
  onEndDatePress?: () => void;
}

export function InlinePeriodSelector({
  period,
  periodLabel,
  onPeriodChange,
  onPrevious,
  onNext,
  onLabelPress,
  isCustom,
  customStartLabel,
  customEndLabel,
  onStartDatePress,
  onEndDatePress,
}: InlinePeriodSelectorProps) {
  const { t } = useTranslation(['reports', 'common']);
  const [sheetVisible, setSheetVisible] = useState(false);

  const periodOptions: ActionSheetOption[] = [
    { label: t('reports:period.yearly'), onPress: () => onPeriodChange('yearly') },
    { label: t('reports:period.monthly'), onPress: () => onPeriodChange('monthly') },
    { label: t('reports:period.weekly'), onPress: () => onPeriodChange('weekly') },
    { label: t('reports:period.daily'), onPress: () => onPeriodChange('daily') },
    { label: t('reports:period.custom'), onPress: () => onPeriodChange('custom') },
  ];

  const handleOpenSheet = useCallback(() => setSheetVisible(true), []);
  const handleCloseSheet = useCallback(() => setSheetVisible(false), []);

  return (
    <View style={styles.container}>
      {/* Period Type Pill */}
      <TouchableOpacity style={styles.pill} onPress={handleOpenSheet} activeOpacity={0.7}>
        <Text style={styles.pillText}>
          {t(`reports:${PERIOD_SHORT_LABELS[period]}`)}
        </Text>
        <ChevronDown size={14} color={colors.primary} />
      </TouchableOpacity>

      {/* Navigator or Custom Dates */}
      {!isCustom ? (
        <View style={styles.navigator}>
          <TouchableOpacity onPress={onPrevious} style={styles.navButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <ChevronLeft size={18} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onLabelPress} style={styles.labelButton} activeOpacity={0.7}>
            <Text style={styles.labelText} numberOfLines={1}>
              {periodLabel}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onNext} style={styles.navButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <ChevronRight size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.customDates}>
          <TouchableOpacity style={styles.dateButton} onPress={onStartDatePress}>
            <Text style={styles.dateText} numberOfLines={1}>{customStartLabel}</Text>
          </TouchableOpacity>
          <Text style={styles.dateSeparator}>-</Text>
          <TouchableOpacity style={styles.dateButton} onPress={onEndDatePress}>
            <Text style={styles.dateText} numberOfLines={1}>{customEndLabel}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Period Type ActionSheet */}
      <ActionSheet
        visible={sheetVisible}
        onClose={handleCloseSheet}
        title={t('reports:period.selectPeriod')}
        options={periodOptions}
        cancelLabel={t('common:buttons.cancel')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    minWidth: 72,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  navigator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  navButton: {
    padding: 4,
  },
  labelButton: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    maxWidth: 180,
  },
  labelText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'center',
  },
  customDates: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  dateButton: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  dateSeparator: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
