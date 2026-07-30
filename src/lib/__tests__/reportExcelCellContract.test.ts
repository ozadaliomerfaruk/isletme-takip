import fs from 'fs';
import path from 'path';
import {
  excelCountCell,
  excelDateCell,
  excelMoneyCell,
  excelPercentCell,
} from '../reportExcelExport';
import { buildCategoryDetailRows } from '../pageExports';

describe('rapor Excel hücre sözleşmesi', () => {
  it('para, yüzde, adet ve tarihleri metin yerine gerçek Excel türleriyle yazar', () => {
    const money = excelMoneyCell(1234.56, 'TRY', {});
    const percent = excelPercentCell(12.5, {});
    const count = excelCountCell(7, {});
    const date = excelDateCell('2026-07-30', {});

    expect(money).toMatchObject({ v: 1234.56, t: 'n' });
    expect(money.z).toContain('₺');
    expect(percent).toMatchObject({ v: 0.125, t: 'n', z: '0.00%' });
    expect(count).toMatchObject({ v: 7, t: 'n', z: '0' });
    expect(date.t).toBe('d');
    expect(date.v).toBeInstanceOf(Date);
  });

  it('ana kategoriye doğrudan bağlı işlemleri alt kategori satırlarıyla birlikte dışa aktarır', () => {
    const rows = buildCategoryDetailRows(
      'YEMEK',
      [{ name: 'KAHVALTI', amount: 60, percentage: 30, transactionCount: 2 }],
      140,
      3,
      200,
    );

    expect(rows).toEqual([
      { name: 'YEMEK', amount: 140, percentage: 70, transactionCount: 3 },
      { name: 'KAHVALTI', amount: 60, percentage: 30, transactionCount: 2 },
    ]);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(200);
    expect(rows.reduce((sum, row) => sum + row.transactionCount, 0)).toBe(5);
  });

  it('ürün raporu detay sorgusunda iadeleri de alır ve kararlı sayfalama kullanır', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../app/raporlar/alis-satis.tsx'),
      'utf8',
    );

    expect(source).toContain("const PURCHASE_TYPES = ['cari_alis', 'cari_alis_iade']");
    expect(source).toContain("'cari_satis_iade'");
    expect(source).toContain(".order('id', { ascending: true })");
  });
});
