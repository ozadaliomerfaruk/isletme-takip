import { useMemo, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  AnyModuleRouteGuard,
  ModuleRouteGuard,
  OwnerOrManagerRouteGuard,
  OwnerRouteGuard,
} from '@/components/permissions/ModuleRouteGuard';
import { colors } from '@/constants/colors';
import type { Permissions } from '@/types/multiUser';

type ModuleName = keyof Permissions['modules'];

interface ModuleRouteStackProps {
  module: ModuleName;
  children?: ReactNode;
}

interface OwnerRouteStackProps {
  children?: ReactNode;
}

interface AnyModuleRouteStackProps {
  modules: readonly ModuleName[];
  children?: ReactNode;
}

/**
 * Yetki amacıyla eklenen klasör `_layout.tsx` dosyaları Expo Router'da yeni bir
 * navigasyon katmanı oluşturur. Header bu nedenle kök Stack'te `klasor/[id]`
 * adıyla değil, bu yerel Stack'te `[id]` adıyla yönetilmelidir.
 */
export function RouteStack({ children }: { children?: ReactNode }) {
  const { t } = useTranslation('common');
  const screenOptions = useMemo(
    () => ({
      presentation: 'card' as const,
      headerShown: true,
      headerTransparent: false,
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.text,
      headerShadowVisible: false,
      headerBackTitle: t('buttons.back'),
      gestureEnabled: true,
      fullScreenGestureEnabled: false,
      contentStyle: { backgroundColor: colors.background },
    }),
    [t],
  );

  return <Stack screenOptions={screenOptions}>{children}</Stack>;
}

export function AnyModuleRouteStack({
  modules,
  children,
}: AnyModuleRouteStackProps) {
  return (
    <AnyModuleRouteGuard modules={modules}>
      <RouteStack>{children}</RouteStack>
    </AnyModuleRouteGuard>
  );
}

export function ModuleRouteStack({
  module,
  children,
}: ModuleRouteStackProps) {
  return (
    <ModuleRouteGuard module={module}>
      <RouteStack>{children}</RouteStack>
    </ModuleRouteGuard>
  );
}

export function OwnerRouteStack({ children }: OwnerRouteStackProps) {
  return (
    <OwnerRouteGuard>
      <RouteStack>{children}</RouteStack>
    </OwnerRouteGuard>
  );
}

export function OwnerOrManagerRouteStack({
  children,
}: OwnerRouteStackProps) {
  return (
    <OwnerOrManagerRouteGuard>
      <RouteStack>{children}</RouteStack>
    </OwnerOrManagerRouteGuard>
  );
}
