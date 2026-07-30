import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('pasif kayit yonetimi owner-only istemci kontrati', () => {
  for (const [label, route] of [
    ['hesap', 'src/app/hesaplar/duzenle/[id].tsx'],
    ['cari', 'src/app/cariler/duzenle/[id].tsx'],
    ['personel', 'src/app/personel/duzenle/[id].tsx'],
  ] as const) {
    it(`${label} duzenlemede pasif anahtarini ve payload alanini owner ile sinirlar`, () => {
      const source = read(route);

      expect(source).toContain('const { isOwner } = usePermissions();');
      expect(source).toContain(
        '...(isOwner ? { is_active: isActive } : {})',
      );
      expect(source).toContain(
        '{/* Pasif kayıt yönetimi yalnız işletme sahibine aittir. */}',
      );
      expect(source).toContain('{isOwner && (');
    });
  }

  it('tum detay sorgulari owner pasif kapsamını cache anahtarinda ayirir', () => {
    for (const file of [
      'src/hooks/useUrunler.ts',
      'src/hooks/useCariler.ts',
      'src/hooks/useHesaplar.ts',
      'src/hooks/usePersonel.ts',
    ]) {
      const source = read(file);
      expect(source).toContain("'passive-scope'");
      expect(source).toContain("'module-scope'");
      expect(source).toContain('canSeePassiveRecords');
      expect(source).toContain("query = query.eq('is_active', true)");
    }

    const products = read('src/hooks/useUrunler.ts');
    expect(products).toMatch(
      /export function useUrun\([\s\S]*?if \(!canSeePassiveRecords\) query = query\.eq\('is_active', true\)/,
    );
    const accounts = read('src/hooks/useHesaplar.ts');
    expect(accounts).toContain("'birikim-scope'");
    expect(accounts).toContain('canUseBirikim');
  });

  it('arsiv listeleri ve sayaclari owner pasif kapsamını cache anahtarinda ayirir', () => {
    const source = read('src/hooks/useArchive.ts');

    expect(source.match(/'passive-scope'/g)).toHaveLength(5);
    // Dört arşiv liste anahtarı + birleşik sayaç anahtarı, modül kapanınca
    // önceki izin kapsamındaki fresh/persist cache verisini yeniden kullanmamalı.
    expect(source.match(/'module-scope'/g)).toHaveLength(5);
    expect(source).toMatch(
      /queryKeys\.hesaplar\.archived[\s\S]*?'passive-scope'[\s\S]*?canSeePassiveRecords[\s\S]*?'module-scope'[\s\S]*?canSeeHesaplar/,
    );
    expect(source).toMatch(
      /queryKeys\.cariler\.archived[\s\S]*?'passive-scope'[\s\S]*?canSeePassiveRecords[\s\S]*?'module-scope'[\s\S]*?canSeeCariler/,
    );
    expect(source).toMatch(
      /queryKeys\.personel\.archived[\s\S]*?'passive-scope'[\s\S]*?canSeePassiveRecords[\s\S]*?'module-scope'[\s\S]*?canSeePersonel/,
    );
    expect(source).toMatch(
      /queryKeys\.urunler\.archived[\s\S]*?'passive-scope'[\s\S]*?canSeePassiveRecords[\s\S]*?'module-scope'[\s\S]*?canSeeUrunler/,
    );
  });
});
