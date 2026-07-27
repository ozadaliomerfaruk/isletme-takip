import { ModuleRouteGuard } from '@/components/permissions/ModuleRouteGuard';

export default function NakitAkisiLayout() {
  return <ModuleRouteGuard module="raporlar" />;
}
