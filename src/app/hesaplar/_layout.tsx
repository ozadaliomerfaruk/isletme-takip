import { ModuleRouteGuard } from '@/components/permissions/ModuleRouteGuard';

export default function HesaplarLayout() {
  return <ModuleRouteGuard module="hesaplar" />;
}
