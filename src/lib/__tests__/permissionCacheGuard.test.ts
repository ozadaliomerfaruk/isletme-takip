import {
  isPermissionNarrowing,
  permissionAccessSignature,
} from '../permissionCacheGuard';
import type { ModuleName, PermissionLevel, Permissions } from '@/types/multiUser';

const MODULES: ModuleName[] = [
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

function permissions(
  overrides: {
    modules?: Partial<Record<ModuleName, boolean>>;
    level?: PermissionLevel;
    visibility?: Partial<Permissions['visibility']>;
  } = {},
): Permissions {
  const modules = Object.fromEntries(
    MODULES.map((moduleName) => [moduleName, false]),
  ) as Record<ModuleName, boolean>;

  return {
    modules: {
      ...modules,
      dashboard: true,
      ...overrides.modules,
    },
    level: overrides.level ?? 'view',
    actions: {},
    visibility: {
      can_see_passive: false,
      can_see_archived: false,
      can_see_all_users_data: false,
      ...overrides.visibility,
    },
  };
}

describe('permission cache narrowing guard', () => {
  it('anahtar sırası farklı aynı erişime aynı imzayı verir', () => {
    const first = permissions({ modules: { cariler: true, urunler: true } });
    const second: Permissions = {
      ...first,
      modules: Object.fromEntries(
        Object.entries(first.modules).reverse(),
      ) as Record<ModuleName, boolean>,
    };

    expect(permissionAccessSignature(second)).toBe(
      permissionAccessSignature(first),
    );
    expect(isPermissionNarrowing(first, second)).toBe(false);
  });

  it('açık bir modül kapanınca daralma sayar', () => {
    const previous = permissions({
      modules: { cariler: true, urunler: true },
    });
    const next = permissions({
      modules: { cariler: true, urunler: false },
    });

    expect(isPermissionNarrowing(previous, next)).toBe(true);
  });

  it('global işlem seviyesi düşünce daralma sayar', () => {
    const previous = permissions({
      modules: { cariler: true },
      level: 'edit_all',
    });
    const next = permissions({
      modules: { cariler: true },
      level: 'view',
    });

    expect(isPermissionNarrowing(previous, next)).toBe(true);
  });

  it('görünürlük kabiliyeti düşünce daralma sayar', () => {
    const previous = permissions({
      modules: { cariler: true },
      visibility: { can_see_all_users_data: true },
    });
    const next = permissions({
      modules: { cariler: true },
      visibility: { can_see_all_users_data: false },
    });

    expect(isPermissionNarrowing(previous, next)).toBe(true);
  });

  it('legacy modül aksiyonu düşünce daralma sayar', () => {
    const previous = permissions({ modules: { cariler: true } });
    delete previous.level;
    previous.actions = {
      cariler: {
        can_create: true,
        can_update_own: true,
        can_update_all: false,
        can_delete_own: true,
        can_delete_all: false,
      },
    };

    const next = permissions({ modules: { cariler: true } });
    delete next.level;
    next.actions = {
      cariler: {
        can_create: true,
        can_update_own: false,
        can_update_all: false,
        can_delete_own: false,
        can_delete_all: false,
      },
    };

    expect(isPermissionNarrowing(previous, next)).toBe(true);
  });

  it('legacy iznin eşdeğer global seviyeye taşınmasını daralma saymaz', () => {
    const previous = permissions({ modules: { cariler: true } });
    delete previous.level;
    previous.actions = {
      cariler: {
        can_create: true,
        can_update_own: true,
        can_update_all: false,
        can_delete_own: true,
        can_delete_all: false,
      },
    };
    const next = permissions({
      modules: { cariler: true },
      level: 'edit_own',
    });

    expect(isPermissionNarrowing(previous, next)).toBe(false);
  });

  it('yalnız genişlemede cache temizliği istemez', () => {
    const previous = permissions({
      modules: { cariler: true, urunler: false },
      level: 'view',
    });
    const next = permissions({
      modules: { cariler: true, urunler: true },
      level: 'edit_all',
      visibility: { can_see_archived: true },
    });

    expect(isPermissionNarrowing(previous, next)).toBe(false);
  });

  it('bir alan genişlerken başka alan kapanırsa yine daralma sayar', () => {
    const previous = permissions({
      modules: { cariler: true, urunler: false },
      level: 'view',
    });
    const next = permissions({
      modules: { cariler: false, urunler: true },
      level: 'edit_all',
    });

    expect(isPermissionNarrowing(previous, next)).toBe(true);
  });

  it('sonraki izin yok veya bozuksa fail-closed daralma sayar', () => {
    const previous = permissions({ modules: { cariler: true } });

    expect(isPermissionNarrowing(previous, null)).toBe(true);
    expect(
      isPermissionNarrowing(
        previous,
        { modules: null } as unknown as Permissions,
      ),
    ).toBe(true);
    expect(
      isPermissionNarrowing(
        previous,
        {
          ...previous,
          level: 'root' as Permissions['level'],
        },
      ),
    ).toBe(true);
  });

  it('ilk izin henüz bilinmiyorsa yeni izin yüklemek daralma değildir', () => {
    expect(
      isPermissionNarrowing(
        null,
        permissions({ modules: { cariler: true } }),
      ),
    ).toBe(false);
  });

  it('eski notlar/birikim alanı yokken açıkça kapatılması daralmadır', () => {
    const previous = permissions();
    delete previous.level;
    delete (previous.modules as Partial<Record<ModuleName, boolean>>).notlar;
    delete (previous.modules as Partial<Record<ModuleName, boolean>>).birikim;

    const next = permissions({
      modules: { notlar: false, birikim: false },
    });

    expect(isPermissionNarrowing(previous, next)).toBe(true);
  });

  it('explicit level varken eksik notlar/birikim deny-by-default yorumlanır', () => {
    const missing = permissions();
    delete (missing.modules as Partial<Record<ModuleName, boolean>>).notlar;
    delete (missing.modules as Partial<Record<ModuleName, boolean>>).birikim;
    const explicitFalse = permissions({
      modules: { notlar: false, birikim: false },
    });

    expect(permissionAccessSignature(missing)).toBe(
      permissionAccessSignature(explicitFalse),
    );
    expect(isPermissionNarrowing(missing, explicitFalse)).toBe(false);
  });

  it('explicit level kaydinda açık notlar/birikim anahtarları kaybolursa cache temizlenir', () => {
    const previous = permissions({
      modules: { notlar: true, birikim: true },
    });
    const next = permissions();
    delete (next.modules as Partial<Record<ModuleName, boolean>>).notlar;
    delete (next.modules as Partial<Record<ModuleName, boolean>>).birikim;

    expect(isPermissionNarrowing(previous, next)).toBe(true);
  });

  it('gecersiz ama acikca yazilmis level eksik modulleri legacy true yapmaz', () => {
    const invalid = permissions();
    invalid.level = 'root' as Permissions['level'];
    delete (invalid.modules as Partial<Record<ModuleName, boolean>>).notlar;
    delete (invalid.modules as Partial<Record<ModuleName, boolean>>).birikim;

    const signature = JSON.parse(
      permissionAccessSignature(invalid),
    ) as { modules: Record<string, boolean> };
    expect(signature.modules.notlar).toBe(false);
    expect(signature.modules.birikim).toBe(false);
  });
});
