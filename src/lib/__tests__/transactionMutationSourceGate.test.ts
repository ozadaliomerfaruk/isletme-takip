import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/hooks/useIslemler.ts'),
  'utf8',
);

function hookBody(name: string, nextName: string): string {
  const start = source.indexOf(`export function ${name}(`);
  const end = source.indexOf(`export function ${nextName}(`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('transaction mutation source-module gates', () => {
  it('isolates shared mutation context by tenant, user and permission snapshot', () => {
    const body = hookBody('useIslem', 'useCreateIslem');

    expect(body).toContain("isletme?.id ?? ''");
    expect(body).toContain("isOwner ? 'owner' : 'mutation-context-v1'");
    expect(body).toContain("isOwner ? '' : user?.id ?? ''");
    expect(body).toContain('permissionFingerprint');
    expect(body).toContain('fetchTransactionMutationContext(');
    expect(body).toContain('retry: isOwner ? undefined : false');
    expect(body).toContain('persist: isOwner');
  });

  it.each([
    ['useCreateIslem', 'useCreateIslemV2', 'create_islem_atomik'],
    ['useCreateIslemWithUrun', 'useCreateIslemTaksitli', 'create_islem_with_urun_atomik'],
    ['useCreateIslemTaksitli', 'useIslemlerByCari', 'taksit_plani_olustur'],
  ])('%s checks the latest create permission before its RPC', (hook, next, rpc) => {
    const body = hookBody(hook, next);
    const rpcIndex = body.indexOf(`supabase.rpc('${rpc}'`);
    const checks = [...body.matchAll(/assertCanCreateTransaction\(/g)]
      .map((match) => match.index ?? -1);

    expect(body).toContain('latestCreatePermissionRef.current = {');
    expect(body).toContain('isletmeId: isletme?.id ?? null');
    expect(checks).toHaveLength(2);
    expect(checks[0]).toBeLessThan(rpcIndex);
    expect(checks[1]).toBeLessThan(rpcIndex);
    expect(checks[1]).toBeGreaterThan(body.indexOf('await applyLinkedCariInversion('));
  });

  it('V2 create rechecks permission after cari scope resolution and sends no balance ops', () => {
    const body = hookBody('useCreateIslemV2', 'useCreateIslemWithUrun');
    const rpcIndex = body.indexOf("supabase.rpc('create_islem_atomik_v2'");
    const checks = [...body.matchAll(/assertCanCreateTransaction\(/g)]
      .map((match) => match.index ?? -1);

    expect(body).toContain('latestCreatePermissionRef.current = {');
    expect(body).toContain('await getLinkedCariInfo(');
    expect(checks).toHaveLength(2);
    expect(checks[0]).toBeLessThan(body.indexOf('await getLinkedCariInfo('));
    expect(checks[1]).toBeGreaterThan(body.indexOf('await getLinkedCariInfo('));
    expect(checks[1]).toBeLessThan(rpcIndex);
    expect(body).not.toContain('p_balance_ops');
    expect(body).toContain('Never fall back to V1 after a V2 error');
  });

  it('product create also requires product create permission', () => {
    const body = hookBody('useCreateIslemWithUrun', 'useCreateIslemTaksitli');

    expect(body).toContain('if (!isProductTransactionType(input.type))');
    expect(body).toContain("['urunler']");
  });

  it('update checks shared/owner-product V2-V3 and owner V1 source modules before their RPCs', () => {
    const body = hookBody('useUpdateIslem', 'useDeleteIslem');
    const rpcIndex = body.indexOf("supabase.rpc('update_islem_atomik'");
    const v2RpcIndex = body.indexOf("'update_islem_atomik_v2'");
    const checks = [...body.matchAll(/assertCanModifyTransaction\(/g)]
      .map((match) => match.index ?? -1);

    expect(body).toContain(
      'const transactionTypes = [oldIslem.type, updatedType] as const',
    );
    expect(body).toContain("fetchTransactionMutationContext(\n          isletme.id,\n          id,\n          'update'");
    expect(body).toContain('latestUpdatePermissionRef.current = {');
    expect(body).toContain('currentUserId: user?.id ?? null');
    expect(body).toContain('isletmeId: isletme?.id ?? null');
    expect(body).toContain(
      'const useServerDerivedMutation =',
    );
    expect(body).toContain(
      '!latestUpdatePermissionRef.current.isOwner',
    );
    expect(body).toContain(
      '|| productItems !== undefined',
    );
    expect(body).toContain(
      'const permissionSnapshot = latestUpdatePermissionRef.current',
    );
    expect(body).toContain(
      'const patch = buildSharedTransactionMutationPatch(context, updates)',
    );
    expect(body).toContain('p_patch: patch');
    expect(body).toContain("'update_cari_urunlu_islem_atomik_v3'");
    expect(body).toContain(
      "invalidateRelatedQueries(queryClient, 'urunHareket')",
    );
    expect(checks).toHaveLength(3);
    expect(checks[0]).toBeLessThan(v2RpcIndex);
    expect(checks[1]).toBeLessThan(body.indexOf('await applyLinkedCariInversion('));
    expect(checks[2]).toBeLessThan(rpcIndex);
    expect(checks[2]).toBeGreaterThan(body.lastIndexOf('await applyLinkedCariInversion('));
  });

  it('delete checks shared V2 and owner V1 source modules before their RPCs', () => {
    const body = hookBody('useDeleteIslem', 'getPeriodDateRange');
    const rpcIndex = body.indexOf("supabase.rpc('delete_islem_atomik'");
    const v2RpcIndex = body.indexOf("'delete_islem_atomik_v2'");
    const checks = [...body.matchAll(/assertCanModifyTransaction\(/g)]
      .map((match) => match.index ?? -1);

    expect(body).toContain('const transactionTypes = [islem.type] as const');
    expect(body).toContain("fetchTransactionMutationContext(\n          isletme.id,\n          id,\n          'delete'");
    expect(body).toContain('latestDeletePermissionRef.current = {');
    expect(body).toContain('currentUserId: user?.id ?? null');
    expect(body).toContain('isletmeId: isletme?.id ?? null');
    expect(body).toContain(
      'const useSharedMutation = !latestDeletePermissionRef.current.isOwner',
    );
    expect(body).toContain(
      'const permissionSnapshot = latestDeletePermissionRef.current',
    );
    expect(checks).toHaveLength(3);
    expect(checks[0]).toBeLessThan(v2RpcIndex);
    expect(checks[1]).toBeLessThan(body.indexOf('await applyLinkedCariInversion('));
    expect(checks[2]).toBeLessThan(rpcIndex);
    expect(checks[2]).toBeGreaterThan(body.indexOf('await applyLinkedCariInversion('));
  });

  it('throws typed 42501 permission errors for create/update/delete guards', () => {
    expect(source).toContain(
      "throw transactionPermissionError('create', 'permission')",
    );
    expect(source).toContain('throw transactionPermissionError(action, reason)');
  });

  it('separates islemler action/ownership from source-module visibility', () => {
    expect(source).toContain("snapshot.canCreate('islemler')");
    expect(source).toContain("snapshot.canModify('islemler', createdBy)");
    expect(source).toContain('canAccessTransactionSources(');
    expect(source).not.toContain(
      'requiredModules.every((module) => canCreate(module))',
    );
    expect(source).not.toContain(
      'requiredModules.every((module) => canModify(module, createdBy))',
    );
  });
});
