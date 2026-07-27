import { ModuleRouteGuard } from '@/components/permissions/ModuleRouteGuard';

export default function TaksitLayout() {
  return <ModuleRouteGuard module="cariler" />;
}
