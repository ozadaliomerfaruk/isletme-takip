\set ON_ERROR_STOP on

-- LOCAL-ONLY integration contract for product purchase price transitions.
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
    RAISE EXCEPTION 'PRODUCT_PRICE_CHANGE_LOCAL_DATABASE_REQUIRED';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.get_product_price_change_report_v1(uuid,timestamp with time zone,timestamp with time zone)'
  ) IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_PRICE_CHANGE_MIGRATION_MISSING';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.get_product_price_change_report_v2(uuid,timestamp with time zone,timestamp with time zone)'
  ) IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_PRICE_CHANGE_V2_MIGRATION_MISSING';
  END IF;
END;
$preflight$;

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

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
(
  'd1000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'price.owner@example.test', '',
  pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
),
(
  'd1000000-0000-4000-8000-000000000002',
  'authenticated', 'authenticated', 'price.other@example.test', '',
  pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
);

INSERT INTO public.isletmeler (id, user_id, name)
VALUES (
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'LOCAL PRICE CHANGE CONTRACT'
);

INSERT INTO public.hesaplar (
  id, isletme_id, name, type, balance, currency, is_active,
  is_archived, created_by
)
VALUES (
  'd3000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'Local TRY', 'nakit', 0, 'TRY', true, false,
  'd1000000-0000-4000-8000-000000000001'
);

INSERT INTO public.cariler (
  id, isletme_id, name, type, balance, currency, is_active,
  is_archived, created_by
)
VALUES
(
  'd4000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'Reference Supplier', 'tedarikci', 0, 'TRY', true, false,
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd4000000-0000-4000-8000-000000000002',
  'd2000000-0000-4000-8000-000000000001',
  'Current Supplier', 'tedarikci', 0, 'TRY', true, false,
  'd1000000-0000-4000-8000-000000000001'
);

INSERT INTO public.urunler (
  id, isletme_id, ad, birim, miktar, alis_fiyati, satis_fiyati,
  currency, is_active, is_archived, created_by
)
VALUES
(
  'd5000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'Changing Product', 'kg', 0, 0, 0, 'TRY', true, false,
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd5000000-0000-4000-8000-000000000002',
  'd2000000-0000-4000-8000-000000000001',
  'Passive Product', 'adet', 0, 0, 0, 'TRY', false, false,
  'd1000000-0000-4000-8000-000000000001'
);

INSERT INTO public.islemler (
  id, isletme_id, type, amount, description, date,
  hesap_id, cari_id, created_by
)
VALUES
(
  'd6000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'cari_alis', 500, 'baseline', '2026-06-30T10:00:00+03',
  'd3000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd6000000-0000-4000-8000-000000000002',
  'd2000000-0000-4000-8000-000000000001',
  'cari_alis', 1000, 'same price', '2026-07-01T10:00:00+03',
  'd3000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd6000000-0000-4000-8000-000000000003',
  'd2000000-0000-4000-8000-000000000001',
  'cari_alis', 2400, 'first increase', '2026-07-10T10:00:00+03',
  'd3000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd6000000-0000-4000-8000-000000000004',
  'd2000000-0000-4000-8000-000000000001',
  'cari_alis', 3900, 'second increase', '2026-07-20T10:00:00+03',
  'd3000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd6000000-0000-4000-8000-000000000005',
  'd2000000-0000-4000-8000-000000000001',
  'cari_alis_iade', 999, 'return must be ignored', '2026-07-22T10:00:00+03',
  'd3000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd6000000-0000-4000-8000-000000000006',
  'd2000000-0000-4000-8000-000000000001',
  'cari_alis', 100, 'passive product start', '2026-07-05T10:00:00+03',
  'd3000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd6000000-0000-4000-8000-000000000007',
  'd2000000-0000-4000-8000-000000000001',
  'cari_alis', 200, 'passive product increase', '2026-07-15T10:00:00+03',
  'd3000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd6000000-0000-4000-8000-000000000008',
  'd2000000-0000-4000-8000-000000000001',
  'cari_alis', 2700, 'price decrease', '2026-08-05T10:00:00+03',
  'd3000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001'
);

INSERT INTO public.urun_hareketler (
  id, isletme_id, urun_id, hareket_tipi, miktar, birim_fiyat,
  islem_id, created_by
)
VALUES
(
  'd7000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001', 'giris', 5, 100,
  'd6000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd7000000-0000-4000-8000-000000000002',
  'd2000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001', 'giris', 10, 100,
  'd6000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd7000000-0000-4000-8000-000000000003',
  'd2000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001', 'giris', 20, 120,
  'd6000000-0000-4000-8000-000000000003',
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd7000000-0000-4000-8000-000000000004',
  'd2000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001', 'giris', 30, 130,
  'd6000000-0000-4000-8000-000000000004',
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd7000000-0000-4000-8000-000000000005',
  'd2000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001', 'cikis', 1, 999,
  'd6000000-0000-4000-8000-000000000005',
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd7000000-0000-4000-8000-000000000006',
  'd2000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001', 'giris', 1, 500,
  NULL,
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd7000000-0000-4000-8000-000000000007',
  'd2000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002', 'giris', 1, 100,
  'd6000000-0000-4000-8000-000000000006',
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd7000000-0000-4000-8000-000000000008',
  'd2000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002', 'giris', 1, 200,
  'd6000000-0000-4000-8000-000000000007',
  'd1000000-0000-4000-8000-000000000001'
),
(
  'd7000000-0000-4000-8000-000000000009',
  'd2000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001', 'giris', 30, 90,
  'd6000000-0000-4000-8000-000000000008',
  'd1000000-0000-4000-8000-000000000001'
);

SET LOCAL session_replication_role = origin;

