import { ModuleRouteGuard } from '@/components/permissions/ModuleRouteGuard';

export default function VadeLayout() {
  return <ModuleRouteGuard module="cariler" />;
}
