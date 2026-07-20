import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { roundCurrency } from '@/lib/currency';

/**
 * Taksit (Faz 3) okuma hook'ları. Yazma yolu QTB → taksit_plani_olustur RPC
 * (useCreateIslemTaksitli); burada yalnız liste/detay okunur. Tüm "ödenen/kalan"
 * değerleri tahsis defterinden türer — balance'a hiçbir katkısı yoktur.
 */

export interface TaksitPlanOzet {
  plan_id: string;
  islem_id: string;
  cari_id: string;
  cari_name: string;
  currency: string;
  type: 'cari_satis' | 'cari_alis';
  islem_date: string;
  toplam: number;
  taksit_adedi: number;
  odenen: number;
  odenen_taksit_adedi: number;
  sonraki_vade: string | null;
  gecikmis_adet: number;
}

export function useTaksitPlanListesi(enabled = true) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.taksit.list(isletme?.id ?? ''),
    enabled: enabled && !!isletme?.id,
    queryFn: async (): Promise<TaksitPlanOzet[]> => {
      if (!isletme?.id) return [];
      const { data, error } = await supabase.rpc('get_taksit_plan_listesi', {
        p_isletme_id: isletme.id,
      });
      if (error) throw error;
      return ((data as TaksitPlanOzet[]) ?? []).map((r) => ({
        ...r,
        toplam: Number(r.toplam) || 0,
        odenen: Number(r.odenen) || 0,
        taksit_adedi: Number(r.taksit_adedi) || 0,
        odenen_taksit_adedi: Number(r.odenen_taksit_adedi) || 0,
        gecikmis_adet: Number(r.gecikmis_adet) || 0,
      }));
    },
  });
}

export interface TaksitSatirDetay {
  id: string;
  sira: number;
  vade_tarihi: string;
  tutar: number;
  odenen: number;
  kalan: number;
}

export interface TaksitPlanDetay {
  planId: string;
  islemId: string;
  taksitler: TaksitSatirDetay[];
}

/** Plan detayı: taksit satırları + taksit-bazlı tahsis toplamlarından kalanlar. */
export function useTaksitPlanDetay(planId: string | undefined) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.taksit.detay(planId ?? '', isletme?.id ?? ''),
    enabled: !!planId && !!isletme?.id,
    queryFn: async (): Promise<TaksitPlanDetay | null> => {
      if (!planId || !isletme?.id) return null;

      const { data: taksitler, error } = await supabase
        .from('taksitler')
        .select('id, islem_id, sira, vade_tarihi, tutar')
        .eq('plan_id', planId)
        .eq('isletme_id', isletme.id)
        .order('sira', { ascending: true });
      if (error) throw error;
      if (!taksitler || taksitler.length === 0) return null;

      const islemId = taksitler[0].islem_id as string;
      const { data: tahsisler, error: tErr } = await supabase
        .from('islem_tahsis')
        .select('taksit_id, tutar')
        .eq('isletme_id', isletme.id)
        .eq('borc_islem_id', islemId);
      if (tErr) throw tErr;

      const odenenMap: Record<string, number> = {};
      for (const t of tahsisler ?? []) {
        if (!t.taksit_id) continue;
        odenenMap[t.taksit_id] = roundCurrency((odenenMap[t.taksit_id] ?? 0) + (Number(t.tutar) || 0));
      }

      return {
        planId,
        islemId,
        taksitler: taksitler.map((tk) => {
          const tutar = Number(tk.tutar) || 0;
          const odenen = odenenMap[tk.id] ?? 0;
          return {
            id: tk.id,
            sira: tk.sira,
            vade_tarihi: String(tk.vade_tarihi),
            tutar,
            odenen,
            kalan: Math.max(0, roundCurrency(tutar - odenen)),
          };
        }),
      };
    },
  });
}
