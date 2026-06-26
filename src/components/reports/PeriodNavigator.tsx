import { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react-native';
import DateTimePickerRN, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { PeriodType } from '@/hooks/useIslemler';
import { useDateFormat } from '@/hooks/useDateFormat';
import { ensureValidDate, getDateRange } from '@/lib/date';

interface PeriodNavigatorProps {
  period: PeriodType;
  periodOffset: number;
  periodLabel: string;
  setPeriodOffset: (offset: number) => void;
  /**
   * Aylık modda periodOffset'i YIL offset'i gibi ele al: etiket yılı gösterir,
   * etikete basınca yıl seçici açılır, sol/sağ tuşları yılı değiştirir. Karşılaştırma
   * sayfası (takvim yılı = 12 ay) için kullanılır. Varsayılan kapalı → diğer ekranlar
   * normal aylık (tek ay + ay seçici) davranışını korur.
   */
  monthlyAsYear?: boolean;
  /**
   * Günlük modda periodOffset'i AY offset'i gibi ele al: etiket ayı gösterir,
   * etikete basınca ay seçici açılır, sol/sağ tuşları ayı değiştirir. Karşılaştırma
   * sayfası (takvim ayı = o ayın günleri) için. Varsayılan kapalı → diğer ekranlar
   * normal günlük (tek gün + tarih seçici) davranışını korur.
   */
  dailyAsMonth?: boolean;
}

export function PeriodNavigator({
  period,
  periodOffset,
  periodLabel,
  setPeriodOffset,
  monthlyAsYear = false,
  dailyAsMonth = false,
}: PeriodNavigatorProps) {
  const { t } = useTranslation(['common', 'reports']);
  const { locale } = useDateFormat();

  // Modal states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Günlük mod için gösterilen tarih. Kontrollü iOS picker'a HER render aynı Date
  // kimliği gitsin diye memoize edilir (her render yeni Date objesi spinner/inline'ı
  // sürekli sıfırlayıp "tarih değiştirilemiyor" hatasına yol açıyordu). ensureValidDate
  // ayrıca olası epoch/1970 sentinel'ini bugüne çeker.
  const dailyValue = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + periodOffset);
    return ensureValidDate(d);
  }, [periodOffset]);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'set' && selectedDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        selectedDate.setHours(0, 0, 0, 0);
        const diffMs = selectedDate.getTime() - today.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        setPeriodOffset(diffDays);
      }
    } else if (selectedDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      selectedDate.setHours(0, 0, 0, 0);
      const diffMs = selectedDate.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      setPeriodOffset(diffDays);
    }
  };

  // Handle label press - open appropriate picker modal
  const handleLabelPress = () => {
    // Aylık-yıl modu (karşılaştırma): etiket yıl seçiciyi açar
    if (period === 'monthly' && monthlyAsYear) {
      setShowYearPicker(true);
      return;
    }
    // Günlük-ay modu (karşılaştırma): etiket ay seçiciyi açar
    if (period === 'daily' && dailyAsMonth) {
      const target = new Date(new Date().getFullYear(), new Date().getMonth() + periodOffset, 1);
      setSelectedYear(target.getFullYear());
      setShowMonthYearPicker(true);
      return;
    }
    switch (period) {
      case 'yearly':
        setShowYearPicker(true);
        break;
      case 'monthly':
      case 'weekly': {
        // Calculate the currently displayed month/year to pre-select
        const now = new Date();
        if (period === 'monthly') {
          const targetDate = new Date(now.getFullYear(), now.getMonth() + periodOffset, 1);
          setSelectedYear(targetDate.getFullYear());
        } else {
          // weekly: approximate the target month
          const targetDate = new Date(now);
          targetDate.setDate(targetDate.getDate() + periodOffset * 7);
          setSelectedYear(targetDate.getFullYear());
        }
        setShowMonthYearPicker(true);
        break;
      }
      case 'daily':
        setShowDatePicker(true);
        break;
    }
  };

  // Year picker: calculate offset for selected year
  const goToYear = (year: number) => {
    setPeriodOffset(year - new Date().getFullYear());
    setShowYearPicker(false);
  };

  // Month picker: calculate offset for selected month+year
  const goToMonth = (year: number, month: number) => {
    const now = new Date();
    setPeriodOffset((year - now.getFullYear()) * 12 + (month - now.getMonth()));
    setShowMonthYearPicker(false);
  };

  // Week picker: approximate offset for selected month
  const goToWeekOfMonth = (year: number, month: number) => {
    const now = new Date();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const firstDayOfMonth = new Date(year, month, 1);
    const daysDiff = Math.round((firstDayOfMonth.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));
    setPeriodOffset(Math.floor(daysDiff / 7));
    setShowMonthYearPicker(false);
  };

  // Determine the currently active year for the year picker highlight
  const currentDisplayYear = new Date().getFullYear() + periodOffset;

  // Ay grid vurgusu için AKTİF dönemin yıl/ayı (bugünün değil — periodOffset'ten türetilir).
  const getActiveMonthYear = (): { year: number; month: number } => {
    const now = new Date();
    if (period === 'weekly') {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + mondayOffset + periodOffset * 7,
      );
      return { year: start.getFullYear(), month: start.getMonth() };
    }
    const target = new Date(now.getFullYear(), now.getMonth() + periodOffset, 1);
    return { year: target.getFullYear(), month: target.getMonth() };
  };
  const { year: activeYear, month: activeMonth } = getActiveMonthYear();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.navButton}
        onPress={() => setPeriodOffset(periodOffset - 1)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <ChevronLeft size={20} color={colors.text} />
      </TouchableOpacity>

      {/* Clickable label for ALL period types */}
      <TouchableOpacity
        style={styles.dateLabelButton}
        onPress={handleLabelPress}
        activeOpacity={0.7}
      >
        <Calendar size={14} color={colors.primary} />
        <Text variant="body" style={styles.dateLabelText}>
          {period === 'monthly' && monthlyAsYear
            ? String(new Date().getFullYear() + periodOffset)
            : period === 'daily' && dailyAsMonth
            ? getDateRange('monthly', periodOffset).label
            : periodLabel}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navButton}
        onPress={() => setPeriodOffset(periodOffset + 1)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <ChevronRight size={20} color={colors.text} />
      </TouchableOpacity>

      {/* ===== YEAR PICKER MODAL ===== */}
      <Modal visible={showYearPicker} transparent animationType="slide">
        <Pressable
          style={styles.pickerModalOverlay}
          onPress={() => setShowYearPicker(false)}
        >
          <Pressable
            style={styles.pickerModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.pickerModalHeader}>
              <Text variant="h3">{t('reports:period.selectYear')}</Text>
              <TouchableOpacity onPress={() => setShowYearPicker(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.yearPickerScroll} showsVerticalScrollIndicator={false}>
              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map((year) => (
                <TouchableOpacity
                  key={year}
                  style={[
                    styles.yearPickerItem,
                    year === currentDisplayYear && styles.yearPickerItemActive,
                  ]}
                  onPress={() => goToYear(year)}
                >
                  <Text
                    variant="body"
                    style={[
                      styles.yearPickerText,
                      year === currentDisplayYear && styles.yearPickerTextActive,
                    ]}
                  >
                    {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== MONTH + YEAR PICKER MODAL ===== */}
      <Modal visible={showMonthYearPicker} transparent animationType="slide">
        <Pressable
          style={styles.pickerModalOverlay}
          onPress={() => setShowMonthYearPicker(false)}
        >
          <Pressable
            style={styles.pickerModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.pickerModalHeader}>
              <Text variant="h3">{t('reports:period.selectMonthYear')}</Text>
              <TouchableOpacity onPress={() => setShowMonthYearPicker(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.monthYearSelector}>
              <TouchableOpacity
                style={styles.yearNavButton}
                onPress={() => setSelectedYear(selectedYear - 1)}
              >
                <ChevronLeft size={24} color={colors.primary} />
              </TouchableOpacity>
              <Text variant="h3" style={styles.selectedYearText}>
                {selectedYear}
              </Text>
              <TouchableOpacity
                style={styles.yearNavButton}
                onPress={() => setSelectedYear(selectedYear + 1)}
              >
                <ChevronRight size={24} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.monthGrid}>
              {Array.from({ length: 12 }, (_, i) => {
                const monthDate = new Date(selectedYear, i, 1);
                const monthName = monthDate.toLocaleDateString(locale, { month: 'short' });
                const isCurrentMonth = selectedYear === activeYear && i === activeMonth;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.monthItem, isCurrentMonth && styles.monthItemActive]}
                    onPress={() => period === 'weekly' ? goToWeekOfMonth(selectedYear, i) : goToMonth(selectedYear, i)}
                  >
                    <Text
                      variant="body"
                      style={[styles.monthItemText, isCurrentMonth && styles.monthItemTextActive]}
                    >
                      {monthName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== DAILY DATE PICKER ===== */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePickerRN
          value={dailyValue}
          mode="date"
          display="default"
          onChange={handleDateChange}
          maximumDate={new Date()}
          locale={locale}
        />
      )}

      {showDatePicker && Platform.OS === 'ios' && (
        <Modal visible transparent animationType="slide">
          <Pressable
            style={styles.pickerModalOverlay}
            onPress={() => setShowDatePicker(false)}
          >
            <Pressable
              style={styles.pickerModalContent}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.pickerModalHeader}>
                <Text variant="h3">{t('common:date.selectDate')}</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={{ alignItems: 'center' }}>
                <DateTimePickerRN
                  value={dailyValue}
                  mode="date"
                  display="inline"
                  onChange={handleDateChange}
                  locale={locale}
                  themeVariant="light"
                  accentColor={colors.primary}
                  maximumDate={new Date()}
                  style={styles.datePickerStyle}
                />
              </View>
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.doneBtnText}>{t('common:buttons.done')}</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  navButton: {
    padding: spacing.sm,
  },
  dateLabelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: colors.primaryLight + '30',
    borderRadius: borderRadius.md,
  },
  dateLabelText: {
    color: colors.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Shared modal styles
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
  // Year picker
  yearPickerScroll: {
    maxHeight: 300,
  },
  yearPickerItem: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    marginBottom: spacing.xs,
  },
  yearPickerItemActive: {
    backgroundColor: colors.primaryLight,
  },
  yearPickerText: {
    textAlign: 'center',
    fontSize: 18,
  },
  yearPickerTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  // Month + Year picker
  monthYearSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    gap: spacing.lg,
  },
  yearNavButton: {
    padding: spacing.sm,
  },
  selectedYearText: {
    minWidth: 80,
    textAlign: 'center',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  monthItem: {
    width: '30%',
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
  },
  monthItemActive: {
    backgroundColor: colors.primaryLight,
  },
  monthItemText: {
    fontSize: 14,
  },
  monthItemTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  // Daily date picker (inline takvim — yeterli yükseklik)
  datePickerStyle: {
    height: 350,
  },
  doneBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
