import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const submit = read(
  'src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts',
);
const bar = read(
  'src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx',
);
const hooks = read('src/hooks/useIslemler.ts');

describe('P0-S2 first client routing slice', () => {
  it('keeps V2 as a separate explicit hook with no V1 error fallback', () => {
    const start = hooks.indexOf('export function useCreateIslemV2()');
    const end = hooks.indexOf(
      'export interface CreateIslemWithUrunItem',
      start,
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = hooks.slice(start, end);

    expect(body).toContain("supabase.rpc('create_islem_atomik_v2'");
    expect(body).not.toContain("supabase.rpc('create_islem_atomik'");
    expect(body).not.toContain('p_balance_ops');
    expect(body).toContain(
      'return parseCreateIslemV2Response(data, isletme.id, String(input.id))',
    );
  });

  it('opts base types plus explicit same-tenant scoped creates into V2 and keeps viewer on V1', () => {
    expect(bar).toContain('isViewer,');
    expect(bar).toContain(
      "mode === 'create' && !transactionId && !!scopedCreateContext",
    );
    expect(submit).toContain('isViewer = false');
    expect(submit).toContain('shouldUseCreateIslemV2({');
    expect(submit).toContain('scopedSameTenant: enableScopedV2Create');
    expect(submit).toContain(
      '? await createIslemV2.mutateAsync(baseRow)',
    );
    expect(submit).toContain(
      ': await createIslem.mutateAsync(baseRow)',
    );
    expect(submit).toContain(
      '? await createIslemV2.mutateAsync(regularCreateInput)',
    );
    expect(submit).toContain(
      ': await createIslem.mutateAsync(regularCreateInput)',
    );
  });

  it('keeps product, installment and scheduled endpoints dedicated while scoped creates use V2', () => {
    expect(submit).toContain(
      'createIslemWithUrun.mutateAsync({ input: baseRow, items })',
    );
    expect(submit).toContain('createIslemTaksitli.mutateAsync({');
    expect(submit).toContain(
      'createIleriTarihliIslem.mutateAsync(scheduledCreateInput)',
    );
    expect(submit).not.toContain('createCariCashTransaction.mutateAsync');
    expect(submit).not.toContain('createPersonelPayment.mutateAsync');
    expect(submit).toContain(
      '? await createIslemV2.mutateAsync(regularCreateInput)',
    );
    expect(submit).toContain(
      ': await createIslem.mutateAsync(regularCreateInput)',
    );
  });

  it('starts photo sync only after a successful V2/V1 create result', () => {
    const routing = submit.indexOf(
      '? await createIslemV2.mutateAsync(baseRow)',
    );
    const photoSync = submit.indexOf(
      'await syncTransactionPhotoBestEffort(newIslem.id)',
      routing,
    );
    expect(routing).toBeGreaterThan(-1);
    expect(photoSync).toBeGreaterThan(routing);
  });

  it('retries only photo sync after a lost create response is proven landed', () => {
    expect(submit).toContain(
      'if (!isEditMode && createdClientIslemId) {\n'
      + '          await syncTransactionPhotoBestEffort(createdClientIslemId);',
    );
    expect(submit).toContain(
      'if (!isEditMode && exchangeCreatedIslemId) {\n'
      + '            await syncTransactionPhotoBestEffort(exchangeCreatedIslemId);',
    );
  });
});
