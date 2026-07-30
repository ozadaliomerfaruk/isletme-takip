import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('owner product edit atomic contract', () => {
  const submitPath =
    'src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts';
  const hookPath = 'src/hooks/useIslemler.ts';

  it('routes normal and cross-currency product edits through one V3 payload', () => {
    const submit = read(submitPath);

    expect(
      submit.match(
        /const shouldUseAtomicProductV3 = hasAnyProductItems/g,
      ),
    ).toHaveLength(2);
    expect(
      submit.match(/productItems: atomicProductItems/g),
    ).toHaveLength(2);
    expect(submit).not.toContain(
      'useReapplyUrunHareketlerForIslem',
    );
    expect(submit).not.toContain(
      'reapplyUrunHareketler.mutateAsync',
    );
    expect(submit).not.toContain(
      'supportsSharedProductMutationV3(transactionData.type)',
    );
  });

  it('uses V3 for owner product items and invalidates product caches', () => {
    const hook = read(hookPath);
    const updateStart = hook.indexOf('export function useUpdateIslem()');
    const deleteStart = hook.indexOf(
      'export function useDeleteIslem()',
      updateStart,
    );
    const updateBody = hook.slice(updateStart, deleteStart);

    expect(updateBody).toContain(
      '!latestUpdatePermissionRef.current.isOwner',
    );
    expect(updateBody).toContain('|| productItems !== undefined');
    expect(updateBody).toContain(
      "'update_cari_urunlu_islem_atomik_v3'",
    );
    expect(updateBody).toContain(
      'p_items: normalizeProductMutationItems(productItems)',
    );
    expect(updateBody).toContain(
      "invalidateRelatedQueries(queryClient, 'urunHareket')",
    );
  });

  it('keeps the transaction-row probes for atomic update response loss', () => {
    const submit = read(submitPath);

    expect(submit).toContain('attemptedRegularUpdate = regularUpdates');
    expect(submit).toContain(
      'attemptedExchangeRegularUpdate = regularUpdates',
    );
    expect(
      submit.match(/outcome = await didRegularUpdateLand\(/g),
    ).toHaveLength(2);
  });
});
