/**
 * KANONİK YETKİ ÇÖZÜMLEYİCİSİNİN REFERANS PORTU (P-B)
 *
 * NE İŞE YARAR: sunucudaki resolver'ın üreteceği yetenek vektörünün güncel
 * `permissions.ts` + `usePermissions.ts` sözleşmesiyle aynı olduğunu kanıtlamak
 * için kullanılan saf (hook'suz, React'siz) referans.
 *
 * KAYNAK:
 *   - src/lib/permissions.ts::deriveEffectiveModules/canAccessPermissionModule
 *   - src/hooks/usePermissions.ts::canCreate/canUpdate/canDelete/canSeeRecord
 *
 * Bozuk JSON için güvenlik sertleştirmesi: permission boolean'larında yalnız
 * gerçek JSON boolean `true` yetki verir. String/number/null/object/array false
 * olur; PostgreSQL text->boolean cast semantiği burada KULLANILMAZ.
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

/** ModuleName sözleşmesindeki bütün modüller — derived/hidden dahil. */
export const PARITE_MODULLERI = [
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
] as const;

export type PariteModulu = (typeof PARITE_MODULLERI)[number];

const GORUNUR_MODULLER = [
  'hesaplar',
  'cariler',
  'urunler',
  'personel',
  'raporlar',
  'notlar',
] as const;
const ISLEM_KAYNAKLARI = ['hesaplar', 'cariler', 'urunler', 'personel'] as const;
const GECERLI_LEVEL = ['view', 'add', 'edit_own', 'edit_all'] as const;

function levelGecerliYaDaLegacy(u: UyelikKaydi): boolean {
  return (
    u.level === null
    || u.level === undefined
    || (
      typeof u.level === 'string'
      && (GECERLI_LEVEL as readonly string[]).includes(u.level)
    )
  );
}

/** Fixture'daki kısaltılmış aksiyon nesnesi. */
export interface AksiyonBayraklari {
  c?: unknown; // can_create
  uo?: unknown; // can_update_own
  ua?: unknown; // can_update_all
  do?: unknown; // can_delete_own
  da?: unknown; // can_delete_all
}

export interface UyelikKaydi {
  id: string;
  status: string;
  level?: unknown;
  modules?: unknown;
  actions?: unknown;
  csaud?: unknown; // visibility.can_see_all_users_data
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

function nesneMi(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactTrue(value: unknown): boolean {
  return value === true;
}

function legacyMi(u: UyelikKaydi): boolean {
  return u.level === null || u.level === undefined;
}

function rawModulAcik(u: UyelikKaydi, modul: string): boolean {
  return nesneMi(u.modules) && exactTrue(u.modules[modul]);
}

function anahtarYok(u: UyelikKaydi, modul: string): boolean {
  return (
    u.modules === null
    || u.modules === undefined
    || (
      nesneMi(u.modules)
      && !Object.prototype.hasOwnProperty.call(u.modules, modul)
    )
  );
}

function gorunurModulBayragi(u: UyelikKaydi, modul: string): boolean {
  if (rawModulAcik(u, modul)) return true;

  // Eski kayıttaki eksik/null modules konteyneri de "anahtar yok" sayılır.
  // Fakat mevcut null/string/number/object/array boolean bayrağı fallback ile
  // true'ya yükseltilmez.
  return (
    legacyMi(u)
    && (modul === 'notlar' || modul === 'birikim')
    && anahtarYok(u, modul)
  );
}

function etkinModul(u: UyelikKaydi, modul: string): boolean {
  if ((GORUNUR_MODULLER as readonly string[]).includes(modul)) {
    return gorunurModulBayragi(u, modul);
  }
  if (modul === 'dashboard') return gorunurModulBayragi(u, 'raporlar');
  if (modul === 'birikim') {
    return rawModulAcik(u, 'hesaplar') && gorunurModulBayragi(u, 'birikim');
  }
  if (modul === 'islemler' || modul === 'ileri_tarihli' || modul === 'arsiv') {
    return ISLEM_KAYNAKLARI.some((kaynak) => rawModulAcik(u, kaynak));
  }
  // Shared kullanıcıda doğrudan yönetilmeyen modüller.
  return false;
}

function aksiyon(u: UyelikKaydi, modul: string): AksiyonBayraklari | null {
  if (!nesneMi(u.actions)) return null;
  const value = u.actions[modul];
  return nesneMi(value) ? value : null;
}

/** canAccessPermissionModule/deriveEffectiveModules referansı. */
export function canAccessModule(u: UyelikKaydi, modul: string, isOwner = false): boolean {
  if (isOwner) return true;
  if (!levelGecerliYaDaLegacy(u)) return false;
  return etkinModul(u, modul);
}

/**
 * usePermissions.canCreate — fallback UYGULANMAZ.
 * Raw modül bayrağı exact JSON boolean true değilse doğrudan false.
 */
export function canCreate(u: UyelikKaydi, modul: string, isOwner = false): boolean {
  if (isOwner) return true;
  if (!levelGecerliYaDaLegacy(u)) return false;
  if (!canAccessModule(u, modul) || !rawModulAcik(u, modul)) return false;
  if (!legacyMi(u)) {
    return (
      typeof u.level === 'string'
      && ['add', 'edit_own', 'edit_all'].includes(u.level)
    );
  }
  return exactTrue(aksiyon(u, modul)?.c);
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
  if (!canAccessModule(u, modul) || !rawModulAcik(u, modul)) return false;
  if (!legacyMi(u)) {
    if (u.level === 'edit_all') return true;
    if (u.level === 'edit_own') return createdBy === selfId;
    return false;
  }
  const a = aksiyon(u, modul);
  if (exactTrue(a?.ua)) return true;
  if (exactTrue(a?.uo) && createdBy === selfId) return true;
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
  if (!canAccessModule(u, modul) || !rawModulAcik(u, modul)) return false;
  if (!legacyMi(u)) {
    if (u.level === 'edit_all') return true;
    if (u.level === 'edit_own') return createdBy === selfId;
    return false;
  }
  const a = aksiyon(u, modul);
  if (exactTrue(a?.da)) return true;
  if (exactTrue(a?.do) && createdBy === selfId) return true;
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
  return levelGecerliYaDaLegacy(u);
}
