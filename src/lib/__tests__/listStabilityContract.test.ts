import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('ana liste stabilite sözleşmesi', () => {
  it('cari action sheet birleşik liste oluşturulduktan sonra hesaplanır', () => {
    const source = read('src/app/(tabs)/cariler.tsx');
    const mergedCariler = source.indexOf('const mergedCariler = useMemo');
    const actionSheetOptions = source.indexOf('const actionSheetOptions = useMemo');

    expect(mergedCariler).toBeGreaterThan(-1);
    expect(actionSheetOptions).toBeGreaterThan(mergedCariler);
    expect(source).toContain(
      '[actionSheetCari, getActionSheetOptions, mergedCariler]',
    );
  });

  it.each([
    'src/app/(tabs)/cariler.tsx',
    'src/app/(tabs)/personel.tsx',
  ])('%s iOS clipping kapalı ve extraData kararlı', (file) => {
    const source = read(file);

    expect(source).toContain("removeClippedSubviews={Platform.OS === 'android'}");
    expect(source).toContain('const listExtraData = useMemo');
    expect(source).toContain('extraData={listExtraData}');
    expect(source).not.toMatch(/extraData=\{\{\s*selectedIds/);
  });

  it('üç ana liste eşitlikte ortak deterministik sıralama helperını kullanır', () => {
    const cariler = read('src/app/(tabs)/cariler.tsx');
    const personel = read('src/app/(tabs)/personel.tsx');
    const urunler = read('src/app/urunler/index.tsx');

    expect(cariler).toContain('compareBalanceListItems(');
    expect(personel).toContain('compareBalanceListItems(');
    expect(urunler).toContain('compareEntityIdentity(');
    expect(urunler).toContain('compareMetricListItems(');
  });
});
