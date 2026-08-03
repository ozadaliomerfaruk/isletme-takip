import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePickerRN, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { Text, Modal } from '@/components/ui';
import { colors } from '@/constants/colors';
import {
  combineTransactionDateAndTime,
  ensureValidTransactionDate,
  getMinimumTransactionDate,
} from '@/lib/date';
import { styles } from '../styles';

export interface DateTimePickerModalProps {
  visible: boolean;
  onDismiss: () => void;
  value: Date;
  onChange: (date: Date) => void;
  locale?: string;
  /** Geçmişe kaymayı engellemek için (ör. taksit ilk vadesi >= işlem tarihi). */
  minimumDate?: Date;
}

export function DateTimePickerModal({
  visible,
  onDismiss,
  value,
  onChange,
  locale = 'tr',
  minimumDate,
}: DateTimePickerModalProps) {
  const { t } = useTranslation(['transactions', 'common']);

  const effectiveMinimumDate = useMemo(() => {
    const transactionFloor = getMinimumTransactionDate();
    const requestedMinimum = ensureValidTransactionDate(minimumDate, transactionFloor);
    const result = requestedMinimum.getTime() < transactionFloor.getTime()
      ? transactionFloor
      : new Date(requestedMinimum);

    // Date modunda yalnız gün sınırı önemlidir. Saat bileşeni aynı günün yanlışlıkla
    // seçilemez sayılmasına yol açmasın.
    result.setHours(0, 0, 0, 0);
    return result;
  }, [minimumDate]);

  const safeValue = useMemo(() => {
    const candidate = ensureValidTransactionDate(value);
    return candidate.getTime() < effectiveMinimumDate.getTime()
      ? new Date(effectiveMinimumDate)
      : candidate;
  }, [effectiveMinimumDate, value]);

  // Tarih ve saat picker'ları aynı controlled Date'i paylaşınca birbirlerinin
  // native value güncellemesini geri yazabiliyordu. İki parçayı bağımsız tutup
  // kullanıcı bitirdiğinde tek bir Date'e birleştiriyoruz.
  const [draftDate, setDraftDate] = useState(safeValue);
  const [draftTime, setDraftTime] = useState(safeValue);
  const [androidMode, setAndroidMode] = useState<'date' | 'time'>('date');

  useLayoutEffect(() => {
    if (!visible) return;

    setDraftDate(safeValue);
    setDraftTime(safeValue);
    setAndroidMode('date');
    Keyboard.dismiss();
  }, [safeValue, visible]);

  const commitAndDismiss = useCallback(
    (datePart: Date = draftDate, timePart: Date = draftTime) => {
      onChange(combineTransactionDateAndTime(datePart, timePart, safeValue));
      onDismiss();
    },
    [draftDate, draftTime, onChange, onDismiss, safeValue]
  );

  const handleDateChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === 'android') {
        if (event.type !== 'set' || !selectedDate) {
          onDismiss();
          return;
        }

        const nextDate = ensureValidTransactionDate(selectedDate, draftDate);
        setDraftDate(
          nextDate.getTime() < effectiveMinimumDate.getTime()
            ? new Date(effectiveMinimumDate)
            : nextDate
        );
        setAndroidMode('time');
        return;
      }

      if (!selectedDate) return;
      const nextDate = ensureValidTransactionDate(selectedDate, draftDate);
      setDraftDate(
        nextDate.getTime() < effectiveMinimumDate.getTime()
          ? new Date(effectiveMinimumDate)
          : nextDate
      );
    },
    [draftDate, effectiveMinimumDate, onDismiss]
  );

  const handleTimeChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === 'android') {
        if (event.type === 'set' && selectedDate) {
          commitAndDismiss(draftDate, selectedDate);
        } else {
          // Tarih seçildi, kullanıcı saat adımını iptal etti: seçilen günü mevcut
          // saatle koru; ilk adımı sessizce kaybetme.
          commitAndDismiss(draftDate, draftTime);
        }
        return;
      }

      if (selectedDate && Number.isFinite(selectedDate.getTime())) {
        setDraftTime(selectedDate);
      }
    },
    [commitAndDismiss, draftDate, draftTime]
  );

  if (!visible) return null;

  if (Platform.OS === 'android') {
    return (
      <DateTimePickerRN
        key={androidMode}
        value={androidMode === 'date' ? draftDate : draftTime}
        mode={androidMode}
        display="default"
        is24Hour
        minimumDate={androidMode === 'date' ? effectiveMinimumDate : undefined}
        onChange={androidMode === 'date' ? handleDateChange : handleTimeChange}
      />
    );
  }

  return (
    <Modal inline visible transparent animationType="fade">
      <TouchableWithoutFeedback onPress={() => commitAndDismiss()}>
        <View style={styles.pickerBackdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerTitle}>{t('transactions:form.dateTime')}</Text>

              {/* Date Picker */}
              <View style={styles.pickerSection}>
                <Text style={styles.pickerSectionTitle}>{t('common:date.date')}</Text>
                <DateTimePickerRN
                  value={draftDate}
                  mode="date"
                  display="spinner"
                  onChange={handleDateChange}
                  locale={locale}
                  minimumDate={effectiveMinimumDate}
                  textColor={colors.text}
                  themeVariant="light"
                  style={styles.datePickerStyle}
                />
              </View>

              {/* Time Picker */}
              <View style={styles.pickerSection}>
                <Text style={styles.pickerSectionTitle}>{t('common:date.time')}</Text>
                <DateTimePickerRN
                  value={draftTime}
                  mode="time"
                  display="spinner"
                  is24Hour={true}
                  onChange={handleTimeChange}
                  locale={locale}
                  textColor={colors.text}
                  themeVariant="light"
                  style={styles.timePickerStyle}
                />
              </View>

              <TouchableOpacity style={styles.pickerDoneButton} onPress={() => commitAndDismiss()}>
                <Text style={styles.pickerDoneText}>{t('common:buttons.done')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
