/**
 * Sade izin modeli yardımcıları (multi-user).
 *
 * Yeni model: `modules` (aç/kapa) + tek global `level` (view/add/edit_own/edit_all).
 * Geçiş dönemi: yazarken eski `actions`/`visibility` de TÜRETİLİR ki eski app sürümü
 * (henüz güncellenmemiş kullanıcılar) okumaya devam etsin. Tüm kullanıcılar yeni
 * sürüme geçince bu türetilen alanlar temizlik migration'ı ile kaldırılacak.
 */
import type { ModuleName, Permissions, PermissionLevel, UserRole } from '@/types/multiUser';

export const PERMISSION_LEVELS = ['view', 'add', 'edit_own', 'edit_all'] as const;

/** Runtime'dan gelen JSONB değeri TypeScript tipine güvenilmeden doğrulanır. */
export function isPermissionLevel(value: unknown): value is PermissionLevel {
  return typeof value === 'string'
    && (PERMISSION_LEVELS as readonly string[]).includes(value);
}

/**
 * İzin ekranında doğrudan yönetilen alanlar.
 *
 * `birikim`, Hesaplar'ın alt seçeneğidir. Diğer modüller (`islemler`,
 * `ileri_tarihli`, `arsiv`) aşağıda bu görünür kaynaklardan türetilir.
 */
export const VISIBLE_PERMISSION_MODULES = [
  'hesaplar',
  'cariler',
  'urunler',
  'personel',
  'raporlar',
  'notlar',
] as const satisfies readonly ModuleName[];

const TRANSACTION_SOURCE_MODULES = [
  'hesaplar',
  'cariler',
  'urunler',
  'personel',
] as const satisfies readonly ModuleName[];

interface EffectiveModuleOptions {
  /**
   * K9 tamamlanana kadar eski kayıtlarda bulunmayan `notlar` / `birikim`
   * anahtarlarının mevcut istemci davranışını korur. Yeni izinler bütün
   * anahtarları açıkça yazar ve bu fallback'e ihtiyaç duymaz.
   */
  legacyDefaults?: boolean;
}

// Tüm modüller (sıralı). dashboard her zaman açık; ayarlar owner-only.
export const ALL_MODULES: ModuleName[] = [
  'dashboard', 'hesaplar', 'birikim', 'cariler', 'personel', 'islemler',
  'kategoriler', 'raporlar', 'cekler', 'ileri_tarihli',
  'urunler', 'notlar', 'arsiv', 'ayarlar',
];

function emptyModuleMap(): Record<ModuleName, boolean> {
  return ALL_MODULES.reduce((acc, module) => {
    acc[module] = false;
    return acc;
  }, {} as Record<ModuleName, boolean>);
}

/**
 * Görünür izinlerden istemcinin etkin modül haritasını üretir.
 *
 * Güvenlik semantiği:
 * - gizli modüller gelen JSON'dan körlemesine okunmaz;
 * - `islemler` / `ileri_tarihli` yalnız izinli kaynak modüllerden türetilir;
 * - `arsiv` yalnız açık arşivlenebilir modüllerden türetilir;
 * - kategori yönetimi ve ayarlar shared kullanıcıya açılmaz;
 * - Birikim, Hesaplar kapalıyken tek başına açılamaz.
 *
 * Bu yalnız istemci savunma-derinliğidir. Satır/tip/kolon güvenliği ayrıca
 * RLS + projeksiyon RPC'lerinde uygulanmalıdır.
 */
export function deriveEffectiveModules(
  modules: Readonly<Partial<Record<ModuleName, boolean>>> | null | undefined,
  options: EffectiveModuleOptions = {},
): Record<ModuleName, boolean> {
  const effective = emptyModuleMap();
  const legacyDefaults = options.legacyDefaults === true;

  const directFlag = (module: ModuleName): boolean => {
    const value = modules?.[module];
    if (typeof value === 'boolean') return value;
    return legacyDefaults && (module === 'notlar' || module === 'birikim');
  };

  for (const module of VISIBLE_PERMISSION_MODULES) {
    effective[module] = directFlag(module);
  }

  effective.dashboard = true;
  effective.birikim = effective.hesaplar && directFlag('birikim');

  const hasTransactionSource = TRANSACTION_SOURCE_MODULES.some(
    (module) => effective[module],
  );
  effective.islemler = hasTransactionSource;
  effective.ileri_tarihli = hasTransactionSource;
  effective.arsiv = hasTransactionSource;

  // K11: kategori ad/renkleri bağlamsal projeksiyonda okunabilir; yönetim
  // modülü shared kullanıcıya verilmez.
  effective.kategoriler = false;
  effective.ayarlar = false;
  effective.cekler = false;

  return effective;
}

/**
 * Shared kullanıcı için tek bir modülün etkin görünürlüğü.
 * Bilinmeyen `level` bulunan bozuk JSONB kaydı fail-closed davranır.
 */
