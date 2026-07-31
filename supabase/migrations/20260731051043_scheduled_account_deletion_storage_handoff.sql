BEGIN;

-- Scheduled account deletion: durable, Storage-aware and fail-closed.
--
-- The durable row is keyed by auth user instead of business. isletme_id is
-- intentionally nullable so a shared-only user (or an old account whose own
-- business was never created) can request and cancel deletion in-app.
--
-- Compatibility:
-- * New clients use schedule/cancel/status RPCs below.
-- * 1.5.x clients may still write isletmeler.scheduled_deletion_at directly.
--   The worker imports that due business through claim_scheduled... without
--   trusting the client for Auth or Storage cleanup.
-- * No existing user/business/ledger row is backfilled, rewritten or deleted
--   by this migration. Destructive work starts only for an explicitly
--   requested, actually-due account and remains retry-safe.

CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM PUBLIC, anon, authenticated;

DO $precondition$
BEGIN
  IF pg_catalog.to_regclass('public.isletmeler') IS NULL
     OR pg_catalog.to_regclass('public.isletme_users') IS NULL
     OR pg_catalog.to_regclass('public.push_tokens') IS NULL
     OR pg_catalog.to_regclass('storage.objects') IS NULL
     OR pg_catalog.to_regclass('auth.users') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS attribute_row
       WHERE attribute_row.attrelid = 'public.isletmeler'::pg_catalog.regclass
         AND attribute_row.attname = 'scheduled_deletion_at'
         AND attribute_row.attnum > 0
         AND NOT attribute_row.attisdropped
     )
  THEN
    RAISE EXCEPTION
      'scheduled account deletion precondition failed';
  END IF;
END;
$precondition$;


CREATE TABLE internal.account_deletion_jobs_v1 (
  user_id uuid PRIMARY KEY,
  isletme_id uuid UNIQUE,
  business_name text NOT NULL DEFAULT 'Account',
  scheduled_deletion_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'scheduled'
    CHECK (state IN ('scheduled', 'pending', 'cancelled', 'completed')),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  claimed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  cancelled_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE internal.account_deletion_jobs_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE internal.account_deletion_jobs_v1
FROM PUBLIC, anon, authenticated, service_role;

-- Apple refresh tokens are never stored in plaintext and intentionally have
-- no auth.users FK so a crash after Auth deletion cannot orphan the deletion
-- workflow. The Edge worker removes this row after verified completion.
CREATE TABLE internal.apple_revocation_credentials_v1 (
  user_id uuid PRIMARY KEY,
  encrypted_refresh_token text NOT NULL,
  encryption_iv text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (char_length(encrypted_refresh_token) BETWEEN 16 AND 8192),
  CHECK (char_length(encryption_iv) BETWEEN 12 AND 128)
);

ALTER TABLE internal.apple_revocation_credentials_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE internal.apple_revocation_credentials_v1
FROM PUBLIC, anon, authenticated, service_role;


CREATE FUNCTION internal.account_deletion_worker_authorized_v1()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'pg_catalog'
AS $function$
  SELECT COALESCE(
    auth.jwt()->>'role',
    pg_catalog.current_setting('request.jwt.claim.role', true),
    ''
  ) = 'service_role'
$function$;

REVOKE ALL
ON FUNCTION internal.account_deletion_worker_authorized_v1()
FROM PUBLIC, anon, authenticated, service_role;

-- Notes normally keep immutable creator attribution. Auth deletion cannot
-- complete while the historical RESTRICT FK still points at the user, so
-- permit one narrow service-worker transition: that same creator UUID to
-- NULL, with a transaction-local user-specific context. Any definition drift
-- deliberately aborts this migration instead of weakening the trigger.
DO $note_detach_patch$
DECLARE
  v_definition text;
  v_before constant text := $before$
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.isletme_id IS DISTINCT FROM OLD.isletme_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'NOTLAR_IMMUTABLE_IDENTITY'
        USING ERRCODE = '42501';
    END IF;
$before$;
  v_after constant text := $after$
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.isletme_id IS DISTINCT FROM OLD.isletme_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (
         NEW.created_by IS DISTINCT FROM OLD.created_by
         AND NOT (
           OLD.created_by IS NOT NULL
           AND NEW.created_by IS NULL
           AND pg_catalog.current_setting(
             'internal.account_deletion_note_detach_user_id',
             true
           ) = OLD.created_by::text
           AND internal.account_deletion_worker_authorized_v1()
         )
       )
    THEN
      RAISE EXCEPTION 'NOTLAR_IMMUTABLE_IDENTITY'
        USING ERRCODE = '42501';
    END IF;
$after$;
BEGIN
  IF pg_catalog.to_regprocedure(
       'public.enforce_notlar_identity_v1()'
     ) IS NULL
  THEN
    RAISE EXCEPTION
      'scheduled account deletion note trigger precondition failed';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.enforce_notlar_identity_v1()'::pg_catalog.regprocedure
  )
  INTO v_definition;

  IF pg_catalog.strpos(v_definition, v_before) = 0 THEN
    IF pg_catalog.strpos(v_definition, v_after) = 0 THEN
      RAISE EXCEPTION
        'scheduled account deletion note trigger definition drifted';
    END IF;
  ELSE
    v_definition := pg_catalog.replace(v_definition, v_before, v_after);
    EXECUTE v_definition;
  END IF;
