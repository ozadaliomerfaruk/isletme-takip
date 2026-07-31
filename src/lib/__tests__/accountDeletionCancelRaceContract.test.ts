import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260731051127_account_deletion_cancel_race_fence.sql',
);
const sqlTestPath = path.join(
  process.cwd(),
  'supabase/tests/account_deletion_cancel_race_contract.sql',
);
const authHookPath = path.join(process.cwd(), 'src/hooks/useAuth.ts');

const migration = fs.readFileSync(migrationPath, 'utf8');
const sqlTest = fs.readFileSync(sqlTestPath, 'utf8');
const authHook = fs.readFileSync(authHookPath, 'utf8');

function functionBody(signatureStart: string, nextMarker: string): string {
  const start = migration.indexOf(signatureStart);
  const end = migration.indexOf(nextMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(`Migration section missing: ${signatureStart}`);
  }
  return migration.slice(start, end);
}

describe('account deletion scheduled-to-pending race fence', () => {
  it('does not mutate user data while the migration itself is applied', () => {
    const withoutDollarQuotedBodies = migration.replace(
      /\$([a-z_][a-z0-9_]*)\$[\s\S]*?\$\1\$/gi,
      '',
    );

    expect(withoutDollarQuotedBodies).not.toMatch(
      /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+(?:public|internal|auth|storage)\./i,
    );
  });

  it('refuses to turn a pending job back into scheduled', () => {
    const scheduleBody = functionBody(
      'CREATE OR REPLACE FUNCTION public.schedule_own_account_deletion_v1()',
      'CREATE OR REPLACE FUNCTION public.cancel_own_account_deletion_v1()',
    );

    expect(scheduleBody).toMatch(
      /FROM internal\.account_deletion_jobs_v1[\s\S]*?FOR UPDATE;/,
    );
    expect(scheduleBody).toMatch(
      /v_existing_job\.state = 'pending'[\s\S]*?ACCOUNT_DELETE_ALREADY_PROCESSING/,
    );
    expect(scheduleBody.indexOf('ACCOUNT_DELETE_ALREADY_PROCESSING')).toBeLessThan(
      scheduleBody.indexOf('UPDATE public.isletmeler'),
    );
  });

  it('cancels only scheduled and clears only its matching business timestamp', () => {
    const cancelBody = functionBody(
      'CREATE OR REPLACE FUNCTION public.cancel_own_account_deletion_v1()',
      'CREATE FUNCTION public.guard_pending_account_deletion_timestamp_v1()',
    );

    expect(cancelBody).toMatch(
      /v_job\.state = 'pending'[\s\S]*?ACCOUNT_DELETE_ALREADY_PROCESSING/,
    );
    expect(cancelBody).toContain(
      "IF v_job.state IS DISTINCT FROM 'scheduled' THEN",
    );
    expect(cancelBody).toMatch(
      /job_row\.state = 'scheduled'[\s\S]*?RETURNING[\s\S]*?job_row\.scheduled_deletion_at/,
    );
    expect(cancelBody).toMatch(
      /business_row\.id = v_cancelled_isletme_id[\s\S]*?business_row\.scheduled_deletion_at[\s\S]*?IS NOT DISTINCT FROM v_cancelled_due_at/,
    );
    expect(cancelBody).not.toContain(
      "job_row.state IN ('scheduled', 'pending')",
    );
  });

  it('uses a narrow NOWAIT legacy trigger with the same stable error', () => {
    expect(migration).toContain(
      'BEFORE UPDATE OF scheduled_deletion_at',
    );
    expect(migration).toMatch(
      /WHEN \([\s\S]*?OLD\.scheduled_deletion_at[\s\S]*?IS DISTINCT FROM NEW\.scheduled_deletion_at/,
    );
    expect(migration).toContain('FOR UPDATE NOWAIT');
    expect(migration).toMatch(
      /WHEN lock_not_available[\s\S]*?ACCOUNT_DELETE_ALREADY_PROCESSING/,
    );
    expect(migration).toMatch(
      /v_job_state IN \('scheduled', 'cancelled'\)[\s\S]*?NEW\.scheduled_deletion_at IS NULL[\s\S]*?state = 'cancelled'/,
    );
    expect(migration).toMatch(
      /NEW\.scheduled_deletion_at[\s\S]*?state = 'scheduled'[\s\S]*?claimed_at = NULL/,
    );
  });

  it('keeps a local SQL fixture for false, pending and legacy-write boundaries', () => {
    expect(sqlTest).toContain(
      'ACCOUNT_DELETE_CANCEL_MISSING_MUST_BE_FALSE',
    );
    expect(sqlTest).toContain(
      'ACCOUNT_DELETE_CANCEL_CANCELLED_MUST_BE_FALSE',
    );
    expect(sqlTest).toContain(
      'ACCOUNT_DELETE_CANCEL_COMPLETED_MUST_BE_FALSE',
    );
    expect(sqlTest).toContain(
      'ACCOUNT_DELETE_CANCEL_PENDING_MUST_FAIL',
    );
    expect(sqlTest).toContain(
      'ACCOUNT_DELETE_SCHEDULE_PENDING_MUST_FAIL',
    );
    expect(sqlTest).toContain(
      'ACCOUNT_DELETE_LEGACY_PENDING_UPDATE_MUST_FAIL',
    );
    expect(sqlTest).toContain(
      'ACCOUNT_DELETE_LEGACY_CANCEL_NOT_SYNCED',
    );
    expect(sqlTest).toContain(
      'ACCOUNT_DELETE_LEGACY_RESCHEDULE_NOT_SYNCED',
    );
    expect(sqlTest).toContain(
      'ACCOUNT_DELETE_LEGACY_REOPEN_NOT_SYNCED',
    );
    expect(sqlTest).toContain('FOR UPDATE NOWAIT');
  });

  it('does not treat an RPC false result as a successful client cancellation', () => {
    expect(authHook).toMatch(
      /data: cancelled[\s\S]{0,180}'cancel_own_account_deletion_v1'/,
    );
    expect(authHook).toContain('if (cancelled !== true)');
    expect(authHook).toContain("i18n.t('errors:general.tryAgain')");
    expect(authHook.indexOf('if (cancelled !== true)')).toBeLessThan(
      authHook.indexOf('// No-owned kullanıcı'),
    );
  });
});
