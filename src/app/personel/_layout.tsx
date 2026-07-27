import { ModuleRouteGuard } from '@/components/permissions/ModuleRouteGuard';

export default function PersonelLayout() {
  return <ModuleRouteGuard module="personel" />;
}
