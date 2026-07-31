import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/appEvents';
import { useAuthContext } from '@/contexts/AuthContext';
import { Hesap, HesapInsert, HesapUpdate } from '@/types/database';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import i18n from '@/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { reportEntityRowsToHesaplar } from '@/lib/reportPermissionProjection';

export function useHesaplar(
  includePassive: boolean = false,
  includeArchived: boolean = false,
  enabled: boolean = true,
  allowReportAccess: boolean = false,
) {
  const { isletme, isletmeLoading } = useAuthContext();
  const {
    canAccessModule,
    canSeePassiveRecords,
    canUseBirikim,
  } = usePermissions();
  const canSeeHesaplar = canAccessModule('hesaplar');
  const hasReportAccess =
    allowReportAccess && canAccessModule('raporlar');
  const canReadHesaplar =
    canSeeHesaplar
    || hasReportAccess;
  const canReadBirikim = hasReportAccess || canUseBirikim;
  const effectiveIncludePassive = includePassive && canSeePassiveRecords;

  const query = useQuery({
    queryKey: [
      ...queryKeys.hesaplar.list(
        isletme?.id ?? '',
        effectiveIncludePassive,
        includeArchived,
      ),
      'birikim',
      canReadBirikim,
      'report-access',
      allowReportAccess,
    ],
    queryFn: async () => {
      if (!canReadHesaplar || !isletme) return [];

      let queryBuilder = supabase
        .from('hesaplar')
        .select('*')
        .eq('isletme_id', isletme.id)
        .order('created_at', { ascending: true });

      // Arşivlenmiş hesapları dahil et veya hariç tut
      if (!includeArchived) {
        queryBuilder = queryBuilder.eq('is_archived', false);
      }

      // Sadece aktif hesapları getir (varsayılan davranış)
      if (!effectiveIncludePassive) {
        queryBuilder = queryBuilder.eq('is_active', true);
      }
      if (!canReadBirikim) {
        queryBuilder = queryBuilder.neq('type', 'birikim');
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      return data as Hesap[];
    },
    enabled: enabled && canReadHesaplar && !!isletme,
    staleTime: 10 * 60 * 1000, // 10 dk - mutation'lar zaten invalidate eder
    gcTime: 30 * 60 * 1000,    // 30 dk cache
    meta: { query_purpose: 'hesaplar:list' },
  });

  // isletme henüz yükleniyorsa loading olarak göster
  return {
    ...query,
    isLoading: enabled && canReadHesaplar && (query.isLoading || isletmeLoading),
  };
}

/**
 * Rapor yüzeyindeki hesap referansları.
 *
 * Hesaplar modülü açıksa mevcut entity sorgusu korunur. Yalnız Raporlar açık
 * profilde ise `hesaplar.*` RLS'i genişletilmez; ad/tip/para birimi/bakiyeden
 * oluşan dar rapor projeksiyonu kullanılır.
 */
export function useReportHesaplar(enabled: boolean = true) {
  const { isletme, user, isletmeLoading } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeeHesaplar = canAccessModule('hesaplar');
  const canSeeReports = canAccessModule('raporlar');
  const useReportProjection = canSeeReports && !canSeeHesaplar;
  const canRead = canSeeHesaplar || canSeeReports;

  const directQuery = useHesaplar(false, false, enabled, false);
  const projectionQuery = useQuery({
    queryKey: [
      'reports',
      'entity-references-v1',
      isletme?.id ?? '',
      user?.id ?? '',
      'hesap',
    ],
    queryFn: async () => {
      if (!useReportProjection || !isletme) return [];
      const { data, error } = await supabase.rpc(
        'get_rapor_varlik_referanslari_v1',
        {
          p_isletme_id: isletme.id,
          p_kind: 'hesap',
        },
      );
      if (error) throw error;
      return reportEntityRowsToHesaplar(data, isletme.id);
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
      query_purpose: 'reports:entity-references-v1:hesap',
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

export function useHesap(id: string | undefined) {
  const { isletme } = useAuthContext();
  const {
    canAccessModule,
    canSeePassiveRecords,
    canUseBirikim,
  } = usePermissions();
  const canSeeHesaplar = canAccessModule('hesaplar');

  return useQuery({
    queryKey: [
      ...queryKeys.hesaplar.detail(id ?? '', isletme?.id ?? ''),
      'passive-scope',
      canSeePassiveRecords,
      'module-scope',
      canSeeHesaplar,
      'birikim-scope',
      canUseBirikim,
    ],
    queryFn: async () => {
      if (!canSeeHesaplar || !id || !isletme) return null;

      let query = supabase
        .from('hesaplar')
        .select('*')
        .eq('id', id)
        .eq('isletme_id', isletme.id);
      if (!canSeePassiveRecords) query = query.eq('is_active', true);
      if (!canUseBirikim) query = query.neq('type', 'birikim');
      const { data, error } = await query.single();

      if (error) throw error;
      return data as Hesap;
    },
    enabled: canSeeHesaplar && !!id && !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useCreateHesap() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: Omit<HesapInsert, 'isletme_id'>) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { data, error } = await supabase
        .from('hesaplar')
        .insert({ ...input, isletme_id: isletme.id })
        .select()
        .single();

      if (error) throw error;
      return data as Hesap;
    },
    onSuccess: (data) => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'hesap');
      logEvent('account_created', { hesap_type: data?.type, currency: data?.currency });
    },
  });
}

export function useUpdateHesap() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async ({ id, ...input }: HesapUpdate & { id: string }) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { data, error } = await supabase
        .from('hesaplar')
        .update(input)
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select()
        .single();

      if (error) throw error;
      return data as Hesap;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'hesap');
    },
  });
}

