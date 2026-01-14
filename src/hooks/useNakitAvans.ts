import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import {
  NakitAvans,
  NakitAvansInsert,
  NakitAvansUpdate,
  NakitAvansWithRelations,
  NakitAvansTaksit,
  NakitAvansTaksitInsert,
  NakitAvansTaksitUpdate,
} from '@/types/database';

/**
 * Bir kredi kartına ait nakit avansları getir
 */
export function useNakitAvanslarByKrediKarti(krediKartiId: string | undefined) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.nakitAvanslar.byKrediKarti(krediKartiId || '', isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !krediKartiId) return [];

      const { data, error } = await supabase
        .from('nakit_avanslar')
        .select(`
          *,
          kredi_karti:hesaplar!kredi_karti_id(*),
          hedef_hesap:hesaplar!hedef_hesap_id(*),
          kategori:kategoriler(*),
          taksitler:nakit_avans_taksitler(*)
        `)
        .eq('isletme_id', isletme.id)
        .eq('kredi_karti_id', krediKartiId)
        .order('tarih', { ascending: false });

      if (error) throw error;

      // Normalize data
      return (data || []).map((item: any) => ({
        ...item,
        kredi_karti: Array.isArray(item.kredi_karti) ? item.kredi_karti[0] || null : item.kredi_karti,
        hedef_hesap: Array.isArray(item.hedef_hesap) ? item.hedef_hesap[0] || null : item.hedef_hesap,
        kategori: Array.isArray(item.kategori) ? item.kategori[0] || null : item.kategori,
        taksitler: item.taksitler || [],
      })) as NakitAvansWithRelations[];
    },
    enabled: !!isletme && !!krediKartiId,
  });
}

/**
 * Tek bir nakit avans getir
 */
export function useNakitAvans(id: string | undefined) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.nakitAvanslar.detail(id || ''),
    queryFn: async () => {
      if (!isletme || !id) return null;

      const { data, error } = await supabase
        .from('nakit_avanslar')
        .select(`
          *,
          kredi_karti:hesaplar!kredi_karti_id(*),
          hedef_hesap:hesaplar!hedef_hesap_id(*),
          kategori:kategoriler(*),
          taksitler:nakit_avans_taksitler(*)
        `)
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (error) throw error;

      // Normalize data
      return {
        ...data,
        kredi_karti: Array.isArray(data.kredi_karti) ? data.kredi_karti[0] || null : data.kredi_karti,
        hedef_hesap: Array.isArray(data.hedef_hesap) ? data.hedef_hesap[0] || null : data.hedef_hesap,
        kategori: Array.isArray(data.kategori) ? data.kategori[0] || null : data.kategori,
        taksitler: data.taksitler || [],
      } as NakitAvansWithRelations;
    },
    enabled: !!isletme && !!id,
  });
}

/**
 * Nakit avans oluştur
 * Atomik RPC kullanır - tüm bakiye güncellemeleri tek transaction içinde yapılır
 */
