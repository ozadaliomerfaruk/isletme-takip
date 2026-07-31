import type { Permissions } from '@/types/multiUser';

export type PermissionModuleName = keyof Permissions['modules'];
export type PermissionModuleCheck = (
  module: PermissionModuleName,
) => boolean;

export type MainTabKey =
  | 'home'
  | 'cariler'
  | 'personel'
  | 'urunler'
  | 'daha';

export type MainTabHref =
  | '/(tabs)'
  | '/(tabs)/cariler'
  | '/(tabs)/personel'
  | '/(tabs)/urunler'
  | '/(tabs)/daha';

const REPORTS_ONLY_MODULES = ['raporlar'] as const;
const ACCOUNT_REPORT_MODULES = ['raporlar', 'hesaplar'] as const;
const CARI_REPORT_MODULES = ['raporlar', 'cariler'] as const;
const PERSONEL_REPORT_MODULES = ['raporlar', 'personel'] as const;
const PRODUCT_REPORT_MODULES = ['raporlar', 'urunler'] as const;

/**
 * Ana Sayfa yalnız gerçekten içerik üretebilen modüllerden biri açıksa vardır.
 * Cari/Personel/Ürün gibi bağımsız modüller Ana Sayfa'yı boş bir sekme olarak
 * göstermemelidir.
 */
export function canAccessHome(
  canAccessModule: PermissionModuleCheck,
): boolean {
  return (
    canAccessModule('hesaplar')
    || canAccessModule('birikim')
    || canAccessModule('raporlar')
  );
}

export function canShowMainTab(
  tab: MainTabKey,
  canAccessModule: PermissionModuleCheck,
): boolean {
  switch (tab) {
    case 'home':
      return canAccessHome(canAccessModule);
    case 'cariler':
      return canAccessModule('cariler');
    case 'personel':
      return canAccessModule('personel');
    case 'urunler':
      return canAccessModule('urunler');
    case 'daha':
      return true;
  }
}

/**
 * Home kapalı bir deep-link/işletme değişiminde kullanıcıyı izinli ilk ana
 * yüzeye taşır. "Daha" her zaman güvenli son duraktır.
 */
export function getFirstAccessibleMainTabHref(
  canAccessModule: PermissionModuleCheck,
): MainTabHref {
  if (canAccessHome(canAccessModule)) return '/(tabs)';
  if (canAccessModule('cariler')) return '/(tabs)/cariler';
  if (canAccessModule('personel')) return '/(tabs)/personel';
  if (canAccessModule('urunler')) return '/(tabs)/urunler';
  return '/(tabs)/daha';
}

export function isTabsHomeRoute(segments: readonly string[]): boolean {
  const tabsIndex = segments.indexOf('(tabs)');
  if (tabsIndex < 0) return false;
  const child = segments[tabsIndex + 1];
  return child === undefined || child === 'index';
}

export function isOwnerOrManagerRole(
  isOwner: boolean,
  currentUserRole: string | null | undefined,
): boolean {
  return isOwner || currentUserRole === 'manager';
}

/**
 * Rapor merkezi ve genel raporlar yalnız Raporlar modülündedir. Kullanıcının
 * kendi modül başlığından açtığı üç bağlamsal rapor ise Raporlar VEYA ilgili
 * kaynak modülüyle okunabilir.
 */
export function getReportRouteAccessModules(
  segments: readonly string[],
): readonly PermissionModuleName[] {
  const reportsIndex = segments.indexOf('raporlar');
  const child = reportsIndex >= 0 ? segments[reportsIndex + 1] : undefined;

  switch (child) {
    case 'hesap':
      return ACCOUNT_REPORT_MODULES;
    case 'cari':
      return CARI_REPORT_MODULES;
    case 'personel':
      return PERSONEL_REPORT_MODULES;
    case 'alis-satis':
      return PRODUCT_REPORT_MODULES;
    default:
      return REPORTS_ONLY_MODULES;
  }
}
