import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import i18n from '@/i18n';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import { roundCurrency } from '@/lib/currency';

/**
 * Tahsis defteri (Faz 2) okuma hook'ları.
 *
 * islem_tahsis PARALEL bir görüntü katmanıdır: cariler.balance tek gerçek kaynak
 * kalır; buradaki veriler yalnız "hangi vadeli borcun ne kadarı kapandı"yı gösterir.
 * Yazma yolu YOK — tahsisler sunucuda atomik RPC'ler içinde (oto-FIFO) yönetilir.
 *
 * Viewer (linkli cari) notu: RLS gereği karşı işletmenin tahsis satırları viewer'a
 * AÇIK DEĞİL → sorgu boş döner; çağıran taraf viewer'da Faz 1 davranışına düşer.
 */

export interface CariTahsisOzeti {
  /** borc_islem_id → Σtahsis (kuruş-yuvarlanmış). Kalan = amount − bu değer. */
  borcTahsisleri: Record<string, number>;
  /** odeme_islem_id → Σtahsis — ödemenin ne kadarı borçlara bağlandı (kalanı avans). */
  odemeTahsisleri: Record<string, number>;
}

const BOS_OZET: CariTahsisOzeti = { borcTahsisleri: {}, odemeTahsisleri: {} };

/**
 * Bir carinin tüm tahsis satırlarını çekip işlem-bazlı toplamlara indirger.
 * Satır sayısı cari başına sınırlıdır (ödeme×borç kesişimi); tek istekte gelir.
 */
export function useCariTahsisOzeti(cariId: string | undefined, enabled = true) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.islemTahsis.byCari(cariId ?? '', isletme?.id ?? ''),
    enabled: enabled && !!cariId && !!isletme?.id,
    queryFn: async (): Promise<CariTahsisOzeti> => {
      if (!cariId || !isletme?.id) return BOS_OZET;

      const { data, error } = await supabase
        .from('islem_tahsis')
        .select('borc_islem_id, odeme_islem_id, tutar')
        .eq('isletme_id', isletme.id)
        .eq('cari_id', cariId);

      if (error) throw error;

      const borcTahsisleri: Record<string, number> = {};
      const odemeTahsisleri: Record<string, number> = {};
      for (const row of data ?? []) {
        const tutar = Number(row.tutar) || 0;
        borcTahsisleri[row.borc_islem_id] = roundCurrency(
          (borcTahsisleri[row.borc_islem_id] ?? 0) + tutar,
        );
        odemeTahsisleri[row.odeme_islem_id] = roundCurrency(
          (odemeTahsisleri[row.odeme_islem_id] ?? 0) + tutar,
        );
      }
      return { borcTahsisleri, odemeTahsisleri };
    },
  });
}

export interface CariVadeliBorc {
  id: string;
  amount: number;
  type: string;
  vade_tarihi: string;
  /** Gecikenler akordiyonunda satır etiketi için (yoksa tip etiketi kullanılır). */
  description: string | null;
}

/**
 * Carinin TÜM vadeli borç işlemleri (sayfalamasız, hafif kolon seti) — başlık V.G.
 * özeti sayfalı işlem listesinden HESAPLANAMAZ (kısmi sayfa yanlış toplam verir).
 */
export function useCariVadeliBorclar(cariId: string | undefined, enabled = true) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.islemTahsis.vadeliBorclar(cariId ?? '', isletme?.id ?? ''),
    enabled: enabled && !!cariId && !!isletme?.id,
    queryFn: async (): Promise<CariVadeliBorc[]> => {
      if (!cariId || !isletme?.id) return [];
      const { data, error } = await supabase
        .from('islemler')
        .select('id, amount, type, vade_tarihi, description')
        .eq('isletme_id', isletme.id)
        .eq('cari_id', cariId)
        .not('vade_tarihi', 'is', null)
        .in('type', ['cari_satis', 'cari_alis']);
      if (error) throw error;
      return (data as CariVadeliBorc[]) ?? [];
    },
  });
}

