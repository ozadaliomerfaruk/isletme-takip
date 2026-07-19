import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Calendar, Bell, X, ArrowRight, CalendarClock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { HIT_SLOP, spacing, fontSize, fontWeight, borderRadius } from '@/constants/spacing';
import { isToday } from '@/lib/date';
import { styles } from '../styles';

export interface HeaderSectionProps {
  date: Date;
  isScheduled: boolean;
  formatDateMedium: (date: Date) => string;
  onDatePress: () => void;
  onScheduledToggle: () => void;
  onClose: () => void;
  onResetToNow: () => void;
  // Leave usage date range
  isLeaveUsageType?: boolean;
  dateEnd?: Date | null;
  onDateEndPress?: () => void;
  // Vade (ödeme tarihi) — yalnız borç-doğuran (alış/satış) tiplerde gösterilir.
  // İleri-tarihli (Bell) ile AYRI: bu, var olan borcun ödeme vadesi; scheduled değil.
  showVade?: boolean;
  vadeTarihi?: Date | null;
  onVadePress?: () => void;
  onVadeClear?: () => void;
}

export function HeaderSection({
  date,
  isScheduled,
  formatDateMedium,
  onDatePress,
  onScheduledToggle,
  onClose,
  onResetToNow,
  isLeaveUsageType,
  dateEnd,
  onDateEndPress,
  showVade,
  vadeTarihi,
  onVadePress,
  onVadeClear,
}: HeaderSectionProps) {
  const { t } = useTranslation(['transactions', 'common', 'staff']);
  const dateIsToday = isToday(date);

  return (
    <>
      {/* Scheduled transaction label */}
      {isScheduled && (
        <View style={styles.scheduledLabel}>
          <Bell size={14} color={colors.warning} />
          <Text style={styles.scheduledLabelText}>{t('transactions:scheduled.title')}</Text>
        </View>
      )}

      {isScheduled && <Text style={styles.dateLabel}>{t('transactions:future.scheduled')}:</Text>}

      {/* Row 1: Date + Bell + Now + Close */}
      <View style={styles.headerRow}>
        {isLeaveUsageType ? (
          /* Leave usage: dual date display (start → end) */
          <View style={styles.dateRangeRow}>
            <TouchableOpacity style={[styles.dateButton, { marginRight: 0 }]} onPress={onDatePress}>
              <Calendar size={16} color={colors.textMuted} />
              <Text style={styles.dateText} numberOfLines={1}>
                {dateIsToday ? t('common:date.today') : formatDateMedium(date)}
              </Text>
            </TouchableOpacity>
            <ArrowRight size={14} color={colors.textMuted} />
            <TouchableOpacity style={[styles.dateButton, { marginRight: 0 }]} onPress={onDateEndPress}>
              <Calendar size={16} color={colors.textMuted} />
              <Text style={styles.dateText} numberOfLines={1}>
                {dateEnd
                  ? isToday(dateEnd)
                    ? t('common:date.today')
                    : formatDateMedium(dateEnd)
                  : t('staff:leave.endDate')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Normal: date + bell inline */
          <View style={styles.dateRowInline}>
            <TouchableOpacity
              style={[styles.dateButton, styles.dateButtonInline, isScheduled && styles.dateButtonScheduled]}
              onPress={onDatePress}
            >
              <Calendar size={18} color={isScheduled ? colors.warning : colors.textMuted} />
              <Text style={[styles.dateText, isScheduled && styles.dateTextScheduled]}>
                {dateIsToday ? t('common:date.today') : formatDateMedium(date)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bellButtonInline, isScheduled && styles.iconButtonActive]}
              onPress={onScheduledToggle}
            >
              <Bell size={18} color={isScheduled ? colors.warning : colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* "Şimdi" button — only visible when date is not today */}
        {!dateIsToday && !isLeaveUsageType && (
          <TouchableOpacity
            style={styles.nowButton}
            onPress={onResetToNow}
            hitSlop={HIT_SLOP.sm}
          >
            <Text style={styles.nowButtonText}>{t('common:date.now')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          hitSlop={HIT_SLOP.md}
        >
          <X size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Vade (ödeme tarihi) — yalnız borç-doğuran tiplerde; ileri-tarihli (Bell) ile ayrı çip. */}
      {showVade && (
        <TouchableOpacity style={local.vadeChip} onPress={onVadePress} activeOpacity={0.7}>
          <CalendarClock size={15} color={vadeTarihi ? colors.warning : colors.textMuted} />
          <Text style={[local.vadeChipText, vadeTarihi && { color: colors.warning }]} numberOfLines={1}>
            {vadeTarihi
              ? `${t('transactions:vade.label')}: ${formatDateMedium(vadeTarihi)}`
              : t('transactions:vade.add')}
          </Text>
          {vadeTarihi && onVadeClear ? (
            <TouchableOpacity onPress={onVadeClear} hitSlop={HIT_SLOP.sm}>
              <X size={13} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      )}
    </>
  );
}

const local = StyleSheet.create({
  vadeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLighter,
  },
  vadeChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
});
