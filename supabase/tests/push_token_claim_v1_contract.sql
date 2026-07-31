\set ON_ERROR_STOP on

-- LOCAL-ONLY PostgreSQL integration contract for
-- 20260731051109_claim_push_token_atomically.sql.
-- Run only against the disposable Supabase CLI database on 127.0.0.1:54322.
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
  IF pg_catalog.current_database() IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'PUSH_TOKEN_CLAIM_TEST_LOCAL_DATABASE_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations AS migration
    WHERE migration.version = '20260731051109'
  ) OR NOT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations AS migration
    WHERE migration.version = '20260731051119'
  ) OR pg_catalog.to_regprocedure(
    'public.claim_push_token_v1(text,text,text)'
  ) IS NULL OR pg_catalog.to_regprocedure(
    'public.get_unambiguous_push_tokens_v1(uuid[])'
  ) IS NULL THEN
    RAISE EXCEPTION 'PUSH_TOKEN_CLAIM_TEST_TARGET_MIGRATION_MISSING';
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

CREATE FUNCTION pg_temp.set_actor(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    COALESCE(p_user_id::text, ''),
    true
  );
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    CASE
      WHEN p_user_id IS NULL THEN '{}'::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'sub', p_user_id::text,
        'role', 'authenticated'
      )
    END::text,
    true
  );
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
  'a7100000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'push.claim.a.local@example.test',
  '',
  pg_catalog.now(),
  '{}'::jsonb,
  '{}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
),
(
  'a7100000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'push.claim.b.local@example.test',
  '',
  pg_catalog.now(),
  '{}'::jsonb,
  '{}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
),
(
  'a7100000-0000-4000-8000-000000000003',
  'authenticated',
  'authenticated',
  'push.claim.c.local@example.test',
  '',
  pg_catalog.now(),
  '{}'::jsonb,
  '{}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
);

-- Reproduce the historical stale-logout state: one installation token is
-- present on two different users because only user_id is unique.
SET LOCAL session_replication_role = replica;
INSERT INTO public.push_tokens (
  user_id,
  token,
  platform,
  locale
)
VALUES
(
  'a7100000-0000-4000-8000-000000000001',
  'ExpoPushToken[local-shared-installation]',
  'ios',
  'tr'
),
(
  'a7100000-0000-4000-8000-000000000002',
  'ExpoPushToken[local-shared-installation]',
  'android',
  'en'
);
SET LOCAL session_replication_role = origin;

-- Clean local replays do not inherit Dashboard-created Data API default
-- privileges. Production legacy clients already have these grants; add them
-- only inside this rolled-back fixture so the RLS/trigger path can be exercised.
GRANT SELECT, INSERT, UPDATE, DELETE
ON public.push_tokens
TO authenticated;

SELECT pg_temp.set_actor(
  'a7100000-0000-4000-8000-000000000002'
);
SET LOCAL ROLE authenticated;
SELECT public.claim_push_token_v1(
  'ExpoPushToken[local-shared-installation]',
  'ios',
  'tr'
);
RESET ROLE;

SELECT pg_temp.assert_true(
  (
    SELECT pg_catalog.count(*) = 1
    FROM public.push_tokens AS token_row
    WHERE token_row.token =
      'ExpoPushToken[local-shared-installation]'
  ),
  'claim must leave exactly one row for one installation token'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.push_tokens AS token_row
    WHERE token_row.user_id =
      'a7100000-0000-4000-8000-000000000002'
      AND token_row.token =
        'ExpoPushToken[local-shared-installation]'
      AND token_row.platform = 'ios'
      AND token_row.locale = 'tr'
  ),
  'claim must atomically move and refresh the token for auth.uid'
);

-- Old 1.5.x clients still upsert public.push_tokens directly. The trigger bridge
-- must give that path the same single-owner guarantee without a store rollout.
DELETE FROM public.push_tokens;
SET LOCAL session_replication_role = replica;
INSERT INTO public.push_tokens (
  user_id,
  token,
  platform,
  locale
)
VALUES (
  'a7100000-0000-4000-8000-000000000001',
  'ExpoPushToken[legacy-direct-upsert]',
  'ios',
  'tr'
);
SET LOCAL session_replication_role = origin;

SELECT pg_temp.set_actor(
  'a7100000-0000-4000-8000-000000000002'
);
SET LOCAL ROLE authenticated;
INSERT INTO public.push_tokens (
  user_id,
  token,
  platform,
  locale
)
VALUES (
  'a7100000-0000-4000-8000-000000000002',
  'ExpoPushToken[legacy-direct-upsert]',
  'android',
  'en'
)
ON CONFLICT (user_id) DO UPDATE
SET token = EXCLUDED.token,
    platform = EXCLUDED.platform,
    locale = EXCLUDED.locale,
    updated_at = pg_catalog.clock_timestamp();