export function useCreateNakitAvans() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Omit<NakitAvansInsert, 'isletme_id'> & { taksitler?: Omit<NakitAvansTaksitInsert, 'nakit_avans_id'>[] }) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { taksitler, ...avansData } = data;

      // 1. Atomik RPC ile nakit avans oluştur (bakiye güncellemeleri dahil)
      const { data: avansId, error: rpcError } = await supabase.rpc('perform_nakit_avans', {
        p_isletme_id: isletme.id,
        p_kredi_karti_id: data.kredi_karti_id,
        p_hedef_hesap_id: data.hedef_hesap_id,
        p_tutar: data.tutar,
        p_geri_odeme_tutari: data.geri_odeme_tutari,
        p_kategori_id: data.kategori_id || null,
        p_aciklama: data.aciklama || null,
        p_tarih: data.tarih || new Date().toISOString(),
        p_is_taksitli: data.is_taksitli || false,
        p_taksit_sayisi: data.taksit_sayisi || 1,
      });

      if (rpcError) throw rpcError;
      if (!avansId) throw new Error('Nakit avans oluşturulamadı');

      // 2. Taksitler varsa ekle ve her taksit için kredi kartı ekstresine işlem yaz
      if (taksitler && taksitler.length > 0) {
        const taksitlerWithAvansId = taksitler.map((t) => ({
          ...t,
          nakit_avans_id: avansId,
        }));

        const { data: createdTaksitler, error: taksitError } = await supabase
          .from('nakit_avans_taksitler')
          .insert(taksitlerWithAvansId)
          .select();

        if (taksitError) throw taksitError;

        // Her taksit için kredi kartı ekstresine işlem ekle
        if (createdTaksitler && createdTaksitler.length > 0) {
          const taksitIslemleri = createdTaksitler.map((t, index) => ({
            isletme_id: isletme.id,
            type: 'nakit_avans_taksit' as const,
            amount: t.tutar,
            hesap_id: data.kredi_karti_id,
            kategori_id: data.kategori_id || null,
            description: `Nakit Avans Taksit (${index + 1}/${createdTaksitler.length})`,
            date: t.odeme_tarihi,
          }));

          const { error: islemError } = await supabase
            .from('islemler')
            .insert(taksitIslemleri);

          if (islemError) {
            if (__DEV__) {
              console.error('Taksit işlemleri eklenirken hata:', islemError);
            }
          }
        }
      } else {
        // Taksitsiz avans için tek işlem kaydı oluştur
        const { error: islemError } = await supabase
          .from('islemler')
          .insert({
            isletme_id: isletme.id,
            type: 'nakit_avans_taksit' as const,
            amount: data.geri_odeme_tutari,
            hesap_id: data.kredi_karti_id,
            kategori_id: data.kategori_id || null,
            description: 'Nakit Avans (Tek Seferde)',
            date: data.tarih,
          });

        if (islemError) {
          if (__DEV__) {
            console.error('Nakit avans işlemi eklenirken hata:', islemError);
          }
        }
      }

      // 3. Oluşturulan avansı getir
      const { data: avans, error: fetchError } = await supabase
        .from('nakit_avanslar')
        .select('*')
        .eq('id', avansId)
        .single();

      if (fetchError) throw fetchError;

      return avans as NakitAvans;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'nakitAvans');
    },
  });
}

/**
 * Nakit avans güncelle
 */
export function useUpdateNakitAvans() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: NakitAvansUpdate & { id: string }) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { data: avans, error } = await supabase
        .from('nakit_avanslar')
        .update(data)
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select()
        .single();

      if (error) throw error;
      return avans as NakitAvans;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'nakitAvans');
    },
  });
}

/**
 * Nakit avans sil
 * Atomik RPC kullanır - tüm bakiye değişiklikleri geri alınır
 */
export function useDeleteNakitAvans() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // Atomik RPC ile sil - bakiye reversal dahil
      const { error } = await supabase.rpc('delete_nakit_avans_with_reversal', {
        p_avans_id: id,
        p_isletme_id: isletme.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'nakitAvans');
    },
  });
}

/**
 * Taksit öde
 * Atomik RPC kullanır - tüm bakiye güncellemeleri tek transaction içinde yapılır
 */
export function usePayTaksit() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taksitId, sourceHesapId }: { taksitId: string; sourceHesapId: string }) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // Atomik RPC ile taksit öde
      const { error: rpcError } = await supabase.rpc('perform_taksit_odeme', {
        p_taksit_id: taksitId,
        p_source_hesap_id: sourceHesapId,
        p_isletme_id: isletme.id,
      });

      if (rpcError) throw rpcError;

      // Güncellenmiş taksit bilgisini getir
      const { data: taksit, error: fetchError } = await supabase
        .from('nakit_avans_taksitler')
        .select('*, nakit_avans:nakit_avanslar(*)')
        .eq('id', taksitId)
        .single();

      if (fetchError) throw fetchError;

      return taksit;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'nakitAvans');
    },
  });
}

/**
 * Taksit güncelle
 */
export function useUpdateTaksit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: NakitAvansTaksitUpdate & { id: string }) => {
      const { data: taksit, error } = await supabase
        .from('nakit_avans_taksitler')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return taksit as NakitAvansTaksit;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'nakitAvans');
    },
  });
}
