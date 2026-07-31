import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260731054324_push_recipient_account_deletion_fence.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('push recipient account-deletion fence contract', () => {
  it('preserves the worker RPC signature without migration-time row changes', () => {
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.get_unambiguous_push_tokens_v1(',
    );
    expect(sql).toContain('p_user_ids uuid[]');
    expect(sql).toContain('RETURNS TABLE (');
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO|FROM|public\.|internal\.)/i);
    expect(sql).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN|FUNCTION)\b/i);
  });

  it('omits both durable and legacy deletion requests in the same snapshot', () => {
    expect(sql).toContain(
      'FROM internal.account_deletion_jobs_v1 AS job_row',
    );
    expect(sql).toContain(
      "job_row.state IN ('scheduled', 'pending')",
    );
    expect(sql).toContain(
      'business_row.scheduled_deletion_at IS NOT NULL',
    );
    expect(sql).toContain(
      'HAVING pg_catalog.count(',
    );
    expect(sql).toContain(
      'DISTINCT token_row.user_id',
    );
  });

  it('locks the private lookup behind one hardened service-role RPC', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).toMatch(
      /REVOKE ALL[\s\S]*?get_unambiguous_push_tokens_v1\(uuid\[\]\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE[\s\S]*?get_unambiguous_push_tokens_v1\(uuid\[\]\)[\s\S]*?TO service_role;/,
    );
    expect(sql).toContain(
      'PUSH_RECIPIENT_DELETION_FENCE_PRECONDITION_FUNCTION_DRIFT',
    );
    expect(sql).toContain(
      'PUSH_RECIPIENT_DELETION_FENCE_POSTCONDITION_FAILED',
    );
  });
});
