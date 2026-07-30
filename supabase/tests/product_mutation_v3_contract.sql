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

  SELECT pg_catalog.format_type(attribute_row.atttypid, attribute_row.atttypmod)
  INTO v_date_type
  FROM pg_catalog.pg_attribute AS attribute_row
  WHERE attribute_row.attrelid = 'public.islemler'::pg_catalog.regclass
    AND attribute_row.attname = 'date'
    AND attribute_row.attnum > 0
    AND NOT attribute_row.attisdropped;

  IF v_date_type IS DISTINCT FROM 'timestamp without time zone' THEN
    RAISE EXCEPTION
      'PRODUCT_V3_TEST_LIVE_BASELINE_MISMATCH: islemler.date=%',
      v_date_type;
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
FROM pg_catalog.generate_series(1, 10) AS product_number;

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
    ),
    'private mutation context rows must never leak'
  );
END;
$final_assertions$;

SELECT 'PRODUCT_MUTATION_V3_POSTGRES_OK' AS result;

ROLLBACK;
