\set ON_ERROR_STOP on

-- LOCAL-ONLY integration contract for the historical income/expense lens.
-- The clean repository schema is missing the production-only kategoriler.parent_id
-- bootstrap column, so the disposable transaction supplies it and rolls it back.

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
    RAISE EXCEPTION 'INCOME_EXPENSE_LENS_LOCAL_DATABASE_REQUIRED';
  END IF;
  IF pg_catalog.to_regclass('public.ekonomik_gostergeler_gunluk') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.get_category_report_lens_v1(uuid,text[],timestamp with time zone,timestamp with time zone,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.get_income_expense_comparison_lens_v1(uuid,timestamp with time zone[],timestamp with time zone[],text)'
     ) IS NULL THEN
    RAISE EXCEPTION 'INCOME_EXPENSE_LENS_MIGRATION_MISSING';
  END IF;
END;
$preflight$;

ALTER TABLE public.kategoriler
  ADD COLUMN IF NOT EXISTS parent_id uuid;

CREATE FUNCTION pg_temp.assert_numeric_close(
  p_actual numeric,
  p_expected numeric,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_actual IS NULL OR pg_catalog.abs(p_actual - p_expected) > 0.000001 THEN
    RAISE EXCEPTION 'ASSERT_FAILED: % (actual=%, expected=%)',
      p_message, p_actual, p_expected;
  END IF;
END;
$function$;

CREATE FUNCTION pg_temp.report_total(p_payload jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(
    pg_catalog.sum((report_row.value->>'total_amount')::numeric),
    0
  )
  FROM pg_catalog.jsonb_array_elements(p_payload->'rows') AS report_row(value);
$function$;

SET LOCAL session_replication_role = replica;

INSERT INTO public.isletmeler (id, user_id, name)
VALUES (
  'c1000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'LOCAL INCOME EXPENSE LENS CONTRACT'
);

INSERT INTO public.kategoriler (
  id, isletme_id, name, type, icon, color, is_active, created_by
)
VALUES (
  'c3000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'Local Sales',
  'gelir',
  'circle',
  '#000000',
  true,
  'c2000000-0000-4000-8000-000000000001'
);

INSERT INTO public.hesaplar (
  id, isletme_id, name, type, balance, currency, is_active,
  is_archived, created_by
)
VALUES
(
  'c4000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'Local TRY',
  'nakit',
  0,
  'TRY',
  true,
  false,
  'c2000000-0000-4000-8000-000000000001'
),
(
  'c4000000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000001',
  'Local USD',
  'nakit',
  0,
  'USD',
  true,
  false,
  'c2000000-0000-4000-8000-000000000001'
),
(
  'c4000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000001',
  'Local XAG',
  'nakit',
  0,
  'XAG',
  true,
  false,
  'c2000000-0000-4000-8000-000000000001'
);

INSERT INTO public.ekonomik_gostergeler_gunluk (
  gun, usd_try, eur_try, gbp_try, gram_altin_try, gram_gumus_try
)
VALUES (CURRENT_DATE - 1, 40, 50, 45, 4000, 5);

INSERT INTO public.ekonomik_gostergeler (ay, tufe, source)
VALUES
(
  (pg_catalog.date_trunc('month', CURRENT_DATE::timestamp) - '1 month'::interval)::date,
  100,
  'local-contract'
),
(
  pg_catalog.date_trunc('month', CURRENT_DATE::timestamp)::date,
  200,
  'local-contract'
)
ON CONFLICT (ay) DO UPDATE
SET tufe = EXCLUDED.tufe,
    source = EXCLUDED.source;

INSERT INTO public.islemler (
  id, isletme_id, type, amount, description, date, hesap_id,
  kategori_id, created_by
)
VALUES
(
  'c5000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'gelir',
  4000,
  'TRY current-period sale',
  (CURRENT_DATE - 1)::timestamp,
  'c4000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001'
),
(
  'c5000000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000001',
  'gelir',
  100,
  'USD current-period sale',
  (CURRENT_DATE - 1)::timestamp,
  'c4000000-0000-4000-8000-000000000002',
  'c3000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001'
),
(
  'c5000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000001',
  'gelir',
  10,
  'XAG missing-rate sale',
  (CURRENT_DATE - 1)::timestamp,
  'c4000000-0000-4000-8000-000000000003',
  'c3000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001'
),
(
  'c5000000-0000-4000-8000-000000000004',
  'c1000000-0000-4000-8000-000000000001',
  'gelir',
  100,
  'Previous-month TRY sale',
  (pg_catalog.date_trunc('month', CURRENT_DATE::timestamp) - '1 day'::interval),
  'c4000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001'
),
(
  'c5000000-0000-4000-8000-000000000005',
  'c1000000-0000-4000-8000-000000000001',
  'gelir',
  4000,
  'Future-dated TRY sale',
  (CURRENT_DATE + 25)::timestamp,
  'c4000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001'
);

SET LOCAL session_replication_role = origin;

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', 'c2000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

DO $test$
DECLARE
  v_usd jsonb;
  v_eur jsonb;
  v_gold jsonb;
  v_real jsonb;
  v_future_usd jsonb;
  v_future_real jsonb;
  v_comparison jsonb;
BEGIN
  v_usd := public.get_category_report_lens_v1(
    'c1000000-0000-4000-8000-000000000001',
    ARRAY['gelir'],
    (CURRENT_DATE - 2)::timestamptz,
    CURRENT_DATE::timestamptz,
    'usd'
  );
  v_eur := public.get_category_report_lens_v1(
    'c1000000-0000-4000-8000-000000000001',
    ARRAY['gelir'],
    (CURRENT_DATE - 2)::timestamptz,
    CURRENT_DATE::timestamptz,
    'eur'
  );
  v_gold := public.get_category_report_lens_v1(
    'c1000000-0000-4000-8000-000000000001',
    ARRAY['gelir'],
    (CURRENT_DATE - 2)::timestamptz,
    CURRENT_DATE::timestamptz,
    'altin'
  );
  v_real := public.get_category_report_lens_v1(
    'c1000000-0000-4000-8000-000000000001',
    ARRAY['gelir'],
    (pg_catalog.date_trunc('month', CURRENT_DATE::timestamp) - '2 days'::interval)::timestamptz,
    CURRENT_DATE::timestamptz,
    'reel'
  );
  v_future_usd := public.get_category_report_lens_v1(
    'c1000000-0000-4000-8000-000000000001',
    ARRAY['gelir'],
    (CURRENT_DATE + 25)::timestamptz,
    (CURRENT_DATE + 26)::timestamptz,
    'usd'
  );
  v_future_real := public.get_category_report_lens_v1(
    'c1000000-0000-4000-8000-000000000001',
    ARRAY['gelir'],
    (CURRENT_DATE + 25)::timestamptz,
    (CURRENT_DATE + 26)::timestamptz,
    'reel'
  );
  v_comparison := public.get_income_expense_comparison_lens_v1(
    'c1000000-0000-4000-8000-000000000001',
    ARRAY[
      (CURRENT_DATE - 2)::timestamptz,
      (CURRENT_DATE + 25)::timestamptz
    ],
    ARRAY[
      CURRENT_DATE::timestamptz,
      (CURRENT_DATE + 26)::timestamptz
    ],
    'usd'
  );

  PERFORM pg_temp.assert_numeric_close(pg_temp.report_total(v_usd), 201.25, 'USD native and XAG conversion');
  PERFORM pg_temp.assert_numeric_close(pg_temp.report_total(v_eur), 161, 'EUR cross and XAG conversion');
  PERFORM pg_temp.assert_numeric_close(pg_temp.report_total(v_gold), 2.0125, 'gold-gram and XAG conversion');
  PERFORM pg_temp.assert_numeric_close(pg_temp.report_total(v_real), 8250, 'real CPI and XAG conversion');
  PERFORM pg_temp.assert_numeric_close(pg_temp.report_total(v_future_usd), 100, 'future USD uses latest reference');
  PERFORM pg_temp.assert_numeric_close(pg_temp.report_total(v_future_real), 4000, 'future real TRY uses current CPI');
  PERFORM pg_temp.assert_numeric_close(
    (v_comparison->'rows'->1->>'income')::numeric,
    100,
    'comparison batch future bucket'
  );

  IF (v_usd->>'conversion_incomplete')::boolean IS DISTINCT FROM false
     OR (v_usd->>'missing_rate_count')::integer IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'ASSERT_FAILED: historical XAG rate must complete conversion (%)', v_usd;
  END IF;
END;
$test$;

SELECT 'INCOME_EXPENSE_LENS_POSTGRES_OK' AS result;

ROLLBACK;
