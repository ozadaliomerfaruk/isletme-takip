import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_FILENAME =
  '20260729045601_notify_linked_users_worker_auth.sql';
const SEED_RUNBOOK_FILENAME = 'notify-linked-users-vault-seed.sql';
const migrationPath = path.join(
  ROOT,
  'supabase',
  'migrations',
  MIGRATION_FILENAME,
);
const seedRunbookPath = path.join(
  ROOT,
  'docs',
  'security',
  'taslak',
  SEED_RUNBOOK_FILENAME,
);

function stripLineComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

function extractFunction(sql: string, signature: string): string {
  const start = sql.indexOf(signature);
  const end = sql.indexOf('$function$;', start);

  if (start < 0 || end < 0) {
    throw new Error(`${signature} could not be extracted from migration`);
  }

  return sql.slice(start, end + '$function$;'.length);
}

const rawMigration = fs.readFileSync(migrationPath, 'utf8');
const migrationSql = stripLineComments(rawMigration);
const rawSeedRunbook = fs.readFileSync(seedRunbookPath, 'utf8');
const seedRunbookSql = stripLineComments(rawSeedRunbook);
const triggerFunction = extractFunction(
  migrationSql,
  'CREATE OR REPLACE FUNCTION public.notify_linked_users_on_islem_insert()',
);

describe('notify-linked-users worker auth migration contract', () => {
  it('keeps environment credential provisioning out of the portable migration', () => {
    expect(migrationSql).not.toContain('FROM cron.job');
    expect(migrationSql).not.toContain('vault.create_secret');
    expect(migrationSql).not.toContain('DO $operation$');
    expect(migrationSql).not.toContain('DO $migration$');
    expect(migrationSql).not.toContain('current_setting(');
    expect(migrationSql).toContain(
      "ds.name = 'notify_linked_users_service_role_key'",
    );
    expect(triggerFunction).toMatch(
      /IF v_service_role_key IS NULL OR v_service_role_key = '' THEN\s+RETURN NEW;/,
    );
  });

  it('requires all three expected cron rows to contain the same non-null JWT', () => {
    expect(seedRunbookSql).toContain("'delete-scheduled-accounts-daily'");
    expect(seedRunbookSql).toContain(
      "'process-scheduled-transactions'",
    );
    expect(seedRunbookSql).toContain("'send-z-report-evening'");
    expect(seedRunbookSql).toContain(
      'pg_catalog.count(DISTINCT w.token)::integer',
    );

    // COUNT(DISTINCT token) ignores NULL. A separate non-null-token count is
    // required so one missing Bearer value cannot pass as "three jobs, one key".
    expect(seedRunbookSql).toContain(
      'pg_catalog.count(w.token)::integer',
    );
    expect(seedRunbookSql).toMatch(/\bv_job_count\s*<>\s*3\b/);
    expect(seedRunbookSql).toMatch(/\bv_token_count\s*<>\s*3\b/);
    expect(seedRunbookSql).toMatch(
      /\bv_distinct_key_count\s*<>\s*1\b/,
    );
  });

  it('validates role, project and issuer before a server-side Vault seed', () => {
    expect(seedRunbookSql).toContain('FROM cron.job AS j');
    expect(seedRunbookSql).toContain(
      'FROM vault.decrypted_secrets AS ds',
    );
    expect(seedRunbookSql).toContain('PERFORM vault.create_secret(');
    expect(seedRunbookSql).toContain(
      "'notify_linked_users_service_role_key'",
    );
    expect(seedRunbookSql).toContain(
      "v_payload ->> 'role' IS DISTINCT FROM 'service_role'",
    );
    expect(seedRunbookSql).toContain(
      "v_payload ->> 'ref' IS DISTINCT FROM 'ulohxpkhesxozwnlnonb'",
    );
    expect(seedRunbookSql).toContain(
      "v_payload ->> 'iss' IS DISTINCT FROM 'supabase'",
    );

    expect(rawSeedRunbook).not.toMatch(
      /\beyJ[A-Za-z0-9_-]+[.]eyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+\b/,
    );
  });

  it('never outputs or silently overwrites an existing Vault credential', () => {
    expect(seedRunbookSql).toMatch(
      /IF v_existing_count > 1 THEN[\s\S]*?RAISE EXCEPTION/,
    );
    expect(seedRunbookSql).toMatch(
      /v_existing_secret IS DISTINCT FROM v_service_role_key[\s\S]*?RAISE EXCEPTION/,
    );
    expect(seedRunbookSql).toMatch(
      /ELSIF v_existing_count = 1 THEN[\s\S]*?RETURN;/,
    );
    expect(seedRunbookSql).not.toContain('vault.update_secret');
    expect(seedRunbookSql).not.toMatch(/\bUPDATE\s+vault\./i);
    expect(seedRunbookSql).not.toMatch(/\bDELETE\s+FROM\s+vault\./i);
    expect(seedRunbookSql).not.toMatch(
      /\b(?:SELECT|RETURN|RAISE NOTICE)\s+v_service_role_key\b/i,
    );
    expect(seedRunbookSql).not.toMatch(
      /MESSAGE\s*=\s*v_service_role_key/i,
    );
  });

  it('uses an empty search path, qualified objects and a narrow trigger ACL', () => {
    expect(triggerFunction).toMatch(
      /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path TO ''/,
    );
    expect(triggerFunction).toContain('FROM public.cari_links AS cl');
    expect(triggerFunction).toContain(
      'FROM vault.decrypted_secrets AS ds',
    );
    expect(triggerFunction).toContain('PERFORM net.http_post(');
    expect(triggerFunction).toContain(
      'headers := pg_catalog.jsonb_build_object(',
    );
    expect(triggerFunction).toContain(
      'body := pg_catalog.jsonb_build_object(',
    );
    expect(migrationSql).toMatch(
      /ALTER FUNCTION public\.notify_linked_users_on_islem_insert\(\) OWNER TO postgres;/,
    );
    expect(migrationSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.notify_linked_users_on_islem_insert\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
  });

  it('sends only the canonical row id and cannot roll back the financial insert', () => {
    const requestBodyStart = triggerFunction.indexOf('body :=');
    const requestBodyEnd = triggerFunction.indexOf(
      ');',
      requestBodyStart,
    );
    const requestBody = triggerFunction.slice(
      requestBodyStart,
      requestBodyEnd,
    );

    expect(requestBody).toContain("'id', NEW.id");
    expect(requestBody).not.toMatch(
      /NEW\.(?:amount|description|type|source_currency)/,
    );
    expect(triggerFunction).toMatch(
      /EXCEPTION\s+WHEN OTHERS THEN[\s\S]*?RETURN NEW;/,
    );
  });

  it('does not delete, rewrite or reshape existing user data', () => {
    expect(migrationSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(migrationSql).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/i);
    expect(migrationSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(migrationSql).not.toMatch(/\bUPDATE\s+public\./i);
    expect(seedRunbookSql).not.toMatch(/\bDELETE\s+FROM\s+public\./i);
    expect(seedRunbookSql).not.toMatch(/\bUPDATE\s+public\./i);
    expect(seedRunbookSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(seedRunbookSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(seedRunbookSql).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/i);
  });
});
