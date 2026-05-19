import { Modal, View, TouchableWithoutFeedback, TouchableOpacity, Platform } from 'react-native';
import DateTimePickerRN from '@react-native-community/datetimepicker';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { styles } from './styles';

interface CreditCardDatePickerProps {
  visible: boolean;
  date: Date;
  onDateChange: (date: Date) => void;
  onDismiss: () => void;
  locale: string;
  t: (key: string) => string;
}

export function CreditCardDatePicker({
  visible,
  date,
  onDateChange,
  onDismiss,
  locale,
  t,
}: CreditCardDatePickerProps) {
  if (!visible) return null;

  const handleDateChange = (_event: { type: string }, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      if (_event.type === 'set' && selectedDate) {
        const newDate = new Date(date);
        newDate.setFullYear(selectedDate.getFullYear());
        newDate.setMonth(selectedDate.getMonth());
        newDate.setDate(selectedDate.getDate());
        onDateChange(newDate);
      }
    } else if (selectedDate) {
      const newDate = new Date(date);
      newDate.setFullYear(selectedDate.getFullYear());
      newDate.setMonth(selectedDate.getMonth());
      newDate.setDate(selectedDate.getDate());
      onDateChange(newDate);
    }
  };

  const handleTimeChange = (_event: { type: string }, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      if (_event.type === 'set' && selectedDate) {
        const newDate = new Date(date);
        newDate.setHours(selectedDate.getHours());
        newDate.setMinutes(selectedDate.getMinutes());
        onDateChange(newDate);
      }
    } else if (selectedDate) {
      const newDate = new Date(date);
      newDate.setHours(selectedDate.getHours());
      newDate.setMinutes(selectedDate.getMinutes());
      onDateChange(newDate);
    }
  };

  return (
    <Modal visible transparent animationType="fade">
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.pickerBackdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerTitle}>{t('transactions:form.dateTime')}</Text>

              <View style={styles.pickerSection}>
                <Text style={styles.pickerSectionTitle}>{t('common:date.date')}</Text>
                <DateTimePickerRN
                  value={date}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleDateChange}
                  locale={locale}
                  textColor={colors.text}
                  themeVariant="light"
                  style={styles.datePickerStyle}
                />
              </View>

              <View style={styles.pickerSection}>
                <Text style={styles.pickerSectionTitle}>{t('common:date.time')}</Text>
                <DateTimePickerRN
                  value={date}
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
