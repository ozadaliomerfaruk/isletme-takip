import fs from 'node:fs';
import path from 'node:path';

import { queryKeys } from '@/lib/queryKeys';

const ROOT = path.resolve(__dirname, '../../..');
const hook = fs.readFileSync(
  path.join(ROOT, 'src/hooks/useProductReport.ts'),
  'utf8',
);
const screen = fs.readFileSync(
  path.join(ROOT, 'src/app/raporlar/alis-satis.tsx'),
  'utf8',
);
const exploreGrid = fs.readFileSync(
  path.join(ROOT, 'src/components/reports/ExploreGrid.tsx'),
  'utf8',
);
const queryClient = fs.readFileSync(
  path.join(ROOT, 'src/lib/queryClient.ts'),
  'utf8',
);
const queryKeysSource = fs.readFileSync(
  path.join(ROOT, 'src/lib/queryKeys.ts'),
  'utf8',
);
const invalidationSource = queryKeysSource.slice(
  queryKeysSource.indexOf('const invalidationMap'),
);

describe('product report v2 client contract', () => {
  it('scopes both query keys by API, tenant, user and permission fingerprint', () => {
    expect(
      queryKeys.reports.productReport(
        'tenant-1',
        'user-1',
        'o0r1u1a0',
        'alis',
        '2026-07-01T00:00:00',
        '2026-07-31T23:59:59',
      ),
    ).toEqual([
      'product-report',
      'v2',
      'tenant-1',
      'user-1',
      'o0r1u1a0',
      'alis',
      '2026-07-01T00:00:00',
      '2026-07-31T23:59:59',
    ]);

    expect(
      queryKeys.reports.productReportReturns(
        'tenant-1',
        'user-1',
        'o1r1u1a1',
        'satis',
        '2026-07-01T00:00:00',
        '2026-07-31T23:59:59',
      ),
    ).toEqual([
      'product-report-returns',
      'v2',
      'tenant-1',
      'user-1',
      'o1r1u1a1',
      'satis',
      '2026-07-01T00:00:00',
      '2026-07-31T23:59:59',
    ]);
  });

  it('uses only V2 behind Raporlar OR Urunler and fingerprints own/all', () => {
    expect(
      hook.match(/supabase\.rpc\('get_product_report_v2'/g),
    ).toHaveLength(2);
    expect(hook).not.toMatch(
      /supabase\.rpc\('get_product_report'/,
    );
    expect(hook).toMatch(
      /canViewProductReport\s*=\s*canViewReports \|\| canViewProducts/,
    );
    for (const bit of [
      'isOwner',
      'canViewReports',
      'canViewProducts',
      'canSeeAllUsersData',
    ]) {
      expect(hook).toContain(`Number(${bit})`);
    }
  });

  it('does not persist aggregates and masks stale/refetch-error data', () => {
    expect(hook).toContain('persist: false');
    expect(
      hook.match(/meta: PRODUCT_REPORT_QUERY_META/g),
    ).toHaveLength(2);
    expect(hook).toContain('mainQuery.isRefetchError');
    expect(hook).toContain('returnQuery.isRefetchError');
    expect(
      hook.match(/&& !hasUnsafeQueryState/g),
    ).toHaveLength(2);
    expect(queryClient).toContain("-s7`");
  });

  it('validates server rows before navigation or financial aggregation', () => {
    expect(hook).toContain('UUID_PATTERN.test(row.urun_id)');
    expect(hook).toContain('isFiniteNumeric(row.toplam_tutar)');
    expect(
      hook.match(/filter\(isProductReportRpcRow\)/g),
    ).toHaveLength(2);
  });

  it('surfaces return errors, refreshes both queries and carries empty conversion warnings', () => {
    const returnErrorBlock =
      hook.match(
        /\[useProductReport\] returns RPC error:[\s\S]{0,180}/,
      )?.[0] ?? '';
    expect(returnErrorBlock).toContain('throw error');
    expect(hook).toMatch(
      /Promise\.all\(\[\s*refetchMain\(\),\s*refetchReturns\(\),\s*\]\)/s,
    );
    expect(hook).toMatch(
      /mainQuery\.isFetching \|\| returnQuery\.isFetching/,
    );
    expect(hook).toMatch(
      /mainQuery\.error \|\| returnQuery\.error/,
    );
    expect(hook).toMatch(
      /mainData\.length === 0[\s\S]*?conversionIncomplete: converter\.conversionIncomplete/,
    );
  });

  it('keeps the report-center discovery card visible without Products', () => {
    expect(screen).toContain('return <AlisSatisRaporContent />;');
    expect(exploreGrid).not.toContain('requiredModule');
    expect(exploreGrid).toContain('REPORT_CARDS.map((card)');
  });

  it('keeps broad detail owner-only but exports shared aggregate data', () => {
    expect(screen).toContain(
      'if (!isletme || !canExport) return;',
    );
    expect(screen).toMatch(
      /headerRight: \(\) => \(\s*canExport\s*\?/s,
    );
    expect(screen).toContain(
      "const canExport = canExportModule('raporlar')",
    );
    expect(screen).toContain('if (isOwner) {');
    expect(screen).toContain(
      'Shared reports-only export',
    );
  });

  it('invalidates mounted product reports after H/C/P source metadata changes', () => {
    for (const mutationKey of ['hesap', 'cari', 'personel']) {
      const block =
        invalidationSource.match(
          new RegExp(
            `${mutationKey}: \\{([\\s\\S]*?)\\n  \\},`,
          ),
        )?.[1] ?? '';
      expect(block).toContain("'product-report'");
      expect(block).toContain("'product-report-returns'");
    }
  });
});
