import { ModuleRouteGuard } from '@/components/permissions/ModuleRouteGuard';

export default function RaporlarLayout() {
  return <ModuleRouteGuard module="raporlar" />;
}
