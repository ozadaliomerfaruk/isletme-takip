import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

/**
 * Root Stack uses `headerShown: false`, so every standalone page must opt in to
 * a native header or document an explicit custom safe-area strategy below.
 */
const DIRECT_ROOT_NATIVE_HEADER_ROUTES = [
  'ayarlar/isletme',
  'yasal/kullanim-kosullari',
  'yasal/gizlilik-politikasi',
  'yasal/kvkk',
  'yardim',
  'gelistirici-notu',
  'ayarlar/hesap-sil',
] as const;

/**
 * These routes live below a folder `_layout.tsx`. Expo Router gives that layout
 * its own navigation level, so their native headers must be owned by the local
 * Stack rather than a stale `folder/child` declaration in the root Stack.
 */
const NESTED_STACK_HEADER_ROUTES = [
  'hesaplar/[id]',
  'cariler/[id]',
  'personel/[id]',
  'islemler/index',
  'notlar/index',
  'taksit/index',
  'vade/index',
  'taksit/[id]',
  'hesaplar/ekle',
  'cariler/ekle',
  'personel/ekle',
  'islemler/gelir',
  'islemler/duzenle/[id]',
  'raporlar/index',
  'raporlar/kategori/[id]',
  'raporlar/hesap/[id]',
  'raporlar/genel',
  'raporlar/gelir-gider',
  'raporlar/cari',
  'raporlar/personel',
  'raporlar/karsilastirma',
  'raporlar/alis-satis',
  'raporlar/net-varlik-trend',
  'nakit-akisi/index',
  'kategoriler/index',
  'kategoriler/ekle',
  'kategoriler/duzenle/[id]',
  'hesaplar/duzenle/[id]',
  'cariler/duzenle/[id]',
  'personel/duzenle/[id]',
  'personel/toplu-gider',
  'personel/toplu-odeme',
  'personel/izin-gecmisi/[id]',
  'ayarlar/data-import/index',
  'mutabakat/[cariId]',
  'arsiv/index',
  'urunler/[id]',
  'urunler/ekle',
  'urunler/duzenle/[id]',
  'urunler/toplu-giris',
  'urunler/toplu-cikis',
] as const;

const NESTED_STACK_LAYOUTS = {
  hesaplar: ['[id]', 'ekle', 'duzenle/[id]'],
  cariler: ['[id]', 'ekle', 'duzenle/[id]'],
  personel: [
    '[id]',
    'ekle',
    'duzenle/[id]',
    'toplu-gider',
    'toplu-odeme',
    'izin-gecmisi/[id]',
  ],
  urunler: [
    'index',
    '[id]',
    'ekle',
    'duzenle/[id]',
    'toplu-giris',
    'toplu-cikis',
  ],
  raporlar: [
    'index',
    'kategori/[id]',
    'hesap/[id]',
    'genel',
    'gelir-gider',
    'cari',
    'personel',
    'karsilastirma',
    'alis-satis',
    'net-varlik-trend',
  ],
  taksit: ['index', '[id]'],
  vade: ['index'],
  mutabakat: ['[cariId]'],
  'nakit-akisi': ['index'],
  notlar: ['index'],
  arsiv: ['index'],
  islemler: ['index', 'gelir', 'duzenle/[id]'],
  kategoriler: ['index', 'ekle', 'duzenle/[id]'],
  'ayarlar/data-import': ['index'],
} as const;

const NESTED_STACK_ROUTE_CASES = Object.entries(NESTED_STACK_LAYOUTS).flatMap(
  ([layout, routes]) => routes.map((route) => ({ layout, route })),
);

/**
 * These routes are root-registered as headerless but immediately opt in through
 * a page-level Stack.Screen. Keep them explicit so they cannot be confused with
 * fullscreen custom-header pages.
 */
const LOCAL_NATIVE_HEADER_ROUTES = [
  'ayarlar/davet-olustur',
  'ayarlar/paylasilan-isletmeler',
  'ayarlar/islem-gecmisi',
] as const;

const SCREEN_TOP_ROUTES = [
  'arama',
  'onboarding',
  'kurulum',
  'kurulum-tabela',
  'kurulum-ilk-kayit',
  'kurulum-tamam',
  'verify',
] as const;

