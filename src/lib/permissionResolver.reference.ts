/**
 * KANONİK YETKİ ÇÖZÜMLEYİCİSİNİN REFERANS PORTU (P-B)
 *
 * NE İŞE YARAR: sunucudaki resolver'ın üreteceği yetenek vektörünün, bugünkü
 * istemci semantiğiyle BİREBİR aynı olduğunu kanıtlamak için kullanılan saf
 * (hook'suz, React'siz) referans.
 *
 * KAYNAK: src/hooks/usePermissions.ts — satır satır izlenerek portlandı.
 * Buradaki her dal orada bir dala karşılık gelir; sapma = bug.
 *
 * ⚠️ BU DOSYA ÜRETİM KODU DEĞİLDİR. Yalnız testlerde kullanılır.
 * ⚠️ usePermissions.ts değişirse BU DOSYA DA değişmeli; parite testi
 *    ikisini karşılaştırdığı için sapma anında yakalanır.
 *
 * KAPSAM DIŞI — bilinçli:
 *   permissions.restrictions (islem_types / cari_types) burada YOK, çünkü
 *   usePermissions da onu HİÇ okumuyor. Bkz. docs/security/PA-PB-YEREL-PLAN.md
 *   "restrictions" bulgusu — uygulanıp uygulanmayacağı P-C1 kararıdır.
 */

/** Sözleşmedeki altı görünür modül — parite matrisinin eksenlerinden biri. */
export const PARITE_MODULLERI = [
  'hesaplar',
  'cariler',
  'urunler',
  'personel',
  'raporlar',
  'notlar',
] as const;

export type PariteModulu = (typeof PARITE_MODULLERI)[number];

/**
 * usePermissions.ts:9 ile AYNI liste.
 * "modül flag'i YOKSA varsayılan true" — yalnız GÖRÜNÜRLÜK için.
 */
const DEFAULT_TRUE_MODULES = ['notlar', 'birikim'];
const GECERLI_LEVEL = ['view', 'add', 'edit_own', 'edit_all'];

function levelGecerliYaDaLegacy(u: UyelikKaydi): boolean {
  return u.level === null || GECERLI_LEVEL.includes(u.level);
}

/** Fixture'daki kısaltılmış aksiyon nesnesi. */
export interface AksiyonBayraklari {
  c: boolean | null; // can_create
  uo: boolean | null; // can_update_own
  ua: boolean | null; // can_update_all
  do: boolean | null; // can_delete_own
  da: boolean | null; // can_delete_all
}

export interface UyelikKaydi {
  id: string;
  status: string;
  level: string | null;
  modules: Record<string, boolean | null> | null;
  actions: Record<string, AksiyonBayraklari> | null;
  csaud: boolean | null; // visibility.can_see_all_users_data
  has_restrictions?: boolean;
}

/** Sunucu resolver'ının modül başına üreteceği vektör. */
export interface YetenekVektoru {
  can_view: boolean;
  can_create: boolean;
  can_update_own: boolean;
  can_update_all: boolean;
  can_delete_own: boolean;
  can_delete_all: boolean;
}

const SELF = 'self-user-id';
const OTHER = 'other-user-id';

/** usePermissions.canAccessModule — fallback UYGULANIR. */
export function canAccessModule(u: UyelikKaydi, modul: string, isOwner = false): boolean {
  if (isOwner) return true;
  if (!levelGecerliYaDaLegacy(u)) return false;
  const v = u.modules?.[modul];
  if (v === undefined || v === null) return DEFAULT_TRUE_MODULES.includes(modul);
  return v;
}

/**
 * usePermissions.canCreate — fallback UYGULANMAZ.
 * `if (!p?.modules?.[module]) return false;` → undefined falsy, doğrudan false.
 */
export function canCreate(u: UyelikKaydi, modul: string, isOwner = false): boolean {
  if (isOwner) return true;
  if (!levelGecerliYaDaLegacy(u)) return false;
  if (!u.modules?.[modul]) return false;
  if (u.level) return ['add', 'edit_own', 'edit_all'].includes(u.level);
  return u.actions?.[modul]?.c ?? false;
}

/** usePermissions.canUpdate — fallback UYGULANMAZ. */
export function canUpdate(
  u: UyelikKaydi,
  modul: string,
  createdBy: string | null,
  isOwner = false,
  selfId: string = SELF
): boolean {
  if (isOwner) return true;
  if (!levelGecerliYaDaLegacy(u)) return false;
  if (!u.modules?.[modul]) return false;
  if (u.level) {
    if (u.level === 'edit_all') return true;
    if (u.level === 'edit_own') return createdBy === selfId;
    return false;
  }
  const a = u.actions?.[modul];
  if (a?.ua) return true;
  if (a?.uo && createdBy === selfId) return true;
  return false;
}

/** usePermissions.canDelete — fallback UYGULANMAZ. */
export function canDelete(
  u: UyelikKaydi,
  modul: string,
  createdBy: string | null,
  isOwner = false,
  selfId: string = SELF
): boolean {
  if (isOwner) return true;
  if (!levelGecerliYaDaLegacy(u)) return false;
  if (!u.modules?.[modul]) return false;
  if (u.level) {
    if (u.level === 'edit_all') return true;
    if (u.level === 'edit_own') return createdBy === selfId;
    return false;
  }
  const a = u.actions?.[modul];
  if (a?.da) return true;
  if (a?.do && createdBy === selfId) return true;
  return false;
}

/**
 * Bir üyeliğin bir modül için yetenek vektörü.
 *
 * `*_own` yetenekleri KAPSAYICIDIR: `*_all` doğruysa `*_own` da doğrudur.
 * Bu, istemcinin gözlemlenebilir davranışıyla aynıdır (canUpdate(m, selfId)
 * edit_all durumunda da true döner) — sunucu resolver'ı da böyle üretmeli.
 */
export function yetenekVektoru(
  u: UyelikKaydi,
  modul: string,
  isOwner = false
): YetenekVektoru {
  // Aktif olmayan üyelik istemciye hiç yüklenmez → hiçbir yetenek yok.
  if (!isOwner && u.status !== 'active') {
    return {
      can_view: false,
      can_create: false,
      can_update_own: false,
      can_update_all: false,
      can_delete_own: false,
      can_delete_all: false,
    };
  }
  return {
    can_view: canAccessModule(u, modul, isOwner),
    can_create: canCreate(u, modul, isOwner),
    can_update_own: canUpdate(u, modul, SELF, isOwner),
    can_update_all: canUpdate(u, modul, OTHER, isOwner),
    can_delete_own: canDelete(u, modul, SELF, isOwner),
    can_delete_all: canDelete(u, modul, OTHER, isOwner),
  };
}

/** visibility.can_see_all_users_data — yok → false (deny-by-default). */
export function canSeeAllUsersData(u: UyelikKaydi, isOwner = false): boolean {
  if (isOwner) return true;
  if (u.status !== 'active') return false;
  return u.csaud ?? false;
}
