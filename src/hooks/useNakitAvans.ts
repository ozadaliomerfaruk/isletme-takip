import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
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
    queryKey: ['nakit-avanslar', 'kredi-karti', krediKartiId],
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
    queryKey: ['nakit-avans', id],
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
 */
export function useCreateNakitAvans() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Omit<NakitAvansInsert, 'isletme_id'> & { taksitler?: Omit<NakitAvansTaksitInsert, 'nakit_avans_id'>[] }) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { taksitler, ...avansData } = data;

      // 1. Nakit avans oluştur
      const { data: avans, error: avansError } = await supabase
        .from('nakit_avanslar')
        .insert({
          ...avansData,
          isletme_id: isletme.id,
        })
        .select()
        .single();

      if (avansError) throw avansError;

      // 2. Taksitler varsa ekle ve her taksit için kredi kartı ekstresine işlem yaz
      if (taksitler && taksitler.length > 0) {
        const taksitlerWithAvansId = taksitler.map((t) => ({
          ...t,
          nakit_avans_id: avans.id,
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

      // 3. Hedef hesaba para ekle (nakit avans tutarı kadar)
      const { error: hedefHesapError } = await supabase.rpc('update_hesap_balance', {
        p_hesap_id: data.hedef_hesap_id,
        p_amount: data.tutar,
      });

      if (hedefHesapError) {
        // Fallback: Manuel güncelleme
        const { data: hedefHesap } = await supabase
          .from('hesaplar')
          .select('balance')
          .eq('id', data.hedef_hesap_id)
          .single();

        if (hedefHesap) {
          await supabase
            .from('hesaplar')
            .update({ balance: Number(hedefHesap.balance) + data.tutar })
            .eq('id', data.hedef_hesap_id);
        }
      }

      // 4. Kredi kartı borcunu artır (geri ödeme tutarı kadar)
      const { error: krediKartiError } = await supabase.rpc('update_hesap_balance', {
        p_hesap_id: data.kredi_karti_id,
        p_amount: -data.geri_odeme_tutari, // Negatif = borç artışı
      });

      if (krediKartiError) {
        // Fallback: Manuel güncelleme
        const { data: krediKarti } = await supabase
          .from('hesaplar')
          .select('balance')
          .eq('id', data.kredi_karti_id)
          .single();

        if (krediKarti) {
          await supabase
            .from('hesaplar')
            .update({ balance: Number(krediKarti.balance) - data.geri_odeme_tutari })
            .eq('id', data.kredi_karti_id);
        }
      }

      return avans as NakitAvans;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['nakit-avanslar'] });
      queryClient.invalidateQueries({ queryKey: ['hesaplar'] });
      queryClient.invalidateQueries({ queryKey: ['hesap', variables.kredi_karti_id] });
      queryClient.invalidateQueries({ queryKey: ['hesap', variables.hedef_hesap_id] });
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['nakit-avanslar'] });
      queryClient.invalidateQueries({ queryKey: ['nakit-avans', data.id] });
    },
  });
}

/**
 * Nakit avans sil
 */
export function useDeleteNakitAvans() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // Önce taksitleri sil
      await supabase
        .from('nakit_avans_taksitler')
        .delete()
        .eq('nakit_avans_id', id);

      // Sonra avansı sil
      const { error } = await supabase
        .from('nakit_avanslar')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nakit-avanslar'] });
      queryClient.invalidateQueries({ queryKey: ['hesaplar'] });
    },
  });
}

/**
 * Taksit öde
 */
export function usePayTaksit() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taksitId, sourceHesapId }: { taksitId: string; sourceHesapId: string }) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // 1. Taksit bilgisini al
      const { data: taksit, error: taksitError } = await supabase
        .from('nakit_avans_taksitler')
        .select('*, nakit_avans:nakit_avanslar(*)')
        .eq('id', taksitId)
        .single();

      if (taksitError) throw taksitError;

      const avans = Array.isArray(taksit.nakit_avans) ? taksit.nakit_avans[0] : taksit.nakit_avans;

      // 2. Taksiti ödenmiş olarak işaretle
      const { error: updateError } = await supabase
        .from('nakit_avans_taksitler')
        .update({
          status: 'paid',
          odenen_tarih: new Date().toISOString(),
        })
        .eq('id', taksitId);

      if (updateError) throw updateError;

      // 3. Kaynak hesaptan para çıkar
      const { data: sourceHesap } = await supabase
        .from('hesaplar')
        .select('balance')
        .eq('id', sourceHesapId)
        .single();

      if (sourceHesap) {
        await supabase
          .from('hesaplar')
          .update({ balance: Number(sourceHesap.balance) - taksit.tutar })
          .eq('id', sourceHesapId);
      }

      // 4. Kredi kartı borcunu azalt
      const { data: krediKarti } = await supabase
        .from('hesaplar')
        .select('balance')
        .eq('id', avans.kredi_karti_id)
        .single();

      if (krediKarti) {
        await supabase
          .from('hesaplar')
          .update({ balance: Number(krediKarti.balance) + taksit.tutar })
          .eq('id', avans.kredi_karti_id);
      }

      // 5. Tüm taksitler ödendiyse avansı tamamlanmış olarak işaretle
      const { data: remainingTaksitler } = await supabase
        .from('nakit_avans_taksitler')
        .select('id')
        .eq('nakit_avans_id', avans.id)
        .neq('status', 'paid');

      if (!remainingTaksitler || remainingTaksitler.length === 0) {
        await supabase
          .from('nakit_avanslar')
          .update({ status: 'completed' })
          .eq('id', avans.id);
      }

      return taksit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nakit-avanslar'] });
      queryClient.invalidateQueries({ queryKey: ['nakit-avans'] });
      queryClient.invalidateQueries({ queryKey: ['hesaplar'] });
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
      queryClient.invalidateQueries({ queryKey: ['nakit-avanslar'] });
      queryClient.invalidateQueries({ queryKey: ['nakit-avans'] });
    },
  });
}
