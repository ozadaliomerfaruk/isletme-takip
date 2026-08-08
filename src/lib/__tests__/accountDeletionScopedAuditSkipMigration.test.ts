import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION =
  '20260805152713_scope_audit_skip_to_account_deletion.sql';
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations', MIGRATION),
  'utf8',
);
const executableSql = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('scoped account-deletion audit skip migration contract', () => {
  it('does not change tables, constraints, triggers, RLS, or API signatures', () => {
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(executableSql).not.toMatch(/\bDROP\b/i);
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executableSql).not.toMatch(/\bUPDATE\s+public\./i);
    expect(executableSql).not.toMatch(/\bCREATE\s+TRIGGER\b/i);
    expect(sql).toContain("'public.log_islem_changes()'");
  });

  it('requires a pending durable job for the same business', () => {
    expect(sql).toContain(
      'FROM internal.account_deletion_jobs_v1 AS deletion_job',
    );
    expect(sql).toContain(
      'deletion_job.isletme_id = OLD.isletme_id',
    );
    expect(sql).toContain("deletion_job.state = ''pending''");
  });

  it('requires that exact job user to be absent from Auth', () => {
    expect(sql).toContain('FROM auth.users AS deleting_auth_user');
    expect(sql).toContain(
      'deleting_auth_user.id = deletion_job.user_id',
    );
    expect(sql).toContain('AND NOT EXISTS (');
  });

  it('keeps the missing-actor guard and preserves the function contract', () => {
    expect(sql).toContain("'FROM auth.users AS auth_user'");
    expect(sql).toContain('proc.proowner IS DISTINCT FROM v_owner');
    expect(sql).toContain('proc.proacl IS DISTINCT FROM v_acl');
    expect(sql).toContain(
      'proc.prosecdef IS DISTINCT FROM v_security_definer',
    );
    expect(sql).toContain('proc.proconfig IS DISTINCT FROM v_config');
    expect(sql).toContain('proc.prolang IS DISTINCT FROM v_language');
  });

  it('documents that old clients and ordinary deletes are unchanged', () => {
    expect(sql).toContain('1.5.x / OLD CLIENT EFFECT');
    expect(sql).toContain(
      'Normal transaction and business deletes keep their existing audit behavior.',
    );
  });
});
