import { useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePickerRN, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Calendar, Clock } from 'lucide-react-native';
import { Text } from './Text';
import { Button } from './Button';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useDateFormat } from '@/hooks/useDateFormat';
import { ensureValidDate } from '@/lib/date';

interface DateTimePickerProps {
  label?: string;
  value: Date;
  onChange: (date: Date) => void;
  mode?: 'date' | 'time' | 'datetime';
  error?: string;
}

export function DateTimePicker({
  label,
  value,
  onChange,
  mode = 'datetime',
  error,
}: DateTimePickerProps) {
  const { t } = useTranslation('common');
  const { locale, formatDateNative, formatTimeNative } = useDateFormat();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Geçersiz tarih koruması - 1970 ve benzeri sorunları önle
  const safeValue = useMemo(() => ensureValidDate(value), [value]);
  const [tempDate, setTempDate] = useState(safeValue);

  const formatDate = (date: Date) => {
    return formatDateNative(date);
  };

  const formatTime = (date: Date) => {
    return formatTimeNative(date);
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'set' && selectedDate) {
        const newDate = new Date(safeValue);
        newDate.setFullYear(selectedDate.getFullYear());
        newDate.setMonth(selectedDate.getMonth());
        newDate.setDate(selectedDate.getDate());
        onChange(newDate);
      }
    } else {
      if (selectedDate) {
        setTempDate(selectedDate);
      }
    }
  };

  const handleTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
      if (event.type === 'set' && selectedDate) {
        const newDate = new Date(safeValue);
        newDate.setHours(selectedDate.getHours());
        newDate.setMinutes(selectedDate.getMinutes());
        onChange(newDate);
      }
    } else {
      if (selectedDate) {
        setTempDate(selectedDate);
      }
    }
  };

  const handleIOSConfirm = (pickerType: 'date' | 'time') => {
    onChange(tempDate);
    if (pickerType === 'date') {
      setShowDatePicker(false);
    } else {
      setShowTimePicker(false);
    }
  };

  const handleIOSCancel = (pickerType: 'date' | 'time') => {
    setTempDate(safeValue);
    if (pickerType === 'date') {
      setShowDatePicker(false);
    } else {
      setShowTimePicker(false);
    }
  };

  const renderIOSModal = (pickerType: 'date' | 'time') => {
    const isVisible = pickerType === 'date' ? showDatePicker : showTimePicker;

    return (
      <Modal
        visible={isVisible}
        transparent
        animationType="slide"
        onRequestClose={() => handleIOSCancel(pickerType)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => handleIOSCancel(pickerType)}>
                <Text variant="body" color="secondary">{t('common:buttons.cancel')}</Text>
              </TouchableOpacity>
              <Text variant="label">
                {pickerType === 'date' ? t('common:date.selectDate') : t('common:date.selectTime')}
              </Text>
              <TouchableOpacity onPress={() => handleIOSConfirm(pickerType)}>
                <Text variant="body" color="primary">{t('common:buttons.done')}</Text>
              </TouchableOpacity>
            </View>
            <DateTimePickerRN
              value={tempDate}
              mode={pickerType}
              display="spinner"
              onChange={pickerType === 'date' ? handleDateChange : handleTimeChange}
              locale={locale}
              textColor={colors.text}
              themeVariant="light"
            />
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text variant="label" color="secondary" style={styles.label}>
          {label}
        </Text>
      )}

      <View style={styles.pickersRow}>
        {(mode === 'date' || mode === 'datetime') && (
          <TouchableOpacity
            style={[styles.picker, error && styles.pickerError, mode === 'datetime' && styles.pickerHalf]}
            onPress={() => {
              setTempDate(safeValue);
              setShowDatePicker(true);
            }}
          >
            <Calendar size={20} color={colors.textMuted} />
            <Text variant="body" style={styles.pickerText}>
              {formatDate(safeValue)}
            </Text>
          </TouchableOpacity>
        )}

        {(mode === 'time' || mode === 'datetime') && (
          <TouchableOpacity
            style={[styles.picker, error && styles.pickerError, mode === 'datetime' && styles.pickerHalf]}
            onPress={() => {
              setTempDate(safeValue);
              setShowTimePicker(true);
            }}
          >
            <Clock size={20} color={colors.textMuted} />
            <Text variant="body" style={styles.pickerText}>
              {formatTime(safeValue)}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {error && (
        <Text variant="caption" color="error" style={styles.errorText}>
          {error}
        </Text>
      )}

      {/* Android DatePicker */}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePickerRN
          value={safeValue}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}

      {/* Android TimePicker */}
      {Platform.OS === 'android' && showTimePicker && (
        <DateTimePickerRN
          value={safeValue}
          mode="time"
          display="default"
          onChange={handleTimeChange}
          is24Hour={true}
        />
      )}

      {/* iOS Modals */}
      {Platform.OS === 'ios' && renderIOSModal('date')}
      {Platform.OS === 'ios' && renderIOSModal('time')}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    marginBottom: spacing.sm,
  },
  pickersRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    flex: 1,
  },
  pickerHalf: {
    flex: 1,
  },
  pickerError: {
    borderColor: colors.error,
  },
  pickerText: {
    flex: 1,
  },
  errorText: {
    marginTop: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing['2xl'],
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
