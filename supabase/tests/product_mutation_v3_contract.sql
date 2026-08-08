\set ON_ERROR_STOP on

-- LOCAL-ONLY PostgreSQL integration contract for
-- 20260730233552_product_mutation_v3_contract_compatibility.sql.
--
-- Run only against the disposable Supabase CLI database on 127.0.0.1:54322.
-- The whole sequential fixture is rolled back.

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
  v_date_type text;
BEGIN
  IF pg_catalog.current_database() IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'PRODUCT_V3_TEST_LOCAL_DATABASE_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations AS migration
    WHERE migration.version = '20260730233552'
  ) THEN
    RAISE EXCEPTION 'PRODUCT_V3_TEST_TARGET_MIGRATION_MISSING';
  END IF;

  IF pg_catalog.to_regprocedure(
       'internal.bridge_legacy_shared_product_unlinked_mutation_v1()'
     ) IS NULL THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_PRODUCT_BRIDGE_MIGRATION_MISSING';
  END IF;

  SELECT pg_catalog.format_type(attribute_row.atttypid, attribute_row.atttypmod)
  INTO v_date_type
  FROM pg_catalog.pg_attribute AS attribute_row
  WHERE attribute_row.attrelid = 'public.islemler'::pg_catalog.regclass
    AND attribute_row.attname = 'date'
    AND attribute_row.attnum > 0
    AND NOT attribute_row.attisdropped;

  -- Production's historical schema uses timestamp while a canonical clean
  -- replay starts from the original DATE column. The V3 contract supports
  -- both known shapes and must still fail closed for any other drift.
  IF v_date_type IS NULL
     OR v_date_type NOT IN ('date', 'timestamp without time zone') THEN
    RAISE EXCEPTION
      'PRODUCT_V3_TEST_BASELINE_MISMATCH: islemler.date=%',
      v_date_type;
  END IF;
END;
$preflight$;

-- Production's historical Data API grants are project bootstrap state rather
-- than repository migrations. Recreate only the privileges this behavioral
-- contract needs; the surrounding transaction rolls them back.
GRANT SELECT
ON TABLE public.isletmeler, public.isletme_users, public.urunler
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.urun_hareketler
TO authenticated;

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
    p_user_id::text,
    true
  );
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

CREATE FUNCTION pg_temp.has_legacy_product_delta_intent(
  p_actor_user_id uuid,
  p_isletme_id uuid,
  p_urun_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM internal.legacy_shared_product_delta_intents_v1 AS intent
    WHERE intent.actor_user_id = p_actor_user_id
      AND intent.isletme_id = p_isletme_id
      AND intent.urun_id = p_urun_id
  );
$function$;

CREATE FUNCTION pg_temp.tenant_digest(p_isletme_id uuid)
RETURNS text
LANGUAGE sql
AS $function$
  SELECT pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'islemler',
      COALESCE(
        (
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(transaction_row)
            ORDER BY transaction_row.id
          )
          FROM public.islemler AS transaction_row
          WHERE transaction_row.isletme_id = p_isletme_id
        ),
        '[]'::jsonb
      ),
      'urun_hareketler',
      COALESCE(
        (
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(movement_row)
            ORDER BY movement_row.id
          )
          FROM public.urun_hareketler AS movement_row
          WHERE movement_row.isletme_id = p_isletme_id
        ),
        '[]'::jsonb
      ),
      'urunler',
      COALESCE(
        (
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(product_row)
            ORDER BY product_row.id
          )
          FROM public.urunler AS product_row
          WHERE product_row.isletme_id = p_isletme_id
        ),
        '[]'::jsonb
      ),
      'cariler',
      COALESCE(
        (
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(customer_row)
            ORDER BY customer_row.id
          )
          FROM public.cariler AS customer_row
          WHERE customer_row.isletme_id = p_isletme_id
        ),
        '[]'::jsonb
      ),
      'hesaplar',
      COALESCE(
        (
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(account_row)
            ORDER BY account_row.id
          )
          FROM public.hesaplar AS account_row
          WHERE account_row.isletme_id = p_isletme_id
        ),
        '[]'::jsonb
      )
    )::text
  );
$function$;

CREATE FUNCTION pg_temp.expect_create_error(
  p_isletme_id uuid,
  p_new_row jsonb,
  p_items jsonb,
  p_expected_state text,
  p_expected_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_raised boolean := false;
  v_state text;
  v_message text;
BEGIN
  BEGIN
    PERFORM public.create_islem_with_urun_atomik(
      p_isletme_id,
      p_new_row,
      '[]'::jsonb,
      p_items
    );
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        v_state = RETURNED_SQLSTATE,
        v_message = MESSAGE_TEXT;
      IF v_state IS DISTINCT FROM p_expected_state
         OR (
           p_expected_message IS NOT NULL
           AND v_message IS DISTINCT FROM p_expected_message
         )
      THEN
        RAISE EXCEPTION
          'UNEXPECTED_CREATE_ERROR: state=% message=% expected_state=% expected_message=%',
          v_state,
          v_message,
          p_expected_state,
          p_expected_message;
      END IF;
      v_raised := true;
  END;

  IF v_raised IS NOT TRUE THEN
    RAISE EXCEPTION
      'EXPECTED_CREATE_ERROR_NOT_RAISED: state=% message=%',
      p_expected_state,
      p_expected_message;
  END IF;
END;
$function$;

CREATE FUNCTION pg_temp.expect_update_error(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_patch jsonb,
  p_items jsonb,
  p_expected_state text,
  p_expected_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_raised boolean := false;
  v_state text;
  v_message text;
BEGIN
  BEGIN
    PERFORM 1
    FROM public.update_cari_urunlu_islem_atomik_v3(
      p_isletme_id,
      p_islem_id,
      p_patch,
      p_items
    );
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        v_state = RETURNED_SQLSTATE,
        v_message = MESSAGE_TEXT;
      IF v_state IS DISTINCT FROM p_expected_state
         OR (
           p_expected_message IS NOT NULL
           AND v_message IS DISTINCT FROM p_expected_message
         )
      THEN
        RAISE EXCEPTION
          'UNEXPECTED_UPDATE_ERROR: state=% message=% expected_state=% expected_message=%',
          v_state,
          v_message,
          p_expected_state,
          p_expected_message;
      END IF;
      v_raised := true;
  END;

  IF v_raised IS NOT TRUE THEN
    RAISE EXCEPTION
      'EXPECTED_UPDATE_ERROR_NOT_RAISED: state=% message=%',
      p_expected_state,
      p_expected_message;
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
  'a1000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'owner.product.v3.local@example.test',
  '',
  pg_catalog.now(),
  '{}'::jsonb,
  '{"full_name":"Local Product V3 Owner"}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
),
(
  'a1000000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'shared.product.v3.local@example.test',
  '',
  pg_catalog.now(),
  '{}'::jsonb,
  '{"full_name":"Local Product V3 Shared"}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
);

-- Clean repo replay lacks the historical kategoriler.parent_id column used by
-- the default-category trigger. The product contract fixture does not need
-- default categories, so suppress only trigger side effects for this one row.
SET LOCAL session_replication_role = replica;
INSERT INTO public.isletmeler (id, user_id, name)
VALUES (
  'b1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'LOCAL PRODUCT V3 CONTRACT'
);
SET LOCAL session_replication_role = origin;

INSERT INTO public.isletme_users (
  id,
  isletme_id,
  user_id,
  role,
  permissions,
  status
)
VALUES (
  'b2000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'custom',
  '{
    "level":"add",
    "modules":{"cariler":true,"urunler":true},
    "visibility":{"can_see_all_users_data":true}
  }'::jsonb,
  'active'
);

INSERT INTO public.hesaplar (
  id,
  isletme_id,
  name,
  type,
  balance,
  currency,
  is_active,
  is_archived,
  created_by
)
VALUES (
  'b3000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'Local Kasa',
  'nakit',
  1000,
  'TRY',
  true,
  false,
  'a1000000-0000-4000-8000-000000000001'
);

