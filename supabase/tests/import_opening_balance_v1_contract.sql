\set ON_ERROR_STOP on

-- LOCAL-ONLY contract for 20260803164629_import_opening_balance_v1.sql.
-- Run only against the disposable Supabase CLI database; everything rolls back.
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
    RAISE EXCEPTION 'IMPORT_OPENING_TEST_LOCAL_DATABASE_REQUIRED';
  END IF;

  IF pg_catalog.to_regprocedure(
       'public.apply_import_opening_balance_v1(uuid,text,uuid,numeric,boolean)'
     ) IS NULL THEN
    RAISE EXCEPTION 'IMPORT_OPENING_BALANCE_V1_MISSING';
  END IF;
END;
$preflight$;

CREATE FUNCTION pg_temp.assert_true(p_value boolean, p_message text)
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
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', p_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );
END;
$function$;

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
(
  'a3000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'opening.owner@example.test', '',
  pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
),
(
  'a3000000-0000-4000-8000-000000000002',
  'authenticated', 'authenticated', 'opening.other@example.test', '',
  pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
);

SET LOCAL session_replication_role = replica;

INSERT INTO public.isletmeler (id, user_id, name)
VALUES (
  'b3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'LOCAL IMPORT OPENING CONTRACT'
);

INSERT INTO public.hesaplar (
  id, isletme_id, name, type, balance, initial_balance, currency,
  is_active, is_archived, created_by
)
VALUES (
  'c3000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'Local Kasa', 'nakit', 0, 0, 'TRY', true, false,
  'a3000000-0000-4000-8000-000000000001'
);

INSERT INTO public.cariler (
  id, isletme_id, name, type, balance, currency,
  is_active, is_archived, created_by
)
VALUES (
  'd3000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'Local USD Supplier', 'tedarikci', 1, 'USD', true, false,
  'a3000000-0000-4000-8000-000000000001'
);

INSERT INTO public.personel (
  id, isletme_id, first_name, last_name, balance, currency,
  is_active, is_archived, created_by
)
VALUES (
  'e3000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'Local', 'Staff', 0, 'TRY', true, false,
  'a3000000-0000-4000-8000-000000000001'
);

-- Cari etkisi +1 USD: hesap kaynağı 30 TRY, cari hedefi 1 USD.
INSERT INTO public.islemler (
  id, isletme_id, type, amount, date, hesap_id, cari_id,
  source_currency, target_currency, exchange_rate, created_by
)
VALUES (
  'f3000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'cari_odeme', 30, '2026-08-03 12:00:00',
  'c3000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'TRY', 'USD', 30,
  'a3000000-0000-4000-8000-000000000001'
);

SET LOCAL session_replication_role = origin;
SELECT pg_temp.set_actor('a3000000-0000-4000-8000-000000000001');

DO $test$
DECLARE
  v_result jsonb;
  v_balance numeric;
  v_initial numeric;
BEGIN
  v_result := public.apply_import_opening_balance_v1(
    'b3000000-0000-4000-8000-000000000001', 'hesap',
    'c3000000-0000-4000-8000-000000000001', 50, false
  );
  SELECT balance, initial_balance INTO v_balance, v_initial
  FROM public.hesaplar
  WHERE id = 'c3000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.assert_true(
    v_result->>'changed' = 'true' AND v_balance = 50 AND v_initial = 50,
    'account opening balance must update balance and initial_balance'
  );

  v_result := public.apply_import_opening_balance_v1(
    'b3000000-0000-4000-8000-000000000001', 'hesap',
    'c3000000-0000-4000-8000-000000000001', 50, false
  );
  PERFORM pg_temp.assert_true(
    v_result->>'changed' = 'false',
    'same account payload retry must be idempotent'
  );

  v_result := public.apply_import_opening_balance_v1(
    'b3000000-0000-4000-8000-000000000001', 'hesap',
    'c3000000-0000-4000-8000-000000000001', 60, false
  );
  PERFORM pg_temp.assert_true(
    v_result->>'applied' = 'false',
    'automatic import must not overwrite a non-zero opening balance'
  );

  v_result := public.apply_import_opening_balance_v1(
    'b3000000-0000-4000-8000-000000000001', 'cari',
    'd3000000-0000-4000-8000-000000000001', 10, true
  );
  SELECT balance INTO v_balance FROM public.cariler
  WHERE id = 'd3000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.assert_true(
    (v_result->>'existing_initial_balance')::numeric = 0
      AND v_balance = 11,
    'cross-currency transaction effect must remain 1 USD above opening balance'
  );

  PERFORM public.apply_import_opening_balance_v1(
    'b3000000-0000-4000-8000-000000000001', 'cari',
    'd3000000-0000-4000-8000-000000000001', 20, true
  );
  SELECT balance INTO v_balance FROM public.cariler
  WHERE id = 'd3000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.assert_true(
    v_balance = 21,
    'manual replacement must apply only the opening-balance delta'
  );

  PERFORM public.apply_import_opening_balance_v1(
    'b3000000-0000-4000-8000-000000000001', 'personel',
    'e3000000-0000-4000-8000-000000000001', -25, true
  );
  SELECT balance INTO v_balance FROM public.personel
  WHERE id = 'e3000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.assert_true(v_balance = -25, 'personel opening balance sign');
END;
$test$;

SELECT pg_temp.set_actor('a3000000-0000-4000-8000-000000000002');
DO $unauthorized$
BEGIN
  BEGIN
    PERFORM public.apply_import_opening_balance_v1(
      'b3000000-0000-4000-8000-000000000001', 'hesap',
      'c3000000-0000-4000-8000-000000000001', 70, true
    );
    RAISE EXCEPTION 'ASSERT_FAILED: non-owner call unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$unauthorized$;

SELECT pg_temp.assert_true(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.apply_import_opening_balance_v1(uuid,text,uuid,numeric,boolean)',
    'EXECUTE'
  ),
  'authenticated execute grant'
);
SELECT pg_temp.assert_true(
  NOT pg_catalog.has_function_privilege(
    'anon',
    'public.apply_import_opening_balance_v1(uuid,text,uuid,numeric,boolean)',
    'EXECUTE'
  ),
  'anon execute must be revoked'
);

ROLLBACK;
