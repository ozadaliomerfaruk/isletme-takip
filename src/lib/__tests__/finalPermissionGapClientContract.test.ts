import fs from 'node:fs';
import path from 'node:path';
import { supportsSharedProductMutationV3 } from '../sharedProductMutationTypes';

const root = path.resolve(__dirname, '../../..');

function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('son permission gap istemci sozlesmesi', () => {
  it('toplu Cari/Personel secimi satir yetkisini uc noktada uygular', () => {
    for (const [file, helper, module] of [
      ['src/app/(tabs)/cariler.tsx', 'canSelectCari', 'cariler'],
      ['src/app/(tabs)/personel.tsx', 'canSelectPersonel', 'personel'],
    ] as const) {
      const screen = source(file);
      expect(screen).toContain(`const ${helper} = useCallback(`);
      expect(screen).toContain(`canUpdate('${module}'`);
      expect(screen).toContain(`canDelete('${module}'`);
      expect(screen).toContain(`&& ${helper}(`);
      expect(screen).toContain("t('common:errors.permissionDenied')");
      expect(screen).not.toMatch(
        /const promises = Array\.from\(selectedIds\)[\s\S]{0,160}Promise\.all\(promises\)/,
      );
      expect(screen).toMatch(/for \(const \w+ of selectedRecords\)/);
    }
  });

  it('arsivden cikarma butonu ve handleri kayit bazli update gate kullanir', () => {
    for (const [file, permission] of [
      ['src/app/hesaplar/[id].tsx', 'canUpdateHesapRecord'],
      ['src/app/personel/[id].tsx', 'canUpdatePersonelRecord'],
    ] as const) {
      const detail = source(file);
      expect(detail).toContain(`if (!${permission}) {`);
      expect(detail).toContain(
        `onUnarchive={\n                ${permission} ? handleUnarchive : undefined`,
      );
    }
  });

  it('urunlu shared V3 yalnız desteklenen Cari ve Hesap tiplerini kabul eder', () => {
    for (const type of [
      'cari_alis',
      'cari_satis',
      'cari_alis_iade',
      'cari_satis_iade',
      'gelir',
      'gider',
    ]) {
      expect(supportsSharedProductMutationV3(type)).toBe(true);
    }
    for (const type of [
      'personel_satis',
      'personel_gider',
      'transfer',
      'cari_odeme',
      'cari_tahsilat',
      null,
    ]) {
      expect(supportsSharedProductMutationV3(type)).toBe(false);
    }

    const detail = source('src/app/urunler/[id].tsx');
    expect(detail).toContain(
      'getTransactionProductMutationDecision({',
    );
    expect(detail).toContain(
      "canUpdate('islemler', hareket.islemCreatedBy ?? null)",
    );
    expect(detail).toContain(
      "canUpdate('urunler', hareket.islemCreatedBy ?? null)",
    );
    expect(detail).toContain(
      'const creatorResolved = hareket.islemCreatedBy !== undefined',
    );
    expect(detail).not.toContain(
      "isOwner\n          || String(hareket.islemType).startsWith('cari_')",
    );

    for (const file of [
      'src/app/cariler/[id].tsx',
      'src/app/hesaplar/[id].tsx',
      'src/app/islemler/index.tsx',
    ]) {
      const transactionList = source(file);
      expect(transactionList).toContain(
        'getTransactionProductMutationDecision',
      );
    }
  });

  it('global islem aramasi direct table yerine yetkili projeksiyonu kullanir', () => {
    const hook = source('src/hooks/useIslemler.ts');
    const block = hook.slice(
      hook.indexOf('export function useFilteredIslemler'),
    );
    const screen = source('src/app/arama.tsx');

    expect(block).toContain("'search_yetkili_islem_satirlari_v1'");
    expect(block).toContain('parseAuthorizedTransactionRows(data ?? []');
    expect(block).toContain('permissionAccessSignature(');
    expect(block).toContain('persist: false');
    expect(block).not.toContain(".from('islemler')");
    expect(screen).toContain(
      "const canSearchTransactions = canAccessModule('islemler');",
    );
    expect(screen).not.toContain(
      "const canSearchTransactions = isOwner &&",
    );
  });
});
