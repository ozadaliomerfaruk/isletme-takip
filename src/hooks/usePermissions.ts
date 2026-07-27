import { useCallback } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  canAccessPermissionModule,
  canExportPermissionModule,
  canSharePublicCariStatement,
  isPermissionLevel,
} from '@/lib/permissions';
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
  const {
    isOwner,
    currentPermissions,
    currentUserRole,
    user,
  } = useAuthContext();

  const canAccessModule = useCallback((module: ModuleName): boolean => {
    if (isOwner) return true;
    return canAccessPermissionModule(currentPermissions, module);
  }, [isOwner, currentPermissions]);

  const canExportModule = useCallback((module: ModuleName): boolean => {
    if (isOwner) return true;
    return canExportPermissionModule(currentPermissions, module);
  }, [isOwner, currentPermissions]);

  const canShareCariStatement = useCallback((): boolean => {
    if (isOwner) return true;
    return canSharePublicCariStatement(currentPermissions);
  }, [isOwner, currentPermissions]);

  const canCreate = useCallback((module: string): boolean => {
    if (isOwner) return true;
    const p = currentPermissions;
    if (!canAccessPermissionModule(p, module as ModuleName)) return false;
    // Legacy aksiyon fallback'i yalnız modül açıkça true ise geçerlidir.
    if (!p?.modules?.[module as ModuleName]) return false;
    if (p.level !== undefined && p.level !== null) {
      if (!isPermissionLevel(p.level)) return false;
      return p.level === 'add' || p.level === 'edit_own' || p.level === 'edit_all';
    }
    return p.actions?.[module]?.can_create ?? false; // legacy per-modül
  }, [isOwner, currentPermissions]);

  const canUpdate = useCallback((module: string, createdBy: string | null): boolean => {
    if (isOwner) return true;
    const p = currentPermissions;
    if (!canAccessPermissionModule(p, module as ModuleName)) return false;
    if (!p?.modules?.[module as ModuleName]) return false;
    if (p.level !== undefined && p.level !== null) {
      if (!isPermissionLevel(p.level)) return false;
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
    if (!canAccessPermissionModule(p, module as ModuleName)) return false;
    if (!p?.modules?.[module as ModuleName]) return false;
    if (p.level !== undefined && p.level !== null) {
      if (!isPermissionLevel(p.level)) return false;
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

  return {
    isOwner,
    permissionLevel: p?.level,
    canAccessModule,
    canExportModule,
    canShareCariStatement,
    canCreate,
    canUpdate,
    canDelete,
    canSeePassiveRecords: isOwner || currentUserRole === 'manager',
    // Eski kayıtta eksik `birikim` anahtarı fallback'i korunur; ancak Hesaplar
    // kapalıysa Birikim tek başına hiçbir zaman açılamaz.
    canUseBirikim: isOwner || canAccessPermissionModule(p, 'birikim'),
  };
}
