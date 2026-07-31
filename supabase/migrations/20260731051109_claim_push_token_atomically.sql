BEGIN;

-- A single Expo push token belongs to the currently signed-in user on this
-- installation. `push_tokens` historically enforced only UNIQUE(user_id), so a
-- failed/offline logout could leave the same token on user A and then add it to
-- user B. Both rows would receive A's future notifications on B's device.
--
-- Compatibility:
-- * Existing 1.5.x table upserts and RLS policies remain callable. New
--   statement/row triggers bridge those legacy writes into the same claim
--   boundary, so protection does not depend on store rollout.
-- * No existing token/user row is backfilled or deleted during migration.
-- * A stale row is removed only when an authenticated new client actively
--   claims that exact token through the RPC or legacy upsert, in the same
--   transaction as its own write.

DO $precondition$
DECLARE
  v_user_unique boolean;
BEGIN
  IF pg_catalog.to_regclass('public.push_tokens') IS NULL
     OR pg_catalog.to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'PUSH_TOKEN_CLAIM_PRECONDITION_MISSING_RELATION_OR_AUTH';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class AS table_row
       WHERE table_row.oid = 'public.push_tokens'::pg_catalog.regclass
         AND table_row.relrowsecurity IS TRUE
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS column_row
       WHERE column_row.attrelid = 'public.push_tokens'::pg_catalog.regclass
         AND column_row.attname = 'user_id'
         AND column_row.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
         AND column_row.attnum > 0
         AND NOT column_row.attisdropped
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS column_row
       WHERE column_row.attrelid = 'public.push_tokens'::pg_catalog.regclass
         AND column_row.attname = 'token'
         AND column_row.atttypid = 'pg_catalog.text'::pg_catalog.regtype
         AND column_row.attnum > 0
         AND NOT column_row.attisdropped
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS column_row
       WHERE column_row.attrelid = 'public.push_tokens'::pg_catalog.regclass
         AND column_row.attname = 'platform'
         AND column_row.atttypid = 'pg_catalog.text'::pg_catalog.regtype
         AND column_row.attnum > 0
         AND NOT column_row.attisdropped
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS column_row
       WHERE column_row.attrelid = 'public.push_tokens'::pg_catalog.regclass
         AND column_row.attname = 'locale'
         AND column_row.atttypid = 'pg_catalog.text'::pg_catalog.regtype
         AND column_row.attnum > 0
         AND NOT column_row.attisdropped
     ) THEN
    RAISE EXCEPTION 'PUSH_TOKEN_CLAIM_PRECONDITION_SCHEMA_DRIFT';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_row
    WHERE index_row.indrelid = 'public.push_tokens'::pg_catalog.regclass
      AND index_row.indisunique
      AND index_row.indisvalid
      AND index_row.indpred IS NULL
      AND index_row.indexprs IS NULL
      AND index_row.indnkeyatts = 1
      AND (
        SELECT pg_catalog.array_agg(
          attribute_row.attname::text
          ORDER BY key_row.ordinality
        )
        FROM pg_catalog.unnest(index_row.indkey)
          WITH ORDINALITY AS key_row(attnum, ordinality)
        JOIN pg_catalog.pg_attribute AS attribute_row
          ON attribute_row.attrelid = index_row.indrelid
         AND attribute_row.attnum = key_row.attnum
        WHERE key_row.ordinality <= index_row.indnkeyatts
      ) = ARRAY['user_id']::text[]
  )
  INTO v_user_unique;

  IF v_user_unique IS NOT TRUE THEN
    RAISE EXCEPTION 'PUSH_TOKEN_CLAIM_PRECONDITION_USER_UNIQUE_MISSING';
  END IF;
END;
$precondition$;


-- Acquire one lock before PostgreSQL takes any target-row lock. Registration is
-- rare (login/app start/settings), so serializing these tiny statements avoids
-- the cross-swap deadlock possible when A->tokenB and B->tokenA update at once.
CREATE FUNCTION public.lock_push_token_claim_statement_v1()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20260731, 71612);
  RETURN NULL;
END;
$function$;

