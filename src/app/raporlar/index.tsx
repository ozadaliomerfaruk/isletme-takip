import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, X, Calendar } from 'lucide-react-native';
import { Text, TabFilter, Button } from '@/components/ui';
import { FinanceKPIGrid, TrendChartWidget, CategoryDonutWidget } from '@/widgets/finance';
import { QuickInsights, ExploreGrid } from '@/components/reports';
import { useReportPeriod, type ReportPeriod } from '@/hooks/useReportPeriod';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, shadows } from '@/constants/spacing';
import { useDateFormat } from '@/hooks/useDateFormat';
import { formatDateForDB } from '@/lib/date';
import { useTranslation } from 'react-i18next';

type ReportTab = 'ozet' | 'grafikler';

export default function RaporlarPage() {
  const router = useRouter();
  const { t } = useTranslation(['reports', 'common']);
  const { locale } = useDateFormat();

  // Global persisted period state
  const {
    period,
    periodOffset,
    customStartDate,
    customEndDate,
    widgetPeriod,
    periodLabel,
    dateRange,
    previousDateRange,
    setPeriod,
    setPeriodOffset,
    setCustomDates,
  } = useReportPeriod();

  // Tab state
  const [activeTab, setActiveTab] = useState<ReportTab>('ozet');

  // Custom date pickers
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Quick period picker modals
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
  const [showDailyDatePicker, setShowDailyDatePicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const PERIOD_OPTIONS = [
    { label: t('reports:period.yearly'), value: 'yearly' },
    { label: t('reports:period.monthly'), value: 'monthly' },
    { label: t('reports:period.weekly'), value: 'weekly' },
    { label: t('reports:period.daily'), value: 'daily' },
    { label: t('reports:period.custom'), value: 'custom' },
  ];

  const TAB_OPTIONS = [
    { label: t('reports:tabs.summary', { defaultValue: 'Özet' }), value: 'ozet' },
    { label: t('reports:tabs.charts', { defaultValue: 'Grafikler' }), value: 'grafikler' },
  ];

  // Widget navigation helper
  const handleNavigate = useCallback((route: string, params?: Record<string, string>) => {
    router.push({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pathname: route as any,
      params: {
        period: widgetPeriod,
        periodOffset: String(periodOffset),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        ...params,
      },
    });
  }, [router, widgetPeriod, periodOffset, dateRange]);

  const handleExplorePress = useCallback((route: string) => {
    router.push({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pathname: route as any,
      params: {
        period: widgetPeriod,
        periodOffset: String(periodOffset),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      },
    });
  }, [router, widgetPeriod, periodOffset, dateRange]);

  // Quick period selection
  const handlePeriodLabelPress = () => {
    switch (period) {
      case 'yearly':
        setShowYearPicker(true);
        break;
      case 'monthly':
      case 'weekly': {
        const now = new Date();
        const targetDate = new Date(now.getFullYear(), now.getMonth() + periodOffset, 1);
        setSelectedYear(targetDate.getFullYear());
        setShowMonthYearPicker(true);
        break;
      }
      case 'daily':
        setShowDailyDatePicker(true);
        break;
    }
  };

  const handleDailyDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDailyDatePicker(false);
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

  const getDailyDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + periodOffset);
    return d;
  };

  const goToYear = (year: number) => {
    setPeriodOffset(year - new Date().getFullYear());
    setShowYearPicker(false);
  };

  const goToMonth = (year: number, month: number) => {
    const now = new Date();
    setPeriodOffset((year - now.getFullYear()) * 12 + (month - now.getMonth()));
    setShowMonthYearPicker(false);
  };

  const goToWeekOfMonth = (year: number, month: number) => {
    const now = new Date();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const firstDayOfMonth = new Date(year, month, 1);
    const daysDiff = Math.round((firstDayOfMonth.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));
    setPeriodOffset(Math.floor(daysDiff / 7));
    setShowMonthYearPicker(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* STICKY: Period selector + Content tabs */}
      <View style={styles.stickyHeader}>
        {/* Period type selector */}
        <View style={styles.periodFilter}>
          <TabFilter
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(v) => setPeriod(v as ReportPeriod)}
          />
        </View>

        {/* Period navigator or custom date picker */}
        {period === 'custom' ? (
          <View style={styles.customDateRow}>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setShowStartPicker(true)}
            >
              <Calendar size={14} color={colors.primary} />
              <Text variant="caption">{formatDateForDB(customStartDate)}</Text>
            </TouchableOpacity>
            <Text variant="caption" style={styles.dateSeparator}>-</Text>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setShowEndPicker(true)}
            >
              <Calendar size={14} color={colors.primary} />
              <Text variant="caption">{formatDateForDB(customEndDate)}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.periodNavigator}>
            <TouchableOpacity
              style={styles.periodNavButton}
              onPress={() => setPeriodOffset(periodOffset - 1)}
            >
              <ChevronLeft size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePeriodLabelPress}
              style={styles.periodLabelButton}
              activeOpacity={0.7}
            >
              <Text variant="body" style={styles.periodLabel}>
                {periodLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.periodNavButton}
              onPress={() => setPeriodOffset(periodOffset + 1)}
            >
              <ChevronRight size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        )}

        {/* Content tab selector */}
        <View style={styles.contentTabRow}>
          <TabFilter
            options={TAB_OPTIONS}
            value={activeTab}
            onChange={(v) => setActiveTab(v as ReportTab)}
          />
        </View>
      </View>

      {/* SCROLLABLE: Tab content */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {activeTab === 'ozet' ? (
          <>
            {/* KPI Grid */}
            <View style={styles.widgetSection}>
              <FinanceKPIGrid
                period={widgetPeriod}
                dateRange={dateRange}
                previousDateRange={previousDateRange}
                onNavigate={handleNavigate}
              />
            </View>

            {/* Quick Insights */}
            <QuickInsights dateRange={dateRange} />

            {/* Explore Grid */}
            <ExploreGrid onPress={handleExplorePress} />
          </>
        ) : (
          <>
            {/* Trend Chart */}
            <View style={styles.widgetSection}>
              <TrendChartWidget
                period={widgetPeriod}
                dateRange={dateRange}
                previousDateRange={previousDateRange}
                onNavigate={handleNavigate}
              />
            </View>

            {/* Category Donut */}
            <View style={styles.widgetSection}>
              <CategoryDonutWidget
                period={widgetPeriod}
                dateRange={dateRange}
                previousDateRange={previousDateRange}
                onNavigate={handleNavigate}
              />
            </View>
          </>
        )}

        {/* Bottom spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Year Picker Modal */}
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
                    year === new Date().getFullYear() + periodOffset && styles.yearPickerItemActive,
                  ]}
                  onPress={() => goToYear(year)}
                >
                  <Text
                    variant="body"
                    style={[
                      styles.yearPickerText,
                      year === new Date().getFullYear() + periodOffset && styles.yearPickerTextActive,
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

      {/* Month + Year Picker Modal */}
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
                const now = new Date();
                const isCurrentMonth = selectedYear === now.getFullYear() && i === now.getMonth();
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

      {/* Custom Date Pickers - iOS */}
      {Platform.OS === 'ios' && (showStartPicker || showEndPicker) && (
        <Modal visible={showStartPicker || showEndPicker} transparent animationType="slide">
          <Pressable
            style={styles.pickerModalOverlay}
            onPress={() => { setShowStartPicker(false); setShowEndPicker(false); }}
          >
            <Pressable style={styles.pickerModalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.pickerModalHeader}>
                <Text variant="h3">
                  {showStartPicker ? t('reports:period.startDateTitle') : t('reports:period.endDateTitle')}
                </Text>
                <TouchableOpacity onPress={() => { setShowStartPicker(false); setShowEndPicker(false); }}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={{ alignItems: 'center' }}>
                <DateTimePicker
                  value={showStartPicker ? customStartDate : customEndDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  themeVariant="light"
                  accentColor={colors.primary}
                  locale={locale}
                  style={{ height: 350 }}
                  onChange={(_, date) => {
                    if (date) {
                      if (showStartPicker) {
                        const newEnd = date > customEndDate ? date : customEndDate;
                        setCustomDates(date, newEnd);
                      } else {
                        setCustomDates(customStartDate, date);
                      }
                    }
                  }}
                  minimumDate={showEndPicker ? customStartDate : undefined}
                  maximumDate={new Date()}
                />
              </View>
              <Button variant="primary" onPress={() => { setShowStartPicker(false); setShowEndPicker(false); }}>
                {t('common:buttons.ok')}
              </Button>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Custom Date Pickers - Android */}
      {Platform.OS === 'android' && showStartPicker && (
        <DateTimePicker
          value={customStartDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowStartPicker(false);
            if (event.type === 'set' && date) {
              const newEnd = date > customEndDate ? date : customEndDate;
              setCustomDates(date, newEnd);
            }
          }}
          maximumDate={new Date()}
        />
      )}
      {Platform.OS === 'android' && showEndPicker && (
        <DateTimePicker
          value={customEndDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowEndPicker(false);
            if (event.type === 'set' && date) {
              setCustomDates(customStartDate, date);
            }
          }}
          minimumDate={customStartDate}
          maximumDate={new Date()}
        />
      )}

      {/* Daily Date Picker - Android */}
      {Platform.OS === 'android' && showDailyDatePicker && (
        <DateTimePicker
          value={getDailyDate()}
          mode="date"
          display="default"
          onChange={handleDailyDateChange}
          locale={locale}
        />
      )}

      {/* Daily Date Picker - iOS */}
      {Platform.OS === 'ios' && showDailyDatePicker && (
        <Modal visible transparent animationType="fade">
          <Pressable
            style={styles.pickerModalOverlay}
            onPress={() => setShowDailyDatePicker(false)}
          >
            <Pressable style={styles.pickerModalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.pickerModalHeader}>
                <Text variant="h3">{t('common:date.selectDate')}</Text>
                <TouchableOpacity onPress={() => setShowDailyDatePicker(false)}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={{ alignItems: 'center' }}>
                <DateTimePicker
                  value={getDailyDate()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  themeVariant="light"
                  accentColor={colors.primary}
                  locale={locale}
                  style={{ height: 350 }}
                  onChange={handleDailyDateChange}
                />
              </View>
              <Button variant="primary" onPress={() => setShowDailyDatePicker(false)}>
                {t('common:buttons.ok')}
              </Button>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  stickyHeader: {
    backgroundColor: colors.background,
    paddingBottom: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    ...shadows.sm,
  },
  periodFilter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  periodNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  periodNavButton: {
    padding: spacing.xs,
  },
  periodLabelButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
  },
  periodLabel: {
    minWidth: 150,
    textAlign: 'center',
    fontSize: 14,
  },
  customDateRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
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
  contentTabRow: {
    paddingHorizontal: spacing.lg,
  },
  scrollView: {
    flex: 1,
  },
  widgetSection: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
  // Period picker modals
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
});
