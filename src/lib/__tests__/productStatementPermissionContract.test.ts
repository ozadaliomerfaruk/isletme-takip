import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('urun ekstresi view ve kapali cari etiketi kontrati', () => {
  const source = read('src/hooks/useUrunExcelExport.ts');

  it('exportu Urunler view yetkisiyle sinirlar', () => {
    expect(source).toContain(
      "const canExportProducts = canExportModule('urunler');",
    );
    expect(source).toContain('if (!isletme || !canExportProducts)');
  });

  it('Cariler kapaliyken yalniz minimal cari etiket RPCsini kullanir', () => {
    expect(source).toContain(
      "const canSeeCariler = canAccessModule('cariler');",
    );
    expect(source).toContain(
      "supabase.rpc('get_urun_hareket_minimal_cari_labels'",
    );
    expect(source).toContain('minimalCariNameByMovementId');
    expect(source).toContain("id: ''");
  });
});
