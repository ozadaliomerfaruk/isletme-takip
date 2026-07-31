import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260731051109_claim_push_token_atomically.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const privacySql = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260731051119_push_delivery_privacy_boundary.sql',
  ),
  'utf8',
);
const notifications = fs.readFileSync(
  path.join(process.cwd(), 'src/lib/notifications.ts'),
  'utf8',
);
const auth = fs.readFileSync(
  path.join(process.cwd(), 'src/hooks/useAuth.ts'),
  'utf8',
);

describe('atomic push-token claim contract', () => {
  it('is additive at migration time and leaves legacy 1.5.x table writes intact', () => {
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|POLICY)\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).toContain('CREATE FUNCTION public.claim_push_token_v1(');
    expect(sql).toContain('No existing token/user row is backfilled or deleted');
  });

  it('derives the actor from auth.uid and serializes every claim before row locks', () => {
    expect(sql).toContain('v_uid uuid := auth.uid()');
    expect(sql).not.toMatch(/p_user_id/i);
    expect(sql).toContain('pg_catalog.pg_advisory_xact_lock(');
    expect(sql).toContain(
      'pg_catalog.pg_advisory_xact_lock(20260731, 71612)',
    );
    expect(sql).toContain(
      'CREATE TRIGGER trg_push_token_claim_statement_v1',
    );
    expect(sql).toMatch(
      /DELETE FROM public\.push_tokens[\s\S]*?token_row\.token = v_token[\s\S]*?token_row\.user_id IS DISTINCT FROM v_uid/,
    );
    expect(sql).toContain('ON CONFLICT (user_id) DO UPDATE');
    expect(sql).toContain('PUSH_TOKEN_CLAIM_POSTCONDITION_FAILED');
  });

  it('locks down the SECURITY DEFINER boundary and checks the resulting ACL', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).toMatch(
      /REVOKE ALL[\s\S]*?public\.claim_push_token_v1\(text, text, text\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE[\s\S]*?public\.claim_push_token_v1\(text, text, text\)[\s\S]*?TO authenticated;/,
    );
    expect(sql).toContain(
      "pg_catalog.has_function_privilege(\n       'anon'",
    );
    expect(sql).toContain(
      "pg_catalog.has_function_privilege(\n       'service_role'",
    );
    expect(sql).toContain(
      'CREATE FUNCTION public.enforce_push_token_single_owner_v1()',
    );
    expect(sql).toContain(
      'OR NEW.user_id IS DISTINCT FROM v_uid',
    );
    expect(sql).toMatch(
      /REVOKE ALL[\s\S]*?public\.enforce_push_token_single_owner_v1\(\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
  });

  it('routes 1.5.7 through claim and falls back only while the RPC is missing', () => {
    expect(notifications).toContain(
      "supabase.rpc('claim_push_token_v1'",
    );
    expect(notifications).toContain("error?.code === 'PGRST202'");
    expect(notifications).toContain("error?.code === '42883'");
    expect(notifications).toContain(
      'if (!session || session.user.id !== userId)',
    );
    expect(notifications).toContain("{ onConflict: 'user_id' }");
    expect(notifications).toContain(
      'const result = pushTokenWriteTail.then(operation, operation)',
    );
    expect(notifications).toContain(
      "preference === 'false'",
    );
  });

  it('blocks token registration during deletion and exposes safe recipients only to workers', () => {
    expect(privacySql).toContain(
      'CREATE FUNCTION public.reject_push_token_for_deleting_account_v1()',
    );
    expect(privacySql).toContain(
      "job_row.state IN ('scheduled', 'pending')",
    );
    expect(privacySql).toContain(
      'business_row.scheduled_deletion_at IS NOT NULL',
    );
    expect(privacySql).toContain(
      'CREATE FUNCTION public.get_unambiguous_push_tokens_v1(',
    );
    expect(privacySql).toContain(
      'HAVING pg_catalog.count(',
    );
    expect(privacySql).toContain(
      'DISTINCT token_row.user_id',
    );
    expect(privacySql).toMatch(
      /REVOKE ALL[\s\S]*?get_unambiguous_push_tokens_v1\(uuid\[\]\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(privacySql).toMatch(
      /GRANT EXECUTE[\s\S]*?get_unambiguous_push_tokens_v1\(uuid\[\]\)[\s\S]*?TO service_role;/,
    );
    expect(privacySql).toContain(
      'This migration performs no migration-time INSERT/UPDATE/DELETE/backfill',
    );
  });

  it('bounds notification cleanup while the authenticated session is still active', () => {
    const signOutBlock = auth.slice(
      auth.indexOf('const signOut = async () =>'),
      auth.indexOf('// Şifre değiştirme bayrağını temizle'),
    );

    expect(signOutBlock).toContain(
      'await waitForNotificationCleanupBeforeSignOut(state.user.id)',
    );
    expect(signOutBlock.indexOf(
      'await waitForNotificationCleanupBeforeSignOut(state.user.id)',
    )).toBeLessThan(signOutBlock.indexOf(
      'await supabase.auth.signOut()',
    ));
    expect(signOutBlock.indexOf(
      'await supabase.auth.signOut()',
    )).toBeLessThan(signOutBlock.indexOf(
      'await finalizeNotificationsAfterSignOut()',
    ));
    expect(notifications).toContain(
      "timeoutMs = 2_500",
    );
    expect(signOutBlock).toMatch(
      /if \(error && error\.name !== 'AuthSessionMissingError'\)[\s\S]*?void restorePushTokenAfterFailedSignOut\(state\.user\.id\)[\s\S]*?throw error;/,
    );
    expect(notifications).toContain(
      'export async function restorePushTokenAfterFailedSignOut',
    );
    expect(notifications).toContain(
      'promptIfNeeded: false',
    );
    expect(notifications).toContain(
      'const queuedRemoval = enqueuePushTokenWrite(async () => {',
    );
    expect(notifications).toContain(
      'blockedPushTokenUserIds.add(userId)',
    );
    expect(notifications).toMatch(
      /Promise\.allSettled\(\[\s*queuedRemoval,[\s\S]*?cancelAllScheduledNotificationsAsync\(\),[\s\S]*?dismissAllNotificationsAsync\(\),\s*\]\)/,
    );
    const signOutCleanup = notifications.slice(
      notifications.indexOf(
        'export async function clearNotificationsForSignOut',
      ),
      notifications.indexOf(
        'export async function waitForNotificationCleanupBeforeSignOut',
      ),
    );
    expect(signOutCleanup).not.toContain(
      'unregisterForNotificationsAsync',
    );
    expect(notifications).toMatch(
      /export async function finalizeNotificationsAfterSignOut[\s\S]*?unregisterForNotificationsAsync\(\)/,
    );
  });
});