INSERT INTO public.cariler (
  id,
  isletme_id,
  name,
  type,
  balance,
  currency,
  is_active,
  is_archived,
  created_by
)
VALUES
(
  'b4000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'Local Tedarikci 1',
  'tedarikci',
  0,
  'TRY',
  true,
  false,
  'a1000000-0000-4000-8000-000000000001'
),
(
  'b4000000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-000000000001',
  'Local Tedarikci 2',
  'tedarikci',
  0,
  'TRY',
  true,
  false,
  'a1000000-0000-4000-8000-000000000001'
);

INSERT INTO public.urunler (
  id,
  isletme_id,
  ad,
  birim,
  miktar,
  alis_fiyati,
  satis_fiyati,
  currency,
  is_active,
  is_archived,
  created_by
)
SELECT
  (
    'b5000000-0000-4000-8000-'
    || pg_catalog.lpad(product_number::text, 12, '0')
  )::uuid,
  'b1000000-0000-4000-8000-000000000001'::uuid,
  'Local Product ' || product_number,
  'adet',
  100,
  10,
  12,
  'TRY',
  true,
  false,
  'a1000000-0000-4000-8000-000000000001'::uuid
FROM pg_catalog.generate_series(1, 11) AS product_number;

-- 1) Exact same-UUID retry is a no-op, including reverse item order and
-- null-vs-zero canonicalization. Mismatched retry is 23505 with zero delta.
DO $test_exact_retry$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_row constant jsonb := pg_catalog.jsonb_build_object(
    'id', 'b6000000-0000-4000-8000-000000000001',
    'type', 'cari_alis',
    'amount', 30.25,
    'description', 'exact retry',
    'date', '2026-07-31T10:00:00',
    'cari_id', 'b4000000-0000-4000-8000-000000000001'
  );
  v_items jsonb := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'urun_id', 'b5000000-0000-4000-8000-000000000002',
      'hareket_tipi', 'giris',
      'miktar', 1,
      'birim_fiyat', 10,
      'kdv_orani', 20,
      'aciklama', 'B'
    ),
    pg_catalog.jsonb_build_object(
      'urun_id', 'b5000000-0000-4000-8000-000000000001',
      'hareket_tipi', 'giris',
      'miktar', 2,
      'birim_fiyat', NULL,
      'kdv_orani', NULL,
      'aciklama', 'A'
    )
  );
  v_retry_items jsonb := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'urun_id', 'b5000000-0000-4000-8000-000000000001',
      'hareket_tipi', 'giris',
      'miktar', 2,
      'birim_fiyat', 0,
      'kdv_orani', 0,
      'aciklama', 'A'
    ),
    pg_catalog.jsonb_build_object(
      'urun_id', 'b5000000-0000-4000-8000-000000000002',
      'hareket_tipi', 'giris',
      'miktar', 1,
      'birim_fiyat', 10,
      'kdv_orani', 20,
      'aciklama', 'B'
    )
  );
  v_digest text;
BEGIN
  PERFORM pg_temp.set_actor(
    'a1000000-0000-4000-8000-000000000001'
  );
  PERFORM public.create_islem_with_urun_atomik(
    v_business,
    v_row,
    '[]'::jsonb,
    v_items
  );

  PERFORM pg_temp.assert_true(
    (
      SELECT pg_catalog.count(*) = 2
      FROM public.urun_hareketler AS movement
      WHERE movement.islem_id =
        'b6000000-0000-4000-8000-000000000001'
    ),
    'exact retry fixture movement count'
  );
  PERFORM pg_temp.assert_true(
    (
      SELECT movement.birim_fiyat = 0
         AND movement.kdv_orani = 0
      FROM public.urun_hareketler AS movement
      WHERE movement.islem_id =
        'b6000000-0000-4000-8000-000000000001'
        AND movement.urun_id =
          'b5000000-0000-4000-8000-000000000001'
    ),
    'null price/VAT must normalize to zero inside V3'
  );
  PERFORM pg_temp.assert_true(
    (
      SELECT product.miktar = 102
      FROM public.urunler AS product
      WHERE product.id =
        'b5000000-0000-4000-8000-000000000001'
    )
    AND (
      SELECT product.miktar = 101
      FROM public.urunler AS product
      WHERE product.id =
        'b5000000-0000-4000-8000-000000000002'
    )
    AND (
      SELECT customer.balance = -30.25
      FROM public.cariler AS customer
      WHERE customer.id =
        'b4000000-0000-4000-8000-000000000001'
    ),
    'first create stock/balance deltas'
  );

  v_digest := pg_temp.tenant_digest(v_business);
  PERFORM public.create_islem_with_urun_atomik(
    v_business,
    v_row,
    '[]'::jsonb,
    v_retry_items
  );
  PERFORM pg_temp.assert_true(
    pg_temp.tenant_digest(v_business) = v_digest,
    'exact retry must be a full no-op'
  );

  PERFORM pg_temp.expect_create_error(
    v_business,
    v_row,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'urun_id', 'b5000000-0000-4000-8000-000000000001',
        'hareket_tipi', 'giris',
        'miktar', 2,
        'birim_fiyat', 0,
        'kdv_orani', 0,
        'aciklama', 'A'
      ),
      pg_catalog.jsonb_build_object(
        'urun_id', 'b5000000-0000-4000-8000-000000000002',
        'hareket_tipi', 'giris',
        'miktar', 2,
        'birim_fiyat', 10,
        'kdv_orani', 20,
        'aciklama', 'B'
      )
    ),
    '23505',
    'ISLEM_LEGACY_PRODUCT_IDEMPOTENCY_CONFLICT'
  );
  PERFORM pg_temp.assert_true(
    pg_temp.tenant_digest(v_business) = v_digest,
    'mismatched retry must roll back every delta'
  );

  PERFORM pg_temp.expect_create_error(
    v_business,
    v_row || pg_catalog.jsonb_build_object(
      'description', 'changed transaction payload'
    ),
    v_retry_items,
    '22023',
    'ISLEM_V2_IDEMPOTENCY_PAYLOAD_MISMATCH'
  );
  PERFORM pg_temp.assert_true(
    pg_temp.tenant_digest(v_business) = v_digest,
    'same-item changed-payload retry must roll back every delta'
  );
END;
$test_exact_retry$;

-- 2) An existing same-UUID itemless transaction cannot be upgraded through
-- the legacy product-create wrapper.
DO $test_itemless_conflict$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_row constant jsonb := pg_catalog.jsonb_build_object(
    'id', 'b6000000-0000-4000-8000-000000000002',
    'type', 'cari_alis',
    'amount', 5,
    'description', 'itemless conflict',
    'date', '2026-07-31T10:01:00',
    'cari_id', 'b4000000-0000-4000-8000-000000000001'
  );
  v_digest text;
BEGIN
  PERFORM public.create_islem_atomik(v_business, v_row, '[]'::jsonb);
  v_digest := pg_temp.tenant_digest(v_business);
  PERFORM pg_temp.expect_create_error(
    v_business,
    v_row,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'urun_id', 'b5000000-0000-4000-8000-000000000003',
        'hareket_tipi', 'giris',
        'miktar', 1,
        'birim_fiyat', 5,
        'kdv_orani', 0
      )
    ),
    '23505',
    'ISLEM_LEGACY_PRODUCT_IDEMPOTENCY_CONFLICT'
  );
  PERFORM pg_temp.assert_true(
    pg_temp.tenant_digest(v_business) = v_digest,
    'itemless same-UUID conflict must be a no-op'
  );
END;
$test_itemless_conflict$;

-- 3) Shared create-only actor: new create and exact retry succeed; changed retry
-- conflicts; view-only actor cannot reuse the exact retry path.
DO $test_shared_create$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_row constant jsonb := pg_catalog.jsonb_build_object(
    'id', 'b6000000-0000-4000-8000-000000000003',
    'type', 'cari_alis',
    'amount', 12,
    'description', 'shared create-only',
    'date', '2026-07-31T10:02:00',
    'cari_id', 'b4000000-0000-4000-8000-000000000001'
  );
  v_items constant jsonb := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'urun_id', 'b5000000-0000-4000-8000-000000000003',
      'hareket_tipi', 'giris',
      'miktar', 1,
      'birim_fiyat', 12,
      'kdv_orani', 0
    )
  );
  v_digest text;
