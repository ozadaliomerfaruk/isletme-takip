import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('P0-S7 hesap islem projection istemci sozlesmesi', () => {
  const hooks = read('src/hooks/useIslemler.ts');
  const hookBlock = hooks.slice(
    hooks.indexOf('export function useIslemlerByHesap'),
    hooks.indexOf('export function useIslemlerByPersonel'),
  );
  const detail = read('src/app/hesaplar/[id].tsx');
  const projection = read('src/lib/hesapTransactionProjection.ts');
  const futureHooks = read('src/hooks/useIleriTarihliIslemler.ts');
  const pdfExport = read('src/hooks/usePdfExport.ts');
  const excelExport = read('src/hooks/useExcelExport.ts');
  const detailExport = read('src/components/detail/DetailExportSection.tsx');
  const statementProjection = read(
    'src/lib/hesapStatementProjection.ts',
  );

  it('DTO ham tenant/entity kimliklerini tasimaz ve unknown cevabi parse eder', () => {
    const dto = projection.match(
      /export interface HesapIslemListRow \{([\s\S]*?)\n\}/,
    )?.[1];

    expect(dto).toBeTruthy();
    for (const field of [
      'id',
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
      'source_account_name',
      'target_account_name',
      'counterparty_kind',
      'counterparty_name',
    ]) {
      expect(dto).toMatch(new RegExp(`\\b${field}\\??:`));
    }
    expect(dto).not.toMatch(
      /\b(?:isletme_id|hesap_id|hedef_hesap_id|cari_id|personel_id|kategori_id|updated_by|source_ileri_id|hedef_islem_id)\??:/,
    );
    expect(projection).toContain(
      'return value.map(parseHesapIslemListRow);',
    );
    expect(projection).toContain('Number.isFinite(value)');
    expect(projection).toContain('UUID_PATTERN.test(parsed)');
    expect(projection).toContain('CURRENCY_SET.has(value)');
    expect(projection).toContain('parsed <= 0');
    expect(projection).toContain('TIMESTAMP_PATTERN.exec(parsed)');
  });

  it('shared hesap detayini permission-fingerprintli keyset RPCye tasir ve diske yazmaz', () => {
    expect(hookBlock).toContain(
      "const canSeeHesaplar = canAccessModule('hesaplar');",
    );
    expect(hookBlock).toContain('const isShared = !isOwner;');
    expect(hookBlock).toContain(
      'const useSharedProjection = isShared && canSeeHesaplar;',
    );
    expect(hookBlock).toContain(
      'permissionAccessSignature(\n    currentPermissions,',
    );
    expect(hookBlock).toContain(
      'queryKeys.islemler.hesapProjection(',
    );
    expect(hookBlock).toContain(
      "supabase.rpc(\n          'get_hesap_islem_satirlari_v1'",
    );
    for (const parameter of [
      'p_isletme_id',
      'p_hesap_id',
      'p_limit',
      'p_before_date',
      'p_before_created_at',
      'p_before_id',
    ]) {
      expect(hookBlock).toContain(`${parameter}:`);
    }
    expect(hookBlock).toContain('parseHesapIslemListRows(data)');
    expect(hookBlock).toContain('persist: false');
    expect(hookBlock).toContain(
      "query_purpose: 'islemler:hesap-projection-v1'",
    );
    expect(hookBlock).toMatch(
      /enabled:[\s\S]*?!isShared[\s\S]*?canSeeHesaplar[\s\S]*?user\?\.id/,
    );
  });

  it('owner eski genis SELECT ve offset yolunda kalir', () => {
    expect(hookBlock).toContain(
      ': queryKeys.islemler.byHesap(hesapId, isletme?.id ??',
    );
    expect(hookBlock).toMatch(
      /const \{ data, error \} = await supabase\s*\.from\('islemler'\)/,
    );
    expect(hookBlock).toContain(
      '.or(`hesap_id.eq.${hesapId},hedef_hesap_id.eq.${hesapId}`)',
    );
    expect(hookBlock).toMatch(
      /\.order\('date', \{ ascending: false \}\)\s*\.order\('created_at', \{ ascending: false \}\)\s*\.order\('id', \{ ascending: false \}\)/,
    );
    expect(hookBlock).toContain('.range(from, to);');
    expect(hookBlock).toContain(
      "return typeof lastPageParam === 'number' ? lastPageParam + 1 : 1;",
    );
  });

  it('shared sayfalari ID ile tekillestirir ve role gecisinde write stateini kapatir', () => {
    expect(hookBlock).toContain(
      'return dedupeHesapIslemRowsById(rows);',
    );
    expect(hookBlock).toContain(
      'if (!useSharedProjection) return rows;',
    );
    expect(detail).toMatch(
      /if \(isOwner && canMutateDetailHistory\) return;[\s\S]*?setShowCopyBar\(false\);/,
    );
    expect(detail).not.toContain('setShowShareOptions(false);\n    setShowCopyBar(false);');
  });

  it('hesap detayi projection yonunu kullanir ve shared mutationlari kayit yetkisiyle acar', () => {
    expect(detail).toContain(
      'type HesapDetailIslem = IslemWithRelations | HesapIslemListRow;',
    );
    expect(detail).toContain(
      '? isHesapProjectionTargetLeg(islem)',
    );
    expect(detail).toContain('getTransactionProductMutationDecision({');
    expect(detail).toContain('canAccessModule,');
    expect(detail).toContain("canUpdate('islemler'");
    expect(detail).toContain("canDelete('islemler'");
    expect(detail).toContain("canUpdate('urunler'");
    expect(detail).toContain("canDelete('urunler'");
    expect(detail).toMatch(
      /const canCopyItem =[\s\S]{0,100}canMutateDetailHistory && isOwner && canCreateTransactions/,
    );
    expect(detail).toMatch(
      /visible=\{canMutateDetailHistory && showEditBar && !!editTransactionId && canUpdateTransaction\(editTransactionId\)\}/,
    );
    expect(detail).toMatch(
      /\{canMutateDetailHistory && isOwner && \(\s*<QuickTransactionBar[\s\S]*?copySourceId=/,
    );
  });

  it('hesap defteri kaynak moduller kapali olsa da tam gecmisten bakiye uretir', () => {
    expect(detail).toContain(
      "const hasCompleteTransactionHistory = canAccessModule('hesaplar');",
    );
    expect(detail).not.toContain('canSeeAllUsersData');
    expect(detail).toContain(
      'if (!hasCompleteTransactionHistory) return map;',
    );
    expect(detail).toContain(
      'const islemIdList = useMemo(\n    () => (islemler || []).map((i) => i.id)',
    );
    expect(detail).toContain(
      'useUrunKalemlerByIslemIds(\n    islemIdList,\n    true,',
    );
    expect(detail).toMatch(
      /const isBalanceEditable =[\s\S]{0,120}canUpdate\('hesaplar'/,
    );
  });

  it('shared hesap exportunu dar keyset projection ile view seviyesinde acar', () => {
    expect(detail).toContain('onPress={() => setShowShareOptions(true)}');
    expect(detail).toMatch(
      /<DetailExportSection[\s\S]*?entityType="hesap"/,
    );
    expect(detailExport).not.toContain(
      "if (entityType === 'hesap' && !isOwner) {",
    );
    expect(pdfExport).toContain(
      "if (entityType === 'hesap' && !isOwner) {",
    );
    expect(pdfExport).toContain('fetchHesapStatementTransactions({');
    expect(pdfExport).not.toContain(
      "entityType === 'hesap' && !isOwner) {\n      throw new Error('Permission denied')",
    );
    expect(excelExport).toContain(
      "if (entityType === 'hesap' && !isOwner) {",
    );
    expect(excelExport).toContain(
      'fetchHesapStatementTransactions({',
    );
    expect(statementProjection).toContain(
      "'get_hesap_islem_satirlari_v1'",
    );
    expect(statementProjection).toContain('parseHesapIslemListRows(data)');
    expect(statementProjection).toContain(
      'dedupeHesapIslemRowsById(rows)',
    );
    expect(statementProjection).not.toContain(".from('islemler')");
  });

  it('hesap ileri-tarihli sorgusunu Hesaplar moduluyle sinirlar', () => {
    const futureBlock = futureHooks.slice(
      futureHooks.indexOf(
        'export function useIleriTarihliIslemlerByHesap',
      ),
      futureHooks.indexOf(
        'export function useIleriTarihliIslemlerByCari',
      ),
    );

    expect(futureBlock).toContain(
      "const canSeeHesaplar = canAccessModule('hesaplar');",
    );
    expect(futureBlock).toContain(
      "if (!canSeeHesaplar) return [];",
    );
    expect(futureBlock).toContain(
      'enabled: canSeeHesaplar && !!isletme && !!hesapId',
    );
    expect(futureBlock).toContain(
      'data: canSeeHesaplar ? result.data ?? [] : []',
    );
    expect(futureBlock).toContain(
      "query_purpose: 'ileri-tarihli:hesap-module-scoped'",
    );
  });

  it('RPC foto pointerini kanonik guarddan gecirmeden buton veya viewer acmaz', () => {
    expect(detail).toContain(
      'const validatedPhotoPath = getValidatedIslemPhotoPath(',
    );
    expect(detail).toContain('hasPhoto={!!validatedPhotoPath}');
    expect(detail).toContain(
      'if (validatedPhotoPath) onViewPhoto(validatedPhotoPath, islem.id);',
    );
    expect(detail).toContain(
      'const validatedPath = getValidatedIslemPhotoPath(',
    );
    expect(detail).toContain('if (!validatedPath) return;');
    expect(detail).toContain('setViewPhotoPath(validatedPath);');
  });
});
