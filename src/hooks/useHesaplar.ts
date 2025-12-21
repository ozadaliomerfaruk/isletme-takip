import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Hesap, HesapInsert, HesapUpdate } from '@/types/database';

export function useHesaplar() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['hesaplar', isletme?.id],
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase
        .from('hesaplar')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as Hesap[];
    },
    enabled: !!isletme,
  });
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
      queryClient.invalidateQueries({ queryKey: ['hesaplar'] });
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['hesaplar'] });
      queryClient.invalidateQueries({ queryKey: ['hesap', data.id] });
    },
  });
}

export function useDeleteHesap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Önce bu hesapla ilişkili işlemleri sil (hem hesap_id hem hedef_hesap_id)
      const { error: islemError1 } = await supabase
        .from('islemler')
        .delete()
        .eq('hesap_id', id);

      if (islemError1) throw islemError1;

      const { error: islemError2 } = await supabase
        .from('islemler')
        .delete()
        .eq('hedef_hesap_id', id);

      if (islemError2) throw islemError2;

      // Sonra hesabı sil (soft delete)
      const { error } = await supabase
        .from('hesaplar')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hesaplar'] });
      queryClient.invalidateQueries({ queryKey: ['islemler'] });
      queryClient.invalidateQueries({ queryKey: ['month-summary'] });
    },
  });
}

// Toplam bakiye hesapla
export function useTotalBalance() {
  const { data: hesaplar } = useHesaplar();

  const total = hesaplar?.reduce((acc, h) => acc + Number(h.balance), 0) ?? 0;

  return total;
}
