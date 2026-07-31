import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePermissions } from './usePermissions';
import type { IslemType } from '@/types/database';
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
  transactionType,
  allowManager = false,
}: {
  module: ModuleName;
  action?: ActionType;
  createdBy?: string | null;
  /** Optional create contract for routes that touch more than one source module. */
  transactionType?: IslemType;
  /** Gerçek manager sistem rolü için owner-benzeri sayfa geçişi. */
  allowManager?: boolean;
}) {
  const router = useRouter();
  const { isOwner, currentUserRole } = useAuthContext();
  const {
    canAccessModule,
    canCreate,
    canUpdate,
    canDelete,
    canCreateTransactionType,
  } = usePermissions();

  useEffect(() => {
    if (isOwner || (allowManager && currentUserRole === 'manager')) return;

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
    if (allowed && transactionType) {
      allowed = canCreateTransactionType(transactionType);
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
  }, [
    isOwner,
    currentUserRole,
    allowManager,
    module,
    action,
    createdBy,
    transactionType,
    canAccessModule,
    canCreate,
    canUpdate,
    canDelete,
    canCreateTransactionType,
    router,
  ]);
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