SELECT pg_temp.set_actor('d1000000-0000-4000-8000-000000000001');

DO $owner_contract$
DECLARE
  v_row record;
  v_count integer;
BEGIN
  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.get_product_price_change_report_v1(
    'd2000000-0000-4000-8000-000000000001',
    '2026-07-01T00:00:00+03',
    '2026-07-31T23:59:59+03'
  );

  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'ASSERT_FAILED: only active changed product must be returned (%)', v_count;
  END IF;

  SELECT *
  INTO v_row
  FROM public.get_product_price_change_report_v1(
    'd2000000-0000-4000-8000-000000000001',
    '2026-07-01T00:00:00+03',
    '2026-07-31T23:59:59+03'
  );

  PERFORM pg_temp.assert_numeric_close(v_row.referans_fiyat, 100, 'baseline price');
  PERFORM pg_temp.assert_numeric_close(v_row.guncel_fiyat, 130, 'current price');
  PERFORM pg_temp.assert_numeric_close(v_row.onceki_fiyat, 120, 'previous distinct price');
  PERFORM pg_temp.assert_numeric_close(v_row.son_degisim_tutari, 10, 'latest change amount');
  PERFORM pg_temp.assert_numeric_close(v_row.son_degisim_yuzdesi, 8.333333333333, 'latest change percent');
  PERFORM pg_temp.assert_numeric_close(v_row.donem_degisim_tutari, 30, 'period change amount');
  PERFORM pg_temp.assert_numeric_close(v_row.donem_degisim_yuzdesi, 30, 'period change percent');
  PERFORM pg_temp.assert_numeric_close(v_row.donem_toplam_miktar, 60, 'period quantity');
  PERFORM pg_temp.assert_numeric_close(v_row.zamli_alim_miktari, 50, 'higher-price quantity');
  PERFORM pg_temp.assert_numeric_close(v_row.tahmini_ek_maliyet, 1300, 'estimated extra cost');

  IF v_row.degisim_sayisi IS DISTINCT FROM 2
     OR v_row.zam_var IS DISTINCT FROM true
     OR v_row.indirim_var IS DISTINCT FROM false
     OR v_row.tedarikci_degisti IS DISTINCT FROM true
     OR v_row.son_tedarikci_adi IS DISTINCT FROM 'Current Supplier'
     OR pg_catalog.jsonb_array_length(v_row.fiyat_gecmisi) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'ASSERT_FAILED: transition metadata mismatch (%)', pg_catalog.row_to_json(v_row);
  END IF;

  IF v_row.fiyat_gecmisi->0->>'kind' IS DISTINCT FROM 'baseline'
     OR (v_row.fiyat_gecmisi->1->>'price')::numeric IS DISTINCT FROM 120
     OR (v_row.fiyat_gecmisi->2->>'price')::numeric IS DISTINCT FROM 130 THEN
    RAISE EXCEPTION 'ASSERT_FAILED: compact price history mismatch (%)', v_row.fiyat_gecmisi;
  END IF;
END;
$owner_contract$;

DO $owner_v2_discount_contract$
DECLARE
  v_row record;
BEGIN
  SELECT *
  INTO v_row
  FROM public.get_product_price_change_report_v2(
    'd2000000-0000-4000-8000-000000000001',
    '2026-08-01T00:00:00+03',
    '2026-08-31T23:59:59+03'
  );

  PERFORM pg_temp.assert_numeric_close(v_row.referans_fiyat, 130, 'v2 discount baseline');
  PERFORM pg_temp.assert_numeric_close(v_row.guncel_fiyat, 90, 'v2 discount current price');
  PERFORM pg_temp.assert_numeric_close(v_row.donem_degisim_tutari, -40, 'v2 discount amount');
  PERFORM pg_temp.assert_numeric_close(v_row.indirimli_alim_miktari, 30, 'v2 lower-price quantity');
  PERFORM pg_temp.assert_numeric_close(v_row.tahmini_tasarruf, 1200, 'v2 estimated savings');

  IF v_row.zam_var IS DISTINCT FROM false
     OR v_row.indirim_var IS DISTINCT FROM true
     OR v_row.tahmini_ek_maliyet IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'ASSERT_FAILED: v2 discount metadata mismatch (%)', pg_catalog.row_to_json(v_row);
  END IF;
END;
$owner_v2_discount_contract$;

SELECT pg_temp.set_actor('d1000000-0000-4000-8000-000000000002');

DO $unauthorized_contract$
DECLARE
  v_count integer;
BEGIN
  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.get_product_price_change_report_v1(
    'd2000000-0000-4000-8000-000000000001',
    '2026-07-01T00:00:00+03',
    '2026-07-31T23:59:59+03'
  );
  IF v_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'ASSERT_FAILED: non-member must receive no rows (%)', v_count;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.get_product_price_change_report_v2(
    'd2000000-0000-4000-8000-000000000001',
    '2026-08-01T00:00:00+03',
    '2026-08-31T23:59:59+03'
  );
  IF v_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'ASSERT_FAILED: non-member must receive no V2 rows (%)', v_count;
  END IF;
END;
$unauthorized_contract$;

DO $grant_contract$
DECLARE
  v_signature constant text :=
    'public.get_product_price_change_report_v1(uuid,timestamp with time zone,timestamp with time zone)';
  v_v2_signature constant text :=
    'public.get_product_price_change_report_v2(uuid,timestamp with time zone,timestamp with time zone)';
BEGIN
  IF pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', v_signature, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_v2_signature, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', v_v2_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT_FAILED: function grants are not fail-closed';
  END IF;
END;
$grant_contract$;

SELECT 'PRODUCT_PRICE_CHANGE_REPORT_V2_OK' AS result;

ROLLBACK;
