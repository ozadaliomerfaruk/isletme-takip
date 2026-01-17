import { View, TouchableOpacity } from 'react-native';
import { Calendar, Bell, X } from 'lucide-react-native';
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
}

export function HeaderSection({
  date,
  isScheduled,
  formatDateMedium,
  onDatePress,
  onScheduledToggle,
  onClose,
}: HeaderSectionProps) {
  const { t } = useTranslation(['transactions', 'common']);

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
        <TouchableOpacity
          style={[styles.dateButton, isScheduled && styles.dateButtonScheduled]}
          onPress={onDatePress}
        >
          <Calendar size={18} color={isScheduled ? colors.warning : colors.textMuted} />
          <Text style={[styles.dateText, isScheduled && styles.dateTextScheduled]}>
            {isToday(date) ? t('common:date.today') : formatDateMedium(date)}
          </Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <TouchableOpacity
            style={[styles.bellButton, isScheduled && styles.iconButtonActive]}
            onPress={onScheduledToggle}
          >
            <Bell size={18} color={isScheduled ? colors.warning : colors.textMuted} />
          </TouchableOpacity>
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
