import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260730234544_legacy_empty_product_reapply_noop.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');

function stripSqlBodiesAndComments(source: string): string {
  return source
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*|)\$[\s\S]*?\$\1\$/g, '$BODY$')
    .replace(/--.*$/gm, '');
}

describe('legacy empty product reapply compatibility migration', () => {
  it('changes no user rows and preserves the public RPC signature', () => {
    expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(sql.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(sql).toContain(
      "'public.reapply_urun_hareketler_for_islem(uuid,uuid,jsonb)'::regprocedure",
    );

    const topLevel = stripSqlBodiesAndComments(sql);
    expect(topLevel).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION)\b/i);
    expect(topLevel).not.toMatch(/\bTRUNCATE\b/i);
    expect(topLevel).not.toMatch(
      /\b(INSERT|UPDATE|DELETE)\s+(INTO\s+|FROM\s+)?public\./i,
    );
    expect(topLevel).not.toMatch(/\bALTER\s+TABLE\b/i);
  });

  it('no-ops only the authorized empty and movementless unsupported case', () => {
    expect(sql).toContain(
      'v_items := internal.sanitize_legacy_cari_product_items_v1(',
    );
    expect(sql).toContain(
      'pg_catalog.jsonb_array_length(v_items) = 0',
    );
    expect(sql).toContain('v_transaction.type::text NOT IN (');
    expect(sql).toContain('FROM public.urun_hareketler AS movement');
    expect(sql).toContain('movement.isletme_id = p_isletme_id');
    expect(sql).toContain('movement.islem_id = p_islem_id');
    expect(sql).toContain("'internal.kayit_mutasyon_izni_v1('");
    expect(sql).toContain(
      'v_permission_position > v_noop_position',
    );
    expect(sql).toContain(
      'PERFORM internal.reapply_cari_urun_items_v3(',
    );
  });

  it('uses drift guards and keeps least-privilege function properties', () => {
    expect(sql).toContain(
      "'LEGACY_EMPTY_PRODUCT_REAPPLY_DECLARATION_DRIFT'",
    );
    expect(sql).toContain(
      "'LEGACY_EMPTY_PRODUCT_REAPPLY_BODY_DRIFT'",
    );
    expect(sql).toContain(
      "'LEGACY_EMPTY_PRODUCT_REAPPLY_POSTCONDITION_FAILED'",
    );
    expect(sql).toContain('v_function.prosecdef IS NOT TRUE');
    expect(sql).toContain(
      "v_function.provolatile IS DISTINCT FROM 'v'",
    );
    expect(sql).toContain("ARRAY['search_path=\"\"']::text[]");
    expect(sql).toContain("'authenticated'");
    expect(sql).toContain("'anon'");
    expect(sql).toContain("'service_role'");
  });
});
