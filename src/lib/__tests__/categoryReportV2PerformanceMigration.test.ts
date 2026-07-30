import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const BASE_MIGRATION_PATH =
  'supabase/migrations/20260729092919_add_category_report_v2_permission_projection.sql';
const PERF_MIGRATION_PATH =
  'supabase/migrations/20260729095349_optimize_category_report_v2_allowed_types.sql';

const migration = fs.readFileSync(
  path.join(ROOT, PERF_MIGRATION_PATH),
  'utf8',
);
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');
const functionBody =
  executableSql.match(
    /CREATE OR REPLACE FUNCTION public\.get_category_report_v2[\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/,
  )?.[1] ?? '';

const exactResult =
  'kategori_id uuid, kategori_adi text, kategori_renk text, kategori_icon text, parent_id uuid, islem_count bigint, total_amount numeric';

function normalizeSql(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

describe('P0-S8 category report v2 performance correction migration', () => {
  it('ilk V2 migrationindan sonra siralanir ve yalniz V2 govdesini replace eder', () => {
    expect(PERF_MIGRATION_PATH.localeCompare(BASE_MIGRATION_PATH)).toBeGreaterThan(0);
    expect(executableSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_category_report_v2\(/,
    );
    expect(executableSql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_category_report\(\s/,
    );
  });

  it('canli V2 ve degismeyen wrapper snapshotlarini md5 ile kilitler', () => {
    expect(executableSql).toContain(
      '90f07fe33af89462f0dcc3a03f6790e8',
    );
    expect(executableSql).toContain(
      '41ac22948a7b42115976878d4cfca98f',
    );
    expect(executableSql).toContain(
      "'{postgres=X/postgres,authenticated=X/postgres}'",
    );
    expect(executableSql).toContain(
      "v_owner IS DISTINCT FROM 'postgres'",
    );
    expect(executableSql).toContain(
      "ARRAY['search_path=pg_catalog']::text[]",
    );
  });

  it('exact imza/sonuc ve fonksiyon-kapsamli custom plan sozlesmesini korur', () => {
    expect(executableSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_category_report_v2\(\s*p_isletme_id uuid,\s*p_types text\[\],\s*p_start_date timestamp with time zone,\s*p_end_date timestamp with time zone\s*\)/s,
    );

    const returnColumns =
      executableSql.match(
        /CREATE OR REPLACE FUNCTION public\.get_category_report_v2[\s\S]*?RETURNS TABLE\(([\s\S]*?)\)\s*LANGUAGE/,
      )?.[1] ?? '';
    expect(normalizeSql(returnColumns)).toBe(exactResult);
    expect(executableSql).toMatch(
      /LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path TO 'pg_catalog'\s+SET plan_cache_mode TO 'force_custom_plan'/,
    );
    expect(executableSql).toContain(
      "'plan_cache_mode=force_custom_plan'",
    );
  });

  it('canonical tip-modul eslemesini istek basi yapar, islem satiri basi yapmaz', () => {
    expect(functionBody).toContain(
      'v_allowed_types text[] := ARRAY[]::text[]',
    );
    expect(functionBody).toMatch(
      /FROM pg_catalog\.unnest\(p_types\) WITH ORDINALITY\s+AS requested_type\(type_name, ordinality\)[\s\S]*?internal\.islem_tipi_modulu\(requested_type\.type_name\)\s+<@ v_allowed_source_modules/s,
    );
    expect(functionBody).toContain(
      'transaction_row.type = ANY(v_allowed_types)',
    );
    expect(functionBody).not.toContain(
      'internal.islem_tipi_modulu(transaction_row.type)',
    );
    expect(functionBody).not.toContain('CROSS JOIN LATERAL');
  });

  it('bilinmeyen tip fail-closed ve bos izinli tip seti fail-closed kalir', () => {
    expect(functionBody).toMatch(
      /FROM pg_catalog\.unnest\(p_types\) AS requested_type\(type_name\)\s+WHERE requested_type\.type_name IS NULL\s+OR internal\.islem_tipi_modulu\(requested_type\.type_name\) IS NULL/s,
    );
    expect(functionBody).toMatch(
      /IF pg_catalog\.cardinality\(v_allowed_types\) < 1 THEN\s+RETURN;/,
    );
  });

  it('rapor, kaynak, creator ve Urunler gate semantigini korur', () => {
    for (const moduleName of [
      'raporlar',
      'hesaplar',
      'cariler',
      'urunler',
      'personel',
    ]) {
      expect(functionBody).toContain(
        `internal.etkin_yetki(p_isletme_id, '${moduleName}')`,
      );
    }
    expect(functionBody).toMatch(
      /v_can_see_all_users_data IS TRUE\s+OR transaction_row\.created_by = v_user_id/,
    );
    expect(functionBody).toMatch(
      /WHERE v_has_urunler IS TRUE\s+AND product\.is_active IS NOT FALSE/,
    );
  });

  it('MATERIALIZED izinli seti, iki aggregate dali ve pasif/arsiv semantigini korur', () => {
    expect(functionBody).toContain('eligible_islemler AS MATERIALIZED');
    expect(functionBody).toContain('distributed.resolved_kategori_id AS kategori_id');
    expect(functionBody).toContain('UNION ALL');
    expect(functionBody).toMatch(
      /NOT EXISTS \(\s*SELECT 1\s+FROM public\.urun_hareketler AS movement_check/,
    );
    expect(functionBody).toContain(
      '(account.id IS NULL OR account.is_active = true)',
    );
    expect(functionBody).toContain(
      '(cari.id IS NULL OR cari.is_active IS NOT FALSE)',
    );
    expect(functionBody).not.toMatch(/\.[iI]s_archived\b/);
  });

  it('authenticated-only ACLyi tekrar kilitler ve veri/schema/index DDLi yapmaz', () => {
    expect(executableSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_category_report_v2\([\s\S]*?\) FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(executableSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_category_report_v2\([\s\S]*?\) TO authenticated;/,
    );
    expect(executableSql).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER TABLE|DROP TABLE|CREATE INDEX|DROP INDEX)\b/i,
    );
  });
});
