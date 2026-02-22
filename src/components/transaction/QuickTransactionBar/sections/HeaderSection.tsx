import { View, TouchableOpacity } from 'react-native';
import { Calendar, Bell, X, ArrowRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { isToday } from '@/lib/date';
import { styles } from '../styles';

export interface HeaderSectionProps {
  date: Date;
  isScheduled: boolean;
  formatDateMedium: (date: Date) => string;
  onDatePress: () => void;
  onScheduledToggle: () => void;
  onClose: () => void;
  // Leave usage date range
  isLeaveUsageType?: boolean;
  dateEnd?: Date | null;
  onDateEndPress?: () => void;
}

export function HeaderSection({
  date,
  isScheduled,
  formatDateMedium,
  onDatePress,
  onScheduledToggle,
  onClose,
  isLeaveUsageType,
  dateEnd,
  onDateEndPress,
}: HeaderSectionProps) {
  const { t } = useTranslation(['transactions', 'common', 'staff']);

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

      {/* Row 1: Date + Bell + Close */}
      <View style={styles.headerRow}>
        {isLeaveUsageType ? (
          /* Leave usage: dual date display (start → end) */
          <View style={styles.dateRangeRow}>
            <TouchableOpacity style={[styles.dateButton, { marginRight: 0 }]} onPress={onDatePress}>
              <Calendar size={16} color={colors.textMuted} />
              <Text style={styles.dateText} numberOfLines={1}>
                {isToday(date) ? t('common:date.today') : formatDateMedium(date)}
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
          /* Normal: single date */
          <TouchableOpacity
            style={[styles.dateButton, isScheduled && styles.dateButtonScheduled]}
            onPress={onDatePress}
          >
            <Calendar size={18} color={isScheduled ? colors.warning : colors.textMuted} />
            <Text style={[styles.dateText, isScheduled && styles.dateTextScheduled]}>
              {isToday(date) ? t('common:date.today') : formatDateMedium(date)}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.headerCenter}>
          {!isLeaveUsageType && (
            <TouchableOpacity
              style={[styles.bellButton, isScheduled && styles.iconButtonActive]}
              onPress={onScheduledToggle}
            >
              <Bell size={18} color={isScheduled ? colors.warning : colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </>
  );
}
