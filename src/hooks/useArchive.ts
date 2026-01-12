import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Hesap, Cari, Personel, CariType } from '@/types/database';

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

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('hesaplar')
        .update({ is_archived: true })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hesaplar'] });
    },
  });
}

/**
 * Hesabı arşivden çıkar
 */
export function useUnarchiveHesap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('hesaplar')
        .update({ is_archived: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hesaplar'] });
    },
  });
}

/**
 * Cariyi arşivle
 */
export function useArchiveCari() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('cariler')
        .update({ is_archived: true })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cariler'] });
    },
  });
}

/**
 * Cariyi arşivden çıkar
 */
export function useUnarchiveCari() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('cariler')
        .update({ is_archived: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cariler'] });
    },
  });
}

/**
 * Personeli arşivle
 */
export function useArchivePersonel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('personel')
        .update({ is_archived: true })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personel'] });
    },
  });
}

/**
 * Personeli arşivden çıkar
 */
export function useUnarchivePersonel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('personel')
        .update({ is_archived: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personel'] });
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
      if (!isletme) return { hesaplar: 0, tedarikci: 0, musteri: 0, personel: 0 };

      const [hesaplarResult, tedarikciResult, musteriResult, personelResult] = await Promise.all([
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
      ]);

      return {
        hesaplar: hesaplarResult.count || 0,
        tedarikci: tedarikciResult.count || 0,
        musteri: musteriResult.count || 0,
        personel: personelResult.count || 0,
      };
    },
    enabled: !!isletme,
  });
}
