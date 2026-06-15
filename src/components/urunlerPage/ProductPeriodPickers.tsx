import { View, ScrollView, TouchableOpacity, Modal, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { X } from 'lucide-react-native';
import { Text, Button } from '@/components/ui';
import { styles } from './styles';
import { colors } from '@/constants/colors';
import { ensureValidDate } from '@/lib/date';

interface ProductPeriodPickersProps {
  period: string;
  periodOffset: number;
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  showYearPicker: boolean;
  setShowYearPicker: (v: boolean) => void;
  showMonthYearPicker: boolean;
  setShowMonthYearPicker: (v: boolean) => void;
  showDayPicker: boolean;
  setShowDayPicker: (v: boolean) => void;
  showStartPicker: boolean;
  setShowStartPicker: (v: boolean) => void;
  showEndPicker: boolean;
  setShowEndPicker: (v: boolean) => void;
  customStartDate: Date;
  setCustomStartDate: (d: Date) => void;
  customEndDate: Date;
  setCustomEndDate: (d: Date) => void;
  goToYear: (year: number) => void;
  goToMonth: (year: number, month: number) => void;
  goToDay: (date: Date) => void;
  goToWeekOfMonth: (year: number, month: number) => void;
  locale: string;
  t: {
    selectYear: string;
    selectMonthYear: string;
    daily: string;
    startDate: string;
    endDate: string;
    ok: string;
    monthsShort: string[];
  };
}

export function ProductPeriodPickers(props: ProductPeriodPickersProps) {
  const {
    period, periodOffset, selectedYear, setSelectedYear,
    showYearPicker, setShowYearPicker,
    showMonthYearPicker, setShowMonthYearPicker,
    showDayPicker, setShowDayPicker,
    showStartPicker, setShowStartPicker,
    showEndPicker, setShowEndPicker,
    customStartDate, setCustomStartDate,
    customEndDate, setCustomEndDate,
    goToYear, goToMonth, goToDay, goToWeekOfMonth,
    locale, t,
  } = props;

  // Güvenli türevler: iOS'ta bitiş picker'ının minimumDate'i asla maximumDate'i
  // (bugün) geçmesin — gelecek tarihli başlangıç native UIDatePicker'da min>max
  // çökmesine yol açar.
  const todayMax = new Date();
  const safeStart = ensureValidDate(customStartDate);
  const safeEnd = ensureValidDate(customEndDate);
  const endMin = safeStart.getTime() <= todayMax.getTime() ? safeStart : todayMax;

  return (
    <>
      {/* Custom Date Pickers - iOS */}
      {Platform.OS === 'ios' && (showStartPicker || showEndPicker) && (
        <Modal visible={showStartPicker || showEndPicker} transparent animationType="slide">
          <Pressable
            style={styles.datePickerOverlay}
            onPress={() => {
              setShowStartPicker(false);
              setShowEndPicker(false);
            }}
          >
            <Pressable style={styles.datePickerModal} onPress={(e) => e.stopPropagation()}>
              <View style={styles.datePickerHeader}>
                <Text variant="h3">
                  {showStartPicker ? t.startDate : t.endDate}
                </Text>
                <TouchableOpacity onPress={() => {
                  setShowStartPicker(false);
                  setShowEndPicker(false);
                }}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.datePickerWrapper}>
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
                        setCustomStartDate(date);
                        if (date > safeEnd) {
                          setCustomEndDate(date);
                        }
                      } else {
                        setCustomEndDate(date);
                      }
                    }
                  }}
                  minimumDate={showEndPicker ? endMin : undefined}
                  maximumDate={todayMax}
                />
              </View>
              <Button variant="primary" onPress={() => {
                setShowStartPicker(false);
                setShowEndPicker(false);
              }}>
                {t.ok}
              </Button>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Custom Date Pickers - Android */}
      {Platform.OS === 'android' && showStartPicker && (
        <DateTimePicker
          value={safeStart}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowStartPicker(false);
            if (event.type === 'set' && date) {
              setCustomStartDate(date);
              if (date > safeEnd) {
                setCustomEndDate(date);
              }
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
              setCustomEndDate(date);
            }
          }}
          minimumDate={endMin}
          maximumDate={todayMax}
        />
      )}

      {/* Year Picker Modal */}
      <Modal visible={showYearPicker} transparent animationType="slide" onRequestClose={() => setShowYearPicker(false)}>
        <Pressable style={styles.pickerModalOverlay} onPress={() => setShowYearPicker(false)}>
          <Pressable style={styles.pickerModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerModalHeader}>
              <Text variant="h3">{t.selectYear}</Text>
              <TouchableOpacity onPress={() => setShowYearPicker(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.yearGrid}>
              {Array.from({ length: 12 }, (_, i) => 2020 + i).map((year) => {
                const isSelected = year === new Date().getFullYear() + periodOffset;
                return (
                  <TouchableOpacity
                    key={year}
                    style={[styles.yearGridCell, isSelected && styles.yearGridCellActive]}
                    onPress={() => goToYear(year)}
                  >
                    <Text variant="body" style={isSelected ? styles.yearGridTextActive : undefined}>
                      {year}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Month + Year Picker Modal */}
      <Modal visible={showMonthYearPicker} transparent animationType="slide" onRequestClose={() => setShowMonthYearPicker(false)}>
        <Pressable style={styles.pickerModalOverlay} onPress={() => setShowMonthYearPicker(false)}>
          <Pressable style={styles.pickerModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerModalHeader}>
              <Text variant="h3">{t.selectMonthYear}</Text>
              <TouchableOpacity onPress={() => setShowMonthYearPicker(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.yearScrollView} contentContainerStyle={styles.yearScrollContent}>
              {Array.from({ length: 12 }, (_, i) => 2020 + i).map((year) => (
                <TouchableOpacity
                  key={year}
                  style={[styles.yearChip, selectedYear === year && styles.yearChipActive]}
                  onPress={() => setSelectedYear(year)}
                >
                  <Text variant="body" style={selectedYear === year ? styles.yearChipTextActive : styles.yearChipText}>
                    {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.monthGrid}>
              {t.monthsShort.map((monthName, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.monthCell}
                  onPress={() => {
                    if (period === 'weekly') {
                      goToWeekOfMonth(selectedYear, index);
                    } else {
                      goToMonth(selectedYear, index);
                    }
                  }}
                >
                  <Text variant="body">{monthName}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Daily DatePicker Modal (iOS) */}
      {Platform.OS === 'ios' && showDayPicker && (
        <Modal visible={showDayPicker} transparent animationType="slide">
          <Pressable style={styles.pickerModalOverlay} onPress={() => setShowDayPicker(false)}>
            <Pressable style={styles.pickerModalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.pickerModalHeader}>
                <Text variant="h3">{t.daily}</Text>
                <TouchableOpacity onPress={() => setShowDayPicker(false)}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={{ alignItems: 'center' }}>
                <DateTimePicker
                  value={(() => {
                    const now = new Date();
                    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + periodOffset);
                  })()}
                  mode="date"
                  display="inline"
                  themeVariant="light"
                  accentColor={colors.primary}
                  locale={locale}
                  style={{ height: 350 }}
                  onChange={(_, date) => { if (date) goToDay(date); }}
                  maximumDate={new Date()}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Daily DatePicker (Android) */}
      {Platform.OS === 'android' && showDayPicker && (
        <DateTimePicker
          value={(() => {
            const now = new Date();
            return new Date(now.getFullYear(), now.getMonth(), now.getDate() + periodOffset);
          })()}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowDayPicker(false);
            if (event.type === 'set' && date) goToDay(date);
          }}
          maximumDate={new Date()}
        />
      )}
    </>
  );
}
