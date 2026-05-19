import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import type { IslemAuditLog, AuditLogFilters } from '@/types/multiUser';
import i18n from '@/i18n';

// Silinen işlemler
export function useDeletedIslemler(filters?: AuditLogFilters) {
  const { isletme, isOwner } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.auditLog.deleted(isletme?.id ?? '', filters),
    queryFn: async () => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));
      let query = supabase
        .from('islem_audit_log')
        .select('*, performer:profiles!performed_by(*)')
        .eq('isletme_id', isletme.id)
        .eq('action', 'delete')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as IslemAuditLog[];
    },
    enabled: !!isletme && isOwner,
  });
}

// Düzenlenen işlemler
export function useEditedIslemler(filters?: AuditLogFilters) {
  const { isletme, isOwner } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.auditLog.edited(isletme?.id ?? '', filters),
    queryFn: async () => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));
      let query = supabase
        .from('islem_audit_log')
        .select('*, performer:profiles!performed_by(*)')
        .eq('isletme_id', isletme.id)
        .eq('action', 'update')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as IslemAuditLog[];
    },
    enabled: !!isletme && isOwner,
  });
}
