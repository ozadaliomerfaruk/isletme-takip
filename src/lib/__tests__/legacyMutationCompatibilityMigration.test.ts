import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260730121943_legacy_mutation_contract_compatibility.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const migrationDirectory = path.dirname(migrationPath);
const migrationFileName = path.basename(migrationPath);

function stripSqlBodiesAndComments(source: string): string {
  return source
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*|)\$[\s\S]*?\$\1\$/g, '$BODY$')
    .replace(/--.*$/gm, '');
}

describe('legacy mutation compatibility migration', () => {
  it('is data-preserving and keeps function signatures in place', () => {
    expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(sql.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(sql).toContain("SET LOCAL lock_timeout = '2s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '120s';");

    const topLevel = stripSqlBodiesAndComments(sql);
    expect(topLevel).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION)\b/i);
    expect(topLevel).not.toMatch(/\bTRUNCATE\b/i);
    expect(topLevel).not.toMatch(/\bDELETE\s+FROM\s+public\./i);
    expect(topLevel).not.toMatch(/\bUPDATE\s+public\./i);
    expect(topLevel).not.toMatch(/\bINSERT\s+INTO\s+public\./i);
    expect(topLevel).not.toMatch(/\bALTER\s+TABLE\b/i);
  });

  it('adapts only null legacy currency assertions', () => {
    expect(sql).toContain(
      "field.key IN ('source_currency', 'target_currency')",
    );
    expect(sql).toContain("field.value = 'null'::jsonb");
    expect(sql).not.toContain('jsonb_strip_nulls');
    expect(sql).toContain(
      "'public.update_islem_atomik_v2(uuid,uuid,jsonb)'::regprocedure",
    );
  });

  it('allows unchanged historical references but keeps new references active', () => {
    expect(sql).toContain(
      'v_new.cari_id IS NOT DISTINCT FROM v_old.cari_id',
    );
    expect(sql).toContain(
      'v_new.personel_id IS NOT DISTINCT FROM v_old.personel_id',
    );
    expect(sql).toContain(
      'account.id IS NOT DISTINCT FROM v_old.hesap_id',
    );
    expect(sql).toContain(
      'v_new.kategori_id IS NOT DISTINCT FROM v_old.kategori_id',
    );
    expect(sql).toContain('customer.is_active IS TRUE');
    expect(sql).toContain('employee.is_active IS TRUE');
    expect(sql).toContain('account.is_active IS TRUE');
  });

  it('matches product validators to quantity-3 and unit-price-4 schema', () => {
    expect(sql).toContain('v_price_scale IS DISTINCT FROM 4');
    expect(sql).toContain('v_quantity_scale IS DISTINCT FROM 3');
    expect(sql).toContain('pg_catalog.round(v_birim_fiyat, 4)');
    expect(sql).toContain('pg_catalog.round(NEW.birim_fiyat, 4)');
    expect(sql).toContain('99999999999.9999');
    expect(sql).toContain("NOT IN ('number', 'null')");
    expect(sql).toContain('v_birim_fiyat IS NOT NULL');
    expect(sql).toContain('v_kdv IS NOT NULL');
  });

  it('strips only the obsolete item date at legacy public RPC boundaries', () => {
    expect(sql).toContain(
      'internal.sanitize_legacy_cari_product_items_v1',
    );
    expect(sql).toContain("item.value - 'created_at'");
    expect(sql).not.toContain("item.value - 'birim_fiyat'");
    expect(sql).toContain(
      "'public.create_islem_with_urun_atomik(uuid,jsonb,jsonb,jsonb)'::regprocedure",
    );
    expect(sql).toContain(
      "'public.reapply_urun_hareketler_for_islem(uuid,uuid,jsonb)'::regprocedure",
    );
  });

  it('fails closed if any expected server definition has drifted', () => {
    expect(sql.match(/_DRIFT'/g)?.length).toBeGreaterThanOrEqual(8);
    expect(sql).toContain('EXECUTE v_def;');
    expect(sql).not.toMatch(/\bpg_catalog\.position\s*\(/i);
  });

  it('forces an explicit compatibility review before protected RPCs are redefined later', () => {
    const protectedFunctions = [
      'public.update_islem_atomik',
      'public.update_islem_atomik_v2',
      'internal.reapply_cari_urun_items_v3',
      'internal.enforce_linked_product_movement_permission_v1',
      'public.create_islem_with_urun_atomik',
      'public.reapply_urun_hareketler_for_islem',
    ];
    const laterMigrations = fs.readdirSync(migrationDirectory)
      .filter((name) => name.endsWith('.sql') && name > migrationFileName);
    const accidentalRedefinitions: string[] = [];

    for (const fileName of laterMigrations) {
      const source = fs.readFileSync(path.join(migrationDirectory, fileName), 'utf8');
      for (const functionName of protectedFunctions) {
        const escapedName = functionName.replaceAll('.', '\\.');
        if (
          new RegExp(
            `CREATE(?:\\s+OR\\s+REPLACE)?\\s+FUNCTION\\s+${escapedName}\\s*\\(`,
            'i',
          ).test(source)
        ) {
          accidentalRedefinitions.push(`${fileName}: ${functionName}`);
        }
      }
    }

    expect(accidentalRedefinitions).toEqual([]);
  });
});