export function useDeleteHesap() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      // Önce hesabın bu işletmeye ait olduğunu doğrula
      const { data: hesap, error: checkError } = await supabase
        .from('hesaplar')
        .select('id')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (checkError || !hesap) {
        throw new Error(i18n.t('common:errors.accountNotFound'));
      }

      // İşlem varsa silmeyi engelle - bakiye bozulmasını önle
      const { count: islemCount, error: islemCountError } = await supabase
        .from('islemler')
        .select('id', { count: 'exact', head: true })
        .eq('isletme_id', isletme.id)
        .or(`hesap_id.eq.${id},hedef_hesap_id.eq.${id}`);

      if (islemCountError) throw islemCountError;
      if (islemCount && islemCount > 0) {
        throw new Error(i18n.t('errors:account.hasTransactions'));
      }

      // İleri tarihli işlem varsa silmeyi engelle
      const { count: ileriCount, error: ileriCountError } = await supabase
        .from('ileri_tarihli_islemler')
        .select('id', { count: 'exact', head: true })
        .eq('isletme_id', isletme.id)
        .or(`hesap_id.eq.${id},hedef_hesap_id.eq.${id}`);

      if (ileriCountError) throw ileriCountError;
      if (ileriCount && ileriCount > 0) {
        throw new Error(i18n.t('errors:account.hasFutureTransactions'));
      }

      // Sunucu bağlı kayıtları yeniden doğrular, notları aynı DELETE transaction'ında
      // genel nota çevirir ve tam bir silinen satır döndürür.
      const { error } = await supabase
        .from('hesaplar')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select('id')
        .single();

      if (error) throw error;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'hesap');
    },
  });
}

// useTotalBalance KALDIRILDI (25 Tem): hiçbir yerden çağrılmıyordu ve üç ayrı kusur
// taşıyordu — (1) kur bulunamayınca `?? balance` ile 1:1 ekliyordu (repodaki tek
// politika artık createConversionSum: hariç tut + bayrak), (2) useHesaplar() varsayılan
// argümanlarıyla çağırdığı için PASİF ve ARŞİVLİ hesapları da topluyordu, (3) canlı
// muadili useFinancialSummary.accounts. Toplam bakiye gerekirse o hook kullanılmalı.
