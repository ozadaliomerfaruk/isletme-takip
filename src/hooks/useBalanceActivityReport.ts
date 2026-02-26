import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';

export interface BalanceActivityItem {
  id: string;
  name: string;
  type: 'musteri' | 'tedarikci';
  balance: number;
  currency: string | null;
  color: string | null;
  last_transaction_date: string | null;
  days_since_last_tx: number | null;
}

export interface BalanceActivitySummary {
  total_receivables: number;
  total_payables: number;
  receivable_count: number;
  payable_count: number;
}

interface BalanceActivityReport {
  items: BalanceActivityItem[];
  summary: BalanceActivitySummary;
}

export function useBalanceActivityReport() {
  const { isletme } = useAuthContext();

  const query = useQuery({
    queryKey: ['balance-activity-report', isletme?.id],
    queryFn: async (): Promise<BalanceActivityReport> => {
      if (!isletme) return { items: [], summary: { total_receivables: 0, total_payables: 0, receivable_count: 0, payable_count: 0 } };

      const { data, error } = await supabase.rpc('get_balance_activity_report', {
        p_isletme_id: isletme.id,
      });

      if (error) throw error;
      return data as BalanceActivityReport;
    },
    enabled: !!isletme,
  });

  const receivables = (query.data?.items ?? []).filter((item) => item.balance > 0);
  const payables = (query.data?.items ?? []).filter((item) => item.balance < 0);

  return {
    receivables,
    payables,
    summary: query.data?.summary ?? { total_receivables: 0, total_payables: 0, receivable_count: 0, payable_count: 0 },
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
