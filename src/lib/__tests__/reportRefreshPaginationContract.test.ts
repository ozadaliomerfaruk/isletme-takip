import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('rapor yenileme ve kararlı sayfalama sözleşmesi', () => {
  it('işlem mutationı açık ana rapor KPI ve trend sorgularını hemen yeniler', () => {
    const source = read('src/lib/queryKeys.ts');
    const islemStart = source.indexOf('islem: {');
    const islemEnd = source.indexOf('// İleri tarihli işlem değişikliği', islemStart);
    const islemBlock = source.slice(islemStart, islemEnd);
    const immediate = islemBlock.slice(
      islemBlock.indexOf('immediate: ['),
      islemBlock.indexOf('deferred: ['),
    );
    const deferred = islemBlock.slice(islemBlock.indexOf('deferred: ['));

    expect(immediate).toContain("'analytics-periods'");
    expect(immediate).toContain("'analytics-trend'");
    expect(deferred).not.toContain("'analytics-periods'");
    expect(deferred).not.toContain("'analytics-trend'");
  });

  it.each([
    ['nakit akışı', 'src/hooks/useCashFlowByCategory.ts'],
    ['filtreli trend', 'src/hooks/useAnalyticsTrend.ts'],
  ])('%s fetchAllPages sorgusunu tarih ve id ile kararlı sıralar', (
    _label,
    relativePath,
  ) => {
    const source = read(relativePath);
    const fetchStart = source.indexOf('fetchAllPages');
    const queryBlock = source.slice(fetchStart);

    expect(queryBlock).toContain(".order('date', { ascending: true })");
    expect(queryBlock).toContain(".order('id', { ascending: true })");
    expect(
      queryBlock.indexOf(".order('date', { ascending: true })"),
    ).toBeLessThan(
      queryBlock.indexOf(".order('id', { ascending: true })"),
    );
  });

  it('trend sorgusu tie-break için id alanını da projekte eder', () => {
    const source = read('src/hooks/useAnalyticsTrend.ts');
    expect(source).toContain(
      ".select('id, type, amount, date, hesap:hesaplar!hesap_id",
    );
  });
});
