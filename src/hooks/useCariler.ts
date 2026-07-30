import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/appEvents';
import { useAuthContext } from '@/contexts/AuthContext';
import { Cari, CariInsert, CariUpdate, CariType } from '@/types/database';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import { calculateBalanceSummary } from '@/lib/currency';
import { LinkedRecordsError } from '@/lib/errors';
import i18n from '@/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { reportEntityRowsToCariler } from '@/lib/reportPermissionProjection';

export function useCariler(
  type?: CariType,
  includePassive: boolean = false,
  includeArchived: boolean = false,
  enabled: boolean = true,
  allowReportAccess: boolean = false,
) {
  const { isletme, isletmeLoading } = useAuthContext();
  const { canAccessModule, canSeePassiveRecords } = usePermissions();
  const canSeeCariler = canAccessModule('cariler');
  const canReadCariler =
    canSeeCariler
    || (allowReportAccess && canAccessModule('raporlar'));
  const effectiveIncludePassive = includePassive && canSeePassiveRecords;

  const result = useQuery({
    queryKey: [
      ...queryKeys.cariler.list(
        isletme?.id ?? '',
        type,
        effectiveIncludePassive,
        includeArchived,
      ),
      'report-access',
      allowReportAccess,
    ],
    queryFn: async () => {
      if (!canReadCariler || !isletme) return [];

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
      if (!effectiveIncludePassive) {
        query = query.eq('is_active', true);
      }

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Cari[];
    },
    enabled: enabled && canReadCariler && !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    meta: { query_purpose: 'cariler:list' },
  });

  // isletme henüz yükleniyorsa loading olarak göster
  return {
    ...result,
    isLoading: enabled && canReadCariler && (result.isLoading || isletmeLoading),
  };
}

/**
 * Rapor yüzeyindeki cari referansları.
 *
 * Cariler modülü kapalı reports-only profilde telefon/e-posta/adres/not gibi
 * entity PII alanları indirilmez; yalnız raporda gereken ad/tip/para
 * birimi/bakiye projeksiyonu kullanılır.
 */
export function useReportCariler(enabled: boolean = true) {
  const { isletme, user, isletmeLoading } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeeCariler = canAccessModule('cariler');
  const canSeeReports = canAccessModule('raporlar');
  const useReportProjection = canSeeReports && !canSeeCariler;
  const canRead = canSeeCariler || canSeeReports;

  const directQuery = useCariler(
    undefined,
    false,
    false,
    enabled,
    false,
  );
  const projectionQuery = useQuery({
    queryKey: [
      'reports',
      'entity-references-v1',
      isletme?.id ?? '',
      user?.id ?? '',
      'cari',
    ],
    queryFn: async () => {
      if (!useReportProjection || !isletme) return [];
      const { data, error } = await supabase.rpc(
        'get_rapor_varlik_referanslari_v1',
        {
          p_isletme_id: isletme.id,
          p_kind: 'cari',
        },
      );
      if (error) throw error;
      return reportEntityRowsToCariler(data, isletme.id);
    },
    enabled:
      enabled
      && useReportProjection
      && !!isletme
      && !!user?.id,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    meta: {
      persist: false,
      query_purpose: 'reports:entity-references-v1:cari',
    },
  });

  const selectedQuery = useReportProjection
    ? projectionQuery
    : directQuery;
  return {
    ...selectedQuery,
    data: enabled && canRead ? selectedQuery.data ?? [] : [],
    isLoading:
      enabled
      && canRead
      && (selectedQuery.isLoading || isletmeLoading),
  };
}

