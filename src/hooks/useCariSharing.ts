/**
 * Cari Sharing (Cari Paylasim) Hooks - v2
 *
 * Tek yonlu paylasim modeli:
 * 1. Owner bir cari icin paylasim kodu olusturur (useGenerateShareCode)
 * 2. Viewer kodu girerek baglantiyi kabul eder (useAcceptShareCode)
 * 3. Viewer paylasilan carileri kendi listesinde gorur (useLinkedCariler)
 * 4. Her iki taraf baglantiyi kaldirabilir (useRemoveCariLink)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import type {
  CariLinkWithDetails,
  CariLinkStatus,
  GenerateShareCodeInput,
  GenerateShareCodeResponse,
  AcceptShareCodeInput,
  AcceptShareCodeResponse,
  RemoveCariLinkInput,
} from '@/types/cariSharing';
import i18n from '@/i18n';

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Isletmenin tum cari eslesmelerini getirir (owner veya viewer olarak)
 */
export function useCariLinks() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.cariSharing.list(isletme?.id ?? ''),
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase
        .from('cari_links')
        .select(`
          *,
          cari:cariler!cari_links_cari_id_fkey(id, name, balance, currency, type),
          owner_isletme:isletmeler!cari_links_owner_isletme_id_fkey(id, name),
          viewer_isletme:isletmeler!cari_links_viewer_isletme_id_fkey(id, name)
        `)
        .or(`owner_isletme_id.eq.${isletme.id},viewer_isletme_id.eq.${isletme.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CariLinkWithDetails[];
    },
    enabled: !!isletme,
  });
}

/**
 * Viewer olarak baglantili carileri getirir
 * Cariler listesinde gosterilmek uzere kullanilir
 */
export function useLinkedCariler() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.cariSharing.linkedCariler(isletme?.id ?? ''),
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase
        .from('cari_links')
        .select(`
          *,
          cari:cariler!cari_links_cari_id_fkey(id, name, balance, currency, type),
          owner_isletme:isletmeler!cari_links_owner_isletme_id_fkey(id, name)
        `)
        .eq('viewer_isletme_id', isletme.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CariLinkWithDetails[];
    },
    enabled: !!isletme,
  });
}

/**
 * Belirli bir carinin eslesme durumunu kontrol eder
 */
export function useCariLinkStatus(cariId: string | undefined) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.cariSharing.status(isletme?.id ?? '', cariId ?? ''),
    queryFn: async (): Promise<CariLinkStatus> => {
      if (!isletme || !cariId) {
        return { is_linked: false, link: null, permission: null, is_owner: false };
      }

      const { data, error } = await supabase
        .from('cari_links')
        .select(`
          *,
          cari:cariler!cari_links_cari_id_fkey(id, name, balance, currency, type),
          owner_isletme:isletmeler!cari_links_owner_isletme_id_fkey(id, name),
          viewer_isletme:isletmeler!cari_links_viewer_isletme_id_fkey(id, name)
        `)
        .eq('cari_id', cariId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return { is_linked: false, link: null, permission: null, is_owner: false };
      }

      const linkData = data as CariLinkWithDetails;
      return {
        is_linked: true,
        link: linkData,
        permission: linkData.permission,
        is_owner: linkData.owner_isletme_id === isletme.id,
      };
    },
    enabled: !!isletme && !!cariId,
  });
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Bir cari icin paylasim kodu olusturur (izin seviyesiyle birlikte)
 */
export function useGenerateShareCode() {
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: GenerateShareCodeInput): Promise<GenerateShareCodeResponse> => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { data, error } = await supabase.rpc('generate_cari_share_code', {
        p_cari_id: input.cari_id,
        p_isletme_id: isletme.id,
        p_permission: input.permission,
      });

      if (error) throw error;
      const code = data as string;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      return { code, expires_at: expiresAt };
    },
  });
}

/**
 * Paylasim kodunu kabul ederek cari eslesmesini olusturur
 * v2: cari_id parametresi yok, viewer_type eklendi
 */
export function useAcceptShareCode() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: AcceptShareCodeInput): Promise<AcceptShareCodeResponse> => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { data, error } = await supabase.rpc('accept_cari_share_code', {
        p_code: input.code,
        p_isletme_id: isletme.id,
        p_viewer_type: input.viewer_type,
      });

      if (error) throw error;
      return { link_id: data as string };
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'cariSharing');
    },
  });
}

/**
 * Cari eslesmesini kaldirir (owner veya viewer)
 */
export function useRemoveCariLink() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: RemoveCariLinkInput): Promise<void> => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { error } = await supabase.rpc('remove_cari_link', {
        p_link_id: input.link_id,
        p_isletme_id: isletme.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'cariSharing');
    },
  });
}
