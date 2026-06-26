import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TabFilter } from '@/components/ui';
import { PeriodNavigator } from './PeriodNavigator';
import { CustomDateRangePicker } from './CustomDateRangePicker';
import type { useReportRouteState } from '@/hooks/useReportRouteState';
import { PeriodType } from '@/hooks/useIslemler';
import { spacing } from '@/constants/spacing';

type ReportRouteState = ReturnType<typeof useReportRouteState>;

interface ReportPeriodBarProps {
  state: ReportRouteState;
  /** 'custom' donem secenegini ve ozel tarih araligi secicisini de goster. */
  includeCustom?: boolean;
  /** Aylık modu takvim-yılı olarak ele al (karşılaştırma sayfası): etiket yıl, sol/sağ yılı değiştirir. */
  monthlyAsYear?: boolean;
}

/**
 * Rapor ekranlarinda standart donem cubugu: donem sekmeleri (TabFilter) +
 * donem navigator'u veya 'custom' secildiyse ozel tarih araligi secicisi.
 * cari/personel (custom'lu) ve karsilastirma (custom'suz) ekranlarinda
 * birebir ayniydi. gelir-gider/alis-satis (navigator ozet sekmeleriyle ayni
 * satirda) ve index (useReportPeriod, farkli yerlesim) bu yapiyi kullanmaz.
 */
export function ReportPeriodBar({ state, includeCustom = false, monthlyAsYear = false }: ReportPeriodBarProps) {
  const { t } = useTranslation(['reports']);

  const periodOptions = [
    { label: t('reports:period.yearly'), value: 'yearly' },
    { label: t('reports:period.monthly'), value: 'monthly' },
    { label: t('reports:period.weekly'), value: 'weekly' },
    { label: t('reports:period.daily'), value: 'daily' },
    ...(includeCustom ? [{ label: t('reports:period.custom'), value: 'custom' }] : []),
  ];

  return (
    <View style={styles.periodFilter}>
      <TabFilter
        options={periodOptions}
        value={state.period}
        onChange={(v) => {
          state.setPeriod(v as PeriodType);
          state.setPeriodOffset(0);
        }}
      />
      {state.period === 'custom' ? (
        <CustomDateRangePicker
          startDate={state.customStartDate}
          endDate={state.customEndDate}
          onChange={(s, e) => {
            state.setCustomStartDate(s);
            state.setCustomEndDate(e);
          }}
          locale={state.locale}
        />
      ) : (
        <PeriodNavigator
          period={state.period}
          periodOffset={state.periodOffset}
          periodLabel={state.periodLabel}
          setPeriodOffset={state.setPeriodOffset}
          monthlyAsYear={monthlyAsYear}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  periodFilter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
});

export default ReportPeriodBar;
