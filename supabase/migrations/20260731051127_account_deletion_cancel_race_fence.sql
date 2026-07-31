BEGIN;

-- Account-deletion cancellation/claim race fence.
--
-- Compatibility:
-- * Function signatures and grants used by 1.5.x/current clients are preserved.
-- * A request can be cancelled only while its durable job is still `scheduled`.
--   Once the worker has won the row and moved it to `pending`, schedule/cancel
--   and legacy timestamp changes fail closed with one stable error code.
-- * Legacy clients may still create/cancel a not-yet-claimed request by writing
--   isletmeler.scheduled_deletion_at directly.
-- * Applying this migration performs no user/business/job-row DML.

DO $precondition$
DECLARE
  v_schedule_body text;
  v_cancel_body text;
BEGIN
  IF pg_catalog.to_regclass(
       'internal.account_deletion_jobs_v1'
     ) IS NULL
     OR pg_catalog.to_regclass('public.isletmeler') IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.account_deletion_lock_user_v1(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.schedule_own_account_deletion_v1()'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.cancel_own_account_deletion_v1()'
     ) IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS attribute_row
       WHERE attribute_row.attrelid =
         'public.isletmeler'::pg_catalog.regclass
         AND attribute_row.attname = 'scheduled_deletion_at'
         AND attribute_row.atttypid =
           'pg_catalog.timestamptz'::pg_catalog.regtype
         AND attribute_row.attnum > 0
         AND NOT attribute_row.attisdropped
     )
  THEN
    RAISE EXCEPTION
      'ACCOUNT_DELETE_CANCEL_RACE_PRECONDITION_SCHEMA_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid =
      'public.isletmeler'::pg_catalog.regclass
      AND trigger_row.tgname =
        'trg_guard_pending_account_deletion_timestamp_v1'
      AND NOT trigger_row.tgisinternal
  ) OR pg_catalog.to_regprocedure(
    'public.guard_pending_account_deletion_timestamp_v1()'
  ) IS NOT NULL THEN
    RAISE EXCEPTION
      'ACCOUNT_DELETE_CANCEL_RACE_PRECONDITION_ALREADY_INSTALLED';
  END IF;

  SELECT function_row.prosrc
  INTO v_schedule_body
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid =
    'public.schedule_own_account_deletion_v1()'
      ::pg_catalog.regprocedure;

  SELECT function_row.prosrc
  INTO v_cancel_body
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid =
    'public.cancel_own_account_deletion_v1()'
      ::pg_catalog.regprocedure;

  -- Do not silently overwrite an independently changed live definition.
  IF v_schedule_body !~ 'ON CONFLICT \(user_id\) DO UPDATE'
     OR v_schedule_body !~ 'state = ''scheduled'''
     OR v_schedule_body ~ 'ACCOUNT_DELETE_ALREADY_PROCESSING'
     OR v_cancel_body !~
       'job_row\.state IN \(''scheduled'', ''pending''\)'
     OR v_cancel_body ~ 'ACCOUNT_DELETE_ALREADY_PROCESSING'
  THEN
    RAISE EXCEPTION
      'ACCOUNT_DELETE_CANCEL_RACE_PRECONDITION_FUNCTION_DRIFT';
  END IF;
END;
$precondition$;


