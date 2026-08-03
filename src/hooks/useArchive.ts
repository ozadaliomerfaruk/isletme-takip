import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Hesap, Cari, Personel, CariType, Urun } from '@/types/database';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import i18n from '@/i18n';
import { usePermissions } from '@/hooks/usePermissions';

// ============================================================================
// ARŞİVLENMİŞ ÖĞELERİ GETİREN HOOKS
// ============================================================================

/**
 * Arşivlenmiş hesapları getir
 */
export function useArchivedHesaplar(enabled: boolean = true) {
  const { isletme } = useAuthContext();
  const { canAccessModule, canSeePassiveRecords } = usePermissions();
  const canSeeHesaplar = canAccessModule('hesaplar');

  return useQuery({
    queryKey: [
      ...queryKeys.hesaplar.archived(isletme?.id ?? ''),
      'passive-scope',
      canSeePassiveRecords,
      'module-scope',
      canSeeHesaplar,
    ],
    queryFn: async () => {
      if (!canSeeHesaplar || !isletme) return [];

      let query = supabase
        .from('hesaplar')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('is_archived', true)
        .order('name', { ascending: true });
      if (!canSeePassiveRecords) query = query.eq('is_active', true);
      const { data, error } = await query;

      if (error) throw error;
      return data as Hesap[];
    },
    enabled: enabled && canSeeHesaplar && !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Arşivlenmiş carileri getir
 * @param type - Opsiyonel: 'musteri' veya 'tedarikci' filtresi
 */
export function useArchivedCariler(type?: CariType, enabled: boolean = true) {
  const { isletme } = useAuthContext();
  const { canAccessModule, canSeePassiveRecords } = usePermissions();
  const canSeeCariler = canAccessModule('cariler');

  return useQuery({
    queryKey: [
      ...queryKeys.cariler.archived(isletme?.id ?? '', type),
      'passive-scope',
      canSeePassiveRecords,
      'module-scope',
      canSeeCariler,
    ],
    queryFn: async () => {
      if (!canSeeCariler || !isletme) return [];

      let queryBuilder = supabase
        .from('cariler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('is_archived', true)
        .order('name', { ascending: true });

      if (type) {
        queryBuilder = queryBuilder.eq('type', type);
      }
      if (!canSeePassiveRecords) queryBuilder = queryBuilder.eq('is_active', true);

      const { data, error } = await queryBuilder;

      if (error) throw error;
      return data as Cari[];
    },
    enabled: enabled && canSeeCariler && !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Arşivlenmiş personeli getir
 */
export function useArchivedPersonel(enabled: boolean = true) {
  const { isletme } = useAuthContext();
  const { canAccessModule, canSeePassiveRecords } = usePermissions();
  const canSeePersonel = canAccessModule('personel');

  return useQuery({
    queryKey: [
      ...queryKeys.personel.archived(isletme?.id ?? ''),
      'passive-scope',
      canSeePassiveRecords,
      'module-scope',
      canSeePersonel,
    ],
    queryFn: async () => {
      if (!canSeePersonel || !isletme) return [];

      let query = supabase
        .from('personel')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('is_archived', true)
        .order('first_name', { ascending: true });
      if (!canSeePassiveRecords) query = query.eq('is_active', true);
      const { data, error } = await query;

      if (error) throw error;
      return data as Personel[];
    },
    enabled: enabled && canSeePersonel && !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Arşivlenmiş ürünleri getir
 */
export function useArchivedUrunler(enabled: boolean = true) {
  const { isletme } = useAuthContext();
  const { canAccessModule, canSeePassiveRecords } = usePermissions();
  const canSeeUrunler = canAccessModule('urunler');

  return useQuery({
    queryKey: [
      ...queryKeys.urunler.archived(isletme?.id ?? ''),
      'passive-scope',
      canSeePassiveRecords,
      'module-scope',
      canSeeUrunler,
    ],
    queryFn: async () => {
      if (!canSeeUrunler || !isletme) return [];

      let query = supabase
        .from('urunler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('is_archived', true)
        .order('ad', { ascending: true });
      if (!canSeePassiveRecords) query = query.eq('is_active', true);
      const { data, error } = await query;

      if (error) throw error;
      return data as Urun[];
    },
    enabled: enabled && canSeeUrunler && !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// ============================================================================
// ARŞİVLEME MUTATIONS
// ============================================================================

/**
 * Hesabı arşivle
 */
export function useArchiveHesap() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { error } = await supabase
        .from('hesaplar')
        .update({ is_archived: true })
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select('id')
        .single();  // Güvenlik + etkilenen satır doğrulaması

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'hesap');
      queryClient.invalidateQueries({ queryKey: queryKeys.archive.all() });
    },
  });
}

/**
 * Hesabı arşivden çıkar
 */
export function useUnarchiveHesap() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { error } = await supabase
        .from('hesaplar')
        .update({ is_archived: false })
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select('id')
        .single();  // Güvenlik + etkilenen satır doğrulaması

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'hesap');
      queryClient.invalidateQueries({ queryKey: queryKeys.archive.all() });
    },
  });
}

/**
 * Cariyi arşivle
 */
export function useArchiveCari() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { error } = await supabase
        .from('cariler')
        .update({ is_archived: true })
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select('id')
        .single();  // Güvenlik + etkilenen satır doğrulaması

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'cari');
      queryClient.invalidateQueries({ queryKey: queryKeys.archive.all() });
    },
  });
}

