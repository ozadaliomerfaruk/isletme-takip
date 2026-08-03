\set ON_ERROR_STOP on

-- LOCAL-ONLY PostgreSQL integration contract for the durable account deletion
-- worker. Run only against the disposable Supabase CLI database on 54322.
-- Every fixture mutation, including Auth deletion, is rolled back.

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
BEGIN
  IF pg_catalog.current_database() IS DISTINCT FROM 'postgres'
     OR pg_catalog.to_regprocedure(
       'public.schedule_own_account_deletion_v1()'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.claim_due_account_deletion_requests_v1()'
     ) IS NULL
  THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_TEST_LOCAL_SCHEMA_REQUIRED';
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
VALUES
(
  '00000000-0000-0000-0000-000000000000',
  'a1000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'account-delete-owner@example.invalid',
  '',
  clock_timestamp() - interval '3 days',
  clock_timestamp() - interval '3 days',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  clock_timestamp() - interval '3 days',
  clock_timestamp() - interval '3 days'
),
(
  '00000000-0000-0000-0000-000000000000',
  'a2000000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'account-delete-shared@example.invalid',
  '',
  clock_timestamp() - interval '3 days',
  clock_timestamp() - interval '3 days',
  '{"provider":"apple","providers":["apple"]}'::jsonb,
  '{}'::jsonb,
  clock_timestamp() - interval '3 days',
  clock_timestamp() - interval '3 days'
);

-- The disposable CLI database can retain an obsolete default-category trigger
-- from an older snapshot. It references a column that no longer exists and is
-- unrelated to this worker contract, so bypass triggers for this one fixture
-- insert and restore normal trigger behavior immediately afterwards.
SET LOCAL session_replication_role = 'replica';

INSERT INTO public.isletmeler (
  id,
  user_id,
  name,
  created_at,
  updated_at
)
VALUES (
  'b1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'Preserved Shared Business',
  clock_timestamp() - interval '3 days',
  clock_timestamp() - interval '3 days'
);

SET LOCAL session_replication_role = 'origin';

INSERT INTO public.isletme_users (
  id,
  isletme_id,
  user_id,
  role,
  permissions,
  status,
  created_at,
  updated_at
)
VALUES (
  'c1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'custom',
  '{}'::jsonb,
  'active',
  clock_timestamp() - interval '3 days',
  clock_timestamp() - interval '3 days'
);

INSERT INTO public.notlar (
  id,
  isletme_id,
  entity_type,
  content,
  created_at,
  created_by,
  updated_at
)
VALUES (
  'd1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'genel',
  'Preserve this shared-business note',
  clock_timestamp() - interval '3 days',
  'a2000000-0000-4000-8000-000000000002',
  clock_timestamp() - interval '3 days'
);

INSERT INTO public.isletme_invites (
  id,
  isletme_id,
  invited_by,
  invite_code,
  role,
  permissions,
  expires_at,
  status,
  created_at,
  accepted_at,
  accepted_by
)
VALUES (
  'e1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'ZXCV12',
  'custom',
  '{}'::jsonb,
  clock_timestamp() + interval '3 days',
  'accepted',
  clock_timestamp() - interval '3 days',
  clock_timestamp() - interval '3 days',
  'a2000000-0000-4000-8000-000000000002'
);

DO $bucket_prerequisite$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets AS bucket
    WHERE bucket.id = 'islem-photos'
      AND bucket.name = 'islem-photos'
      AND bucket.public IS FALSE
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_DELETION_WORKER_PHOTO_BUCKET_PREREQUISITE';
  END IF;
END;
$bucket_prerequisite$;

INSERT INTO storage.objects (
  id,
  bucket_id,
  name,
  owner,
  owner_id,
  created_at,
  updated_at
)
VALUES (
  'f1000000-0000-4000-8000-000000000001',
  'islem-photos',
  'b1000000-0000-4000-8000-000000000001/notlar/d1000000-0000-4000-8000-000000000001_1234567890123.webp',
  'a2000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000002',
  clock_timestamp() - interval '3 days',
  clock_timestamp() - interval '3 days'
);

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

INSERT INTO public.push_tokens (
  id,
  user_id,
  token,
  platform,
  created_at,
  updated_at
)
VALUES (
  'f2000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000002',
  'ExponentPushToken[account-deletion-fixture]',
  'ios',
  clock_timestamp() - interval '3 days',
  clock_timestamp() - interval '3 days'
);

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT * FROM public.schedule_own_account_deletion_v1();