ALTER FUNCTION public.lock_push_token_claim_statement_v1()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.lock_push_token_claim_statement_v1()
FROM PUBLIC, anon, authenticated, service_role;


-- This is the legacy 1.5.x bridge. RLS still checks the final row, while this
-- SECURITY DEFINER trigger performs the one operation RLS cannot: remove the
-- same installation token from its previous user before the current user's
-- insert/update. auth.uid() is checked again inside the privileged boundary.
CREATE FUNCTION public.enforce_push_token_single_owner_v1()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_token text := pg_catalog.btrim(NEW.token);
BEGIN
  IF v_uid IS NULL
     OR NEW.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'PUSH_TOKEN_CLAIM_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF v_token IS NULL
     OR pg_catalog.length(v_token) < 8
     OR pg_catalog.length(v_token) > 4096 THEN
    RAISE EXCEPTION 'PUSH_TOKEN_CLAIM_INVALID_TOKEN'
      USING ERRCODE = '22023';
  END IF;

  -- Re-entrant for INSERT .. ON CONFLICT DO UPDATE; the BEFORE STATEMENT
  -- trigger already acquired this lock before any target row was locked.
  PERFORM pg_catalog.pg_advisory_xact_lock(20260731, 71612);

  NEW.token := v_token;

  DELETE FROM public.push_tokens AS token_row
  WHERE token_row.token = v_token
    AND token_row.user_id IS DISTINCT FROM v_uid;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.enforce_push_token_single_owner_v1()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.enforce_push_token_single_owner_v1()
FROM PUBLIC, anon, authenticated, service_role;


CREATE TRIGGER trg_push_token_claim_statement_v1
BEFORE INSERT OR UPDATE
ON public.push_tokens
FOR EACH STATEMENT
EXECUTE FUNCTION public.lock_push_token_claim_statement_v1();

CREATE TRIGGER trg_push_token_single_owner_v1
BEFORE INSERT OR UPDATE OF user_id, token
ON public.push_tokens
FOR EACH ROW
EXECUTE FUNCTION public.enforce_push_token_single_owner_v1();


