import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION =
  '20260805152136_fix_account_deletion_audit_actor_fk.sql';
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations', MIGRATION),
  'utf8',
);
const executableSql = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('account deletion audit actor FK migration contract', () => {
  it('does not change tables, constraints, triggers, RLS, or API signatures', () => {
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(executableSql).not.toMatch(/\bDROP\b/i);
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executableSql).not.toMatch(/\bUPDATE\s+public\./i);
    expect(executableSql).not.toMatch(/\bCREATE\s+TRIGGER\b/i);
    expect(sql).toContain("'public.log_islem_changes()'");
    expect(sql).toContain("v_result_type IS DISTINCT FROM 'trigger'");
    expect(sql).toContain(
      "ARRAY['search_path=public, pg_temp']::text[]",
    );
  });

  it('keeps an existing Auth actor and nulls only a missing actor', () => {
    expect(sql).toContain('FROM auth.users AS auth_user');
    expect(sql).toContain(
      'WHEN auth.uid() IS NOT NULL THEN auth.uid()',
    );
    expect(sql).toContain('ELSE OLD.updated_by');
    expect(sql).toContain('ELSE NEW.updated_by');
    expect(sql).toContain(
      'MIGRATION_POSTCONDITION_FAILED:audit_actor_guard_missing',
    );
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

  it('documents that old clients and active-user attribution are unchanged', () => {
    expect(sql).toContain('1.5.x / OLD CLIENT EFFECT');
    expect(sql).toContain(
      'Active-user updates/deletes keep the same performed_by UUID.',
    );
  });
});
