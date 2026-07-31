/**
 * P-B ④ — YETENEK VEKTÖRÜ PARİTE TESTİ
 *
 * NE KANITLIYOR: kanonik resolver'ın üreteceği yetenek vektörü, bugünkü
 * `usePermissions` semantiğiyle BİREBİR aynı. Kabul: İSTİSNASIZ SIFIR SAPMA.
 *
 * NE KANITLAMIYOR: fixture bugünkü 24 üyeliğin ANLIK GÖRÜNTÜSÜDÜR. Üretimde
 * bulunmayan izin biçimlerini kapsamaz — bu yüzden S1..S12 sentetik sınır ve
 * asimetri vakaları ayrıca test edilir.
 *
 * D-N1 BURADA YOK: `notlar` aksiyon kapısı resolver semantiği değil, P-C1'deki
 * POLİTİKA değişikliğidir. Bu karşılaştırmanın istisnası DEĞİLDİR.
 */

import fs from 'fs';
import path from 'path';
import { renderHook } from '@testing-library/react-native';
import { ALL_MODULES, canAccessPermissionModule } from '../permissions';
import { usePermissions } from '../../hooks/usePermissions';
import type { ModuleName, Permissions } from '../../types/multiUser';
import {
  PARITE_MODULLERI,
  yetenekVektoru,
  canSeeAllUsersData,
  canAccessModule,
  canCreate,
  canUpdate,
  canDelete,
  type UyelikKaydi,
  type YetenekVektoru,
} from '../permissionResolver.reference';

const mockUseAuthContext = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

const FIXTURE = path.resolve(
  __dirname,
  '../../../docs/security/db-snapshots/2026-07-26/isletme-users-permissions.anon.json'
);

const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as {
  uyelikler: UyelikKaydi[];
};
const UYELIKLER = fixture.uyelikler;

const YETENEKLER: (keyof YetenekVektoru)[] = [
  'can_view',
  'can_create',
  'can_update_own',
  'can_update_all',
  'can_delete_own',
  'can_delete_all',
];

const SELF = 'self-user-id';
const OTHER = 'other-user-id';

/**
 * "Sunucu resolver'ı" yerine geçen bağımsız hesap.
 * Referans porttan FARKLI bir yoldan aynı sonuca varmalı: burada vektörü
 * tek tek yetenek fonksiyonlarından değil, doğrudan kurallardan üretiyoruz.
 * Böylece test kendi kendini doğrulamaz (tautology değil).
 */
function sunucuVektoru(u: UyelikKaydi, modul: string): YetenekVektoru {
  if (u.status !== 'active') {
    return {
      can_view: false, can_create: false,
      can_update_own: false, can_update_all: false,
      can_delete_own: false, can_delete_all: false,
    };
  }
  const modKaydi =
    typeof u.modules === 'object'
    && u.modules !== null
    && !Array.isArray(u.modules)
      ? u.modules as Record<string, unknown>
      : null;
  const legacy = u.level === null || u.level === undefined;
  const levelGecerli =
    legacy
    || (
      typeof u.level === 'string'
      && ['view', 'add', 'edit_own', 'edit_all'].includes(u.level)
    );
  if (!levelGecerli) {
    return {
      can_view: false, can_create: false,
      can_update_own: false, can_update_all: false,
      can_delete_own: false, can_delete_all: false,
    };
  }

  const exactModul = (m: string) => modKaydi?.[m] === true;
  const eksikLegacy = (m: string) => (
    legacy
    && (
      u.modules === null
      || u.modules === undefined
      || (
        modKaydi !== null
        && !Object.prototype.hasOwnProperty.call(modKaydi, m)
      )
    )
  );
  const kaynakAcik = ['hesaplar', 'cariler', 'urunler', 'personel']
    .some(exactModul);
  const gorunur = (() => {
    if (modul === 'dashboard') return exactModul('raporlar');
    if (['hesaplar', 'cariler', 'urunler', 'personel', 'raporlar'].includes(modul)) {
      return exactModul(modul);
    }
    if (modul === 'notlar') return exactModul(modul) || eksikLegacy(modul);
    if (modul === 'birikim') {
      return exactModul('hesaplar') && (exactModul('birikim') || eksikLegacy('birikim'));
    }
    if (['islemler', 'ileri_tarihli', 'arsiv'].includes(modul)) return kaynakAcik;
    return false;
  })();

  // Aksiyonlar fallback/derived görünürlük kullanmaz: raw modül exact true olmalı.
  if (!gorunur || !exactModul(modul)) {
    return {
      can_view: gorunur, can_create: false,
      can_update_own: false, can_update_all: false,
      can_delete_own: false, can_delete_all: false,
    };
  }

  if (!legacy) {
    const hepsi = u.level === 'edit_all';
    const kendi = u.level === 'edit_own' || hepsi;
    return {
      can_view: gorunur,
      can_create:
        typeof u.level === 'string'
        && ['add', 'edit_own', 'edit_all'].includes(u.level),
      can_update_own: kendi,
      can_update_all: hepsi,
      can_delete_own: kendi,
      can_delete_all: hepsi,
    };
  }

  const aksiyonKaydi =
    typeof u.actions === 'object'
    && u.actions !== null
    && !Array.isArray(u.actions)
      ? u.actions as Record<string, unknown>
      : null;
  const hamAksiyon = aksiyonKaydi?.[modul];
  const a =
    typeof hamAksiyon === 'object'
    && hamAksiyon !== null
    && !Array.isArray(hamAksiyon)
      ? hamAksiyon as Record<string, unknown>
      : null;
  return {
    can_view: gorunur,
    can_create: a?.c === true,
    can_update_own: a?.ua === true || a?.uo === true,
    can_update_all: a?.ua === true,
    can_delete_own: a?.da === true || a?.do === true,
    can_delete_all: a?.da === true,
  };
}

