import fs from 'fs';
import path from 'path';

import { queryKeys } from '@/lib/queryKeys';

const ROOT = path.resolve(__dirname, '../../..');
const hookPath = path.join(ROOT, 'src/hooks/useCategoryReport.ts');

function readHook(): string {
  return fs.readFileSync(hookPath, 'utf8');
}

describe('category report v2 client contract', () => {
  it('scopes every aggregate cache key by API version, tenant, user and permission fingerprint', () => {
    const scope = ['tenant-1', 'user-1', 'r1h1c1u1p1a0'] as const;

    expect(
      queryKeys.reports.categoryReport(
        ...scope,
        'gelir',
        'cash-flow',
        '2026-07-01T00:00:00',
        '2026-07-31T23:59:59',
      ),
    ).toEqual([
      'category-report',
      'v2',
      ...scope,
      'gelir',
      'cash-flow',
      '2026-07-01T00:00:00',
      '2026-07-31T23:59:59',
    ]);

    expect(
      queryKeys.reports.categoryReportReturns(
        ...scope,
        'gelir',
        '2026-07-01T00:00:00',
        '2026-07-31T23:59:59',
      ),
    ).toEqual([
      'category-report-returns',
      'v2',
      ...scope,
      'gelir',
      '2026-07-01T00:00:00',
      '2026-07-31T23:59:59',
    ]);

    expect(
      queryKeys.reports.hierarchicalCategoryReport(
        ...scope,
        'gider',
        '',
        '2026-07-01T00:00:00',
        '2026-07-31T23:59:59',
      ),
    ).toEqual([
      'hierarchical-category-report',
      'v2',
      ...scope,
      'gider',
      '',
      '2026-07-01T00:00:00',
      '2026-07-31T23:59:59',
    ]);

    expect(
      queryKeys.reports.hierarchicalCategoryReportReturns(
        ...scope,
        'gider',
        '2026-07-01T00:00:00',
        '2026-07-31T23:59:59',
      ),
    ).toEqual([
      'hierarchical-category-report-returns',
      'v2',
      ...scope,
      'gider',
      '2026-07-01T00:00:00',
      '2026-07-31T23:59:59',
    ]);

    expect(
      queryKeys.reports.subCategoryReportRpc(
        ...scope,
        'category-a,category-b',
        'gider',
        '',
        '2026-07-01T00:00:00',
        '2026-07-31T23:59:59',
      ),
    ).toEqual([
      'sub-category-report-rpc',
      'v2',
      ...scope,
      'category-a,category-b',
      'gider',
      '',
      '2026-07-01T00:00:00',
      '2026-07-31T23:59:59',
    ]);

    expect(
      queryKeys.reports.subCategoryReportReturns(
        ...scope,
        'category-a,category-b',
        'gider',
        '2026-07-01T00:00:00',
        '2026-07-31T23:59:59',
      ),
    ).toEqual([
      'sub-category-report-returns',
      'v2',
      ...scope,
      'category-a,category-b',
      'gider',
      '2026-07-01T00:00:00',
      '2026-07-31T23:59:59',
    ]);
  });

  it('scopes category metadata and direct drill-down keys by tenant, user and permissions', () => {
    const scope = ['tenant-1', 'user-1', 'o0r1h1c1u1p1a1'] as const;

    expect(
      queryKeys.reports.allKategoriler(...scope, 'gelir'),
    ).toEqual([
      'all-kategoriler',
      'scoped-v1',
      ...scope,
      'gelir',
    ]);

    expect(
      queryKeys.reports.subCategories(
        ...scope,
        'parent-category',
        'gider',
      ),
    ).toEqual([
      'sub-categories',
      'scoped-v1',
      ...scope,
      'parent-category',
      'gider',
    ]);

    expect(
      queryKeys.reports.categoryTransactions(
        ...scope,
        'category-a',
        'gider',
        '',
        '2026-07-01T00:00:00',
        '2026-07-31T23:59:59',
        true,
      ),
    ).toEqual([
      'category-transactions',
      'scoped-v1',
      ...scope,
      'category-a',
      'gider',
      '',
      '2026-07-01T00:00:00',
      '2026-07-31T23:59:59',
      true,
    ]);

    expect(
      queryKeys.reports.multiCategoryTransactions(
        ...scope,
        'category-a,category-b',
        'gider',
        'cash-flow',
        '2026-07-01T00:00:00',
        '2026-07-31T23:59:59',
        false,
      ),
    ).toEqual([
      'multi-category-transactions',
      'scoped-v1',
      ...scope,
      'category-a,category-b',
      'gider',
      'cash-flow',
      '2026-07-01T00:00:00',
      '2026-07-31T23:59:59',
      false,
    ]);
  });

  it('uses only the permission-filtered v2 aggregate and never persists it to disk', () => {
    const hook = readHook();

    expect(
      hook.match(/supabase\.rpc\('get_category_report_v2'/g),
    ).toHaveLength(6);
    expect(hook).not.toMatch(
      /supabase\.rpc\('get_category_report'/,
    );
    expect(hook).toContain('persist: false');
    expect(
      hook.match(/meta: CATEGORY_REPORT_QUERY_META/g),
    ).toHaveLength(6);
    expect(
      hook.match(/meta: CATEGORY_REPORT_METADATA_QUERY_META/g),
    ).toHaveLength(2);
    expect(
      hook.match(/meta: CATEGORY_REPORT_DRILLDOWN_QUERY_META/g),
    ).toHaveLength(2);
  });

  it('opens aggregates and narrow drill-down with Raporlar alone', () => {
    const hook = readHook();
    const enabledBlock =
      hook.match(/const enabled =([\s\S]*?);/)?.[1] ?? '';

    expect(hook).toContain('!isletmeLoading');
    expect(hook).toContain('!!user?.id');
    expect(enabledBlock).toContain('&& canViewReports');
    expect(enabledBlock).not.toContain('canViewAccounts');
    expect(enabledBlock).not.toContain('canViewCariler');
    expect(enabledBlock).not.toContain('canViewProducts');
    expect(enabledBlock).not.toContain('canViewPersonnel');
    expect(hook).toContain('drilldownEnabled: enabled');
    expect(hook).toContain(
      "'get_rapor_kategori_referanslari_v1'",
    );
    expect(hook).toContain(
      "'get_kategori_rapor_islem_satirlari_v1'",
    );
    expect(hook).toContain('parseCategoryReportTransactionRows(');
    expect(hook.match(/if \(!drilldownEnabled/g)).toHaveLength(2);
    expect(hook.match(/enabled: drilldownEnabled/g)).toHaveLength(2);
  });

  it('fingerprints permission dimensions and masks stale aggregate, metadata and drill-down data', () => {
    const hook = readHook();

    for (const permissionBit of [
      'isOwner',
      'canViewReports',
      'canViewAccounts',
      'canViewCariler',
      'canViewProducts',
      'canViewPersonnel',
      'canSeeAllUsersData',
    ]) {
      expect(hook).toContain(`Number(${permissionBit})`);
    }

    expect(hook.match(/const canShowAggregate =/g)).toHaveLength(3);
    expect(hook.match(/isRefetchError:/g)).toHaveLength(8);
    expect(hook.match(/query\.isRefetchError/g)).toHaveLength(4);
    expect(hook).toContain('const rpcData = canShowAggregate ? rawRpcData : undefined;');
    expect(hook.match(/const islemler = useMemo\(/g)).toHaveLength(2);
    expect(hook).toContain('() => (canShowAggregate ? rawIslemler : [])');
    expect(hook).toContain('? rawAllKategoriler');
    expect(hook).toContain('? rawKategoriler');
    expect(hook.match(/\? query\.data \?\? \[\]/g)).toHaveLength(2);
  });
});
