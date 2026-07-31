BEGIN;

-- Fail closed when a push recipient has requested account deletion.
--
-- Compatibility and data safety:
-- * The existing RPC name, parameters and result columns remain unchanged.
-- * Existing 1.5.x token registration and account-deletion writes still work.
-- * Applying this migration performs no INSERT/UPDATE/DELETE/backfill and does
--   not rewrite any user, business, transaction or push-token row.
-- * The function needs the private deletion-job table only to exclude rows, so
--   it runs as postgres with an empty search path and is executable solely by
--   service_role workers.

DO $precondition$
DECLARE
  v_previous_function pg_catalog.pg_proc%ROWTYPE;
BEGIN
  IF pg_catalog.to_regclass('public.push_tokens') IS NULL
     OR pg_catalog.to_regclass('public.isletmeler') IS NULL
     OR pg_catalog.to_regclass(
       'internal.account_deletion_jobs_v1'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.get_unambiguous_push_tokens_v1(uuid[])'
     ) IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS column_row
       WHERE column_row.attrelid =
         'public.isletmeler'::pg_catalog.regclass
         AND column_row.attname = 'scheduled_deletion_at'
         AND column_row.atttypid =
           'pg_catalog.timestamptz'::pg_catalog.regtype
         AND column_row.attnum > 0
         AND NOT column_row.attisdropped
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS column_row
       WHERE column_row.attrelid =
         'internal.account_deletion_jobs_v1'::pg_catalog.regclass
         AND column_row.attname = 'state'
         AND column_row.atttypid =
           'pg_catalog.text'::pg_catalog.regtype
         AND column_row.attnum > 0
         AND NOT column_row.attisdropped
     )
  THEN
    RAISE EXCEPTION
      'PUSH_RECIPIENT_DELETION_FENCE_PRECONDITION_SCHEMA_MISSING';
  END IF;

  SELECT function_row.*
  INTO v_previous_function
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid =
    'public.get_unambiguous_push_tokens_v1(uuid[])'
      ::pg_catalog.regprocedure;

  IF v_previous_function.provolatile IS DISTINCT FROM 's'
     OR v_previous_function.prosrc !~ 'safe_tokens'
     OR v_previous_function.prosrc !~
       'count\([[:space:]]*DISTINCT token_row\.user_id'
     OR v_previous_function.prosrc !~ 'token_row\.user_id = ANY'
     OR v_previous_function.prosrc ~
       'internal\.account_deletion_jobs_v1'
  THEN
    RAISE EXCEPTION
      'PUSH_RECIPIENT_DELETION_FENCE_PRECONDITION_FUNCTION_DRIFT';
  END IF;
END;
$precondition$;


CREATE OR REPLACE FUNCTION public.get_unambiguous_push_tokens_v1(
  p_user_ids uuid[]
)
RETURNS TABLE (
  user_id uuid,
  token text,
  locale text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH safe_tokens AS (
    SELECT token_row.token
    FROM public.push_tokens AS token_row
    WHERE token_row.token IS NOT NULL
    GROUP BY token_row.token
    HAVING pg_catalog.count(
      DISTINCT token_row.user_id
    ) = 1
  )
  SELECT
    token_row.user_id,
    token_row.token,
    token_row.locale
  FROM public.push_tokens AS token_row
  INNER JOIN safe_tokens
    ON safe_tokens.token = token_row.token
  WHERE p_user_ids IS NOT NULL
    AND token_row.user_id = ANY (p_user_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM internal.account_deletion_jobs_v1 AS job_row
      WHERE job_row.user_id = token_row.user_id
        AND job_row.state IN ('scheduled', 'pending')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.isletmeler AS business_row
      WHERE business_row.user_id = token_row.user_id
        AND business_row.scheduled_deletion_at IS NOT NULL
    )
$function$;

ALTER FUNCTION public.get_unambiguous_push_tokens_v1(uuid[])
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.get_unambiguous_push_tokens_v1(uuid[])
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.get_unambiguous_push_tokens_v1(uuid[])
TO service_role;

COMMENT ON FUNCTION public.get_unambiguous_push_tokens_v1(uuid[]) IS
  'Service-worker-only fail-closed push recipients; ambiguous tokens and accounts with scheduled/pending deletion are omitted in one statement snapshot.';


DO $postcondition$
DECLARE
  v_function pg_catalog.pg_proc%ROWTYPE;
BEGIN
  SELECT function_row.*
  INTO v_function
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid =
    'public.get_unambiguous_push_tokens_v1(uuid[])'
      ::pg_catalog.regprocedure;

  IF v_function.oid IS NULL
     OR v_function.prosecdef IS NOT TRUE
     OR v_function.provolatile IS DISTINCT FROM 's'
     OR pg_catalog.pg_get_userbyid(v_function.proowner)
        IS DISTINCT FROM 'postgres'
     OR NOT (
       COALESCE(v_function.proconfig, ARRAY[]::text[])
         @> ARRAY['search_path=""']::text[]
     )
     OR v_function.prosrc !~
       'internal\.account_deletion_jobs_v1'
     OR v_function.prosrc !~
       'job_row\.state IN \(''scheduled'', ''pending''\)'
     OR v_function.prosrc !~
       'business_row\.scheduled_deletion_at IS NOT NULL'
     OR NOT pg_catalog.has_function_privilege(
       'service_role',
       'public.get_unambiguous_push_tokens_v1(uuid[])',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.get_unambiguous_push_tokens_v1(uuid[])',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.get_unambiguous_push_tokens_v1(uuid[])',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION
      'PUSH_RECIPIENT_DELETION_FENCE_POSTCONDITION_FAILED';
  END IF;
END;
$postcondition$;

COMMIT;
