import { ModuleRouteGuard } from '@/components/permissions/ModuleRouteGuard';

export default function CarilerLayout() {
  return <ModuleRouteGuard module="cariler" />;
}
