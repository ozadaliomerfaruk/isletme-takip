import { OwnerRouteGuard } from '@/components/permissions/ModuleRouteGuard';

export default function KategorilerLayout() {
  return <OwnerRouteGuard />;
}