export interface CariVadeRozet {
  cari_id: string;
  currency: string;
  gecikmis_alacak: number;
  gecikmis_borc: number;
  gecikmis_adet: number;
}

/**
 * Cariler listesi rozetleri: işletme genelinde cari-bazlı gecikmiş kalanlar,
 * TEK istekte (get_cari_vade_rozet RPC). Dönüş: cari_id → rozet map'i.
 */
export function useCariVadeRozet(enabled = true) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.islemTahsis.vadeRozet(isletme?.id ?? ''),
    enabled: enabled && !!isletme?.id,
    queryFn: async (): Promise<Record<string, CariVadeRozet>> => {
      if (!isletme?.id) return {};
      const { data, error } = await supabase.rpc('get_cari_vade_rozet', {
        p_isletme_id: isletme.id,
      });
      if (error) throw error;
      const map: Record<string, CariVadeRozet> = {};
      for (const row of (data as CariVadeRozet[]) ?? []) {
        map[row.cari_id] = {
          ...row,
          gecikmis_alacak: Number(row.gecikmis_alacak) || 0,
          gecikmis_borc: Number(row.gecikmis_borc) || 0,
          gecikmis_adet: Number(row.gecikmis_adet) || 0,
        };
      }
      return map;
    },
  });
}

export interface VadeOzetSatiri {
  currency: string;
  gecikmis_alacak: number | null;
  gecikmis_alacak_adet: number | null;
  gecikmis_borc: number | null;
  gecikmis_borc_adet: number | null;
  yaklasan_alacak: number | null;
  yaklasan_borc: number | null;
}

/** İşletme geneli V.G./yaklaşan vade özeti (para birimi bazında — karışık toplam yok). */
export function useVadeOzet(enabled = true) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.islemTahsis.vadeOzet(isletme?.id ?? ''),
    enabled: enabled && !!isletme?.id,
    queryFn: async (): Promise<VadeOzetSatiri[]> => {
      if (!isletme?.id) return [];
      const { data, error } = await supabase.rpc('get_vade_ozet', {
        p_isletme_id: isletme.id,
      });
      if (error) throw error;
      return (data as VadeOzetSatiri[]) ?? [];
    },
  });
}

/**
 * Bir ödemenin tahsislerini söküp HEDEF BORCA öncelik vererek yeniden dağıtır
 * (retahsis_odeme RPC — Faz 2'nin düzeltme yolu; balance'a DOKUNMAZ).
 * Kullanım: bağlam-hedefli tahsilat — taksit detayındaki "Tahsil Et" ve cari
 * detayındaki satır-swipe "Tahsil Et" o borca/plana gitmeli; genel FIFO carinin
 * BAŞKA borcunun daha eski vadesine kaydırabiliyor (kullanıcı bulgusu, 21 Tem).
 */
export function useRetahsisOdeme() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async ({ odemeIslemId, hedefBorcId }: { odemeIslemId: string; hedefBorcId: string }) => {
      if (!isletme?.id) throw new Error('İşletme bulunamadı');
      const { data, error } = await supabase.rpc('retahsis_odeme', {
        p_isletme_id: isletme.id,
        p_odeme_islem_id: odemeIslemId,
        p_hedef_borc: hedefBorcId,
      });
      if (error) throw error;
      return data as { tahsis_adet: number; avans: number };
    },
    // Retry: retahsis idempotent (tüm tahsisleri söküp yeniden dağıtır) — geçici
    // ağ hatasında sessizce genel-FIFO'da kalmasın diye 2 kez daha denenir.
    retry: 2,
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'islem');
    },
    onError: () => {
      // SESSİZ KALMA (denetim bulgusu): para kaydedildi ama hedefe yönlendirilemedi —
      // genel FIFO'da (carinin en eski vadesinde) kaldı. Kullanıcı bilsin.
      showToast(i18n.t('transactions:vade.hedefTahsisHata'), 'error');
      invalidateRelatedQueries(queryClient, 'islem');
    },
  });
}
