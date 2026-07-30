import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Cari/Personel bakiye-siz hesap referansi istemci sozlesmesi', () => {
  const accountHookPath = 'src/hooks/useCariPaymentAccountRefs.ts';
  const qtbPath =
    'src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx';
  const entitiesPath =
    'src/components/transaction/QuickTransactionBar/hooks/useQuickTransactionEntities.ts';
  const submitPath =
    'src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts';

  it('ortak hesap DTOsunu dort alanla sinirlar, birikimi reddeder ve diske yazmaz', () => {
    const hook = read(accountHookPath);
    const queryKeys = read('src/lib/queryKeys.ts');
    const dto = hook.match(
      /export interface TransactionAccountRef \{([\s\S]*?)\n\}/,
    )?.[1];
    const mappedRow = hook.match(
      /return \{\s*id:[\s\S]*?type:[\s\S]*?\s*\};/,
    )?.[0];

    expect(dto).toBeTruthy();
    expect(dto).toMatch(/\bid: string;/);
    expect(dto).toMatch(/\bname: string;/);
    expect(dto).toMatch(/\bcurrency: Currency;/);
    expect(dto).toMatch(/\btype: HesapType;/);
    expect(dto).not.toMatch(/\bbalance\b/);
    expect(mappedRow).toBeTruthy();
    expect(mappedRow).not.toMatch(/\bbalance\b/);
    expect(hook).toContain(
      "(row as Record<string, unknown>).type === 'birikim'",
    );

    expect(queryKeys).toContain(
      "['hesaplar', 'transaction-references', isletmeId, scope]",
    );
    expect(hook).toContain(
      "supabase.rpc('get_islem_hesap_referanslari_v2'",
    );
    expect(hook).toContain('p_scope: scope');
    expect(hook).toContain('persist: false');
    expect(hook).toContain(
      'query_purpose: `hesaplar:${scope}-transaction-references`',
    );
  });

  it('referans sorgusunu shared + parent view + Hesaplar kapali kosuluna baglar', () => {
    const hook = read(accountHookPath);

    expect(hook).toContain('export function useTransactionAccountRefs(');
    expect(hook).toContain("const parentModule = scope === 'cari' ? 'cariler' : 'personel'");
    expect(hook).toContain('&& isSharedMode');
    expect(hook).toContain('&& !isOwner');
    expect(hook).toContain('&& canAccessModule(parentModule)');
    expect(hook).toContain("&& !canAccessModule('hesaplar')");
    expect(hook).not.toContain("&& canCreate('cariler')");
    expect(hook).not.toContain("&& canCreate('personel')");
    expect(hook).toContain('enabled: allowed');
    expect(hook).toMatch(/if \(!allowed \|\| !isletme\?\.id\)/);
  });

  it('QTB create ve normal editte sabit Cari/Personel baglamiyla ortak referansi acar', () => {
    const qtb = read(qtbPath);
    const entities = read(entitiesPath);
    const scope = read('src/lib/quickTransactionCreateScope.ts');

    expect(scope).toContain("requestedScope === 'cari'");
    expect(scope).toContain("requestedScope === 'personel'");
    expect(scope).toContain("mode === 'create' && !transactionId");
    expect(scope).toContain("mode === 'edit'");
    expect(scope).toContain('&& !!transactionId');
    expect(scope).toContain('&& !isScheduledTransaction');
    expect(scope).toContain('&& !copySourceId');
    expect(scope).toContain('&& !isViewer');
    expect(qtb).toContain('const minimalAccountRefsAllowed =');
    expect(qtb).toContain('requestedScope: requestedAccountReferenceScope');
    expect(qtb).toContain('defaultCariId');
    expect(qtb).toContain('defaultPersonelId');
    expect(qtb).toContain('minimalAccountReferenceMode:');
    expect(qtb).toContain('getAllowedScopedQuickTransactionTypes({');
    expect(qtb).toContain('allowedTypes={visibleTransactionTypes}');
    expect(qtb).toContain('canAccessTransactionSources(');
    expect(qtb).toContain('canCreateTransactionType(apiType)');

    expect(entities).toContain('const shouldLoadMinimalHesaplar =');
    expect(entities).toContain('const shouldLoadFullHesaplar =');
    expect(entities).toContain('useTransactionAccountRefs(');
    expect(entities).toContain('const hesaplar = shouldLoadMinimalHesaplar');
    expect(entities).toMatch(
      /useHesaplar\(\s*false,\s*false,\s*shouldLoadFullHesaplar,\s*\)/,
    );
  });

  it('dar hesap modu yalniz bakiyeyi gizler; kategori, vade, taksit ve urunu kapatmaz', () => {
    const qtb = read(qtbPath);
    const entities = read(entitiesPath);
    const picker = read(
      'src/components/transaction/QuickTransactionBar/components/HesapPickerSheet.tsx',
    );
    const entity = read(
      'src/components/transaction/QuickTransactionBar/sections/EntityDisplaySection.tsx',
    );

    expect(picker).toContain('showBalances = true');
    expect(picker).toContain('{showBalances ? (');
    expect(entity).toContain('showAccountBalances = true');
    expect(entity).toContain('showEntityBalances = true');
    expect(entity).toContain(
      '{selectedSourceHesap && !showAccountBalances && (',
    );
    expect(entity).toContain('{showEntityBalances && (');
    expect(
      qtb.match(/showBalances=\{!minimalAccountRefsAllowed\}/g),
    ).toHaveLength(1);
    expect(qtb).toContain(
      'showAccountBalances={!minimalAccountRefsAllowed}',
    );
    expect(qtb).toContain('showEntityBalances');

    expect(qtb).toMatch(
      /useKategoriSecimReferanslari\(\s*currentCategoryFamily,\s*true,\s*\)/,
    );
    expect(qtb).toContain('showScheduledToggle');
    expect(qtb).toContain('showPhotoButton={isOwner}');
    expect(qtb).toContain('showUrunButton={showUrunButton}');
    expect(qtb).toContain('{showTaksitConfig && (');
    expect(qtb).toContain('visible={modals.showUrunPicker}');
    expect(qtb).toContain('urunItems={form.urunItems}');
    expect(qtb).not.toContain('minimalModeAllowed');
    expect(qtb).not.toContain('sharedRegularEdit');

    expect(entities).toContain('const shouldLoadUrunler =');
    expect(entities).toContain(
      'canAccessModule(\'urunler\')',
    );
  });

  it('Personel toplu odeme Hesaplar kapaliyken adlari dar RPCden getirip bakiyeyi gizler', () => {
    const page = read('src/app/personel/toplu-odeme.tsx');

    expect(page).toContain("useTransactionAccountRefs(");
    expect(page).toContain("'personel',");
    expect(page).toContain('!canSeeAccountBalances');
    expect(page).toContain('const hesaplar: PaymentAccount[] = canSeeAccountBalances');
    expect(page).toContain('showBalances={canSeeAccountBalances}');
    expect(page).toMatch(
      /\{showBalances && \([\s\S]*?formatCurrency\(toNumber\(hesap\.balance\), hesap\.currency\)/,
    );
  });

  it('scoped create generic V2 yolunu kullanir; eski nakit RPC QTBden cagirilmaz', () => {
    const submit = read(submitPath);
    const islemler = read('src/hooks/useIslemler.ts');

    expect(submit).toContain('enableScopedV2Create');
    expect(submit).toContain('scopedSameTenant: enableScopedV2Create');
    expect(islemler).toContain("supabase.rpc('create_islem_atomik_v2'");
    expect(submit).not.toContain('useCreateCariCashTransaction');
    expect(submit).not.toContain('create_cari_nakit_islem_atomik');
    expect(submit).not.toContain('createCariCashTransaction.mutateAsync');
  });

  it('urunlu owner/shared Cari editini V3 ile atomik gunceller ve urun kalemlerini yetkili RPCden okur', () => {
    const submit = read(submitPath);
    const islemler = read('src/hooks/useIslemler.ts');
    const urunHareketler = read('src/hooks/useUrunHareketler.ts');
    const cariDetail = read('src/app/cariler/[id].tsx');

    expect(submit).toContain('productItems: atomicProductItems');
    expect(submit).not.toContain('reapplyUrunHareketler.mutateAsync');
    expect(islemler).toContain(
      "'update_cari_urunlu_islem_atomik_v3'",
    );
    expect(islemler).toContain(
      "'delete_cari_urunlu_islem_atomik_v3'",
    );
    expect(islemler).toContain(
      'p_items: normalizeProductMutationItems(productItems)',
    );
    expect(urunHareketler).toContain(
      "supabase.rpc('get_yetkili_islem_urun_kalemleri_v1'",
    );
    expect(urunHareketler).toContain('const URUN_KALEM_BATCH_SIZE = 100');
    expect(urunHareketler).toContain(
      'islemIds.slice(index, index + URUN_KALEM_BATCH_SIZE)',
    );
    expect(urunHareketler).toContain(
      "canSeeUrunler ? 'urunler-direct' : 'transaction-context-rpc'",
    );
    expect(cariDetail).toContain('getTransactionProductMutationDecision({');
    expect(cariDetail).toContain(
      "canUpdate('urunler', createdBy)",
    );
  });

  it('Cari ve Personel ekranlari Hesaplar kapaliyken ortak modu opt-in eder', () => {
    const cariList = read('src/app/(tabs)/cariler.tsx');
    const cariDetail = read('src/app/cariler/[id].tsx');
    const personelList = read('src/app/(tabs)/personel.tsx');
    const personelDetail = read('src/app/personel/[id].tsx');

    expect(cariList).toContain("minimalAccountReferenceMode={");
    expect(cariList).toContain("? 'cari'");
    expect(cariDetail).toContain("minimalAccountReferenceMode={");
    expect(cariDetail).toContain("? 'cari'");
    expect(personelList).toContain("minimalAccountReferenceMode={");
    expect(personelList).toContain("? 'personel'");
    expect(personelDetail).toContain("minimalAccountReferenceMode={");
    expect(personelDetail).toContain("? 'personel'");
  });
});
