import { SafeAreaView } from 'react-native-safe-area-context';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter } from '@/components/ui';
import { PersonelTabContent } from '@/components/reports/tabs';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { PeriodType } from '@/hooks/useIslemler';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

export default function PersonelRaporPage() {
  const { t } = useTranslation(['reports']);
  const { personelId } = useLocalSearchParams<{ personelId?: string }>();
  const state = useReportRouteState();

  const PERIOD_OPTIONS = [
    { label: t('reports:period.yearly'), value: 'yearly' },
    { label: t('reports:period.monthly'), value: 'monthly' },
    { label: t('reports:period.weekly'), value: 'weekly' },
    { label: t('reports:period.daily'), value: 'daily' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.periodFilter}>
          <TabFilter
            options={PERIOD_OPTIONS}
            value={state.period}
            onChange={(v) => {
              state.setPeriod(v as PeriodType);
              state.setPeriodOffset(0);
            }}
          />
          <View style={styles.periodNavigator}>
            <TouchableOpacity
              style={styles.periodNavButton}
              onPress={() => state.setPeriodOffset(state.periodOffset - 1)}
            >
              <ChevronLeft size={20} color={colors.text} />
            </TouchableOpacity>
            <Text variant="body" style={styles.periodLabel}>
              {state.periodLabel}
            </Text>
            <TouchableOpacity
              style={styles.periodNavButton}
              onPress={() => state.setPeriodOffset(state.periodOffset + 1)}
            >
              <ChevronRight size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <PersonelTabContent
          dateRange={state.dateRange}
          period={state.period}
          periodOffset={state.periodOffset}
          periodLabel={state.periodLabel}
          initialPersonelId={personelId}
        />
      </ScrollView>
    </SafeAreaView>
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
  periodNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  periodNavButton: {
    padding: spacing.sm,
  },
  periodLabel: {
    minWidth: 150,
    textAlign: 'center',
  },
});
