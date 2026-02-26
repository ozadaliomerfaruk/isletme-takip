import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet } from 'react-native';
import { GenelTabContent } from '@/components/reports/tabs';
import { useReportRouteState } from '@/hooks/useReportRouteState';
import { colors } from '@/constants/colors';

export default function GenelRaporPage() {
  const state = useReportRouteState();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <GenelTabContent
          dateRange={state.dateRange}
          period={state.period}
          periodOffset={state.periodOffset}
          periodLabel={state.periodLabel}
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
});