BEGIN
  PERFORM pg_temp.set_actor(
    'a1000000-0000-4000-8000-000000000002'
  );
  PERFORM public.create_islem_with_urun_atomik(
    v_business, v_row, '[]'::jsonb, v_items
  );
  v_digest := pg_temp.tenant_digest(v_business);
  PERFORM public.create_islem_with_urun_atomik(
    v_business, v_row, '[]'::jsonb, v_items
  );
  PERFORM pg_temp.assert_true(
    pg_temp.tenant_digest(v_business) = v_digest,
    'shared exact retry must be a no-op'
  );

  PERFORM pg_temp.expect_create_error(
    v_business,
    v_row,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'urun_id', 'b5000000-0000-4000-8000-000000000003',
        'hareket_tipi', 'giris',
        'miktar', 2,
        'birim_fiyat', 6,
        'kdv_orani', 0
      )
    ),
    '23505',
    'ISLEM_LEGACY_PRODUCT_IDEMPOTENCY_CONFLICT'
  );

  UPDATE public.isletme_users AS member
  SET permissions =
    '{
      "level":"view",
      "modules":{"cariler":true,"urunler":true}
    }'::jsonb
  WHERE member.id = 'b2000000-0000-4000-8000-000000000001';

  PERFORM pg_temp.expect_create_error(
    v_business,
    v_row,
    v_items,
    '42501',
    NULL
  );
  PERFORM pg_temp.assert_true(
    pg_temp.tenant_digest(v_business) = v_digest,
    'view-only exact retry must not mutate state'
  );
END;
$test_shared_create$;

-- 4) Supported -> unsupported conversion clears stock/movements atomically;
-- unsupported -> unsupported is rejected; unsupported -> supported is allowed;
-- V3 delete restores the baseline.
DO $test_type_conversion_and_delete$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_transaction constant uuid :=
    'b6000000-0000-4000-8000-000000000004';
  v_digest text;
BEGIN
  PERFORM pg_temp.set_actor(
    'a1000000-0000-4000-8000-000000000001'
  );
  PERFORM public.create_islem_with_urun_atomik(
    v_business,
    pg_catalog.jsonb_build_object(
      'id', v_transaction,
      'type', 'cari_alis',
      'amount', 45,
      'description', 'type conversion',
      'date', '2026-07-31T10:03:00',
      'cari_id', 'b4000000-0000-4000-8000-000000000002'
    ),
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'urun_id', 'b5000000-0000-4000-8000-000000000004',
        'hareket_tipi', 'giris',
        'miktar', 3,
        'birim_fiyat', 15,
        'kdv_orani', 0
      )
    )
  );

  PERFORM 1
  FROM public.update_cari_urunlu_islem_atomik_v3(
    v_business,
    v_transaction,
    pg_catalog.jsonb_build_object(
      'type', 'cari_odeme',
      'hesap_id', 'b3000000-0000-4000-8000-000000000001'
    ),
    '[]'::jsonb
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.urun_hareketler AS movement
      WHERE movement.islem_id = v_transaction
    )
    AND (
      SELECT product.miktar = 100
      FROM public.urunler AS product
      WHERE product.id =
        'b5000000-0000-4000-8000-000000000004'
    )
    AND (
      SELECT customer.balance = 45
      FROM public.cariler AS customer
      WHERE customer.id =
        'b4000000-0000-4000-8000-000000000002'
    )
    AND (
      SELECT account.balance = 955
      FROM public.hesaplar AS account
      WHERE account.id =
        'b3000000-0000-4000-8000-000000000001'
    ),
    'supported -> unsupported conversion deltas'
  );

  v_digest := pg_temp.tenant_digest(v_business);
  PERFORM public.reapply_urun_hareketler_for_islem(
    v_business,
    v_transaction,
    '[]'::jsonb
  );
  PERFORM pg_temp.assert_true(
    pg_temp.tenant_digest(v_business) = v_digest,
    'legacy empty unsupported reapply must be a no-op'
  );

  BEGIN
    PERFORM public.reapply_urun_hareketler_for_islem(
      v_business,
      v_transaction,
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'urun_id', 'b5000000-0000-4000-8000-000000000004',
          'hareket_tipi', 'giris',
          'miktar', 1,
          'birim_fiyat', 1,
          'kdv_orani', 0
        )
      )
    );
    RAISE EXCEPTION 'EXPECTED_NONEMPTY_UNSUPPORTED_REAPPLY_ERROR';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM NOT LIKE '%CARI_PRODUCT_V3_INVALID_INPUT%' THEN
        RAISE;
      END IF;
  END;
  PERFORM pg_temp.assert_true(
    pg_temp.tenant_digest(v_business) = v_digest,
    'legacy non-empty unsupported reapply must fail closed'
  );

  PERFORM pg_temp.expect_update_error(
    v_business,
    v_transaction,
    pg_catalog.jsonb_build_object('type', 'cari_tahsilat'),
    '[]'::jsonb,
    '22023',
    'CARI_PRODUCT_V3_INVALID_INPUT'
  );

  PERFORM 1
  FROM public.update_cari_urunlu_islem_atomik_v3(
    v_business,
    v_transaction,
    pg_catalog.jsonb_build_object(
      'type', 'cari_alis',
      'hesap_id', NULL
    ),
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'urun_id', 'b5000000-0000-4000-8000-000000000004',
        'hareket_tipi', 'giris',
        'miktar', 3,
        'birim_fiyat', 15,
        'kdv_orani', 0
      )
    )
  );

  PERFORM pg_temp.assert_true(
    (
      SELECT product.miktar = 103
      FROM public.urunler AS product
      WHERE product.id =
        'b5000000-0000-4000-8000-000000000004'
    )
    AND (
      SELECT customer.balance = -45
      FROM public.cariler AS customer
      WHERE customer.id =
        'b4000000-0000-4000-8000-000000000002'
    )
    AND (
      SELECT account.balance = 1000
      FROM public.hesaplar AS account
      WHERE account.id =
        'b3000000-0000-4000-8000-000000000001'
    ),
    'unsupported -> supported conversion deltas'
  );

  PERFORM public.delete_cari_urunlu_islem_atomik_v3(
    v_business,
    v_transaction
  );
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1 FROM public.islemler WHERE id = v_transaction
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.urun_hareketler
      WHERE islem_id = v_transaction
    )
    AND (
      SELECT product.miktar = 100
      FROM public.urunler AS product
      WHERE product.id =
        'b5000000-0000-4000-8000-000000000004'
    )
    AND (
      SELECT customer.balance = 0
      FROM public.cariler AS customer
      WHERE customer.id =
        'b4000000-0000-4000-8000-000000000002'
    ),
    'V3 delete must reverse transaction and stock'
  );
END;
$test_type_conversion_and_delete$;

-- 5) Owner may retain an already-linked archived product; a shared editor may
-- not. A newly selected inactive product fails mid-loop with full rollback.
DO $test_archived_history$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_transaction constant uuid :=
    'b6000000-0000-4000-8000-000000000005';
  v_items constant jsonb := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'urun_id', 'b5000000-0000-4000-8000-000000000005',
      'hareket_tipi', 'giris',
      'miktar', 2,
      'birim_fiyat', 10,
      'kdv_orani', 0
    )
  );
  v_digest text;
