import type { PeriodType } from '@/hooks/useIslemler';

export interface TabContentProps {
  dateRange: { startDate: string; endDate: string };
  period: PeriodType;
  periodOffset: number;
  periodLabel: string;
}
