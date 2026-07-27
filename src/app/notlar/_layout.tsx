import { ModuleRouteGuard } from '@/components/permissions/ModuleRouteGuard';

export default function NotlarLayout() {
  return <ModuleRouteGuard module="notlar" />;
}
