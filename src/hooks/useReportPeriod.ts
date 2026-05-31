/**
 * useReportPeriod Hook
 *
 * Manages report period state globally with AsyncStorage persistence.
 * Same pattern as useSettings.ts: global variable + listeners + AsyncStorage.
 * Period selection survives page navigation and app restarts.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDateFormat } from './useDateFormat';
import { formatDateForDB, ensureValidDate } from '@/lib/date';
import type { AnalyticsPeriod, DateRange } from '@/types/analytics';

export type ReportPeriod = AnalyticsPeriod | 'custom';

const STORAGE_KEY = '@defter_report_period';

interface PersistedState {
  period: ReportPeriod;
  periodOffset: number;
  customStartDate?: string;
  customEndDate?: string;
}

// Global state shared between hook instances
let globalPeriod: ReportPeriod = 'monthly';
let globalOffset: number = 0;
let globalCustomStart: Date = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; })();
let globalCustomEnd: Date = new Date();
let isInitialized = false;
const listeners: Set<() => void> = new Set();

function notifyListeners() {
  const snapshot = Array.from(listeners);
  snapshot.forEach((listener) => listener());
}

async function initializeState() {
  if (isInitialized) return;

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    let needsRepair = false;
    if (stored) {
      const parsed: PersistedState = JSON.parse(stored);
      if (['daily', 'weekly', 'monthly', 'yearly', 'custom'].includes(parsed.period)) {
        globalPeriod = parsed.period;
      }
      if (typeof parsed.periodOffset === 'number') {
        globalOffset = parsed.periodOffset;
      }
      // Geçmişte 'NaN-NaN-NaN' veya '1970-01-01' gibi bozuk bir değer kalıcılaşmış
      // olabilir (yapışan 1970 hatası). Bunlar tespit edilince güvenli varsayılanı
      // koru ve bozuk kaydı yeniden yazarak ONAR — böylece zaten etkilenmiş kullanıcı
      // güncelleme sonrası kendiliğinden düzelir. Rapor için 1971 öncesi geçerli özel
      // tarih yoktur, bu yüzden year<1971 bozuk kabul edilir.
      const isBadStored = (s: string): boolean => {
        const d = new Date(s + 'T00:00:00');
        return isNaN(d.getTime()) || d.getFullYear() < 1971;
      };
      if (parsed.customStartDate) {
        if (isBadStored(parsed.customStartDate)) {
          needsRepair = true;
        } else {
          globalCustomStart = ensureValidDate(new Date(parsed.customStartDate + 'T00:00:00'));
        }
      }
      if (parsed.customEndDate) {
        if (isBadStored(parsed.customEndDate)) {
          needsRepair = true;
        } else {
          globalCustomEnd = ensureValidDate(new Date(parsed.customEndDate + 'T00:00:00'));
        }
      }
    }
    isInitialized = true;
    // Bozuk değer tespit edildiyse güvenli değerlerle üzerine yaz (kendini onarma)
    if (needsRepair) {
      persistState();
    }
    notifyListeners();
  } catch {
    isInitialized = true;
  }
}

async function persistState() {
  try {
    // ensureValidDate + (artık guard'lı) formatDateForDB ile asla 'NaN-NaN-NaN' yazılmaz
    const state: PersistedState = {
      period: globalPeriod,
      periodOffset: globalOffset,
      customStartDate: formatDateForDB(ensureValidDate(globalCustomStart)),
      customEndDate: formatDateForDB(ensureValidDate(globalCustomEnd)),
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Silent fail
  }
}

/**
 * Hook for managing report period state globally.
 * Persists across navigation and app restarts.
 */
export function useReportPeriod() {
  const { getDateRangeLabel } = useDateFormat();

  const [period, setPeriodState] = useState<ReportPeriod>(globalPeriod);
  const [periodOffset, setOffsetState] = useState(globalOffset);
  const [customStartDate, setCustomStartState] = useState(globalCustomStart);
  const [customEndDate, setCustomEndState] = useState(globalCustomEnd);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!isInitialized) await initializeState();
      if (mounted) {
        setPeriodState(globalPeriod);
        setOffsetState(globalOffset);
        setCustomStartState(globalCustomStart);
        setCustomEndState(globalCustomEnd);
      }
    };

    load();

    const listener = () => {
      if (mounted) {
        setPeriodState(globalPeriod);
        setOffsetState(globalOffset);
        setCustomStartState(globalCustomStart);
        setCustomEndState(globalCustomEnd);
      }
    };
    listeners.add(listener);

    return () => {
      mounted = false;
      listeners.delete(listener);
    };
  }, []);

  const setPeriod = useCallback((p: ReportPeriod) => {
    globalPeriod = p;
    globalOffset = 0;
    notifyListeners();
    persistState();
  }, []);

  const setPeriodOffset = useCallback((offset: number | ((prev: number) => number)) => {
    if (typeof offset === 'function') {
      globalOffset = offset(globalOffset);
    } else {
      globalOffset = offset;
    }
    notifyListeners();
    persistState();
  }, []);

  const setCustomDates = useCallback((start: Date, end: Date) => {
    // Geçersiz tarihlerin global duruma sızmasını en baştan engelle
    globalCustomStart = ensureValidDate(start);
    globalCustomEnd = ensureValidDate(end);
    notifyListeners();
    persistState();
  }, []);

  const widgetPeriod: AnalyticsPeriod = period === 'custom' ? 'monthly' : period as AnalyticsPeriod;

  const customRange = period === 'custom' ? {
    startDate: formatDateForDB(customStartDate),
    endDate: formatDateForDB(customEndDate),
  } : undefined;

  const { startDate, endDate, label: periodLabel } = getDateRangeLabel(
    period === 'custom' ? 'monthly' : period,
    period === 'custom' ? 0 : periodOffset,
    customRange,
  );

  const dateRange = useMemo<DateRange>(
    () => period === 'custom'
      ? { startDate: formatDateForDB(customStartDate), endDate: formatDateForDB(customEndDate) }
      : { startDate, endDate },
    [period, startDate, endDate, customStartDate, customEndDate]
  );

  const previousDateRange = useMemo<DateRange>(() => {
    if (period === 'custom') {
      const durationMs = customEndDate.getTime() - customStartDate.getTime();
      const prevEnd = new Date(customStartDate.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - durationMs);
      return { startDate: formatDateForDB(prevStart), endDate: formatDateForDB(prevEnd) };
    }
    const prev = getDateRangeLabel(period, periodOffset - 1);
    return { startDate: prev.startDate, endDate: prev.endDate };
  }, [period, periodOffset, getDateRangeLabel, customStartDate, customEndDate]);

  return {
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
  };
}

// Initialize when module loads
initializeState();
