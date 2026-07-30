import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/appEvents';
import { useAuthContext } from '@/contexts/AuthContext';
import { Personel, PersonelInsert, PersonelUpdate } from '@/types/database';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import { toNumber } from '@/lib/currency';
import { LinkedRecordsError } from '@/lib/errors';
import i18n from '@/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { reportEntityRowsToPersonel } from '@/lib/reportPermissionProjection';

export function usePersonelList(
  includePassive: boolean = false,
  includeArchived: boolean = false,
  enabled: boolean = true,
  allowReportAccess: boolean = false,
) {
  const { isletme, isletmeLoading } = useAuthContext();
  const { canAccessModule, canSeePassiveRecords } = usePermissions();
  const canSeePersonel = canAccessModule('personel');
  const canReadPersonel =
    canSeePersonel
    || (allowReportAccess && canAccessModule('raporlar'));
  const effectiveIncludePassive = includePassive && canSeePassiveRecords;

  const result = useQuery({
    queryKey: [
      ...queryKeys.personel.list(
        isletme?.id ?? '',
        effectiveIncludePassive,
        includeArchived,
      ),
      'report-access',
      allowReportAccess,
    ],
    queryFn: async () => {
      if (!canReadPersonel || !isletme) return [];

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
      if (!effectiveIncludePassive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Personel[];
    },
    enabled: enabled && canReadPersonel && !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    meta: { query_purpose: 'personel:list' },
  });

  // isletme henüz yükleniyorsa loading olarak göster
  return {
    ...result,
    isLoading: enabled && canReadPersonel && (result.isLoading || isletmeLoading),
  };
}

/**
 * Rapor yüzeyindeki personel referansları.
 *
 * Personel modülü kapalı reports-only profilde telefon/maaş/not gibi PII
 * alanları yerine yalnız ad/soyad/para birimi/bakiye projeksiyonu indirilir.
 */
export function useReportPersonelList(enabled: boolean = true) {
  const { isletme, user, isletmeLoading } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeePersonel = canAccessModule('personel');
  const canSeeReports = canAccessModule('raporlar');
  const useReportProjection = canSeeReports && !canSeePersonel;
  const canRead = canSeePersonel || canSeeReports;

  const directQuery = usePersonelList(
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
      'personel',
    ],
    queryFn: async () => {
      if (!useReportProjection || !isletme) return [];
      const { data, error } = await supabase.rpc(
        'get_rapor_varlik_referanslari_v1',
        {
          p_isletme_id: isletme.id,
          p_kind: 'personel',
        },
      );
      if (error) throw error;
      return reportEntityRowsToPersonel(data, isletme.id);
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
      query_purpose: 'reports:entity-references-v1:personel',
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

// === Personel detay dashboard özeti (get_personel_ozet RPC) ===
export interface PersonelOzetTip {
  toplam: number;
  adet: number;
}

export type PersonelOzet = Partial<Record<
  'personel_gider' | 'personel_odeme' | 'personel_satis' | 'personel_tahsilat',
  PersonelOzetTip
>>;

/**
 * Personelin tip bazlı ömür-boyu PARA toplamları (izin türleri hariç — gün tutar).
 * Sunucuda toplanır; büyük geçmişte işlem indirme yok.
 */
export function usePersonelOzet(personelId: string | undefined, enabled = true) {
  const { isletme } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeePersonel = canAccessModule('personel');

  return useQuery({
    queryKey: queryKeys.personel.ozet(personelId ?? '', isletme?.id ?? ''),
    enabled: enabled && canSeePersonel && !!personelId && !!isletme?.id,
    queryFn: async (): Promise<PersonelOzet> => {
      if (!canSeePersonel || !personelId || !isletme?.id) return {};
      const { data, error } = await supabase.rpc('get_personel_ozet', {
        p_isletme_id: isletme.id,
        p_personel_id: personelId,
      });
      if (error) throw error;
      const raw = (data ?? {}) as Record<string, { toplam: unknown; adet: unknown }>;
      const out: PersonelOzet = {};
      for (const [tip, v] of Object.entries(raw)) {
        (out as Record<string, PersonelOzetTip>)[tip] = {
          toplam: Number(v?.toplam) || 0,
          adet: Number(v?.adet) || 0,
        };
      }
      return out;
    },
  });
}

export function usePersonel(id: string | undefined) {
  const { isletme } = useAuthContext();
  const { canAccessModule, canSeePassiveRecords } = usePermissions();
  const canSeePersonel = canAccessModule('personel');

  return useQuery({
    queryKey: [
      ...queryKeys.personel.detail(id ?? '', isletme?.id ?? ''),
      'passive-scope',
      canSeePassiveRecords,
      'module-scope',
      canSeePersonel,
    ],
    queryFn: async () => {
      if (!canSeePersonel || !id || !isletme) return null;

      let query = supabase
        .from('personel')
        .select('*')
        .eq('id', id)
        .eq('isletme_id', isletme.id);
      if (!canSeePassiveRecords) query = query.eq('is_active', true);
      const { data, error } = await query.single();

      if (error) throw error;
      return data as Personel;
    },
    enabled: canSeePersonel && !!id && !!isletme,
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
      const { count: islemCount, error: islemCountError } = await supabase
        .from('islemler')
        .select('id', { count: 'exact', head: true })
        .eq('personel_id', id)
        .eq('isletme_id', isletme.id);

      if (islemCountError) throw islemCountError;
      if (islemCount && islemCount > 0) {
        throw new LinkedRecordsError(i18n.t('common:errors.hasLinkedTransactions', { count: islemCount }));
      }

      // Bağlı ileri tarihli işlem kontrolü
      const { count: scheduledCount, error: scheduledCountError } = await supabase
        .from('ileri_tarihli_islemler')
        .select('id', { count: 'exact', head: true })
        .eq('personel_id', id)
        .eq('isletme_id', isletme.id);

      if (scheduledCountError) throw scheduledCountError;
      if (scheduledCount && scheduledCount > 0) {
        throw new LinkedRecordsError(i18n.t('common:errors.hasLinkedScheduledTransactions', { count: scheduledCount }));
      }

      // Sunucu bağlı kayıtları yeniden doğrular; personel ve izin notlarını aynı
      // DELETE transaction'ında genel nota çevirir ve tam bir satır döndürür.
      const { error } = await supabase
        .from('personel')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select('id')
        .single();

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
