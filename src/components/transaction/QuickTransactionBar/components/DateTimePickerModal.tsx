import { useCallback } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePickerRN from '@react-native-community/datetimepicker';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { styles } from '../styles';

export interface DateTimePickerModalProps {
  visible: boolean;
  onDismiss: () => void;
  value: Date;
  onChange: (date: Date) => void;
  locale?: string;
}

export function DateTimePickerModal({
  visible,
  onDismiss,
  value,
  onChange,
  locale = 'tr',
}: DateTimePickerModalProps) {
  const { t } = useTranslation(['transactions', 'common']);

  const handleDateChange = useCallback(
    (event: { type: string }, selectedDate?: Date) => {
      if (Platform.OS === 'android') {
        if (event.type === 'set' && selectedDate) {
          const newDate = new Date(value);
          newDate.setFullYear(selectedDate.getFullYear());
          newDate.setMonth(selectedDate.getMonth());
          newDate.setDate(selectedDate.getDate());
          onChange(newDate);
        }
      } else if (selectedDate) {
        const newDate = new Date(value);
        newDate.setFullYear(selectedDate.getFullYear());
        newDate.setMonth(selectedDate.getMonth());
        newDate.setDate(selectedDate.getDate());
        onChange(newDate);
      }
    },
    [value, onChange]
  );

  const handleTimeChange = useCallback(
    (event: { type: string }, selectedDate?: Date) => {
      if (Platform.OS === 'android') {
        if (event.type === 'set' && selectedDate) {
          const newDate = new Date(value);
          newDate.setHours(selectedDate.getHours());
          newDate.setMinutes(selectedDate.getMinutes());
          onChange(newDate);
        }
      } else if (selectedDate) {
        const newDate = new Date(value);
        newDate.setHours(selectedDate.getHours());
        newDate.setMinutes(selectedDate.getMinutes());
        onChange(newDate);
      }
    },
    [value, onChange]
  );

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade">
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.pickerBackdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerTitle}>{t('transactions:form.dateTime')}</Text>

              {/* Date Picker */}
              <View style={styles.pickerSection}>
                <Text style={styles.pickerSectionTitle}>{t('common:date.date')}</Text>
                <DateTimePickerRN
                  value={value}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleDateChange}
                  locale={locale}
                  textColor={colors.text}
                  themeVariant="light"
                  style={styles.datePickerStyle}
                />
              </View>

              {/* Time Picker */}
              <View style={styles.pickerSection}>
                <Text style={styles.pickerSectionTitle}>{t('common:date.time')}</Text>
                <DateTimePickerRN
                  value={value}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  is24Hour={true}
                  onChange={handleTimeChange}
                  locale={locale}
                  textColor={colors.text}
                  themeVariant="light"
                  style={styles.timePickerStyle}
                />
              </View>

              <TouchableOpacity style={styles.pickerDoneButton} onPress={onDismiss}>
                <Text style={styles.pickerDoneText}>{t('common:buttons.done')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
