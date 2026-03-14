import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { IsletmeUpdate } from '@/types/database';
import i18n from '@/i18n';

export function useUpdateIsletme() {
  const { isletme, refreshIsletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: IsletmeUpdate) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

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