CREATE FUNCTION public.claim_push_token_v1(
  p_token text,
  p_platform text,
  p_locale text DEFAULT 'tr'
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_token text := pg_catalog.btrim(p_token);
  v_platform text := pg_catalog.lower(pg_catalog.btrim(p_platform));
  v_locale text := pg_catalog.lower(pg_catalog.btrim(p_locale));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PUSH_TOKEN_CLAIM_NOT_AUTHENTICATED'
      USING ERRCODE = '42501';
  END IF;

  IF v_token IS NULL
     OR pg_catalog.length(v_token) < 8
     OR pg_catalog.length(v_token) > 4096 THEN
    RAISE EXCEPTION 'PUSH_TOKEN_CLAIM_INVALID_TOKEN'
      USING ERRCODE = '22023';
  END IF;

  IF v_platform IS NULL
     OR v_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'PUSH_TOKEN_CLAIM_INVALID_PLATFORM'
      USING ERRCODE = '22023';
  END IF;

  IF v_locale IS NULL
     OR v_locale NOT IN ('tr', 'en') THEN
    RAISE EXCEPTION 'PUSH_TOKEN_CLAIM_INVALID_LOCALE'
      USING ERRCODE = '22023';
  END IF;

  -- Take the same global claim lock as legacy statements before touching any
  -- token row. This prevents cross-user token swaps from deadlocking.
  PERFORM pg_catalog.pg_advisory_xact_lock(20260731, 71612);

  DELETE FROM public.push_tokens AS token_row
  WHERE token_row.token = v_token
    AND token_row.user_id IS DISTINCT FROM v_uid;

  INSERT INTO public.push_tokens AS token_row (
    user_id,
    token,
    platform,
    locale,
    updated_at
  )
  VALUES (
    v_uid,
    v_token,
    v_platform,
    v_locale,
    pg_catalog.clock_timestamp()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET token = EXCLUDED.token,
      platform = EXCLUDED.platform,
      locale = EXCLUDED.locale,
      updated_at = EXCLUDED.updated_at;

  IF (
       SELECT pg_catalog.count(*)
       FROM public.push_tokens AS token_row
       WHERE token_row.token = v_token
     ) IS DISTINCT FROM 1::bigint
     OR NOT EXISTS (
       SELECT 1
       FROM public.push_tokens AS token_row
       WHERE token_row.user_id = v_uid
         AND token_row.token = v_token
         AND token_row.platform = v_platform
         AND token_row.locale = v_locale
     ) THEN
    RAISE EXCEPTION 'PUSH_TOKEN_CLAIM_POSTCONDITION_FAILED';
  END IF;

  RETURN true;
END;
$function$;

ALTER FUNCTION public.claim_push_token_v1(text, text, text)
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.claim_push_token_v1(text, text, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.claim_push_token_v1(text, text, text)
TO authenticated;

COMMENT ON FUNCTION public.claim_push_token_v1(text, text, text) IS
  'Atomically moves one installation push token to auth.uid(); migration itself performs no backfill or row deletion.';
COMMENT ON FUNCTION public.enforce_push_token_single_owner_v1() IS
  'Legacy direct-upsert bridge: auth.uid-bound token ownership transfer; callable only as a trigger.';


DO $postcondition$
DECLARE
  v_function pg_catalog.pg_proc%ROWTYPE;
  v_trigger_count integer;
  v_signature text;
BEGIN
  SELECT function_row.*
  INTO v_function
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid =
    'public.claim_push_token_v1(text,text,text)'::pg_catalog.regprocedure;

  SELECT pg_catalog.count(*)
  INTO v_trigger_count
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = 'public.push_tokens'::pg_catalog.regclass
    AND NOT trigger_row.tgisinternal
    AND trigger_row.tgenabled = 'O'
    AND (
      (
        trigger_row.tgname = 'trg_push_token_claim_statement_v1'
        AND trigger_row.tgfoid =
          'public.lock_push_token_claim_statement_v1()'
            ::pg_catalog.regprocedure
      )
      OR (
        trigger_row.tgname = 'trg_push_token_single_owner_v1'
        AND trigger_row.tgfoid =
          'public.enforce_push_token_single_owner_v1()'
            ::pg_catalog.regprocedure
      )
    );

  IF v_function.oid IS NULL
     OR v_function.prosecdef IS NOT TRUE
     OR v_function.provolatile IS DISTINCT FROM 'v'
     OR pg_catalog.pg_get_userbyid(v_function.proowner)
        IS DISTINCT FROM 'postgres'
     OR NOT (
       COALESCE(v_function.proconfig, ARRAY[]::text[])
       @> ARRAY['search_path=""']::text[]
     )
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'public.claim_push_token_v1(text,text,text)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.claim_push_token_v1(text,text,text)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.claim_push_token_v1(text,text,text)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.lock_push_token_claim_statement_v1()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.enforce_push_token_single_owner_v1()',
       'EXECUTE'
     )
     OR v_trigger_count IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'PUSH_TOKEN_CLAIM_FUNCTION_POSTCONDITION_FAILED';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.lock_push_token_claim_statement_v1()',
    'public.enforce_push_token_single_owner_v1()'
  ]::text[] LOOP
    SELECT function_row.*
    INTO v_function
    FROM pg_catalog.pg_proc AS function_row
    WHERE function_row.oid = v_signature::pg_catalog.regprocedure;

    IF NOT FOUND
       OR v_function.prosecdef IS NOT TRUE
       OR v_function.provolatile IS DISTINCT FROM 'v'
       OR pg_catalog.pg_get_userbyid(v_function.proowner)
          IS DISTINCT FROM 'postgres'
       OR NOT (
         COALESCE(v_function.proconfig, ARRAY[]::text[])
         @> ARRAY['search_path=""']::text[]
       ) THEN
      RAISE EXCEPTION
        'PUSH_TOKEN_CLAIM_TRIGGER_POSTCONDITION_FAILED: %',
        v_signature;
    END IF;
  END LOOP;
END;
$postcondition$;

COMMIT;