BEGIN
  PERFORM public.create_islem_with_urun_atomik(
    v_business,
    pg_catalog.jsonb_build_object(
      'id', v_transaction,
      'type', 'cari_alis',
      'amount', 20,
      'description', 'archived history',
      'date', '2026-07-31T10:04:00',
      'cari_id', 'b4000000-0000-4000-8000-000000000002'
    ),
    '[]'::jsonb,
    v_items
  );

  UPDATE public.isletme_users AS member
  SET permissions =
    '{
      "level":"edit_all",
      "modules":{"cariler":true,"urunler":true}
    }'::jsonb
  WHERE member.id = 'b2000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.set_actor(
    'a1000000-0000-4000-8000-000000000002'
  );
  PERFORM 1
  FROM public.update_cari_urunlu_islem_atomik_v3(
    v_business,
    v_transaction,
    pg_catalog.jsonb_build_object(
      'description', 'shared active product edit'
    ),
    v_items
  );
  PERFORM pg_temp.assert_true(
    (
      SELECT transaction_row.description =
             'shared active product edit'
      FROM public.islemler AS transaction_row
      WHERE transaction_row.id = v_transaction
    )
    AND (
      SELECT pg_catalog.count(*) = 1
      FROM public.urun_hareketler AS movement
      WHERE movement.islem_id = v_transaction
    )
    AND (
      SELECT product.miktar = 102
      FROM public.urunler AS product
      WHERE product.id =
        'b5000000-0000-4000-8000-000000000005'
    ),
    'shared edit_all active-product update'
  );

  PERFORM pg_temp.set_actor(
    'a1000000-0000-4000-8000-000000000001'
  );
  UPDATE public.urunler AS product
  SET is_active = false,
      is_archived = true
  WHERE product.id = 'b5000000-0000-4000-8000-000000000005';

  PERFORM 1
  FROM public.update_cari_urunlu_islem_atomik_v3(
    v_business,
    v_transaction,
    pg_catalog.jsonb_build_object(
      'description', 'owner retained archived product'
    ),
    v_items
  );
  PERFORM pg_temp.assert_true(
    (
      SELECT product.miktar = 102
      FROM public.urunler AS product
      WHERE product.id =
        'b5000000-0000-4000-8000-000000000005'
    )
    AND (
      SELECT pg_catalog.count(*) = 1
      FROM public.urun_hareketler AS movement
      WHERE movement.islem_id = v_transaction
    ),
    'owner archived-history retention'
  );

  UPDATE public.isletme_users AS member
  SET permissions =
    '{
      "level":"edit_all",
      "modules":{"cariler":true,"urunler":true}
    }'::jsonb
  WHERE member.id = 'b2000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.set_actor(
    'a1000000-0000-4000-8000-000000000002'
  );
  v_digest := pg_temp.tenant_digest(v_business);
  PERFORM pg_temp.expect_update_error(
    v_business,
    v_transaction,
    pg_catalog.jsonb_build_object(
      'description', 'shared archived retry'
    ),
    v_items,
    '42501',
    'PRODUCT_MOVEMENT_PRODUCT_NOT_AUTHORIZED'
  );
  PERFORM pg_temp.assert_true(
    pg_temp.tenant_digest(v_business) = v_digest,
    'shared archived-history failure must fully roll back'
  );

  PERFORM pg_temp.set_actor(
    'a1000000-0000-4000-8000-000000000001'
  );
  UPDATE public.urunler AS product
  SET is_active = false,
      is_archived = true
  WHERE product.id = 'b5000000-0000-4000-8000-000000000006';

  v_digest := pg_temp.tenant_digest(v_business);
  PERFORM pg_temp.expect_update_error(
    v_business,
    v_transaction,
    pg_catalog.jsonb_build_object(
      'description', 'must roll back mid-loop'
    ),
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'urun_id', 'b5000000-0000-4000-8000-000000000001',
        'hareket_tipi', 'giris',
        'miktar', 1,
        'birim_fiyat', 10,
        'kdv_orani', 0
      ),
      pg_catalog.jsonb_build_object(
        'urun_id', 'b5000000-0000-4000-8000-000000000006',
        'hareket_tipi', 'giris',
        'miktar', 1,
        'birim_fiyat', 10,
        'kdv_orani', 0
      )
    ),
    '42501',
    NULL
  );
  PERFORM pg_temp.assert_true(
    pg_temp.tenant_digest(v_business) = v_digest,
    'new inactive product must roll back earlier loop writes'
  );

  PERFORM pg_temp.expect_create_error(
    v_business,
    pg_catalog.jsonb_build_object(
      'id', 'b6000000-0000-4000-8000-000000000006',
      'type', 'cari_alis',
      'amount', 20,
      'description', 'create rollback inactive item',
      'date', '2026-07-31T10:05:00',
      'cari_id', 'b4000000-0000-4000-8000-000000000002'
    ),
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'urun_id', 'b5000000-0000-4000-8000-000000000001',
        'hareket_tipi', 'giris',
        'miktar', 1,
        'birim_fiyat', 10,
        'kdv_orani', 0
      ),
      pg_catalog.jsonb_build_object(
        'urun_id', 'b5000000-0000-4000-8000-000000000006',
        'hareket_tipi', 'giris',
        'miktar', 1,
        'birim_fiyat', 10,
        'kdv_orani', 0
      )
    ),
    '42501',
    NULL
  );
  PERFORM pg_temp.assert_true(
    pg_temp.tenant_digest(v_business) = v_digest
    AND NOT EXISTS (
      SELECT 1
      FROM public.islemler
      WHERE id = 'b6000000-0000-4000-8000-000000000006'
    ),
    'inactive create must leave no transaction/stock/balance delta'
  );
END;
$test_archived_history$;

-- 6) Null compatibility is private to V3. A raw linked movement with null
-- price/VAT remains fail-closed.
DO $test_direct_null_strict$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_transaction constant uuid :=
    'b6000000-0000-4000-8000-000000000007';
  v_digest text;
  v_state text;
  v_message text;
  v_raised boolean := false;
BEGIN
  PERFORM public.create_islem_atomik(
    v_business,
    pg_catalog.jsonb_build_object(
      'id', v_transaction,
      'type', 'cari_alis',
      'amount', 5,
      'description', 'direct linked null strict',
      'date', '2026-07-31T10:06:00',
      'cari_id', 'b4000000-0000-4000-8000-000000000001'
    ),
    '[]'::jsonb
  );
  v_digest := pg_temp.tenant_digest(v_business);

  BEGIN
    INSERT INTO public.urun_hareketler (
      isletme_id,
      urun_id,
      hareket_tipi,
      miktar,
      birim_fiyat,
      kdv_orani,
      islem_id,
      created_by
    )
    VALUES (
      v_business,
      'b5000000-0000-4000-8000-000000000001',
      'giris',
      1,
      NULL,
      NULL,
      v_transaction,
      'a1000000-0000-4000-8000-000000000001'
    );
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        v_state = RETURNED_SQLSTATE,
        v_message = MESSAGE_TEXT;
      IF v_state IS DISTINCT FROM '22023'
         OR v_message IS DISTINCT FROM
            'PRODUCT_MOVEMENT_INVALID_LINKED_PAYLOAD'
      THEN
        RAISE;
      END IF;
      v_raised := true;
  END;

  PERFORM pg_temp.assert_true(
    v_raised
    AND pg_temp.tenant_digest(v_business) = v_digest,
    'direct linked null payload must fail with zero delta'
  );
  PERFORM public.delete_islem_atomik_v2(v_business, v_transaction);
END;
$test_direct_null_strict$;

-- 7) Four-decimal unit price survives create + V3 edit, while transaction
-- amount remains currency-rounded. Delete reverses the exact stock/balance.
DO $test_four_decimal_edit$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_transaction constant uuid :=
    'b6000000-0000-4000-8000-000000000008';
  v_items constant jsonb := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'urun_id', 'b5000000-0000-4000-8000-000000000007',
      'hareket_tipi', 'giris',
      'miktar', 3,
      'birim_fiyat', 45.3212,
      'kdv_orani', 0
    )
  );
  v_balance_before numeric;
