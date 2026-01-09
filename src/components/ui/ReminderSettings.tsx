import { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Bell, ChevronDown, Clock, X } from 'lucide-react-native';
import { Text } from './Text';
import { Card } from './Card';
import { Button } from './Button';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useDateFormat } from '@/hooks/useDateFormat';

export interface ReminderConfig {
  enabled: boolean;
  daysBefore: number;
  time: string;
}

interface ReminderSettingsProps {
  value: ReminderConfig;
  onChange: (config: ReminderConfig) => void;
}

// HH:mm string'ini Date'e çevir
function timeStringToDate(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

// Date'i HH:mm string'ine çevir
function dateToTimeString(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function ReminderSettings({ value, onChange }: ReminderSettingsProps) {
  const { t } = useTranslation(['settings', 'common']);
  const { locale } = useDateFormat();
  const [showDaysPicker, setShowDaysPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const DAYS_OPTIONS = [
    { value: 0, label: t('settings:reminders.sameDay') },
    { value: 1, label: t('settings:reminders.oneDayBefore') },
    { value: 2, label: t('settings:reminders.twoDaysBefore') },
    { value: 3, label: t('settings:reminders.threeDaysBefore') },
  ];

  const selectedDaysOption = DAYS_OPTIONS.find(opt => opt.value === value.daysBefore);

  const handleToggle = (enabled: boolean) => {
    onChange({ ...value, enabled });
  };

  const handleDaysChange = (daysBefore: number) => {
    onChange({ ...value, daysBefore });
    setShowDaysPicker(false);
  };

  const handleTimeChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
      if (event.type === 'set' && selectedDate) {
        onChange({ ...value, time: dateToTimeString(selectedDate) });
      }
    } else if (selectedDate) {
      onChange({ ...value, time: dateToTimeString(selectedDate) });
    }
  };

  return (
    <View style={styles.container}>
      {/* Toggle Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Bell size={20} color={value.enabled ? colors.warning : colors.textMuted} />
          <Text variant="body" style={styles.headerText}>
            {t('settings:reminders.title')}
          </Text>
        </View>
        <Switch
          value={value.enabled}
          onValueChange={handleToggle}
          trackColor={{ false: colors.border, true: colors.warning + '60' }}
          thumbColor={value.enabled ? colors.warning : colors.textMuted}
        />
      </View>

      {/* Settings (when enabled) */}
      {value.enabled && (
        <View style={styles.settings}>
          {/* Days Before Picker */}
          <View style={[styles.pickerContainer, { zIndex: 20 }]}>
            <Text variant="caption" color="secondary" style={styles.pickerLabel}>
              {t('settings:reminders.reminderTime')}
            </Text>
            <TouchableOpacity
              style={styles.picker}
              onPress={() => {
                setShowDaysPicker(!showDaysPicker);
                setShowTimePicker(false);
              }}
            >
              <Clock size={18} color={colors.textMuted} />
              <Text variant="body" style={styles.pickerText}>
                {selectedDaysOption?.label || t('common:labels.select')}
              </Text>
              <ChevronDown size={18} color={colors.textMuted} />
            </TouchableOpacity>
            {showDaysPicker && (
              <Card style={styles.dropdown}>
                {DAYS_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.dropdownOption}
                    onPress={() => handleDaysChange(option.value)}
                  >
                    <Text
                      variant="body"
                      style={option.value === value.daysBefore ? styles.selectedOption : undefined}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </Card>
            )}
          </View>

          {/* Time Picker - Native */}
          <View style={[styles.pickerContainer, { zIndex: 10 }]}>
            <Text variant="caption" color="secondary" style={styles.pickerLabel}>
              {t('common:date.time')}
            </Text>
            <TouchableOpacity
              style={styles.picker}
              onPress={() => {
                setShowTimePicker(true);
                setShowDaysPicker(false);
              }}
            >
              <Clock size={18} color={colors.textMuted} />
              <Text variant="body" style={styles.pickerText}>
                {value.time}
              </Text>
              <ChevronDown size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* iOS Time Picker Modal */}
      {Platform.OS === 'ios' && showTimePicker && (
        <Modal
          visible={showTimePicker}
          transparent
          animationType="slide"
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowTimePicker(false)}
          >
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text variant="h3">{t('common:date.selectTime')}</Text>
                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={timeStringToDate(value.time)}
                mode="time"
                display="spinner"
                onChange={handleTimeChange}
                locale={locale}
                themeVariant="light"
                style={{ height: 200 }}
              />
              <Button
                variant="primary"
                onPress={() => setShowTimePicker(false)}
                style={{ marginTop: spacing.md }}
              >
                {t('common:buttons.done')}
              </Button>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Android Time Picker */}
      {Platform.OS === 'android' && showTimePicker && (
        <DateTimePicker
          value={timeStringToDate(value.time)}
          mode="time"
          display="default"
          onChange={handleTimeChange}
          is24Hour={true}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'visible',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerText: {
    fontWeight: '500',
  },
  settings: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  pickerContainer: {
    flex: 1,
    position: 'relative',
  },
  pickerLabel: {
    marginBottom: spacing.xs,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pickerText: {
    flex: 1,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing.xs,
    zIndex: 100,
  },
  dropdownOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  selectedOption: {
    color: colors.warning,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
});
