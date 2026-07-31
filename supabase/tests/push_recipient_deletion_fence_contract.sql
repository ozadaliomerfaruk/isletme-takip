\set ON_ERROR_STOP on

-- LOCAL-ONLY PostgreSQL integration contract for the push-recipient
-- account-deletion fence. Run only against 127.0.0.1:54322.
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
       'public.get_unambiguous_push_tokens_v1(uuid[])'
     ) IS NULL
  THEN
    RAISE EXCEPTION
      'PUSH_RECIPIENT_DELETION_FENCE_LOCAL_TARGET_REQUIRED';
  END IF;
END;
$preflight$;

CREATE FUNCTION pg_temp.assert_true(
  p_value boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_value IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ASSERT_FAILED: %', p_message;
  END IF;
END;
$function$;

INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
(
  'a8500000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'push.legacy-delete.local@example.test',
  '',
  pg_catalog.now(),
  '{}'::jsonb,
  '{}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
),
(
  'a8500000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'push.job-delete.local@example.test',
  '',
  pg_catalog.now(),
  '{}'::jsonb,
  '{}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
),
(
  'a8500000-0000-4000-8000-000000000003',
  'authenticated',
  'authenticated',
  'push.safe.local@example.test',
  '',
  pg_catalog.now(),
  '{}'::jsonb,
  '{}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
);

-- Reproduce an old 1.5.x direct timestamp write and an internal-only durable
-- job independently. Replica mode is local-fixture setup only; the transaction
-- is rolled back.
SET LOCAL session_replication_role = replica;
INSERT INTO public.isletmeler (
  id,
  user_id,
  name,
  scheduled_deletion_at
)
VALUES (
  'b8500000-0000-4000-8000-000000000001',
  'a8500000-0000-4000-8000-000000000001',
  'Legacy deletion recipient fixture',
  pg_catalog.clock_timestamp() + interval '7 days'
);

INSERT INTO internal.account_deletion_jobs_v1 (
  user_id,
  business_name,
  scheduled_deletion_at,
  state
)
VALUES (
  'a8500000-0000-4000-8000-000000000002',
  'Durable deletion recipient fixture',
  pg_catalog.clock_timestamp() + interval '7 days',
  'scheduled'
);

INSERT INTO public.push_tokens (
  user_id,
  token,
  platform,
  locale
)
VALUES
(
  'a8500000-0000-4000-8000-000000000001',
  'ExpoPushToken[legacy-delete-recipient]',
  'ios',
  'tr'
),
(
  'a8500000-0000-4000-8000-000000000002',
  'ExpoPushToken[job-delete-recipient]',
  'android',
  'en'
),
(
  'a8500000-0000-4000-8000-000000000003',
  'ExpoPushToken[safe-recipient]',
  'ios',
  'tr'
);
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(
  (
    SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(
        user_id =
          'a8500000-0000-4000-8000-000000000003'::uuid
      )
      AND pg_catalog.bool_and(
        token = 'ExpoPushToken[safe-recipient]'
      )
    FROM public.get_unambiguous_push_tokens_v1(
      ARRAY[
        'a8500000-0000-4000-8000-000000000001'::uuid,
        'a8500000-0000-4000-8000-000000000002'::uuid,
        'a8500000-0000-4000-8000-000000000003'::uuid
      ]
    )
  ),
  'workers must omit legacy and durable account-deletion recipients'
);
RESET ROLE;

SELECT pg_temp.assert_true(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.get_unambiguous_push_tokens_v1(uuid[])',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.get_unambiguous_push_tokens_v1(uuid[])',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'anon',
    'public.get_unambiguous_push_tokens_v1(uuid[])',
    'EXECUTE'
  ),
  'only service-role workers may execute the recipient function'
);

ROLLBACK;
