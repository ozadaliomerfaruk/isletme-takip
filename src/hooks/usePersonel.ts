import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Personel, PersonelInsert, PersonelUpdate } from '@/types/database';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
import { toNumber } from '@/lib/currency';

export function usePersonelList(includePassive: boolean = false, includeArchived: boolean = false) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: ['personel', isletme?.id, includePassive, includeArchived],
    queryFn: async () => {
      if (!isletme) return [];

      let query = supabase
        .from('personel')
        .select('*')
        .eq('isletme_id', isletme.id)
        .order('first_name', { ascending: true });

      // Arşivlenmiş personeli dahil et veya hariç tut
      if (!includeArchived) {
        query = query.eq('is_archived', false);
      }

      // Sadece aktif personeli getir (varsayılan davranış)
      if (!includePassive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Personel[];
    },
    enabled: !!isletme,
  });

  // isletme henüz yükleniyorsa loading olarak göster
  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

export function usePersonel(id: string | undefined) {
  return useQuery({
    queryKey: ['personel-detail', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('personel')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Personel;
    },
    enabled: !!id,
  });
}

// Alias for usePersonel
export const usePersonelById = usePersonel;

export function useCreatePersonel() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: Omit<PersonelInsert, 'isletme_id'>) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { data, error } = await supabase
        .from('personel')
        .insert({ ...input, isletme_id: isletme.id })
        .select()
        .single();

      if (error) throw error;
      return data as Personel;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'personel');
    },
  });
}

export function useUpdatePersonel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: PersonelUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('personel')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Personel;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'personel');
    },
  });
}

export function useDeletePersonel() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // Önce personelin bu işletmeye ait olduğunu doğrula
      const { data: personel, error: checkError } = await supabase
        .from('personel')
        .select('id')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (checkError || !personel) {
        throw new Error('Personel bulunamadı veya erişim yetkiniz yok');
      }

      // İlişkili işlemleri sil (ownership kontrolü ile)
      const { error: islemError } = await supabase
        .from('islemler')
        .delete()
        .eq('personel_id', id)
        .eq('isletme_id', isletme.id);

      if (islemError) throw islemError;

      // Personeli sil
      const { error } = await supabase
        .from('personel')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'personel');
    },
  });
}

// Toplam personel borcu
export function usePersonelSummary() {
  const { data: personelList } = usePersonelList();

  // Merkezi toNumber fonksiyonunu kullan
  const totalDebt = personelList?.reduce((acc, p) => {
    const balance = toNumber(p.balance);
    // Negatif bakiye = borcumuz var
    if (balance < 0) {
      return acc + Math.abs(balance);
    }
    return acc;
  }, 0) ?? 0;

  return { totalDebt };
}
