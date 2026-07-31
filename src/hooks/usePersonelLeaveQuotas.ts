import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { usePermissions } from '@/hooks/usePermissions';
import { permissionAccessSignature } from '@/lib/permissionCacheGuard';

interface LeaveQuota {
  hakEdilen: number;
  kullanilan: number;
  kalan: number;
}

export type LeaveQuotaMap = Record<string, LeaveQuota>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nonNegativeFiniteNumber(value: unknown, field: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid personnel leave quota field: ${field}`);
  }
  return parsed;
}

/**
 * Tüm personelin izin kotalarını tek sorguda getirir.
 * personel_izin_hakki ve personel_izin_kullanimi işlemlerini toplar.
 */
export function usePersonelLeaveQuotas() {
  const {
    isletme,
    user,
    currentPermissions,
  } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeePersonel = canAccessModule('personel');
  const permissionFingerprint = permissionAccessSignature(
    currentPermissions,
  );

  const result = useQuery({
    queryKey: queryKeys.personelLeaveQuotas.projection(
      isletme?.id ?? '',
      user?.id ?? '',
      permissionFingerprint,
    ),
    queryFn: async (): Promise<LeaveQuotaMap> => {
      if (!canSeePersonel || !isletme || !user) return {};

      const { data, error } = await supabase.rpc(
        'get_personel_izin_kotalari_v1',
        { p_isletme_id: isletme.id },
      );

      if (error) throw error;
      if (!Array.isArray(data)) {
        throw new Error('Invalid personnel leave quota response');
      }

      const quotaMap: LeaveQuotaMap = {};

      for (const value of data) {
        if (!value || typeof value !== 'object') {
          throw new Error('Invalid personnel leave quota row');
        }
        const row = value as Record<string, unknown>;
        if (
          typeof row.personel_id !== 'string'
          || !UUID_PATTERN.test(row.personel_id)
          || Object.prototype.hasOwnProperty.call(
            quotaMap,
            row.personel_id,
          )
        ) {
          throw new Error('Invalid personnel leave quota field: personel_id');
        }

        const hakEdilen = nonNegativeFiniteNumber(
          row.hak_edilen,
          'hak_edilen',
        );
        const kullanilan = nonNegativeFiniteNumber(
          row.kullanilan,
          'kullanilan',
        );
        quotaMap[row.personel_id] = {
          hakEdilen,
          kullanilan,
          kalan: hakEdilen - kullanilan,
        };
      }

      return quotaMap;
    },
    enabled: canSeePersonel && !!isletme && !!user,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    meta: {
      persist: false,
      query_purpose: 'personel:leave-quota-projection-v1',
    },
  });

  const hasUnsafeQueryState = result.isError || result.isRefetchError;
  return {
    ...result,
    data:
      canSeePersonel && !hasUnsafeQueryState
        ? result.data ?? {}
        : {},
  };
}
