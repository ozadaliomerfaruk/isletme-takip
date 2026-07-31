import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import {
  parseKategoriSecimReferanslari,
  type KategoriSecimReferansi,
} from '@/lib/categoryReference';
import { parseReportCategoryReferenceRows } from '@/lib/reportPermissionProjection';
import { supabase } from '@/lib/supabase';
import type { KategoriType } from '@/types/database';
import { useKategorilerHierarchical } from './useKategoriler';
import { usePermissions } from './usePermissions';

export interface KategoriSecimSecenegi extends KategoriSecimReferansi {
  icon: string | null;
  level: number;
}

/**
 * Owner icin mevcut tam/hiyerarsik kategori davranisini korur.
 * Shared kullanicida yalniz dar RPC DTO'sunu, duz secim listesi olarak verir.
 */
export function useKategoriSecimReferanslari(
  type?: KategoriType,
  enabled = true,
) {
  const {
    isletme,
    user,
    isOwner,
    isSharedMode,
    isletmeLoading,
  } = useAuthContext();
  const { canAccessModule } = usePermissions();

  const ownerQuery = useKategorilerHierarchical(
    type,
    enabled && isOwner,
  );
  const sharedAllowed =
    enabled
    && !isletmeLoading
    && isSharedMode
    && !isOwner
    && canAccessModule('islemler')
    && !!isletme?.id
    && !!user?.id;

  const sharedQuery = useQuery({
    queryKey: queryKeys.kategoriler.pickerReferences(
      isletme?.id ?? '',
      user?.id ?? '',
      type,
    ),
    enabled: sharedAllowed,
    retry: false,
    queryFn: async (): Promise<KategoriSecimReferansi[]> => {
      if (!sharedAllowed || !isletme?.id) {
        throw new Error('Category picker references are not authorized');
      }

      const { data, error } = await supabase.rpc(
        'get_kategori_secim_referanslari',
        {
          p_isletme_id: isletme.id,
          p_type: type ?? null,
        },
      );
      if (error) throw error;
      return parseKategoriSecimReferanslari(data);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    meta: {
      persist: false,
      query_purpose: 'kategoriler:picker-references-v1',
    },
  });

  const ownerOptions = useMemo<KategoriSecimSecenegi[]>(
    () => (ownerQuery.flatList ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type,
      color: category.color,
      icon: category.icon,
      level: category.level,
    })),
    [ownerQuery.flatList],
  );
  const sharedOptions = useMemo<KategoriSecimSecenegi[]>(
    () => (sharedQuery.data ?? []).map((category) => ({
      ...category,
      // Dar RPC icon/parent_id dondurmez. UI tip-bazli varsayilan ikon kullanir.
      icon: null,
      level: 0,
    })),
    [sharedQuery.data],
  );

  const data =
    isOwner
      ? ownerOptions
      : (
        sharedAllowed
        && !sharedQuery.isError
        && !sharedQuery.isRefetchError
      )
        ? sharedOptions
        : [];

  return {
    data,
    isLoading:
      enabled
      && (
        isletmeLoading
        || (isOwner ? ownerQuery.isLoading : sharedAllowed && sharedQuery.isLoading)
      ),
    isError: isOwner ? ownerQuery.isError : sharedAllowed && sharedQuery.isError,
    error: isOwner ? ownerQuery.error : sharedQuery.error,
    refetch: isOwner ? ownerQuery.refetch : sharedQuery.refetch,
  };
}

/**
 * Rapor filtresindeki kategori referanslari.
 *
 * Reports-only paylasimda normal islem kategori secicisini genisletmez. Bunun
 * yerine rapor yetkisine ait dar gelir/gider RPC projeksiyonlarini birlestirir.
 */
export function useReportKategoriSecimReferanslari(enabled = true) {
  const {
    isletme,
    user,
    isOwner,
    isSharedMode,
    isletmeLoading,
  } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const ownerQuery = useKategoriSecimReferanslari(
    undefined,
    enabled && isOwner,
  );
  const reportAllowed =
    enabled
    && !isletmeLoading
    && isSharedMode
    && !isOwner
    && canAccessModule('raporlar')
    && !!isletme?.id
    && !!user?.id;

  const reportQuery = useQuery({
    queryKey: [
      'reports',
      'category-references-v1',
      isletme?.id ?? '',
      user?.id ?? '',
    ],
    enabled: reportAllowed,
    retry: false,
    queryFn: async (): Promise<KategoriSecimSecenegi[]> => {
      if (!reportAllowed || !isletme?.id) {
        throw new Error('Report category references are not authorized');
      }

      const responses = await Promise.all(
        (['gelir', 'gider'] as const).map((type) =>
          supabase.rpc('get_rapor_kategori_referanslari_v1', {
            p_isletme_id: isletme.id,
            p_type: type,
          }),
        ),
      );

      const byId = new Map<string, KategoriSecimSecenegi>();
      responses.forEach(({ data, error }) => {
        if (error) throw error;
        parseReportCategoryReferenceRows(data).forEach((category) => {
          byId.set(category.id, {
            id: category.id,
            name: category.name,
            type: category.type,
            color: category.color,
            icon: category.icon,
            level: 0,
          });
        });
      });
      return Array.from(byId.values());
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    meta: {
      persist: false,
      query_purpose: 'reports:category-references-v1',
    },
  });

  const data =
    isOwner
      ? ownerQuery.data
      : (
        reportAllowed
        && !reportQuery.isError
        && !reportQuery.isRefetchError
      )
        ? reportQuery.data ?? []
        : [];

  return {
    data,
    isLoading:
      enabled
      && (
        isletmeLoading
        || (isOwner ? ownerQuery.isLoading : reportAllowed && reportQuery.isLoading)
      ),
    isError: isOwner ? ownerQuery.isError : reportAllowed && reportQuery.isError,
    error: isOwner ? ownerQuery.error : reportQuery.error,
    refetch: isOwner ? ownerQuery.refetch : reportQuery.refetch,
  };
}
