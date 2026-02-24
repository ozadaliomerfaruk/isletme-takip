import { useCallback } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import type { Permissions } from '@/types/multiUser';

type ModuleName = keyof Permissions['modules'];

export function usePermissions() {
  const { isOwner, currentPermissions, user } = useAuthContext();

  const canAccessModule = useCallback((module: ModuleName): boolean => {
    if (isOwner) return true;
    return currentPermissions?.modules?.[module] ?? false;
  }, [isOwner, currentPermissions]);

  const canCreate = useCallback((module: string): boolean => {
    if (isOwner) return true;
    return currentPermissions?.actions?.[module]?.can_create ?? false;
  }, [isOwner, currentPermissions]);

  const canUpdate = useCallback((module: string, createdBy: string | null): boolean => {
    if (isOwner) return true;
    const actions = currentPermissions?.actions?.[module];
    if (actions?.can_update_all) return true;
    if (actions?.can_update_own && createdBy === user?.id) return true;
    return false;
  }, [isOwner, currentPermissions, user]);

  const canDelete = useCallback((module: string, createdBy: string | null): boolean => {
    if (isOwner) return true;
    const actions = currentPermissions?.actions?.[module];
    if (actions?.can_delete_all) return true;
    if (actions?.can_delete_own && createdBy === user?.id) return true;
    return false;
  }, [isOwner, currentPermissions, user]);

  return {
    isOwner,
    canAccessModule,
    canCreate,
    canUpdate,
    canDelete,
    canSeePassive: isOwner || (currentPermissions?.visibility?.can_see_passive ?? false),
    canSeeArchived: isOwner || (currentPermissions?.visibility?.can_see_archived ?? false),
    canSeeAllUsersData: isOwner || (currentPermissions?.visibility?.can_see_all_users_data ?? false),
    restrictions: currentPermissions?.restrictions,
  };
}
