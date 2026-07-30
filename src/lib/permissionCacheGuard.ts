import type { ModuleName, PermissionLevel, Permissions } from '@/types/multiUser';

const LEVEL_RANK: Record<PermissionLevel, number> = {
  view: 0,
  add: 1,
  edit_own: 2,
  edit_all: 3,
};

// Mevcut istemci/RLS geriye-uyum semantiği: bu iki eski alan yoksa açıktır.
// K9 geçişi tamamlanıp eksik alanlar deny-by-default olduğunda bu küme boşaltılmalıdır.
const DEFAULT_TRUE_MODULES = new Set<ModuleName>(['notlar', 'birikim']);

const KNOWN_MODULES: ModuleName[] = [
  'dashboard',
  'hesaplar',
  'birikim',
  'cariler',
  'personel',
  'islemler',
  'kategoriler',
  'raporlar',
  'cekler',
  'ileri_tarihli',
  'urunler',
  'notlar',
  'arsiv',
  'ayarlar',
];

const ACTION_KEYS = [
  'can_create',
  'can_update_own',
  'can_update_all',
  'can_delete_own',
  'can_delete_all',
] as const;

const VISIBILITY_KEYS = [
  'can_see_passive',
  'can_see_archived',
  'can_see_all_users_data',
] as const;

type AccessVector = {
  valid: boolean;
  modules: Record<string, boolean>;
  level: number;
  legacy: boolean;
  legacyActions: Record<string, boolean>;
  visibility: Record<string, boolean>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function effectiveLevel(
  permissionRecord: Record<string, unknown>,
  actions: Record<string, unknown>,
): number {
  const explicitLevel = permissionRecord.level;
  if (
    typeof explicitLevel === 'string' &&
    Object.prototype.hasOwnProperty.call(LEVEL_RANK, explicitLevel)
  ) {
    return LEVEL_RANK[explicitLevel as PermissionLevel];
  }

  let rank = LEVEL_RANK.view;
  for (const value of Object.values(actions)) {
    if (!isRecord(value)) continue;
    if (value.can_update_all === true || value.can_delete_all === true) {
      rank = Math.max(rank, LEVEL_RANK.edit_all);
    } else if (value.can_update_own === true || value.can_delete_own === true) {
      rank = Math.max(rank, LEVEL_RANK.edit_own);
    } else if (value.can_create === true) {
      rank = Math.max(rank, LEVEL_RANK.add);
    }
  }
  return rank;
}

function normalizePermissions(value: Permissions | null | undefined): AccessVector {
  if (!isRecord(value)) {
    return {
      valid: false,
      modules: {},
      level: LEVEL_RANK.view,
      legacy: false,
      legacyActions: {},
      visibility: {},
    };
  }

  const rawModules: Record<string, unknown> = isRecord(value.modules)
    ? value.modules
    : {};
  const rawActions: Record<string, unknown> = isRecord(value.actions)
    ? value.actions
    : {};
  const rawVisibility: Record<string, unknown> = isRecord(value.visibility)
    ? value.visibility
    : {};
  const hasDeclaredLevel = value.level !== undefined && value.level !== null;
  const hasExplicitLevel =
    typeof value.level === 'string' &&
    Object.prototype.hasOwnProperty.call(LEVEL_RANK, value.level);
  // Yeni şemada `level` alanı varsa ama sözlük dışıysa bunu legacy kayıt gibi
  // yorumlamak fail-open olur: UI erişimi reddederken geniş cache diskte kalabilir.
  const hasInvalidDeclaredLevel = hasDeclaredLevel && !hasExplicitLevel;

  const moduleNames = new Set<string>([
    ...KNOWN_MODULES,
    ...Object.keys(rawModules),
  ]);
  const modules: Record<string, boolean> = {};
  for (const moduleName of [...moduleNames].sort()) {
    const rawValue = rawModules[moduleName];
    modules[moduleName] = typeof rawValue === 'boolean'
      ? rawValue
      : !hasDeclaredLevel && DEFAULT_TRUE_MODULES.has(moduleName as ModuleName);
  }

  const legacyActions: Record<string, boolean> = {};
  if (!hasExplicitLevel) {
    for (const moduleName of Object.keys(rawActions).sort()) {
      const action: Record<string, unknown> = isRecord(rawActions[moduleName])
        ? rawActions[moduleName]
        : {};
      for (const actionKey of ACTION_KEYS) {
        legacyActions[`${moduleName}.${actionKey}`] = action[actionKey] === true;
      }
    }
  }

  const visibility: Record<string, boolean> = {};
  for (const visibilityKey of VISIBILITY_KEYS) {
    visibility[visibilityKey] = rawVisibility[visibilityKey] === true;
  }

  return {
    valid: isRecord(value.modules) && !hasInvalidDeclaredLevel,
    modules,
    level: effectiveLevel(value, rawActions),
    legacy: !hasExplicitLevel,
    legacyActions,
    visibility,
  };
}

function losesBooleanCapability(
  previous: Record<string, boolean>,
  next: Record<string, boolean>,
): boolean {
  return Object.keys(previous).some(
    (key) => previous[key] === true && next[key] !== true,
  );
}

/**
 * İzinlerin cache açısından anlamlı, anahtar sırasından bağımsız imzası.
 * Ham JSON yerine etkin modül/seviye/legacy aksiyon/görünürlük vektörünü imzalar.
 */
export function permissionAccessSignature(
  permissions: Permissions | null | undefined,
): string {
  return JSON.stringify(normalizePermissions(permissions));
}

/**
 * Aynı işletmedeki yeni izin, önceki izinden herhangi bir erişim kabiliyetini
 * kaybettiriyorsa true döner. Eşzamanlı başka bir yetki genişlemiş olsa bile
 * bir kayıp varsa eski geniş cache temizlenmelidir.
 *
 * Sonraki izin yok/bozuksa fail-closed davranır. İlk izin henüz bilinmiyorsa
 * yeni bir izin yüklemek daralma sayılmaz.
 */
export function isPermissionNarrowing(
  previousPermissions: Permissions | null | undefined,
  nextPermissions: Permissions | null | undefined,
): boolean {
  const previous = normalizePermissions(previousPermissions);
  const next = normalizePermissions(nextPermissions);

  if (!previous.valid) return false;
  if (!next.valid) return true;

  return (
    losesBooleanCapability(previous.modules, next.modules) ||
    next.level < previous.level ||
    (
      previous.legacy &&
      next.legacy &&
      losesBooleanCapability(previous.legacyActions, next.legacyActions)
    ) ||
    losesBooleanCapability(previous.visibility, next.visibility)
  );
}
