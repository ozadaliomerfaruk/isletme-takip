import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('U-4 cari islem projection istemci sozlesmesi', () => {
  const hooks = read('src/hooks/useIslemler.ts');
  const hookBlock = hooks.slice(
    hooks.indexOf('export function useIslemlerByCari'),
    hooks.indexOf('export function useIslemlerByHesap'),
  );
  const detail = read('src/app/cariler/[id].tsx');

  it('dar DTO ve unknown parser genis cast olmadan exact projection kolonlarini tuketir', () => {
    const projection = read('src/lib/cariTransactionProjection.ts');
    const dto = projection.match(
      /export interface CariIslemListRow \{([\s\S]*?)\n\}/,
    )?.[1];

    expect(dto).toBeTruthy();
    for (const field of [
      'id',
      'isletme_id',
      'type',
      'amount',
      'description',
      'date',
      'source_currency',
      'target_currency',
      'exchange_rate',
      'vade_tarihi',
      'photo_path',
      'created_by',
      'created_at',
      'updated_at',
      'kategori',
      'hesap',
    ]) {
      expect(dto).toMatch(new RegExp(`\\b${field}\\??:`));
    }
    expect(dto).not.toMatch(
      /\b(?:balance|initial_balance|hesap_id|kategori_id|cari_id|creator)\??:/,
    );
    expect(projection).toContain('Number.isFinite(value)');
    expect(projection).toContain('value.trim().length > 0');
    expect(projection).toContain('return value.map(parseCariIslemListRow);');
    expect(projection).toContain(
      "throw new Error('Invalid cari transaction projection response')",
    );
  });

  it('projection cache keyini tenant, cari, kullanici ve visibility ile versiyonlar', () => {
    const queryKeys = read('src/lib/queryKeys.ts');
    const permissions = read('src/hooks/usePermissions.ts');

    expect(queryKeys).toMatch(
      /\[\s*'islemler',\s*'cari-projection-v1',\s*isletmeId,\s*cariId,\s*userId,\s*canSeeAllUsersData,\s*\]/,
    );
    expect(permissions).toContain('const canSeeAllUsersData =');
    expect(permissions).toContain('currentPermissions.level == null');
    expect(permissions).toContain(
      'isPermissionLevel(currentPermissions.level)',
    );
    expect(permissions).toContain('canSeeAllUsersData,');
    expect(hookBlock).toContain('queryKeys.islemler.cariProjection(');
    expect(hookBlock).toContain('user?.id ??');
    expect(hookBlock).toContain('canSeeAllUsersData,');
  });

  it('non-linked shared Cariler view yolunu keyset RPCye tasir ve diske yazmaz', () => {
    expect(hookBlock).toContain(
      'const isSharedNonViewer = !isOwner && !asViewer;',
    );
    expect(hookBlock).toContain(
      'const useSharedProjection = isSharedNonViewer && canSeeCariler;',
    );
    expect(hookBlock).toContain("canAccessModule('cariler')");
    expect(hookBlock).not.toContain("canCreate('cariler')");
    expect(hookBlock).toContain(
      "supabase.rpc(\n          'get_cari_islem_satirlari_v1'",
    );
    for (const parameter of [
      'p_isletme_id',
      'p_cari_id',
      'p_limit',
      'p_before_date',
      'p_before_created_at',
      'p_before_id',
    ]) {
      expect(hookBlock).toContain(`${parameter}:`);
    }
    expect(hookBlock).toContain('return parseCariIslemListRows(data);');
    expect(hookBlock).toContain('persist: false');
    expect(hookBlock).toContain(
      "query_purpose: 'islemler:cari-projection-v1'",
    );
    expect(hookBlock).toMatch(
      /enabled:[\s\S]*?!isSharedNonViewer[\s\S]*?canSeeCariler[\s\S]*?user\?\.id/,
    );
    expect(hookBlock).toMatch(
      /data:\s*!isSharedNonViewer \|\| canSeeCariler\s*\?/,
    );
  });

  it('owner ve linked-viewer eski base/offset yolunu korur', () => {
    expect(hookBlock).toContain('queryKeys.islemler.byCari(');
    expect(hookBlock).toContain("asViewer ? 'viewer' : 'owner'");
    expect(hookBlock).toMatch(
      /let query = supabase\s*\.from\('islemler'\)/,
    );
    expect(hookBlock).toContain("if (!asViewer) {");
    expect(hookBlock).toContain(
      "query = query.eq('isletme_id', isletme.id);",
    );
    expect(hookBlock).toContain('.range(from, to);');
    expect(hookBlock).toContain(
      "return typeof lastPageParam === 'number' ? lastPageParam + 1 : 1;",
    );
  });

  it('v4 read-all detayda aggregate, tarihsel bakiye ve baglamsal notlari acar', () => {
    expect(detail).toContain(
      'const isOwnOnlyShared =\n    !isOwner && !isViewer && !canSeeAllUsersData;',
    );
    expect(detail).toContain(
      "const canSeeCariModule = canAccessModule('cariler');",
    );
    expect(detail).toContain(
      'const canLoadCariAggregateHelpers =\n    canSeeCariModule && !isViewer && !isOwnOnlyShared;',
    );

    for (const hook of [
      'useCariTahsisOzeti',
      'useCariTaksitBirimleri',
      'useCariOzet',
      'useCariVadeliBorclar',
      'useCariVadeDetay',
      'useCariIslemKalan',
      'useCariVadeRozet',
    ]) {
      expect(detail).toMatch(
        new RegExp(
          `${hook}\\([\\s\\S]{0,100}canLoadCariAggregateHelpers`,
        ),
      );
    }

    expect(detail).toContain(
      'const tahsisOzeti = canLoadCariAggregateHelpers',
    );
    expect(detail).toContain(
      'const islemKalanMap = canLoadCariAggregateHelpers',
    );
    expect(detail).toContain(
      'const vadeRozetMap = canLoadCariAggregateHelpers',
    );
    expect(detail).toContain(
      'if (!showHistoricalBalances || !cari || !islemler) return 0;',
    );
    expect(detail).toContain(
      'if (!showHistoricalBalances || !cari || !islemler) return map;',
    );
    expect(detail).toContain('{showHistoricalBalances && (');
    expect(detail).toContain(
      'const rows: DetailSummaryRow[] = canLoadCariAggregateHelpers',
    );
    expect(detail).toContain(
      "hideCariAggregateData\n                  ? '—'",
    );
    expect(detail).toMatch(
      /rawIleriTarihliIslemler[\s\S]{0,180}item\.created_by === user\?\.id/,
    );
    expect(detail).toContain('const entityNotes = rawEntityNotes;');
    expect(detail).not.toMatch(
      /rawEntityNotes[\s\S]{0,180}\.filter\([\s\S]{0,120}created_by/,
    );
    expect(detail).toMatch(
      /if \(!canSeeCariModule\) \{[\s\S]{0,220}permissions\.noModuleAccess/,
    );
  });

  it('transaction grouping narrow cari DTOyu geriye uyumlu generic olarak kabul eder', () => {
    const grouping = read('src/lib/transactionGrouping.ts');

    expect(grouping).toContain(
      'TTransaction extends GroupableTransaction = IslemWithRelations',
    );
    expect(grouping).toContain(
      'transactions: TTransaction[]',
    );
    expect(detail).toContain(
      'TransactionListItem<CariIslemListRow>',
    );
  });
});
