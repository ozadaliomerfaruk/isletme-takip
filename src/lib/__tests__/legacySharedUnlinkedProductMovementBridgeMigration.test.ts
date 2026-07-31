import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260731040701_legacy_shared_unlinked_product_movement_bridge.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const linkedBridgeSql = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260731004312_legacy_shared_product_movement_bridge.sql',
  ),
  'utf8',
);

function functionBlock(functionName: string): string {
  const pattern = new RegExp(
    `CREATE FUNCTION\\s+(?:internal|public)\\.${functionName}\\s*\\([\\s\\S]*?\\$function\\$;`,
  );
  const match = sql.match(pattern);
  if (!match) {
    throw new Error(`${functionName} function block not found`);
  }
  return match[0];
}

describe('released shared manual product movement compatibility migration', () => {
  it('is additive for user data and preserves every released RPC signature', () => {
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION|POLICY)\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(
      /\bALTER\s+TABLE\s+public\.(?:urunler|urun_hareketler)\b/i,
    );

    for (const signature of [
      'public.update_urun_miktar(uuid,numeric,uuid)',
      'public.create_urun_hareket_atomik_v2(uuid,jsonb)',
      'public.update_urun_hareket_atomik_v2(uuid,uuid,jsonb)',
      'public.delete_urun_hareket_atomik_v2(uuid,uuid)',
    ]) {
      expect(sql).toContain(`'${signature}'`);
    }
  });

  it('widens only harmless staging, then checks exact create/update/delete permission', () => {
    expect(sql).toContain('any released manual action');
    expect(sql).toMatch(
      /internal\.kayit_mutasyon_izni_v1\([\s\S]*?'create'[\s\S]*?OR internal\.kayit_mutasyon_izni_v1\([\s\S]*?'update'[\s\S]*?OR internal\.kayit_mutasyon_izni_v1\([\s\S]*?'delete'/,
    );
    expect(sql).toContain(
      'pg_catalog.round(p_miktar_degisim, 3)',
    );
    expect(sql).toContain(
      'LEGACY_SHARED_UNLINKED_MUTATION_UPDATE_RPC_ROUND_DRIFT',
    );

    const oldRowGate = functionBlock(
      'legacy_shared_product_unlinked_old_row_allowed_v1',
    );
    expect(oldRowGate).toContain("p_action NOT IN ('update', 'delete')");
    expect(oldRowGate).toContain(
      "internal.kayit_mutasyon_izni_v1(\n       p_isletme_id,\n       'urunler',\n       p_created_by,\n       p_action",
    );

    const bridge = functionBlock(
      'bridge_legacy_shared_product_unlinked_mutation_v1',
    );
    expect(bridge).toContain(
      "internal.kayit_mutasyon_izni_v1(\n       v_isletme_id,\n       'urunler',\n       v_created_by,\n       v_action",
    );
    expect(bridge).not.toContain(
      "internal.kayit_mutasyon_izni_v1(\n       v_isletme_id,\n       'urunler',\n       v_uid,\n       v_action",
    );
  });

  it('bridges create, update and delete deltas under product/advisory locks', () => {
    const bridge = functionBlock(
      'bridge_legacy_shared_product_unlinked_mutation_v1',
    );
    expect(bridge).toContain(
      "v_action text := CASE TG_OP\n"
      + "    WHEN 'INSERT' THEN 'create'\n"
      + "    WHEN 'UPDATE' THEN 'update'\n"
      + "    ELSE 'delete'",
    );
    expect(bridge).toContain(
      "WHEN TG_OP = 'INSERT' THEN 0",
    );
    expect(bridge).toContain(
      "WHEN TG_OP = 'DELETE' THEN 0",
    );
    expect(bridge).toContain(
      'v_delta := -v_old_effect + v_new_effect',
    );
    expect(bridge).toContain('pg_catalog.pg_advisory_xact_lock(');
    expect(bridge).toContain('FOR UPDATE;');
    expect(bridge).toContain(
      'v_intent.previous_quantity\n          IS DISTINCT FROM v_current_quantity',
    );
    expect(bridge).toContain(
      'v_intent.delta IS DISTINCT FROM v_delta',
    );
    expect(bridge).toContain(
      'SET miktar = v_expected_quantity',
    );
    expect(bridge).toContain(
      "'LEGACY_UNLINKED_PRODUCT_INTENT_MISMATCH'",
    );
  });

  it('uses pre-trigger restrictive USING and exact VOLATILE post-trigger contexts', () => {
    const contextGate = functionBlock(
      'legacy_shared_product_unlinked_context_allowed_v1',
    );
    expect(contextGate).toContain('LANGUAGE plpgsql\nVOLATILE');
    expect(contextGate).toContain(
      'context_row.backend_pid = pg_catalog.pg_backend_pid()',
    );
    expect(contextGate).toContain(
      'context_row.transaction_id = pg_catalog.txid_current()',
    );
    expect(contextGate).toContain(
      'context_row.new_miktar IS NOT DISTINCT FROM p_miktar',
    );
    expect(contextGate).toContain(
      'context_row.new_yeni_miktar\n          IS NOT DISTINCT FROM p_yeni_miktar',
    );

    expect(sql).toMatch(
      /ALTER POLICY "Permission v2 direct update urun hareketleri owner only"[\s\S]*?USING \([\s\S]*?legacy_shared_product_unlinked_old_row_allowed_v1\([\s\S]*?WITH CHECK \([\s\S]*?legacy_shared_product_unlinked_context_allowed_v1\(/,
    );
    expect(sql).toMatch(
      /ALTER POLICY "Permission v2 direct delete urun hareketleri owner only"[\s\S]*?USING \([\s\S]*?legacy_shared_product_unlinked_old_row_allowed_v1\(/,
    );
  });

  it('opens exact canonical create/update/delete contexts before movement DML', () => {
    expect(sql).toContain(
      "'public.create_urun_hareket_atomik_v2(uuid,jsonb)'",
    );
    expect(sql).toContain('v_hareket_id uuid := extensions.gen_random_uuid()');
    expect(sql).toContain(
      "internal.open_canonical_unlinked_product_context_v1(\n      'create'",
    );
    expect(sql).toContain(
      "internal.open_canonical_unlinked_product_context_v1(\n      'update'",
    );
    expect(sql).toContain(
      "internal.open_canonical_unlinked_product_context_v1(\n      'delete'",
    );
    expect(sql.match(
      /internal\.assert_canonical_unlinked_product_context_consumed_v1\(/g,
    )?.length).toBeGreaterThanOrEqual(7);

    const bridge = functionBlock(
      'bridge_legacy_shared_product_unlinked_mutation_v1',
    );
    const canonicalCheck = bridge.indexOf(
      "context_row.source = 'canonical'",
    );
    const legacyIntent = bridge.indexOf(
      'FROM internal.legacy_shared_product_delta_intents_v1 AS intent',
    );
    expect(canonicalCheck).toBeGreaterThan(-1);
    expect(legacyIntent).toBeGreaterThan(canonicalCheck);
    expect(bridge).toContain(
      "'CANONICAL_UNLINKED_PRODUCT_CONTEXT_MISMATCH'",
    );
  });

  it('consumes intent only in AFTER success and retains compensation on failure', () => {
    const bridge = functionBlock(
      'bridge_legacy_shared_product_unlinked_mutation_v1',
    );
    const cleanup = functionBlock(
      'cleanup_legacy_shared_product_unlinked_mutation_v1',
    );

    expect(bridge).not.toContain(
      'DELETE FROM internal.legacy_shared_product_delta_intents_v1',
    );
    expect(cleanup).toContain(
      'DELETE FROM internal.legacy_shared_product_delta_intents_v1 AS intent',
    );
    expect(sql).toMatch(
      /CREATE TRIGGER[\s\S]*?trg_zy_legacy_shared_product_unlinked_mutation_cleanup_v1[\s\S]*?AFTER INSERT OR UPDATE OR DELETE/,
    );
    expect(linkedBridgeSql).toContain('v_existing.delta = -p_delta');
    expect(sql).not.toContain(
      '$old$  IF FOUND\n'
      + '     AND v_existing.expires_at > pg_catalog.clock_timestamp()',
    );
  });

  it('keeps all stateful helpers private and exposes only the two RLS predicates', () => {
    expect(sql).toMatch(
      /REVOKE ALL\s+ON TABLE internal\.legacy_shared_product_unlinked_mutation_context_v1\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE\s+ON FUNCTION\s+internal\.legacy_shared_product_unlinked_old_row_allowed_v1\([\s\S]*?\)\s+TO authenticated;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE\s+ON FUNCTION\s+internal\.legacy_shared_product_unlinked_context_allowed_v1\([\s\S]*?\)\s+TO authenticated;/,
    );

    for (const privateName of [
      'open_canonical_unlinked_product_context_v1',
      'assert_canonical_unlinked_product_context_consumed_v1',
      'bridge_legacy_shared_product_unlinked_mutation_v1',
      'cleanup_legacy_shared_product_unlinked_mutation_v1',
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL\\s+ON FUNCTION\\s+internal\\.${privateName}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role;`,
        ),
      );
      expect(sql).not.toMatch(
        new RegExp(
          `GRANT EXECUTE\\s+ON FUNCTION\\s+internal\\.${privateName}`,
        ),
      );
    }
  });

  it('contains drift guards and metadata/ACL postconditions for every patched RPC', () => {
    expect(sql).toContain('DO $patch_stage_and_wrapper$');
    expect(sql).toContain('DO $patch_canonical_v2$');
    expect(sql).toContain('v_definition IS NOT DISTINCT FROM v_before');
    expect(sql).toContain('EXECUTE v_definition');
    expect(sql).toContain(
      'LEGACY_SHARED_UNLINKED_MUTATION_CANONICAL_PATCH_FAILED',
    );
    expect(sql).toContain(
      "COALESCE(v_function.proconfig, ARRAY[]::text[])\n         @> ARRAY['search_path=\"\"']::text[]",
    );
    expect(sql).toContain(
      'LEGACY_SHARED_UNLINKED_MUTATION_PUBLIC_RPC_ACL_FAILED',
    );
  });
});
