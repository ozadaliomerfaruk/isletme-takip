import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { KategoriType, HesapType } from '@/types/database';
import { INCOME_TYPES, EXPENSE_TYPES } from '@/constants/islemTypes';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';

/**
 * HESAP BAZLI gelir/gider raporu — "hangi hesap ne kadar gelir/gider gördü".
 * Kategori raporunun (useCategoryReport) hesaba göre kardeşi. Sunucu-taraflı
 * toplama (get_account_report RPC) kullanır; binlerce satır inmez.
 *
 * NOT: Yalnız BİR HESABA DÜŞEN işlemler gruplanır (RPC hesaba INNER JOIN yapar).
 * Kredili satış (cari_satis, hesabı yok) burada görünmez — semantik olarak doğru,
 * çünkü hangi hesaba düştüğü söylenemez. Bu yüzden hesap toplamı, kategori
 * raporundaki genel gelir toplamından KÜÇÜK olabilir (fark = hesaba düşmeyen gelir).
 */
export interface AccountReportItem {
  hesap: { id: string; name: string; type: HesapType };
  total: number;
  count: number;
  percentage: number;
}

export interface AccountReportResult {
  items: AccountReportItem[];
  totalAmount: number;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
  error: Error | null;
}

interface UseAccountReportOptions {
  startDate: string;
  endDate: string;
}

function normalizeDateRange(startDate?: string, endDate?: string): { startDateTime: string; endDateTime: string } {
  const start = startDate || '';
  const end = endDate || '';
  const startDateTime = start.includes('T') ? start : `${start}T00:00:00`;
  const endDateTime = end.includes('T') ? end : `${end}T23:59:59`;
  return { startDateTime, endDateTime };
}

export function useAccountReport(
  type: KategoriType,
  options: UseAccountReportOptions
): AccountReportResult {
  const { isletme } = useAuthContext();
  const { currency: baseCurrency } = useSettings();
  const { data: ratesData } = useExchangeRates();
  const rates = ratesData?.rates;
  const { startDate, endDate } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  const islemTypes = type === 'gider' ? EXPENSE_TYPES : INCOME_TYPES;

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.reports.accountReport(isletme?.id ?? '', type, startDateTime, endDateTime),
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase.rpc('get_account_report', {
        p_isletme_id: isletme.id,
        p_types: islemTypes as string[],
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) {
        if (__DEV__) console.error('[useAccountReport] RPC error:', error.message, error.code);
        throw error;
      }

      return (data || []) as Array<{
        hesap_id: string;
        hesap_adi: string | null;
        hesap_type: string | null;
        islem_count: number;
        total_amount: number;
      }>;
    },
    enabled: !!isletme && !!startDate && !!endDate,
    meta: { query_purpose: 'reports:account' },
  });

  const result = useMemo(() => {
    // RPC tutarları TRY cinsindendir; ana para birimine çevir (TR için no-op).
    const conv = (v: number) =>
      baseCurrency === 'TRY' ? v : (convertCurrency(v, 'TRY', baseCurrency, rates) ?? v);

    if (!data || data.length === 0) {
      return { items: [] as AccountReportItem[], totalAmount: 0 };
    }

    let totalAmount = 0;
    const rows = data
      .filter((r) => r.hesap_id)
      .map((r) => {
        const total = conv(Number(r.total_amount) || 0);
        totalAmount += total;
        return {
          hesap: {
            id: r.hesap_id,
            name: r.hesap_adi || '—',
            type: (r.hesap_type || 'diger') as HesapType,
          },
          total,
          count: Number(r.islem_count) || 0,
        };
      });

    const items: AccountReportItem[] = rows
      .map((r) => ({
        ...r,
        percentage: totalAmount > 0 ? (r.total / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return { items, totalAmount };
  }, [data, baseCurrency, rates]);

  return {
    ...result,
    isLoading,
    isFetching,
    refetch,
    error: error as Error | null,
  };
}
