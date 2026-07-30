import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

describe('carisiz toplu stok KDV sözleşmesi', () => {
  it.each([
    ['toplu giriş', 'src/app/urunler/toplu-giris.tsx', "'giris'"],
    ['toplu çıkış', 'src/app/urunler/toplu-cikis.tsx', "'cikis'"],
  ])('%s satırında seçilen KDV oranını manuel harekete taşır', (
    _label,
    relativePath,
    movementType,
  ) => {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    const noCariStart = source.indexOf('// Cari-SIZ toplu stok');
    const noCariBlock = source.slice(
      noCariStart,
      source.indexOf('const succeededIds', noCariStart),
    );

    expect(noCariStart).toBeGreaterThan(-1);
    expect(noCariBlock).toContain(`hareket_tipi: ${movementType}`);
    expect(noCariBlock).toContain('kdv_orani: row.kdvOrani');
  });
});
