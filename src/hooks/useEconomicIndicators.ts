import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';

/**
 * ekonomik_gostergeler: aylık USD/EUR/gram-altın/TÜFE referans serisi (kiracıdan bağımsız,
 * herkes okur). Net-varlık trendini reel/döviz/altın cinsine çevirmek (repricing) için.
 */
export interface EconomicIndicatorRow {
  ay: string; // 'YYYY-MM-DD'
  usd_try: number | null;
  eur_try: number | null;
  gram_altin_try: number | null;
  tufe: number | null;
}

export interface EconomicIndicators {
  byMonth: Map<string, EconomicIndicatorRow>; // 'YYYY-MM' → satır
  latestTufe: number | null; // en son yayımlanan TÜFE ("bugünün lirası" paydası)
}

/**
 * Verilen ay penceresi için göstergeleri çeker. startMonth/endMonth 'YYYY-MM-01'.
 * Not: TÜFE ~1 ay gecikmeli yayımlandığından son ay(lar) NULL olabilir → latestTufe
 * en son DOLU TÜFE'yi verir (reel repricing paydası).
 */
export function useEconomicIndicators(startMonth: string, endMonth: string): {
  data: EconomicIndicators | undefined;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.reports.economicIndicators(startMonth, endMonth),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ekonomik_gostergeler')
        .select('ay, usd_try, eur_try, gram_altin_try, tufe')
        .gte('ay', startMonth)
        .lte('ay', endMonth)
        .order('ay', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EconomicIndicatorRow[];
    },
    enabled: !!startMonth && !!endMonth,
    staleTime: 12 * 60 * 60 * 1000, // 12 saat — aylık veri, sık değişmez
  });

  const data = useMemo<EconomicIndicators | undefined>(() => {
    if (!query.data) return undefined;
    const byMonth = new Map<string, EconomicIndicatorRow>();
    let latestTufe: number | null = null;
    for (const r of query.data) {
      const key = String(r.ay).slice(0, 7); // 'YYYY-MM'
      byMonth.set(key, r);
      if (r.tufe != null) latestTufe = r.tufe; // ascending → sonuncusu en yeni
    }
    return { byMonth, latestTufe };
  }, [query.data]);

  return { data, isLoading: query.isLoading };
}