DO $scheduled_assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.account_deletion_jobs_v1 AS job_row
    WHERE job_row.user_id =
      'a2000000-0000-4000-8000-000000000002'
      AND job_row.isletme_id IS NULL
      AND job_row.state = 'scheduled'
  ) OR EXISTS (
    SELECT 1
    FROM public.isletmeler AS owned_business
    WHERE owned_business.user_id =
      'a2000000-0000-4000-8000-000000000002'
  ) OR EXISTS (
    SELECT 1
    FROM public.push_tokens AS token_row
    WHERE token_row.user_id =
      'a2000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'SHARED_ONLY_SCHEDULE_SCOPE_FAILED';
  END IF;
END;
$scheduled_assertions$;

SELECT public.cancel_own_account_deletion_v1();

DO $cancel_assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.account_deletion_jobs_v1 AS job_row
    WHERE job_row.user_id =
      'a2000000-0000-4000-8000-000000000002'
      AND job_row.state = 'cancelled'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.isletme_users AS membership_row
    WHERE membership_row.user_id =
      'a2000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'SHARED_ONLY_CANCEL_FAILED';
  END IF;
END;
$cancel_assertions$;

SELECT * FROM public.schedule_own_account_deletion_v1();

UPDATE internal.account_deletion_jobs_v1 AS job_row
SET scheduled_deletion_at = clock_timestamp() - interval '1 hour'
WHERE job_row.user_id = 'a2000000-0000-4000-8000-000000000002';

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

SELECT public.store_apple_revocation_credential_v1(
  'a2000000-0000-4000-8000-000000000002',
  'fixture-ciphertext-value',
  'fixture-iv-value'
);
SELECT public.mark_apple_revocation_attempt_v1(
  'a2000000-0000-4000-8000-000000000002',
  true,
  NULL
);
SELECT public.claim_due_account_deletion_requests_v1();

DO $claim_assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.account_deletion_jobs_v1 AS job_row
    WHERE job_row.user_id =
      'a2000000-0000-4000-8000-000000000002'
      AND job_row.state = 'pending'
  ) THEN
    RAISE EXCEPTION 'SHARED_ONLY_DUE_CLAIM_FAILED';
  END IF;
END;
$claim_assertions$;

SELECT *
FROM public.prepare_account_deletion_storage_v1(
  'a2000000-0000-4000-8000-000000000002'
);

DO $handoff_assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects AS object_row
    WHERE object_row.id = 'f1000000-0000-4000-8000-000000000001'
      AND object_row.owner =
        'a1000000-0000-4000-8000-000000000001'
      AND object_row.owner_id =
        'a1000000-0000-4000-8000-000000000001'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.notlar AS note_row
    WHERE note_row.id = 'd1000000-0000-4000-8000-000000000001'
      AND note_row.created_by IS NULL
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.isletme_invites AS invite_row
    WHERE invite_row.id = 'e1000000-0000-4000-8000-000000000001'
      AND invite_row.invited_by =
        'a1000000-0000-4000-8000-000000000001'
      AND invite_row.accepted_by IS NULL
  ) THEN
    RAISE EXCEPTION 'SHARED_BUSINESS_HANDOFF_FAILED';
  END IF;
END;
$handoff_assertions$;

DELETE FROM auth.users
WHERE id = 'a2000000-0000-4000-8000-000000000002';

SELECT *
FROM public.prepare_account_deletion_storage_v1(
  'a2000000-0000-4000-8000-000000000002'
);
SELECT public.complete_account_deletion_job_v1(
  'a2000000-0000-4000-8000-000000000002'
);

DO $final_assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.account_deletion_jobs_v1 AS job_row
    WHERE job_row.user_id =
      'a2000000-0000-4000-8000-000000000002'
      AND job_row.state = 'completed'
  ) OR EXISTS (
    SELECT 1
    FROM internal.apple_revocation_credentials_v1 AS credential_row
    WHERE credential_row.user_id =
      'a2000000-0000-4000-8000-000000000002'
  ) OR EXISTS (
    SELECT 1
    FROM public.isletme_users AS membership_row
    WHERE membership_row.user_id =
      'a2000000-0000-4000-8000-000000000002'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.isletmeler AS business_row
    WHERE business_row.id =
      'b1000000-0000-4000-8000-000000000001'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.notlar AS note_row
    WHERE note_row.id =
      'd1000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_POSTCONDITION_FAILED';
  END IF;
END;
$final_assertions$;

SELECT 'ACCOUNT_DELETION_POSTGRES_OK' AS result;

ROLLBACK;
