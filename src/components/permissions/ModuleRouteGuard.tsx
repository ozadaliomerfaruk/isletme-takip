import type { ReactNode } from 'react';
import { Redirect, Slot } from 'expo-router';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import type { Permissions } from '@/types/multiUser';

type ModuleName = keyof Permissions['modules'];

interface GuardProps {
  module: ModuleName;
  children?: ReactNode;
}

/**
 * Yasak bir deep-link'te çocuk ekranı hiç mount etmez.
 *
 * `usePagePermission` kullanıcı deneyimi için uyarı/geri yönlendirme yapmaya
 * devam eder; bu guard'ın güvenlik görevi daha erkendir: ekranın veri hook'ları
 * ilk render'da Supabase sorgusu başlatmadan önce fail-closed durmak.
 */
export function ModuleRouteGuard({ module, children }: GuardProps) {
  const {
    initialized,
    loading,
    isletmeLoading,
    isOwner,
  } = useAuthContext();
  const { canAccessModule } = usePermissions();

  if (!initialized || loading || isletmeLoading) return null;
  if (!isOwner && !canAccessModule(module)) {
    return <Redirect href="/(tabs)" />;
  }

  return children ?? <Slot />;
}

/** Shared kullanıcıda hiçbir çocuk ekranı mount etmeden owner-only kapısı. */
export function OwnerRouteGuard({ children }: { children?: ReactNode }) {
  const {
    initialized,
    loading,
    isletmeLoading,
    isOwner,
  } = useAuthContext();

  if (!initialized || loading || isletmeLoading) return null;
  if (!isOwner) return <Redirect href="/(tabs)" />;

  return children ?? <Slot />;
}
