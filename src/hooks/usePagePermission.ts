import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePermissions } from './usePermissions';
import type { Permissions } from '@/types/multiUser';
import i18n from '@/i18n';

type ModuleName = keyof Permissions['modules'];
type ActionType = 'create' | 'update' | 'delete';

/**
 * Page-level permission guard for shared users.
 * Redirects unauthorized users back with an alert.
 *
 * Usage:
 *   usePagePermission({ module: 'islemler', action: 'create' });
 *   useRequireOwner();
 */
export function usePagePermission({
  module,
  action,
  createdBy,
}: {
  module: ModuleName;
  action?: ActionType;
  createdBy?: string | null;
}) {
  const router = useRouter();
  const { isOwner } = useAuthContext();
  const { canAccessModule, canCreate, canUpdate, canDelete } = usePermissions();

  useEffect(() => {
    if (isOwner) return;

    let allowed = canAccessModule(module);

    if (allowed && action) {
      if ((action === 'update' || action === 'delete') && createdBy === undefined) {
        return;
      }
      switch (action) {
        case 'create':
          allowed = canCreate(module);
          break;
        case 'update':
          allowed = canUpdate(module, createdBy ?? null);
          break;
        case 'delete':
          allowed = canDelete(module, createdBy ?? null);
          break;
      }
    }

    if (!allowed) {
      Alert.alert(
        i18n.t('multiUser:permissions.denied'),
        i18n.t('multiUser:permissions.noActionAccess'),
      );
      // Geri-yığın boşsa (deep-link / shared-mode geçişi) back() işlenmeyip navigasyonu
      // bozabilir → güvenli route'a düş.
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    }
  }, [isOwner, module, action, createdBy, canAccessModule, canCreate, canUpdate, canDelete, router]);
}

/**
 * Requires the current user to be the business owner.
 * Redirects shared users back with an alert.
 */
export function useRequireOwner() {
  const router = useRouter();
  const { isOwner } = useAuthContext();

  useEffect(() => {
    if (!isOwner) {
      Alert.alert(
        i18n.t('multiUser:permissions.denied'),
        i18n.t('multiUser:permissions.ownerOnly'),
      );
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    }
  }, [isOwner, router]);
}
