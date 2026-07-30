import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_PATH =
  'supabase/migrations/20260729201911_add_product_report_v2_permission_projection.sql';
const PB_PATH =
  'supabase/migrations/20260729064915_pb_internal_yetki_altyapisi.sql';

const migration = fs.readFileSync(path.join(ROOT, MIGRATION_PATH), 'utf8');
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

const exactResult =
  'urun_id uuid, urun_adi text, urun_birim text, kategori_id uuid, kategori_adi text, toplam_miktar numeric, toplam_tutar numeric, toplam_tutar_kdvsiz numeric, islem_sayisi bigint';

function normalizeSql(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

describe('P0-S8 product report v2 permission projection migration', () => {
  it('runs after the canonical resolver and creates V2 additively', () => {
    expect(MIGRATION_PATH.localeCompare(PB_PATH)).toBeGreaterThan(0);
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.get_product_report_v2\(/,
    );
    expect(executableSql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_product_report_v2\(/,
    );
  });

  it('locks the audited live V1 identity, output, ACL and definition hash', () => {
    expect(executableSql).toContain(
      "'public.get_product_report(uuid,timestamp with time zone,timestamp with time zone,text[])'",
    );
    expect(executableSql).toContain(
      '6139dd322f98a53bfd7e4d009acb7a65',
    );
    expect(executableSql).toContain(
      "'{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'",
    );
    expect(executableSql).toContain(
      "v_volatility IS DISTINCT FROM 'v'",
    );
    expect(executableSql).toContain(
      "ARRAY['search_path=public']::text[]",
    );
    expect(executableSql).toContain(
      'get_product_report_v2 migration oncesinde zaten var',
    );
  });

  it('keeps the four parameters and nine result columns on V2 and V1', () => {
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.get_product_report_v2\(\s*p_isletme_id uuid,\s*p_start_date timestamp with time zone,\s*p_end_date timestamp with time zone,\s*p_islem_types text\[\]\s*\)/s,
    );

    const v2Columns =
      executableSql.match(
        /CREATE FUNCTION public\.get_product_report_v2[\s\S]*?RETURNS TABLE\(([\s\S]*?)\)\s*LANGUAGE/,
      )?.[1] ?? '';
    expect(normalizeSql(v2Columns)).toBe(exactResult);

    const wrapperColumns =
      executableSql.match(
        /CREATE OR REPLACE FUNCTION public\.get_product_report[\s\S]*?RETURNS TABLE\(([\s\S]*?)\)\s*LANGUAGE sql/,
      )?.[1] ?? '';
    expect(normalizeSql(wrapperColumns)).toBe(exactResult);
    expect(executableSql).toMatch(
      /FROM public\.get_product_report_v2\(\s*p_isletme_id,\s*p_start_date,\s*p_end_date,\s*p_islem_types\s*\) AS report_row/s,
    );
  });

  it('fails closed for bad parameters and any unsupported transaction type', () => {
    expect(executableSql).toMatch(
      /p_isletme_id IS NULL[\s\S]*?p_start_date > p_end_date[\s\S]*?p_islem_types IS NULL[\s\S]*?cardinality\(p_islem_types\) < 1[\s\S]*?cardinality\(p_islem_types\) > 16/,
    );
    for (const type of [
      'cari_alis',
      'cari_alis_iade',
      'cari_satis',
      'cari_satis_iade',
      'personel_satis',
    ]) {
      expect(executableSql).toContain(`'${type}'`);
    }
    expect(executableSql).toMatch(
      /requested_type\.type_name IS NULL\s+OR requested_type\.type_name NOT IN/s,
    );
  });

  it('uses the Raporlar + Urunler source contract without adding C/P gates', () => {
    for (const moduleName of ['raporlar', 'urunler']) {
      expect(executableSql).toMatch(
        new RegExp(
          `FROM internal\\.etkin_yetki\\(p_isletme_id, '${moduleName}'\\) AS permission\\s+LIMIT 1;`,
        ),
      );
    }
    expect(executableSql).not.toContain(
      "internal.etkin_yetki(p_isletme_id, 'cariler')",
    );
    expect(executableSql).not.toContain(
      "internal.etkin_yetki(p_isletme_id, 'personel')",
    );
    expect(executableSql).toMatch(
      /v_user_id IS NULL[\s\S]*?v_reports_can_view IS NOT TRUE[\s\S]*?v_has_urunler IS NOT TRUE/,
    );
  });

  it('uses transaction ownership for linked rows and movement ownership for unlinked rows', () => {
    expect(executableSql).toMatch(
      /movement\.islem_id IS NOT NULL[\s\S]*?v_can_see_all_users_data IS TRUE\s+OR transaction_row\.created_by = v_user_id/s,
    );
    expect(executableSql).not.toMatch(
      /transaction_row\.created_by = v_user_id\s+AND movement\.created_by = v_user_id/,
    );
    expect(executableSql).toMatch(
      /movement\.islem_id IS NULL[\s\S]*?v_can_see_all_users_data IS TRUE\s+OR movement\.created_by = v_user_id/s,
    );
  });

  it('tenant-scopes every relation and rejects dangling linked references', () => {
    for (const [relation, alias] of [
      ['public\\.urunler', 'product'],
      ['public\\.kategoriler', 'category'],
      ['public\\.islemler', 'transaction_row'],
      ['public\\.hesaplar', 'account'],
      ['public\\.cariler', 'cari'],
      ['public\\.personel', 'employee'],
    ] as const) {
      expect(executableSql).toMatch(
        new RegExp(
          `JOIN ${relation} AS ${alias}[\\s\\S]{0,180}${alias}\\.isletme_id = p_isletme_id`,
        ),
      );
    }
    expect(executableSql).toMatch(
      /movement\.islem_id IS NOT NULL\s+AND transaction_row\.id IS NOT NULL/,
    );
    expect(executableSql).toMatch(
      /transaction_row\.cari_id IS NULL\s+OR cari\.id IS NOT NULL/,
    );
    expect(executableSql).toMatch(
      /transaction_row\.personel_id IS NULL\s+OR employee\.id IS NOT NULL/,
    );
    expect(executableSql).toMatch(
      /LEFT JOIN public\.hesaplar AS target_account[\s\S]{0,180}target_account\.isletme_id = p_isletme_id/,
    );
    expect(executableSql).toMatch(
      /transaction_row\.hedef_hesap_id IS NULL\s+OR target_account\.id IS NOT NULL/,
    );
  });

  it('preserves active/archive, unlinked direction and TRY conversion semantics', () => {
    expect(executableSql).toContain('product.is_active IS NOT FALSE');
    expect(executableSql).toContain(
      'account.id IS NULL OR account.is_active = true',
    );
    expect(executableSql).toContain(
      'target_account.id IS NULL',
    );
    expect(executableSql).toContain(
      'target_account.is_active = true',
    );
    expect(executableSql).toContain(
      'cari.id IS NULL OR cari.is_active IS NOT FALSE',
    );
    expect(executableSql).toContain(
      'employee.id IS NULL',
    );
    expect(executableSql).not.toMatch(/\.[iI]s_archived\b/);
    expect(executableSql).toContain(
      "v_include_unlinked_giris := 'cari_alis' = ANY(p_islem_types)",
    );
    expect(executableSql).toContain(
      "movement.hareket_tipi = 'cikis'",
    );
    expect(executableSql).toContain(
      "rate_row.base_currency = 'TRY'",
    );
    expect(
      executableSql.match(
        /COALESCE\(\s*account\.currency,\s*cari\.currency,\s*employee\.currency,\s*'TRY'\s*\)/g,
      ),
    ).toHaveLength(2);
    expect(
      executableSql.match(
        /\)::decimal\s+FROM rates AS rate\s*\),\s*1\s*\)/g,
      ),
    ).toHaveLength(2);
    expect(executableSql).toMatch(
      /COALESCE\(movement\.kdv_orani, 0\) \/ 100\.0/,
    );
    expect(executableSql).toMatch(
      /count\(\s*DISTINCT COALESCE\(movement\.islem_id, movement\.id\)\s*\)/,
    );
    expect(executableSql).toContain('ORDER BY 7 DESC');
  });

  it('keeps both endpoints STABLE, pg_catalog-only and authenticated-only', () => {
    expect(
      executableSql.match(
        /STABLE\s+SECURITY DEFINER\s+SET search_path TO 'pg_catalog'/g,
      ),
    ).toHaveLength(2);

    for (const functionName of [
      'get_product_report_v2',
      'get_product_report',
    ]) {
      const signature =
        `public\\.${functionName}\\(\\s*uuid,\\s*timestamp with time zone,\\s*timestamp with time zone,\\s*text\\[\\]\\s*\\)`;
      expect(executableSql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION ${signature}\\s+FROM PUBLIC, anon, authenticated, service_role;`,
        ),
      );
      expect(executableSql).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION ${signature}\\s+TO authenticated;`,
        ),
      );
    }
  });

  it('locks the postcondition to both identities and every security field', () => {
    const postcondition =
      migration.match(
        /DO \$postcondition\$([\s\S]*?)\$postcondition\$;/,
      )?.[1] ?? '';

    for (const functionName of [
      'get_product_report_v2',
      'get_product_report',
    ]) {
      expect(postcondition).toContain(
        `public.${functionName}(uuid,timestamp with time zone,timestamp with time zone,text[])`,
      );
    }
    expect(postcondition).toContain(
      "v_owner IS DISTINCT FROM 'postgres'",
    );
    expect(postcondition).toContain(exactResult);
    expect(postcondition).toContain(
      "v_volatility IS DISTINCT FROM 's'",
    );
    expect(postcondition).toContain(
      "ARRAY['search_path=pg_catalog']::text[]",
    );
    expect(postcondition).toContain(
      'v_public_execute IS DISTINCT FROM false',
    );
    expect(postcondition).toContain(
      'v_anon_execute IS DISTINCT FROM false',
    );
    expect(postcondition).toContain(
      'v_authenticated_execute IS DISTINCT FROM true',
    );
    expect(postcondition).toContain(
      'v_service_role_execute IS DISTINCT FROM false',
    );
  });

  it('does not alter schema tables or write user data', () => {
    expect(executableSql).not.toMatch(/\bDROP\b/i);
    expect(executableSql).not.toMatch(/\bALTER\b/i);
    expect(executableSql).not.toMatch(
      /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i,
    );
    expect(executableSql).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(executableSql).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(executableSql).not.toMatch(
      /\bUPDATE\s+(?:public\.)?[a-z_"][a-z0-9_"]*/i,
    );
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executableSql).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('documents old-client compatibility and preservation', () => {
    expect(migration).toContain('1.5.x / ESKI CLIENT');
    expect(migration).toContain('ayni dokuz kolonu');
    expect(migration).toContain('Cariler/Personel kapali olsa');
    expect(migration).toContain('tablo veya kullanici satirlarina yazmaz');
    expect(migration).toContain('DML/backfill yapmaz');
    expect(migration).toContain('is_archived filtresi eklenmez');
    expect(migration).toContain(
      "eski binary'nin daha once diske",
    );
    expect(migration).toContain('cache buster');
  });
});
