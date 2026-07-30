import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('istemci deep-link ve legacy rol guardlari', () => {
  it('mutabakat child ekranini Cariler kapaliyken mount etmez', () => {
    const layout = read('src/app/mutabakat/_layout.tsx');
    const guardedStack = read(
      'src/components/navigation/GuardedRouteStack.tsx',
    );

    expect(layout).toContain(
      "import { ModuleRouteStack } from '@/components/navigation/GuardedRouteStack';",
    );
    expect(layout).toContain('<ModuleRouteStack module="cariler">');
    expect(guardedStack).toContain('<ModuleRouteGuard module={module}>');
  });

  it('foto import providerini shared kullanicida mount etmez', () => {
    const layout = read('src/app/foto-import/_layout.tsx');
    const guardOpen = layout.indexOf('<OwnerRouteGuard>');
    const providerOpen = layout.indexOf('<FotoImportProvider>');
    const providerClose = layout.indexOf('</FotoImportProvider>');
    const guardClose = layout.indexOf('</OwnerRouteGuard>');

    expect(guardOpen).toBeGreaterThan(0);
    expect(providerOpen).toBeGreaterThan(guardOpen);
    expect(providerClose).toBeGreaterThan(providerOpen);
    expect(guardClose).toBeGreaterThan(providerClose);
  });

  it('legacy purchaser mevcut permissions korunarak duzenlenebilir custom role acilir', () => {
    const sheet = read('src/components/multiUser/UserEditSheet.tsx');
    expect(sheet).toContain(
      "setRole(user.role === 'purchaser' ? 'custom' : user.role);",
    );
    expect(sheet).toContain(
      "setPermissions(user.permissions ?? rolePresetPermissions('custom'));",
    );
    expect(sheet).toContain("{role === 'custom' && (");
  });

  it('view seviyesinde bos cari/personel ekleme CTA’larini gostermez', () => {
    const cariler = read('src/app/(tabs)/cariler.tsx');
    const personel = read('src/app/(tabs)/personel.tsx');

    expect(cariler).toContain("const canCreateCari = canCreate('cariler');");
    expect(cariler).toContain('filtered || !canCreateCari ? undefined');
    expect(personel).toContain(
      "const canCreatePersonnel = canCreate('personel');",
    );
    expect(personel).toContain(
      'debouncedSearch || !canCreatePersonnel',
    );
  });

  it('shared kullanicida owner-only isletme profil kartini tiklanabilir gostermez', () => {
    const more = read('src/app/(tabs)/daha.tsx');
    const ownerBranch = more.match(
      /\{isOwner \? \(([\s\S]*?)\) : \(([\s\S]*?)\)\}/,
    );

    expect(ownerBranch).toBeTruthy();
    expect(ownerBranch?.[1]).toContain('<TouchableOpacity');
    expect(ownerBranch?.[1]).toContain("router.push('/ayarlar/isletme')");
    expect(ownerBranch?.[2]).toContain('<View style={styles.profileCard}>');
    expect(ownerBranch?.[2]).not.toContain('router.push');
    expect(ownerBranch?.[2]).not.toContain('<ChevronRight');
  });
});