BEGIN
  SELECT customer.balance
  INTO v_balance_before
  FROM public.cariler AS customer
  WHERE customer.id = 'b4000000-0000-4000-8000-000000000002';

  PERFORM public.create_islem_with_urun_atomik(
    v_business,
    pg_catalog.jsonb_build_object(
      'id', v_transaction,
      'type', 'cari_alis',
      'amount', 135.96,
      'description', 'four decimal create',
      'date', '2026-07-31T10:07:00',
      'cari_id', 'b4000000-0000-4000-8000-000000000002'
    ),
    '[]'::jsonb,
    v_items
  );
  PERFORM 1
  FROM public.update_cari_urunlu_islem_atomik_v3(
    v_business,
    v_transaction,
    pg_catalog.jsonb_build_object(
      'description', 'four decimal edit'
    ),
    v_items
  );
  PERFORM pg_temp.assert_true(
    (
      SELECT movement.birim_fiyat = 45.3212
      FROM public.urun_hareketler AS movement
      WHERE movement.islem_id = v_transaction
    )
    AND (
      SELECT product.miktar = 103
      FROM public.urunler AS product
      WHERE product.id =
        'b5000000-0000-4000-8000-000000000007'
    ),
    'four-decimal price create/edit'
  );

  PERFORM public.delete_cari_urunlu_islem_atomik_v3(
    v_business,
    v_transaction
  );
  PERFORM pg_temp.assert_true(
    (
      SELECT product.miktar = 100
      FROM public.urunler AS product
      WHERE product.id =
        'b5000000-0000-4000-8000-000000000007'
    )
    AND (
      SELECT customer.balance = v_balance_before
      FROM public.cariler AS customer
      WHERE customer.id =
        'b4000000-0000-4000-8000-000000000002'
    ),
    'four-decimal delete reversal'
  );
END;
$test_four_decimal_edit$;

-- 8) An unsupported transaction carrying an impossible legacy linked movement
-- is rejected before conversion and leaves the injected fixture unchanged.
DO $create_unsupported_fixture$
BEGIN
  PERFORM public.create_islem_atomik(
    'b1000000-0000-4000-8000-000000000001',
    pg_catalog.jsonb_build_object(
      'id', 'b6000000-0000-4000-8000-000000000009',
      'type', 'cari_odeme',
      'amount', 10,
      'description', 'unexpected legacy movement',
      'date', '2026-07-31T10:08:00',
      'cari_id', 'b4000000-0000-4000-8000-000000000002',
      'hesap_id', 'b3000000-0000-4000-8000-000000000001'
    ),
    '[]'::jsonb
  );
END;
$create_unsupported_fixture$;

SET LOCAL session_replication_role = replica;
INSERT INTO public.urun_hareketler (
  id,
  isletme_id,
  urun_id,
  hareket_tipi,
  miktar,
  birim_fiyat,
  onceki_miktar,
  yeni_miktar,
  kdv_orani,
  islem_id,
  created_by
)
VALUES (
  'b7000000-0000-4000-8000-000000000009',
  'b1000000-0000-4000-8000-000000000001',
  'b5000000-0000-4000-8000-000000000008',
  'giris',
  1,
  10,
  100,
  101,
  0,
  'b6000000-0000-4000-8000-000000000009',
  'a1000000-0000-4000-8000-000000000001'
);
SET LOCAL session_replication_role = origin;

DO $test_unexpected_legacy_movement$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_digest text := pg_temp.tenant_digest(v_business);
BEGIN
  PERFORM pg_temp.expect_update_error(
    v_business,
    'b6000000-0000-4000-8000-000000000009',
    pg_catalog.jsonb_build_object(
      'type', 'cari_alis',
      'hesap_id', NULL
    ),
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'urun_id', 'b5000000-0000-4000-8000-000000000008',
        'hareket_tipi', 'giris',
        'miktar', 1,
        'birim_fiyat', 10,
        'kdv_orani', 0
      )
    ),
    '22023',
    'CARI_PRODUCT_V3_INVALID_INPUT'
  );
  PERFORM pg_temp.assert_true(
    pg_temp.tenant_digest(v_business) = v_digest,
    'unexpected legacy movement conversion must fully roll back'
  );
END;
$test_unexpected_legacy_movement$;

-- 9) Released shared 1.5.x clients stage update_urun_miktar first and then
-- directly INSERT the linked movement. The bridge keeps stock unchanged after
-- request 1 and applies it exactly once inside request 2. Raw/no-intent inserts
-- still fail closed; the opposite legacy compensation cancels a staged intent;
-- canonical V3 create remains unaffected.
UPDATE public.isletme_users AS member
SET permissions =
  '{
    "level":"add",
    "modules":{"cariler":true,"urunler":true},
    "actions":{
      "cariler":{"can_create":true},
      "urunler":{"can_create":true}
    },
    "visibility":{"can_see_all_users_data":true}
  }'::jsonb
WHERE member.id = 'b2000000-0000-4000-8000-000000000001';

SELECT pg_temp.set_actor(
  'a1000000-0000-4000-8000-000000000002'
);
SET LOCAL ROLE authenticated;

DO $test_legacy_shared_bridge$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_projected numeric;
  v_state text;
  v_message text;
BEGIN
  PERFORM public.create_islem_atomik(
    v_business,
    pg_catalog.jsonb_build_object(
      'id', 'b6000000-0000-4000-8000-000000000010',
      'type', 'cari_satis',
      'amount', 20,
      'description', 'legacy shared linked create',
      'date', '2026-07-31T10:10:00',
      'cari_id', 'b4000000-0000-4000-8000-000000000002'
    ),
    '[]'::jsonb
  );

  v_projected := public.update_urun_miktar(
    'b5000000-0000-4000-8000-000000000010',
    -2,
    v_business
  );
  PERFORM pg_temp.assert_true(
    v_projected = 98,
    'shared legacy delta must stage without changing stock'
  );

  INSERT INTO public.urun_hareketler (
    id,
    isletme_id,
    urun_id,
    islem_id,
    hareket_tipi,
    miktar,
    birim_fiyat,
    kdv_orani,
    onceki_miktar,
    yeni_miktar,
    aciklama
  )
  VALUES (
    'b7000000-0000-4000-8000-000000000010',
    v_business,
    'b5000000-0000-4000-8000-000000000010',
    'b6000000-0000-4000-8000-000000000010',
    'cikis',
    2,
    10,
    0,
    100,
    98,
    'legacy shared bridge'
  );

  PERFORM public.create_islem_atomik(
    v_business,
    pg_catalog.jsonb_build_object(
      'id', 'b6000000-0000-4000-8000-000000000011',
      'type', 'cari_satis',
      'amount', 10,
      'description', 'legacy raw insert rejection',
      'date', '2026-07-31T10:11:00',
      'cari_id', 'b4000000-0000-4000-8000-000000000002'
    ),
    '[]'::jsonb
  );

  BEGIN
    INSERT INTO public.urun_hareketler (
      id,
      isletme_id,
      urun_id,
      islem_id,
      hareket_tipi,
      miktar,
      birim_fiyat,
      kdv_orani,
      onceki_miktar,
      yeni_miktar
    )
    VALUES (
      'b7000000-0000-4000-8000-000000000011',
      v_business,
      'b5000000-0000-4000-8000-000000000009',
      'b6000000-0000-4000-8000-000000000011',
      'cikis',
      1,
      10,
      0,
      100,
      99
    );
    RAISE EXCEPTION 'EXPECTED_RAW_LEGACY_INSERT_REJECTION';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        v_state = RETURNED_SQLSTATE,
        v_message = MESSAGE_TEXT;
      IF v_state IS DISTINCT FROM '42501'
         OR v_message IS DISTINCT FROM
            'PRODUCT_MOVEMENT_CANONICAL_RPC_REQUIRED' THEN
        RAISE EXCEPTION
          'UNEXPECTED_RAW_LEGACY_INSERT_ERROR: state=% message=%',
          v_state,
          v_message;
      END IF;
  END;

  PERFORM public.update_urun_miktar(
    'b5000000-0000-4000-8000-000000000008',
    3,
    v_business
  );
  PERFORM public.update_urun_miktar(
    'b5000000-0000-4000-8000-000000000008',
    -3,
    v_business
  );
  PERFORM public.create_islem_with_urun_atomik(
    v_business,
    pg_catalog.jsonb_build_object(
      'id', 'b6000000-0000-4000-8000-000000000012',
      'type', 'cari_alis',
      'amount', 5,
      'description', 'canonical create after legacy bridge',
      'date', '2026-07-31T10:12:00',
      'cari_id', 'b4000000-0000-4000-8000-000000000002'
    ),
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'urun_id', 'b5000000-0000-4000-8000-000000000009',
        'hareket_tipi', 'giris',
        'miktar', 1,
        'birim_fiyat', 5,
        'kdv_orani', 0
      )
    )
  );
