import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const hook = fs.readFileSync(
  path.join(ROOT, 'src/hooks/useReportExcelExport.ts'),
  'utf8',
);
const page = fs.readFileSync(
  path.join(ROOT, 'src/app/raporlar/gelir-gider.tsx'),
  'utf8',
);

describe('gelir gider Excel export permission contract', () => {
  it('reports-only exportu dar rapor RPC projeksiyonuyla acar', () => {
    expect(hook).toContain("canExportModule('raporlar')");
    expect(hook).toContain(
      "'get_rapor_kategori_referanslari_v1'",
    );
    expect(hook).toContain(
      "'get_kategori_rapor_islem_satirlari_v1'",
    );
    expect(hook).toContain('parseCategoryReportTransactionRows(');
    expect(hook).toContain('const transactions = isOwner');
    expect(hook).not.toContain("canAccessModule('hesaplar')");
    expect(hook).not.toContain("canAccessModule('cariler')");
    expect(hook).not.toContain("canAccessModule('urunler')");
    expect(hook).not.toContain("canAccessModule('personel')");
  });

  it('ag isteginden sonra guncel kullanici, isletme ve yetkiyi yeniden denetler', () => {
    const fetchIndex = hook.indexOf('const transactions = isOwner');
    const latestCheckIndex = hook.indexOf(
      'const latestAccess = latestExportAccessRef.current',
    );
    const exportIndex = hook.indexOf('await exportReportToExcel({');

    expect(fetchIndex).toBeGreaterThan(-1);
    expect(latestCheckIndex).toBeGreaterThan(fetchIndex);
    expect(exportIndex).toBeGreaterThan(latestCheckIndex);
    expect(hook).toContain('!latestAccess.canExport');
    expect(hook).toContain(
      'latestAccess.isletmeId !== expectedIsletmeId',
    );
    expect(hook).toContain('latestAccess.userId !== expectedUserId');
  });

  it('reports-only yetkide nominal ve tarihsel Excel giris noktasini gosterir', () => {
    expect(hook).toContain('canExport: boolean;');
    expect(hook).toContain('exportLensSummary:');
    expect(hook).toContain('exportIncomeExpenseLensSummaryToExcel({');
    expect(page).toMatch(
      /headerRight: \(\) => canExport \? \([\s\S]*?<ReportExportButton[\s\S]*?\) : null/,
    );
    expect(page).toContain('exportLensSummary({');
  });
});
