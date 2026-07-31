\set ON_ERROR_STOP on

-- LOCAL-ONLY integration contract for the scheduled->pending cancellation
-- boundary. Run only against the disposable Supabase CLI database on 54322.
-- All fixture mutations are rolled back.

\if :{?local_confirmation}
\else
  \echo 'LOCAL-ONLY confirmation variable is required'
  \quit 3
\endif

SELECT :'local_confirmation' = 'LOCAL_ONLY_54322' AS local_ok \gset
\if :local_ok
\else
  \echo 'Invalid LOCAL-ONLY confirmation value'
  \quit 3
\endif

BEGIN;

DO $preflight$
DECLARE
  v_guard_source text;
BEGIN
  IF pg_catalog.current_database() IS DISTINCT FROM 'postgres'
     OR pg_catalog.to_regprocedure(
       'public.schedule_own_account_deletion_v1()'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.cancel_own_account_deletion_v1()'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.guard_pending_account_deletion_timestamp_v1()'
     ) IS NULL
  THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_CANCEL_RACE_LOCAL_SCHEMA_REQUIRED';
  END IF;

  SELECT function_row.prosrc
  INTO v_guard_source
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid =
    'public.guard_pending_account_deletion_timestamp_v1()'
      ::pg_catalog.regprocedure;

  IF v_guard_source !~ 'FOR UPDATE NOWAIT'
     OR v_guard_source !~ 'lock_not_available'
     OR v_guard_source !~ 'ACCOUNT_DELETE_ALREADY_PROCESSING'
  THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_CANCEL_RACE_NOWAIT_GUARD_MISSING';
  END IF;
END;
$preflight$;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a3000000-0000-4000-8000-000000000003',
  'authenticated',
  'authenticated',
  'account-delete-race@example.invalid',
  '',
  clock_timestamp() - interval '3 days',
  clock_timestamp() - interval '3 days',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  clock_timestamp() - interval '3 days',
  clock_timestamp() - interval '3 days'
);

-- Bypass an obsolete default-category fixture trigger that can remain in a
-- disposable local snapshot; normal trigger behavior resumes immediately.
SET LOCAL session_replication_role = 'replica';

INSERT INTO public.isletmeler (
  id,
  user_id,
  name,
  created_at,
  updated_at
)
VALUES (
  'b3000000-0000-4000-8000-000000000003',
  'a3000000-0000-4000-8000-000000000003',
  'Cancellation Race Fixture',
  clock_timestamp() - interval '3 days',
  clock_timestamp() - interval '3 days'
);

SET LOCAL session_replication_role = 'origin';

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"a3000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

-- No durable request: stable false, no unrelated business mutation.
DO $missing_cancel$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.cancel_own_account_deletion_v1()
  INTO v_result;

  IF v_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_CANCEL_MISSING_MUST_BE_FALSE';
  END IF;
END;
$missing_cancel$;

SELECT * FROM public.schedule_own_account_deletion_v1();

-- Mixed-version reschedule: a 1.5.x timestamp write must move the durable
-- deadline in the same transaction.
UPDATE public.isletmeler AS business_row
SET scheduled_deletion_at =
  business_row.scheduled_deletion_at + interval '1 day'
WHERE business_row.id =
  'b3000000-0000-4000-8000-000000000003';

DO $legacy_reschedule_assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.account_deletion_jobs_v1 AS job_row
    JOIN public.isletmeler AS business_row
      ON business_row.id = job_row.isletme_id
    WHERE job_row.user_id =
      'a3000000-0000-4000-8000-000000000003'
      AND job_row.state = 'scheduled'
      AND job_row.scheduled_deletion_at =
        business_row.scheduled_deletion_at
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_LEGACY_RESCHEDULE_NOT_SYNCED';
  END IF;
END;
$legacy_reschedule_assertions$;

-- Mixed-version cancel: clearing the legacy timestamp must cancel the durable
-- scheduled job immediately, not leave a hidden deletion armed for day seven.
UPDATE public.isletmeler AS business_row
SET scheduled_deletion_at = NULL
WHERE business_row.id =
  'b3000000-0000-4000-8000-000000000003';