RESET ROLE;

SELECT pg_temp.assert_true(
  (
    SELECT pg_catalog.count(*) = 1
    FROM public.push_tokens AS token_row
    WHERE token_row.token = 'ExpoPushToken[legacy-direct-upsert]'
      AND token_row.user_id =
        'a7100000-0000-4000-8000-000000000002'
  ),
  'legacy direct upsert must transfer the token to auth.uid'
);

-- Recipient workers must observe ownership against the complete table, not a
-- PostgREST-truncated client snapshot. Both owners of an ambiguous token are
-- omitted; an unrelated unique token remains available.
DELETE FROM public.push_tokens;
SET LOCAL session_replication_role = replica;
INSERT INTO public.push_tokens (user_id, token, platform, locale)
VALUES
(
  'a7100000-0000-4000-8000-000000000001',
  'ExpoPushToken[ambiguous-worker-token]',
  'ios',
  'tr'
),
(
  'a7100000-0000-4000-8000-000000000002',
  'ExpoPushToken[ambiguous-worker-token]',
  'android',
  'en'
),
(
  'a7100000-0000-4000-8000-000000000003',
  'ExpoPushToken[unique-worker-token]',
  'ios',
  'tr'
);
SET LOCAL session_replication_role = origin;

GRANT SELECT ON public.push_tokens TO service_role;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(
  (
    SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(
        token = 'ExpoPushToken[unique-worker-token]'
      )
      AND pg_catalog.bool_and(
        user_id =
          'a7100000-0000-4000-8000-000000000003'::uuid
      )
    FROM public.get_unambiguous_push_tokens_v1(
      ARRAY[
        'a7100000-0000-4000-8000-000000000001'::uuid,
        'a7100000-0000-4000-8000-000000000002'::uuid,
        'a7100000-0000-4000-8000-000000000003'::uuid
      ]
    )
  ),
  'worker recipient RPC must omit every owner of an ambiguous token'
);
RESET ROLE;

-- Scheduling account deletion removes the token in the scheduling
-- transaction. Neither the new RPC nor an old 1.5.x direct upsert may recreate
-- it while the request remains scheduled/pending.
DELETE FROM public.push_tokens;
INSERT INTO internal.account_deletion_jobs_v1 (
  user_id,
  business_name,
  scheduled_deletion_at,
  state
)
VALUES (
  'a7100000-0000-4000-8000-000000000002',
  'Push deletion fixture',
  pg_catalog.clock_timestamp() + interval '7 days',
  'scheduled'
);

SELECT pg_temp.set_actor(
  'a7100000-0000-4000-8000-000000000002'
);
SET LOCAL ROLE authenticated;
DO $pending_claim$
DECLARE
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.claim_push_token_v1(
      'ExpoPushToken[pending-delete-rpc]',
      'ios',
      'tr'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_raised := true;
  END;
  IF v_raised IS NOT TRUE THEN
    RAISE EXCEPTION
      'ASSERT_FAILED: pending deletion RPC claim must fail closed';
  END IF;
END;
$pending_claim$;

DO $pending_legacy$
DECLARE
  v_raised boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.push_tokens (
      user_id,
      token,
      platform,
      locale
    )
    VALUES (
      'a7100000-0000-4000-8000-000000000002',
      'ExpoPushToken[pending-delete-legacy]',
      'ios',
      'tr'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_raised := true;
  END;
  IF v_raised IS NOT TRUE THEN
    RAISE EXCEPTION
      'ASSERT_FAILED: pending deletion legacy upsert must fail closed';
  END IF;
END;
$pending_legacy$;
RESET ROLE;

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.push_tokens AS token_row
    WHERE token_row.user_id =
      'a7100000-0000-4000-8000-000000000002'
  ),
  'pending deletion must not regain a push token'
);

SELECT pg_temp.assert_true(
  NOT pg_catalog.has_function_privilege(
    'anon',
    'public.claim_push_token_v1(text,text,text)',
    'EXECUTE'
  ) AND pg_catalog.has_function_privilege(
    'authenticated',
    'public.claim_push_token_v1(text,text,text)',
    'EXECUTE'
  ),
  'only authenticated clients may execute the public claim RPC'
);

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
  'only service-role workers may execute the safe-recipient RPC'
);

DO $unauthenticated$
DECLARE
  v_raised boolean := false;
BEGIN
  PERFORM pg_temp.set_actor(NULL);
  BEGIN
    PERFORM public.claim_push_token_v1(
      'ExpoPushToken[local-unauthenticated]',
      'ios',
      'tr'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_raised := true;
  END;

  IF v_raised IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERT_FAILED: unauthenticated claim must fail closed';
  END IF;
END;
$unauthenticated$;

ROLLBACK;
