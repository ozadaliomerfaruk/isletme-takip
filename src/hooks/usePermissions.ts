import { useCallback } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import type { Permissions } from '@/types/multiUser';

type ModuleName = keyof Permissions['modules'];

/**
 * İzin kontrolü — SADE model (modül aç/kapa + tek global `level`) ile GERİYE-UYUMLU.
 *
 * - `permissions.level` VARSA: yeni sade model.
 *     view → görür · add → +ekler · edit_own → +kendi eklediğini düzenler/siler ·
 *     edit_all → +tümünü.
 * - `level` YOKSA (eski-format kullanıcı): eski per-modül `actions` mantığı kullanılır.
 *   Böylece geçiş döneminde eski-format kullanıcılar AYNEN çalışır ve yetkileri ARTMAZ
 *   (eski per-modül aksiyonlar global seviyeye COLLAPSE EDİLMEZ).
 */
export function usePermissions() {
  const { isOwner, currentPermissions, user } = useAuthContext();

  const canAccessModule = useCallback((module: ModuleName): boolean => {
    if (isOwner) return true;
    return currentPermissions?.modules?.[module] ?? false;
  }, [isOwner, currentPermissions]);

  const canCreate = useCallback((module: string): boolean => {
    if (isOwner) return true;
    const p = currentPermissions;
    if (!p?.modules?.[module as ModuleName]) return false;
    if (p.level) return p.level !== 'view'; // add / edit_own / edit_all
    return p.actions?.[module]?.can_create ?? false; // legacy per-modül
  }, [isOwner, currentPermissions]);

  const canUpdate = useCallback((module: string, createdBy: string | null): boolean => {
    if (isOwner) return true;
    const p = currentPermissions;
    if (!p?.modules?.[module as ModuleName]) return false;
    if (p.level) {
      if (p.level === 'edit_all') return true;
      if (p.level === 'edit_own') return createdBy === user?.id;
      return false;
    }
    const a = p.actions?.[module]; // legacy
    if (a?.can_update_all) return true;
    if (a?.can_update_own && createdBy === user?.id) return true;
    return false;
  }, [isOwner, currentPermissions, user]);

  const canDelete = useCallback((module: string, createdBy: string | null): boolean => {
    if (isOwner) return true;
    const p = currentPermissions;
    if (!p?.modules?.[module as ModuleName]) return false;
    if (p.level) {
      if (p.level === 'edit_all') return true;
      if (p.level === 'edit_own') return createdBy === user?.id;
      return false;
    }
    const a = p.actions?.[module]; // legacy
    if (a?.can_delete_all) return true;
    if (a?.can_delete_own && createdBy === user?.id) return true;
    return false;
  }, [isOwner, currentPermissions, user]);

  const p = currentPermissions;
  // Sade modelde görünürlük ayrımı yok: modül açıksa tüm/pasif/arşiv kayıtlar görünür.
  // Eski formatta (level yok) eski visibility bayrakları okunur.
  const isNewModel = !!p?.level;

  return {
    isOwner,
    permissionLevel: p?.level,
    canAccessModule,
    canCreate,
    canUpdate,
    canDelete,
    canSeePassive: isOwner || (isNewModel ? true : (p?.visibility?.can_see_passive ?? false)),
    canSeeArchived: isOwner || (isNewModel ? true : (p?.visibility?.can_see_archived ?? false)),
    canSeeAllUsersData: isOwner || (isNewModel ? true : (p?.visibility?.can_see_all_users_data ?? false)),
    // Birikim hesap tipi erişimi — RLS ile AYNI semantik (yok→true geriye-uyum):
    // yalnızca açıkça birikim=false yapılmış kullanıcıda gizlenir.
    canUseBirikim: isOwner || (p?.modules?.birikim ?? true),
    restrictions: isNewModel ? undefined : p?.restrictions,
  };
}
