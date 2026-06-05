import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/appEvents';
import { useAuthContext } from '@/contexts/AuthContext';
import { Cari, CariInsert, CariUpdate, CariType } from '@/types/database';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import { calculateBalanceSummary } from '@/lib/currency';
import { LinkedRecordsError } from '@/lib/errors';
import i18n from '@/i18n';

export function useCariler(type?: CariType, includePassive: boolean = false, includeArchived: boolean = false) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.cariler.list(isletme?.id ?? '', type, includePassive, includeArchived),
    queryFn: async () => {
      if (!isletme) return [];

      let query = supabase
        .from('cariler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .order('name', { ascending: true });

      // Arşivlenmiş carileri dahil et veya hariç tut
      if (!includeArchived) {
        query = query.eq('is_archived', false);
      }

      // Sadece aktif carileri getir (varsayılan davranış)
      if (!includePassive) {
        query = query.eq('is_active', true);
      }

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Cari[];
    },
    enabled: !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    meta: { query_purpose: 'cariler:list' },
  });

  // isletme henüz yükleniyorsa loading olarak göster
  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

export function useCari(id: string | undefined) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.cariler.detail(id ?? '', isletme?.id ?? ''),
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
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    meta: { query_purpose: 'cariler:detail' },
  });
}

export function useCreateCari() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: Omit<CariInsert, 'isletme_id'>) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { data, error } = await supabase
        .from('cariler')
        .insert({ ...input, isletme_id: isletme.id })
        .select()
        .single();

      if (error) throw error;
      return data as Cari;
    },
    onSuccess: (data) => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'cari');
      logEvent('client_created', { cari_type: data?.type, currency: data?.currency });
    },
  });
}

export function useUpdateCari() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async ({ id, ...input }: CariUpdate & { id: string }) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { data, error } = await supabase
        .from('cariler')
        .update(input)
        .eq('id', id)
        .eq('isletme_id', isletme.id) // Ownership kontrolü
        .select()
        .single();

      if (error) throw error;
      return data as Cari;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'cari');
    },
  });
}

export function useDeleteCari() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      // Önce carinin bu işletmeye ait olduğunu doğrula
      const { data: cari, error: checkError } = await supabase
        .from('cariler')
        .select('id')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (checkError || !cari) {
        throw new Error(i18n.t('common:errors.clientNotFound'));
      }

      // Bağlı işlem kontrolü - varsa silmeyi engelle
      const { count: islemCount } = await supabase
        .from('islemler')
        .select('id', { count: 'exact', head: true })
        .eq('cari_id', id)
        .eq('isletme_id', isletme.id);

      if (islemCount && islemCount > 0) {
        throw new LinkedRecordsError(i18n.t('common:errors.hasLinkedTransactions', { count: islemCount }));
      }

      // Bağlı ileri tarihli işlem kontrolü
      const { count: scheduledCount } = await supabase
        .from('ileri_tarihli_islemler')
        .select('id', { count: 'exact', head: true })
        .eq('cari_id', id)
        .eq('isletme_id', isletme.id);

      if (scheduledCount && scheduledCount > 0) {
        throw new LinkedRecordsError(i18n.t('common:errors.hasLinkedScheduledTransactions', { count: scheduledCount }));
      }

      // Bağlı çek kontrolü
      const { count: cekCount } = await supabase
        .from('cekler')
        .select('id', { count: 'exact', head: true })
        .eq('cari_id', id)
        .eq('isletme_id', isletme.id);

      if (cekCount && cekCount > 0) {
        throw new LinkedRecordsError(i18n.t('common:errors.hasLinkedChecks', { count: cekCount }));
      }

      // Cariyi sil (bağlı kayıt yoksa güvenle silinebilir)
      const { error } = await supabase
        .from('cariler')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'cari');
    },
  });
}

// Toplam alacak ve borç
export function useCariSummary() {
  const { data: cariler } = useCariler();

  // Merkezi bakiye hesaplama fonksiyonunu kullan
  const { receivables, payables } = cariler
    ? calculateBalanceSummary(cariler)
    : { receivables: 0, payables: 0 };

  return {
    totalReceivables: receivables,
    totalPayables: payables,
  };
}
