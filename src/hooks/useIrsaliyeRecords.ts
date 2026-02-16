import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { IrsaliyeRecord, IrsaliyeRecordInsert, IrsaliyeRecordUpdate } from '@/types/database';
import { invalidateRelatedQueries, queryKeys } from '@/lib/queryKeys';

/**
 * Tüm irsaliye kayıtlarını getir (opsiyonel status filtresi)
 */
export function useIrsaliyeRecords(status?: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.irsaliyeRecords.list(isletme?.id || '', status),
    queryFn: async () => {
      if (!isletme) return [];

      let query = supabase
        .from('irsaliye_records')
        .select('*')
        .eq('isletme_id', isletme.id)
        .order('tarih', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as IrsaliyeRecord[];
    },
    enabled: !!isletme,
  });
}

/**
 * Belirli bir cari için bekleyen irsaliyeleri getir (+-7 gün filtresi opsiyonel)
 */
export function usePendingIrsaliyeByCari(cariId: string | null) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.irsaliyeRecords.byCari(cariId || '', isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !cariId) return [];

      // +-7 gün filtresi
      const now = new Date();
      const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from('irsaliye_records')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('cari_id', cariId)
        .eq('status', 'pending')
        .gte('tarih', from.toISOString().split('T')[0])
        .lte('tarih', to.toISOString().split('T')[0])
        .order('tarih', { ascending: false });

      if (error) throw error;
      return data as IrsaliyeRecord[];
    },
    enabled: !!isletme && !!cariId,
  });
}

/**
 * Yeni irsaliye kaydı oluştur
 */
export function useCreateIrsaliyeRecord() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: IrsaliyeRecordInsert) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { data, error } = await supabase
        .from('irsaliye_records')
        .insert({
          ...input,
          isletme_id: isletme.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as IrsaliyeRecord;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'irsaliyeRecord');
    },
  });
}

/**
 * İrsaliye kaydını güncelle
 */
export function useUpdateIrsaliyeRecord() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async ({ id, ...update }: IrsaliyeRecordUpdate & { id: string }) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { data, error } = await supabase
        .from('irsaliye_records')
        .update(update)
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select()
        .single();

      if (error) throw error;
      return data as IrsaliyeRecord;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'irsaliyeRecord');
    },
  });
}

/**
 * İrsaliyeyi faturaya bağla: cari borç oluştur + irsaliye status='linked'
 */
export function useLinkIrsaliyeToFatura() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async ({
      irsaliyeId,
      islemId,
    }: {
      irsaliyeId: string;
      islemId: string;
    }) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { data, error } = await supabase
        .from('irsaliye_records')
        .update({
          status: 'linked',
          linked_islem_id: islemId,
        })
        .eq('id', irsaliyeId)
        .eq('isletme_id', isletme.id)
        .select()
        .single();

      if (error) throw error;
      return data as IrsaliyeRecord;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'irsaliyeRecord');
      invalidateRelatedQueries(queryClient, 'islem');
      invalidateRelatedQueries(queryClient, 'cari');
    },
  });
}