function runtimePermissions(u: UyelikKaydi): Permissions {
  const actions: Permissions['actions'] = {};
  if (
    typeof u.actions === 'object'
    && u.actions !== null
    && !Array.isArray(u.actions)
  ) {
    for (const [modul, ham] of Object.entries(u.actions)) {
      if (typeof ham !== 'object' || ham === null || Array.isArray(ham)) continue;
      const a = ham as Record<string, unknown>;
      actions[modul] = {
        can_create: a.c as boolean,
        can_update_own: a.uo as boolean,
        can_update_all: a.ua as boolean,
        can_delete_own: a.do as boolean,
        can_delete_all: a.da as boolean,
      };
    }
  }

  return {
    modules: u.modules,
    level: u.level,
    actions,
    visibility: {
      can_see_passive: false,
      can_see_archived: true,
      can_see_all_users_data: u.csaud,
    },
  } as unknown as Permissions;
}

function hookVektoru(
  hook: ReturnType<typeof usePermissions>,
  modul: ModuleName,
): YetenekVektoru {
  return {
    can_view: hook.canAccessModule(modul),
    can_create: hook.canCreate(modul),
    can_update_own: hook.canUpdate(modul, SELF),
    can_update_all: hook.canUpdate(modul, OTHER),
    can_delete_own: hook.canDelete(modul, SELF),
    can_delete_all: hook.canDelete(modul, OTHER),
  };
}

