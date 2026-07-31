import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..');

function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('account-context authorized transaction client contract', () => {
  it('keeps the appended label fields optional and parses both RPCs through the narrow DTO', () => {
    const types = source('src/types/database.ts');
    const projection = source('src/lib/authorizedTransactionProjection.ts');
    const hook = source('src/hooks/useIslemler.ts');

    expect(types).toContain(
      "counterparty_kind?: 'hesap' | 'cari' | 'personel' | null;",
    );
    expect(types).toContain('counterparty_name?: string | null;');
    expect(projection).toContain(
      'counterparty_kind: parseCounterpartyKind(value.counterparty_kind)',
    );
    expect(projection).toContain(
      'optionalNullableString(',
    );

    for (const rpc of [
      'get_yetkili_islem_satirlari_v1',
      'search_yetkili_islem_satirlari_v1',
    ]) {
      expect(hook).toContain(`'${rpc}'`);
    }
    expect(hook.match(/parseAuthorizedTransactionRows\(/g)?.length)
      .toBeGreaterThanOrEqual(2);
  });

  it('shows and locally searches the plain label in All Transactions without weakening the mutation gate', () => {
    const screen = source('src/app/islemler/index.tsx');

    expect(screen).toContain(
      'if (islem.counterparty_name) return `→ ${islem.counterparty_name}`;',
    );
    expect(screen).toContain(
      'searchMatchesTr(islem.counterparty_name, debouncedSearch)',
    );
    expect(screen).toContain(
      'prev.islem.counterparty_name === next.islem.counterparty_name',
    );
    expect(screen).toContain('getTransactionProductMutationDecision({');
    expect(screen).toContain(
      "const canUpdateItem = getMutationDecision(islem, 'update').allowed;",
    );
    expect(screen).toContain(
      "const canDeleteItem = getMutationDecision(islem, 'delete').allowed;",
    );
  });

  it('shows the label in global search but routes only returned open relations', () => {
    const screen = source('src/app/arama.tsx');
    const transactionPressBlock = screen.slice(
      screen.indexOf("case 'islem': {", screen.indexOf('const handleItemPress')),
      screen.indexOf("case 'not':", screen.indexOf("case 'islem': {", screen.indexOf('const handleItemPress'))),
    );

    expect(screen).toContain(
      'if (islem.counterparty_name) return islem.counterparty_name;',
    );
    expect(transactionPressBlock).toContain(
      'if (islem.cari?.id && canSearchCariler)',
    );
    expect(transactionPressBlock).toContain(
      'islem.personel?.id && canSearchPersonel',
    );
    expect(transactionPressBlock).toContain(
      'islem.hesap?.id ?? islem.hedef_hesap?.id ?? null',
    );
    expect(transactionPressBlock).not.toContain('islem.cari_id');
    expect(transactionPressBlock).not.toContain('islem.personel_id');
    expect(transactionPressBlock).not.toContain('islem.hesap_id');
    expect(transactionPressBlock).not.toContain('counterparty_name');
  });
});