CREATE OR REPLACE FUNCTION public.schedule_own_account_deletion_v1()
RETURNS TABLE (
  scheduled_deletion_at timestamptz,
  isletme_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing_job internal.account_deletion_jobs_v1%ROWTYPE;
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

  -- The worker, schedule and cancel paths all take the advisory lock before
  -- this durable row lock. Whichever transition locks the row first wins.
  SELECT job_row.*
  INTO v_existing_job
  FROM internal.account_deletion_jobs_v1 AS job_row
  WHERE job_row.user_id = v_user_id
  FOR UPDATE;

  IF FOUND AND v_existing_job.state = 'pending' THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_ALREADY_PROCESSING'
      USING ERRCODE = 'P0001';
  END IF;

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

  DELETE FROM public.push_tokens AS token_row
  WHERE token_row.user_id = v_user_id;

  RETURN QUERY SELECT v_due_at, v_business.id;
END;
$function$;

ALTER FUNCTION public.schedule_own_account_deletion_v1()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.schedule_own_account_deletion_v1()
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.schedule_own_account_deletion_v1()
TO authenticated;


CREATE OR REPLACE FUNCTION public.cancel_own_account_deletion_v1()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_job internal.account_deletion_jobs_v1%ROWTYPE;
  v_cancelled_isletme_id uuid;
  v_cancelled_due_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_NOT_AUTHENTICATED'
      USING ERRCODE = '42501';
  END IF;

  PERFORM internal.account_deletion_lock_user_v1(v_user_id);

  SELECT job_row.*
  INTO v_job
  FROM internal.account_deletion_jobs_v1 AS job_row
  WHERE job_row.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_job.state = 'pending' THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_ALREADY_PROCESSING'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_job.state IS DISTINCT FROM 'scheduled' THEN
    RETURN false;
  END IF;

  UPDATE internal.account_deletion_jobs_v1 AS job_row
  SET
    state = 'cancelled',
    cancelled_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE job_row.user_id = v_user_id
    AND job_row.state = 'scheduled'
  RETURNING
    job_row.isletme_id,
    job_row.scheduled_deletion_at
  INTO
    v_cancelled_isletme_id,
    v_cancelled_due_at;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Never clear a newer/independent legacy request. The business compatibility
  -- timestamp belongs to this cancellation only when both identity and due
  -- timestamp still match the durable scheduled job that just won cancellation.
  IF v_cancelled_isletme_id IS NOT NULL THEN
    UPDATE public.isletmeler AS business_row
    SET scheduled_deletion_at = NULL
    WHERE business_row.id = v_cancelled_isletme_id
      AND business_row.user_id = v_user_id
      AND business_row.scheduled_deletion_at
        IS NOT DISTINCT FROM v_cancelled_due_at;
  END IF;

  RETURN true;
END;
$function$;

ALTER FUNCTION public.cancel_own_account_deletion_v1()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.cancel_own_account_deletion_v1()
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.cancel_own_account_deletion_v1()
TO authenticated;


-- Legacy 1.5.x clients write the compatibility timestamp directly. A row-level
-- BEFORE trigger is intentionally limited to an actual timestamp change. It
-- takes the durable job row NOWAIT: if the worker already owns that row, the
-- legacy write loses immediately instead of waiting while holding the business
-- row and creating the inverse business-row/job-row deadlock.
CREATE FUNCTION public.guard_pending_account_deletion_timestamp_v1()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_job_state text;
  v_job_isletme_id uuid;
BEGIN
  BEGIN
    SELECT
      job_row.state,
      job_row.isletme_id
    INTO
      v_job_state,
      v_job_isletme_id
    FROM internal.account_deletion_jobs_v1 AS job_row
    WHERE job_row.user_id = OLD.user_id
    FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RAISE EXCEPTION 'ACCOUNT_DELETE_ALREADY_PROCESSING'
        USING ERRCODE = 'P0001';
  END;

  IF v_job_state = 'pending' THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_ALREADY_PROCESSING'
      USING ERRCODE = 'P0001';
  END IF;

  -- Mixed-version bridge: once a durable row exists, the legacy business
  -- timestamp and that row must remain one state machine. Otherwise an old
  -- client can appear to cancel locally while the durable job still deletes
  -- the account seven days later.
  IF v_job_state IN ('scheduled', 'cancelled') THEN
    IF v_job_isletme_id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'ACCOUNT_DELETE_JOB_IDENTITY_DRIFT'
        USING ERRCODE = 'P0001';
    END IF;

    IF NEW.scheduled_deletion_at IS NULL THEN
      UPDATE internal.account_deletion_jobs_v1 AS job_row
      SET
        state = 'cancelled',
        cancelled_at = clock_timestamp(),
        updated_at = clock_timestamp()
      WHERE job_row.user_id = OLD.user_id
        AND job_row.isletme_id = OLD.id
        AND job_row.state IN ('scheduled', 'cancelled');
    ELSE
      UPDATE internal.account_deletion_jobs_v1 AS job_row
      SET
        scheduled_deletion_at = NEW.scheduled_deletion_at,
        state = 'scheduled',
        requested_at = clock_timestamp(),
        claimed_at = NULL,
        cancelled_at = NULL,
        completed_at = NULL,
        updated_at = clock_timestamp()
      WHERE job_row.user_id = OLD.user_id
        AND job_row.isletme_id = OLD.id
        AND job_row.state IN ('scheduled', 'cancelled');
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ACCOUNT_DELETE_STATE_CHANGED'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.guard_pending_account_deletion_timestamp_v1()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.guard_pending_account_deletion_timestamp_v1()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_guard_pending_account_deletion_timestamp_v1
BEFORE UPDATE OF scheduled_deletion_at
ON public.isletmeler
FOR EACH ROW
WHEN (
  OLD.scheduled_deletion_at
    IS DISTINCT FROM NEW.scheduled_deletion_at
)
EXECUTE FUNCTION public.guard_pending_account_deletion_timestamp_v1();


COMMENT ON FUNCTION public.cancel_own_account_deletion_v1() IS
  'Cancels only a scheduled self-service deletion; pending is a stable fail-closed ACCOUNT_DELETE_ALREADY_PROCESSING error.';

COMMENT ON FUNCTION public.guard_pending_account_deletion_timestamp_v1() IS
  'Legacy timestamp bridge: NOWAIT-locks the durable job, synchronizes scheduled/cancelled changes and rejects changes after worker claim.';


DO $postcondition$
DECLARE
  v_schedule pg_catalog.pg_proc%ROWTYPE;
  v_cancel pg_catalog.pg_proc%ROWTYPE;
  v_guard pg_catalog.pg_proc%ROWTYPE;
  v_trigger_definition text;
BEGIN
  SELECT function_row.*
  INTO v_schedule
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid =
    'public.schedule_own_account_deletion_v1()'
      ::pg_catalog.regprocedure;

  SELECT function_row.*
  INTO v_cancel
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid =
    'public.cancel_own_account_deletion_v1()'
      ::pg_catalog.regprocedure;

  SELECT function_row.*
  INTO v_guard
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid =
    'public.guard_pending_account_deletion_timestamp_v1()'
      ::pg_catalog.regprocedure;

  SELECT pg_catalog.pg_get_triggerdef(trigger_row.oid, true)
  INTO v_trigger_definition
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid =
    'public.isletmeler'::pg_catalog.regclass
    AND trigger_row.tgname =
      'trg_guard_pending_account_deletion_timestamp_v1'
    AND NOT trigger_row.tgisinternal
    AND trigger_row.tgenabled = 'O';

  IF v_schedule.oid IS NULL
     OR v_cancel.oid IS NULL
     OR v_guard.oid IS NULL
     OR v_schedule.prosecdef IS NOT TRUE
     OR v_cancel.prosecdef IS NOT TRUE
     OR v_guard.prosecdef IS NOT TRUE
     OR v_schedule.provolatile IS DISTINCT FROM 'v'
     OR v_cancel.provolatile IS DISTINCT FROM 'v'
     OR v_guard.provolatile IS DISTINCT FROM 'v'
     OR pg_catalog.pg_get_userbyid(v_schedule.proowner)
        IS DISTINCT FROM 'postgres'
     OR pg_catalog.pg_get_userbyid(v_cancel.proowner)
        IS DISTINCT FROM 'postgres'
     OR pg_catalog.pg_get_userbyid(v_guard.proowner)
        IS DISTINCT FROM 'postgres'
     OR v_schedule.prosrc !~ 'ACCOUNT_DELETE_ALREADY_PROCESSING'
     OR v_cancel.prosrc !~ 'ACCOUNT_DELETE_ALREADY_PROCESSING'
     OR v_guard.prosrc !~ 'FOR UPDATE NOWAIT'
     OR v_guard.prosrc !~ 'lock_not_available'
     OR v_trigger_definition IS NULL
     OR v_trigger_definition !~
       'BEFORE UPDATE OF scheduled_deletion_at ON (public\.)?isletmeler'
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
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.cancel_own_account_deletion_v1()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.guard_pending_account_deletion_timestamp_v1()',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION
      'ACCOUNT_DELETE_CANCEL_RACE_POSTCONDITION_FAILED';
  END IF;
END;
$postcondition$;

COMMIT;
