import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('permission navigation UI wiring', () => {
  it('uses the same Home contract in the persistent bar and tabs layout', () => {
    const bar = read('src/components/ui/PersistentTabBar.tsx');
    const layout = read('src/app/(tabs)/_layout.tsx');

    expect(bar).toContain('canShowMainTab(');
    expect(layout).toContain('canAccessHome(canAccessModule)');
    expect(layout).toContain('getFirstAccessibleMainTabHref(canAccessModule)');
    expect(layout).toContain('redirect={permissionsReady && !canSeeHome}');
  });

  it('guards report routes before their child pages mount', () => {
    const layout = read('src/app/raporlar/_layout.tsx');
    const stack = read('src/components/navigation/GuardedRouteStack.tsx');

    expect(layout).toContain('getReportRouteAccessModules');
    expect(layout).toContain('<AnyModuleRouteStack modules={accessModules}>');
    expect(stack).toContain('<AnyModuleRouteGuard modules={modules}>');
  });

  it('exposes the contextual account report from account detail', () => {
    const accountDetail = read('src/app/hesaplar/[id].tsx');
    const accountReport = read('src/app/raporlar/hesap/[id].tsx');

    expect(accountDetail).toContain("pathname: '/raporlar/hesap/[id]'");
    expect(accountDetail).toContain('<BarChart3');
    expect(accountReport).not.toContain(
      "usePagePermission({ module: 'raporlar' })",
    );
    expect(accountReport).toContain("getDateRange('monthly', 0)");
  });

  it('shows transaction tracking entries only from their effective modules', () => {
    const more = read('src/app/(tabs)/daha.tsx');

    expect(more).toContain(
      "const canSeeTransactions = canAccessModule('islemler');",
    );
    expect(more).toContain(
      "const canSeeCariTracking = canAccessModule('cariler');",
    );
    expect(more).toContain("router.push('/islemler')");
    expect(more).toContain("router.push('/taksit' as Href)");
    expect(more).toContain("router.push('/vade' as Href)");
  });

  it('keeps All Transactions writes owner-only while opening its list route', () => {
    const layout = read('src/app/islemler/_layout.tsx');

    expect(layout).toContain('isAllTransactionsRoute');
    expect(layout).toContain('<ModuleRouteStack module="islemler">');
    expect(layout).toContain('<OwnerRouteStack>');
  });

  it('keeps currency and audit history owner-only', () => {
    const more = read('src/app/(tabs)/daha.tsx');
    const audit = read('src/app/ayarlar/islem-gecmisi.tsx');
    const guardOpen = audit.indexOf('<OwnerRouteGuard>');
    const contentOpen = audit.indexOf('<IslemGecmisiContent />');

    expect(more).toMatch(
      /\{isOwner && \(\s*<>\s*<MenuItem[\s\S]*?settings:currency\.title/s,
    );
    expect(more).toMatch(
      /\{isOwner && \(\s*<Modal[\s\S]*?currencyModalVisible/s,
    );
    expect(audit).toContain("import { OwnerRouteGuard }");
    expect(guardOpen).toBeGreaterThan(0);
    expect(contentOpen).toBeGreaterThan(guardOpen);
  });

  it('opens category navigation only to owner or the real manager role', () => {
    const more = read('src/app/(tabs)/daha.tsx');
    const layout = read('src/app/kategoriler/_layout.tsx');

    expect(more).toContain(
      'isOwnerOrManagerRole(isOwner, currentUserRole)',
    );
    expect(layout).toContain('<OwnerOrManagerRouteStack>');
  });
});
