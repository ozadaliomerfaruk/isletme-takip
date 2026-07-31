import {
  canAccessHome,
  canShowMainTab,
  getFirstAccessibleMainTabHref,
  getReportRouteAccessModules,
  isOwnerOrManagerRole,
  isTabsHomeRoute,
  type PermissionModuleName,
} from '@/lib/permissionNavigation';

function accessFor(...modules: PermissionModuleName[]) {
  const allowed = new Set<PermissionModuleName>(modules);
  return (module: PermissionModuleName) => allowed.has(module);
}

describe('permission navigation contract', () => {
  it.each([
    ['hesaplar', true],
    ['birikim', true],
    ['raporlar', true],
    ['cariler', false],
    ['personel', false],
    ['urunler', false],
    ['notlar', false],
  ] as const)(
    'shows Home for %s according to the content contract',
    (module, expected) => {
      expect(canAccessHome(accessFor(module))).toBe(expected);
      expect(canShowMainTab('home', accessFor(module))).toBe(expected);
    },
  );

  it('redirects a hidden Home to the first accessible main surface', () => {
    expect(
      getFirstAccessibleMainTabHref(accessFor('cariler', 'personel')),
    ).toBe('/(tabs)/cariler');
    expect(
      getFirstAccessibleMainTabHref(accessFor('personel', 'urunler')),
    ).toBe('/(tabs)/personel');
    expect(
      getFirstAccessibleMainTabHref(accessFor('urunler')),
    ).toBe('/(tabs)/urunler');
    expect(
      getFirstAccessibleMainTabHref(accessFor('notlar')),
    ).toBe('/(tabs)/daha');
    expect(
      getFirstAccessibleMainTabHref(accessFor('raporlar', 'cariler')),
    ).toBe('/(tabs)');
  });

  it('recognizes only the actual tabs index as Home', () => {
    expect(isTabsHomeRoute(['(tabs)'])).toBe(true);
    expect(isTabsHomeRoute(['(tabs)', 'index'])).toBe(true);
    expect(isTabsHomeRoute(['(tabs)', 'cariler'])).toBe(false);
    expect(isTabsHomeRoute(['cariler', 'detail'])).toBe(false);
  });

  it('keeps the report center report-only and contextual reports OR-scoped', () => {
    expect(getReportRouteAccessModules(['raporlar'])).toEqual(['raporlar']);
    expect(
      getReportRouteAccessModules(['raporlar', 'gelir-gider']),
    ).toEqual(['raporlar']);
    expect(getReportRouteAccessModules(['raporlar', 'hesap', 'hesap-id'])).toEqual([
      'raporlar',
      'hesaplar',
    ]);
    expect(getReportRouteAccessModules(['raporlar', 'cari'])).toEqual([
      'raporlar',
      'cariler',
    ]);
    expect(getReportRouteAccessModules(['raporlar', 'personel'])).toEqual([
      'raporlar',
      'personel',
    ]);
    expect(
      getReportRouteAccessModules(['raporlar', 'alis-satis']),
    ).toEqual(['raporlar', 'urunler']);
  });

  it('does not treat a fully-open custom role as a manager', () => {
    expect(isOwnerOrManagerRole(true, 'custom')).toBe(true);
    expect(isOwnerOrManagerRole(false, 'manager')).toBe(true);
    expect(isOwnerOrManagerRole(false, 'custom')).toBe(false);
    expect(isOwnerOrManagerRole(false, 'operator')).toBe(false);
  });
});
