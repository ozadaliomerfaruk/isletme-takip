import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';
import { formatDateForDB, ensureValidDate } from '@/lib/date';

interface CustomDateRangePickerProps {
  startDate: Date;
  endDate: Date;
  /** Yeni (başlangıç, bitiş) aralığı. Bitiş < başlangıç olamaz (clamp burada yapılır). */
  onChange: (start: Date, end: Date) => void;
  locale: string;
}

/**
 * Rapor ekranlarında 'custom' dönem için ortak tarih-aralığı seçici.
 * İçinde: özel tarih satırı (iki buton) + iOS modal + Android tekil picker'lar.
 * Daha önce cari/personel/gelir-gider/alis-satis ekranlarında birebir kopyalanmıştı.
 * Modal/DateTimePicker portal gibi davrandığından bileşen satır yerine konabilir.
 */
export function CustomDateRangePicker({ startDate, endDate, onChange, locale }: CustomDateRangePickerProps) {
  const { t } = useTranslation(['reports', 'common']);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const close = () => {
    setShowStartPicker(false);
    setShowEndPicker(false);
  };

  // Güvenli türevler: geçersiz/epoch tarihleri bugüne çek; iOS'ta bitiş picker'ının
  // minimumDate'i asla maximumDate'i (bugün) geçmesin — gelecek tarihli startDate
  // native UIDatePicker'da min>max çökmesine yol açıyor.
  const todayMax = new Date();
  const safeStart = ensureValidDate(startDate);
  const safeEnd = ensureValidDate(endDate);
  const endMin = safeStart.getTime() <= todayMax.getTime() ? safeStart : todayMax;

  return (
    <>
      <View style={styles.customDateRow}>
        <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowStartPicker(true)}>
          <Calendar size={14} color={colors.primary} />
          <Text variant="caption">{formatDateForDB(safeStart)}</Text>
        </TouchableOpacity>
        <Text variant="caption" style={styles.dateSeparator}>-</Text>
        <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowEndPicker(true)}>
          <Calendar size={14} color={colors.primary} />
          <Text variant="caption">{formatDateForDB(safeEnd)}</Text>
        </TouchableOpacity>
      </View>

      {/* iOS */}
      {Platform.OS === 'ios' && (showStartPicker || showEndPicker) && (
        <Modal visible={showStartPicker || showEndPicker} transparent animationType="slide">
          <Pressable style={styles.pickerModalOverlay} onPress={close}>
            <Pressable style={styles.pickerModalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.pickerModalHeader}>
                <Text variant="h3">
                  {showStartPicker ? t('reports:period.startDateTitle') : t('reports:period.endDateTitle')}
                </Text>
                <TouchableOpacity onPress={close} hitSlop={HIT_SLOP.md}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={{ alignItems: 'center' }}>
                <DateTimePicker
                  value={showStartPicker ? safeStart : safeEnd}
                  mode="date"
                  display="inline"
                  themeVariant="light"
                  accentColor={colors.primary}
                  locale={locale}
                  style={{ height: 350 }}
                  onChange={(_, date) => {
                    if (date) {
                      if (showStartPicker) {
                        const newEnd = date > safeEnd ? date : safeEnd;
                        onChange(date, newEnd);
                      } else {
                        onChange(safeStart, date);
                      }
                    }
                  }}
                  minimumDate={showEndPicker ? endMin : undefined}
                  maximumDate={todayMax}
                />
              </View>
              <Button variant="primary" onPress={close}>
                {t('common:buttons.ok')}
              </Button>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Android */}
      {Platform.OS === 'android' && showStartPicker && (
        <DateTimePicker
          value={safeStart}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowStartPicker(false);
            if (event.type === 'set' && date) {
              const newEnd = date > safeEnd ? date : safeEnd;
              onChange(date, newEnd);
            }
          }}
          maximumDate={todayMax}
        />
      )}
      {Platform.OS === 'android' && showEndPicker && (
        <DateTimePicker
          value={safeEnd}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowEndPicker(false);
            if (event.type === 'set' && date) {
              onChange(safeStart, date);
            }
          }}
          minimumDate={endMin}
          maximumDate={todayMax}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  customDateRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  dateSeparator: {
    color: colors.textMuted,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: '70%',
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
});

export default CustomDateRangePicker;
