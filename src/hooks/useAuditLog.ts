import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import type { IslemAuditLog, AuditLogFilters, Profile } from '@/types/multiUser';
import i18n from '@/i18n';

type LoggedAction = 'delete' | 'update';

/**
 * Audit log kayıtlarını çek + performer profilini ekle.
 *
 * NOT: islem_audit_log.performed_by FK'sı auth.users'a bakar; bu yüzden PostgREST
 * `profiles!performed_by` embed'ini çözemez ve sorgu HATA verirdi → sayfa hep boş
 * kalıyordu. Profilleri ayrı sorguyla çekip JS'te eşliyoruz.
 *
 * Ayrıca: her silme/düzenleme şu an İKİ trigger tarafından loglanıyor (aynı olay
 * için islem_id+action+created_at birebir aynı 2 satır) → tekilleştiriyoruz.
 */
async function fetchAuditLog(
  isletmeId: string,
  action: LoggedAction,
  filters?: AuditLogFilters
): Promise<IslemAuditLog[]> {
  let query = supabase
    .from('islem_audit_log')
    .select('*')
    .eq('isletme_id', isletmeId)
    .eq('action', action)
    .order('created_at', { ascending: false })
    .limit(100);

  if (filters?.startDate) query = query.gte('created_at', filters.startDate);
  if (filters?.endDate) query = query.lte('created_at', filters.endDate);

  const { data, error } = await query;
  if (error) throw error;

  // Çift-trigger kaynaklı yinelenen kayıtları ele (aynı olayın 2 satırı).
  const seen = new Set<string>();
  const rows = ((data ?? []) as IslemAuditLog[]).filter((r) => {
    const key = `${r.islem_id ?? 'null'}|${r.action}|${r.created_at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Performer profillerini ayrı çek + eşle.
  const performerIds = [...new Set(rows.map((r) => r.performed_by).filter(Boolean))];
  if (performerIds.length === 0) return rows;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .in('id', performerIds);

  const map = new Map<string, Profile>((profiles ?? []).map((p) => [p.id as string, p as Profile]));
  return rows.map((r) => ({
    ...r,
    performer: r.performed_by ? map.get(r.performed_by) : undefined,
  }));
}

// Silinen işlemler
export function useDeletedIslemler(filters?: AuditLogFilters) {
  const { isletme, isOwner } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.auditLog.deleted(isletme?.id ?? '', filters),
    queryFn: async () => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));
      return fetchAuditLog(isletme.id, 'delete', filters);
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
      return fetchAuditLog(isletme.id, 'update', filters);
    },
    enabled: !!isletme && isOwner,
  });
}