export function canAccessPermissionModule(
  permissions: Permissions | null | undefined,
  module: ModuleName,
): boolean {
  if (!permissions) return false;
  if (
    permissions.level !== undefined
    && permissions.level !== null
    && !isPermissionLevel(permissions.level)
  ) {
    return false;
  }

  return deriveEffectiveModules(
    permissions.modules,
    { legacyDefaults: permissions.level == null },
  )[module];
}

/**
 * Açık bir modülde görülebilen verinin Excel/PDF gibi salt-okunur bir çıktıya
 * dönüştürülmesi `view` seviyesinin parçasıdır. Bu kapı hiçbir yazma aksiyonu
 * vermez; yalnız modül görünürlüğünü tekrar kullanır.
 */
export function canExportPermissionModule(
  permissions: Permissions | null | undefined,
  module: ModuleName,
): boolean {
  return canAccessPermissionModule(permissions, module);
}

/**
 * Public cari ekstresi de salt-okunur bir dağıtım yüzeyidir. Shared kullanıcı
 * için Cariler modülü açık olduğu sürece `view` seviyesi yeterlidir; link
 * süresi ve üretici-bazlı yönetim ayrıca sunucu/istemci kapılarında sınanır.
 */
export function canSharePublicCariStatement(
  permissions: Permissions | null | undefined,
): boolean {
  return canExportPermissionModule(permissions, 'cariler');
}

/** Permissions'tan etkin global seviyeyi türet: geçersiz yeni seviye -> en dar `view`. */
export function deriveLevel(p: Permissions | null | undefined): PermissionLevel {
  if (!p) return 'view';
  if (p.level !== undefined && p.level !== null) {
    return isPermissionLevel(p.level) ? p.level : 'view';
  }
  const acts = p.actions ? Object.values(p.actions) : [];
  if (acts.some((a) => a?.can_update_all || a?.can_delete_all)) return 'edit_all';
  if (acts.some((a) => a?.can_update_own || a?.can_delete_own)) return 'edit_own';
  if (acts.some((a) => a?.can_create)) return 'add';
  return 'view';
}

/**
 * Sade girdiden (modules + level) TAM Permissions üret.
 * `level` + `modules` yazar; geçiş için eski `actions` (açık modüller başına) ve
 * `visibility`'yi de türetir. dashboard her zaman açık tutulur.
 */
export function buildPermissions(
  modules: Readonly<Partial<Record<ModuleName, boolean>>>,
  level: PermissionLevel,
): Permissions {
  const validLevel = isPermissionLevel(level);
  const safeLevel: PermissionLevel = validLevel ? level : 'view';
  const m = validLevel
    ? deriveEffectiveModules(modules)
    : deriveEffectiveModules({});
  const actions: Permissions['actions'] = {};
  (Object.keys(m) as ModuleName[]).forEach((mod) => {
    if (!m[mod]) return;
    actions[mod] = {
      can_create: safeLevel === 'add' || safeLevel === 'edit_own' || safeLevel === 'edit_all',
      can_update_own: safeLevel === 'edit_own' || safeLevel === 'edit_all',
      can_update_all: safeLevel === 'edit_all',
      can_delete_own: safeLevel === 'edit_own' || safeLevel === 'edit_all',
      can_delete_all: safeLevel === 'edit_all',
    };
  });
  return {
    modules: m,
    level: safeLevel,
    actions,
    // Sade modelde görünürlük ayrımı yok: açık modülde her şey görünür.
    visibility: {
      can_see_passive: false,
      can_see_archived: true,
      can_see_all_users_data: true,
    },
  };
}

// Owner dışı rollerde yalnız görünür seçimler ve Hesaplar'ın Birikim alt seçeneği
// doğrudan verilir. Gizli yetenekler deriveEffectiveModules tarafından hesaplanır.
const GRANTABLE_MODULES: ModuleName[] = [
  ...VISIBLE_PERMISSION_MODULES,
  'birikim',
];

/**
 * Rol kartına basınca uygulanacak hazır izin seti (sade model).
 *   manager  → tüm modüller açık + edit_all (tümünü düzenle/sil)
 *   operator → birikim + raporlar kapalı, gerisi açık + edit_own (yalnızca kendi)
 *   custom   → boş (kullanıcı kendi seçer)
 */
export function rolePresetPermissions(role: UserRole): Permissions {
  const modules = emptyModuleMap();
  if (role === 'manager') {
    GRANTABLE_MODULES.forEach((m) => { modules[m] = true; });
    const permissions = buildPermissions(modules, 'edit_all');
    permissions.visibility.can_see_passive = true;
    return permissions;
  }
  if (role === 'operator') {
    GRANTABLE_MODULES.forEach((m) => { modules[m] = true; });
    modules.birikim = false;
    modules.raporlar = false;
    return buildPermissions(modules, 'edit_own');
  }
  return buildPermissions(modules, 'view');
}
