import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260730080658_permission_contract_v2_server.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n');
const auditBootstrapSql = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/20260224000003_multi_user_rpc_audit_log.sql'
  ),
  'utf8'
).replace(/\r\n/g, '\n');

function stripSqlBodiesAndComments(source: string): string {
  return source
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*|)\$[\s\S]*?\$\1\$/g, '$BODY$')
    .replace(/--.*$/gm, '');
}

function functionDefinition(name: string): string {
  const pattern = new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION ${name.replaceAll('.', '\\.')}\\([\\s\\S]*?\\n\\$function\\$;`
  );
  const match = sql.match(pattern);
  if (!match) throw new Error(`Missing SQL function: ${name}`);
  return match[0];
}

function functionBody(name: string): string {
  const definition = functionDefinition(name);
  const body = definition.match(/\$function\$\s*([\s\S]*?)\s*\$function\$;/)?.[1];
  if (!body) throw new Error(`Missing SQL function body: ${name}`);
  return body;
}

function policyDefinition(name: string): string {
  const pattern = new RegExp(
    `CREATE POLICY "${escapeRegExp(name)}"[\\s\\S]*?\\n\\);`
  );
  const match = sql.match(pattern);
  if (!match) throw new Error(`Missing SQL policy: ${name}`);
  return match[0];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function functionNamesMatching(pattern: RegExp): string[] {
  return [...sql.matchAll(/^CREATE(?: OR REPLACE)? FUNCTION\s+([^\s(]+)/gim)]
    .map((match) => match[1])
    .filter((name) => pattern.test(name));
}

function revokedPrincipals(functionIdentity: string): string[] {
  const whitespaceFreeSql = sql.replace(/\s+/g, '');
  const identity = escapeRegExp(functionIdentity.replace(/\s+/g, ''));
  const statements = [
    ...whitespaceFreeSql.matchAll(
      new RegExp(`REVOKE(?:ALL|EXECUTE)ONFUNCTION${identity}FROM([^;]+);`, 'gi')
    ),
  ];
  return statements.flatMap((statement) => statement[1].toLowerCase().split(','));
}

function grantedPrincipals(functionIdentity: string): string[] {
  const whitespaceFreeSql = sql.replace(/\s+/g, '');
  const identity = escapeRegExp(functionIdentity.replace(/\s+/g, ''));
  const statements = [
    ...whitespaceFreeSql.matchAll(new RegExp(`GRANTEXECUTEONFUNCTION${identity}TO([^;]+);`, 'gi')),
  ];
  return statements.flatMap((statement) => statement[1].toLowerCase().split(','));
}

describe('permission contract V2 server migration', () => {
  it('bootstraps the unified transaction audit prerequisite on clean replays', () => {
    expect(auditBootstrapSql).toContain(
      'CREATE OR REPLACE FUNCTION public.log_islem_changes()'
    );
    expect(auditBootstrapSql).toMatch(
      /CREATE TRIGGER audit_islemler_changes\s+AFTER DELETE OR UPDATE ON public\.islemler\s+FOR EACH ROW EXECUTE FUNCTION public\.log_islem_changes\(\);/
    );
    expect(auditBootstrapSql).toContain(
      'COALESCE(auth.uid(), OLD.updated_by)'
    );
    expect(auditBootstrapSql).toContain(
      'COALESCE(auth.uid(), NEW.updated_by)'
    );
  });

  it('is one atomic, additive migration without top-level user-row DML', () => {
    expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(sql.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(sql.match(/^SET LOCAL lock_timeout = '2s';$/gm)).toHaveLength(1);
    expect(sql.match(/^SET LOCAL statement_timeout = '120s';$/gm)).toHaveLength(1);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(sql.indexOf("SET LOCAL lock_timeout = '2s';")).toBeGreaterThan(
      sql.indexOf('BEGIN;')
    );
    expect(sql.indexOf("SET LOCAL statement_timeout = '120s';")).toBeGreaterThan(
      sql.indexOf("SET LOCAL lock_timeout = '2s';")
    );
    expect(sql.indexOf('DO $precondition$')).toBeGreaterThan(
      sql.indexOf("SET LOCAL statement_timeout = '120s';")
    );

    const topLevel = stripSqlBodiesAndComments(sql);
    const withoutNewInternalOwnerChanges = topLevel
      .replace(
        /ALTER TABLE internal\.permission_v2_movement_action_context\s+OWNER TO postgres;/i,
        ''
      )
      .replace(/ALTER TABLE internal\.permission_v2_code_attempts\s+OWNER TO postgres;/i, '')
      .replace(
        /ALTER SEQUENCE internal\.permission_v2_code_attempts_id_seq\s+OWNER TO postgres;/i,
        ''
      );
    expect(topLevel).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(withoutNewInternalOwnerChanges).not.toMatch(/\bALTER\s+(TABLE|SEQUENCE)\b/i);
    expect(topLevel).not.toMatch(/\bTRUNCATE\b/i);
    expect(topLevel).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(topLevel).not.toMatch(/\bINSERT\s+INTO\s+public\./i);
    expect(topLevel).not.toMatch(/\bUPDATE\s+public\./i);
    expect(topLevel).not.toMatch(/\bRENAME\s+(TO|COLUMN)\b/i);
    expect(topLevel).toContain('CREATE TABLE internal.permission_v2_movement_action_context');
    expect(topLevel).toContain('CREATE TABLE internal.permission_v2_code_attempts');
  });

  it('uses schema-qualified date_part instead of qualifying EXTRACT syntax', () => {
    expect(sql).toMatch(
      /pg_catalog\.date_part\(\s*'day',\s*pg_catalog\.now\(\) - latest\.last_date/
    );
    expect(sql).not.toMatch(/\bpg_catalog\.extract\s*\(/i);
  });

  it('uses PostgreSQL GREATEST/LEAST expressions without invalid qualification', () => {
    expect(sql).toContain(
      'GREATEST(0::numeric, -c.balance) AS net_borc'
    );
    expect(sql).toContain(
      'GREATEST(0::numeric, c.balance) AS net_alacak'
    );
    expect(sql).toMatch(
      /GREATEST\(\s*0::numeric,\s*LEAST\(/s
    );
    expect(sql).not.toMatch(/\bpg_catalog\.(?:greatest|least)\s*\(/i);
  });

  it('keeps the code-attempt table and identity sequence postgres-owned and API-revoked', () => {
    const normalized = sql.replace(/\s+/g, '');
    expect(normalized).toContain('ALTERTABLEinternal.permission_v2_code_attemptsOWNERTOpostgres;');
    expect(normalized).toContain(
      'ALTERSEQUENCEinternal.permission_v2_code_attempts_id_seqOWNERTOpostgres;'
    );
    expect(normalized).toContain(
      'REVOKEALLONTABLEinternal.permission_v2_code_attemptsFROMPUBLIC,anon,authenticated,service_role;'
    );
    expect(normalized).toContain(
      'REVOKEALLONSEQUENCEinternal.permission_v2_code_attempts_id_seqFROMPUBLIC,anon,authenticated,service_role;'
    );
    expect(normalized).not.toMatch(
      /GRANT[^;]*ON(?:TABLE|SEQUENCE)internal\.permission_v2_code_attempts(?:_id_seq)?[^;]*TO(?:PUBLIC|anon|authenticated|service_role)/i
    );
  });

  it('defines every new function identity only once', () => {
    const names = [...sql.matchAll(/^CREATE(?: OR REPLACE)? FUNCTION\s+([^\s(]+)/gim)].map(
      (match) => match[1]
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('does not let Reports-only roles select entity base tables', () => {
    for (const table of ['hesaplar', 'cariler', 'personel', 'urunler']) {
      const policy = sql.match(
        new RegExp(`CREATE POLICY "Permission v2 read ${table}"[\\s\\S]*?\\n\\);`)
      )?.[0];
      expect(policy).toBeDefined();
      expect(policy).toContain(`'${table}'`);
      expect(policy).not.toContain("'raporlar'");
    }
  });

  it('keeps every account policy behind the Birikim boundary', () => {
    const usingPolicies = [
      'Permission v2 read hesaplar',
      'Permission v2 passive hesaplar owner only',
      'Permission v2 update hesaplar',
      'Permission v2 delete hesaplar',
      'Permission v2 update gate hesaplar',
      'Permission v2 delete gate hesaplar',
    ];
    const checkPolicies = [
      'Permission v2 passive hesaplar owner only',
      'Permission v2 insert hesaplar',
      'Permission v2 update hesaplar',
      'Permission v2 insert gate hesaplar',
      'Permission v2 update gate hesaplar',
    ];

    for (const policyName of usingPolicies) {
      const usingPart = policyDefinition(policyName).split('\nWITH CHECK')[0];
      expect(usingPart).toContain("'birikim'");
      expect(usingPart).toContain('internal.etkin_yetki_v2(');
    }
    for (const policyName of checkPolicies) {
      const withCheckPart = policyDefinition(policyName).split('\nWITH CHECK')[1];
      expect(withCheckPart).toBeDefined();
      expect(withCheckPart).toContain("'birikim'");
      expect(withCheckPart).toContain('internal.etkin_yetki_v2(');
    }

    expect(
      policyDefinition('Permission v2 passive hesaplar owner only')
    ).toContain('AS RESTRICTIVE');
  });

  it('binds create permission to auth.uid and keeps account refs narrow for create or edit scopes', () => {
    const mutation = functionDefinition('internal.kayit_mutasyon_izni_v1');
    expect(mutation).toMatch(
      /WHEN 'create' THEN[\s\S]*permission\.can_create[\s\S]*p_created_by = auth\.uid\(\)/
    );

    const accountRefs = functionDefinition('public.get_islem_hesap_referanslari_v2');
    expect(accountRefs).toContain('permission.can_create');
    expect(accountRefs).toContain('permission.can_update_own');
    expect(accountRefs).toContain('permission.can_update_all');
    expect(accountRefs).not.toMatch(/\bbalance\b/i);
  });

  it('keeps free notes on Notes level and contextual notes on parent view/own/all', () => {
    const notes = functionDefinition('internal.not_baglam_mutasyon_v2');
    expect(notes).toContain('IF NOT v_contextual THEN');
    expect(notes).toContain("p_isletme_id, 'notlar', p_created_by, p_action");
    expect(notes).toContain('v_permission.can_view IS NOT TRUE');
    expect(notes).toContain('NOT v_own_note');
    expect(notes).toContain('v_permission.can_update_all IS NOT TRUE');
    expect(notes).toContain('v_permission.can_delete_all IS NOT TRUE');
    expect(notes).not.toMatch(/p_assigned_to_user IS DISTINCT FROM auth\.uid\(\)/);
  });

  it('validates every note parent and assignment in the same tenant', () => {
    const target = functionDefinition('internal.not_baglam_hedef_gecerli_v1');
    expect(target).toContain("WHEN 'genel' THEN");
    expect(target).toContain('IF p_entity_id IS NOT NULL');
    expect(target).toContain("WHEN 'personel', 'personel_izin' THEN");
    for (const table of ['hesaplar', 'cariler', 'personel', 'urunler']) {
      expect(target).toContain(`FROM public.${table}`);
    }
    expect(target).toContain('isletme_id = p_isletme_id');
    expect(target).toContain('v_is_owner IS TRUE OR');
    expect(target).toContain("member.status = 'active'");
    expect(target).not.toMatch(/\w+\.is_archived/);

    const read = functionDefinition('internal.not_baglam_okuma_v2');
    const mutation = functionDefinition('internal.not_baglam_mutasyon_v2');
    expect(read).toContain('internal.not_baglam_hedef_gecerli_v1(');
    expect(mutation).toContain('internal.not_baglam_hedef_gecerli_v1(');
    expect(target).toMatch(
      /account\.type::text <> 'birikim'[\s\S]*?internal\.etkin_yetki_v2\(\s*p_isletme_id,\s*'birikim'/
    );
    expect(read).toContain("pg_catalog.array_append(v_modules, 'birikim')");
    expect(mutation).toContain("pg_catalog.array_append(v_modules, 'birikim')");
  });

  it('keeps assigned note audience on OLD-row mutation and storage paths', () => {
    const updatePolicy = sql.match(/ALTER POLICY "Shared update notlar"[\s\S]*?\n\);/)?.[0];
    const deletePolicy = sql.match(/ALTER POLICY "Shared delete notlar"[\s\S]*?\n\);/)?.[0];
    const photoPolicy = sql.match(/ALTER POLICY "Shared attach own not photo"[\s\S]*?\n\);/)?.[0];
    expect(updatePolicy).toBeDefined();
    expect(deletePolicy).toBeDefined();
    expect(photoPolicy).toBeDefined();

    const updateParts = updatePolicy!.split('\nWITH CHECK');
    expect(updateParts[0]).toMatch(
      /assigned_to_user IS NULL[\s\S]*assigned_to_user = auth\.uid\(\)/
    );
    expect(updateParts[1]).not.toMatch(
      /assigned_to_user IS NULL[\s\S]*assigned_to_user = auth\.uid\(\)/
    );
    expect(deletePolicy).toMatch(/assigned_to_user IS NULL[\s\S]*assigned_to_user = auth\.uid\(\)/);
    expect(photoPolicy!.split('\nWITH CHECK')[0]).toMatch(
      /assigned_to_user IS NULL[\s\S]*assigned_to_user = auth\.uid\(\)/
    );

    const storageInsert = functionDefinition('internal.storage_photo_insert_allowed_v1');
    const storageDelete = functionDefinition('internal.storage_note_photo_delete_allowed_v1');
    for (const storageFunction of [storageInsert, storageDelete]) {
      expect(storageFunction).toMatch(
        /assigned_to_user IS NOT NULL[\s\S]*assigned_to_user IS DISTINCT FROM v_user_id/
      );
    }
  });

  it('guards every linked product movement mutation with canonical context and exact payloads', () => {
    const trigger = functionDefinition(
      'internal.enforce_linked_product_movement_permission_v1'
    );
    expect(trigger).toContain("ELSIF TG_OP = 'DELETE'");
    expect(trigger).toContain("v_actions := ARRAY['create']");
    expect(trigger).toContain("v_actions := ARRAY['update']");
    expect(trigger).toContain("v_actions := ARRAY['delete']");
    expect(trigger).toContain('PRODUCT_MOVEMENT_CANONICAL_RPC_REQUIRED');
    expect(trigger).toContain('PRODUCT_MOVEMENT_INVALID_LINKED_PAYLOAD');
    expect(trigger).toContain('product.is_active IS TRUE');
    expect(trigger).toContain('product.is_archived IS FALSE');
    expect(trigger).toContain("NEW.miktar = 'NaN'::numeric");
    expect(trigger).toContain("NEW.miktar = 'Infinity'::numeric");
    expect(trigger).toContain('NEW.yeni_miktar IS DISTINCT FROM');
    expect(trigger).toContain("'personel_satis'");
    expect(trigger).toContain("'urunler'");
    expect(trigger).toContain('v_transaction.created_by');
    expect(trigger).toMatch(
      /TG_OP = 'DELETE'\s+AND \(\s*v_context_action IS NULL\s+OR v_context_action NOT IN \('create', 'update', 'delete'\)\s*\)/
    );
    expect(trigger).toMatch(
      /TG_OP <> 'DELETE'\s+AND NOT v_is_owner\s+AND \([\s\S]*?TG_OP = 'INSERT'[\s\S]*?TG_OP = 'UPDATE'/
    );
    expect(sql).toMatch(
      /CREATE TRIGGER trg_urun_hareket_link_permission_v1\s+BEFORE INSERT OR UPDATE OR DELETE/s
    );
  });

  it('supports productful account and cari transaction types in atomic V3', () => {
    const reapply = functionDefinition('internal.reapply_cari_urun_items_v3');
    expect(reapply).toContain("'gelir'");
    expect(reapply).toContain("'gider'");
    expect(reapply).toContain(
      "WHEN p_type IN ('gider', 'cari_alis', 'cari_satis_iade') THEN 'giris'"
    );
    expect(reapply).not.toContain("'personel_satis'");
  });

  it('lets Product-only roles read minimal productful transaction items', () => {
    const productItems = functionDefinition('public.get_yetkili_islem_urun_kalemleri_v1');
    expect(productItems).toContain("internal.etkin_yetki_v2(p_isletme_id, 'urunler')");
    expect(productItems).toMatch(
      /v_reports IS TRUE\s+OR v_products IS TRUE\s+OR internal\.islem_satiri_okunabilir_v2/
    );
    expect(productItems).toContain(
      'AND (product.is_active IS TRUE OR v_is_owner)'
    );
  });

  it('keeps the private V3 movement action context alive across delete and insert', () => {
    const trigger = functionDefinition('internal.enforce_linked_product_movement_permission_v1');
    const reapply = functionDefinition('internal.reapply_cari_urun_items_v3');
    const update = functionDefinition('public.update_cari_urunlu_islem_atomik_v3');
    const remove = functionDefinition('public.delete_cari_urunlu_islem_atomik_v3');

    expect(sql).toContain('CREATE TABLE internal.permission_v2_movement_action_context');
    expect(sql).toMatch(
      /REVOKE ALL\s+ON TABLE internal\.permission_v2_movement_action_context\s+FROM PUBLIC, anon, authenticated, service_role/
    );
    expect(trigger).toContain('FROM internal.permission_v2_movement_action_context');
    expect(trigger).toContain('v_context_action NOT IN');
    expect(reapply).toContain('p_authorization_action text');
    expect(reapply).toContain('INSERT INTO internal.permission_v2_movement_action_context');
    expect(reapply).toContain('DELETE FROM internal.permission_v2_movement_action_context');
    expect(reapply).toContain('action_context.action = p_authorization_action');
    const contextInsert = reapply.indexOf(
      'INSERT INTO internal.permission_v2_movement_action_context'
    );
    const movementDelete = reapply.indexOf('DELETE FROM public.urun_hareketler');
    const movementInsert = reapply.indexOf('INSERT INTO public.urun_hareketler');
    const contextDelete = reapply.indexOf(
      'DELETE FROM internal.permission_v2_movement_action_context',
      contextInsert
    );
    expect(contextInsert).toBeGreaterThanOrEqual(0);
    expect(movementDelete).toBeGreaterThan(contextInsert);
    expect(movementInsert).toBeGreaterThan(movementDelete);
    expect(contextDelete).toBeGreaterThan(movementInsert);
    expect(update).toMatch(
      /reapply_cari_urun_items_v3\([\s\S]*?'update'[\s\S]*?reapply_cari_urun_items_v3\([\s\S]*?'update'/
    );
    expect(remove).toMatch(/reapply_cari_urun_items_v3\([\s\S]*?'delete'/);
  });

  it('keeps old owner transaction delete safe while denying raw linked movement delete', () => {
    const movementGuard = functionBody(
      'internal.enforce_linked_product_movement_permission_v1'
    );
    const transactionGuard = functionBody(
      'internal.enforce_islem_source_mutation_v2'
    );

    const manualMovementContinue = movementGuard.indexOf(
      'IF v_islem_ids[v_context_index] IS NULL THEN'
    );
    const deleteContextGate = movementGuard.indexOf(
      "TG_OP = 'DELETE'",
      manualMovementContinue,
    );
    expect(manualMovementContinue).toBeGreaterThan(-1);
    expect(deleteContextGate).toBeGreaterThan(manualMovementContinue);
    expect(movementGuard).toMatch(
      /TG_OP = 'DELETE'[\s\S]*?v_context_action IS NULL[\s\S]*?v_context_action NOT IN \('create', 'update', 'delete'\)[\s\S]*?PRODUCT_MOVEMENT_CANONICAL_RPC_REQUIRED/
    );
    expect(movementGuard).toMatch(
      /TG_OP <> 'DELETE'\s+AND NOT v_is_owner/
    );

    const transactionDeletePermission = transactionGuard.lastIndexOf(
      'IF NOT internal.islem_mutasyon_izni_v2('
    );
    const sharedCanonicalGate = transactionGuard.indexOf(
      'IF NOT internal.isletme_sahibi_v1(OLD.isletme_id)',
      transactionDeletePermission,
    );
    const legacyCleanup = transactionGuard.indexOf(
      '-- 1.5.x owner transaction deletion'
    );
    const contextInsert = transactionGuard.indexOf(
      'INSERT INTO internal.permission_v2_movement_action_context',
      legacyCleanup,
    );
    const movementDelete = transactionGuard.indexOf(
      'DELETE FROM public.urun_hareketler AS movement_row',
      contextInsert,
    );
    const ownedContextCleanup = transactionGuard.indexOf(
      'IF v_opened_movement_delete_context THEN',
      movementDelete,
    );
    const contextDelete = transactionGuard.indexOf(
      'DELETE FROM internal.permission_v2_movement_action_context',
      ownedContextCleanup,
    );
    const finalReturn = transactionGuard.indexOf('RETURN OLD;', contextDelete);

    expect(transactionDeletePermission).toBeGreaterThan(-1);
    expect(sharedCanonicalGate).toBeGreaterThan(transactionDeletePermission);
    expect(legacyCleanup).toBeGreaterThan(sharedCanonicalGate);
    expect(contextInsert).toBeGreaterThan(legacyCleanup);
    expect(movementDelete).toBeGreaterThan(contextInsert);
    expect(ownedContextCleanup).toBeGreaterThan(movementDelete);
    expect(contextDelete).toBeGreaterThan(ownedContextCleanup);
    expect(finalReturn).toBeGreaterThan(contextDelete);
    expect(transactionGuard).toMatch(
      /IF EXISTS \([\s\S]*?permission_v2_movement_action_context[\s\S]*?IF NOT EXISTS \([\s\S]*?action_context\.action = 'delete'[\s\S]*?ISLEM_CANONICAL_RPC_REQUIRED[\s\S]*?ELSE\s+INSERT INTO internal\.permission_v2_movement_action_context/
    );
    expect(transactionGuard).toContain(
      'v_opened_movement_delete_context boolean := false'
    );
    expect(transactionGuard).not.toContain('update_urun_miktar');
    expect(transactionGuard).not.toMatch(/UPDATE public\.urunler/);
    expect(transactionGuard.indexOf('IF auth.uid() IS NULL THEN')).toBeLessThan(
      legacyCleanup
    );
    expect(transactionGuard.indexOf('Deleting the tenant root cascades')).toBeLessThan(
      legacyCleanup
    );
  });

  it('makes import undo stock-aware without overwriting caller context', () => {
    const definition = functionDefinition('public.undo_import_batch');
    const body = functionBody('public.undo_import_batch');

    expect(definition).toContain('CREATE OR REPLACE FUNCTION');
    expect(definition).toContain('RETURNS json');
    expect(definition).toContain('VOLATILE');
    expect(definition).toContain('SECURITY DEFINER');
    expect(definition).toContain("SET search_path TO ''");
    expect(body).toContain('c_max_batch CONSTANT integer := 50000');
    expect(body).toContain('business.user_id = auth.uid()');
    expect(body).toContain('p_transaction_ids[1]');
    expect(body).toContain('v_locked_count <> v_input_count');

    const transactionLock = body.indexOf(
      'ORDER BY transaction_row.id\n  FOR UPDATE'
    );
    const movementLock = body.indexOf(
      'ORDER BY movement.urun_id, movement.id\n  FOR UPDATE'
    );
    const productLock = body.indexOf(
      'ORDER BY product.id\n    FOR UPDATE'
    );
    const firstBalanceWrite = body.indexOf('UPDATE public.hesaplar AS account');
    const stockWrite = body.indexOf('UPDATE public.urunler AS product');
    const contextInsert = body.indexOf(
      'INSERT INTO internal.permission_v2_movement_action_context'
    );
    const transactionDelete = body.indexOf(
      'DELETE FROM public.islemler AS transaction_row'
    );
    const contextDelete = body.indexOf(
      'DELETE FROM internal.permission_v2_movement_action_context'
    );
    const result = body.indexOf("'deleted_transactions'");

    expect(transactionLock).toBeGreaterThan(-1);
    expect(movementLock).toBeGreaterThan(transactionLock);
    expect(productLock).toBeGreaterThan(movementLock);
    expect(firstBalanceWrite).toBeGreaterThan(productLock);
    expect(stockWrite).toBeGreaterThan(firstBalanceWrite);
    expect(contextInsert).toBeGreaterThan(stockWrite);
    expect(transactionDelete).toBeGreaterThan(contextInsert);
    expect(contextDelete).toBeGreaterThan(transactionDelete);
    expect(result).toBeGreaterThan(contextDelete);

    expect(body).toContain(
      'v_locked_product_count <> v_expected_product_count'
    );
    expect(body).toContain(
      'v_updated_product_count <> v_expected_product_count'
    );
    expect(body).toMatch(
      /CASE movement\.hareket_tipi[\s\S]*?WHEN 'giris'\s+THEN -pg_catalog\.abs\(COALESCE\(movement\.miktar, 0\)\)[\s\S]*?WHEN 'cikis'\s+THEN pg_catalog\.abs\(COALESCE\(movement\.miktar, 0\)\)[\s\S]*?ELSE -COALESCE\(movement\.miktar, 0\)/
    );
    expect(body).toContain('UPDATE public.cariler AS customer');
    expect(body).toContain('UPDATE public.personel AS employee');
    expect(body).toContain('v_inserted_context_count <> v_input_count');
    expect(body).toContain('deleted_count <> v_input_count');
    expect(body).toContain('v_deleted_context_count <> v_input_count');
    expect(body).not.toContain('ON CONFLICT');
    expect(body).not.toContain('DELETE FROM public.urun_hareketler');
    expect(body.indexOf('IF EXISTS (')).toBeLessThan(contextInsert);

    expect(revokedPrincipals('public.undo_import_batch(uuid[])')).toEqual(
      expect.arrayContaining([
        'public',
        'anon',
        'authenticated',
        'service_role',
      ])
    );
    expect(grantedPrincipals('public.undo_import_batch(uuid[])')).toEqual([
      'authenticated',
    ]);
  });

  it('requires an existing, readable and mutable transaction for photo upload', () => {
    const storageInsert = functionDefinition('internal.storage_photo_insert_allowed_v1');
    expect(storageInsert).toContain('FROM public.islemler AS transaction_row');
    expect(storageInsert).toMatch(/IF NOT FOUND THEN\s+RETURN false;\s+END IF;/);
    expect(storageInsert).toContain('internal.islem_satiri_okunabilir_v2(');
    expect(storageInsert).toContain(
      'internal.islem_birikim_bacaklari_okunabilir_v1('
    );
    expect(storageInsert).toContain('v_transaction.created_by = v_user_id');
    expect(storageInsert).toMatch(
      /'update'[\s\S]*OR \(\s*v_transaction\.created_by = v_user_id[\s\S]*'create'/
    );
    expect(storageInsert).not.toMatch(/IF v_path\.kayit_turu = 'islem' THEN\s+RETURN true;/);
  });

  it('does not expose account-detail photos outside the canonical source module', () => {
    const accountRows = functionBody('public.get_hesap_islem_satirlari_v1');
    expect(accountRows).toMatch(
      /internal\.islem_kaynagi_okunabilir_v1\(\s*candidate\.isletme_id,\s*candidate\.type::text\s*\)\s*AND candidate\.photo_path ~/
    );
  });

  it('masks Birikim account names in Cari and Personnel detail unless that scope or Reports is open', () => {
    const cariRows = functionBody('public.get_cari_islem_satirlari_v1');
    expect(cariRows).toContain("p_isletme_id,\n    'birikim'");
    expect(cariRows).toMatch(
      /hesap\.type::text <> 'birikim'\s+OR v_can_view_birikim IS TRUE\s+OR v_reports IS TRUE\s+OR v_is_owner IS TRUE[\s\S]{0,120}?THEN hesap\.name::text/
    );

    const personnelRows = functionBody(
      'public.get_personel_islem_satirlari_v1'
    );
    expect(personnelRows).toContain("p_isletme_id,\n    'raporlar'");
    expect(personnelRows).toContain("p_isletme_id,\n    'birikim'");
    expect(personnelRows).toMatch(
      /hesap\.type::text <> 'birikim'\s+OR v_can_view_birikim IS TRUE\s+OR v_reports IS TRUE/
    );
  });

  it('keeps archived active report references and omits unsafe unused totals', () => {
    const reportRefs = functionDefinition('public.get_rapor_varlik_referanslari_v1');
    expect(reportRefs).toContain('account.is_active IS TRUE');
    expect(reportRefs).toContain('customer.is_active IS TRUE');
    expect(reportRefs).toContain('employee.is_active IS TRUE');
    expect(reportRefs).not.toMatch(/\w+\.is_archived/);
    expect(sql).not.toContain('get_isletme_rapor_ozeti_v3');
    expect(sql).not.toContain('get_modul_rapor_ozeti_v2');
  });

  it('keeps Reports-only account totals complete but masks Birikim in Accounts-only context', () => {
    const accountReport = functionBody('public.get_account_report');
    expect(accountReport).toContain("p_isletme_id, 'raporlar'");
    expect(accountReport).toContain("p_isletme_id, 'hesaplar'");
    expect(accountReport).toContain("p_isletme_id, 'birikim'");
    expect(accountReport).toMatch(
      /v_has_reports IS TRUE\s+OR account\.type::text <> 'birikim'\s+OR v_has_savings IS TRUE/
    );
  });

  it('masks source-report identifiers and objects by module, activity and Savings', () => {
    const rows = functionBody('public.get_gelir_kaynagi_islem_satirlari_v1');
    for (const flag of [
      'v_accounts',
      'v_customers',
      'v_personnel',
      'v_savings',
    ]) {
      expect(rows).toContain(flag);
    }
    for (const moduleName of [
      'hesaplar',
      'cariler',
      'personel',
      'birikim',
    ]) {
      expect(rows).toContain(`p_isletme_id, '${moduleName}'`);
    }
    expect(rows).toContain(
      'LEFT JOIN public.hesaplar AS target_account'
    );
    expect(rows).toContain('account.is_active IS TRUE OR v_is_owner');
    expect(rows).toContain('customer.is_active IS TRUE OR v_is_owner');
    expect(rows).toContain('employee.is_active IS TRUE OR v_is_owner');
    expect(rows).toContain("account.type::text <> 'birikim'");
    expect(rows).toMatch(
      /WHEN v_is_owner THEN transaction_row\.updated_by\s+ELSE NULL::uuid/
    );
  });

  it('uses strict active semantics in passive-resource and report code', () => {
    const passivePolicies = [
      'Permission v2 passive hesaplar owner only',
      'Permission v2 passive cariler owner only',
      'Permission v2 passive personel owner only',
      'Permission v2 passive urunler owner only',
    ];
    for (const policyName of passivePolicies) {
      const policy = policyDefinition(policyName);
      expect(policy).toContain('is_active IS TRUE');
      expect(policy).not.toContain('is_active IS NOT FALSE');
    }

    for (const reportName of [
      'public.get_category_report_v2',
      'public.get_product_report_v2',
    ]) {
      expect(functionBody(reportName)).not.toContain(
        'is_active IS NOT FALSE'
      );
    }
  });

  it('publishes the exact narrow report and global-search RPC signatures', () => {
    const signatures = [
      /get_rapor_varlik_referanslari_v1\(\s*p_isletme_id uuid,\s*p_kind text DEFAULT NULL/s,
      /get_nakit_akisi_raporu_v1\(\s*p_isletme_id uuid,\s*p_start_date timestamp with time zone,\s*p_end_date timestamp with time zone/s,
      /get_rapor_kategori_referanslari_v1\(\s*p_isletme_id uuid,\s*p_type text/s,
      /get_kategori_rapor_islem_satirlari_v1\(\s*p_isletme_id uuid,\s*p_kategori_ids uuid\[\],[\s\S]*?p_start_date timestamp with time zone,\s*p_end_date timestamp with time zone,[\s\S]*?p_before_id uuid DEFAULT NULL/s,
      /get_rapor_trend_ozeti_v1\(\s*p_isletme_id uuid,\s*p_filter_kind text,\s*p_filter_id uuid,\s*p_start_date timestamp with time zone,\s*p_end_date timestamp with time zone/s,
      /search_yetkili_islem_satirlari_v1\(\s*p_isletme_id uuid,\s*p_search_query text DEFAULT NULL,\s*p_min_amount numeric DEFAULT NULL,\s*p_max_amount numeric DEFAULT NULL,\s*p_date_from date DEFAULT NULL,\s*p_date_to date DEFAULT NULL,\s*p_limit integer DEFAULT 50/s,
    ];
    for (const signature of signatures) expect(sql).toMatch(signature);
  });

  it('keeps passive entity labels out of shared definer projections', () => {
    const rows = functionDefinition('public.get_yetkili_islem_satirlari_v1');
    expect(rows).toContain('source_account.is_active IS NOT TRUE AND NOT v_is_owner');
    expect(rows).toContain('customer.is_active IS NOT TRUE AND NOT v_is_owner');
    expect(rows).toContain('employee.is_active IS NOT TRUE AND NOT v_is_owner');

    const productItems = functionDefinition('public.get_yetkili_islem_urun_kalemleri_v1');
    expect(productItems).toContain('WHEN product.is_active IS TRUE OR v_is_owner');
  });

  it('masks account and personnel labels inside the direct Product source-label RPC', () => {
    const labels = functionBody(
      'public.get_urun_hareket_kaynak_etiketleri_v1'
    );
    for (const moduleName of ['hesaplar', 'personel', 'birikim']) {
      expect(labels).toContain(`p_isletme_id, '${moduleName}'`);
    }
    expect(labels).toMatch(
      /WHEN v_can_view_accounts IS TRUE[\s\S]{0,180}?account\.is_active IS TRUE OR v_is_owner[\s\S]{0,220}?account\.type::text <> 'birikim'[\s\S]{0,160}?v_can_view_savings IS TRUE[\s\S]{0,160}?THEN account\.name::text/
    );
    expect(labels).toMatch(
      /WHEN v_can_view_personnel IS NOT TRUE[\s\S]{0,180}?employee\.is_active IS NOT TRUE[\s\S]{0,220}?THEN NULL::text/
    );
    expect(labels).toMatch(
      /WHEN customer\.is_active IS TRUE OR v_is_owner[\s\S]{0,100}?THEN customer\.name::text/
    );
    expect(labels).not.toContain('v_can_view_customers');
  });

  it('centralizes active-source reads and keeps raw rows stricter than projections', () => {
    const source = functionBody('internal.islem_satiri_okunabilir_v2');
    const savingsLegs = functionBody(
      'internal.islem_birikim_bacaklari_okunabilir_v1'
    );
    const raw = functionBody('internal.islem_ham_satiri_okunabilir_v1');

    expect(source).toContain('internal.islem_kaynagi_okunabilir_v1(');
    expect(source).toContain('internal.isletme_sahibi_v1(');
    expect(source).toContain('account.is_active IS TRUE');
    expect(source).toContain('customer.is_active IS TRUE');
    expect(source).toContain('employee.is_active IS TRUE');
    expect(source).toContain("account.type::text <> 'birikim'");
    expect(source).toContain("p_isletme_id, 'birikim'");

    expect(savingsLegs).toContain('internal.aktif_uye_v1(');
    expect(savingsLegs).toContain('account.isletme_id = p_isletme_id');
    expect(savingsLegs).toContain('account.is_active IS NOT TRUE');
    expect(savingsLegs).toContain("account.type::text = 'birikim'");
    expect(savingsLegs).toContain('v_can_view_savings IS NOT TRUE');

    expect(raw).toContain('internal.islem_satiri_okunabilir_v2(');
    expect(raw).toContain(
      'internal.islem_birikim_bacaklari_okunabilir_v1('
    );
    expect(raw).toContain('customer.isletme_id = p_isletme_id');
    expect(raw).toContain('employee.isletme_id = p_isletme_id');
    expect(raw).toContain("p_isletme_id, 'cariler'");
    expect(raw).toContain("p_isletme_id, 'personel'");
  });

  it('applies the strict raw-row envelope to current and scheduled transaction RLS', () => {
    const policyNames = [
      'Permission v2 read islemler',
      'Permission v2 source gate islemler',
      'Permission v2 insert islemler',
      'Permission v2 insert source gate islemler',
      'Permission v2 update islemler',
      'Permission v2 update source gate islemler',
      'Permission v2 delete islemler',
      'Permission v2 delete source gate islemler',
      'Permission v2 read ileri tarihli',
      'Permission v2 source gate ileri tarihli',
      'Permission v2 insert ileri tarihli',
      'Permission v2 insert source gate ileri tarihli',
      'Permission v2 update ileri tarihli',
      'Permission v2 update source gate ileri tarihli',
      'Permission v2 delete ileri tarihli',
      'Permission v2 delete source gate ileri tarihli',
    ];

    for (const policyName of policyNames) {
      expect(policyDefinition(policyName)).toContain(
        'internal.islem_ham_satiri_okunabilir_v1('
      );
    }
  });

  it('keeps all transaction-photo paths behind active source and Savings checks', () => {
    const helpers = [
      'internal.storage_photo_insert_allowed_v1',
      'internal.storage_transaction_photo_select_allowed_v2',
      'internal.storage_transaction_photo_delete_allowed_v2',
    ];

    for (const helper of helpers) {
      const body = functionBody(helper);
      expect(body).toContain('FROM public.islemler AS transaction_row');
      expect(body).toContain('internal.islem_satiri_okunabilir_v2(');
      expect(body).toContain(
        'internal.islem_birikim_bacaklari_okunabilir_v1('
      );
    }
  });

  it('keeps passive products out of raw movement reads and narrow item projections', () => {
    const movementPolicy = policyDefinition(
      'Permission v2 active urun hareketleri owner only'
    );
    expect(movementPolicy).toContain('AS RESTRICTIVE');
    expect(movementPolicy).toContain('product.is_active IS TRUE');
    expect(movementPolicy).toContain('internal.isletme_sahibi_v1(');
    expect(movementPolicy).not.toContain('product.is_archived');

    const items = functionBody('public.get_yetkili_islem_urun_kalemleri_v1');
    expect(items).toContain('product.isletme_id = movement.isletme_id');
    expect(items).toContain('product.is_active IS TRUE OR v_is_owner');
    expect(items).not.toContain('product.is_archived');
  });

  it('keeps legacy Product, leave and creator projections on the V2 visibility contract', () => {
    const labels = functionBody(
      'public.get_urun_hareket_minimal_cari_labels'
    );
    expect(labels).toContain("p_isletme_id, 'urunler'");
    expect(labels).toContain('product.is_active IS TRUE');
    expect(labels).toContain('customer.is_active IS TRUE');

    const leave = functionBody('public.get_personel_izin_kotalari_v1');
    expect(leave).toContain("p_isletme_id, 'personel'");
    expect(leave).toContain('employee.is_active IS TRUE');
    expect(leave).not.toContain('created_by = auth.uid()');
    expect(leave).not.toContain('is_archived');

    const creators = functionBody('public.get_transaction_creator_labels');
    expect(creators).toContain('internal.islem_satiri_okunabilir_v2(');
    expect(creators).toContain('product_permission.can_view IS TRUE');
    expect(creators).toContain('product.is_active IS TRUE');
  });

  it('keeps global rows source-scoped while masking every closed module', () => {
    const projections = [
      'public.get_yetkili_islem_satirlari_v1',
      'public.search_yetkili_islem_satirlari_v1',
    ];

    for (const functionName of projections) {
      const definition = functionDefinition(functionName);
      const body = functionBody(functionName);

      expect(definition).toContain('counterparty_kind text');
      expect(definition).toContain('counterparty_name text');
      for (const moduleName of [
        'hesaplar',
        'cariler',
        'personel',
        'urunler',
        'birikim',
      ]) {
        expect(body).toContain(`p_isletme_id, '${moduleName}'`);
      }

      expect(body).toContain('internal.islem_satiri_okunabilir_v2(');
      expect(body).not.toMatch(
        /OR \(\s*v_has_accounts IS TRUE[\s\S]{0,500}?source_account\.is_active IS TRUE/
      );
      expect(body).toMatch(
        /v_has_products IS TRUE[\s\S]*?FROM public\.urun_hareketler AS movement[\s\S]*?product\.is_active IS TRUE/
      );

      expect(body).toMatch(
        /WHEN v_has_accounts IS TRUE[\s\S]{0,350}?source_account\.type::text <> 'birikim'[\s\S]{0,160}?v_has_savings IS TRUE[\s\S]{0,160}?THEN transaction_row\.hesap_id[\s\S]{0,80}?ELSE NULL::uuid/
      );
      expect(body).toMatch(
        /WHEN v_has_accounts IS TRUE[\s\S]{0,350}?target_account\.type::text <> 'birikim'[\s\S]{0,160}?v_has_savings IS TRUE[\s\S]{0,160}?THEN transaction_row\.hedef_hesap_id[\s\S]{0,80}?ELSE NULL::uuid/
      );
      expect(body).toMatch(
        /WHEN v_has_customers IS TRUE[\s\S]{0,180}?customer\.is_active IS TRUE OR v_is_owner[\s\S]{0,120}?THEN transaction_row\.cari_id[\s\S]{0,80}?ELSE NULL::uuid/
      );
      expect(body).toMatch(
        /WHEN v_has_personnel IS TRUE[\s\S]{0,180}?employee\.is_active IS TRUE OR v_is_owner[\s\S]{0,120}?THEN transaction_row\.personel_id[\s\S]{0,80}?ELSE NULL::uuid/
      );
      expect(body).toMatch(
        /WHEN v_has_accounts IS NOT TRUE[\s\S]{0,350}?source_account\.type::text = 'birikim'[\s\S]{0,160}?v_has_savings IS NOT TRUE[\s\S]{0,160}?THEN NULL::jsonb/
      );
      expect(body).toMatch(
        /WHEN v_has_accounts IS NOT TRUE[\s\S]{0,350}?target_account\.type::text = 'birikim'[\s\S]{0,160}?v_has_savings IS NOT TRUE[\s\S]{0,160}?THEN NULL::jsonb/
      );
      expect(body).toMatch(
        /WHEN v_has_customers IS NOT TRUE[\s\S]*?THEN NULL::jsonb/
      );
      expect(body).toMatch(
        /WHEN v_has_personnel IS NOT TRUE[\s\S]*?THEN NULL::jsonb/
      );
      expect(body).toMatch(
        /internal\.islem_satiri_okunabilir_v2\([\s\S]*?internal\.islem_birikim_bacaklari_okunabilir_v1\([\s\S]*?transaction_row\.photo_path ~/
      );
      expect(body).toContain('label_product.is_active IS TRUE');
      expect(body).toContain("THEN 'cari'::text");
      expect(body).not.toContain("THEN 'personel'::text");
      expect(body).toMatch(
        /WHEN v_has_accounts IS NOT TRUE[\s\S]{0,220}?transaction_row\.type::text IN \([\s\S]{0,180}?'cari_odeme'[\s\S]{0,180}?'personel_tahsilat'[\s\S]{0,350}?source_account\.type::text <> 'birikim'[\s\S]{0,100}?v_has_savings IS TRUE[\s\S]{0,120}?THEN 'hesap'::text/
      );
      expect(body).toMatch(
        /WHEN v_is_owner THEN transaction_row\.updated_by\s+ELSE NULL::uuid/
      );
    }

    const search = functionBody('public.search_yetkili_islem_satirlari_v1');
    expect(search).toMatch(
      /v_has_accounts IS TRUE[\s\S]{0,450}?source_account\.name[\s\S]{0,80}?ILIKE/
    );
    expect(search).toMatch(
      /v_has_accounts IS TRUE[\s\S]{0,450}?target_account\.name[\s\S]{0,80}?ILIKE/
    );
    expect(search).toContain('search_product.is_active IS TRUE');
    expect(search).toContain("COALESCE(customer.name, '') ILIKE");
    expect(search).toMatch(
      /v_has_personnel IS TRUE[\s\S]{0,180}?pg_catalog\.concat_ws\([\s\S]{0,180}?employee\.first_name[\s\S]{0,180}?ILIKE/
    );
  });

  it('masks updater audit IDs in narrow shared projections and documents legacy debt', () => {
    const migrationHeader = sql.slice(0, sql.indexOf('\nBEGIN;'));
    expect(migrationHeader).toContain('updated_by');
    expect(migrationHeader).toContain('eski client');

    for (const functionName of [
      'public.get_yetkili_islem_satirlari_v1',
      'public.search_yetkili_islem_satirlari_v1',
      'public.get_gelir_kaynagi_islem_satirlari_v1',
    ]) {
      expect(functionBody(functionName)).toMatch(
        /WHEN v_is_owner THEN transaction_row\.updated_by\s+ELSE NULL::uuid/
      );
    }
  });

  it('requires Product scope before an itemless row receives its first V3 item', () => {
    const body = functionBody('internal.reapply_cari_urun_items_v3');
    const guardStart = body.indexOf(
      'IF pg_catalog.jsonb_array_length(p_items) > 0 THEN'
    );
    const firstStockWrite = body.indexOf('UPDATE public.urunler AS product');

    expect(guardStart).toBeGreaterThanOrEqual(0);
    expect(firstStockWrite).toBeGreaterThan(guardStart);
    expect(body).toMatch(
      /SELECT[\s\S]*?transaction_row\.created_by[\s\S]*?FROM public\.islemler AS transaction_row[\s\S]*?transaction_row\.id = p_islem_id[\s\S]*?transaction_row\.isletme_id = p_isletme_id/
    );
    expect(body).toMatch(
      /IF pg_catalog\.jsonb_array_length\(p_items\) > 0 THEN[\s\S]*?internal\.kayit_mutasyon_izni_v1\(\s*p_isletme_id,\s*'urunler',\s*v_transaction_created_by,\s*v_product_action/
    );
    expect(body).toMatch(
      /v_product_action := CASE p_authorization_action[\s\S]*?WHEN 'create' THEN 'create'[\s\S]*?ELSE 'update'/
    );
  });

  it('keeps legacy mutation signatures but never applies caller-supplied balance operations', () => {
    const legacyFunctions = [
      'public.create_islem_atomik',
      'public.create_islem_with_urun_atomik',
      'public.update_islem_atomik',
      'public.delete_islem_atomik',
      'public.taksit_plani_olustur',
    ];
    const serverDerivedCall =
      /(?:internal\.(?:bakiye_ops|[a-z0-9_]*(?:bakiye|balance|islem)[a-z0-9_]*)|public\.(?:create_islem_atomik|(?:create|update|delete)_islem_atomik_v2))\s*\(/i;

    for (const functionName of legacyFunctions) {
      const body = functionBody(functionName);
      expect(body).not.toMatch(
        /jsonb_array_elements\s*\(\s*(?:pg_catalog\.)?coalesce\s*\(\s*p_balance_ops/i
      );
      expect(body).not.toMatch(/jsonb_array_elements\s*\(\s*p_balance_ops/i);
      expect(body).not.toContain('public.increment_balance(');
      expect(body).not.toMatch(
        /jsonb_populate_record\s*\(\s*NULL::public\.islemler\s*,\s*p_new_row/i
      );
      expect(body).toMatch(serverDerivedCall);
    }

    const productCreate = functionBody('public.create_islem_with_urun_atomik');
    expect(productCreate).toMatch(/internal\.reapply_cari_urun_items_v3\s*\([\s\S]*?'create'\s*\)/);
  });

  it('does not recurse from canonical V2 mutations back into legacy public wrappers', () => {
    const canonicalToLegacy = [
      ['public.create_islem_atomik_v2', 'public.create_islem_atomik'],
      ['public.update_islem_atomik_v2', 'public.update_islem_atomik'],
      ['public.delete_islem_atomik_v2', 'public.delete_islem_atomik'],
    ] as const;

    for (const [canonical, legacy] of canonicalToLegacy) {
      expect(functionBody(canonical)).not.toMatch(new RegExp(`${escapeRegExp(legacy)}\\s*\\(`));
    }
  });

  it('uses the canonical source module for V2 create, update and delete authorization', () => {
    const create = functionBody('public.create_islem_atomik_v2');
    expect(create).toMatch(
      /internal\.(?:islem_mutasyon_izni_v2|kayit_mutasyon_izni_v1)\s*\([\s\S]*?'create'/
    );
    expect(create).not.toMatch(/v_can\s*:=\s*v_can\s+AND\s+v_can_view/);

    const rowGuard = functionBody('internal.get_islem_mutation_row_v1');
    expect(rowGuard).toContain('internal.islem_tipi_modulu(');
    expect(rowGuard).toContain('internal.islem_mutasyon_izni_v2(');
    expect(rowGuard).toContain("p_isletme_id, 'birikim'");
    expect(rowGuard).toContain('account.is_active IS TRUE');
    expect(rowGuard).toContain('customer.is_active IS TRUE');
    expect(rowGuard).toContain('employee.is_active IS TRUE');
    expect(rowGuard).toContain('product.is_active IS NOT TRUE');
    expect(rowGuard).toContain('product.is_archived IS TRUE');
  });

  it('routes the public mutation context through the same fail-closed row guard', () => {
    const publicContext = functionBody(
      'public.get_islem_mutation_context_v1'
    );
    expect(
      functionDefinition('public.get_islem_mutation_context_v1')
    ).toMatch(/LANGUAGE plpgsql\s+VOLATILE/);
    expect(publicContext).toContain('internal.get_islem_mutation_row_v1(');
    expect(publicContext).toContain('false');
    expect(publicContext).toContain('ISLEM_MUTATION_CONTEXT_NOT_AUTHORIZED');

    const rowGuard = functionBody('internal.get_islem_mutation_row_v1');
    expect(rowGuard).toContain("account.type::text = 'birikim'");
    expect(rowGuard).toContain("p_isletme_id, 'birikim'");
    expect(rowGuard).toContain("p_isletme_id, 'cariler'");
    expect(rowGuard).toContain("p_isletme_id, 'personel'");
    expect(rowGuard).toContain('product.id IS NULL');
    expect(rowGuard).toContain('product.is_active IS NOT TRUE');
    expect(rowGuard).toContain('product.is_archived IS TRUE');
  });

  it('requires canonical server context for shared financial row writes', () => {
    const guard = functionBody('internal.enforce_islem_source_mutation_v2');
    expect(guard.match(/ISLEM_CANONICAL_RPC_REQUIRED/g)).toHaveLength(4);
    expect(guard).toContain('internal.isletme_sahibi_v1(NEW.isletme_id)');
    expect(guard).toContain('internal.isletme_sahibi_v1(OLD.isletme_id)');
    for (const action of ['create', 'update', 'delete']) {
      expect(guard).toMatch(
        new RegExp(
          `permission_v2_movement_action_context[\\s\\S]*?action_context\\.action = '${action}'`
        )
      );
    }

    const canonicalWriters = [
      ['public.create_islem_atomik_v2', 'create'],
      ['internal.apply_islem_update_canonical_v2', 'update'],
      ['internal.delete_islem_canonical_v2', 'delete'],
    ] as const;
    for (const [functionName, action] of canonicalWriters) {
      const body = functionBody(functionName);
      expect(body).toContain(
        'INSERT INTO internal.permission_v2_movement_action_context'
      );
      expect(body).toContain(`'${action}'`);
      expect(body).toContain(
        'DELETE FROM internal.permission_v2_movement_action_context'
      );
    }

    const legacyCariCash = functionBody(
      'public.create_cari_nakit_islem_atomik'
    );
    expect(legacyCariCash).toContain('public.create_islem_atomik_v2(');
    expect(legacyCariCash).not.toContain('INSERT INTO public.islemler');
    expect(legacyCariCash).not.toMatch(
      /UPDATE public\.(?:hesaplar|cariler)\b/
    );
  });

  it('keeps the legacy create metadata attach exception narrow and source-authorized', () => {
    const guard = functionBody('internal.enforce_islem_source_mutation_v2');

    expect(guard).toMatch(/OLD\.created_by\s*=\s*auth\.uid\(\)/);
    expect(guard).toMatch(
      /jsonb\(NEW\)[\s\S]*?'photo_path'[\s\S]*?'source_ileri_id'[\s\S]*?jsonb\(OLD\)/
    );
    expect(guard).toMatch(/internal\.islem_mutasyon_izni_v2\s*\([\s\S]*?'create'/);
    expect(guard).toMatch(
      /FROM public\.ileri_tarihli_islemler[\s\S]*?internal\.islem_mutasyon_izni_v2\s*\([\s\S]*?'update'/
    );
  });

  it('requires unspoofable private context for both legacy metadata updates', () => {
    const guard = functionBody('internal.enforce_islem_source_mutation_v2');
    const updateStart = guard.indexOf("IF TG_OP = 'UPDATE' THEN");
    const firstReturn = guard.indexOf('RETURN NEW;', updateStart);
    const secondReturn = guard.indexOf('RETURN NEW;', firstReturn + 1);
    expect(updateStart).toBeGreaterThanOrEqual(0);
    expect(firstReturn).toBeGreaterThan(updateStart);
    expect(secondReturn).toBeGreaterThan(firstReturn);

    const createMetadataBranch = guard.slice(updateStart, firstReturn);
    const updateMetadataBranch = guard.slice(firstReturn + 1, secondReturn);
    expect(createMetadataBranch).toContain(
      'FROM internal.permission_v2_movement_action_context'
    );
    expect(createMetadataBranch).toContain(
      "action_context.action = 'create'"
    );
    expect(updateMetadataBranch).toContain(
      'FROM internal.permission_v2_movement_action_context'
    );
    expect(updateMetadataBranch).toContain(
      "action_context.action = 'update'"
    );

    for (const [functionName, action] of [
      ['public.create_islem_atomik', 'create'],
      ['public.update_islem_atomik', 'update'],
    ] as const) {
      const wrapper = functionBody(functionName);
      expect(wrapper).toContain(
        'INSERT INTO internal.permission_v2_movement_action_context'
      );
      expect(wrapper).toContain(`'${action}'`);
      expect(wrapper).toContain(
        'DELETE FROM internal.permission_v2_movement_action_context'
      );
      expect(wrapper).toContain('action_context.actor_user_id = auth.uid()');
    }

    expect(sql).toMatch(
      /REVOKE ALL\s+ON TABLE internal\.permission_v2_movement_action_context\s+FROM PUBLIC, anon, authenticated, service_role/
    );
  });

  it('completes scheduled rows with the V2 source contract and no Personel-to-Hesap coupling', () => {
    const body = functionBody('public.complete_ileri_tarihli_islem_atomik');
    expect(body).toContain('internal.islem_tipi_modulu(');
    expect(body).toContain('internal.islem_mutasyon_izni_v2(');
    expect(body).not.toMatch(/ARRAY\s*\[\s*'personel'\s*,\s*'hesaplar'\s*\]/);
    expect(body).not.toMatch(/permissions\s*->\s*'modules'\s*->\s*'(?:ileri_tarihli|islemler)'/);
  });

  it('limits direct balance increments to finite, tenant-scoped owner calls', () => {
    const body = functionBody('public.increment_balance');

    expect(body).toMatch(
      /internal\.isletme_sahibi_v1\s*\(|FROM public\.isletmeler[\s\S]*?user_id\s*=\s*(?:auth\.uid\(\)|v_uid)/
    );
    expect(body).toMatch(/\bisletme_id\b/);
    expect(body).toMatch(/\bNaN\b/);
    expect(body).toMatch(/\bInfinity\b/);
    expect(
      body.match(/business\.id\s*=\s*(?:account|customer|employee)\.isletme_id/g)
    ).toHaveLength(3);
    expect(body).not.toMatch(/isletme_users[\s\S]*?status\s*=\s*'active'/i);
  });

  it('fails closed for stock deltas without tenant, exact action or finite input', () => {
    const body = functionBody('public.update_urun_miktar');

    expect(body).toContain('OR p_isletme_id IS NULL');
    expect(body).toContain(
      'NOT internal.isletme_sahibi_v1(p_isletme_id)'
    );
    expect(body).toMatch(
      /internal\.kayit_mutasyon_izni_v1\s*\([\s\S]*?'urunler'[\s\S]*?auth\.uid\(\)[\s\S]*?'create'/
    );
    expect(body).toMatch(/\bNaN\b/);
    expect(body).toMatch(/\bInfinity\b/);
    expect(body).toMatch(
      /WHERE[\s\S]*?\bid\s*=\s*p_urun_id[\s\S]*?\bisletme_id\s*=\s*p_isletme_id/i
    );
    expect(body).not.toContain('product.is_active IS TRUE');
    expect(body).not.toContain('product.is_archived IS FALSE');
    expect(body).not.toMatch(
      /ELSE[\s\S]*?UPDATE\s+(?:public\.)?urunler[\s\S]*?WHERE\s+id\s*=\s*p_urun_id[\s\S]*?END IF/i
    );

    const ownerGuard = body.indexOf(
      'NOT internal.isletme_sahibi_v1(p_isletme_id)'
    );
    const firstWrite = body.indexOf('\n  UPDATE public.urunler');
    expect(ownerGuard).toBeGreaterThanOrEqual(0);
    expect(firstWrite).toBeGreaterThan(ownerGuard);
    expect(body.slice(0, firstWrite)).not.toMatch(
      /^\s*(?:INSERT INTO|UPDATE public\.|DELETE FROM)\b/m
    );
  });

  it('creates shared Products at zero and exposes only metadata UPDATE columns', () => {
    const insertGate = policyDefinition(
      'Permission v2 insert gate urunler'
    );
    expect(insertGate).toContain('AS RESTRICTIVE');
    expect(insertGate).toContain('FOR INSERT');
    expect(insertGate).toContain(
      'urunler.miktar IS NOT DISTINCT FROM 0'
    );
    expect(insertGate).toContain(
      'OR internal.isletme_sahibi_v1(urunler.isletme_id)'
    );
    expect(insertGate).not.toMatch(/COALESCE\s*\(\s*urunler\.miktar/i);

    const canInsertAmount = (
      amount: number | null,
      isOwner: boolean
    ): boolean => isOwner || amount === 0;
    expect(canInsertAmount(0, false)).toBe(true);
    expect(canInsertAmount(null, false)).toBe(false);
    expect(canInsertAmount(25, false)).toBe(false);
    expect(canInsertAmount(null, true)).toBe(true);
    expect(canInsertAmount(25, true)).toBe(true);

    const normalizedSql = sql.replace(/\s+/g, ' ');
    expect(normalizedSql).toContain(
      'REVOKE UPDATE ON TABLE public.urunler FROM PUBLIC, anon, authenticated;'
    );

    const metadataGrant = sql.match(
      /GRANT UPDATE \(([\s\S]*?)\)\s+ON TABLE public\.urunler\s+TO authenticated;/
    );
    expect(metadataGrant).not.toBeNull();
    const grantedColumns = metadataGrant![1]
      .split(',')
      .map((column) => column.trim());
    expect(grantedColumns).toEqual([
      'ad',
      'kod',
      'birim',
      'alis_fiyati',
      'satis_fiyati',
      'currency',
      'aciklama',
      'is_active',
      'is_archived',
      'kategori_id',
      'kdv_orani',
    ]);
    for (const protectedColumn of [
      'id',
      'isletme_id',
      'miktar',
      'created_at',
      'updated_at',
      'created_by',
      'updated_by',
    ]) {
      expect(grantedColumns).not.toContain(protectedColumn);
    }

    const postcondition = sql.slice(sql.indexOf('DO $postcondition$'));
    expect(postcondition).toContain(
      "'authenticated', 'public.urunler', 'UPDATE'"
    );
    expect(postcondition).toContain(
      "'authenticated', 'public.urunler', 'miktar', 'UPDATE'"
    );
    expect(postcondition).toContain('has_any_column_privilege');
    expect(postcondition).toContain(
      "'anon', 'public.urunler', 'UPDATE'"
    );
    expect(postcondition).toContain(
      "'service_role', 'public.urunler', 'UPDATE'"
    );
    expect(postcondition).toContain(
      "'postgres', 'public.urunler', 'UPDATE'"
    );
    for (const column of [...grantedColumns, 'miktar', 'created_by']) {
      expect(postcondition).toContain(`'${column}'`);
    }
  });

  it('requires shared manual stock writes to use the atomic V2 RPCs', () => {
    const rawPolicies = [
      [
        'Permission v2 direct insert urun hareketleri owner only',
        'FOR INSERT',
      ],
      [
        'Permission v2 direct update urun hareketleri owner only',
        'FOR UPDATE',
      ],
      [
        'Permission v2 direct delete urun hareketleri owner only',
        'FOR DELETE',
      ],
    ] as const;

    for (const [policyName, command] of rawPolicies) {
      const policy = policyDefinition(policyName);
      expect(policy).toContain('AS RESTRICTIVE');
      expect(policy).toContain(command);
      expect(policy).toContain(
        'internal.isletme_sahibi_v1(urun_hareketler.isletme_id)'
      );
    }
    const updatePolicy = policyDefinition(
      'Permission v2 direct update urun hareketleri owner only'
    );
    expect(updatePolicy).toContain('USING (');
    expect(updatePolicy).toContain('WITH CHECK (');

    const atomicRpcIdentities = [
      'public.create_urun_hareket_atomik_v2(uuid,jsonb)',
      'public.update_urun_hareket_atomik_v2(uuid,uuid,jsonb)',
      'public.delete_urun_hareket_atomik_v2(uuid,uuid)',
    ];
    const normalizedSql = sql.replace(/\s+/g, '');
    const precondition = sql.slice(
      sql.indexOf('DO $precondition$'),
      sql.indexOf('$precondition$;') + '$precondition$;'.length
    ).replace(/\s+/g, '');
    const postcondition = sql
      .slice(sql.indexOf('DO $postcondition$'))
      .replace(/\s+/g, '');

    for (const identity of atomicRpcIdentities) {
      expect(precondition).toContain(identity);
      expect(postcondition).toContain(identity);
      expect(revokedPrincipals(identity)).toEqual(
        expect.arrayContaining([
          'public',
          'anon',
          'authenticated',
          'service_role',
        ])
      );
      expect(grantedPrincipals(identity)).toContain('authenticated');
      expect(grantedPrincipals(identity)).not.toContain('service_role');
      expect(normalizedSql).toContain(
        `ALTERFUNCTION${identity}OWNERTOpostgres;`
      );
    }
    expect(postcondition).toContain(
      'PERMISSION_V2_POSTCONDITION_ATOMIC_MOVEMENT_ACL'
    );

    const linkedMovementGuard = functionBody(
      'internal.enforce_linked_product_movement_permission_v1'
    );
    const businessCascadeGate = linkedMovementGuard.match(
      /IF TG_OP = 'DELETE' AND NOT EXISTS \([\s\S]*?FROM public\.isletmeler AS business[\s\S]*?business\.id = OLD\.isletme_id[\s\S]*?THEN\s+RETURN OLD;\s+END IF;/
    )?.[0];
    expect(businessCascadeGate).toBeDefined();
    const sharedDeleteProductGate = linkedMovementGuard.match(
      /IF TG_OP = 'DELETE'\s+AND NOT internal\.isletme_sahibi_v1\(OLD\.isletme_id\)([\s\S]*?)END IF;/
    )?.[0];
    expect(sharedDeleteProductGate).toBeDefined();
    expect(sharedDeleteProductGate).toContain('AND EXISTS (');
    expect(sharedDeleteProductGate).toContain(
      'product.id = OLD.urun_id'
    );
    expect(sharedDeleteProductGate).toContain(
      'product.isletme_id = OLD.isletme_id'
    );
    expect(sharedDeleteProductGate).toContain(
      'product.is_active IS NOT TRUE'
    );
    expect(sharedDeleteProductGate).toContain(
      'product.is_archived IS NOT FALSE'
    );
    expect(sharedDeleteProductGate).not.toContain('AND NOT EXISTS (');
    expect(sharedDeleteProductGate).toContain('immediate FK cascade');
    expect(linkedMovementGuard.indexOf(businessCascadeGate!)).toBeLessThan(
      linkedMovementGuard.indexOf(sharedDeleteProductGate!)
    );
    expect(linkedMovementGuard).toMatch(
      /IF v_islem_ids\[v_context_index\] IS NULL THEN\s+CONTINUE/
    );
    const entityDeleteGuard = functionBody(
      'internal.enforce_entity_delete_references_v1'
    );
    const productDeleteBranch = entityDeleteGuard.match(
      /WHEN 'urunler' THEN([\s\S]*?)ELSE/
    )?.[1];
    expect(productDeleteBranch).toContain(
      'movement_row.islem_id IS NOT NULL'
    );
    expect(sql).toContain(
      'FK cascade cleanup is an'
    );
    expect(sql).toContain('internal referential action');
  });

  it('removes authenticated access from retired cash-advance mutation RPCs', () => {
    const retired = [
      'public.perform_nakit_avans(uuid,uuid,uuid,numeric,numeric,uuid,text,timestamp with time zone,boolean,integer)',
      'public.perform_taksit_odeme(uuid,uuid,uuid)',
      'public.delete_nakit_avans_with_reversal(uuid,uuid)',
    ];

    for (const identity of retired) {
      const revoked = revokedPrincipals(identity);
      expect(revoked).toEqual(expect.arrayContaining(['public', 'anon', 'authenticated']));
      expect(grantedPrincipals(identity)).not.toContain('authenticated');
    }
  });

  it('gates transaction photo reads and deletes by the transaction source action', () => {
    const selectHelper = functionNamesMatching(/^internal\.storage_.*photo_select_allowed/i).find(
      (name) => functionBody(name).includes('FROM public.islemler')
    );
    const deleteHelper = functionNamesMatching(/^internal\.storage_.*photo_delete_allowed/i).find(
      (name) => functionBody(name).includes('FROM public.islemler')
    );

    expect(selectHelper).toBeDefined();
    expect(deleteHelper).toBeDefined();

    const selectBody = functionBody(selectHelper!);
    const deleteBody = functionBody(deleteHelper!);
    expect(selectBody).toContain('internal.islem_kaynagi_okunabilir_v1(');
    expect(deleteBody).toMatch(
      /internal\.(?:islem_mutasyon_izni_v2|kayit_mutasyon_izni_v1)\s*\([\s\S]*?'delete'/
    );

    const selectPolicy = sql.match(
      /(?:ALTER|CREATE) POLICY "islem_photos_note_select_v1"[\s\S]*?;/
    )?.[0];
    const deletePolicy = sql.match(
      /(?:ALTER|CREATE) POLICY "islem_photos_note_delete_v1"[\s\S]*?;/
    )?.[0];
    expect(selectPolicy).toBeDefined();
    expect(deletePolicy).toBeDefined();
    expect(selectPolicy!.replace(/\s+/g, '')).toContain(`${selectHelper!}(name`);
    expect(deletePolicy!.replace(/\s+/g, '')).toContain(`${deleteHelper!}(name`);
    expect(selectPolicy).not.toMatch(/path_row\.kayit_turu\s*=\s*'islem'\s+OR/);
    expect(deletePolicy).not.toMatch(/path_row\.kayit_turu\s*=\s*'islem'\s+OR/);
  });

  it('guards entity summaries by their module and hides passive targets from shared users', () => {
    const summaries = [
      ['public.get_cari_ozet', 'cariler'],
      ['public.get_personel_ozet', 'personel'],
      ['public.get_urun_ozet', 'urunler'],
    ] as const;

    for (const [functionName, moduleName] of summaries) {
      const body = functionBody(functionName);
      expect(body).toContain('internal.etkin_yetki_v2(');
      expect(body).toContain(`'${moduleName}'`);
      expect(body).toMatch(/\bis_active IS TRUE\b/);
      expect(body).toMatch(/\bv_is_owner\b/);
    }

    const balanceReport = functionBody('public.get_balance_activity_report');
    expect(balanceReport).toContain('internal.etkin_yetki_v2(');
    expect(balanceReport).toContain("'raporlar'");
    expect(balanceReport).toMatch(/\bis_active IS TRUE\b/);
  });

  it('guards every vade and installment projection with Cari visibility', () => {
    const cariProjections = [
      'public.get_cari_vade_rozet',
      'public.get_vade_listesi',
      'public.get_vade_ozet',
      'public.get_cari_vade_detay',
      'public.get_cari_islem_kalan',
      'public.get_taksit_plan_listesi',
      'public.get_cari_taksit_kalan',
    ];

    for (const functionName of cariProjections) {
      const body = functionBody(functionName);
      expect(body).toContain('internal.etkin_yetki_v2(');
      expect(body).toContain("'cariler'");
    }

    const fifo = functionBody('public._vade_birim_mahsuplu');
    expect(fifo).toMatch(/\bc\.is_active IS TRUE\b/);
    expect(fifo).toMatch(/FROM public\.isletmeler[\s\S]*?user_id\s*=\s*(?:auth\.uid\(\)|v_uid)/);
  });

  it('keeps installment and allocation base-table reads on active Cari rows', () => {
    const policies = [
      ['taksit_planlari_select', 'taksit_planlari'],
      ['taksitler_select', 'taksitler'],
      ['islem_tahsis_select', 'islem_tahsis'],
    ] as const;

    for (const [policyName, tableName] of policies) {
      const policy = sql.match(
        new RegExp(
          `ALTER POLICY "${escapeRegExp(policyName)}"[\\s\\S]*?ON public\\.${tableName}[\\s\\S]*?\\n\\);`
        )
      )?.[0];
      expect(policy).toBeDefined();
      expect(policy).toContain("p_isletme_id, 'cariler'".replace('p_isletme_id', `${tableName}.isletme_id`));
      expect(policy).toContain('customer.is_active IS TRUE');
    }
  });

  it('limits shared category visibility to active business modules', () => {
    const policy = sql.match(
      /ALTER POLICY "Shared select kategoriler"[\s\S]*?\n\);/
    )?.[0];
    expect(policy).toBeDefined();
    expect(policy).toContain('kategoriler.is_active IS TRUE');
    expect(policy).toContain('internal.etkin_yetki_v2(');
    for (const moduleName of ['hesaplar', 'cariler', 'personel', 'urunler']) {
      expect(policy).toContain(`'${moduleName}'`);
    }
  });

  it('does not let public statement links expose a passive shared Cari', () => {
    const createLink = functionBody('public.ekstre_link_olustur');
    const resolveToken = functionBody('public.cari_ekstre_token_dogrula_v1');
    const cancelLink = functionBody('public.ekstre_link_iptal');
    const selectPolicy = sql.match(
      /ALTER POLICY "cari_ekstre_links_select"[\s\S]*?\n\);/
    )?.[0];

    expect(createLink).toContain('FROM public.cariler');
    expect(createLink).toMatch(
      /cari_row\.is_active IS TRUE[\s\S]*?v_is_owner|v_is_owner[\s\S]*?cari_row\.is_active IS TRUE/
    );
    expect(resolveToken).toContain('FROM public.cariler');
    expect(resolveToken).toMatch(/\bcari_row\.is_active IS TRUE\b/);
    expect(resolveToken).toContain('FROM public.isletmeler');
    expect(cancelLink).toContain("p_isletme_id, 'cariler'");
    expect(cancelLink).toContain('customer.is_active IS TRUE');
    expect(cancelLink).toContain('active_link.created_by = v_uid');
    expect(selectPolicy).toBeDefined();
    expect(selectPolicy).toContain('customer.is_active IS TRUE');
  });

  it('keeps quota writes server-only and authenticated reads self-scoped', () => {
    const serviceOnly = [
      'public.check_rate_limit(uuid,text,integer)',
      'public.record_api_usage(uuid,text)',
    ];
    for (const identity of serviceOnly) {
      expect(revokedPrincipals(identity)).toEqual(
        expect.arrayContaining(['public', 'anon', 'authenticated'])
      );
      expect(grantedPrincipals(identity)).toContain('service_role');
      expect(grantedPrincipals(identity)).not.toContain('authenticated');
    }

    const remainingIdentity = 'public.get_remaining_usage(uuid,text,integer)';
    expect(revokedPrincipals(remainingIdentity)).toEqual(
      expect.arrayContaining(['public', 'anon'])
    );
    expect(grantedPrincipals(remainingIdentity)).toEqual(
      expect.arrayContaining(['authenticated', 'service_role'])
    );

    const remaining = functionBody('public.get_remaining_usage');
    expect(remaining).toMatch(
      /NOT v_is_service[\s\S]*?auth\.uid\(\) IS NULL[\s\S]*?p_user_id IS DISTINCT FROM auth\.uid\(\)/
    );
  });

  it('enforces the linked-category archive guard for direct table updates', () => {
    const triggerFunction = functionNamesMatching(
      /^internal\..*(?:kategori|category).*(?:arsiv|archive|is_active)/i
    ).find((name) => {
      const body = functionBody(name);
      return body.includes('CATEGORY_HAS_TRANSACTIONS') && body.includes('TG_OP');
    });

    expect(triggerFunction).toBeDefined();
    const body = functionBody(triggerFunction!);
    expect(body).toContain('FROM public.islemler');
    expect(body).toContain('FROM public.ileri_tarihli_islemler');
    expect(body).toMatch(
      /OLD\.is_active IS TRUE[\s\S]*?NEW\.is_active IS NOT TRUE/
    );
    expect(body).not.toContain('NEW.is_active IS FALSE');
    expect(body).toContain('CATEGORY_ACTIVE_STATE_REQUIRED');
    const archiveTransition = body.indexOf('NEW.is_active IS NOT TRUE');
    const linkedRowGuard = body.indexOf('FROM public.islemler');
    const nullStateRejection = body.lastIndexOf(
      'CATEGORY_ACTIVE_STATE_REQUIRED'
    );
    expect(archiveTransition).toBeGreaterThanOrEqual(0);
    expect(linkedRowGuard).toBeGreaterThan(archiveTransition);
    expect(nullStateRejection).toBeGreaterThan(linkedRowGuard);
    expect(sql).toMatch(
      /CREATE TRIGGER\s+\S+\s+BEFORE UPDATE OF is_active[\s\S]*?ON public\.kategoriler[\s\S]*?EXECUTE FUNCTION\s+internal\./
    );
    expect(revokedPrincipals(`${triggerFunction!}()`)).toEqual(
      expect.arrayContaining(['public', 'anon', 'authenticated', 'service_role'])
    );
  });

  it('rejects NULL category state and keeps manager direct writes active-only', () => {
    const insertGate = policyDefinition(
      'Permission v2 category insert state gate'
    );
    const updateGate = policyDefinition(
      'Permission v2 category update state gate'
    );

    for (const policy of [insertGate, updateGate]) {
      expect(policy).toContain('AS RESTRICTIVE');
      expect(policy).toContain('kategoriler.is_active IS NOT NULL');
      expect(policy).toContain('kategoriler.is_active IS TRUE');
      expect(policy).toContain('internal.isletme_sahibi_v1(');
    }
    expect(updateGate).toContain('USING (true)');

    const archiveRpc = functionBody('public.archive_kategori_atomik');
    expect(archiveRpc).toContain("member.role = 'manager'");
    expect(archiveRpc).toContain('SET is_active = false');
    expect(archiveRpc).toContain('CATEGORY_HAS_TRANSACTIONS');
  });

  it('makes tenant row identity immutable on every direct shared update surface', () => {
    const genericGuard = functionBody(
      'internal.enforce_tenant_row_identity_immutable_v1'
    );
    expect(genericGuard).toContain('NEW.id IS DISTINCT FROM OLD.id');
    expect(genericGuard).toContain(
      'NEW.isletme_id IS DISTINCT FROM OLD.isletme_id'
    );
    expect(genericGuard).toContain('TENANT_ROW_IDENTITY_IMMUTABLE');

    const movementGuard = functionBody(
      'internal.enforce_product_movement_identity_immutable_v1'
    );
    for (const field of ['id', 'isletme_id', 'urun_id', 'islem_id']) {
      expect(movementGuard).toContain(
        `NEW.${field} IS DISTINCT FROM OLD.${field}`
      );
    }
    expect(movementGuard).toContain('PRODUCT_MOVEMENT_IDENTITY_IMMUTABLE');

    const businessCascade = movementGuard.match(
      /IF NOT EXISTS \([\s\S]*?FROM public\.isletmeler AS business[\s\S]*?business\.id = OLD\.isletme_id[\s\S]*?THEN\s+RETURN NEW;\s+END IF;/
    )?.[0];
    expect(businessCascade).toBeDefined();

    const fkCleanupStart = movementGuard.indexOf(
      'IF (NEW.id, NEW.isletme_id, NEW.urun_id)'
    );
    const genericRejectStart = movementGuard.indexOf(
      'IF NEW.id IS DISTINCT FROM OLD.id'
    );
    expect(fkCleanupStart).toBeGreaterThanOrEqual(0);
    expect(genericRejectStart).toBeGreaterThan(fkCleanupStart);
    const fkCleanup = movementGuard.slice(
      fkCleanupStart,
      genericRejectStart
    );
    expect(fkCleanup).toContain(
      'IS NOT DISTINCT FROM (OLD.id, OLD.isletme_id, OLD.urun_id)'
    );
    expect(fkCleanup).toContain('OLD.islem_id IS NOT NULL');
    expect(fkCleanup).toContain('NEW.islem_id IS NULL');
    expect(fkCleanup).toContain('AND NOT EXISTS (');
    expect(fkCleanup).toContain('FROM public.islemler AS transaction_row');
    expect(fkCleanup).toContain('transaction_row.id = OLD.islem_id');
    expect(fkCleanup).toContain(
      'transaction_row.isletme_id = OLD.isletme_id'
    );
    expect(fkCleanup).toContain('RETURN NEW');
    expect(genericRejectStart).toBeLessThan(
      movementGuard.indexOf('PRODUCT_MOVEMENT_IDENTITY_IMMUTABLE')
    );

    const triggerTables = [
      'hesaplar',
      'cariler',
      'personel',
      'urunler',
      'kategoriler',
      'ileri_tarihli_islemler',
      'urun_hareketler',
    ];
    for (const table of triggerTables) {
      expect(sql).toMatch(
        new RegExp(
          `CREATE TRIGGER trg_permission_v2_identity_immutable_${table}[\\s\\S]*?BEFORE UPDATE ON public\\.${table}[\\s\\S]*?EXECUTE FUNCTION internal\\.enforce_(?:tenant_row|product_movement)_identity_immutable_v1\\(\\);`
        )
      );
    }
    expect(sql).not.toContain(
      'trg_permission_v2_identity_immutable_notlar'
    );
    expect(sql).not.toContain(
      'trg_permission_v2_identity_immutable_islemler'
    );

    const transactionGuard = functionBody(
      'internal.enforce_islem_source_mutation_v2'
    );
    expect(transactionGuard).toMatch(
      /\(NEW\.id, NEW\.isletme_id, NEW\.created_by\)[\s\S]*?IS DISTINCT FROM \(OLD\.id, OLD\.isletme_id, OLD\.created_by\)/
    );
  });

  it('allows only genuine FK cleanup for linked movement detach and tenant cascades', () => {
    const linkedGuard = functionBody(
      'internal.enforce_linked_product_movement_permission_v1'
    );
    const cleanupStart = linkedGuard.indexOf(
      "IF TG_OP = 'UPDATE'\n     AND OLD.islem_id IS NOT NULL"
    );
    const ordinaryProductGate = linkedGuard.indexOf(
      "IF TG_OP <> 'DELETE' AND NOT EXISTS"
    );
    expect(cleanupStart).toBeGreaterThanOrEqual(0);
    expect(ordinaryProductGate).toBeGreaterThan(cleanupStart);
    const cleanup = linkedGuard.slice(cleanupStart, ordinaryProductGate);
    expect(cleanup).toContain('NEW.islem_id IS NULL');
    expect(cleanup).toContain(
      'IS NOT DISTINCT FROM (OLD.id, OLD.isletme_id, OLD.urun_id)'
    );
    expect(cleanup).toContain(
      "ARRAY['islem_id', 'updated_by']::text[]"
    );
    expect(cleanup).toContain('pg_catalog.to_jsonb(NEW)');
    expect(cleanup).toContain('pg_catalog.to_jsonb(OLD)');
    expect(cleanup).toContain('AND NOT EXISTS (');
    expect(cleanup).toContain('FROM public.islemler AS transaction_row');
    expect(cleanup).toContain('transaction_row.id = OLD.islem_id');
    expect(cleanup).toContain(
      'transaction_row.isletme_id = OLD.isletme_id'
    );
    expect(cleanup).toContain('RETURN NEW');

    const transactionGuard = functionBody(
      'internal.enforce_islem_source_mutation_v2'
    );
    const transactionCascade = transactionGuard.match(
      /IF TG_OP = 'DELETE' AND NOT EXISTS \([\s\S]*?FROM public\.isletmeler AS business[\s\S]*?business\.id = OLD\.isletme_id[\s\S]*?THEN\s+RETURN OLD;\s+END IF;/
    )?.[0];
    expect(transactionCascade).toBeDefined();
    expect(transactionGuard.indexOf(transactionCascade!)).toBeLessThan(
      transactionGuard.indexOf("IF TG_OP = 'INSERT' THEN")
    );
    expect(transactionGuard).toContain('ISLEM_CANONICAL_RPC_REQUIRED');
  });

  it('blocks hard deletes only when core ledger references still exist', () => {
    const guard = functionBody(
      'internal.enforce_entity_delete_references_v1'
    );

    expect(guard).toMatch(
      /NOT EXISTS \([\s\S]*?FROM public\.isletmeler[\s\S]*?business\.id = OLD\.isletme_id[\s\S]*?RETURN OLD/
    );

    const accountBranch = guard.match(
      /WHEN 'hesaplar' THEN([\s\S]*?)WHEN 'cariler' THEN/
    )?.[1];
    expect(accountBranch).toBeDefined();
    expect(accountBranch).toContain('FROM public.islemler');
    expect(accountBranch).toContain('transaction_row.isletme_id = OLD.isletme_id');
    expect(accountBranch).toContain('transaction_row.hesap_id = OLD.id');
    expect(accountBranch).toContain('transaction_row.hedef_hesap_id = OLD.id');
    expect(accountBranch).toContain('FROM public.ileri_tarihli_islemler');
    expect(accountBranch).toContain('scheduled_row.isletme_id = OLD.isletme_id');
    expect(accountBranch).toContain('scheduled_row.hesap_id = OLD.id');
    expect(accountBranch).toContain('scheduled_row.hedef_hesap_id = OLD.id');
    expect(accountBranch).toContain('FROM public.cekler');
    expect(accountBranch).toContain('cheque_row.isletme_id = OLD.isletme_id');
    expect(accountBranch).toContain('cheque_row.hesap_id = OLD.id');
    expect(accountBranch).toContain('FROM public.nakit_avanslar');
    expect(accountBranch).toContain('advance_row.isletme_id = OLD.isletme_id');
    expect(accountBranch).toContain('advance_row.kredi_karti_id = OLD.id');
    expect(accountBranch).toContain('advance_row.hedef_hesap_id = OLD.id');
    expect(accountBranch).toContain('ACCOUNT_HAS_LINKED_RECORDS');

    const customerBranch = guard.match(
      /WHEN 'cariler' THEN([\s\S]*?)WHEN 'personel' THEN/
    )?.[1];
    expect(customerBranch).toBeDefined();
    for (const table of [
      'islemler',
      'ileri_tarihli_islemler',
      'cari_links',
      'cekler',
      'irsaliye_records',
      'taksit_planlari',
      'islem_tahsis',
    ]) {
      expect(customerBranch).toContain(`FROM public.${table}`);
    }
    expect(customerBranch).toContain(
      'transaction_row.isletme_id = OLD.isletme_id'
    );
    expect(customerBranch).toContain(
      'scheduled_row.isletme_id = OLD.isletme_id'
    );
    expect(customerBranch).toContain(
      'link_row.owner_isletme_id = OLD.isletme_id'
    );
    expect(customerBranch).toContain(
      'cheque_row.isletme_id = OLD.isletme_id'
    );
    expect(customerBranch).toContain(
      'dispatch_row.isletme_id = OLD.isletme_id'
    );
    expect(customerBranch).toContain(
      'plan_row.isletme_id = OLD.isletme_id'
    );
    expect(customerBranch).toContain(
      'allocation_row.isletme_id = OLD.isletme_id'
    );
    expect(customerBranch).toContain('CUSTOMER_HAS_LINKED_RECORDS');

    const personnelBranch = guard.match(
      /WHEN 'personel' THEN([\s\S]*?)WHEN 'urunler' THEN/
    )?.[1];
    expect(personnelBranch).toBeDefined();
    expect(personnelBranch).toContain('FROM public.islemler');
    expect(personnelBranch).toContain(
      'transaction_row.isletme_id = OLD.isletme_id'
    );
    expect(personnelBranch).toContain('transaction_row.personel_id = OLD.id');
    expect(personnelBranch).toContain('FROM public.ileri_tarihli_islemler');
    expect(personnelBranch).toContain(
      'scheduled_row.isletme_id = OLD.isletme_id'
    );
    expect(personnelBranch).toContain('scheduled_row.personel_id = OLD.id');
    expect(personnelBranch).toContain('PERSONNEL_HAS_LINKED_RECORDS');

    const productBranch = guard.match(
      /WHEN 'urunler' THEN([\s\S]*?)ELSE/
    )?.[1];
    expect(productBranch).toBeDefined();
    expect(productBranch).toContain('FROM public.urun_hareketler');
    expect(productBranch).toContain(
      'movement_row.isletme_id = OLD.isletme_id'
    );
    expect(productBranch).toContain('movement_row.urun_id = OLD.id');
    expect(productBranch).toContain('movement_row.islem_id IS NOT NULL');
    expect(productBranch).toContain('PRODUCT_HAS_LINKED_TRANSACTIONS');

    const assertAtomicNoteDetach = (
      branch: string | undefined,
      markerType: 'hesap' | 'cari' | 'personel' | 'urun',
      entityPredicate: RegExp,
    ) => {
      expect(branch).toBeDefined();
      const referenceGuardEnd = branch!.indexOf('END IF;');
      const contextStart = branch!.indexOf(
        "'internal.permission_v2_note_detach_context'"
      );
      const noteDetachStart = branch!.indexOf('UPDATE public.notlar');
      const contextReset = branch!.indexOf(
        "'internal.permission_v2_note_detach_context'",
        contextStart + 1,
      );
      const branchReturn = branch!.indexOf('RETURN OLD;');

      expect(referenceGuardEnd).toBeGreaterThan(-1);
      expect(contextStart).toBeGreaterThan(referenceGuardEnd);
      expect(noteDetachStart).toBeGreaterThan(contextStart);
      expect(contextReset).toBeGreaterThan(noteDetachStart);
      expect(branchReturn).toBeGreaterThan(contextReset);
      expect(branch).toContain(
        `OLD.isletme_id::text || ':${markerType}:' || OLD.id::text`
      );
      expect(branch).toMatch(
        /UPDATE public\.notlar\s+SET entity_type = 'genel',\s+entity_id = NULL,\s+updated_at = clock_timestamp\(\)\s+WHERE isletme_id = OLD\.isletme_id/s
      );
      expect(branch).toMatch(entityPredicate);
      expect(branch).toMatch(
        /PERFORM pg_catalog\.set_config\(\s*'internal\.permission_v2_note_detach_context',\s*'',\s*true\s*\);\s+RETURN OLD;/s
      );
    };

    assertAtomicNoteDetach(
      accountBranch,
      'hesap',
      /AND entity_type = 'hesap'\s+AND entity_id = OLD\.id;/s,
    );
    assertAtomicNoteDetach(
      customerBranch,
      'cari',
      /AND entity_type = 'cari'\s+AND entity_id = OLD\.id;/s,
    );
    assertAtomicNoteDetach(
      personnelBranch,
      'personel',
      /AND entity_type IN \('personel', 'personel_izin'\)\s+AND entity_id = OLD\.id;/s,
    );
    assertAtomicNoteDetach(
      productBranch,
      'urun',
      /AND entity_type = 'urun'\s+AND entity_id = OLD\.id;/s,
    );

    const tenantCascadeGate = guard.match(
      /IF NOT EXISTS \(\s*SELECT 1\s*FROM public\.isletmeler AS business\s*WHERE business\.id = OLD\.isletme_id\s*\) THEN\s*RETURN OLD;\s*END IF;/
    )?.[0];
    expect(tenantCascadeGate).toBeDefined();
    expect(guard.indexOf(tenantCascadeGate!)).toBeLessThan(
      guard.indexOf("WHEN 'hesaplar' THEN")
    );

    expect(guard.match(/ERRCODE = '23503'/g)).toHaveLength(4);
    for (const intentionallyExcludedTable of [
      'cari_share_codes',
      'cari_ekstre_links',
      'cari_aliases',
      'urun_aliases',
    ]) {
      expect(guard).not.toContain(intentionallyExcludedTable);
    }

    const triggerTables = ['hesaplar', 'cariler', 'personel', 'urunler'];
    for (const table of triggerTables) {
      expect(sql).toMatch(
        new RegExp(
          `CREATE TRIGGER trg_permission_v2_delete_reference_guard_${table}[\\s\\S]*?BEFORE DELETE ON public\\.${table}[\\s\\S]*?EXECUTE FUNCTION internal\\.enforce_entity_delete_references_v1\\(\\);`
        )
      );
    }
  });

  it('serializes contextual note attachment and blocks old-client direct detach', () => {
    const definition = functionDefinition('public.enforce_notlar_identity_v1');
    const body = functionBody('public.enforce_notlar_identity_v1');

    expect(definition).toContain('CREATE OR REPLACE FUNCTION');
    expect(definition).toContain('SECURITY DEFINER');
    expect(definition).toContain("SET search_path TO 'pg_catalog'");
    expect(body.match(/FOR KEY SHARE/g)).toHaveLength(4);
    expect(body).toMatch(
      /WHEN 'hesap' THEN[\s\S]*?FROM public\.hesaplar AS account_row[\s\S]*?FOR KEY SHARE/
    );
    expect(body).toMatch(
      /WHEN 'cari' THEN[\s\S]*?FROM public\.cariler AS cari_row[\s\S]*?FOR KEY SHARE/
    );
    expect(body).toMatch(
      /WHEN 'personel', 'personel_izin' THEN[\s\S]*?FROM public\.personel AS employee_row[\s\S]*?FOR KEY SHARE/
    );
    expect(body).toMatch(
      /WHEN 'urun' THEN[\s\S]*?FROM public\.urunler AS product_row[\s\S]*?FOR KEY SHARE/
    );
    expect(body).toMatch(
      /v_user_id IS NOT NULL[\s\S]*?OLD\.entity_type IN \(\s*'hesap', 'cari', 'personel', 'personel_izin', 'urun'\s*\)[\s\S]*?NEW\.entity_type = 'genel'[\s\S]*?NEW\.entity_id IS NULL[\s\S]*?current_setting\([\s\S]*?'internal\.permission_v2_note_detach_context'[\s\S]*?NOTLAR_DIRECT_ENTITY_DETACH_FORBIDDEN[\s\S]*?ERRCODE = '42501'/s
    );
    expect(body.indexOf('NOTLAR_INVALID_TENANT_CONTEXT')).toBeLessThan(
      body.indexOf('NOTLAR_DIRECT_ENTITY_DETACH_FORBIDDEN')
    );
    expect(body).toContain(
      "WHEN OLD.entity_type = 'personel_izin' THEN 'personel'"
    );
    expect(revokedPrincipals('public.enforce_notlar_identity_v1()')).toEqual(
      expect.arrayContaining(['public', 'anon', 'authenticated', 'service_role'])
    );

    const postcondition = sql.slice(sql.indexOf('DO $postcondition$'));
    expect(postcondition).toContain('trg_notlar_enforce_identity_v1');
    expect(postcondition).toContain('public.enforce_notlar_identity_v1()');
    expect(postcondition).toContain("'FOR KEY SHARE'");
    expect(postcondition).toContain("'%UPDATE public.notlar%'");
    expect(postcondition).toContain("'%SET entity_type = ''genel''%'");
    expect(postcondition).toContain("'%entity_id = NULL%'");
  });

  it('treats archived active detail records as visible when their module is open', () => {
    const detailFunctions = [
      'public.get_cari_islem_satirlari_v1',
      'public.get_personel_islem_satirlari_v1',
      'public.get_hesap_islem_satirlari_v1',
    ];

    for (const functionName of detailFunctions) {
      const body = functionBody(functionName);
      expect(body).toMatch(
        /IF NOT v_is_owner THEN[\s\S]*?v_can_see_archived\s*:=\s*true[\s\S]*?v_can_see_passive\s*:=\s*false/
      );
      expect(body).toMatch(/\bis_active IS TRUE\b/);
      expect(body).toMatch(/\bv_is_owner\b/);
    }
  });

  it('removes PUBLIC and anon execution from invite and Cari-sharing endpoints', () => {
    const authenticatedEndpoints = [
      'public.create_isletme_invite(uuid,text,text,jsonb,text)',
      'public.create_isletme_invite_v2(uuid,text,text,jsonb,text,text)',
      'public.accept_isletme_invite(text)',
      'public.generate_cari_share_code(uuid,uuid,text)',
      'public.accept_cari_share_code(text,uuid,text)',
      'public.remove_cari_link(uuid,uuid)',
    ];

    for (const identity of authenticatedEndpoints) {
      expect(revokedPrincipals(identity)).toEqual(expect.arrayContaining(['public', 'anon']));
      expect(grantedPrincipals(identity)).toContain('authenticated');
    }
  });

  it('has fail-closed postconditions for functions, ACLs, policies and triggers', () => {
    expect(sql).toContain('DO $postcondition$');
    expect(sql).toContain('PERMISSION_V2_POSTCONDITION_MISSING');
    expect(sql).toContain('PERMISSION_V2_POSTCONDITION_ACL');
    expect(sql).toContain('PERMISSION_V2_POSTCONDITION_INTERNAL_ACTION_ACL');
    expect(sql).toContain('internal.permission_v2_movement_action_context');
    expect(sql).toContain('PERMISSION_V2_POSTCONDITION_POLICY_OR_TRIGGER');

    const postcondition = sql.slice(sql.indexOf('DO $postcondition$'));
    const normalizedPostcondition = postcondition.replace(/\s+/g, '');
    const criticalIdentities = [
      'internal.apply_balance_ops_v2(uuid,jsonb)',
      'internal.islem_satiri_okunabilir_v2(uuid,text,uuid,uuid,uuid,uuid)',
      'internal.islem_birikim_bacaklari_okunabilir_v1(uuid,uuid,uuid)',
      'internal.islem_ham_satiri_okunabilir_v1(uuid,text,uuid,uuid,uuid,uuid)',
      'internal.apply_islem_update_canonical_v2(uuid,uuid,jsonb,jsonb)',
      'internal.delete_islem_canonical_v2(uuid,uuid)',
      'internal.get_islem_mutation_row_v1(uuid,uuid,text,boolean)',
      'internal.enforce_islem_source_mutation_v2()',
      'internal.enforce_category_archive_guard_v2()',
      'internal.enforce_owner_only_active_toggle_v1()',
      'internal.enforce_tenant_row_identity_immutable_v1()',
      'internal.enforce_product_movement_identity_immutable_v1()',
      'internal.enforce_entity_delete_references_v1()',
      'public.enforce_notlar_identity_v1()',
      'internal.consume_code_attempt_v2(text)',
      'public.create_islem_atomik(uuid,jsonb,jsonb)',
      'public.create_islem_with_urun_atomik(uuid,jsonb,jsonb,jsonb)',
      'public.update_islem_atomik(uuid,uuid,jsonb,jsonb)',
      'public.delete_islem_atomik(uuid,uuid,jsonb)',
      'public.taksit_plani_olustur(uuid,jsonb,jsonb,jsonb)',
      'public.create_islem_atomik_v2(uuid,jsonb)',
      'public.create_cari_nakit_islem_atomik(uuid,uuid,text,numeric,timestampwithouttimezone,uuid,uuid,text,uuid,numeric,uuid)',
      'public.update_islem_atomik_v2(uuid,uuid,jsonb)',
      'public.delete_islem_atomik_v2(uuid,uuid)',
      'public.undo_import_batch(uuid[])',
      'public.increment_balance(text,uuid,numeric)',
      'public.update_urun_miktar(uuid,numeric,uuid)',
      'public.create_urun_hareket_atomik_v2(uuid,jsonb)',
      'public.update_urun_hareket_atomik_v2(uuid,uuid,jsonb)',
      'public.delete_urun_hareket_atomik_v2(uuid,uuid)',
      'public.perform_nakit_avans(uuid,uuid,uuid,numeric,numeric,uuid,text,timestampwithtimezone,boolean,integer)',
      'public.perform_taksit_odeme(uuid,uuid,uuid)',
      'public.delete_nakit_avans_with_reversal(uuid,uuid)',
      'public.complete_ileri_tarihli_islem_atomik(uuid,uuid,numeric,text,timestampwithouttimezone)',
      'public.archive_kategori_atomik(uuid,uuid)',
      'public.not_guncelle_v1(uuid,uuid,jsonb)',
      'public.set_urun_miktar_hedef(uuid,uuid,numeric,timestampwithtimezone,text)',
      'public.get_islem_mutation_context_v1(uuid,uuid,text)',
      'public.get_urun_hareket_minimal_cari_labels(uuid,uuid)',
      'public.get_personel_izin_kotalari_v1(uuid)',
      'public.get_transaction_creator_labels(uuid)',
      'public.ekstre_link_iptal(uuid,uuid)',
      'public.get_cari_ozet(uuid,uuid)',
      'public.get_personel_ozet(uuid,uuid)',
      'public.get_urun_ozet(uuid,uuid)',
      'public.get_balance_activity_report(uuid)',
      'public._vade_birim_mahsuplu(uuid,uuid)',
      'public.get_cari_vade_rozet(uuid)',
      'public.get_vade_listesi(uuid)',
      'public.get_vade_ozet(uuid)',
      'public.get_cari_vade_detay(uuid,uuid)',
      'public.get_cari_islem_kalan(uuid,uuid)',
      'public.get_taksit_plan_listesi(uuid)',
      'public.get_cari_taksit_kalan(uuid,uuid)',
      'public.ekstre_link_olustur(uuid,uuid,integer)',
      'public.cari_ekstre_token_dogrula_v1(text)',
      'public.check_rate_limit(uuid,text,integer)',
      'public.record_api_usage(uuid,text)',
      'public.get_remaining_usage(uuid,text,integer)',
      'public.create_isletme_invite(uuid,text,text,jsonb,text)',
      'public.create_isletme_invite_v2(uuid,text,text,jsonb,text,text)',
      'public.accept_isletme_invite(text)',
      'public.generate_cari_share_code(uuid,uuid,text)',
      'public.accept_cari_share_code(text,uuid,text)',
      'public.remove_cari_link(uuid,uuid)',
      'public.get_income_expense_summary(uuid,timestampwithtimezone,timestampwithtimezone)',
      'public.get_income_by_source_v2(uuid,timestampwithtimezone,timestampwithtimezone)',
      'public.get_category_report(uuid,text[],timestampwithtimezone,timestampwithtimezone)',
      'public.get_product_report(uuid,timestampwithtimezone,timestampwithtimezone,text[])',
      'public.get_income_by_source(uuid,timestampwithtimezone,timestampwithtimezone)',
    ];
    for (const identity of criticalIdentities) {
      expect(normalizedPostcondition).toContain(identity);
    }

    const transactionPhotoHelpers = [
      ...functionNamesMatching(/^internal\.storage_.*photo_(?:select|delete)_allowed/i),
    ].filter((name) => functionBody(name).includes('FROM public.islemler'));
    expect(transactionPhotoHelpers).toHaveLength(2);
    for (const helper of transactionPhotoHelpers) {
      expect(postcondition).toContain(`${helper}(`);
    }
    expect(postcondition).toContain('internal.permission_v2_code_attempts');
    expect(postcondition).toContain('internal.permission_v2_code_attempts_id_seq');
    expect(postcondition).toContain('ISLEM_CANONICAL_RPC_REQUIRED');
    expect(postcondition.match(/permission_v2_movement_action_context/g)?.length).toBeGreaterThanOrEqual(4);
    expect(postcondition).toContain('create_cari_nakit_islem_atomik');
    expect(postcondition).toContain(
      'public.create_islem_atomik(uuid,jsonb,jsonb)'
    );
    expect(postcondition).toContain(
      'public.update_islem_atomik(uuid,uuid,jsonb,jsonb)'
    );
    expect(postcondition).toContain("hesap.type::text <> ''birikim''");
    expect(postcondition).toContain(
      'public.get_urun_hareket_kaynak_etiketleri_v1(uuid,uuid,integer)'
    );
    expect(postcondition).toContain('v_can_view_personnel IS NOT TRUE');
    expect(postcondition).toContain('islem_ham_satiri_okunabilir_v1');
    expect(postcondition).toContain('islem_birikim_bacaklari_okunabilir_v1');
    expect(postcondition).toContain(
      "%hesap.type::text <> ''birikim''%OR v_can_view_birikim IS TRUE%OR v_reports IS TRUE%"
    );
    expect(postcondition).toContain('PRODUCT_MOVEMENT_INVALID_LINKED_PAYLOAD');
    expect(postcondition).toContain(
      "v_context_action NOT IN (''create'', ''update'', ''delete'')"
    );
    expect(postcondition).toContain('v_opened_movement_delete_context');
    expect(postcondition).toContain(
      'DELETE FROM public.urun_hareketler AS movement_row'
    );
    expect(postcondition).toContain(
      'DELETE FROM internal.permission_v2_movement_action_context'
    );
    expect(postcondition).toContain('public.undo_import_batch(uuid[])');
    expect(postcondition).toContain(
      'v_locked_product_count <> v_expected_product_count'
    );
    expect(postcondition).toContain(
      'v_updated_product_count <> v_expected_product_count'
    );
    expect(postcondition).toContain(
      'v_inserted_context_count <> v_input_count'
    );
    expect(postcondition).toContain('deleted_count <> v_input_count');
    expect(postcondition).toContain(
      'v_deleted_context_count <> v_input_count'
    );
    expect(postcondition).toContain("procedure_row.provolatile");
    expect(postcondition).toContain("product.is_archived IS TRUE");
    expect(postcondition).toContain('NEW.is_active IS NOT TRUE');
    expect(postcondition).toContain('CATEGORY_ACTIVE_STATE_REQUIRED');
    expect(postcondition).toContain(
      'Permission v2 category insert state gate'
    );
    expect(postcondition).toContain(
      'Permission v2 category update state gate'
    );
    expect(postcondition).toContain(
      'NEW.isletme_id IS DISTINCT FROM OLD.isletme_id'
    );
    expect(postcondition).toContain(
      'NEW.urun_id IS DISTINCT FROM OLD.urun_id'
    );
    expect(postcondition).toContain(
      'trg_permission_v2_identity_immutable_urun_hareketler'
    );
    expect(postcondition).toContain('ACCOUNT_HAS_LINKED_RECORDS');
    expect(postcondition).toContain('CUSTOMER_HAS_LINKED_RECORDS');
    expect(postcondition).toContain('PERSONNEL_HAS_LINKED_RECORDS');
    expect(postcondition).toContain('PRODUCT_HAS_LINKED_TRANSACTIONS');
    expect(postcondition).toContain('movement_row.islem_id IS NOT NULL');
    expect(postcondition).toContain(
      'trg_permission_v2_delete_reference_guard_hesaplar'
    );
    expect(postcondition).toContain(
      'trg_permission_v2_delete_reference_guard_cariler'
    );
    expect(postcondition).toContain(
      'trg_permission_v2_delete_reference_guard_personel'
    );
    expect(postcondition).toContain(
      'trg_permission_v2_delete_reference_guard_urunler'
    );
    expect(postcondition).toContain(
      'NOT internal.isletme_sahibi_v1(p_isletme_id)'
    );
    expect(postcondition).toContain(
      'miktar IS NOT DISTINCT FROM 0'
    );
    expect(postcondition).toContain(
      'NOT (miktar IS DISTINCT FROM (0)::numeric)'
    );
    expect(postcondition).toContain('has_column_privilege');
    expect(postcondition).toContain('has_any_column_privilege');
    expect(postcondition).toContain(
      'Permission v2 direct insert urun hareketleri owner only'
    );
    expect(postcondition).toContain(
      'Permission v2 direct update urun hareketleri owner only'
    );
    expect(postcondition).toContain(
      'Permission v2 direct delete urun hareketleri owner only'
    );
    expect(postcondition).toContain(
      'PERMISSION_V2_POSTCONDITION_ATOMIC_MOVEMENT_ACL'
    );
    expect(postcondition).toContain('product.is_active IS NOT TRUE');
    expect(postcondition).toContain('product.is_archived IS NOT FALSE');
    expect(postcondition).toContain('immediate FK cascade');
    expect(postcondition).toContain('Business hard-delete cascades');
    expect(postcondition).toContain(
      'Deleting the tenant root cascades to islemler'
    );
    expect(postcondition).toContain('FROM public.isletmeler AS business');
    expect(postcondition).toContain('OLD.islem_id IS NOT NULL');
    expect(postcondition).toContain('NEW.islem_id IS NULL');
    expect(postcondition).toContain(
      'IS NOT DISTINCT FROM (OLD.id, OLD.isletme_id, OLD.urun_id)'
    );
    expect(postcondition).toContain(
      "ARRAY[''islem_id'', ''updated_by'']"
    );
    expect(postcondition).toMatch(/\)\s*<> 7/);
    expect(postcondition).toMatch(/\)\s*<> 4/);
    expect(postcondition).toMatch(/\)\s*<> 3/);
    expect(postcondition).toMatch(/\)\s*<> 16/);
    expect(postcondition).toMatch(
      /(?:permission_v2_code_attempts[\s\S]{0,1200}has_table_privilege|has_table_privilege[\s\S]{0,1200}permission_v2_code_attempts)/
    );
    expect(postcondition).toMatch(
      /(?:permission_v2_code_attempts_id_seq[\s\S]{0,1200}has_sequence_privilege|has_sequence_privilege[\s\S]{0,1200}permission_v2_code_attempts_id_seq)/
    );
    expect(postcondition).toMatch(/trg_.*(?:kategori|category).*(?:arsiv|archive|active)/i);

    expect(sql.indexOf('DO $postcondition$')).toBeLessThan(sql.lastIndexOf('COMMIT;'));
  });
});
