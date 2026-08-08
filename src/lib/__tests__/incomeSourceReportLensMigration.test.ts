import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_PATH = path.join(
  ROOT,
  'supabase/migrations/20260806212550_add_historical_income_source_lens.sql',
);
const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('historical income source report lens migration', () => {
  it('adds a separate RPC without changing the nominal V2 endpoint or user data', () => {
    expect(executableSql).toContain(
      'CREATE FUNCTION public.get_income_by_source_lens_v1',
    );
    expect(executableSql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_income_by_source_v2/i,
    );
    expect(executableSql).not.toMatch(
      /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+public\.)\b/im,
    );
    expect(migration).toContain('1.5.x / ESKI CLIENT');
    expect(migration).toContain('DML/backfill yapmaz');
  });

  it('preserves source permissions, active/archive behavior, savings and return netting', () => {
    for (const moduleName of [
      'raporlar',
      'hesaplar',
      'birikim',
      'cariler',
      'personel',
    ]) {
      expect(executableSql).toContain(
        `internal.etkin_yetki_v2(p_isletme_id, '${moduleName}')`,
      );
    }
    expect(executableSql).toContain('account.is_active IS TRUE');
    expect(executableSql).toContain('customer.is_active IS TRUE');
    expect(executableSql).toContain('employee.is_active IS TRUE');
    expect(executableSql).not.toMatch(/\bis_archived\b/);
    expect(executableSql).toContain("account.type::text <> 'birikim'");
    expect(executableSql).toContain("transaction_row.type::text = 'cari_satis_iade'");
    expect(executableSql).toContain('income.direction_sign');
  });

  it('uses transaction-day source and target references and never falls back to one', () => {
    expect(executableSql).toContain(
      'LEAST(transaction_row.date::date, v_reference_today)',
    );
    expect(executableSql).toContain("WHEN 'XAU' THEN daily.gram_altin_try");
    expect(executableSql).toContain("WHEN 'XAG' THEN daily.gram_gumus_try");
    expect(executableSql).toContain('rate.source_rate / rate.lens_rate');
    expect(executableSql).toContain(
      'rate.source_rate * rate.current_cpi / rate.transaction_cpi',
    );
    expect(executableSql).toContain('daily.gun >= rate_key.reference_day - 7');
    expect(executableSql).toContain('income.rate_complete IS NOT TRUE');
    expect(executableSql).toContain("'missing_rate_count'");
    expect(executableSql).not.toContain('COALESCE(source_observation.source_rate, 1)');
  });

  it('is a locked-down stable SECURITY DEFINER RPC for authenticated callers only', () => {
    expect(executableSql).toMatch(
      /STABLE\s+SECURITY DEFINER\s+SET search_path TO 'pg_catalog'/s,
    );
    expect(executableSql).toContain("SET plan_cache_mode TO 'force_custom_plan'");
    expect(executableSql).toMatch(
      /REVOKE ALL\s+ON FUNCTION public\.get_income_by_source_lens_v1\([\s\S]*?\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(executableSql).toMatch(
      /GRANT EXECUTE\s+ON FUNCTION public\.get_income_by_source_lens_v1\([\s\S]*?\)\s+TO authenticated;/,
    );
  });
});
