-- ENVIRONMENT OPERATION — NOT A PORTABLE SCHEMA MIGRATION
--
-- Purpose:
--   Seed the production-only Vault secret used by
--   public.notify_linked_users_on_islem_insert().
--
-- Safety:
--   * The credential is copied entirely inside PostgreSQL from three already
--     active cron jobs. It is never selected, logged, or embedded in this file.
--   * All three jobs must contain the exact same JWT.
--   * role, project ref, and issuer claims must match this project.
--   * An existing different/duplicate secret fails closed; it is never
--     overwritten automatically.
--   * No business table, column, user, or transaction row is changed.

DO $operation$
DECLARE
  v_service_role_key text;
  v_existing_secret text;
  v_payload_part text;
  v_payload jsonb;
  v_job_count integer;
  v_token_count integer;
  v_distinct_key_count integer;
  v_existing_count integer;
BEGIN
  WITH worker_tokens AS (
    SELECT
      pg_catalog.substring(
        j.command,
        'Bearer[[:space:]]+([A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+)'
      ) AS token
    FROM cron.job AS j
    WHERE j.active
      AND j.jobname = ANY (
        ARRAY[
          'delete-scheduled-accounts-daily',
          'process-scheduled-transactions',
          'send-z-report-evening'
        ]::text[]
      )
  )
  SELECT
    pg_catalog.min(w.token),
    pg_catalog.count(*)::integer,
    pg_catalog.count(w.token)::integer,
    pg_catalog.count(DISTINCT w.token)::integer
  INTO
    v_service_role_key,
    v_job_count,
    v_token_count,
    v_distinct_key_count
  FROM worker_tokens AS w;

  IF v_job_count <> 3
     OR v_token_count <> 3
     OR v_distinct_key_count <> 1
     OR v_service_role_key IS NULL
     OR v_service_role_key = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'notify worker credential preflight failed';
  END IF;

  v_payload_part := pg_catalog.split_part(v_service_role_key, '.', 2);
  v_payload := pg_catalog.convert_from(
    pg_catalog.decode(
      pg_catalog.translate(v_payload_part, '-_', '+/')
        || pg_catalog.repeat(
          '=',
          (4 - pg_catalog.length(v_payload_part) % 4) % 4
        ),
      'base64'
    ),
    'UTF8'
  )::jsonb;

  IF v_payload ->> 'role' IS DISTINCT FROM 'service_role'
     OR v_payload ->> 'ref' IS DISTINCT FROM 'ulohxpkhesxozwnlnonb'
     OR v_payload ->> 'iss' IS DISTINCT FROM 'supabase' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'notify worker credential claims preflight failed';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.min(ds.decrypted_secret)
  INTO
    v_existing_count,
    v_existing_secret
  FROM vault.decrypted_secrets AS ds
  WHERE ds.name = 'notify_linked_users_service_role_key';

  IF v_existing_count > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'notify worker Vault credential is duplicated';
  ELSIF v_existing_count = 1 THEN
    IF v_existing_secret IS DISTINCT FROM v_service_role_key THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'notify worker Vault credential differs from cron credential';
    END IF;
    RETURN;
  END IF;

  PERFORM vault.create_secret(
    v_service_role_key,
    'notify_linked_users_service_role_key',
    'Service-role credential used only by the notify-linked-users INSERT trigger'
  );
END;
$operation$;