END;
$test_legacy_shared_bridge$;

RESET ROLE;

DO $test_legacy_shared_bridge_results$
BEGIN
  PERFORM pg_temp.assert_true(
    (
      SELECT product.miktar = 98
      FROM public.urunler AS product
      WHERE product.id =
        'b5000000-0000-4000-8000-000000000010'
    )
    AND (
      SELECT pg_catalog.count(*) = 1
      FROM public.urun_hareketler AS movement
      WHERE movement.id =
        'b7000000-0000-4000-8000-000000000010'
    ),
    'shared legacy linked insert must atomically apply stock'
  );

  PERFORM pg_temp.assert_true(
    (
      SELECT product.miktar = 101
      FROM public.urunler AS product
      WHERE product.id =
        'b5000000-0000-4000-8000-000000000009'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.urun_hareketler AS movement
      WHERE movement.id =
        'b7000000-0000-4000-8000-000000000011'
    )
    AND (
      SELECT pg_catalog.count(*) = 1
      FROM public.urun_hareketler AS movement
      WHERE movement.islem_id =
        'b6000000-0000-4000-8000-000000000012'
    ),
    'raw insert must fail and canonical create must apply exactly once'
  );

  PERFORM pg_temp.assert_true(
    (
      SELECT product.miktar = 100
      FROM public.urunler AS product
      WHERE product.id =
        'b5000000-0000-4000-8000-000000000008'
    ),
    'opposite legacy compensation must cancel without changing stock'
  );
END;
$test_legacy_shared_bridge_results$;

-- 10) Released shared 1.5.6 manual movement CREATE/UPDATE/DELETE:
-- staging never changes stock; the row statement applies the exact delta once;
-- a zero-net edit needs no stock intent; raw replay fails closed.
UPDATE public.isletme_users AS member
SET permissions =
  '{
    "level":"edit_all",
    "modules":{"urunler":true},
    "actions":{
      "urunler":{
        "can_create":true,
        "can_update_own":true,
        "can_update_all":true,
        "can_delete_own":true,
        "can_delete_all":true
      }
    },
    "visibility":{"can_see_all_users_data":true}
  }'::jsonb
WHERE member.id = 'b2000000-0000-4000-8000-000000000001';

SELECT pg_temp.set_actor(
  'a1000000-0000-4000-8000-000000000002'
);
SET LOCAL ROLE authenticated;

DO $test_legacy_shared_manual_crud$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_product constant uuid :=
    'b5000000-0000-4000-8000-000000000008';
  v_movement uuid;
  v_projected numeric;
  v_state text;
  v_message text;
BEGIN
  v_projected := public.update_urun_miktar(
    v_product,
    4,
    v_business
  );
  PERFORM pg_temp.assert_true(
    v_projected = 104
    AND (
      SELECT product.miktar = 100
      FROM public.urunler AS product
      WHERE product.id = v_product
    ),
    'manual create delta must only stage'
  );

  INSERT INTO public.urun_hareketler (
    isletme_id,
    urun_id,
    hareket_tipi,
    miktar,
    birim_fiyat,
    kdv_orani,
    onceki_miktar,
    yeni_miktar,
    aciklama
  )
  VALUES (
    v_business,
    v_product,
    'giris',
    4,
    10.1234,
    0,
    100,
    104,
    'legacy shared manual create'
  )
  RETURNING id INTO v_movement;

  PERFORM pg_temp.assert_true(
    (
      SELECT product.miktar = 104
      FROM public.urunler AS product
      WHERE product.id = v_product
    )
    AND NOT pg_temp.has_legacy_product_delta_intent(
      auth.uid(), v_business, v_product
    ),
    'manual create must apply exactly once and consume intent'
  );

  BEGIN
    INSERT INTO public.urun_hareketler (
      id,
      isletme_id,
      urun_id,
      hareket_tipi,
      miktar,
      birim_fiyat,
      kdv_orani,
      onceki_miktar,
      yeni_miktar
    )
    VALUES (
      'b7000000-0000-4000-8000-000000000014',
      v_business,
      v_product,
      'giris',
      1,
      10,
      0,
      104,
      105
    );
    RAISE EXCEPTION 'EXPECTED_MANUAL_REPLAY_REJECTION';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        v_state = RETURNED_SQLSTATE,
        v_message = MESSAGE_TEXT;
      IF v_state IS DISTINCT FROM '42501'
         OR v_message IS DISTINCT FROM
            'LEGACY_UNLINKED_PRODUCT_INTENT_MISMATCH' THEN
        RAISE EXCEPTION
          'UNEXPECTED_MANUAL_REPLAY_ERROR: state=% message=%',
          v_state,
          v_message;
      END IF;
  END;

  v_projected := public.update_urun_miktar(
    v_product,
    -6,
    v_business
  );
  PERFORM pg_temp.assert_true(
    v_projected = 98
    AND (
      SELECT product.miktar = 104
      FROM public.urunler AS product
      WHERE product.id = v_product
    ),
    'manual update net delta must only stage'
  );

  UPDATE public.urun_hareketler AS movement
  SET hareket_tipi = 'cikis',
      miktar = 2,
      birim_fiyat = 11.4321,
      yeni_miktar = 98,
      aciklama = 'legacy shared manual update'
  WHERE movement.id = v_movement
    AND movement.isletme_id = v_business;

  PERFORM pg_temp.assert_true(
    (
      SELECT product.miktar = 98
      FROM public.urunler AS product
      WHERE product.id = v_product
    )
    AND (
      SELECT
        movement.hareket_tipi = 'cikis'
        AND movement.miktar = 2
        AND movement.onceki_miktar = 100
        AND movement.yeni_miktar = 98
      FROM public.urun_hareketler AS movement
      WHERE movement.id = v_movement
    ),
    'manual update must apply only net stock delta'
  );

  -- giris/cikis/duzeltme can change while the signed stock effect stays equal.
  -- The released client calls update_urun_miktar(0); no non-zero intent is
  -- required because this row transition cannot change stock.
  v_projected := public.update_urun_miktar(
    v_product,
    0,
    v_business
  );
  UPDATE public.urun_hareketler AS movement
  SET hareket_tipi = 'duzeltme',
      miktar = -2,
      yeni_miktar = 98
  WHERE movement.id = v_movement
    AND movement.isletme_id = v_business;

  PERFORM pg_temp.assert_true(
    v_projected = 98
    AND (
      SELECT product.miktar = 98
      FROM public.urunler AS product
      WHERE product.id = v_product
    )
    AND (
      SELECT movement.hareket_tipi = 'duzeltme'
        AND movement.miktar = -2
      FROM public.urun_hareketler AS movement
      WHERE movement.id = v_movement
    ),
    'zero-net manual update must not require or change stock'
  );

  v_projected := public.update_urun_miktar(
    v_product,
    2,
    v_business
  );
  DELETE FROM public.urun_hareketler AS movement
  WHERE movement.id = v_movement
    AND movement.isletme_id = v_business;

  PERFORM pg_temp.assert_true(
    v_projected = 100
    AND (
      SELECT product.miktar = 100
      FROM public.urunler AS product
      WHERE product.id = v_product
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.urun_hareketler AS movement
      WHERE movement.id = v_movement
    ),
    'manual delete must reverse stock exactly once'
  );
END;
$test_legacy_shared_manual_crud$;

