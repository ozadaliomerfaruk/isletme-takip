import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION =
  '20260805152430_skip_islem_audit_on_business_cascade.sql';
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations', MIGRATION),
  'utf8',
);
const executableSql = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('account deletion business-cascade audit migration contract', () => {
  it('accepts the exact production and clean-replay DELETE branch indentation', () => {
    expect(sql).toContain("v_clean_replay_before constant text := '  IF TG_OP");
    expect(sql).toContain('v_source_before');
  });
  it('does not change tables, constraints, triggers, RLS, or API signatures', () => {
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(executableSql).not.toMatch(/\bDROP\b/i);
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executableSql).not.toMatch(/\bUPDATE\s+public\./i);
    expect(executableSql).not.toMatch(/\bCREATE\s+TRIGGER\b/i);
    expect(sql).toContain("'public.log_islem_changes()'");
    expect(sql).toContain("v_result_type IS DISTINCT FROM 'trigger'");
  });

  it('skips audit only after the parent business is already absent', () => {
    expect(sql).toContain("v_before constant text := '    IF TG_OP = ''DELETE'' THEN'");
    expect(sql).toContain('IF NOT EXISTS (');
    expect(sql).toContain('FROM public.isletmeler AS business_row');
    expect(sql).toContain('WHERE business_row.id = OLD.isletme_id');
    expect(sql).toContain('RETURN OLD;');
    expect(sql).toContain(
      'MIGRATION_POSTCONDITION_FAILED:business_cascade_guard_missing',
    );
  });

  it('requires the missing-Auth-actor guard from the prior migration', () => {
    expect(sql).toContain("'FROM auth.users AS auth_user'");
  });

  it('preserves owner, grants, security mode, language and config', () => {
    expect(sql).toContain('proc.proowner IS DISTINCT FROM v_owner');
    expect(sql).toContain('proc.proacl IS DISTINCT FROM v_acl');
    expect(sql).toContain(
      'proc.prosecdef IS DISTINCT FROM v_security_definer',
    );
    expect(sql).toContain('proc.proconfig IS DISTINCT FROM v_config');
    expect(sql).toContain('proc.prolang IS DISTINCT FROM v_language');
  });

  it('documents that old clients and active-business audit stay unchanged', () => {
    expect(sql).toContain('1.5.x / OLD CLIENT EFFECT');
    expect(sql).toContain(
      'Active businesses keep the same transaction audit behavior.',
    );
  });
});
