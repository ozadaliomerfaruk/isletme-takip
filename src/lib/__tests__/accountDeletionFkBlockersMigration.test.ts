import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION =
  '20260805151532_fix_scheduled_account_deletion_fk_blockers.sql';
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations', MIGRATION),
  'utf8',
);
const executableSql = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('scheduled account deletion FK blocker migration contract', () => {
  it('does not alter FK, table, trigger, RLS, or public API contracts', () => {
    expect(sql).toContain(
      "pg_catalog.replace(v_definition, E'\\r\\n', E'\\n')",
    );
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(executableSql).not.toMatch(/\bDROP\b/i);
    expect(executableSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(executableSql).not.toMatch(/\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\b/i);
    expect(executableSql).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(sql).toContain(
      "'public.prepare_account_deletion_storage_v1(uuid)'",
    );
    expect(sql).toContain(
      "v_identity_arguments IS DISTINCT FROM 'p_user_id uuid'",
    );
    expect(sql).toContain('proc.proowner IS DISTINCT FROM v_owner');
    expect(sql).toContain('proc.proacl IS DISTINCT FROM v_acl');
    expect(sql).toContain(
      'proc.prosecdef IS DISTINCT FROM v_security_definer',
    );
  });

  it('deletes only same-business invite blockers for the deleting user', () => {
    expect(sql).toContain(
      'DELETE FROM public.isletme_invites AS invite_row',
    );
    expect(sql).toContain('WHERE v_job.isletme_id IS NOT NULL');
    expect(sql).toContain(
      'AND invite_row.isletme_id = v_job.isletme_id',
    );
    expect(sql).toContain('invite_row.invited_by = v_job.user_id');
    expect(sql).toContain('invite_row.accepted_by = v_job.user_id');
    expect(executableSql).not.toMatch(
      /DELETE\s+FROM\s+(?!public\.isletme_invites\b)/i,
    );
  });

  it('keeps the cleanup behind every active-user and residue fence', () => {
    const gate = sql.indexOf(
      'IF v_auth_user_exists AND v_remaining_count = 0 THEN',
    );
    const cleanup = sql.indexOf(
      'DELETE FROM public.isletme_invites AS invite_row',
      gate,
    );
    const detach = sql.indexOf('PERFORM pg_catalog.set_config(', cleanup);

    expect(gate).toBeGreaterThan(-1);
    expect(cleanup).toBeGreaterThan(gate);
    expect(cleanup).toBeLessThan(detach);
    expect(sql).toContain("'IF v_job.state <> ''pending'' THEN'");
    expect(sql).toContain(
      "'account_deletion_has_post_due_user_activity_v1'",
    );
    expect(sql).toContain(
      "'account_deletion_has_post_due_business_activity_v1'",
    );
    expect(sql).toContain(
      "'ACCOUNT_DELETE_OTHER_BUSINESS_MEMBERS_PRESENT'",
    );
    expect(sql).toContain('FROM public.isletme_users AS member_row');
    expect(sql).toContain(
      'member_row.isletme_id = v_job.isletme_id',
    );
    expect(sql).toContain('member_row.user_id <> v_job.user_id');
    // v_member_before is also the syntactic suffix of v_member_after. Treating
    // its presence as drift after CREATE OR REPLACE causes a false rollback.
    expect(sql).not.toContain(
      'OR pg_catalog.strpos(v_definition, v_member_before) <> 0',
    );
  });

  it('keeps category validation invoker-scoped and skips audit-only updates', () => {
    expect(sql).toContain("'public.check_kategori_no_cycle()'");
    expect(sql).toContain("'public.check_kategori_type_match()'");
    expect(sql).toContain('proc.prosecdef IS NOT FALSE');
    expect(sql).toContain("ARRAY['search_path=pg_catalog']::text[]");
    expect(sql).toContain("pg_catalog.strpos(v_definition, E'\\r\\n')");
    expect(sql).toContain(
      'NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id',
    );
    expect(sql).toContain('NEW.type IS NOT DISTINCT FROM OLD.type');
    expect(sql).toContain('FROM public.kategoriler');
    expect(sql).toContain("attribute_row.attname = 'parent_id'");
    expect(sql.match(/\sRETURN;\s/g)).toHaveLength(2);
  });

  it('documents that old clients and active users are unchanged', () => {
    expect(sql).toContain('1.5.x / OLD CLIENT EFFECT');
    expect(sql).toContain('Active users keep the same category and invite behavior');
  });
});
