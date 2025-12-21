import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { IsletmeUpdate } from '@/types/database';

export function useUpdateIsletme() {
  const { isletme, refreshIsletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: IsletmeUpdate) => {
      if (!isletme) throw new Error('Isletme bulunamadi');

      const { data, error } = await supabase
        .from('isletmeler')
        .update(input)
        .eq('id', isletme.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await refreshIsletme();
    },
  });
}
