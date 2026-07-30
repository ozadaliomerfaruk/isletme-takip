import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260730233552_product_mutation_v3_contract_compatibility.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const updateHook = fs.readFileSync(
  path.resolve(process.cwd(), 'src/hooks/useIslemler.ts'),
  'utf8',
);

function stripSqlBodiesAndComments(source: string): string {
  return source
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*|)\$[\s\S]*?\$\1\$/g, '$BODY$')
    .replace(/--.*$/gm, '');
}

describe('product mutation V3 contract compatibility migration', () => {
  it('is additive at the database boundary and never rewrites user rows', () => {
    expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(sql.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(sql).toContain("SET LOCAL lock_timeout = '2s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '120s';");

    const topLevel = stripSqlBodiesAndComments(sql);
    expect(topLevel).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION)\b/i);
    expect(topLevel).not.toMatch(/\bTRUNCATE\b/i);
    expect(topLevel).not.toMatch(
      /\b(INSERT|UPDATE|DELETE)\s+(INTO\s+|FROM\s+)?public\./i,
    );
    expect(topLevel).not.toMatch(/\bALTER\s+TABLE\s+public\./i);
  });

  it('patches only the four protected product definitions and fails on drift', () => {
    expect(sql).toContain(
      "'internal.reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)'::regprocedure",
    );
    expect(sql).toContain(
      "'public.update_cari_urunlu_islem_atomik_v3(uuid,uuid,jsonb,jsonb)'::regprocedure",
    );
    expect(sql).toContain(
      "'public.create_islem_with_urun_atomik(uuid,jsonb,jsonb,jsonb)'::regprocedure",
    );
    expect(sql).toContain(
      "'internal.enforce_linked_product_movement_permission_v1()'::regprocedure",
    );
    expect(sql.match(/_DRIFT'/g)?.length).toBeGreaterThanOrEqual(14);
    expect(sql.match(/EXECUTE v_def;/g)).toHaveLength(4);
    expect(sql).not.toMatch(
      /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+(?:internal\.reapply_cari_urun_items_v3|public\.update_cari_urunlu_islem_atomik_v3|public\.create_islem_with_urun_atomik|internal\.enforce_linked_product_movement_permission_v1)/i,
    );
  });

  it('supports both productful-to-productless and itemless-to-productful edits', () => {
    expect(sql).toMatch(
      /AND pg_catalog\.jsonb_array_length\(p_items\) <> 0\s+\) THEN/,
    );
    expect(sql).toContain(
      'ELSIF pg_catalog.jsonb_array_length(p_items) <> 0 THEN',
    );
    expect(sql).toContain("'CARI_PRODUCT_V3_INVALID_INPUT'");
    expect(sql).toContain("'[]'::jsonb");
    expect(sql).toContain('FROM public.update_islem_atomik_v2(');
    expect(sql).toContain(
      'unexpected_movement.islem_id = p_islem_id',
    );
    expect(sql).toContain('IF v_old.type::text IN (');
    expect(sql).toContain(
      'v_old.type::text NOT IN (',
    );
    expect(sql).toContain(
      'AND v_new_type NOT IN (',
    );
    expect(sql).toContain(
      "'PRODUCT_EDIT_V3_HISTORY_OLD_TYPE_GATE_DRIFT'",
    );
    expect(sql).toContain(
      "'PRODUCT_EDIT_V3_HISTORY_CONDITIONAL_CLEAR_DRIFT'",
    );

    const firstClear = sql.indexOf("'[]'::jsonb");
    const transactionUpdate = sql.indexOf(
      'FROM public.update_islem_atomik_v2(',
    );
    const conditionalFinalReapply = sql.indexOf(
      'IF v_result.type IN (',
    );
    expect(firstClear).toBeLessThan(transactionUpdate);
    expect(transactionUpdate).toBeLessThan(conditionalFinalReapply);
  });

  it('keeps unsupported-to-unsupported edits closed in client and server', () => {
    expect(updateHook).toContain(
      'const oldTypeSupportsProductV3 =',
    );
    expect(updateHook).toContain(
      'const updatedTypeSupportsProductV3 =',
    );
    expect(updateHook).toContain(
      '!oldTypeSupportsProductV3',
    );
    expect(updateHook).toContain(
      '&& !updatedTypeSupportsProductV3',
    );
    expect(updateHook).toContain(
      '!updatedTypeSupportsProductV3',
    );
    expect(updateHook).toContain('&& !removesAllProductItems');
    expect(sql).toMatch(
      /v_old\.type::text NOT IN \([\s\S]*?AND v_new_type NOT IN \(/,
    );
  });

  it('limits inactive or archived history preservation to the owner and old ids', () => {
    expect(sql).toContain(
      'v_is_owner := internal.isletme_sahibi_v1(p_isletme_id);',
    );
    expect(sql).toContain('INTO v_existing_ids');
    expect(sql).toContain('FROM public.urun_hareketler AS movement');
    expect(sql).toContain("p_authorization_action = 'update'");
    expect(sql).toContain('v_is_owner IS TRUE');
    expect(sql).toContain('product.id = ANY(v_existing_ids)');
    expect(sql).toContain(
      'FROM internal.product_edit_v3_history_context',
    );
    expect(sql).toContain(
      'history_context.actor_user_id = auth.uid()',
    );
    expect(sql).toContain('product.is_active IS TRUE');
    expect(sql).toContain('product.is_archived IS FALSE');
    expect(sql).not.toContain(
      "p_authorization_action = 'update'\n          AND product.id = ANY(v_existing_ids)",
    );
  });

  it('carries old ids across both inner calls in a private transaction context', () => {
    expect(sql).toContain(
      'CREATE TABLE internal.product_edit_v3_history_context',
    );
    expect(sql).toContain('backend_pid integer NOT NULL');
    expect(sql).toContain('transaction_id bigint NOT NULL');
    expect(sql).toContain('actor_user_id uuid NOT NULL');
    expect(sql).toContain('INSERT INTO internal.product_edit_v3_history_context');
    expect(sql).toContain('DELETE FROM internal.product_edit_v3_history_context');
    expect(sql).toContain('pg_catalog.pg_backend_pid()');
    expect(sql).toContain('pg_catalog.txid_current()');
    expect(sql).toMatch(
      /REVOKE ALL\s+ON TABLE internal\.product_edit_v3_history_context\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
  });

  it('preserves SECURITY DEFINER, empty search_path, and least privilege', () => {
    expect(sql).toContain('procedure_row.prosecdef IS NOT TRUE');
    expect(sql).toContain("ARRAY['search_path=\"\"']::text[]");
    expect(sql).toMatch(
      /REVOKE ALL\s+ON FUNCTION internal\.reapply_cari_urun_items_v3\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /REVOKE ALL\s+ON FUNCTION public\.update_cari_urunlu_islem_atomik_v3\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE\s+ON FUNCTION public\.update_cari_urunlu_islem_atomik_v3\([\s\S]*?TO authenticated;/,
    );
    expect(sql).toMatch(
      /REVOKE ALL\s+ON FUNCTION public\.create_islem_with_urun_atomik\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE\s+ON FUNCTION public\.create_islem_with_urun_atomik\([\s\S]*?TO authenticated;/,
    );
    expect(sql).toMatch(
      /REVOKE ALL\s+ON FUNCTION internal\.enforce_linked_product_movement_permission_v1\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toContain('trigger_procedure.prosecdef IS NOT TRUE');
    expect(sql).toContain(
      "trigger_procedure.provolatile IS DISTINCT FROM 'v'",
    );
    expect(sql).toContain(
      "trigger_procedure.proowner IS DISTINCT FROM\n              'postgres'::pg_catalog.regrole",
    );
  });

  it('opens archived history only for the exact owner update context', () => {
    expect(sql).toContain('product.is_archived IS TRUE');
    expect(sql).toContain(
      'internal.isletme_sahibi_v1(NEW.isletme_id)',
    );
    expect(sql).toContain(
      'FROM internal.permission_v2_movement_action_context',
    );
    expect(sql).toContain(
      "archived_action_context.action = 'update'",
    );
    expect(sql).toContain(
      'FROM internal.product_edit_v3_history_context',
    );
    expect(sql).toContain(
      'archived_history_context.backend_pid =',
    );
    expect(sql).toContain(
      'archived_history_context.transaction_id =',
    );
    expect(sql).toContain(
      'archived_history_context.actor_user_id = auth.uid()',
    );
    expect(sql).toContain(
      'archived_history_context.isletme_id = NEW.isletme_id',
    );
    expect(sql).toContain(
      'archived_history_context.islem_id = NEW.islem_id',
    );
    expect(sql).toContain(
      'archived_history_context.urun_id = NEW.urun_id',
    );
    expect(sql).toContain(
      "'PRODUCT_EDIT_V3_HISTORY_LINKED_TRIGGER_ARCHIVE_GATE_DRIFT'",
    );
  });

  it('serializes same-UUID product creates before probing or creating', () => {
    const advisoryLock = sql.indexOf(
      'PERFORM pg_catalog.pg_advisory_xact_lock(',
    );
    const existenceProbe = sql.indexOf(
      'FROM public.islemler AS existing_transaction',
    );
    const canonicalCreate = sql.indexOf(
      'v_result := public.create_islem_atomik(',
      existenceProbe,
    );

    expect(advisoryLock).toBeGreaterThan(-1);
    expect(advisoryLock).toBeLessThan(existenceProbe);
    expect(existenceProbe).toBeLessThan(canonicalCreate);
    expect(sql).toContain(
      "'product-create:' || v_requested_id::text",
    );
    expect(sql).toContain('v_existed_before := FOUND');
  });

  it('makes exact product retries no-op and conflicts on itemless or changed sets', () => {
    expect(sql).toContain(
      'v_items := internal.sanitize_legacy_cari_product_items_v1(p_items);',
    );
    expect(sql).toContain(
      "internal.kayit_mutasyon_izni_v1(\n      p_isletme_id,\n      'urunler',",
    );
    expect(sql).toContain("'create'");
    expect(sql).toContain('INTO v_existing_items');
    expect(sql).toContain(
      'pg_catalog.jsonb_array_length(v_existing_items) = 0',
    );
    expect(sql).toContain(
      'v_existing_items IS DISTINCT FROM v_payload_items',
    );
    expect(sql).toContain(
      "'ISLEM_LEGACY_PRODUCT_IDEMPOTENCY_CONFLICT'",
    );
    expect(sql).toContain("USING ERRCODE = '23505'");

    const retryBranch = sql.indexOf('IF v_existed_before IS TRUE THEN');
    const retryReturn = sql.indexOf('RETURN v_result;', retryBranch);
    const newCreateReapply = sql.indexOf(
      '-- A genuinely new create keeps the strict V3 validation',
      retryReturn,
    );
    expect(retryBranch).toBeGreaterThan(-1);
    expect(retryReturn).toBeGreaterThan(retryBranch);
    expect(newCreateReapply).toBeGreaterThan(retryReturn);
  });

  it('validates the retry item contract without rewriting stock', () => {
    expect(sql).toContain(
      "v_urun_id := (v_item->>'urun_id')::uuid;",
    );
    expect(sql).toContain(
      'WHEN invalid_text_representation OR numeric_value_out_of_range THEN',
    );
    expect(sql).toContain(
      "v_item->>'hareket_tipi'\n            IS DISTINCT FROM v_expected_movement",
    );
    expect(sql).toContain(
      'v_miktar IS DISTINCT FROM pg_catalog.round(v_miktar, 3)',
    );
    expect(sql).toContain(
      'pg_catalog.round(v_birim_fiyat, 4)',
    );
    expect(sql).toContain(
      'v_item_count IS DISTINCT FROM v_distinct_product_count',
    );
    expect(sql).toContain(
      'ORDER BY movement.urun_id, movement.id',
    );
  });

  it('normalizes null legacy price and tax only inside the V3 boundary', () => {
    expect(sql).toContain(
      "'PRODUCT_EDIT_V3_HISTORY_VALIDATION_NULL_NORMALIZATION_DRIFT'",
    );
    expect(sql).toContain(
      "'PRODUCT_EDIT_V3_HISTORY_INSERT_NULL_NORMALIZATION_DRIFT'",
    );
    expect(
      sql.match(/v_birim_fiyat := COALESCE\(/g)?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      sql.match(/v_kdv := COALESCE\(/g)?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(sql).toContain(
      "'birim_fiyat', COALESCE(movement.birim_fiyat, 0::numeric)",
    );
    expect(sql).toContain(
      "'kdv_orani', COALESCE(movement.kdv_orani, 0)",
    );

    // The linked-row trigger remains strict for direct/independent writes.
    expect(sql).toContain('OR NEW.birim_fiyat IS NULL');
    expect(sql).toContain('OR NEW.kdv_orani IS NULL');
    expect(sql).not.toContain(
      'NEW.birim_fiyat := COALESCE(NEW.birim_fiyat',
    );
    expect(sql).not.toContain(
      'NEW.kdv_orani := COALESCE(NEW.kdv_orani',
    );
  });
});
