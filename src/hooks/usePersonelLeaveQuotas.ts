import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';

interface LeaveQuota {
  hakEdilen: number;
  kullanilan: number;
  kalan: number;
}

export type LeaveQuotaMap = Record<string, LeaveQuota>;

/**
 * Tüm personelin izin kotalarını tek sorguda getirir.
 * personel_izin_hakki ve personel_izin_kullanimi işlemlerini toplar.
 */
export function usePersonelLeaveQuotas() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['personel-leave-quotas', isletme?.id],
    queryFn: async (): Promise<LeaveQuotaMap> => {
      if (!isletme) return {};

      const { data, error } = await supabase
        .from('islemler')
        .select('personel_id, type, amount')
        .eq('isletme_id', isletme.id)
        .in('type', ['personel_izin_hakki', 'personel_izin_kullanimi'])
        .not('personel_id', 'is', null);

      if (error) throw error;

      const quotaMap: LeaveQuotaMap = {};

      for (const row of data ?? []) {
        if (!row.personel_id) continue;
        if (!quotaMap[row.personel_id]) {
          quotaMap[row.personel_id] = { hakEdilen: 0, kullanilan: 0, kalan: 0 };
        }
        const amount = Number(row.amount) || 0;
        if (row.type === 'personel_izin_hakki') {
          quotaMap[row.personel_id].hakEdilen += amount;
        } else if (row.type === 'personel_izin_kullanimi') {
          quotaMap[row.personel_id].kullanilan += amount;
        }
      }

      // kalan hesapla
      for (const key of Object.keys(quotaMap)) {
        quotaMap[key].kalan = quotaMap[key].hakEdilen - quotaMap[key].kullanilan;
      }

      return quotaMap;
    },
    enabled: !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