describe('P-B ④: bütün modüllerde parite — İSTİSNASIZ SIFIR SAPMA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fixture 24 üyelik içeriyor', () => {
    expect(UYELIKLER).toHaveLength(24);
    expect(UYELIKLER.filter((u) => u.status === 'active')).toHaveLength(23);
  });

  it('parite modülleri production ALL_MODULES ile birebir', () => {
    expect(PARITE_MODULLERI).toEqual(ALL_MODULES);
  });

  it('24 üyelik × 14 modül × 6 yetenek = 2016 hücrede SQL modeliyle sapma YOK', () => {
    const sapmalar: string[] = [];
    let hucre = 0;

    for (const u of UYELIKLER) {
      for (const modul of PARITE_MODULLERI) {
        const referans = yetenekVektoru(u, modul);
        const sunucu = sunucuVektoru(u, modul);
        for (const y of YETENEKLER) {
          hucre++;
          if (referans[y] !== sunucu[y]) {
            sapmalar.push(`${u.id}/${modul}/${y}: usePermissions=${referans[y]} resolver=${sunucu[y]}`);
          }
        }
      }
    }

    expect(hucre).toBe(2016);
    expect(sapmalar).toEqual([]);
  });

  it('aktif fixture üyelerinde reference, gerçek usePermissions hookuyla birebir', () => {
    for (const u of UYELIKLER.filter((x) => x.status === 'active')) {
      mockUseAuthContext.mockReturnValue({
        isOwner: false,
        currentPermissions: runtimePermissions(u),
        currentUserRole: 'custom',
        user: { id: SELF },
        isSharedMode: true,
      });
      const { result, unmount } = renderHook(() => usePermissions());

      for (const modul of PARITE_MODULLERI) {
        expect(hookVektoru(result.current, modul)).toEqual(
          yetenekVektoru(u, modul),
        );
        expect(
          canAccessPermissionModule(runtimePermissions(u), modul),
        ).toBe(canAccessModule(u, modul));
      }
      expect(result.current.canSeeRecord(OTHER)).toBe(canSeeAllUsersData(u));
      unmount();
    }
  });

  it('can_see_all_users_data: geçerli aktif üyelikte creator filtresi uygulanmaz', () => {
    for (const u of UYELIKLER) {
      const legacy = u.level === null || u.level === undefined;
      const validLevel =
        typeof u.level === 'string'
        && ['view', 'add', 'edit_own', 'edit_all'].includes(u.level);
      const beklenen =
        u.status === 'active'
        && (legacy || validLevel);
      expect(canSeeAllUsersData(u)).toBe(beklenen);
    }
  });

  it('gerçek vaka: eski csaud=false bayrağı okuma kapsamını daraltmaz', () => {
    const csaudFalse = UYELIKLER.filter((u) => u.status === 'active' && u.csaud === false);
    expect(csaudFalse.length).toBeGreaterThan(0);
    for (const u of csaudFalse) expect(canSeeAllUsersData(u)).toBe(true);
  });

  it('gerçek vaka: level’i olmayan 8 aktif legacy üyelik var', () => {
    const legacy = UYELIKLER.filter((u) => u.status === 'active' && !u.level);
    expect(legacy).toHaveLength(8);
  });

  it('legacy üyeliklerde notlar anahtarı YOK → görünür ama yazma actions’a bağlı', () => {
    const legacy = UYELIKLER.filter((u) => u.status === 'active' && !u.level);
    for (const u of legacy) {
      const modules = u.modules as Record<string, unknown> | null;
      expect(modules?.notlar).toBeUndefined();
      expect(canAccessModule(u, 'notlar')).toBe(true); // fallback: görünür
      expect(canCreate(u, 'notlar')).toBe(false); // fallback aksiyona UYGULANMAZ
    }
  });
});

// ---------------------------------------------------------------------------
// SENTETİK SINIR, ASİMETRİ VE BOZUK-JSON VAKALARI
// Üretim fixture'ında olmayan kombinasyonlar bütün-modül matrisini tamamlar.
// ---------------------------------------------------------------------------

const bos = (over: Partial<UyelikKaydi> = {}): UyelikKaydi => ({
  id: 'sentetik',
  status: 'active',
  level: null,
  modules: {},
  actions: {},
  csaud: null,
  ...over,
});

