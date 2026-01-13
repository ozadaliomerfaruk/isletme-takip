import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  AnalyticsContextValue,
  AnalyticsPeriod,
  DateRange,
} from '@/types/analytics';
import { getDateRange as getDateRangeUtil, getPreviousDateRange as getPreviousDateRangeUtil } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';

const HIDDEN_WIDGETS_KEY = '@analytics_hidden_widgets';

// Default values
const defaultContext: AnalyticsContextValue = {
  period: 'monthly',
  setPeriod: () => {},
  periodOffset: 0,
  setPeriodOffset: () => {},
  periodLabel: '',
  dateRange: { startDate: '', endDate: '' },
  previousDateRange: { startDate: '', endDate: '' },
  userRole: 'owner',
  activeModules: ['finance'], // Finance is always active
  hiddenWidgets: [],
  toggleWidgetVisibility: () => {},
  refreshKey: 0,
  refresh: () => {},
  navigate: () => {},
};

const AnalyticsContext = createContext<AnalyticsContextValue>(defaultContext);

interface AnalyticsProviderProps {
  children: React.ReactNode;
}

export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  const router = useRouter();
  const { getDateRangeLabel } = useDateFormat();
  const [period, setPeriodState] = useState<AnalyticsPeriod>('monthly');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Reset offset when period changes
  const setPeriod = useCallback((newPeriod: AnalyticsPeriod) => {
    setPeriodState(newPeriod);
    setPeriodOffset(0);
  }, []);

  // Load hidden widgets from storage on mount
  React.useEffect(() => {
    const loadHiddenWidgets = async () => {
      try {
        const stored = await AsyncStorage.getItem(HIDDEN_WIDGETS_KEY);
        if (stored) {
          setHiddenWidgets(JSON.parse(stored));
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('Failed to load hidden widgets:', error);
        }
      }
    };
    loadHiddenWidgets();
  }, []);

  // Calculate date ranges and label based on period and offset
  const { dateRange, periodLabel } = useMemo(() => {
    const { startDate, endDate, label } = getDateRangeLabel(period, periodOffset);
    return {
      dateRange: { startDate, endDate },
      periodLabel: label,
    };
  }, [period, periodOffset, getDateRangeLabel]);

  const previousDateRange = useMemo<DateRange>(() => {
    return getPreviousDateRangeUtil(period);
  }, [period]);

  // Toggle widget visibility
  const toggleWidgetVisibility = useCallback(async (widgetId: string) => {
    setHiddenWidgets(prev => {
      const newHidden = prev.includes(widgetId)
        ? prev.filter(id => id !== widgetId)
        : [...prev, widgetId];

      // Persist to storage
      AsyncStorage.setItem(HIDDEN_WIDGETS_KEY, JSON.stringify(newHidden)).catch(error => {
        if (__DEV__) {
          console.warn('Failed to save hidden widgets:', error);
        }
      });

      return newHidden;
    });
  }, []);

  // Refresh all data
  const refresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // Navigation helper
  const navigate = useCallback((route: string, params?: Record<string, string>) => {
    if (params) {
      router.push({ pathname: route as any, params });
    } else {
      router.push(route as any);
    }
  }, [router]);

  const value = useMemo<AnalyticsContextValue>(() => ({
    period,
    setPeriod,
    periodOffset,
    setPeriodOffset,
    periodLabel,
    dateRange,
    previousDateRange,
    userRole: 'owner', // TODO: Get from auth context when multi-user is implemented
    activeModules: ['finance'], // TODO: Get from business settings
    hiddenWidgets,
    toggleWidgetVisibility,
    refreshKey,
    refresh,
    navigate,
  }), [
    period,
    setPeriod,
    periodOffset,
    periodLabel,
    dateRange,
    previousDateRange,
    hiddenWidgets,
    toggleWidgetVisibility,
    refreshKey,
    refresh,
    navigate,
  ]);

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics(): AnalyticsContextValue {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
}

export { AnalyticsContext };