DO $legacy_cancel_assertions$
DECLARE
  v_result boolean;
BEGIN
  IF NOT EXISTS (
       SELECT 1
       FROM internal.account_deletion_jobs_v1 AS job_row
       WHERE job_row.user_id =
         'a3000000-0000-4000-8000-000000000003'
         AND job_row.state = 'cancelled'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.isletmeler AS business_row
       WHERE business_row.id =
         'b3000000-0000-4000-8000-000000000003'
         AND business_row.scheduled_deletion_at IS NULL
     )
  THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_LEGACY_CANCEL_NOT_SYNCED';
  END IF;

  SELECT public.cancel_own_account_deletion_v1()
  INTO v_result;
  IF v_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_CANCEL_CANCELLED_MUST_BE_FALSE';
  END IF;
END;
$legacy_cancel_assertions$;

-- A later legacy non-null write reopens the cancelled durable request and
-- synchronizes the new deadline.
UPDATE public.isletmeler AS business_row
SET scheduled_deletion_at = clock_timestamp() + interval '9 days'
WHERE business_row.id =
  'b3000000-0000-4000-8000-000000000003';

DO $legacy_reopen_assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.account_deletion_jobs_v1 AS job_row
    JOIN public.isletmeler AS business_row
      ON business_row.id = job_row.isletme_id
    WHERE job_row.user_id =
      'a3000000-0000-4000-8000-000000000003'
      AND job_row.state = 'scheduled'
      AND job_row.cancelled_at IS NULL
      AND job_row.scheduled_deletion_at =
        business_row.scheduled_deletion_at
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_LEGACY_REOPEN_NOT_SYNCED';
  END IF;
END;
$legacy_reopen_assertions$;

-- Fixture-only deadline drift bypasses triggers. Cancelling the durable
-- request must not erase this independent newer compatibility timestamp.
SET LOCAL session_replication_role = 'replica';

UPDATE public.isletmeler AS business_row
SET scheduled_deletion_at =
  business_row.scheduled_deletion_at + interval '1 day'
WHERE business_row.id =
  'b3000000-0000-4000-8000-000000000003';

SET LOCAL session_replication_role = 'origin';

