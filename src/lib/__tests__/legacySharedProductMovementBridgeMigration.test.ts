import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260731004312_legacy_shared_product_movement_bridge.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('legacy shared product movement bridge migration', () => {
  it('preserves user data and the released public RPC signature', () => {
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION)\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\s+public\./i);
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.update_urun_miktar(',
    );
    expect(sql).toContain(
      'p_isletme_id uuid DEFAULT NULL',
    );
    expect(sql).toContain(
      'RETURNS numeric',
    );
  });

  it('stages shared deltas without changing stock and preserves owner behavior', () => {
    const sharedBranch = sql.indexOf(
      'IF NOT internal.isletme_sahibi_v1(p_isletme_id) THEN',
    );
    const stageCall = sql.indexOf(
      'RETURN internal.stage_legacy_shared_product_delta_v1(',
      sharedBranch,
    );
    const ownerUpdate = sql.indexOf(
      'UPDATE public.urunler AS product',
      stageCall,
    );

    expect(sharedBranch).toBeGreaterThan(-1);
    expect(stageCall).toBeGreaterThan(sharedBranch);
    expect(ownerUpdate).toBeGreaterThan(stageCall);
    expect(sql).toContain(
      "pg_catalog.clock_timestamp() + INTERVAL '90 seconds'",
    );
    expect(sql).toContain('v_existing.delta = -p_delta');
  });

  it('consumes only an exact fresh linked-movement intent atomically', () => {
    expect(sql).toContain(
      'CREATE FUNCTION internal.bridge_legacy_shared_product_insert_v1()',
    );
    expect(sql).toContain(
      'transaction_row.created_by = v_uid',
    );
    expect(sql).toContain(
      "transaction_row.created_at\n        >= pg_catalog.clock_timestamp() - INTERVAL '10 minutes'",
    );
    expect(sql).toContain(
      'v_intent.previous_quantity IS DISTINCT FROM v_current_quantity',
    );
    expect(sql).toContain(
      'v_intent.delta IS DISTINCT FROM v_delta',
    );
    expect(sql).toContain(
      'NEW.onceki_miktar IS DISTINCT FROM v_current_quantity',
    );
    expect(sql).toContain(
      'SET miktar = v_intent.expected_quantity',
    );
  });

  it('keeps canonical RPCs, raw inserts, and RLS boundaries separated', () => {
    expect(sql).toContain(
      "action_context.action IN ('create', 'update')",
    );
    expect(sql).toContain(
      "RAISE EXCEPTION 'PRODUCT_MOVEMENT_CANONICAL_RPC_REQUIRED'",
    );
    expect(sql).toContain(
      'ALTER POLICY "Permission v2 direct insert urun hareketleri owner only"',
    );
    expect(sql).toContain(
      'internal.legacy_shared_product_insert_policy_allowed_v1(',
    );
    expect(sql).toContain(
      'trg_00_legacy_shared_product_insert_v1',
    );
    expect(sql).toContain(
      'trg_zz_legacy_shared_product_insert_cleanup_v1',
    );
  });

  it('keeps private tables and helpers closed to API roles', () => {
    expect(sql).toMatch(
      /REVOKE ALL\s+ON TABLE internal\.legacy_shared_product_delta_intents_v1\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /REVOKE ALL\s+ON TABLE internal\.legacy_shared_product_insert_context_v1\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /REVOKE ALL\s+ON FUNCTION internal\.bridge_legacy_shared_product_insert_v1\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE\s+ON FUNCTION internal\.legacy_shared_product_insert_policy_allowed_v1\(\s*uuid, uuid, uuid, uuid, text, numeric, numeric, numeric\s*\)\s+TO authenticated;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE\s+ON FUNCTION public\.update_urun_miktar\(uuid, numeric, uuid\)\s+TO authenticated;/,
    );
  });
});
