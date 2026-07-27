import { OwnerRouteGuard } from '@/components/permissions/ModuleRouteGuard';

/**
 * İşlem ekranları temel `islemler` tablosu ve geniş ilişkilerden okuyor.
 * Tip-bazlı RLS/projeksiyon tamamlandığında bu geçici owner kapısı,
 * kaynak-modül kesişimini uygulayan ModuleRouteGuard ile değiştirilecek.
 */
export default function IslemlerLayout() {
  return <OwnerRouteGuard />;
}
