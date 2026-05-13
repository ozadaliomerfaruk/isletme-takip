import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Hesap, Cari, Personel, CariType, Urun } from '@/types/database';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
import i18n from '@/i18n';

// ============================================================================
// ARŞİVLENMİŞ ÖĞELERİ GETİREN HOOKS
// ============================================================================

/**
 * Arşivlenmiş hesapları getir
 */
export function useArchivedHesaplar() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['hesaplar', 'archived', isletme?.id],
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase
        .from('hesaplar')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('is_archived', true)
        .order('name', { ascending: true });

      if (error) throw error;
      return data as Hesap[];
    },
    enabled: !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Arşivlenmiş carileri getir
 * @param type - Opsiyonel: 'musteri' veya 'tedarikci' filtresi
 */
export function useArchivedCariler(type?: CariType) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['cariler', 'archived', isletme?.id, type],
    queryFn: async () => {
      if (!isletme) return [];

      let queryBuilder = supabase
        .from('cariler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('is_archived', true)
        .order('name', { ascending: true });

      if (type) {
        queryBuilder = queryBuilder.eq('type', type);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      return data as Cari[];
    },
    enabled: !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Arşivlenmiş personeli getir
 */
export function useArchivedPersonel() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['personel', 'archived', isletme?.id],
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase
        .from('personel')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('is_archived', true)
        .order('first_name', { ascending: true });

      if (error) throw error;
      return data as Personel[];
    },
    enabled: !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Arşivlenmiş ürünleri getir
 */
export function useArchivedUrunler() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['urunler', 'archived', isletme?.id],
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase
        .from('urunler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('is_archived', true)
        .order('ad', { ascending: true });

      if (error) throw error;
      return data as Urun[];
    },
    enabled: !!isletme,
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
        .eq('isletme_id', isletme.id);  // Güvenlik

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'hesap');
      queryClient.invalidateQueries({ queryKey: ['archive', 'counts'] });
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
        .eq('isletme_id', isletme.id);  // Güvenlik

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'hesap');
      queryClient.invalidateQueries({ queryKey: ['archive', 'counts'] });
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
        .eq('isletme_id', isletme.id);  // Güvenlik

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'cari');
      queryClient.invalidateQueries({ queryKey: ['archive', 'counts'] });
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
        .eq('isletme_id', isletme.id);  // Güvenlik

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'cari');
      queryClient.invalidateQueries({ queryKey: ['archive', 'counts'] });
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
        .eq('isletme_id', isletme.id);  // Güvenlik

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'personel');
      queryClient.invalidateQueries({ queryKey: ['archive', 'counts'] });
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
        .eq('isletme_id', isletme.id);  // Güvenlik

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'personel');
      queryClient.invalidateQueries({ queryKey: ['archive', 'counts'] });
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
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urun');
      queryClient.invalidateQueries({ queryKey: ['archive', 'counts'] });
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

  return useQuery({
    queryKey: ['archive', 'counts', isletme?.id],
    queryFn: async () => {
      if (!isletme) return { hesaplar: 0, tedarikci: 0, musteri: 0, personel: 0, urunler: 0 };

      const [hesaplarResult, tedarikciResult, musteriResult, personelResult, urunlerResult] = await Promise.all([
        supabase
          .from('hesaplar')
          .select('id', { count: 'exact', head: true })
          .eq('isletme_id', isletme.id)
          .eq('is_archived', true),
        supabase
          .from('cariler')
          .select('id', { count: 'exact', head: true })
          .eq('isletme_id', isletme.id)
          .eq('is_archived', true)
          .eq('type', 'tedarikci'),
        supabase
          .from('cariler')
          .select('id', { count: 'exact', head: true })
          .eq('isletme_id', isletme.id)
          .eq('is_archived', true)
          .eq('type', 'musteri'),
        supabase
          .from('personel')
          .select('id', { count: 'exact', head: true })
          .eq('isletme_id', isletme.id)
          .eq('is_archived', true),
        supabase
          .from('urunler')
          .select('id', { count: 'exact', head: true })
          .eq('isletme_id', isletme.id)
          .eq('is_archived', true),
      ]);

      return {
        hesaplar: hesaplarResult.count || 0,
        tedarikci: tedarikciResult.count || 0,
        musteri: musteriResult.count || 0,
        personel: personelResult.count || 0,
        urunler: urunlerResult.count || 0,
      };
    },
    enabled: !!isletme,
  });
}
