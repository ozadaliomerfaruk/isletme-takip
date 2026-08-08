import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION =
  '20260804220441_allow_owner_create_on_passive_cari_personel.sql';
const migrationPath = path.join(ROOT, 'supabase/migrations', MIGRATION);
const sql = fs.readFileSync(migrationPath, 'utf8');
const executableSql = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('owner passive cari/personel create migration contract', () => {
  it('patches only the canonical create RPC entity gates', () => {
    expect(sql).toContain(
      "'public.create_islem_atomik_v2(uuid,jsonb)'",
    );
    expect(executableSql).not.toMatch(
      /(?:update_islem_atomik_v2|complete_ileri_tarihli_islem_atomik)/,
    );
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(executableSql).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(executableSql).not.toMatch(
      /\b(?:DELETE|UPDATE|INSERT)\s+(?:FROM|INTO|public\.)/i,
    );
    expect(executableSql).not.toMatch(/\b(?:DROP|TRUNCATE)\b/i);
  });

  it('allows only the owner to bypass passive cari and personel gates', () => {
    expect(sql).toContain(
      "v_cari_after constant text := E'      AND (c.is_active IS TRUE OR v_owner_id = v_uid)\\n      AND c.is_archived IS FALSE'",
    );
    expect(sql).toContain(
      "v_personel_after constant text := E'      AND (p.is_active IS TRUE OR v_owner_id = v_uid)\\n      AND p.is_archived IS FALSE'",
    );
    expect(sql).not.toMatch(/can_see_passive|manager/i);
  });

  it('preserves the passive-account exception and RPC contract', () => {
    expect(sql).toContain(
      "pg_catalog.replace(v_definition, E'\\r\\n', E'\\n')",
    );
    expect(sql).toContain(
      "v_account_owner_gate constant text := E'      AND (h.is_active IS TRUE OR v_owner_id = v_uid)\\n      AND h.is_archived IS FALSE'",
    );
    expect(sql).toContain('IF v_cari_match_count <> 1 THEN');
    expect(sql).toContain('IF v_personel_match_count <> 1 THEN');
    expect(sql).toContain('proc.proowner IS DISTINCT FROM v_owner');
    expect(sql).toContain('proc.proacl IS DISTINCT FROM v_acl');
    expect(sql).toContain(
      'proc.prosecdef IS DISTINCT FROM v_security_definer',
    );
    expect(sql).toContain('proc.proconfig IS DISTINCT FROM v_config');
    expect(sql).toContain(
      'pg_catalog.pg_get_function_identity_arguments(proc.oid)',
    );
    expect(sql).toContain('pg_catalog.pg_get_function_result(proc.oid)');
  });

  it('documents unchanged old-client behavior outside the owner exception', () => {
    expect(sql).toContain('1.5.x / ESKI CLIENT ETKISI');
    expect(sql).toContain('ortak kullanici ve arsivli kayit reddi');
  });
});
