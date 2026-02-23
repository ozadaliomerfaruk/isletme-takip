import { useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import type { PeriodType } from '@/hooks/useIslemler';

const PERIOD_OPTIONS: PeriodType[] = ['yearly', 'monthly', 'weekly', 'daily', 'custom'];

const PERIOD_I18N_KEYS: Record<PeriodType, string> = {
  yearly: 'reports:period.yearly',
  monthly: 'reports:period.monthly',
  weekly: 'reports:period.weekly',
  daily: 'reports:period.daily',
  custom: 'reports:period.custom',
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

  const handlePeriodSelect = useCallback(
    (p: PeriodType) => {
      if (p !== period) onPeriodChange(p);
    },
    [period, onPeriodChange]
  );

  return (
    <View style={styles.wrapper}>
      {/* Row: Segmented Control + Date Navigator */}
      <View style={styles.row}>
        {/* Segmented Control */}
        <View style={styles.segmentedContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.segmentedContent}
            bounces={false}
          >
            {PERIOD_OPTIONS.map((p) => {
              const isActive = p === period;
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.segment, isActive && styles.segmentActive]}
                  onPress={() => handlePeriodSelect(p)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.segmentText, isActive && styles.segmentTextActive]}
                    numberOfLines={1}
                  >
                    {t(PERIOD_I18N_KEYS[p])}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Date Navigator */}
        {!isCustom && (
          <View style={styles.navigator}>
            <TouchableOpacity
              onPress={onPrevious}
              style={styles.navButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ChevronLeft size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onLabelPress}
              style={styles.labelButton}
              activeOpacity={0.7}
            >
              <Text style={styles.labelText} numberOfLines={1}>
                {periodLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onNext}
              style={styles.navButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ChevronRight size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Custom Date Range (separate row when custom) */}
      {isCustom && (
        <View style={styles.customRow}>
          <TouchableOpacity style={styles.dateButton} onPress={onStartDatePress}>
            <Text style={styles.dateText} numberOfLines={1}>
              {customStartLabel}
            </Text>
          </TouchableOpacity>
          <Text style={styles.dateSeparator}>—</Text>
          <TouchableOpacity style={styles.dateButton} onPress={onEndDatePress}>
            <Text style={styles.dateText} numberOfLines={1}>
              {customEndLabel}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // ── Segmented Control ──
  segmentedContainer: {
    flexShrink: 1,
    backgroundColor: colors.surfaceLighter,
    borderRadius: borderRadius.full,
    padding: 3,
  },
  segmentedContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segment: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    fontWeight: '700',
    color: colors.text,
  },
  // ── Date Navigator ──
  navigator: {
    flexDirection: 'row',
    alignItems: 'center',
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  labelText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'center',
  },
  // ── Custom Date Row ──
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dateButton: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
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