END;
$note_detach_patch$;


-- Every lifecycle mutation uses the same per-user lock. A cancellation that
-- acquires it first wins; once Auth deletion starts there is no authenticated
-- caller left that can race a late cancellation.
CREATE FUNCTION internal.account_deletion_lock_user_v1(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_INVALID_USER_ID'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 20260731)
  );
END;
$function$;

REVOKE ALL
ON FUNCTION internal.account_deletion_lock_user_v1(uuid)
FROM PUBLIC, anon, authenticated, service_role;


CREATE FUNCTION public.store_apple_revocation_credential_v1(
  p_user_id uuid,
  p_encrypted_refresh_token text,
  p_encryption_iv text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF NOT internal.account_deletion_worker_authorized_v1() THEN
    RAISE EXCEPTION 'APPLE_REVOCATION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL
     OR NULLIF(pg_catalog.btrim(p_encrypted_refresh_token), '') IS NULL
     OR NULLIF(pg_catalog.btrim(p_encryption_iv), '') IS NULL
     OR char_length(p_encrypted_refresh_token) > 8192
     OR char_length(p_encryption_iv) > 128
  THEN
    RAISE EXCEPTION 'APPLE_REVOCATION_INVALID_CREDENTIAL'
      USING ERRCODE = '22023';
  END IF;

  PERFORM internal.account_deletion_lock_user_v1(p_user_id);

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    WHERE auth_user.id = p_user_id
  ) THEN
    RAISE EXCEPTION 'APPLE_REVOCATION_AUTH_USER_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO internal.apple_revocation_credentials_v1 (
    user_id,
    encrypted_refresh_token,
    encryption_iv,
    captured_at,
    revoked_at,
    last_error,
    updated_at
  )
  VALUES (
    p_user_id,
    p_encrypted_refresh_token,
    p_encryption_iv,
    clock_timestamp(),
    NULL,
    NULL,
    clock_timestamp()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
    encryption_iv = EXCLUDED.encryption_iv,
    captured_at = clock_timestamp(),
    revoked_at = NULL,
    last_error = NULL,
    updated_at = clock_timestamp();

  RETURN true;
END;
$function$;

REVOKE ALL
ON FUNCTION public.store_apple_revocation_credential_v1(uuid,text,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
ON FUNCTION public.store_apple_revocation_credential_v1(uuid,text,text)
TO service_role;


CREATE FUNCTION public.get_apple_revocation_credential_v1(
  p_user_id uuid
)
RETURNS TABLE (
  encrypted_refresh_token text,
  encryption_iv text,
  revoked_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF NOT internal.account_deletion_worker_authorized_v1() THEN
    RAISE EXCEPTION 'APPLE_REVOCATION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    credential_row.encrypted_refresh_token,
    credential_row.encryption_iv,
    credential_row.revoked_at
  FROM internal.apple_revocation_credentials_v1 AS credential_row
  WHERE credential_row.user_id = p_user_id
  LIMIT 1;
END;
$function$;

REVOKE ALL
ON FUNCTION public.get_apple_revocation_credential_v1(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
ON FUNCTION public.get_apple_revocation_credential_v1(uuid)
TO service_role;


CREATE FUNCTION public.mark_apple_revocation_attempt_v1(
  p_user_id uuid,
  p_revoked boolean,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF NOT internal.account_deletion_worker_authorized_v1() THEN
    RAISE EXCEPTION 'APPLE_REVOCATION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  PERFORM internal.account_deletion_lock_user_v1(p_user_id);

  UPDATE internal.apple_revocation_credentials_v1 AS credential_row
  SET
    revoked_at = CASE
      WHEN p_revoked THEN clock_timestamp()
      ELSE credential_row.revoked_at
    END,
    last_error = CASE
      WHEN p_revoked THEN NULL
      ELSE pg_catalog.left(COALESCE(p_error, 'APPLE_REVOCATION_FAILED'), 500)
    END,
    updated_at = clock_timestamp()
  WHERE credential_row.user_id = p_user_id;

  RETURN FOUND;
END;
$function$;

REVOKE ALL
ON FUNCTION public.mark_apple_revocation_attempt_v1(uuid,boolean,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
ON FUNCTION public.mark_apple_revocation_attempt_v1(uuid,boolean,text)
TO service_role;


-- Business-scoped activity is checked separately from actor activity because
-- older clients schedule by mutating the business row directly.
CREATE FUNCTION internal.account_deletion_has_post_due_business_activity_v1(
  p_isletme_id uuid,
  p_due_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_table record;
  v_has_activity boolean;
  v_time_predicate text;
BEGIN
  IF p_isletme_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.isletmeler AS business_row
    WHERE business_row.id = p_isletme_id
      AND business_row.updated_at > p_due_at
  ) THEN
    RETURN true;
  END IF;

  FOR v_table IN
    SELECT
      namespace_row.nspname AS schema_name,
      table_row.relname AS table_name,
      pg_catalog.bool_or(time_column.attname = 'created_at')
        AS has_created_at,
      pg_catalog.bool_or(time_column.attname = 'updated_at')
        AS has_updated_at
    FROM pg_catalog.pg_class AS table_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = table_row.relnamespace
    JOIN pg_catalog.pg_attribute AS tenant_column
      ON tenant_column.attrelid = table_row.oid
     AND tenant_column.attname = 'isletme_id'
     AND tenant_column.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
     AND tenant_column.attnum > 0
     AND NOT tenant_column.attisdropped
    JOIN pg_catalog.pg_attribute AS time_column
      ON time_column.attrelid = table_row.oid
     AND time_column.attname IN ('created_at', 'updated_at')
     AND time_column.atttypid IN (
       'pg_catalog.timestamp'::pg_catalog.regtype,
       'pg_catalog.timestamptz'::pg_catalog.regtype
     )
     AND time_column.attnum > 0
     AND NOT time_column.attisdropped
    WHERE namespace_row.nspname = 'public'
      AND table_row.relkind IN ('r', 'p')
    GROUP BY namespace_row.nspname, table_row.relname
  LOOP
    v_time_predicate := CASE
      WHEN v_table.has_created_at AND v_table.has_updated_at
        THEN '(created_at > $2 OR updated_at > $2)'
      WHEN v_table.has_created_at
        THEN 'created_at > $2'
      ELSE 'updated_at > $2'
    END;

    EXECUTE pg_catalog.format(
      'SELECT EXISTS (SELECT 1 FROM %I.%I '
      || 'WHERE isletme_id = $1 AND (%s))',
      v_table.schema_name,
      v_table.table_name,
      v_time_predicate
    )
    INTO v_has_activity
    USING p_isletme_id, p_due_at;

    IF v_has_activity IS TRUE THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$function$;

REVOKE ALL
ON FUNCTION internal.account_deletion_has_post_due_business_activity_v1(
  uuid,
  timestamptz
)
FROM PUBLIC, anon, authenticated, service_role;


-- Actor-scoped activity prevents a logged-in/shared-only user from being
-- deleted while they are still using another business after the deadline.
-- Each identity column is paired only with its semantically matching time
-- column, avoiding the false positive "old creator, later edited by someone
-- else".
CREATE FUNCTION internal.account_deletion_has_post_due_user_activity_v1(
  p_user_id uuid,
  p_due_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_candidate record;
  v_has_activity boolean;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    WHERE auth_user.id = p_user_id
      AND (
        auth_user.last_sign_in_at > p_due_at
        OR auth_user.updated_at > p_due_at
      )
  ) THEN
    RETURN true;
  END IF;

  FOR v_candidate IN
    SELECT DISTINCT
      namespace_row.nspname AS schema_name,
      table_row.relname AS table_name,
      identity_column.attname AS identity_column,
      CASE
        WHEN identity_column.attname = 'updated_by' THEN 'updated_at'
        ELSE 'created_at'
      END AS time_column
    FROM pg_catalog.pg_class AS table_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = table_row.relnamespace
    JOIN pg_catalog.pg_attribute AS identity_column
      ON identity_column.attrelid = table_row.oid
     AND identity_column.attname IN (
       'user_id',
       'created_by',
       'updated_by',
       'performed_by',
       'accepted_by',
       'invited_by'
     )
     AND identity_column.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
     AND identity_column.attnum > 0
     AND NOT identity_column.attisdropped
    JOIN pg_catalog.pg_attribute AS time_column
      ON time_column.attrelid = table_row.oid
     AND time_column.attname = CASE
       WHEN identity_column.attname = 'updated_by' THEN 'updated_at'
       ELSE 'created_at'
     END
     AND time_column.atttypid IN (
       'pg_catalog.timestamp'::pg_catalog.regtype,
       'pg_catalog.timestamptz'::pg_catalog.regtype
     )
     AND time_column.attnum > 0
     AND NOT time_column.attisdropped
    WHERE namespace_row.nspname = 'public'
      AND table_row.relkind IN ('r', 'p')
  LOOP
    EXECUTE pg_catalog.format(
      'SELECT EXISTS (SELECT 1 FROM %I.%I '
      || 'WHERE %I = $1 AND %I > $2)',
      v_candidate.schema_name,
      v_candidate.table_name,
      v_candidate.identity_column,
      v_candidate.time_column
    )
    INTO v_has_activity
    USING p_user_id, p_due_at;

    IF v_has_activity IS TRUE THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$function$;

REVOKE ALL
ON FUNCTION internal.account_deletion_has_post_due_user_activity_v1(
  uuid,
  timestamptz
)
FROM PUBLIC, anon, authenticated, service_role;


CREATE FUNCTION public.schedule_own_account_deletion_v1()
RETURNS TABLE (
  scheduled_deletion_at timestamptz,
  isletme_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_business record;
  v_owned_business_count bigint;
  v_due_at timestamptz := clock_timestamp() + interval '7 days';
  v_display_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_NOT_AUTHENTICATED'
      USING ERRCODE = '42501';
  END IF;

  PERFORM internal.account_deletion_lock_user_v1(v_user_id);

  SELECT pg_catalog.count(*)
  INTO v_owned_business_count
  FROM public.isletmeler AS owned_business
  WHERE owned_business.user_id = v_user_id;

  IF v_owned_business_count > 1 THEN
    RAISE EXCEPTION
      'ACCOUNT_DELETE_OWNED_BUSINESS_INVARIANT:%',
      v_owned_business_count
      USING ERRCODE = 'P0001';
  END IF;

  SELECT
    business_row.id,
    business_row.name
  INTO v_business
  FROM public.isletmeler AS business_row
  WHERE business_row.user_id = v_user_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.isletmeler AS business_row
    SET scheduled_deletion_at = v_due_at
    WHERE business_row.id = v_business.id;
    v_display_name := v_business.name;
  ELSE
    v_display_name := 'Account';
  END IF;

  INSERT INTO internal.account_deletion_jobs_v1 (
    user_id,
    isletme_id,
    business_name,
    scheduled_deletion_at,
    state,
    requested_at,
    claimed_at,
    updated_at,
    cancelled_at,
    completed_at
  )
  VALUES (
    v_user_id,
    v_business.id,
    COALESCE(v_display_name, 'Account'),
    v_due_at,
    'scheduled',
    clock_timestamp(),
    NULL,
    clock_timestamp(),
    NULL,
    NULL
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    isletme_id = EXCLUDED.isletme_id,
    business_name = EXCLUDED.business_name,
    scheduled_deletion_at = EXCLUDED.scheduled_deletion_at,
    state = 'scheduled',
    requested_at = clock_timestamp(),
    claimed_at = NULL,
    updated_at = clock_timestamp(),
    cancelled_at = NULL,
    completed_at = NULL;

  -- Privacy boundary: once the explicit deletion request is durable, this
  -- signed-in installation must no longer receive business notifications
  -- during the seven-day waiting period. This DELETE is in the same
  -- transaction as the schedule row, so either both changes commit or neither
  -- does. Migration application itself never deletes a token.
  DELETE FROM public.push_tokens AS token_row
  WHERE token_row.user_id = v_user_id;

  RETURN QUERY SELECT v_due_at, v_business.id;
END;
$function$;

REVOKE ALL
ON FUNCTION public.schedule_own_account_deletion_v1()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
ON FUNCTION public.schedule_own_account_deletion_v1()
TO authenticated;


CREATE FUNCTION public.cancel_own_account_deletion_v1()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_NOT_AUTHENTICATED'
      USING ERRCODE = '42501';
  END IF;

  PERFORM internal.account_deletion_lock_user_v1(v_user_id);

  UPDATE internal.account_deletion_jobs_v1 AS job_row
  SET
    state = 'cancelled',
    cancelled_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE job_row.user_id = v_user_id
    AND job_row.state IN ('scheduled', 'pending');

  UPDATE public.isletmeler AS business_row
  SET scheduled_deletion_at = NULL
  WHERE business_row.user_id = v_user_id
    AND business_row.scheduled_deletion_at IS NOT NULL;

  RETURN true;
END;
$function$;

REVOKE ALL
ON FUNCTION public.cancel_own_account_deletion_v1()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
ON FUNCTION public.cancel_own_account_deletion_v1()
TO authenticated;


CREATE FUNCTION public.get_own_account_deletion_status_v1()
RETURNS TABLE (
  scheduled_deletion_at timestamptz,
  state text,
  isletme_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_NOT_AUTHENTICATED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    job_row.scheduled_deletion_at,
    job_row.state,
    job_row.isletme_id
  FROM internal.account_deletion_jobs_v1 AS job_row
  WHERE job_row.user_id = v_user_id
    AND job_row.state IN ('scheduled', 'pending')
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- Compatibility with a request made by a 1.5.x client before the worker
  -- imports it into the durable ledger.
  RETURN QUERY
  SELECT
    business_row.scheduled_deletion_at,
    'scheduled'::text,
    business_row.id
  FROM public.isletmeler AS business_row
  WHERE business_row.user_id = v_user_id
    AND business_row.scheduled_deletion_at IS NOT NULL
  LIMIT 1;
END;
$function$;

REVOKE ALL
ON FUNCTION public.get_own_account_deletion_status_v1()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
ON FUNCTION public.get_own_account_deletion_status_v1()
TO authenticated;


-- Imports a due request created by a legacy 1.5.x client.
CREATE FUNCTION public.claim_scheduled_account_deletion_v1(
  p_isletme_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_business record;
  v_owned_business_count bigint;
  v_existing_job internal.account_deletion_jobs_v1%ROWTYPE;
BEGIN
  IF NOT internal.account_deletion_worker_authorized_v1() THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF p_isletme_id IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_INVALID_BUSINESS_ID'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    business_row.id,
    business_row.user_id,
    business_row.name,
    business_row.scheduled_deletion_at
  INTO v_business
  FROM public.isletmeler AS business_row
  WHERE business_row.id = p_isletme_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_STATE_CHANGED'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM internal.account_deletion_lock_user_v1(v_business.user_id);

  SELECT
    business_row.id,
    business_row.user_id,
    business_row.name,
    business_row.scheduled_deletion_at
  INTO v_business
  FROM public.isletmeler AS business_row
  WHERE business_row.id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_business.scheduled_deletion_at IS NULL
     OR v_business.scheduled_deletion_at > clock_timestamp()
  THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_STATE_CHANGED'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_owned_business_count
  FROM public.isletmeler AS owned_business
  WHERE owned_business.user_id = v_business.user_id;

  IF v_owned_business_count <> 1 THEN
    RAISE EXCEPTION
      'ACCOUNT_DELETE_OWNED_BUSINESS_INVARIANT:%',
      v_owned_business_count
      USING ERRCODE = 'P0001';
  END IF;

  IF internal.account_deletion_has_post_due_business_activity_v1(
       p_isletme_id,
       v_business.scheduled_deletion_at
     )
     OR internal.account_deletion_has_post_due_user_activity_v1(
       v_business.user_id,
       v_business.scheduled_deletion_at
     )
  THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_POST_DUE_ACTIVITY'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT job_row.*
  INTO v_existing_job
  FROM internal.account_deletion_jobs_v1 AS job_row
  WHERE job_row.user_id = v_business.user_id
  FOR UPDATE;

  IF FOUND
     AND (
       v_existing_job.isletme_id IS DISTINCT FROM v_business.id
       OR v_existing_job.scheduled_deletion_at
          IS DISTINCT FROM v_business.scheduled_deletion_at
     )
     AND v_existing_job.state = 'pending'
  THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_JOB_IDENTITY_DRIFT'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO internal.account_deletion_jobs_v1 (
    user_id,
    isletme_id,
    business_name,
    scheduled_deletion_at,
    state,
    requested_at,
    claimed_at,
    updated_at,
    cancelled_at,
    completed_at
  )
  VALUES (
    v_business.user_id,
    v_business.id,
    v_business.name,
    v_business.scheduled_deletion_at,
    'pending',
    clock_timestamp(),
    clock_timestamp(),
    clock_timestamp(),
    NULL,
    NULL
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    isletme_id = EXCLUDED.isletme_id,
    business_name = EXCLUDED.business_name,
    scheduled_deletion_at = EXCLUDED.scheduled_deletion_at,
    state = 'pending',
    claimed_at = COALESCE(
      internal.account_deletion_jobs_v1.claimed_at,
      clock_timestamp()
    ),
    updated_at = clock_timestamp(),
    cancelled_at = NULL,
    completed_at = NULL;

  RETURN true;
END;
$function$;

REVOKE ALL
ON FUNCTION public.claim_scheduled_account_deletion_v1(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
ON FUNCTION public.claim_scheduled_account_deletion_v1(uuid)
TO service_role;


-- Claims due RPC-created requests, including the no-business/shared-only case.
CREATE FUNCTION public.claim_due_account_deletion_requests_v1()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_candidate record;
  v_business record;
  v_owned_business_count bigint;
  v_claimed bigint := 0;
BEGIN
  IF NOT internal.account_deletion_worker_authorized_v1() THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  FOR v_candidate IN
    SELECT
      job_row.user_id,
      job_row.isletme_id,
      job_row.scheduled_deletion_at
    FROM internal.account_deletion_jobs_v1 AS job_row
    WHERE job_row.state = 'scheduled'
      AND job_row.scheduled_deletion_at <= clock_timestamp()
    ORDER BY job_row.scheduled_deletion_at, job_row.user_id
  LOOP
    PERFORM internal.account_deletion_lock_user_v1(v_candidate.user_id);

    -- Re-read under the canonical lock. Taking a job row lock before the
    -- advisory lock would invert cancel/schedule lock order and could deadlock.
    SELECT
      job_row.user_id,
      job_row.isletme_id,
      job_row.scheduled_deletion_at
    INTO v_candidate
    FROM internal.account_deletion_jobs_v1 AS job_row
    WHERE job_row.user_id = v_candidate.user_id
      AND job_row.state = 'scheduled'
      AND job_row.scheduled_deletion_at <= clock_timestamp()
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF internal.account_deletion_has_post_due_user_activity_v1(
         v_candidate.user_id,
         v_candidate.scheduled_deletion_at
       )
    THEN
      UPDATE internal.account_deletion_jobs_v1 AS job_row
      SET
        state = 'cancelled',
        cancelled_at = clock_timestamp(),
        updated_at = clock_timestamp()
      WHERE job_row.user_id = v_candidate.user_id
        AND job_row.state = 'scheduled';
      CONTINUE;
    END IF;

    SELECT pg_catalog.count(*)
    INTO v_owned_business_count
    FROM public.isletmeler AS owned_business
    WHERE owned_business.user_id = v_candidate.user_id;

    IF v_candidate.isletme_id IS NULL THEN
      IF v_owned_business_count <> 0 THEN
        UPDATE internal.account_deletion_jobs_v1 AS job_row
        SET
          state = 'cancelled',
          cancelled_at = clock_timestamp(),
          updated_at = clock_timestamp()
        WHERE job_row.user_id = v_candidate.user_id
          AND job_row.state = 'scheduled';
        CONTINUE;
      END IF;
    ELSE
      SELECT
        business_row.user_id,
        business_row.scheduled_deletion_at
      INTO v_business
      FROM public.isletmeler AS business_row
      WHERE business_row.id = v_candidate.isletme_id
      FOR UPDATE;

      IF NOT FOUND
         OR v_owned_business_count <> 1
         OR v_business.user_id IS DISTINCT FROM v_candidate.user_id
         OR v_business.scheduled_deletion_at
            IS DISTINCT FROM v_candidate.scheduled_deletion_at
         OR internal.account_deletion_has_post_due_business_activity_v1(
              v_candidate.isletme_id,
              v_candidate.scheduled_deletion_at
            )
      THEN
        UPDATE internal.account_deletion_jobs_v1 AS job_row
        SET
          state = 'cancelled',
          cancelled_at = clock_timestamp(),
          updated_at = clock_timestamp()
        WHERE job_row.user_id = v_candidate.user_id
          AND job_row.state = 'scheduled';
        CONTINUE;
      END IF;
    END IF;

    UPDATE internal.account_deletion_jobs_v1 AS job_row
    SET
      state = 'pending',
      claimed_at = clock_timestamp(),
      updated_at = clock_timestamp()
    WHERE job_row.user_id = v_candidate.user_id
      AND job_row.state = 'scheduled';

    IF FOUND THEN
      v_claimed := v_claimed + 1;
    END IF;
  END LOOP;

  RETURN v_claimed;
END;
$function$;

REVOKE ALL
ON FUNCTION public.claim_due_account_deletion_requests_v1()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
ON FUNCTION public.claim_due_account_deletion_requests_v1()
TO service_role;


CREATE FUNCTION public.list_pending_account_deletion_jobs_v1()
RETURNS TABLE (
  user_id uuid,
  isletme_id uuid,
  business_name text,
  scheduled_deletion_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF NOT internal.account_deletion_worker_authorized_v1() THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    job_row.user_id,
    job_row.isletme_id,
    job_row.business_name,
    job_row.scheduled_deletion_at
  FROM internal.account_deletion_jobs_v1 AS job_row
  WHERE job_row.state = 'pending'
  ORDER BY job_row.claimed_at, job_row.user_id;
END;
$function$;

REVOKE ALL
ON FUNCTION public.list_pending_account_deletion_jobs_v1()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
ON FUNCTION public.list_pending_account_deletion_jobs_v1()
TO service_role;


CREATE FUNCTION public.prepare_account_deletion_storage_v1(
  p_user_id uuid
)
RETURNS TABLE (
  job_state text,
  business_exists boolean,
  auth_user_exists boolean,
  user_id uuid,
  scheduled_deletion_at timestamptz,
  paths text[],
  remaining_count bigint,
  transferred_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_job internal.account_deletion_jobs_v1%ROWTYPE;
  v_business record;
  v_business_exists boolean := false;
  v_auth_user_exists boolean := false;
  v_owned_business_count bigint;
  v_paths text[] := ARRAY[]::text[];
  v_remaining_count bigint := 0;
  v_transferred_count bigint := 0;
BEGIN
  IF NOT internal.account_deletion_worker_authorized_v1() THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  PERFORM internal.account_deletion_lock_user_v1(p_user_id);

  SELECT job_row.*
  INTO v_job
  FROM internal.account_deletion_jobs_v1 AS job_row
  WHERE job_row.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_JOB_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_job.isletme_id IS NOT NULL THEN
    SELECT
      business_row.user_id,
      business_row.scheduled_deletion_at
    INTO v_business
    FROM public.isletmeler AS business_row
    WHERE business_row.id = v_job.isletme_id
    FOR UPDATE;
    v_business_exists := FOUND;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    WHERE auth_user.id = v_job.user_id
  )
  INTO v_auth_user_exists;

  IF v_job.state <> 'pending' THEN
    RETURN QUERY SELECT
      v_job.state,
      v_business_exists,
      v_auth_user_exists,
      v_job.user_id,
      v_job.scheduled_deletion_at,
      ARRAY[]::text[],
      0::bigint,
      0::bigint;
    RETURN;
  END IF;

  IF v_auth_user_exists THEN
    IF internal.account_deletion_has_post_due_user_activity_v1(
         v_job.user_id,
         v_job.scheduled_deletion_at
       )
    THEN
      UPDATE internal.account_deletion_jobs_v1 AS job_row
      SET
        state = 'cancelled',
        cancelled_at = clock_timestamp(),
        updated_at = clock_timestamp()
      WHERE job_row.user_id = v_job.user_id
        AND job_row.state = 'pending';

      RETURN QUERY SELECT
        'cancelled'::text,
        v_business_exists,
        true,
        v_job.user_id,
        v_job.scheduled_deletion_at,
        ARRAY[]::text[],
        0::bigint,
        0::bigint;
      RETURN;
    END IF;

    SELECT pg_catalog.count(*)
    INTO v_owned_business_count
    FROM public.isletmeler AS owned_business
    WHERE owned_business.user_id = v_job.user_id;

    IF v_job.isletme_id IS NULL THEN
      IF v_owned_business_count <> 0 THEN
        UPDATE internal.account_deletion_jobs_v1 AS job_row
        SET
          state = 'cancelled',
          cancelled_at = clock_timestamp(),
          updated_at = clock_timestamp()
        WHERE job_row.user_id = v_job.user_id
          AND job_row.state = 'pending';

        RETURN QUERY SELECT
          'cancelled'::text,
          false,
          true,
          v_job.user_id,
          v_job.scheduled_deletion_at,
          ARRAY[]::text[],
          0::bigint,
          0::bigint;
        RETURN;
      END IF;
    ELSE
      IF NOT v_business_exists
         OR v_business.user_id IS DISTINCT FROM v_job.user_id
         OR v_owned_business_count <> 1
         OR v_business.scheduled_deletion_at IS NULL
         OR v_business.scheduled_deletion_at
            IS DISTINCT FROM v_job.scheduled_deletion_at
         OR v_business.scheduled_deletion_at > clock_timestamp()
         OR internal.account_deletion_has_post_due_business_activity_v1(
              v_job.isletme_id,
              v_job.scheduled_deletion_at
            )
      THEN
        UPDATE internal.account_deletion_jobs_v1 AS job_row
        SET
          state = 'cancelled',
          cancelled_at = clock_timestamp(),
          updated_at = clock_timestamp()
        WHERE job_row.user_id = v_job.user_id
          AND job_row.state = 'pending';

        RETURN QUERY SELECT
          'cancelled'::text,
          v_business_exists,
          true,
          v_job.user_id,
          v_job.scheduled_deletion_at,
          ARRAY[]::text[],
          0::bigint,
          0::bigint;
        RETURN;
      END IF;
    END IF;
  ELSIF v_business_exists THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_AUTH_MISSING_BEFORE_CASCADE'
      USING ERRCODE = 'P0001';
  END IF;

  -- Preserve a deleting user's uploads that belong to another business by
  -- handing ownership to that business owner. This covers shared-only users.
  UPDATE storage.objects AS object_row
  SET
    owner = destination_business.user_id,
    owner_id = destination_business.user_id::text,
    updated_at = clock_timestamp()
  FROM public.isletmeler AS destination_business
  WHERE object_row.bucket_id = 'islem-photos'
    AND (
      object_row.owner_id = v_job.user_id::text
      OR object_row.owner = v_job.user_id
    )
    AND object_row.name IS NOT NULL
    AND pg_catalog.split_part(object_row.name, '/', 1)
        = destination_business.id::text
    AND (
      v_job.isletme_id IS NULL
      OR destination_business.id <> v_job.isletme_id
    )
    AND destination_business.user_id <> v_job.user_id;
  GET DIAGNOSTICS v_transferred_count = ROW_COUNT;

  -- Unknown buckets are never guessed/deleted; Auth remains intact so an
  -- operator can inspect and transfer them safely.
  IF EXISTS (
    SELECT 1
    FROM storage.objects AS object_row
    WHERE object_row.bucket_id IS DISTINCT FROM 'islem-photos'
      AND (
        object_row.owner_id = v_job.user_id::text
        OR object_row.owner = v_job.user_id
      )
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_FOREIGN_BUCKET_OBJECTS'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM storage.objects AS object_row
    WHERE object_row.bucket_id = 'islem-photos'
      AND (
        object_row.owner_id = v_job.user_id::text
        OR object_row.owner = v_job.user_id
      )
      AND object_row.name IS NULL
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_INVALID_STORAGE_METADATA'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_remaining_count
  FROM storage.objects AS object_row
  WHERE object_row.bucket_id = 'islem-photos'
    AND (
      (
        v_job.isletme_id IS NOT NULL
        AND object_row.name LIKE v_job.isletme_id::text || '/%'
      )
      OR object_row.owner_id = v_job.user_id::text
      OR object_row.owner = v_job.user_id
    );

  SELECT COALESCE(
    pg_catalog.array_agg(candidate_row.name ORDER BY candidate_row.name),
    ARRAY[]::text[]
  )
  INTO v_paths
  FROM (
    SELECT object_row.name
    FROM storage.objects AS object_row
    WHERE object_row.bucket_id = 'islem-photos'
      AND (
        (
          v_job.isletme_id IS NOT NULL
          AND object_row.name LIKE v_job.isletme_id::text || '/%'
        )
        OR object_row.owner_id = v_job.user_id::text
        OR object_row.owner = v_job.user_id
      )
    ORDER BY object_row.name
    LIMIT 100
  ) AS candidate_row;

  IF v_auth_user_exists AND v_remaining_count = 0 THEN
    -- Clear only attribution FKs that historically used RESTRICT. Business
    -- records remain. Other audit columns already use ON DELETE SET NULL and
    -- memberships use ON DELETE CASCADE.
    PERFORM pg_catalog.set_config(
      'internal.account_deletion_note_detach_user_id',
      v_job.user_id::text,
      true
    );

    UPDATE public.notlar AS note_row
    SET created_by = NULL
    WHERE note_row.created_by = v_job.user_id
      AND (
        v_job.isletme_id IS NULL
        OR note_row.isletme_id <> v_job.isletme_id
      );

    PERFORM pg_catalog.set_config(
      'internal.account_deletion_note_detach_user_id',
      '',
      true
    );

    UPDATE public.isletme_invites AS invite_row
    SET accepted_by = NULL
    WHERE invite_row.accepted_by = v_job.user_id
      AND (
        v_job.isletme_id IS NULL
        OR invite_row.isletme_id <> v_job.isletme_id
      );

    UPDATE public.isletme_invites AS invite_row
    SET invited_by = destination_business.user_id
    FROM public.isletmeler AS destination_business
    WHERE invite_row.invited_by = v_job.user_id
      AND invite_row.isletme_id = destination_business.id
      AND (
        v_job.isletme_id IS NULL
        OR destination_business.id <> v_job.isletme_id
      )
      AND destination_business.user_id <> v_job.user_id;
  END IF;

  UPDATE internal.account_deletion_jobs_v1 AS job_row
  SET updated_at = clock_timestamp()
  WHERE job_row.user_id = v_job.user_id;

  RETURN QUERY SELECT
    'pending'::text,
    v_business_exists,
    v_auth_user_exists,
    v_job.user_id,
    v_job.scheduled_deletion_at,
    v_paths,
    v_remaining_count,
    v_transferred_count;
END;
$function$;

REVOKE ALL
ON FUNCTION public.prepare_account_deletion_storage_v1(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
ON FUNCTION public.prepare_account_deletion_storage_v1(uuid)
TO service_role;


CREATE FUNCTION public.complete_account_deletion_job_v1(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_job internal.account_deletion_jobs_v1%ROWTYPE;
BEGIN
  IF NOT internal.account_deletion_worker_authorized_v1() THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  PERFORM internal.account_deletion_lock_user_v1(p_user_id);

  SELECT job_row.*
  INTO v_job
  FROM internal.account_deletion_jobs_v1 AS job_row
  WHERE job_row.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_job.state <> 'pending' THEN
    RETURN false;
  END IF;

  IF EXISTS (
       SELECT 1
       FROM auth.users AS auth_user
       WHERE auth_user.id = v_job.user_id
     )
     OR (
       v_job.isletme_id IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM public.isletmeler AS business_row
         WHERE business_row.id = v_job.isletme_id
       )
     )
     OR EXISTS (
       SELECT 1
       FROM public.isletme_users AS membership_row
       WHERE membership_row.user_id = v_job.user_id
     )
     OR EXISTS (
       SELECT 1
       FROM storage.objects AS object_row
       WHERE (
         object_row.bucket_id = 'islem-photos'
         AND v_job.isletme_id IS NOT NULL
         AND object_row.name LIKE v_job.isletme_id::text || '/%'
       )
       OR object_row.owner_id = v_job.user_id::text
       OR object_row.owner = v_job.user_id
     )
  THEN
    RETURN false;
  END IF;

  UPDATE internal.account_deletion_jobs_v1 AS job_row
  SET
    state = 'completed',
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE job_row.user_id = v_job.user_id
    AND job_row.state = 'pending';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- TN3194: the refresh token used for revocation is itself user-related data
  -- and must not remain after verified account deletion.
  DELETE FROM internal.apple_revocation_credentials_v1 AS credential_row
  WHERE credential_row.user_id = v_job.user_id;

  RETURN true;
END;
$function$;

REVOKE ALL
ON FUNCTION public.complete_account_deletion_job_v1(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
ON FUNCTION public.complete_account_deletion_job_v1(uuid)
TO service_role;


COMMENT ON TABLE internal.account_deletion_jobs_v1 IS
  'Durable scheduled-account deletion ledger keyed by Auth user; nullable business supports shared-only/no-owned accounts and has intentionally no Auth/business FK.';
COMMENT ON FUNCTION public.schedule_own_account_deletion_v1() IS
  'Authenticated self-service deletion request; supports zero or one owned business and returns a server-derived seven-day deadline.';
COMMENT ON FUNCTION public.prepare_account_deletion_storage_v1(uuid) IS
  'Service-role-only bounded Storage cleanup planner and ownership handoff; never deletes object bytes with SQL.';
COMMENT ON FUNCTION public.complete_account_deletion_job_v1(uuid) IS
  'Marks deletion complete only after Storage ownership/prefix, memberships, Auth and optional business postconditions are empty.';


DO $postcondition$
BEGIN
  IF pg_catalog.to_regclass(
       'internal.account_deletion_jobs_v1'
     ) IS NULL
     OR pg_catalog.to_regclass(
       'internal.apple_revocation_credentials_v1'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.schedule_own_account_deletion_v1()'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.cancel_own_account_deletion_v1()'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.get_own_account_deletion_status_v1()'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.claim_scheduled_account_deletion_v1(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.claim_due_account_deletion_requests_v1()'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.list_pending_account_deletion_jobs_v1()'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.prepare_account_deletion_storage_v1(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.complete_account_deletion_job_v1(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.store_apple_revocation_credential_v1(uuid,text,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.get_apple_revocation_credential_v1(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.mark_apple_revocation_attempt_v1(uuid,boolean,text)'
     ) IS NULL
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.prepare_account_deletion_storage_v1(uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.cancel_own_account_deletion_v1()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.store_apple_revocation_credential_v1(uuid,text,text)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'public.schedule_own_account_deletion_v1()',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'public.cancel_own_account_deletion_v1()',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'service_role',
       'public.claim_due_account_deletion_requests_v1()',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'service_role',
       'public.prepare_account_deletion_storage_v1(uuid)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'service_role',
       'public.get_apple_revocation_credential_v1(uuid)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION
      'scheduled account deletion postcondition failed';
  END IF;
END;
$postcondition$;

COMMIT;
