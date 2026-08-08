import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

function exportedFunctionBlock(
  source: string,
  functionName: string,
  nextFunctionName: string,
): string {
  const start = source.indexOf(`export function ${functionName}(`);
  const end = source.indexOf(
    `export function ${nextFunctionName}(`,
    start + 1,
  );
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('reports-only istemci dar projeksiyon sozlesmesi', () => {
  it.each([
    [
      'src/hooks/useHesaplar.ts',
      'useReportHesaplar',
      'useHesap',
      'hesap',
    ],
    [
      'src/hooks/useCariler.ts',
      'useReportCariler',
      'useCari',
      'cari',
    ],
    [
      'src/hooks/usePersonel.ts',
      'useReportPersonelList',
      'usePersonelOzet',
      'personel',
    ],
  ])(
    '%s reports-only entity secicisini dar RPCye tasir',
    (file, hookName, nextHookName, kind) => {
      const source = read(file);
      const block = exportedFunctionBlock(
        source,
        hookName,
        nextHookName,
      );

      expect(block).toContain(
        "'get_rapor_varlik_referanslari_v1'",
      );
      expect(block).toContain(`p_kind: '${kind}'`);
      expect(block).toContain('persist: false');
      expect(block).toContain('useReportProjection');
      expect(block).not.toContain(".from('hesaplar')");
      expect(block).not.toContain(".from('cariler')");
      expect(block).not.toContain(".from('personel')");
    },
  );

  it('genel durum ekran ve exportu ayni dar entity referanslarini kullanir', () => {
    const summary = read('src/hooks/useFinancialSummary.ts');
    const page = read('src/app/raporlar/genel.tsx');
    const content = read(
      'src/components/reports/tabs/GenelTabContent.tsx',
    );

    expect(summary).toContain('useReportHesaplar(reportsEnabled)');
    expect(summary).toContain('useReportCariler(reportsEnabled)');
    expect(summary).toContain(
      'useReportPersonelList(reportsEnabled)',
    );
    expect(page).toContain('useReportHesaplar()');
    expect(page).not.toContain('useHesaplar(false, false)');
    expect(content).toContain('useReportHesaplar()');
    expect(content).toContain('useReportCariler()');
    expect(content).toContain('useReportPersonelList()');
    expect(content).toContain('disabled={!canOpenCariler}');
    expect(content).toContain('disabled={!canOpenPersonel}');
  });

  it('nakit akisinda shared rol aggregate RPC, owner direct yol kullanir', () => {
    const source = read('src/hooks/useCashFlowByCategory.ts');

    expect(source).toContain("canAccessModule('raporlar')");
    expect(source).toContain("if (!isOwner) {");
    expect(source).toContain("'get_nakit_akisi_raporu_v1'");
    expect(source).toContain('parseCashFlowReportProjectionRows(data)');
    expect(source).toMatch(
      /if \(!isOwner\) \{[\s\S]*?get_nakit_akisi_raporu_v1[\s\S]*?return parseCashFlowReportProjectionRows[\s\S]*?\}\s*\n\s*\/\/ Owner/,
    );
    expect(source).toContain('persist: isOwner');
  });

  it('kategori metadata ve drilldown shared rolde iki dar RPCden gelir', () => {
    const source = read('src/hooks/useCategoryReport.ts');

    expect(source).toContain("'get_rapor_kategori_referanslari_v1'");
    expect(source).toContain(
      "'get_kategori_rapor_islem_satirlari_v1'",
    );
    expect(source).toContain('p_start_date: params.startDateTime');
    expect(source).toContain('p_end_date: params.endDateTime');
    expect(source).toContain('parseCategoryReportTransactionRows(');
    expect(source).toContain('drilldownEnabled: enabled');
    expect(source).toContain('if (!reportAccess.isOwner) {');
  });

  it('filtreli trend shared rolde aggregate RPCye duser', () => {
    const source = read('src/hooks/useAnalyticsTrend.ts');
    const modal = read('src/components/reports/TrendFilterModal.tsx');

    expect(source).toContain("if (!isOwner) {");
    expect(source).toContain("'get_rapor_trend_ozeti_v1'");
    expect(source).toContain('parseReportTrendProjectionRows(data)');
    expect(source).toContain('p_filter_kind: filter!.type');
    expect(source).toContain('p_filter_id: filter!.id');
    expect(modal).toContain('useReportHesaplar()');
    expect(modal).toContain('useReportCariler()');
    expect(modal).toContain('useReportPersonelList()');
    expect(modal).toContain('useReportKategoriSecimReferanslari()');
  });

  it('cari raporu shared rolde all-history projection RPCsini sayfalar', () => {
    const source = read('src/hooks/useIslemler.ts');
    const block = exportedFunctionBlock(
      source,
      'useAllIslemlerByCari',
      'useUpdateIslem',
    );

    expect(block).toContain('fetchAllCariProjectionPages(');
    expect(block).toContain('const isShared = !isOwner');
    expect(block).toContain('persist: false');
    expect(block).toContain('allowReportAccess');
    expect(block).toMatch(
      /if \(isShared\) \{[\s\S]*?fetchAllCariProjectionPages/,
    );
  });

  it('reports-only exportlar ekrandaki dar veriden calisir', () => {
    const incomeExpense = read('src/hooks/useReportExcelExport.ts');
    const product = read('src/app/raporlar/alis-satis.tsx');
    const comparison = read('src/hooks/useComparisonReport.ts');
    const netWorth = read('src/hooks/useNetWorthTrend.ts');

    expect(incomeExpense).toContain(
      "const canExport = canExportModule('raporlar')",
    );
    expect(incomeExpense).toContain(
      "'get_rapor_kategori_referanslari_v1'",
    );
    expect(incomeExpense).toContain(
      "'get_kategori_rapor_islem_satirlari_v1'",
    );
    expect(incomeExpense).toContain('const transactions = isOwner');

    expect(product).toContain(
      "const canExport = canExportModule('raporlar')",
    );
    expect(product).toContain('if (isOwner) {');
    expect(product).toContain(
      'Shared reports-only export',
    );
    expect(product).toContain(
      "const canOpenProductDetails = canAccessModule('urunler')",
    );
    expect(product).toMatch(
      /\{canExport \? \(\s*<ReportExportButton/s,
    );

    expect(comparison).toContain(
      "const reportsEnabled = canAccessModule('raporlar')",
    );
    expect(comparison).not.toContain(
      "&& canAccessModule('hesaplar')",
    );
    expect(netWorth).toContain(
      "const reportsEnabled = canAccessModule('raporlar')",
    );
    expect(netWorth).not.toContain(
      "&& canAccessModule('hesaplar')",
    );
  });

  it('reports-only urunlu islem satiri dar kalem RPCsiyle okunur ve urun yetkisi yoksa duzenlenmez', () => {
    const source = read(
      'src/components/reports/EntityTransactionList.tsx',
    );

    expect(source).toContain('useUrunKalemlerByIslemIds(');
    expect(source).toMatch(
      /useUrunKalemlerByIslemIds\([\s\S]*?displayTransactions[\s\S]*?,\s*true,\s*\)/,
    );
    expect(source).toContain('<ReportProductItemsModal');
    expect(source).toContain('if (!productItemsSettled) return');
    expect(source).toContain(
      'getTransactionProductMutationDecision({',
    );
    expect(source).toContain(
      'canMutateProduct:',
    );
    expect(source).toContain(
      "canUpdate('urunler', transaction.created_by ?? null)",
    );
    expect(source).toContain(
      'onEdit={canEditProductTransaction ? handleProductEdit : undefined}',
    );
    expect(source).not.toContain('useIslemlerWithUrun');
    expect(source).not.toContain('<ProductDetailModal');
  });
});
