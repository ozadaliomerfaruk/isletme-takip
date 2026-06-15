/**
 * Sade izin modeli yardımcıları (multi-user).
 *
 * Yeni model: `modules` (aç/kapa) + tek global `level` (view/add/edit_own/edit_all).
 * Geçiş dönemi: yazarken eski `actions`/`visibility` de TÜRETİLİR ki eski app sürümü
 * (henüz güncellenmemiş kullanıcılar) okumaya devam etsin. Tüm kullanıcılar yeni
 * sürüme geçince bu türetilen alanlar temizlik migration'ı ile kaldırılacak.
 */
import type { ModuleName, Permissions, PermissionLevel } from '@/types/multiUser';

/** Permissions'tan etkin global seviyeyi türet: `level` varsa onu, yoksa eski actions'tan. */
export function deriveLevel(p: Permissions | null | undefined): PermissionLevel {
  if (!p) return 'view';
  if (p.level) return p.level;
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
  modules: Record<ModuleName, boolean>,
  level: PermissionLevel,
): Permissions {
  const m: Record<ModuleName, boolean> = { ...modules, dashboard: true };
  const actions: Permissions['actions'] = {};
  (Object.keys(m) as ModuleName[]).forEach((mod) => {
    if (!m[mod]) return;
    actions[mod] = {
      can_create: level !== 'view',
      can_update_own: level === 'edit_own' || level === 'edit_all',
      can_update_all: level === 'edit_all',
      can_delete_own: level === 'edit_own' || level === 'edit_all',
      can_delete_all: level === 'edit_all',
    };
  });
  return {
    modules: m,
    level,
    actions,
    // Sade modelde görünürlük ayrımı yok: açık modülde her şey görünür.
    visibility: { can_see_passive: true, can_see_archived: true, can_see_all_users_data: true },
  };
}
