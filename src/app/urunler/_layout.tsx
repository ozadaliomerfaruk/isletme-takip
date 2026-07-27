import { ModuleRouteGuard } from '@/components/permissions/ModuleRouteGuard';

export default function UrunlerLayout() {
  return <ModuleRouteGuard module="urunler" />;
}
