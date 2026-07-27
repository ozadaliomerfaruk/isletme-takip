import { ModuleRouteGuard } from '@/components/permissions/ModuleRouteGuard';

export default function ArsivLayout() {
  return <ModuleRouteGuard module="arsiv" />;
}
