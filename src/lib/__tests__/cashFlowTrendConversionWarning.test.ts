import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('nakit akışı ve trend kur uyarısı sözleşmesi', () => {
  it('nakit akışında çevrilemeyen satırı işaretler ve sonucu tüketicilere açar', () => {
    const hook = read('src/hooks/useCashFlowByCategory.ts');

    expect(hook).toContain('let conversionIncomplete = false');
    expect(hook).toMatch(
      /if \(converted === null\) \{\s*conversionIncomplete = true;/,
    );
    expect(hook).toContain('conversionIncomplete,');
  });

  it('nakit akışının tüm görünür yüzeylerinde uyarıyı gösterir', () => {
    const cashFlowPage = read('src/app/nakit-akisi/index.tsx');
    const dashboardModal = read(
      'src/components/dashboard/FinancialDetailModal.tsx',
    );
    const home = read('src/app/(tabs)/index.tsx');

    expect(cashFlowPage).toContain(
      'visible={cashFlow.conversionIncomplete}',
    );
    expect(dashboardModal).toContain(
      'visible={cashFlowConversionIncomplete}',
    );
    expect(home).toContain(
      'conversionIncomplete || cashFlowConversionIncomplete',
    );
  });

  it('trend hookundaki bayrağı widget uyarısına kadar taşır', () => {
    const hook = read('src/hooks/useAnalyticsTrend.ts');
    const widget = read('src/widgets/finance/TrendChartWidget.tsx');

    expect(hook).toMatch(
      /conversionIncomplete:\s*canShowTrend\s*&&\s*\(trendQuery\.data\?\.conversionIncomplete \?\? false\)/,
    );
    expect(widget).toContain(
      'visible={trend.conversionIncomplete}',
    );
  });

  it('uyarı metni hem eksik hem yaklaşık toplam politikasını doğru açıklar', () => {
    const tr = JSON.parse(read('src/i18n/locales/tr/reports.json'));
    const en = JSON.parse(read('src/i18n/locales/en/reports.json'));

    expect(tr.summary.conversionIncomplete).toContain('eksik veya yaklaşık');
    expect(en.summary.conversionIncomplete).toContain(
      'incomplete or approximate',
    );
  });
});
