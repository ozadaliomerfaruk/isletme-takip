/**
 * Sade izin modeli yardımcıları (multi-user).
 *
 * Yeni model: `modules` (aç/kapa) + tek global `level` (view/add/edit_own/edit_all).
 * Geçiş dönemi: yazarken eski `actions`/`visibility` de TÜRETİLİR ki eski app sürümü
 * (henüz güncellenmemiş kullanıcılar) okumaya devam etsin. Tüm kullanıcılar yeni
 * sürüme geçince bu türetilen alanlar temizlik migration'ı ile kaldırılacak.
 */
import type { ModuleName, Permissions, PermissionLevel, UserRole } from '@/types/multiUser';

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
// İşlevsel çekirdek modüller: editörde ayrı toggle olarak GÖSTERİLMEZ, her izinde
// (dashboard gibi) otomatik AÇIK tutulur. Böylece 'Özel' rol de işlem / kategori /
// ileri-tarihli akışını kullanabilir; sade UI korunur.
// Not: 'cekler' modülü kaldırıldı (çek özelliği çıkarıldı); tip değeri eski izin
// verisiyle uyum için ModuleName'de duruyor.
const CORE_MODULES: ModuleName[] = ['islemler', 'kategoriler', 'ileri_tarihli'];

export function buildPermissions(
  modules: Record<ModuleName, boolean>,
  level: PermissionLevel,
): Permissions {
  const m: Record<ModuleName, boolean> = { ...modules, dashboard: true };
  CORE_MODULES.forEach((k) => { m[k] = true; });
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

// Tüm modüller (sıralı). dashboard her zaman açık; ayarlar owner-only.
export const ALL_MODULES: ModuleName[] = [
  'dashboard', 'hesaplar', 'birikim', 'cariler', 'personel', 'islemler',
  'kategoriler', 'raporlar', 'ileri_tarihli',
  'urunler', 'notlar', 'arsiv', 'ayarlar',
];

// Owner dışı rollere verilebilen modüller (dashboard zaten açık, ayarlar owner-only).
const GRANTABLE_MODULES: ModuleName[] = ALL_MODULES.filter(
  (m) => m !== 'dashboard' && m !== 'ayarlar',
);

function emptyModuleMap(): Record<ModuleName, boolean> {
  return ALL_MODULES.reduce((acc, m) => {
    acc[m] = false;
    return acc;
  }, {} as Record<ModuleName, boolean>);
}

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
    return buildPermissions(modules, 'edit_all');
  }
  if (role === 'operator') {
    GRANTABLE_MODULES.forEach((m) => { modules[m] = true; });
    modules.birikim = false;
    modules.raporlar = false;
    return buildPermissions(modules, 'edit_own');
  }
  return buildPermissions(modules, 'view');
}