-- Released JavaScript can serialize a mathematically three-decimal UPDATE
-- delta with binary float noise. The shared adapter rounds only its staged
-- delta; the exact OLD/NEW movement rows still define the authoritative stock
-- effect inside the final UPDATE transaction.
DO $test_legacy_shared_manual_float_delta$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_product constant uuid :=
    'b5000000-0000-4000-8000-000000000008';
  v_movement uuid;
  v_projected numeric;
BEGIN
  PERFORM public.update_urun_miktar(v_product, 0.1, v_business);
  INSERT INTO public.urun_hareketler (
    isletme_id,
    urun_id,
    hareket_tipi,
    miktar,
    onceki_miktar,
    yeni_miktar
  )
  VALUES (
    v_business,
    v_product,
    'giris',
    0.1,
    100,
    100.1
  )
  RETURNING id INTO v_movement;

  v_projected := public.update_urun_miktar(
    v_product,
    0.19999999999999998,
    v_business
  );
  UPDATE public.urun_hareketler AS movement
  SET miktar = 0.3,
      yeni_miktar = 100.3
  WHERE movement.id = v_movement
    AND movement.isletme_id = v_business;

  PERFORM pg_temp.assert_true(
    v_projected = 100.3
    AND (
      SELECT product.miktar = 100.3
      FROM public.urunler AS product
      WHERE product.id = v_product
    ),
    'legacy JavaScript float noise must normalize to three decimals'
  );

  PERFORM public.update_urun_miktar(v_product, -0.3, v_business);
  DELETE FROM public.urun_hareketler AS movement
  WHERE movement.id = v_movement
    AND movement.isletme_id = v_business;

  PERFORM pg_temp.assert_true(
    (
      SELECT product.miktar = 100
      FROM public.urunler AS product
      WHERE product.id = v_product
    ),
    'float-noise compatibility fixture must fully reverse'
  );
END;
$test_legacy_shared_manual_float_delta$;

-- A stale legacy intent must never be applied by a canonical V2 action. The
-- canonical exact context bypasses the legacy stock bridge for create/update/
-- delete, and AFTER success invalidates the stale intent.
DO $test_canonical_manual_contexts$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_product constant uuid :=
    'b5000000-0000-4000-8000-000000000008';
  v_created jsonb;
  v_movement uuid;
BEGIN
  PERFORM public.update_urun_miktar(v_product, 3, v_business);
  v_created := public.create_urun_hareket_atomik_v2(
    v_business,
    pg_catalog.jsonb_build_object(
      'urun_id', v_product,
      'hareket_tipi', 'giris',
      'miktar', 1,
      'birim_fiyat', 12.3456,
      'kdv_orani', 0,
      'aciklama', 'canonical create with stale legacy intent'
    )
  );
  v_movement := (v_created->>'id')::uuid;

  PERFORM pg_temp.assert_true(
    (
      SELECT product.miktar = 101
      FROM public.urunler AS product
      WHERE product.id = v_product
    )
    AND NOT pg_temp.has_legacy_product_delta_intent(
      auth.uid(), v_business, v_product
    ),
    'canonical create must ignore and consume stale legacy intent'
  );

  PERFORM public.update_urun_miktar(v_product, -3, v_business);
  PERFORM public.update_urun_hareket_atomik_v2(
    v_business,
    v_movement,
    pg_catalog.jsonb_build_object(
      'hareket_tipi', 'cikis',
      'miktar', 2,
      'birim_fiyat', 13.4567
    )
  );
  PERFORM pg_temp.assert_true(
    (
      SELECT product.miktar = 98
      FROM public.urunler AS product
      WHERE product.id = v_product
    ),
    'canonical update must not double-apply matching legacy intent'
  );

  PERFORM public.update_urun_miktar(v_product, 2, v_business);
  PERFORM public.delete_urun_hareket_atomik_v2(
    v_business,
    v_movement
  );
  PERFORM pg_temp.assert_true(
    (
      SELECT product.miktar = 100
      FROM public.urunler AS product
      WHERE product.id = v_product
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.urun_hareketler AS movement
      WHERE movement.id = v_movement
    )
    AND NOT pg_temp.has_legacy_product_delta_intent(
      auth.uid(), v_business, v_product
    ),
    'canonical delete must not double-apply matching legacy intent'
  );
END;
$test_canonical_manual_contexts$;

-- One staged intent cannot authorize two movement rows in one statement.
DO $test_manual_multi_row_reuse$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_product constant uuid :=
    'b5000000-0000-4000-8000-000000000008';
  v_first jsonb;
  v_second jsonb;
  v_first_id uuid;
  v_second_id uuid;
  v_raised boolean := false;
  v_state text;
  v_message text;
BEGIN
  v_first := public.create_urun_hareket_atomik_v2(
    v_business,
    pg_catalog.jsonb_build_object(
      'urun_id', v_product,
      'hareket_tipi', 'giris',
      'miktar', 1
    )
  );
  v_second := public.create_urun_hareket_atomik_v2(
    v_business,
    pg_catalog.jsonb_build_object(
      'urun_id', v_product,
      'hareket_tipi', 'giris',
      'miktar', 2
    )
  );
  v_first_id := (v_first->>'id')::uuid;
  v_second_id := (v_second->>'id')::uuid;

  PERFORM public.update_urun_miktar(v_product, 1, v_business);
  BEGIN
    UPDATE public.urun_hareketler AS movement
    SET miktar = movement.miktar + 1,
        yeni_miktar = 104
    WHERE movement.id IN (v_first_id, v_second_id)
      AND movement.isletme_id = v_business;
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        v_state = RETURNED_SQLSTATE,
        v_message = MESSAGE_TEXT;
      IF v_state IS DISTINCT FROM '42501'
         OR v_message IS DISTINCT FROM
            'LEGACY_UNLINKED_PRODUCT_INTENT_MISMATCH' THEN
        RAISE EXCEPTION
          'UNEXPECTED_MANUAL_MULTI_ROW_ERROR: state=% message=%',
          v_state,
          v_message;
      END IF;
      v_raised := true;
  END;

  PERFORM pg_temp.assert_true(
    v_raised
    AND (
      SELECT product.miktar = 103
      FROM public.urunler AS product
      WHERE product.id = v_product
    )
    AND (
      SELECT pg_catalog.array_agg(
        movement.miktar ORDER BY movement.miktar
      ) = ARRAY[1::numeric, 2::numeric]
      FROM public.urun_hareketler AS movement
      WHERE movement.id IN (v_first_id, v_second_id)
    ),
    'one legacy intent must not mutate multiple rows'
  );

  -- Released compensation cancels the intent left by the failed row statement.
  PERFORM public.update_urun_miktar(v_product, -1, v_business);
  PERFORM public.delete_urun_hareket_atomik_v2(
    v_business, v_first_id
  );
  PERFORM public.delete_urun_hareket_atomik_v2(
    v_business, v_second_id
  );
  PERFORM pg_temp.assert_true(
    (
      SELECT product.miktar = 100
      FROM public.urunler AS product
      WHERE product.id = v_product
    ),
    'multi-row rejection and cleanup must leave exact stock'
  );
END;
$test_manual_multi_row_reuse$;

RESET ROLE;

-- own/all is decided against the real movement creator, not the actor used
-- during harmless staging.
SELECT pg_temp.set_actor(
  'a1000000-0000-4000-8000-000000000001'
);
SET LOCAL ROLE authenticated;

DO $create_owner_manual_movement$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_product constant uuid :=
    'b5000000-0000-4000-8000-000000000008';
BEGIN
  PERFORM public.update_urun_miktar(v_product, 5, v_business);
  INSERT INTO public.urun_hareketler (
    id,
    isletme_id,
    urun_id,
    hareket_tipi,
    miktar,
    onceki_miktar,
    yeni_miktar,
    aciklama
  )
  VALUES (
    'b7000000-0000-4000-8000-000000000015',
    v_business,
    v_product,
    'giris',
    5,
    100,
    105,
    'owner-created manual movement'
  );
END;
$create_owner_manual_movement$;

RESET ROLE;

