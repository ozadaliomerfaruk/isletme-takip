import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Cari, CariInsert, CariUpdate, CariType } from '@/types/database';

export function useCariler(type?: CariType) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: ['cariler', isletme?.id, type],
    queryFn: async () => {
      if (!isletme) return [];

      let query = supabase
        .from('cariler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Cari[];
    },
    enabled: !!isletme,
  });

  // isletme henüz yükleniyorsa loading olarak göster
  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

export function useCari(id: string | undefined) {
  return useQuery({
    queryKey: ['cari', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('cariler')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Cari;
    },
    enabled: !!id,
  });
}

export function useCreateCari() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: Omit<CariInsert, 'isletme_id'>) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { data, error } = await supabase
        .from('cariler')
        .insert({ ...input, isletme_id: isletme.id })
        .select()
        .single();

      if (error) throw error;
      return data as Cari;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cariler'] });
    },
  });
}

export function useUpdateCari() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: CariUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('cariler')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Cari;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cariler'] });
      queryClient.invalidateQueries({ queryKey: ['cari', data.id] });
    },
  });
}

export function useDeleteCari() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Önce ilişkili işlemleri sil
      const { error: islemError } = await supabase
        .from('islemler')
        .delete()
        .eq('cari_id', id);

      if (islemError) throw islemError;

      // Sonra cariyi sil (soft delete)
      const { error } = await supabase
        .from('cariler')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cariler'] });
      queryClient.invalidateQueries({ queryKey: ['islemler'] });
      queryClient.invalidateQueries({ queryKey: ['hesaplar'] });
      queryClient.invalidateQueries({ queryKey: ['month-summary'] });
    },
  });
}

// Toplam alacak ve borç
export function useCariSummary() {
  const { data: cariler } = useCariler();

  const summary = cariler?.reduce(
    (acc, cari) => {
      const balance = Number(cari.balance);
      // Pozitif bakiye = alacak (müşteriden), Negatif bakiye = borç (tedarikçiye)
      if (balance > 0) {
        acc.totalReceivables += balance;
      } else {
        acc.totalPayables += Math.abs(balance);
      }
      return acc;
    },
    { totalReceivables: 0, totalPayables: 0 }
  ) ?? { totalReceivables: 0, totalPayables: 0 };

  return summary;
}
