import fs from 'node:fs';
import path from 'node:path';

import { queryKeys } from '@/lib/queryKeys';

const ROOT = path.resolve(__dirname, '../../..');
const hook = fs.readFileSync(
  path.join(ROOT, 'src/hooks/useAccountReport.ts'),
  'utf8',
);
const reportScreen = fs.readFileSync(
  path.join(ROOT, 'src/app/raporlar/gelir-gider.tsx'),
  'utf8',
);
const detailScreen = fs.readFileSync(
  path.join(ROOT, 'src/app/raporlar/hesap/[id].tsx'),
  'utf8',
);

describe('income source report v2 client contract', () => {
  it('scopes aggregate and drill-down keys by API version, tenant, user and permissions', () => {
    expect(
      queryKeys.reports.incomeBySource(
        'tenant-1',
        'user-1',
        'o0r1h1b0c1p0a0',
        '2026-07-01T00:00:00',
        '2026-07-31T23:59:59',
        'usd',
      ),
    ).toEqual([
      'income-by-source',
      'v3-lens',
      'tenant-1',
      'user-1',
      'o0r1h1b0c1p0a0',
      '2026-07-01T00:00:00',
      '2026-07-31T23:59:59',
      'usd',
    ]);

    expect(
      queryKeys.reports.incomeSourceTransactions(
        'tenant-1',
        'user-1',
        'o1r1h1b1c1p1a1',
        'hesap',
        'account-1',
        '2026-07-01T00:00:00',
        '2026-07-31T23:59:59',
      ),
    ).toEqual([
      'income-source-transactions',
      'scoped-v2',
      'tenant-1',
      'user-1',
      'o1r1h1b1c1p1a1',
      'hesap',
      'account-1',
      '2026-07-01T00:00:00',
      '2026-07-31T23:59:59',
    ]);
  });

  it('keeps nominal on V2, uses the additive historical RPC and treats Raporlar as access to every source', () => {
    expect(hook).toContain(
      "supabase.rpc('get_income_by_source_v2'",
    );
    expect(hook).toContain(
      "supabase.rpc('get_income_by_source_lens_v1'",
    );
    expect(hook).toContain("lens === 'nominal'");
    expect(hook).toContain(
      'const canViewAccountsInReport = canViewReports || canViewAccounts',
    );
    expect(hook).toContain(
      'const canViewCarilerInReport = canViewReports || canViewCariler',
    );
    expect(hook).toContain(
      'const canViewPersonnelInReport = canViewReports || canViewPersonnel',
    );
    expect(hook).toContain(
      "candidate.source_type === 'birikim'",
    );
    for (const permissionBit of [
      'isOwner',
      'canViewReports',
      'canViewAccounts',
      'canViewSavingsInReport',
      'canViewCariler',
      'canViewPersonnel',
      'canSeeAllUsersData',
    ]) {
      expect(hook).toContain(`Number(${permissionBit})`);
    }
  });

  it('does not persist sensitive aggregates or drill-down rows and masks stale data', () => {
    expect(
      hook.match(/persist: false/g),
    ).toHaveLength(2);
    expect(hook).toContain(
      'meta: INCOME_SOURCE_REPORT_QUERY_META',
    );
    expect(hook).toContain(
      'meta: INCOME_SOURCE_DRILLDOWN_QUERY_META',
    );
    expect(
      hook.match(/&& !query\.isRefetchError/g),
    ).toHaveLength(2);
    expect(hook).toContain(
      '? query.data',
    );
    expect(hook).toContain(
      '? query.data ?? []',
    );
  });

  it('validates runtime source kinds and fails closed on crafted deep links', () => {
    expect(hook).toContain(
      "value === 'hesap' || value === 'cari' || value === 'personel'",
    );
    expect(hook).toContain(
      "kind === 'hesap'",
    );
    expect(hook).toContain(
      ': null;',
    );
    expect(detailScreen).toContain(
      'isIncomeSourceKind(rawKind)',
    );
    expect(detailScreen).toContain(
      'Bilinmeyen açık bir değer hiçbir kaynak sorgusuna düşmez.',
    );
  });

  it('keeps broad direct drill-down owner-only and uses the narrow RPC for shared users', () => {
    expect(hook).toContain(
      'const reportsEnabled = reportAccess.enabled && kind !== null',
    );
    expect(hook).toContain(
      'if (!reportAccess.isOwner)',
    );
    expect(hook).toContain(
      "'get_gelir_kaynagi_islem_satirlari_v1'",
    );
    expect(hook).toContain(
      'fetchSharedIncomeSourceTransactions({',
    );
    expect(reportScreen).toContain(
      'kaynakRaporu.canOpenDetails',
    );
    expect(reportScreen).toMatch(
      /kaynakRaporu\.canOpenDetails\s+\? \(\) => handleSourcePress\(item\)\s+: undefined/s,
    );
  });

  it('uses the active source total and conversion warning in account grouping', () => {
    expect(reportScreen).toMatch(
      /showAccounts\s+\? kaynakRaporu\.totalAmount\s+: gelirRaporu\.totalAmount/s,
    );
    expect(reportScreen).toContain(
      'const activeReport = showAccounts ? kaynakRaporu : catReport',
    );
    expect(reportScreen).toContain('activeReport.conversionIncomplete === true');
    expect(reportScreen).toContain('activeReport.missingRateCount ?? 0');
  });

  it('keeps source grouping and drill-down in the selected historical lens', () => {
    expect(reportScreen).toContain('lens: selectedLens');
    expect(reportScreen).toContain('lens={selectedLens}');
    expect(reportScreen).toContain('formatReportLensValue(group.total, selectedLens)');
    expect(reportScreen).not.toContain("selectedLens === 'nominal' && gelirGroupBy");
    expect(detailScreen).toContain('useHistoricalReportLens(selectedLens, startDate, endDate)');
    expect(detailScreen).toContain('_reportAmountCurrency: hesapCurrency');
    expect(detailScreen).toContain('incomeExpenseLens.cpiRateCompact');
    expect(detailScreen).toContain('incomeExpenseLens.dailyRateCompact');
    expect(detailScreen).toContain('<IncomeExpenseLensPicker');
    expect(reportScreen).toContain('dimensionLabel: showAccounts');
    expect(reportScreen).toContain('kaynakRaporu.groups.flatMap');
    expect(reportScreen).toContain('totalAmount: activeReport.totalAmount');
  });
});
