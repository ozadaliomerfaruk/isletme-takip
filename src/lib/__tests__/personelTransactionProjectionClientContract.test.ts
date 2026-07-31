import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('P0-S7/C3 personel projection istemci sozlesmesi', () => {
  const hooks = read('src/hooks/useIslemler.ts');
  const pagedBlock = hooks.slice(
    hooks.indexOf('export function useIslemlerByPersonel'),
    hooks.indexOf('export function useAllIslemlerByPersonel'),
  );
  const allBlock = hooks.slice(
    hooks.indexOf('export function useAllIslemlerByPersonel'),
    hooks.indexOf('export function useAllLeaveByPersonel'),
  );
  const leaveBlock = hooks.slice(
    hooks.indexOf('export function useAllLeaveByPersonel'),
    hooks.indexOf('// Ä°ÅŸlem gÃ¼ncelleme'),
  );
  const detail = read('src/app/personel/[id].tsx');
  const leaveHistory = read('src/app/personel/izin-gecmisi/[id].tsx');
  const projection = read('src/lib/personelTransactionProjection.ts');
  const quotaHook = read('src/hooks/usePersonelLeaveQuotas.ts');
  const futureHooks = read('src/hooks/useIleriTarihliIslemler.ts');
  const reportRoute = read('src/app/raporlar/personel.tsx');
  const reportList = read(
    'src/components/reports/EntityTransactionList.tsx',
  );

  it('DTO exact dar alanlari tasir; tenant/FK/foto ve hesap bakiyesi tasimaz', () => {
    const dto = projection.match(
      /export interface PersonelIslemListRow \{([\s\S]*?)\n\}/,
    )?.[1];

    expect(dto).toBeTruthy();
    for (const field of [
      'id',
      'type',
      'amount',
      'description',
      'date',
      'date_end',
      'source_currency',
      'target_currency',
      'exchange_rate',
      'created_by',
      'created_at',
      'updated_at',
      'kategori',
      'hesap',
    ]) {
      expect(dto).toMatch(new RegExp(`\\b${field}\\??:`));
    }
    expect(dto).not.toMatch(
      /\b(?:isletme_id|personel_id|hesap_id|kategori_id|photo_path|balance|salary|phone|notes|updated_by|source_ileri_id|hedef_islem_id)\??:/,
    );
    expect(projection).toContain(
      'return value.map(parsePersonelIslemListRow);',
    );
    expect(projection).toContain('Number.isFinite(value)');
    expect(projection).toContain('UUID_PATTERN.test(parsed)');
    expect(projection).toContain('CURRENCY_SET.has(value)');
    expect(projection).toContain('parsed <= 0');
    expect(projection).toContain('TIMESTAMP_PATTERN.exec(parsed)');
  });

  it('shared paged detayi permission-fingerprintli keyset RPCye tasir ve diske yazmaz', () => {
    expect(pagedBlock).toContain(
      "const canSeePersonel = canAccessModule('personel');",
    );
    expect(pagedBlock).toContain('const isShared = !isOwner;');
    expect(pagedBlock).toContain(
      'const useSharedProjection = isShared && canSeePersonel;',
    );
    expect(pagedBlock).toContain(
      'queryKeys.islemler.personelProjection(',
    );
    expect(pagedBlock).toContain(
      "supabase.rpc(\n          'get_personel_islem_satirlari_v1'",
    );
    for (const parameter of [
      'p_isletme_id',
      'p_personel_id',
      'p_limit',
      'p_before_date',
      'p_before_created_at',
      'p_before_id',
    ]) {
      expect(pagedBlock).toContain(`${parameter}:`);
    }
    expect(pagedBlock).toContain('parsePersonelIslemListRows(data)');
    expect(pagedBlock).toContain('persist: false');
    expect(pagedBlock).toContain(
      "query_purpose: 'islemler:personel-projection-v1'",
    );
    expect(pagedBlock).toContain(
      'return dedupePersonelIslemRowsById(rows);',
    );
    expect(pagedBlock).toContain(
      'result.isError || result.isRefetchError',
    );
  });

  it('owner eski genis SELECT yolunda kalir ve ucuncu siralama anahtarini kullanir', () => {
    expect(pagedBlock).toContain(
      ': queryKeys.islemler.byPersonel(personelId, isletme?.id ??',
    );
    expect(pagedBlock).toMatch(
      /const \{ data, error \} = await supabase\s*\.from\('islemler'\)/,
    );
    expect(pagedBlock).toMatch(
      /\.order\('date', \{ ascending: false \}\)\s*\.order\('created_at', \{ ascending: false \}\)\s*\.order\('id', \{ ascending: false \}\)/,
    );
    expect(pagedBlock).toContain('.range(from, to);');
  });

  it('tam gecmis ve izin gecmisi shared modda tum keyset sayfalarini RPCden toplar', () => {
    expect(hooks).toContain(
      'async function fetchAllPersonelProjectionPages(',
    );
    expect(hooks).toContain(
      'PERSONEL_PROJECTION_ALL_PAGE_SIZE = 100',
    );
    expect(hooks).toContain(
      'PERSONEL_PROJECTION_MAX_PAGES = 1000',
    );
    expect(hooks).toContain(
      'Personnel transaction projection cursor did not advance',
    );
    expect(hooks).toContain(
      'Personnel transaction projection page limit exceeded',
    );
    for (const block of [allBlock, leaveBlock]) {
      expect(block).toContain(
        'queryKeys.islemler.personelProjection(',
      );
      expect(block).toContain(
        'fetchAllPersonelProjectionPages(',
      );
      expect(block).toContain('persist: false');
      expect(block).toContain(
        'result.isError || result.isRefetchError',
      );
    }
    expect(leaveBlock).toContain(
      'return rows.filter((row) => isLeaveType(row.type));',
    );
  });

  it('izin kota listesi aggregate RPC, izin keyi ve nonpersistent fail-closed cache kullanir', () => {
    expect(quotaHook).toContain(
      "const canSeePersonel = canAccessModule('personel');",
    );
    expect(quotaHook).toContain(
      'queryKeys.personelLeaveQuotas.projection(',
    );
    expect(quotaHook).toContain(
      "'get_personel_izin_kotalari_v1'",
    );
    expect(quotaHook).toContain('permissionAccessSignature(');
    expect(quotaHook).toContain('persist: false');
    expect(quotaHook).toContain(
      'result.isError || result.isRefetchError',
    );
    expect(quotaHook).toContain(
      'Object.prototype.hasOwnProperty.call(',
    );
  });

  it('detay eksik sayfadan acilis/yuruyen bakiye uretmez; owner-only yan yollari gizler', () => {
    expect(detail).toContain(
      'const showHistoricalBalances = !hasNextPage && !isFetchingNextPage;',
    );
    expect(detail).toContain(
      'if (!showHistoricalBalances || !personel || !islemler) return 0;',
    );
    expect(detail).toContain(
      'if (!showHistoricalBalances || !personel || !islemler) return map;',
    );
    expect(detail).toMatch(
      /\{showHistoricalBalances && \(\s*<OpeningBalanceRow/,
    );
    expect(detail).toContain('<IleriTarihliIslemlerSection');
    expect(detail).toMatch(
      /\{isOwner && \(\s*<TouchableOpacity[\s\S]*?setShowShareOptions\(true\)/,
    );
    expect(detail).toMatch(
      /\{isOwner && \(\s*<DetailExportSection[\s\S]*?entityType="personel"/,
    );
    expect(detail).toMatch(
      /Quick Transaction Bar - Edit Mode[\s\S]{0,100}\{canRenderEditTransactionBar && \(/,
    );
    expect(detail).toMatch(
      /Copy Transaction Bar[\s\S]{0,100}\{isOwner && \(/,
    );
  });

  it('projection creator etiketinde yalniz guvenilir oturum tenantini adaptera ekler', () => {
    expect(detail).toContain(
      'toPersonelTransactionCreatorSource(',
    );
    expect(detail).toContain('isletme?.id,');
    expect(reportList).toContain(
      'toPersonelTransactionCreatorSource(',
    );
    expect(reportList).toContain('isletme?.id,');
    expect(projection).toContain(
      'trustedIsletmeId: string | null | undefined',
    );
    expect(projection).not.toContain(
      'row.isletme_id',
    );
  });

  it('izin history union satirlariyla calisir; V2 edit acilir, copy owner-only kalir', () => {
    expect(leaveHistory).toContain(
      'type PersonelTransactionRow,',
    );
    expect(leaveHistory).toContain(
      'useUndoDelete<PersonelTransactionRow>',
    );
    expect(leaveHistory).toContain(
      'FlatList<TransactionListItem<PersonelTransactionRow>>',
    );
    expect(leaveHistory).toMatch(
      /Edit QuickTransactionBar[\s\S]{0,100}\{canRenderEditTransactionBar && \(/,
    );
    expect(leaveHistory).toMatch(
      /Copy QuickTransactionBar[\s\S]{0,100}\{isOwner && \(/,
    );
  });

  it('personel ileri tarihli sorgusunu Personel moduluyle sinirlar', () => {
    const futureBlock = futureHooks.slice(
      futureHooks.indexOf(
        'export function useIleriTarihliIslemlerByPersonel',
      ),
      futureHooks.indexOf(
        'export function usePendingIleriTarihliCount',
      ),
    );

    expect(futureBlock).toContain(
      "const canSeePersonel = canAccessModule('personel');",
    );
    expect(futureBlock).toContain(
      'if (!canSeePersonel || !isletme || !personelId) return [];',
    );
    expect(futureBlock).toContain(
      'enabled: canSeePersonel && !!isletme && !!personelId',
    );
    expect(futureBlock).toContain(
      'data: canSeePersonel ? result.data ?? [] : []',
    );
    expect(futureBlock).toContain(
      "query_purpose: 'ileri-tarihli:personel-module-scoped'",
    );
  });

  it('personel raporu layouttaki Raporlar veya Personel baglamsal guardina dayanir', () => {
    const reportLayout = read('src/app/raporlar/_layout.tsx');
    const navigation = read('src/lib/permissionNavigation.ts');

    expect(reportRoute).toContain('<PersonelRaporContent />');
    expect(reportLayout).toContain(
      '<AnyModuleRouteStack modules={accessModules}>',
    );
    expect(reportLayout).toContain(
      'getReportRouteAccessModules(segments as string[])',
    );
    expect(navigation).toContain(
      "const PERSONEL_REPORT_MODULES = ['raporlar', 'personel'] as const;",
    );
    expect(navigation).toMatch(
      /case 'personel':\s*return PERSONEL_REPORT_MODULES;/,
    );
  });
});
