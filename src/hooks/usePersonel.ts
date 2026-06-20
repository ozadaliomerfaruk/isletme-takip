import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/appEvents';
import { useAuthContext } from '@/contexts/AuthContext';
import { Personel, PersonelInsert, PersonelUpdate } from '@/types/database';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import { toNumber } from '@/lib/currency';
import { LinkedRecordsError } from '@/lib/errors';
import i18n from '@/i18n';

export function usePersonelList(includePassive: boolean = false, includeArchived: boolean = false) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.personel.list(isletme?.id ?? '', includePassive, includeArchived),
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
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    meta: { query_purpose: 'personel:list' },
  });

  // isletme henüz yükleniyorsa loading olarak göster
  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

export function usePersonel(id: string | undefined) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.personel.detail(id ?? '', isletme?.id ?? ''),
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
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// Alias for usePersonel
export const usePersonelById = usePersonel;

export function useCreatePersonel() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: Omit<PersonelInsert, 'isletme_id'>) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { data, error } = await supabase
        .from('personel')
        .insert({ ...input, isletme_id: isletme.id })
        .select()
        .single();

      if (error) throw error;
      return data as Personel;
    },
    onSuccess: (data) => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'personel');
      logEvent('staff_created', { currency: data?.currency });
    },
  });
}

export function useUpdatePersonel() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async ({ id, ...input }: PersonelUpdate & { id: string }) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { data, error } = await supabase
        .from('personel')
        .update(input)
        .eq('id', id)
        .eq('isletme_id', isletme.id)  // Güvenlik: Sadece kendi işletmesindeki personeli güncelleyebilir
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
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      // Önce personelin bu işletmeye ait olduğunu doğrula
      const { data: personel, error: checkError } = await supabase
        .from('personel')
        .select('id')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (checkError || !personel) {
        throw new Error(i18n.t('common:errors.staffNotFound'));
      }

      // Bağlı işlem kontrolü - varsa silmeyi engelle
      const { count: islemCount } = await supabase
        .from('islemler')
        .select('id', { count: 'exact', head: true })
        .eq('personel_id', id)
        .eq('isletme_id', isletme.id);

      if (islemCount && islemCount > 0) {
        throw new LinkedRecordsError(i18n.t('common:errors.hasLinkedTransactions', { count: islemCount }));
      }

      // Bağlı ileri tarihli işlem kontrolü
      const { count: scheduledCount } = await supabase
        .from('ileri_tarihli_islemler')
        .select('id', { count: 'exact', head: true })
        .eq('personel_id', id)
        .eq('isletme_id', isletme.id);

      if (scheduledCount && scheduledCount > 0) {
        throw new LinkedRecordsError(i18n.t('common:errors.hasLinkedScheduledTransactions', { count: scheduledCount }));
      }

      // Bu personele iliştirilmiş notları (personel + izin notları) genel nota çevir (yetim not kalmasın)
      const { error: notlarError } = await supabase
        .from('notlar')
        .update({ entity_type: 'genel', entity_id: null })
        .eq('entity_id', id)
        .in('entity_type', ['personel', 'personel_izin'])
        .eq('isletme_id', isletme.id);
      if (notlarError && __DEV__) {
        console.error('Not temizleme başarısız (yetim not kalabilir):', notlarError);
      }

      // Personeli sil (bağlı kayıt yoksa güvenle silinebilir)
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

// Toplam personel borcu ve alacağı
export function usePersonelSummary() {
  const { data: personelList } = usePersonelList();

  // Merkezi toNumber fonksiyonunu kullan
  const summary = personelList?.reduce(
    (acc, p) => {
      const balance = toNumber(p.balance);
      if (balance < 0) {
        // Negatif bakiye = borcumuz var (personele borçluyuz)
        acc.totalDebt += Math.abs(balance);
      } else if (balance > 0) {
        // Pozitif bakiye = alacağımız var (personel bize borçlu)
        acc.totalReceivables += balance;
      }
      return acc;
    },
    { totalDebt: 0, totalReceivables: 0 }
  ) ?? { totalDebt: 0, totalReceivables: 0 };

  return summary;
}
