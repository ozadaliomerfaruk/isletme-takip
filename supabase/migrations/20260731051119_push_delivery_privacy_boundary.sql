BEGIN;

-- Push delivery privacy boundary.
--
-- Compatibility and data safety:
-- * This migration performs no migration-time INSERT/UPDATE/DELETE/backfill.
-- * Existing 1.5.x direct push_tokens upserts remain callable.
-- * A user whose account deletion is already scheduled/pending may not create
--   a fresh token through either the new RPC or the legacy direct-upsert path.
-- * Workers receive only tokens that have exactly one owner in the complete
--   table snapshot. This check happens inside PostgreSQL, so PostgREST max_rows
--   truncation cannot hide a second owner.

DO $precondition$
BEGIN
  IF pg_catalog.to_regclass('public.push_tokens') IS NULL
     OR pg_catalog.to_regclass('public.isletmeler') IS NULL
     OR pg_catalog.to_regclass(
       'internal.account_deletion_jobs_v1'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.claim_push_token_v1(text,text,text)'
     ) IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS column_row
       WHERE column_row.attrelid =
         'public.isletmeler'::pg_catalog.regclass
         AND column_row.attname = 'scheduled_deletion_at'
         AND column_row.attnum > 0
         AND NOT column_row.attisdropped
     )
  THEN
    RAISE EXCEPTION 'PUSH_DELIVERY_PRIVACY_PRECONDITION_FAILED';
  END IF;
END;
$precondition$;


CREATE FUNCTION public.reject_push_token_for_deleting_account_v1()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NEW.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'PUSH_TOKEN_CLAIM_NOT_AUTHENTICATED'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM internal.account_deletion_jobs_v1 AS job_row
       WHERE job_row.user_id = v_uid
         AND job_row.state IN ('scheduled', 'pending')
     )
     OR EXISTS (
       SELECT 1
       FROM public.isletmeler AS business_row
       WHERE business_row.user_id = v_uid
         AND business_row.scheduled_deletion_at IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'PUSH_TOKEN_CLAIM_ACCOUNT_DELETION_PENDING'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.reject_push_token_for_deleting_account_v1()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.reject_push_token_for_deleting_account_v1()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_push_token_account_deletion_guard_v1
BEFORE INSERT OR UPDATE OF user_id, token
ON public.push_tokens
FOR EACH ROW
EXECUTE FUNCTION public.reject_push_token_for_deleting_account_v1();


CREATE FUNCTION public.get_unambiguous_push_tokens_v1(
  p_user_ids uuid[]
)
RETURNS TABLE (
  user_id uuid,
  token text,
  locale text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
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
  'Service-worker-only fail-closed push recipients; ambiguous device tokens are omitted using one full-table statement snapshot.';
COMMENT ON FUNCTION public.reject_push_token_for_deleting_account_v1() IS
  'Rejects new and legacy token registration while the authenticated account has a scheduled or pending deletion request.';


DO $postcondition$
DECLARE
  v_recipient_function pg_catalog.pg_proc%ROWTYPE;
  v_guard_function pg_catalog.pg_proc%ROWTYPE;
  v_guard_trigger_count integer;
BEGIN
  SELECT function_row.*
  INTO v_recipient_function
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid =
    'public.get_unambiguous_push_tokens_v1(uuid[])'
      ::pg_catalog.regprocedure;

  SELECT function_row.*
  INTO v_guard_function
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid =
    'public.reject_push_token_for_deleting_account_v1()'
      ::pg_catalog.regprocedure;

  SELECT pg_catalog.count(*)
  INTO v_guard_trigger_count
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid =
      'public.push_tokens'::pg_catalog.regclass
    AND trigger_row.tgname =
      'trg_push_token_account_deletion_guard_v1'
    AND trigger_row.tgfoid =
      'public.reject_push_token_for_deleting_account_v1()'
        ::pg_catalog.regprocedure
    AND trigger_row.tgenabled = 'O'
    AND NOT trigger_row.tgisinternal;

  IF v_recipient_function.oid IS NULL
     OR v_recipient_function.prosecdef IS TRUE
     OR v_recipient_function.provolatile IS DISTINCT FROM 's'
     OR pg_catalog.pg_get_userbyid(v_recipient_function.proowner)
        IS DISTINCT FROM 'postgres'
     OR NOT (
       COALESCE(
         v_recipient_function.proconfig,
         ARRAY[]::text[]
       ) @> ARRAY['search_path=""']::text[]
     )
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
     OR v_guard_function.oid IS NULL
     OR v_guard_function.prosecdef IS NOT TRUE
     OR v_guard_function.provolatile IS DISTINCT FROM 'v'
     OR pg_catalog.pg_get_userbyid(v_guard_function.proowner)
        IS DISTINCT FROM 'postgres'
     OR NOT (
       COALESCE(
         v_guard_function.proconfig,
         ARRAY[]::text[]
       ) @> ARRAY['search_path=""']::text[]
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.reject_push_token_for_deleting_account_v1()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.reject_push_token_for_deleting_account_v1()',
       'EXECUTE'
     )
     OR v_guard_trigger_count IS DISTINCT FROM 1
  THEN
    RAISE EXCEPTION 'PUSH_DELIVERY_PRIVACY_POSTCONDITION_FAILED';
  END IF;
END;
$postcondition$;

COMMIT;
