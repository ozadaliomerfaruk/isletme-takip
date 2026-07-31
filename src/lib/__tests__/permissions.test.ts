import type { ModuleName, PermissionLevel, Permissions } from '@/types/multiUser';
import {
  buildPermissions,
  canAccessPermissionModule,
  canExportPermissionModule,
  canSharePublicCariStatement,
  deriveEffectiveModules,
  deriveLevel,
  hasFullTransactionSourceAccess,
  rolePresetPermissions,
} from '../permissions';

const visibleSelection = (
  enabled: ModuleName[],
): Partial<Record<ModuleName, boolean>> => {
  const modules: Partial<Record<ModuleName, boolean>> = {};
  for (const module of enabled) modules[module] = true;
  return modules;
};

describe('istemci yetki çekirdeği — deny by default', () => {
  it('Cariler + Ürünler özel rolünde yalnız görünür seçimleri ve güvenli türevleri açar', () => {
    const permissions = buildPermissions(
      visibleSelection(['cariler', 'urunler']),
      'view',
    );

    expect(permissions.modules).toMatchObject({
      dashboard: false,
      cariler: true,
      urunler: true,
      hesaplar: false,
      birikim: false,
      personel: false,
      raporlar: false,
      notlar: false,
      islemler: true,
      ileri_tarihli: true,
      arsiv: true,
      kategoriler: false,
      ayarlar: false,
      cekler: false,
    });
  });

  it('view seviyesi açık modülde export/public ekstreyi açar ama hiçbir yazma aksiyonu vermez', () => {
    const permissions = buildPermissions(
      visibleSelection(['cariler', 'urunler']),
      'view',
    );

    expect(canExportPermissionModule(permissions, 'cariler')).toBe(true);
    expect(canExportPermissionModule(permissions, 'urunler')).toBe(true);
    expect(canExportPermissionModule(permissions, 'raporlar')).toBe(false);
    expect(canSharePublicCariStatement(permissions)).toBe(true);
    expect(permissions.actions.cariler).toMatchObject({
      can_create: false,
      can_update_own: false,
      can_update_all: false,
      can_delete_own: false,
      can_delete_all: false,
    });
  });

  it('public ekstre linkini yazma seviyesine değil Cariler modülüne bağlar', () => {
    const reportsOnly = buildPermissions(
      visibleSelection(['raporlar']),
      'edit_all',
    );
    const carilerView = buildPermissions(
      visibleSelection(['cariler']),
      'view',
    );

    expect(canSharePublicCariStatement(reportsOnly)).toBe(false);
    expect(canSharePublicCariStatement(carilerView)).toBe(true);
  });

  it('gizli modül bayraklarını girdiden körlemesine kabul etmez', () => {
    const modules = deriveEffectiveModules({
      islemler: true,
      ileri_tarihli: true,
      arsiv: true,
      kategoriler: true,
      ayarlar: true,
      cekler: true,
    });

    expect(modules.dashboard).toBe(false);
    expect(modules.islemler).toBe(false);
    expect(modules.ileri_tarihli).toBe(false);
    expect(modules.arsiv).toBe(false);
    expect(modules.kategoriler).toBe(false);
    expect(modules.ayarlar).toBe(false);
    expect(modules.cekler).toBe(false);
  });

  it.each<ModuleName>(['hesaplar', 'cariler', 'urunler', 'personel'])(
    '%s tek başına işlem, ileri tarihli ve kendi arşiv yüzeyini türetir',
    (module) => {
      const effective = deriveEffectiveModules({ [module]: true });
      expect(effective.islemler).toBe(true);
      expect(effective.ileri_tarihli).toBe(true);
      expect(effective.arsiv).toBe(true);
    },
  );

  it('geniş işlem bağlamını yalnız dört kaynak modülün tamamında açar', () => {
    const full = buildPermissions(
      visibleSelection(['hesaplar', 'cariler', 'urunler', 'personel']),
      'edit_all',
    );
    const missingProduct = buildPermissions(
      visibleSelection(['hesaplar', 'cariler', 'personel']),
      'edit_all',
    );

    expect(hasFullTransactionSourceAccess(full)).toBe(true);
    expect(hasFullTransactionSourceAccess(missingProduct)).toBe(false);
  });

  it('geniş işlem bağlamı görünürlük yeteneğidir; view seviyesinde de güvenle okunabilir', () => {
    const permissions = buildPermissions(
      visibleSelection(['hesaplar', 'cariler', 'urunler', 'personel']),
      'view',
    );

    expect(hasFullTransactionSourceAccess(permissions)).toBe(true);
    expect(permissions.actions.islemler?.can_create).toBe(false);
  });

  it.each<ModuleName>(['raporlar', 'notlar'])(
    '%s tek başına finansal işlem veya arşiv yüzeyi açmaz',
    (module) => {
      const effective = deriveEffectiveModules({ [module]: true });
      expect(effective[module]).toBe(true);
      expect(effective.islemler).toBe(false);
      expect(effective.ileri_tarihli).toBe(false);
      expect(effective.arsiv).toBe(false);
    },
  );

  it('Birikim yalnız Hesaplar ile birlikte etkinleşir', () => {
    expect(deriveEffectiveModules({ birikim: true }).birikim).toBe(false);
    expect(
      deriveEffectiveModules({ hesaplar: true, birikim: true }).birikim,
    ).toBe(true);
  });

  it('kategori yönetimini manager/operator presetleri dahil shared kullanıcıya açmaz', () => {
    for (const role of ['manager', 'operator'] as const) {
      const permissions = rolePresetPermissions(role);
      expect(permissions.modules.kategoriler).toBe(false);
      expect(permissions.modules.ayarlar).toBe(false);
      expect(permissions.actions.kategoriler).toBeUndefined();
    }
  });

  it('bilinmeyen yeni seviye build aşamasında görünür modül ve aksiyon üretmez', () => {
    const invalidLevel = 'super_admin' as PermissionLevel;
    const permissions = buildPermissions({ cariler: true }, invalidLevel);

    expect(permissions.level).toBe('view');
    expect(permissions.modules.dashboard).toBe(false);
    expect(permissions.modules.cariler).toBe(false);
    expect(permissions.modules.islemler).toBe(false);
    expect(permissions.actions.cariler).toBeUndefined();
  });

  it('bilinmeyen JSONB seviyesi görünürlükte de fail-closed davranır', () => {
    const permissions = {
      ...buildPermissions({ cariler: true }, 'edit_all'),
      level: 'super_admin',
    } as unknown as Permissions;

    expect(canAccessPermissionModule(permissions, 'dashboard')).toBe(false);
    expect(canAccessPermissionModule(permissions, 'cariler')).toBe(false);
    expect(deriveLevel(permissions)).toBe('view');
  });

  it('legacy notlar/birikim fallbackini yalnız eski kayıtta ve Hesaplar bağıyla korur', () => {
    const legacy = {
      modules: { hesaplar: true },
      actions: {},
      visibility: {
        can_see_passive: false,
        can_see_archived: false,
        can_see_all_users_data: false,
      },
    } as unknown as Permissions;

    expect(canAccessPermissionModule(legacy, 'notlar')).toBe(true);
    expect(canAccessPermissionModule(legacy, 'birikim')).toBe(true);

    const legacyWithoutAccounts = {
      ...legacy,
      modules: {},
    } as unknown as Permissions;
    expect(canAccessPermissionModule(legacyWithoutAccounts, 'birikim')).toBe(false);
  });

  it('pasif kayit gorunurlugunu owner disindaki hicbir role vermez', () => {
    expect(rolePresetPermissions('manager').visibility.can_see_passive).toBe(false);
    expect(rolePresetPermissions('operator').visibility.can_see_passive).toBe(false);
    expect(rolePresetPermissions('custom').visibility.can_see_passive).toBe(false);
  });

  it('dashboard yalniz Raporlar modülünden türetilir', () => {
    expect(deriveEffectiveModules({ cariler: true }).dashboard).toBe(false);
    expect(deriveEffectiveModules({ hesaplar: true }).dashboard).toBe(false);
    expect(deriveEffectiveModules({ raporlar: true }).dashboard).toBe(true);
  });
});