export function useCari(id: string | undefined) {
  const { isletme } = useAuthContext();
  const { canAccessModule, canSeePassiveRecords } = usePermissions();
  const canSeeCariler = canAccessModule('cariler');

  return useQuery({
    queryKey: [
      ...queryKeys.cariler.detail(id ?? '', isletme?.id ?? ''),
      'passive-scope',
      canSeePassiveRecords,
      'module-scope',
      canSeeCariler,
    ],
    queryFn: async () => {
      if (!canSeeCariler || !id || !isletme) return null;

      let query = supabase
        .from('cariler')
        .select('*')
        .eq('id', id)
        .eq('isletme_id', isletme.id);
      if (!canSeePassiveRecords) query = query.eq('is_active', true);
      const { data, error } = await query.single();

      if (error) throw error;
      return data as Cari;
    },
    enabled: canSeeCariler && !!id && !!isletme,
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
      const { count: islemCount, error: islemCountError } = await supabase
        .from('islemler')
        .select('id', { count: 'exact', head: true })
        .eq('cari_id', id)
        .eq('isletme_id', isletme.id);

      if (islemCountError) throw islemCountError;
      if (islemCount && islemCount > 0) {
        throw new LinkedRecordsError(i18n.t('common:errors.hasLinkedTransactions', { count: islemCount }));
      }

      // Bağlı ileri tarihli işlem kontrolü
      const { count: scheduledCount, error: scheduledCountError } = await supabase
        .from('ileri_tarihli_islemler')
        .select('id', { count: 'exact', head: true })
        .eq('cari_id', id)
        .eq('isletme_id', isletme.id);

      if (scheduledCountError) throw scheduledCountError;
      if (scheduledCount && scheduledCount > 0) {
        throw new LinkedRecordsError(i18n.t('common:errors.hasLinkedScheduledTransactions', { count: scheduledCount }));
      }

      // Bağlı paylaşım kontrolü: bu cari başka bir işletmeyle paylaşılmışsa (cari_links),
      // silinince FK CASCADE ile paylaşım kalkar ve karşı (viewer) taraf erişimini SESSİZCE
      // kaybeder. Silmeyi engelle; kullanıcı önce paylaşımı kaldırmalı.
      const { count: sharedCount, error: sharedCountError } = await supabase
        .from('cari_links')
        .select('id', { count: 'exact', head: true })
        .eq('cari_id', id)
        .eq('owner_isletme_id', isletme.id);

      if (sharedCountError) throw sharedCountError;
      if (sharedCount && sharedCount > 0) {
        throw new LinkedRecordsError(i18n.t('common:errors.hasSharedCari'));
      }

      // Sunucu bağlı kayıtları yeniden doğrular, notları aynı DELETE transaction'ında
      // genel nota çevirir ve tam bir silinen satır döndürür.
      const { error } = await supabase
        .from('cariler')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select('id')
        .single();

      if (error) throw error;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'cari');
    },
  });
}

// === Cari detay dashboard özeti (get_cari_ozet RPC — tip bazlı ömür-boyu toplamlar) ===
export interface CariOzetTip {
  toplam: number;
  adet: number;
}

export type CariOzet = Partial<Record<
  'cari_satis' | 'cari_alis' | 'cari_tahsilat' | 'cari_odeme' | 'cari_satis_iade' | 'cari_alis_iade',
  CariOzetTip
>>;

/**
 * Carinin tip bazlı ömür-boyu toplamları (satış/alış/tahsilat/ödeme/iadeler) —
 * sunucuda toplanır (büyük geçmişte tüm işlemleri indirme yok). Ödeme/tahsilat
 * kur-çevrimli (tahsis_cari_etki) → bakiye matematiğiyle tutarlı.
 */
export function useCariOzet(cariId: string | undefined, enabled = true) {
  const { isletme } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeeCariler = canAccessModule('cariler');

  return useQuery({
    queryKey: queryKeys.cariler.ozet(cariId ?? '', isletme?.id ?? ''),
    enabled: enabled && canSeeCariler && !!cariId && !!isletme?.id,
    queryFn: async (): Promise<CariOzet> => {
      if (!canSeeCariler || !cariId || !isletme?.id) return {};
      const { data, error } = await supabase.rpc('get_cari_ozet', {
        p_isletme_id: isletme.id,
        p_cari_id: cariId,
      });
      if (error) throw error;
      const raw = (data ?? {}) as Record<string, { toplam: unknown; adet: unknown }>;
      const out: CariOzet = {};
      for (const [tip, v] of Object.entries(raw)) {
        (out as Record<string, CariOzetTip>)[tip] = {
          toplam: Number(v?.toplam) || 0,
          adet: Number(v?.adet) || 0,
        };
      }
      return out;
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