DO $mismatched_cancel$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.cancel_own_account_deletion_v1()
  INTO v_result;

  IF v_result IS DISTINCT FROM true
     OR NOT EXISTS (
       SELECT 1
       FROM internal.account_deletion_jobs_v1 AS job_row
       WHERE job_row.user_id =
         'a3000000-0000-4000-8000-000000000003'
         AND job_row.state = 'cancelled'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.isletmeler AS business_row
       WHERE business_row.id =
         'b3000000-0000-4000-8000-000000000003'
         AND business_row.scheduled_deletion_at IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_CANCEL_MISMATCH_CLEARED_NEW_REQUEST';
  END IF;
END;
$mismatched_cancel$;

-- Completed is also stable false.
UPDATE internal.account_deletion_jobs_v1 AS job_row
SET state = 'completed'
WHERE job_row.user_id =
  'a3000000-0000-4000-8000-000000000003';

DO $completed_cancel$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.cancel_own_account_deletion_v1()
  INTO v_result;
  IF v_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_CANCEL_COMPLETED_MUST_BE_FALSE';
  END IF;
END;
$completed_cancel$;

-- Rescheduling restores one matching durable/business deadline. A real
-- scheduled cancellation clears exactly that matching compatibility timestamp.
SELECT * FROM public.schedule_own_account_deletion_v1();

DO $matching_cancel$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.cancel_own_account_deletion_v1()
  INTO v_result;

  IF v_result IS DISTINCT FROM true
     OR NOT EXISTS (
       SELECT 1
       FROM public.isletmeler AS business_row
       WHERE business_row.id =
         'b3000000-0000-4000-8000-000000000003'
         AND business_row.scheduled_deletion_at IS NULL
     )
  THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_CANCEL_MATCHED_TIMESTAMP_NOT_CLEARED';
  END IF;
END;
$matching_cancel$;

-- Move a fresh request through the real service-role claim path.
SELECT * FROM public.schedule_own_account_deletion_v1();

-- Fixture-only clock rewind: bypass unrelated updated_at triggers so the
-- worker's intentional "activity after due time cancels deletion" safeguard
-- does not classify this test setup itself as new business activity.
SET LOCAL session_replication_role = 'replica';

UPDATE public.isletmeler AS business_row
SET
  scheduled_deletion_at = clock_timestamp() - interval '1 hour',
  updated_at = clock_timestamp() - interval '3 days'
WHERE business_row.id =
  'b3000000-0000-4000-8000-000000000003';

SET LOCAL session_replication_role = 'origin';

UPDATE internal.account_deletion_jobs_v1 AS job_row
SET scheduled_deletion_at = (
  SELECT business_row.scheduled_deletion_at
  FROM public.isletmeler AS business_row
  WHERE business_row.id =
    'b3000000-0000-4000-8000-000000000003'
)
WHERE job_row.user_id =
  'a3000000-0000-4000-8000-000000000003';

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

SELECT public.claim_due_account_deletion_requests_v1();

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"a3000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

DO $pending_boundaries$
DECLARE
  v_before_due timestamptz;
  v_error_seen boolean := false;
BEGIN
  SELECT job_row.scheduled_deletion_at
  INTO v_before_due
  FROM internal.account_deletion_jobs_v1 AS job_row
  WHERE job_row.user_id =
    'a3000000-0000-4000-8000-000000000003'
    AND job_row.state = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_CANCEL_PENDING_FIXTURE_NOT_CLAIMED';
  END IF;

  BEGIN
    PERFORM public.cancel_own_account_deletion_v1();
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM IS DISTINCT FROM 'ACCOUNT_DELETE_ALREADY_PROCESSING' THEN
        RAISE;
      END IF;
      v_error_seen := true;
  END;

  IF NOT v_error_seen THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_CANCEL_PENDING_MUST_FAIL';
  END IF;

  v_error_seen := false;
  BEGIN
    PERFORM *
    FROM public.schedule_own_account_deletion_v1();
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM IS DISTINCT FROM 'ACCOUNT_DELETE_ALREADY_PROCESSING' THEN
        RAISE;
      END IF;
      v_error_seen := true;
  END;

  IF NOT v_error_seen THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_SCHEDULE_PENDING_MUST_FAIL';
  END IF;

  v_error_seen := false;
  BEGIN
    UPDATE public.isletmeler AS business_row
    SET scheduled_deletion_at = NULL
    WHERE business_row.id =
      'b3000000-0000-4000-8000-000000000003';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM IS DISTINCT FROM 'ACCOUNT_DELETE_ALREADY_PROCESSING' THEN
        RAISE;
      END IF;
      v_error_seen := true;
  END;

  IF NOT v_error_seen THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_LEGACY_PENDING_UPDATE_MUST_FAIL';
  END IF;

  -- The trigger is deliberately narrow: a syntactic UPDATE that leaves the
  -- timestamp unchanged is harmless and must not be rejected.
  UPDATE public.isletmeler AS business_row
  SET scheduled_deletion_at = business_row.scheduled_deletion_at
  WHERE business_row.id =
    'b3000000-0000-4000-8000-000000000003';

  IF NOT EXISTS (
       SELECT 1
       FROM internal.account_deletion_jobs_v1 AS job_row
       WHERE job_row.user_id =
         'a3000000-0000-4000-8000-000000000003'
         AND job_row.state = 'pending'
         AND job_row.scheduled_deletion_at = v_before_due
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.isletmeler AS business_row
       WHERE business_row.id =
         'b3000000-0000-4000-8000-000000000003'
         AND business_row.scheduled_deletion_at = v_before_due
     )
  THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_PENDING_STATE_MUTATED_AFTER_REJECTION';
  END IF;
END;
$pending_boundaries$;

SELECT 'ACCOUNT_DELETION_CANCEL_RACE_POSTGRES_OK' AS result;

ROLLBACK;
