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
  const modulAcik = u.modules?.[modul];
  const gorunur =
    modulAcik === undefined || modulAcik === null
      ? modul === 'notlar' || modul === 'birikim'
      : modulAcik;

  // Aksiyonlar fallback KULLANMAZ: modül açıkça true değilse hepsi false.
  if (!modulAcik) {
    return {
      can_view: gorunur, can_create: false,
      can_update_own: false, can_update_all: false,
      can_delete_own: false, can_delete_all: false,
    };
  }

  if (u.level) {
    // 🔒 AÇIK ALLOWLIST — FAIL-CLOSED. Bilinmeyen level -> her şey deny.
    if (!['view', 'add', 'edit_own', 'edit_all'].includes(u.level)) {
      return {
        can_view: false, can_create: false,
        can_update_own: false, can_update_all: false,
        can_delete_own: false, can_delete_all: false,
      };
    }
    const hepsi = u.level === 'edit_all';
    const kendi = u.level === 'edit_own' || hepsi;
    return {
      can_view: gorunur,
      can_create: ['add', 'edit_own', 'edit_all'].includes(u.level),
      can_update_own: kendi,
      can_update_all: hepsi,
      can_delete_own: kendi,
      can_delete_all: hepsi,
    };
  }

  const a = u.actions?.[modul];
  return {
    can_view: gorunur,
    can_create: a?.c ?? false,
    can_update_own: (a?.ua ?? false) || (a?.uo ?? false),
    can_update_all: a?.ua ?? false,
    can_delete_own: (a?.da ?? false) || (a?.do ?? false),
    can_delete_all: a?.da ?? false,
  };
}

describe('P-B ④: 864 hücrelik parite — İSTİSNASIZ SIFIR SAPMA', () => {
  it('fixture 24 üyelik içeriyor', () => {
    expect(UYELIKLER).toHaveLength(24);
    expect(UYELIKLER.filter((u) => u.status === 'active')).toHaveLength(23);
  });

  it('24 üyelik × 6 modül × 6 yetenek = 864 hücrede sapma YOK', () => {
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

    expect(hucre).toBe(864);
    expect(sapmalar).toEqual([]);
  });

  it('can_see_all_users_data: yok → false (deny-by-default)', () => {
    for (const u of UYELIKLER) {
      const beklenen = u.status === 'active' ? (u.csaud ?? false) : false;
      expect(canSeeAllUsersData(u)).toBe(beklenen);
    }
  });

  it('gerçek vaka: csaud=false olan aktif üyelik mevcut ve korunuyor', () => {
    const csaudFalse = UYELIKLER.filter((u) => u.status === 'active' && u.csaud === false);
    expect(csaudFalse.length).toBeGreaterThan(0);
    for (const u of csaudFalse) expect(canSeeAllUsersData(u)).toBe(false);
  });

  it('gerçek vaka: level’i olmayan 8 aktif legacy üyelik var', () => {
    const legacy = UYELIKLER.filter((u) => u.status === 'active' && !u.level);
    expect(legacy).toHaveLength(8);
  });

  it('legacy üyeliklerde notlar anahtarı YOK → görünür ama yazma actions’a bağlı', () => {
    const legacy = UYELIKLER.filter((u) => u.status === 'active' && !u.level);
    for (const u of legacy) {
      expect(u.modules?.notlar).toBeUndefined();
      expect(canAccessModule(u, 'notlar')).toBe(true); // fallback: görünür
      expect(canCreate(u, 'notlar')).toBe(false); // fallback aksiyona UYGULANMAZ
    }
  });
});

// ---------------------------------------------------------------------------
// S1..S12 — SENTETİK SINIR VE ASİMETRİ VAKALARI
// Üretimde örneği olmayan kombinasyonlar; 864 hücre bunları kapsamaz.
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

  it('S8 — tamamen boş permissions → her şey deny', () => {
    const u = bos({ modules: null, actions: null });
    for (const modul of PARITE_MODULLERI) {
      const v = yetenekVektoru(u, modul);
      expect(v.can_create).toBe(false);
      expect(v.can_update_all).toBe(false);
      expect(v.can_delete_all).toBe(false);
    }
    expect(canSeeAllUsersData(u)).toBe(false);
  });

  it('S9 — modules.notlar=true ama actions.notlar YOK → okuma ✅ / yazma ❌ (D-N1 hedefi)', () => {
    const u = bos({ modules: { notlar: true }, actions: {} });
    expect(canAccessModule(u, 'notlar')).toBe(true);
    expect(canCreate(u, 'notlar')).toBe(false);
    expect(canUpdate(u, 'notlar', SELF)).toBe(false);
    expect(canDelete(u, 'notlar', SELF)).toBe(false);
  });

  it('S10 — can_see_all_users_data YOK → false', () => {
    expect(canSeeAllUsersData(bos({ csaud: null }))).toBe(false);
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

  it('canlı fixture’da allowlist dışı level YOK — S6 sapması sıfır-etkili', () => {
    const gecerli = [null, 'view', 'add', 'edit_own', 'edit_all'];
    for (const u of UYELIKLER) {
      expect(gecerli).toContain(u.level);
    }
  });

  it('sentetik vakaların HEPSİNDE sunucu ile referans aynı (bilinmeyen level HARİÇ)', () => {
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
