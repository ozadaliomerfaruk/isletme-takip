import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Hesap, HesapInsert, HesapUpdate } from '@/types/database';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
import { toNumber } from '@/lib/currency';

export function useHesaplar(includePassive: boolean = false) {
  const { isletme, isletmeLoading } = useAuthContext();

  const query = useQuery({
    queryKey: ['hesaplar', isletme?.id, includePassive],
    queryFn: async () => {
      if (!isletme) return [];

      let queryBuilder = supabase
        .from('hesaplar')
        .select('*')
        .eq('isletme_id', isletme.id)
        .order('created_at', { ascending: true });

      // Sadece aktif hesapları getir (varsayılan davranış)
      if (!includePassive) {
        queryBuilder = queryBuilder.eq('is_active', true);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      return data as Hesap[];
    },
    enabled: !!isletme,
  });

  // isletme henüz yükleniyorsa loading olarak göster
  return {
    ...query,
    isLoading: query.isLoading || isletmeLoading,
  };
}

export function useHesap(id: string | undefined) {
  return useQuery({
    queryKey: ['hesap', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('hesaplar')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Hesap;
    },
    enabled: !!id,
  });
}

export function useCreateHesap() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: Omit<HesapInsert, 'isletme_id'>) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { data, error } = await supabase
        .from('hesaplar')
        .insert({ ...input, isletme_id: isletme.id })
        .select()
        .single();

      if (error) throw error;
      return data as Hesap;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'hesap');
    },
  });
}

export function useUpdateHesap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: HesapUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('hesaplar')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Hesap;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'hesap');
    },
  });
}

export function useDeleteHesap() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // Önce hesabın bu işletmeye ait olduğunu doğrula
      const { data: hesap, error: checkError } = await supabase
        .from('hesaplar')
        .select('id')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (checkError || !hesap) {
        throw new Error('Hesap bulunamadı veya erişim yetkiniz yok');
      }

      // Bu hesapla ilişkili işlemleri sil (ownership kontrolü ile)
      const { error: islemError1 } = await supabase
        .from('islemler')
        .delete()
        .eq('hesap_id', id)
        .eq('isletme_id', isletme.id);

      if (islemError1) throw islemError1;

      const { error: islemError2 } = await supabase
        .from('islemler')
        .delete()
        .eq('hedef_hesap_id', id)
        .eq('isletme_id', isletme.id);

      if (islemError2) throw islemError2;

      // Sonra hesabı sil - ownership kontrolü ile
      const { error } = await supabase
        .from('hesaplar')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'hesap');
    },
  });
}

// Toplam bakiye hesapla
export function useTotalBalance() {
  const { data: hesaplar } = useHesaplar();

  // Merkezi toNumber fonksiyonunu kullan
  const total = hesaplar?.reduce((acc, h) => acc + toNumber(h.balance), 0) ?? 0;

  return total;
}