const AUTH_SCREEN_TOP_FILES = [
  'src/app/(auth)/login.tsx',
  'src/app/(auth)/register.tsx',
  'src/app/(auth)/forgot-password.tsx',
  'src/app/(auth)/reset-password.tsx',
] as const;

/**
 * These fullscreen list pages intentionally draw an absolute TabHeader. Its
 * measured height already includes insets.top, so Screen must not add top again.
 */
const MEASURED_TAB_HEADER_FILES = [
  'src/app/(tabs)/index.tsx',
  'src/app/(tabs)/cariler.tsx',
  'src/app/(tabs)/personel.tsx',
  'src/app/urunler/index.tsx',
] as const;

const NATIVE_HEADER_PAGE_FILES = [
  ...DIRECT_ROOT_NATIVE_HEADER_ROUTES,
  ...NESTED_STACK_HEADER_ROUTES,
  ...LOCAL_NATIVE_HEADER_ROUTES,
].map((route) => `src/app/${route}.tsx`);

const SCREEN_TOP_PATTERN =
  /<Screen\b[^>]*\btop(?:\s*=\s*(?:\{\s*true\s*\}|["']true["'])|\s|>)/;

function getRootRouteBlock(source: string, route: string): string {
  const marker = `name="${route}"`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const next = source.indexOf('<Stack.Screen', start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

function listStandalonePageRoutes(): string[] {
  const appDir = path.join(process.cwd(), 'src/app');
  const routes: string[] = [];

  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }

      if (!entry.name.endsWith('.tsx') || entry.name === '_layout.tsx') continue;

      const route = path
        .relative(appDir, absolutePath)
        .replace(/\\/g, '/')
        .replace(/\.tsx$/, '');

      if (
        route === 'index' ||
        route.startsWith('(tabs)/') ||
        route.startsWith('(auth)/') ||
        route.startsWith('foto-import/')
      ) {
        continue;
      }

      routes.push(route);
    }
  };

  visit(appDir);
  return routes.sort();
}

describe('safe-area and native-header route contract', () => {
  const rootLayout = read('src/app/_layout.tsx');

  it('keeps the root Stack headerless default explicit', () => {
    expect(rootLayout).toMatch(
      /<Stack[\s\S]*?screenOptions=\{\{[\s\S]*?headerShown:\s*false/,
    );
  });

  it('declares no nested-layout children on the root Stack', () => {
    // Bir klasörün kendi `_layout.tsx`i varsa kök Stack'in çocuğu klasör adıdır;
    // kökte bırakılan `klasor/cocuk` kaydı sessizce yok sayılır ve options'ları
    // hiç uygulanmaz (Layout children uyarısının kaynağı buydu).
    const declaredNames = [...rootLayout.matchAll(/name="([^"]+)"/g)].map(
      (match) => match[1],
    );

    const staleNames = declaredNames.filter((name) => {
      const segments = name.split('/');
      for (let depth = 1; depth < segments.length; depth += 1) {
        const folder = segments.slice(0, depth).join('/');
        if (
          fs.existsSync(
            path.join(process.cwd(), 'src/app', folder, '_layout.tsx'),
          )
        ) {
          return true;
        }
      }
      return false;
    });

    expect(staleNames).toEqual([]);
  });

  it.each(DIRECT_ROOT_NATIVE_HEADER_ROUTES)(
    '%s opts into a non-transparent native header at root',
    (route) => {
      const block = getRootRouteBlock(rootLayout, route);

      expect(block).not.toBe('');
      expect(block).toMatch(/headerShown:\s*true/);
      expect(block).not.toMatch(/headerTransparent:\s*true/);
    },
  );

  it('uses one explicit non-transparent native-header contract for guarded stacks', () => {
    const stackSource = read(
      'src/components/navigation/GuardedRouteStack.tsx',
    );

    expect(stackSource).toMatch(/headerShown:\s*true/);
    expect(stackSource).toMatch(/headerTransparent:\s*false/);
    expect(stackSource).toMatch(/headerShadowVisible:\s*false/);
  });

  it.each(NESTED_STACK_ROUTE_CASES)(
    '$layout/$route is registered in its local guarded Stack',
    ({ layout, route }) => {
      const source = read(`src/app/${layout}/_layout.tsx`);

      expect(source).toMatch(
        /<(?:ModuleRouteStack|OwnerRouteStack|AnyModuleRouteStack|OwnerOrManagerRouteStack)\b/,
      );
      expect(source).toContain(`name="${route}"`);
    },
  );

  it('keeps the custom-header product index free of a second native header', () => {
    const source = read('src/app/urunler/_layout.tsx');
    expect(source).toMatch(
      /<Stack\.Screen\s+name="index"\s+options=\{\{\s*headerShown:\s*false\s*\}\}/,
    );
  });

  it.each(LOCAL_NATIVE_HEADER_ROUTES)(
    '%s documents its page-level native-header exception',
    (route) => {
      const rootBlock = getRootRouteBlock(rootLayout, route);
      const page = read(`src/app/${route}.tsx`);

      expect(rootBlock).toMatch(/headerShown:\s*false/);
      expect(page).toMatch(/<Stack\.Screen[\s\S]*?headerShown:\s*true/);
      expect(page).not.toMatch(/headerTransparent:\s*true/);
    },
  );

  it.each(NATIVE_HEADER_PAGE_FILES)(
    '%s does not add a second top safe-area above its native header',
    (file) => {
      const source = read(file);

      expect(source).not.toMatch(SCREEN_TOP_PATTERN);
      expect(source).not.toMatch(/paddingTop\s*:\s*insets\.top\b/);
      expect(source).not.toMatch(
        /<SafeAreaView\b[^>]*\bedges\s*=\s*\{[^}]*["']top["']/,
      );
    },
  );

  it.each(SCREEN_TOP_ROUTES)(
    '%s applies safe-area explicitly while its native header is hidden',
    (route) => {
      expect(getRootRouteBlock(rootLayout, route)).toMatch(
        /headerShown:\s*false/,
      );
      expect(read(`src/app/${route}.tsx`)).toMatch(SCREEN_TOP_PATTERN);
    },
  );

  it.each(AUTH_SCREEN_TOP_FILES)(
    '%s applies safe-area under the headerless nested auth Stack',
    (file) => {
      expect(read(file)).toMatch(SCREEN_TOP_PATTERN);
    },
  );

  it.each(MEASURED_TAB_HEADER_FILES)(
    '%s measures the custom TabHeader safe-area exactly once',
    (file) => {
      const source = read(file);

      expect(source).toContain('TabHeader');
      expect(source).toMatch(
        /insets\.top\s*\+\s*TAB_HEADER_ESTIMATED_HEIGHT/,
      );
      expect(source).not.toMatch(SCREEN_TOP_PATTERN);
    },
  );

  it('classifies the headerless (tabs) navigator custom-header routes', () => {
    const tabsLayout = read('src/app/(tabs)/_layout.tsx');

    expect(getRootRouteBlock(rootLayout, '(tabs)')).toMatch(
      /headerShown:\s*false/,
    );
    expect(tabsLayout).toMatch(/<Tabs[\s\S]*?headerShown:\s*false/);
    expect(read('src/app/(tabs)/daha.tsx')).toMatch(SCREEN_TOP_PATTERN);
  });

  it('keeps the nested auth Stack headerless contract explicit', () => {
    const authLayout = read('src/app/(auth)/_layout.tsx');

    expect(getRootRouteBlock(rootLayout, '(auth)')).toMatch(
      /headerShown:\s*false/,
    );
    expect(authLayout).toMatch(/<Stack[\s\S]*?headerShown:\s*false/);
  });

  it('keeps foto-import children under their nested native-header Stack', () => {
    const nestedLayout = read('src/app/foto-import/_layout.tsx');

    expect(getRootRouteBlock(rootLayout, 'foto-import')).toMatch(
      /headerShown:\s*false/,
    );
    expect(nestedLayout).toMatch(
      /screenOptions=\{\{[\s\S]*?headerShown:\s*true/,
    );
    expect(nestedLayout).toContain('name="index"');
    expect(nestedLayout).toContain('name="review"');
  });

  it('classifies every standalone page file under root or a safe-area exception', () => {
    const coveredRoutes = new Set<string>([
      ...DIRECT_ROOT_NATIVE_HEADER_ROUTES,
      ...NESTED_STACK_HEADER_ROUTES,
      ...LOCAL_NATIVE_HEADER_ROUTES,
      ...SCREEN_TOP_ROUTES,
      'urunler/index',
    ]);

    expect(
      listStandalonePageRoutes().filter((route) => !coveredRoutes.has(route)),
    ).toEqual([]);
  });
});