UPDATE public.isletme_users AS member
SET permissions =
  '{
    "level":"edit_own",
    "modules":{"urunler":true},
    "actions":{
      "urunler":{
        "can_create":false,
        "can_update_own":true,
        "can_update_all":false,
        "can_delete_own":true,
        "can_delete_all":false
      }
    },
    "visibility":{"can_see_all_users_data":true}
  }'::jsonb
WHERE member.id = 'b2000000-0000-4000-8000-000000000001';

SELECT pg_temp.set_actor(
  'a1000000-0000-4000-8000-000000000002'
);
SET LOCAL ROLE authenticated;

DO $test_manual_own_permission$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_product constant uuid :=
    'b5000000-0000-4000-8000-000000000008';
  v_movement constant uuid :=
    'b7000000-0000-4000-8000-000000000015';
  v_count integer;
BEGIN
  -- update-own is sufficient to stage, but cannot authorize an owner row.
  PERFORM public.update_urun_miktar(v_product, 1, v_business);
  UPDATE public.urun_hareketler AS movement
  SET miktar = 6,
      yeni_miktar = 106
  WHERE movement.id = v_movement
    AND movement.isletme_id = v_business;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM pg_temp.assert_true(
    v_count = 0
    AND (
      SELECT product.miktar = 105
      FROM public.urunler AS product
      WHERE product.id = v_product
    )
    AND (
      SELECT movement.miktar = 5
      FROM public.urun_hareketler AS movement
      WHERE movement.id = v_movement
    ),
    'update-own must not mutate a movement created by another user'
  );

  -- Released failure compensation removes the harmless pending intent.
  PERFORM public.update_urun_miktar(v_product, -1, v_business);
END;
$test_manual_own_permission$;

RESET ROLE;

UPDATE public.isletme_users AS member
SET permissions =
  '{
    "level":"edit_all",
    "modules":{"urunler":true},
    "actions":{
      "urunler":{
        "can_create":false,
        "can_update_own":true,
        "can_update_all":true,
        "can_delete_own":true,
        "can_delete_all":true
      }
    },
    "visibility":{"can_see_all_users_data":true}
  }'::jsonb
WHERE member.id = 'b2000000-0000-4000-8000-000000000001';

SELECT pg_temp.set_actor(
  'a1000000-0000-4000-8000-000000000002'
);
SET LOCAL ROLE authenticated;

DO $test_manual_all_permission$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_product constant uuid :=
    'b5000000-0000-4000-8000-000000000008';
  v_movement constant uuid :=
    'b7000000-0000-4000-8000-000000000015';
BEGIN
  PERFORM public.update_urun_miktar(v_product, 1, v_business);
  UPDATE public.urun_hareketler AS movement
  SET miktar = 6,
      yeni_miktar = 106
  WHERE movement.id = v_movement
    AND movement.isletme_id = v_business;

  PERFORM public.update_urun_miktar(v_product, -6, v_business);
  DELETE FROM public.urun_hareketler AS movement
  WHERE movement.id = v_movement
    AND movement.isletme_id = v_business;

  PERFORM pg_temp.assert_true(
    (
      SELECT product.miktar = 100
      FROM public.urunler AS product
      WHERE product.id = v_product
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.urun_hareketler AS movement
      WHERE movement.id = v_movement
    ),
    'update-all/delete-all must mutate another creator row exactly once'
  );
END;
$test_manual_all_permission$;

RESET ROLE;

-- Current-brand snapshots follow purchases chronologically. Converting a
-- linked purchase to a sale exposes the preceding purchase brand, while an
-- outgoing-only edit must not overwrite a manually selected current brand.
DO $test_product_brand_sync$
DECLARE
  v_business constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_product constant uuid :=
    'b5000000-0000-4000-8000-000000000011';
  v_transaction constant uuid :=
    'b6000000-0000-4000-8000-000000000020';
  v_direct_out jsonb;
  v_direct_out_id uuid;
BEGIN
  PERFORM pg_temp.set_actor(
    'a1000000-0000-4000-8000-000000000001'
  );

  PERFORM public.create_urun_hareket_atomik_v2(
    v_business,
    pg_catalog.jsonb_build_object(
      'urun_id', v_product,
      'hareket_tipi', 'giris',
      'miktar', 1,
      'birim_fiyat', 10,
      'marka', 'Marka A',
      'created_at', '2026-07-01T10:00:00Z'
    )
  );

  PERFORM public.create_islem_with_urun_atomik(
    v_business,
    pg_catalog.jsonb_build_object(
      'id', v_transaction,
      'type', 'cari_alis',
      'amount', 12,
      'description', 'brand sync contract',
      'date', '2026-07-02T10:00:00',
      'cari_id', 'b4000000-0000-4000-8000-000000000001'
    ),
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'urun_id', v_product,
        'hareket_tipi', 'giris',
        'miktar', 1,
        'birim_fiyat', 12,
        'kdv_orani', 0,
        'marka', 'Marka B'
      )
    )
  );

  PERFORM pg_temp.assert_true(
    (
      SELECT product.marka = 'Marka B'
      FROM public.urunler AS product
      WHERE product.id = v_product
    ),
    'latest linked purchase must become the current brand'
  );

  PERFORM 1
  FROM public.update_cari_urunlu_islem_atomik_v3(
    v_business,
    v_transaction,
    pg_catalog.jsonb_build_object('type', 'cari_satis'),
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'urun_id', v_product,
        'hareket_tipi', 'cikis',
        'miktar', 1,
        'birim_fiyat', 12,
        'kdv_orani', 0,
        'marka', 'Marka B'
      )
    )
  );

  PERFORM pg_temp.assert_true(
    (
      SELECT product.marka = 'Marka A'
      FROM public.urunler AS product
      WHERE product.id = v_product
    ),
    'purchase-to-sale conversion must expose the previous purchase brand'
  );

  UPDATE public.urunler AS product
  SET marka = 'Elle Secilen Marka'
  WHERE product.id = v_product;

  v_direct_out := public.create_urun_hareket_atomik_v2(
    v_business,
    pg_catalog.jsonb_build_object(
      'urun_id', v_product,
      'hareket_tipi', 'cikis',
      'miktar', 1,
      'birim_fiyat', 15,
      'marka', 'Satis Markasi',
      'created_at', '2026-07-03T10:00:00Z'
    )
  );
  v_direct_out_id := (v_direct_out->>'id')::uuid;

  PERFORM public.update_urun_hareket_atomik_v2(
    v_business,
    v_direct_out_id,
    pg_catalog.jsonb_build_object(
      'hareket_tipi', 'cikis',
      'miktar', 2,
      'birim_fiyat', 16,
      'marka', 'Guncel Satis Markasi'
    )
  );

  PERFORM pg_temp.assert_true(
    (
      SELECT product.marka = 'Elle Secilen Marka'
      FROM public.urunler AS product
      WHERE product.id = v_product
    )
    AND (
      SELECT movement.marka = 'Guncel Satis Markasi'
      FROM public.urun_hareketler AS movement
      WHERE movement.id = v_direct_out_id
    ),
    'outgoing-only edits must preserve current brand and update the snapshot'
  );
END;
$test_product_brand_sync$;

DO $final_assertions$
BEGIN
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM internal.permission_v2_movement_action_context
      WHERE isletme_id =
        'b1000000-0000-4000-8000-000000000001'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM internal.product_edit_v3_history_context
      WHERE isletme_id =
        'b1000000-0000-4000-8000-000000000001'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM internal.legacy_shared_product_delta_intents_v1
      WHERE isletme_id =
        'b1000000-0000-4000-8000-000000000001'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM internal.legacy_shared_product_insert_context_v1
      WHERE isletme_id =
        'b1000000-0000-4000-8000-000000000001'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM internal.legacy_shared_product_unlinked_mutation_context_v1
      WHERE isletme_id =
        'b1000000-0000-4000-8000-000000000001'
    ),
    'private mutation context rows must never leak'
  );
END;
$final_assertions$;

SELECT 'PRODUCT_MUTATION_V3_POSTGRES_OK' AS result;

ROLLBACK;
