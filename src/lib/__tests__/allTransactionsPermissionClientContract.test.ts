import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..');

function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('All Transactions shared permission client contract', () => {
  it('shared list uses the narrow keyset RPC and permission-separated cache', () => {
    const hook = source('src/hooks/useIslemler.ts');

    expect(hook).toContain("'get_yetkili_islem_satirlari_v1'");
    expect(hook).toContain('p_before_date: pageParam.beforeDate');
    expect(hook).toContain('p_before_id: pageParam.beforeId');
    expect(hook).toContain("isOwner ? 'owner' : 'authorized-v1'");
    expect(hook).toContain("persist: isOwner");
    expect(hook).toContain("'islemler:authorized-list-v1'");
  });

  it('screen is enabled for effective transaction modules and uses the common product-aware mutation gate', () => {
    const screen = source('src/app/islemler/index.tsx');

    expect(screen).toContain(
      "useIslemler(undefined, canAccessModule('islemler'))",
    );
    expect(screen).toContain('getTransactionProductMutationDecision({');
    expect(screen).toContain('productItemsResolved: isProductItemsResolved');
    expect(screen).toContain('productItemCount: getProductItemCount(transaction.id)');
    expect(screen).toContain('canMutateProduct:');
    expect(screen).toContain('canOpen={productItemsSettled}');
    expect(screen).toContain('if (!productItemsSettled) return;');
    expect(screen).toContain('setReadOnlyTransactionId(islemId);');
    expect(screen).toContain('visible={!!readOnlyTransaction}');
    expect(screen).toContain('visible={showEditBar && canUpdateEditTransaction}');
  });
});
