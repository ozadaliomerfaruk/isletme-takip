import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { StokHareket, StokHareketInsert, StokHareketTipi } from '@/types/database';
import { invalidateRelatedQueries, queryKeys } from '@/lib/queryKeys';

/**
 * Bir ürüne ait stok hareketlerini getir
 */
export function useStokHareketler(urunId: string | undefined) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.stokHareketler.byUrun(urunId || '', isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !urunId) return [];

      const { data, error } = await supabase
        .from('stok_hareketler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('urun_id', urunId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as StokHareket[];
    },
    enabled: !!isletme && !!urunId,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

/**
 * Aylık stok özeti (giriş/çıkış toplamları)
 */
export interface AylikStokOzet {
  ay: string; // YYYY-MM formatında
  giris: number;
  cikis: number;
}

export function useAylikStokOzet(urunId: string | undefined) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.stokHareketler.aylikOzet(urunId || '', isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !urunId) return [];

      // Son 12 ayın verilerini al
      const { data, error } = await supabase
        .from('stok_hareketler')
        .select('hareket_tipi, miktar, created_at')
        .eq('isletme_id', isletme.id)
        .eq('urun_id', urunId)
        .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Aylara göre grupla
      const aylikMap = new Map<string, { giris: number; cikis: number }>();

      (data as StokHareket[]).forEach((hareket) => {
        const ay = hareket.created_at.substring(0, 7); // YYYY-MM
        const mevcut = aylikMap.get(ay) || { giris: 0, cikis: 0 };

        if (hareket.hareket_tipi === 'giris') {
          mevcut.giris += Math.abs(hareket.miktar);
        } else if (hareket.hareket_tipi === 'cikis') {
          mevcut.cikis += Math.abs(hareket.miktar);
        }
        // duzeltme için hem giris hem cikis olabilir, miktar işaretine göre
        else if (hareket.hareket_tipi === 'duzeltme') {
          if (hareket.miktar > 0) {
            mevcut.giris += hareket.miktar;
          } else {
            mevcut.cikis += Math.abs(hareket.miktar);
          }
        }

        aylikMap.set(ay, mevcut);
      });

      // Map'i array'e çevir ve sırala (en yeni ay en üstte)
      const sonuc: AylikStokOzet[] = Array.from(aylikMap.entries())
        .map(([ay, degerler]) => ({
          ay,
          giris: degerler.giris,
          cikis: degerler.cikis,
        }))
        .sort((a, b) => b.ay.localeCompare(a.ay));

      return sonuc;
    },
    enabled: !!isletme && !!urunId,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

/**
 * Stok hareketi oluştur (giriş/çıkış/düzeltme)
 * Atomik olarak hem hareket kaydı oluşturur hem de ürün stok miktarını günceller
 */
export function useCreateStokHareket() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: StokHareketInsert) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // 1. Önce mevcut stok miktarını al
      const { data: urun, error: urunError } = await supabase
        .from('urunler')
        .select('miktar')
        .eq('id', input.urun_id)
        .eq('isletme_id', isletme.id)
        .single();

      if (urunError) throw urunError;
      if (!urun) throw new Error('Ürün bulunamadı');

      const oncekiMiktar = urun.miktar;

      // 2. Miktar değişimini hesapla
      let miktarDegisim: number;
      if (input.hareket_tipi === 'giris') {
        miktarDegisim = Math.abs(input.miktar);
      } else if (input.hareket_tipi === 'cikis') {
        miktarDegisim = -Math.abs(input.miktar);
      } else {
        // duzeltme - direkt miktar kullan (pozitif veya negatif olabilir)
        miktarDegisim = input.miktar;
      }

      // 3. Stok miktarını atomik olarak güncelle
      const { data: yeniMiktar, error: rpcError } = await supabase
        .rpc('update_stok_miktar', {
          p_urun_id: input.urun_id,
          p_miktar_degisim: miktarDegisim,
        });

      if (rpcError) throw rpcError;

      // 4. Stok hareketi kaydı oluştur
      const { data: hareket, error: hareketError } = await supabase
        .from('stok_hareketler')
        .insert({
          isletme_id: isletme.id,
          urun_id: input.urun_id,
          hareket_tipi: input.hareket_tipi,
          miktar: input.miktar,
          birim_fiyat: input.birim_fiyat,
          onceki_miktar: oncekiMiktar,
          yeni_miktar: yeniMiktar,
          aciklama: input.aciklama,
        })
        .select()
        .single();

      if (hareketError) throw hareketError;

      return hareket as StokHareket;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'stokHareket');
    },
  });
}
