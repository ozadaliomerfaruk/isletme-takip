import { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, ScrollView, StyleSheet, TouchableOpacity, Modal, Pressable, Platform, RefreshControl } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams } from 'expo-router';
import { Calendar, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { TabFilter, Button } from '@/components/ui';
import { Text } from '@/components/ui';
import { CariTabContent } from '@/components/reports/tabs';
import { PeriodNavigator } from '@/components/reports/PeriodNavigator';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { PeriodType } from '@/hooks/useIslemler';
import { formatDateForDB } from '@/lib/date';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { usePagePermission } from '@/hooks/usePagePermission';
import { useQueryClient } from '@tanstack/react-query';

export default function CariRaporPage() {
  usePagePermission({ module: 'raporlar' });
  const { t } = useTranslation(['reports', 'common']);
  const { cariId } = useLocalSearchParams<{ cariId?: string }>();
  const state = useReportRouteState();
  const queryClient = useQueryClient();

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  const PERIOD_OPTIONS = [
    { label: t('reports:period.yearly'), value: 'yearly' },
    { label: t('reports:period.monthly'), value: 'monthly' },
    { label: t('reports:period.weekly'), value: 'weekly' },
    { label: t('reports:period.daily'), value: 'daily' },
    { label: t('reports:period.custom'), value: 'custom' },
  ];

  return (
    <>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          <View style={styles.periodFilter}>
            <TabFilter
              options={PERIOD_OPTIONS}
              value={state.period}
              onChange={(v) => {
                state.setPeriod(v as PeriodType);
                state.setPeriodOffset(0);
              }}
            />
            {state.period === 'custom' ? (
              <View style={styles.customDateRow}>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowStartPicker(true)}
                >
                  <Calendar size={14} color={colors.primary} />
                  <Text variant="caption">{formatDateForDB(state.customStartDate)}</Text>
                </TouchableOpacity>
                <Text variant="caption" style={styles.dateSeparator}>-</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowEndPicker(true)}
                >
                  <Calendar size={14} color={colors.primary} />
                  <Text variant="caption">{formatDateForDB(state.customEndDate)}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <PeriodNavigator
                period={state.period}
                periodOffset={state.periodOffset}
                periodLabel={state.periodLabel}
                setPeriodOffset={state.setPeriodOffset}
              />
            )}
          </View>

          <CariTabContent
            dateRange={state.dateRange}
            period={state.period}
            periodOffset={state.periodOffset}
            periodLabel={state.periodLabel}
            initialCariId={cariId}
          />
        </ScrollView>
      </SafeAreaView>

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
                  value={showStartPicker ? state.customStartDate : state.customEndDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  themeVariant="light"
                  accentColor={colors.primary}
                  locale={state.locale}
                  style={{ height: 350 }}
                  onChange={(_, date) => {
                    if (date) {
                      if (showStartPicker) {
                        const newEnd = date > state.customEndDate ? date : state.customEndDate;
                        state.setCustomStartDate(date);
                        state.setCustomEndDate(newEnd);
                      } else {
                        state.setCustomEndDate(date);
                      }
                    }
                  }}
                  minimumDate={showEndPicker ? state.customStartDate : undefined}
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
          value={state.customStartDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowStartPicker(false);
            if (event.type === 'set' && date) {
              const newEnd = date > state.customEndDate ? date : state.customEndDate;
              state.setCustomStartDate(date);
              state.setCustomEndDate(newEnd);
            }
          }}
          maximumDate={new Date()}
        />
      )}
      {Platform.OS === 'android' && showEndPicker && (
        <DateTimePicker
          value={state.customEndDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowEndPicker(false);
            if (event.type === 'set' && date) {
              state.setCustomEndDate(date);
            }
          }}
          minimumDate={state.customStartDate}
          maximumDate={new Date()}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  periodFilter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
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
