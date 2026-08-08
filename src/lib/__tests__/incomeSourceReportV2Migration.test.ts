import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_PATH =
  'supabase/migrations/20260729194510_add_income_source_report_v2_permission_projection.sql';
const PB_PATH =
  'supabase/migrations/20260729064915_pb_internal_yetki_altyapisi.sql';

const migration = fs.readFileSync(path.join(ROOT, MIGRATION_PATH), 'utf8');
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

const exactResult =
  'source_kind text, source_type text, source_id uuid, source_name text, source_currency text, islem_count bigint, total_amount numeric, total_native numeric';

function normalizeSql(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

describe('P0-S8 income source report v2 permission projection migration', () => {
  it('runs after the canonical permission resolver and creates V2 additively', () => {
    expect(MIGRATION_PATH.localeCompare(PB_PATH)).toBeGreaterThan(0);
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.get_income_by_source_v2\(/,
    );
    expect(executableSql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_income_by_source_v2\(/,
    );
  });

  it('locks the live V1 identity, result, owner, config, ACL and definition hash', () => {
    expect(executableSql).toContain(
      "'public.get_income_by_source(uuid,timestamp with time zone,timestamp with time zone)'",
    );
    expect(executableSql).toContain(
      'd2364968ef2b56a2fb079ebf1eb45b6b',
    );
    expect(executableSql).toContain(
      '0237f3b06530c8d8799e6ce493bcfc7a',
    );
    expect(executableSql).toContain(
      "'{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'",
    );
    expect(executableSql).toContain(
      "v_owner IS DISTINCT FROM 'postgres'",
    );
    expect(executableSql).toContain(
      "v_volatility IS DISTINCT FROM 'v'",
    );
    expect(executableSql).toContain(
      "ARRAY['search_path=public']::text[]",
    );
    expect(executableSql).toContain(
      'md5(pg_get_functiondef(proc.oid))',
    );
    expect(executableSql).toContain(
      'get_income_by_source_v2 migration oncesinde zaten var',
    );
  });

  it('keeps the exact three parameters and eight result columns on V2 and V1', () => {
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.get_income_by_source_v2\(\s*p_isletme_id uuid,\s*p_start_date timestamp with time zone,\s*p_end_date timestamp with time zone\s*\)/s,
    );

    const v2Columns =
      executableSql.match(
        /CREATE FUNCTION public\.get_income_by_source_v2[\s\S]*?RETURNS TABLE\(([\s\S]*?)\)\s*LANGUAGE/,
      )?.[1] ?? '';
    expect(normalizeSql(v2Columns)).toBe(exactResult);

    const wrapperColumns =
      executableSql.match(
        /CREATE OR REPLACE FUNCTION public\.get_income_by_source[\s\S]*?RETURNS TABLE\(([\s\S]*?)\)\s*LANGUAGE sql/,
      )?.[1] ?? '';
    expect(normalizeSql(wrapperColumns)).toBe(exactResult);
    expect(executableSql).toMatch(
      /FROM public\.get_income_by_source_v2\(\s*p_isletme_id,\s*p_start_date,\s*p_end_date\s*\) AS report_row/s,
    );
  });

  it('fails closed for null tenant/dates, reverse dates, anonymous and no source', () => {
    expect(executableSql).toMatch(
      /p_isletme_id IS NULL\s+OR p_start_date IS NULL\s+OR p_end_date IS NULL\s+OR p_start_date > p_end_date/s,
    );
    expect(executableSql).toContain(
      'v_user_id IS NULL OR v_reports_can_view IS NOT TRUE',
    );
    expect(executableSql).toMatch(
      /v_has_hesaplar IS NOT TRUE\s+AND v_has_cariler IS NOT TRUE\s+AND v_has_personel IS NOT TRUE/s,
    );
  });

  it('resolves reports, three sources and savings through the canonical resolver', () => {
    for (const moduleName of [
      'raporlar',
      'hesaplar',
      'birikim',
      'cariler',
      'personel',
    ]) {
      expect(executableSql).toMatch(
        new RegExp(
          `FROM internal\\.etkin_yetki\\(p_isletme_id, '${moduleName}'\\) AS permission\\s+LIMIT 1;`,
        ),
      );
    }
    expect(executableSql).not.toMatch(/permissions\s*->/);
    expect(executableSql).not.toContain('public.isletme_users');
  });

  it('gates each source independently and applies the savings sub-permission', () => {
    expect(
      executableSql.match(/WHERE v_has_hesaplar IS TRUE/g),
    ).toHaveLength(1);
    expect(
      executableSql.match(/WHERE v_has_cariler IS TRUE/g),
    ).toHaveLength(1);
    expect(
      executableSql.match(/WHERE v_has_personel IS TRUE/g),
    ).toHaveLength(1);
    expect(executableSql).toMatch(
      /account\.type <> 'birikim'\s+OR v_has_birikim IS TRUE/s,
    );
  });

  it('applies transaction creator scope in every branch and entity scope to cari/personel', () => {
    expect(
      executableSql.match(
        /v_can_see_all_users_data IS TRUE\s+OR transaction_row\.created_by = v_user_id/g,
      ),
    ).toHaveLength(1);
    expect(
      executableSql.match(
        /transaction_row\.created_by = v_user_id\s+AND cari\.created_by = v_user_id/g,
      ),
    ).toHaveLength(1);
    expect(
      executableSql.match(
        /transaction_row\.created_by = v_user_id\s+AND employee\.created_by = v_user_id/g,
      ),
    ).toHaveLength(1);
    expect(executableSql).not.toMatch(/account\.created_by = v_user_id/);
  });

  it('tenant-scopes every source join and preserves active/archive behavior', () => {
    for (const source of [
      ['account', 'public\\.hesaplar'],
      ['cari', 'public\\.cariler'],
      ['employee', 'public\\.personel'],
    ] as const) {
      expect(executableSql).toMatch(
        new RegExp(
          `INNER JOIN ${source[1]} AS ${source[0]}[\\s\\S]{0,160}${source[0]}\\.isletme_id = p_isletme_id`,
        ),
      );
    }
    expect(executableSql).toContain('account.is_active = true');
    expect(executableSql).toContain('cari.is_active IS NOT FALSE');
    expect(executableSql).toContain('employee.is_active IS NOT FALSE');
    expect(executableSql).not.toMatch(/\.[iI]s_archived\b/);
  });

  it('preserves return sign, native totals and TRY conversion semantics', () => {
    expect(executableSql).toContain(
      "transaction_row.type IN ('cari_satis', 'cari_satis_iade')",
    );
    expect(
      executableSql.match(
        /WHEN transaction_row\.type = 'cari_satis_iade' THEN -1/g,
      ),
    ).toHaveLength(2);
    expect(
      executableSql.match(/AS total_native/g),
    ).toHaveLength(3);
    expect(executableSql).toContain(
      "rate_row.base_currency = 'TRY'",
    );
  });

  it('keeps both endpoints STABLE, SECDEF, pg_catalog-only and authenticated-only', () => {
    expect(
      executableSql.match(
        /STABLE\s+SECURITY DEFINER\s+SET search_path TO 'pg_catalog'/g,
      ),
    ).toHaveLength(2);

    for (const functionName of [
      'get_income_by_source_v2',
      'get_income_by_source',
    ]) {
      const signature =
        `public\\.${functionName}\\(\\s*uuid,\\s*timestamp with time zone,\\s*timestamp with time zone\\s*\\)`;
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
      expect(executableSql).not.toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION ${signature}\\s+TO[^;]*service_role;`,
        ),
      );
    }
  });

  it('locks the postcondition itself to both identities and every security field', () => {
    const postcondition =
      migration.match(
        /DO \$postcondition\$([\s\S]*?)\$postcondition\$;/,
      )?.[1] ?? '';

    for (const identity of [
      'public.get_income_by_source_v2(uuid,timestamp with time zone,timestamp with time zone)',
      'public.get_income_by_source(uuid,timestamp with time zone,timestamp with time zone)',
    ]) {
      expect(postcondition).toContain(identity);
    }
    expect(postcondition).toContain(
      "v_owner IS DISTINCT FROM 'postgres'",
    );
    expect(postcondition).toContain(
      "v_result IS DISTINCT FROM",
    );
    expect(postcondition).toContain(
      'v_security_definer IS DISTINCT FROM true',
    );
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
    expect(postcondition).toContain(exactResult);
  });

  it('does not alter schema objects or write user data', () => {
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

  it('documents old-client compatibility and data preservation', () => {
    expect(migration).toContain('1.5.x / ESKI CLIENT');
    expect(migration).toContain('ayni sekiz kolonu ayni sirada');
    expect(migration).toContain('Response shape degismedigi');
    expect(migration).toContain('tablo veya kullanici satirlarina yazmaz');
    expect(migration).toContain('DML/backfill yapmaz');
    expect(migration).toContain('is_archived filtresi eklenmez');
  });
});