/**
 * Cariyi arşivden çıkar
 */
export function useUnarchiveCari() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { error } = await supabase
        .from('cariler')
        .update({ is_archived: false })
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select('id')
        .single();  // Güvenlik + etkilenen satır doğrulaması

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'cari');
      queryClient.invalidateQueries({ queryKey: queryKeys.archive.all() });
    },
  });
}

/**
 * Personeli arşivle
 */
export function useArchivePersonel() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { error } = await supabase
        .from('personel')
        .update({ is_archived: true })
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select('id')
        .single();  // Güvenlik + etkilenen satır doğrulaması

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'personel');
      queryClient.invalidateQueries({ queryKey: queryKeys.archive.all() });
    },
  });
}

/**
 * Personeli arşivden çıkar
 */
export function useUnarchivePersonel() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { error } = await supabase
        .from('personel')
        .update({ is_archived: false })
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select('id')
        .single();  // Güvenlik + etkilenen satır doğrulaması

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'personel');
      queryClient.invalidateQueries({ queryKey: queryKeys.archive.all() });
    },
  });
}

/**
 * Ürünü arşivden çıkar (arsiv sayfası için)
 */
export function useUnarchiveUrun() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { error } = await supabase
        .from('urunler')
        .update({ is_archived: false })
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select('id')
        .single();

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urun');
      queryClient.invalidateQueries({ queryKey: queryKeys.archive.all() });
    },
  });
}

// ============================================================================
// ARŞİV SAYILARI
// ============================================================================

/**
 * Arşivdeki toplam öğe sayılarını getir
 */
export function useArchiveCounts() {
  const { isletme } = useAuthContext();
  const { canAccessModule, canSeePassiveRecords } = usePermissions();
  const canSeeHesaplar = canAccessModule('hesaplar');
  const canSeeCariler = canAccessModule('cariler');
  const canSeePersonel = canAccessModule('personel');
  const canSeeUrunler = canAccessModule('urunler');
  const canSeeArchive = canAccessModule('arsiv');

  return useQuery({
    queryKey: [
      ...queryKeys.archive.counts(isletme?.id ?? ''),
      'passive-scope',
      canSeePassiveRecords,
      'module-scope',
      canSeeHesaplar,
      canSeeCariler,
      canSeePersonel,
      canSeeUrunler,
    ],
    queryFn: async () => {
      if (!canSeeArchive || !isletme) {
        return { hesaplar: 0, tedarikci: 0, musteri: 0, personel: 0, urunler: 0 };
      }

      const [hesaplarResult, tedarikciResult, musteriResult, personelResult, urunlerResult] = await Promise.all([
        canSeeHesaplar ? supabase
          .from('hesaplar')
          .select('id', { count: 'exact', head: true })
          .eq('isletme_id', isletme.id)
          .eq('is_archived', true)
          .in('is_active', canSeePassiveRecords ? [true, false] : [true])
          : Promise.resolve({ count: 0 }),
        canSeeCariler ? supabase
          .from('cariler')
          .select('id', { count: 'exact', head: true })
          .eq('isletme_id', isletme.id)
          .eq('is_archived', true)
          .in('is_active', canSeePassiveRecords ? [true, false] : [true])
          .eq('type', 'tedarikci') : Promise.resolve({ count: 0 }),
        canSeeCariler ? supabase
          .from('cariler')
          .select('id', { count: 'exact', head: true })
          .eq('isletme_id', isletme.id)
          .eq('is_archived', true)
          .in('is_active', canSeePassiveRecords ? [true, false] : [true])
          .eq('type', 'musteri') : Promise.resolve({ count: 0 }),
        canSeePersonel ? supabase
          .from('personel')
          .select('id', { count: 'exact', head: true })
          .eq('isletme_id', isletme.id)
          .eq('is_archived', true)
          .in('is_active', canSeePassiveRecords ? [true, false] : [true])
          : Promise.resolve({ count: 0 }),
        canSeeUrunler ? supabase
          .from('urunler')
          .select('id', { count: 'exact', head: true })
          .eq('isletme_id', isletme.id)
          .eq('is_archived', true)
          .in('is_active', canSeePassiveRecords ? [true, false] : [true])
          : Promise.resolve({ count: 0 }),
      ]);

      return {
        hesaplar: hesaplarResult.count || 0,
        tedarikci: tedarikciResult.count || 0,
        musteri: musteriResult.count || 0,
        personel: personelResult.count || 0,
        urunler: urunlerResult.count || 0,
      };
    },
    enabled: canSeeArchive && !!isletme,
  });
}