describe('P-B ④: sentetik sınır ve asimetri vakaları', () => {
  it('S1 — can_delete_all=true, can_create=false → create REDDEDİLİR (collapse olsaydı geçerdi)', () => {
    const u = bos({
      modules: { cariler: true },
      actions: { cariler: { c: false, uo: false, ua: false, do: false, da: true } },
    });
    expect(canCreate(u, 'cariler')).toBe(false);
    expect(canDelete(u, 'cariler', OTHER)).toBe(true);
    expect(sunucuVektoru(u, 'cariler')).toEqual(yetenekVektoru(u, 'cariler'));
  });

  it('S2 — yalnız can_create → update/delete REDDEDİLİR', () => {
    const u = bos({
      modules: { cariler: true },
      actions: { cariler: { c: true, uo: false, ua: false, do: false, da: false } },
    });
    expect(canCreate(u, 'cariler')).toBe(true);
    expect(canUpdate(u, 'cariler', SELF)).toBe(false);
    expect(canDelete(u, 'cariler', SELF)).toBe(false);
  });

  it('S3 — can_update_own → yalnız KENDİ kaydı', () => {
    const u = bos({
      modules: { cariler: true },
      actions: { cariler: { c: false, uo: true, ua: false, do: false, da: false } },
    });
    expect(canUpdate(u, 'cariler', SELF)).toBe(true);
    expect(canUpdate(u, 'cariler', OTHER)).toBe(false);
  });

  it('S4 — bir modülde açık aksiyon diğerine TAŞINMAZ', () => {
    const u = bos({
      modules: { cariler: true, personel: true },
      actions: {
        cariler: { c: true, uo: true, ua: true, do: true, da: true },
        personel: { c: false, uo: false, ua: false, do: false, da: false },
      },
    });
    expect(canCreate(u, 'cariler')).toBe(true);
    expect(canCreate(u, 'personel')).toBe(false);
    expect(canUpdate(u, 'personel', OTHER)).toBe(false);
  });

  it('S5 — level VE actions birlikte varsa level esas alınır', () => {
    const u = bos({
      level: 'view',
      modules: { cariler: true },
      actions: { cariler: { c: true, uo: true, ua: true, do: true, da: true } },
    });
    expect(canCreate(u, 'cariler')).toBe(false); // level=view kazanır
    expect(canUpdate(u, 'cariler', SELF)).toBe(false);
  });

  it('S6 — bilinmeyen level → istemci ve sunucu FAIL-CLOSED', () => {
    const u = bos({ level: 'süper', modules: { cariler: true } });

    // SUNUCU: allowlist dışı → HER ŞEY deny.
    expect(sunucuVektoru(u, 'cariler')).toEqual({
      can_view: false, can_create: false,
      can_update_own: false, can_update_all: false,
      can_delete_own: false, can_delete_all: false,
    });

    // İSTEMCİ referansı da aynı allowlist'i kullanır; bozuk JSONB görünürlük veya
    // yazma hakkı üretemez.
    expect(canAccessModule(u, 'cariler')).toBe(false);
    expect(canCreate(u, 'cariler')).toBe(false);
    expect(sunucuVektoru(u, 'cariler')).toEqual(yetenekVektoru(u, 'cariler'));
  });

  it('S6b — allowlist içindeki dört level’da sapma YOK', () => {
    for (const lvl of ['view', 'add', 'edit_own', 'edit_all']) {
      const u = bos({ level: lvl, modules: { cariler: true } });
      expect(sunucuVektoru(u, 'cariler')).toEqual(yetenekVektoru(u, 'cariler'));
    }
  });

  it('S6c — level="add": create ✅, update/delete ❌', () => {
    const u = bos({ level: 'add', modules: { cariler: true } });
    const v = sunucuVektoru(u, 'cariler');
    expect(v.can_create).toBe(true);
    expect(v.can_update_own).toBe(false);
    expect(v.can_delete_all).toBe(false);
  });

  it('S7 — actions var, modules YOK → deny (notlar/birikim hariç görünürlük)', () => {
    const u = bos({
      modules: {},
      actions: { cariler: { c: true, uo: true, ua: true, do: true, da: true } },
    });
    expect(canAccessModule(u, 'cariler')).toBe(false);
    expect(canCreate(u, 'cariler')).toBe(false);
    expect(canAccessModule(u, 'notlar')).toBe(true); // fallback yalnız görünürlük
    expect(canCreate(u, 'notlar')).toBe(false);
  });

  it('S8 — legacy modules=null: yalnız notlar fallback görünür, tüm yazmalar deny', () => {
    const u = bos({ modules: null, actions: null });
    for (const modul of PARITE_MODULLERI) {
      const v = yetenekVektoru(u, modul);
      expect(sunucuVektoru(u, modul)).toEqual(v);
      expect(v.can_view).toBe(modul === 'notlar');
      expect(v.can_create).toBe(false);
      expect(v.can_update_all).toBe(false);
      expect(v.can_delete_all).toBe(false);
    }
    expect(canSeeAllUsersData(u)).toBe(true);
  });

  it('S9 — modules.notlar=true ama actions.notlar YOK → okuma ✅ / yazma ❌ (D-N1 hedefi)', () => {
    const u = bos({ modules: { notlar: true }, actions: {} });
    expect(canAccessModule(u, 'notlar')).toBe(true);
    expect(canCreate(u, 'notlar')).toBe(false);
    expect(canUpdate(u, 'notlar', SELF)).toBe(false);
    expect(canDelete(u, 'notlar', SELF)).toBe(false);
  });

  it('S10 — legacy visibility bayrağı yokken de açık modül read-all kalır', () => {
    expect(canSeeAllUsersData(bos({ csaud: null }))).toBe(true);
  });

  it('S11 — status=removed → tüm yetenekler false', () => {
    const u = bos({
      status: 'removed',
      level: 'edit_all',
      modules: { cariler: true, notlar: true },
      actions: { cariler: { c: true, uo: true, ua: true, do: true, da: true } },
      csaud: true,
    });
    for (const modul of PARITE_MODULLERI) {
      expect(yetenekVektoru(u, modul)).toEqual({
        can_view: false, can_create: false,
        can_update_own: false, can_update_all: false,
        can_delete_own: false, can_delete_all: false,
      });
    }
    expect(canSeeAllUsersData(u)).toBe(false);
  });

  it('S12 — aynı kullanıcının iki işletmedeki izni KARIŞMAZ', () => {
    const a = bos({ id: 'isl-A', modules: { cariler: true }, actions: { cariler: { c: true, uo: false, ua: false, do: false, da: false } } });
    const b = bos({ id: 'isl-B', modules: { cariler: false }, actions: { cariler: { c: true, uo: true, ua: true, do: true, da: true } } });
    expect(canCreate(a, 'cariler')).toBe(true);
    expect(canCreate(b, 'cariler')).toBe(false); // modül kapalı → aksiyon okunmaz
  });

  it('S13 — derived modüller görünür olsa da raw flag yoksa yazma hakkı üretmez', () => {
    const u = bos({
      level: 'edit_all',
      modules: { cariler: true },
    });
    for (const modul of ['islemler', 'ileri_tarihli', 'arsiv']) {
      expect(canAccessModule(u, modul)).toBe(true);
      expect(canCreate(u, modul)).toBe(false);
      expect(canUpdate(u, modul, SELF)).toBe(false);
      expect(canDelete(u, modul, SELF)).toBe(false);
      expect(sunucuVektoru(u, modul)).toEqual(yetenekVektoru(u, modul));
    }
  });

  it('S14 — birikim Hesaplar ile AND bağlı; legacy fallback tek başına açamaz', () => {
    const hesapKapali = bos({ modules: {} });
    const hesapAcik = bos({ modules: { hesaplar: true } });
    expect(canAccessModule(hesapKapali, 'birikim')).toBe(false);
    expect(canAccessModule(hesapAcik, 'birikim')).toBe(true);
    expect(canCreate(hesapAcik, 'birikim')).toBe(false);
  });

  it('S15 — mevcut null/string/number/object/array modül bayrağı asla true değildir', () => {
    const bozukDegerler: unknown[] = [null, 'true', 'yes', 'on', '1', 1, {}, []];
    for (const deger of bozukDegerler) {
      const u = bos({
        modules: { cariler: deger, notlar: deger },
        actions: {
          cariler: { c: true, uo: true, ua: true, do: true, da: true },
        },
      });
      expect(canAccessModule(u, 'cariler')).toBe(false);
      expect(canAccessModule(u, 'notlar')).toBe(false);
      expect(canCreate(u, 'cariler')).toBe(false);
      expect(sunucuVektoru(u, 'cariler')).toEqual(yetenekVektoru(u, 'cariler'));
    }
  });

  it('S16 — legacy action bozuk değerleri yazma vermez; okuma creator filtresizdir', () => {
    const bozukDegerler: unknown[] = [null, 'true', 'yes', 'on', '1', 1, {}, []];
    for (const deger of bozukDegerler) {
      const u = bos({
        modules: { cariler: true },
        actions: {
          cariler: { c: deger, uo: deger, ua: deger, do: deger, da: deger },
        },
        csaud: deger,
      });
      expect(yetenekVektoru(u, 'cariler')).toEqual({
        can_view: true,
        can_create: false,
        can_update_own: false,
        can_update_all: false,
        can_delete_own: false,
        can_delete_all: false,
      });
      expect(canSeeAllUsersData(u)).toBe(true);
      expect(sunucuVektoru(u, 'cariler')).toEqual(yetenekVektoru(u, 'cariler'));
    }
  });

  it('S17 — bilinmeyen level bütün yetenekleri fail-closed kapatır', () => {
    const u = bos({
      level: 'gelecek-seviye',
      modules: { cariler: true },
      csaud: true,
    });
    expect(yetenekVektoru(u, 'cariler')).toEqual({
      can_view: false,
      can_create: false,
      can_update_own: false,
      can_update_all: false,
      can_delete_own: false,
      can_delete_all: false,
    });
    expect(canSeeAllUsersData(u)).toBe(false);
  });

  it('canlı fixture’da allowlist dışı level YOK', () => {
    const gecerli = [null, 'view', 'add', 'edit_own', 'edit_all'];
    for (const u of UYELIKLER) {
      expect(gecerli).toContain(u.level);
    }
  });

  it('sentetik vakaların HEPSİNDE sunucu modeli ile referans aynı', () => {
    const vakalar = [
      bos({ modules: { cariler: true }, actions: { cariler: { c: false, uo: false, ua: false, do: false, da: true } } }),
      bos({ level: 'edit_own', modules: { cariler: true } }),
      bos({ level: 'edit_all', modules: { cariler: true } }),
      bos({ level: 'view', modules: { cariler: true } }),
      bos({ modules: null, actions: null }),
      bos({ status: 'removed', level: 'edit_all', modules: { cariler: true } }),
      bos({ modules: { notlar: true } }),
      bos({ modules: {} }),
    ];
    for (const u of vakalar) {
      for (const modul of PARITE_MODULLERI) {
        expect(sunucuVektoru(u, modul)).toEqual(yetenekVektoru(u, modul));
      }
    }
  });
});
