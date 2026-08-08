-- Optional product brand and immutable purchase-line brand snapshots.
--
-- Data safety:
--   * additive nullable columns only; no existing row is rewritten/backfilled;
--   * all public RPC signatures and result columns stay unchanged;
--   * price-history JSON only gains optional brandName points/metadata;
--   * released clients may keep omitting `marka`; the private V3 engine then
--     snapshots the product's current default brand, or NULL when none exists.
--
-- Released 1.5.x clients:
--   Their payloads, reads, and saves continue to work unchanged. Existing
--   products and movements remain byte-for-byte untouched. New nullable fields
--   are ignored by old clients, while old product writes remain valid.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';

DO $precondition$
BEGIN
  IF pg_catalog.to_regclass('public.urunler') IS NULL
     OR pg_catalog.to_regclass('public.urun_hareketler') IS NULL
     OR pg_catalog.to_regprocedure(
          'internal.reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)'
        ) IS NULL
     OR pg_catalog.to_regprocedure(
          'public.get_product_price_change_report_v1(uuid,timestamp with time zone,timestamp with time zone)'
        ) IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_SNAPSHOT_SCHEMA_PRECONDITION_FAILED';
  END IF;
END;
$precondition$;

ALTER TABLE public.urunler
  ADD COLUMN IF NOT EXISTS marka text;

ALTER TABLE public.urun_hareketler
  ADD COLUMN IF NOT EXISTS marka text;

COMMENT ON COLUMN public.urunler.marka IS
  'Optional current/default product brand used to prefill new transaction rows.';

COMMENT ON COLUMN public.urun_hareketler.marka IS
  'Optional brand snapshot captured for this exact stock movement.';

-- Keep the proven V3 authorization/history engine intact and extend only its
-- strict JSON boundary plus the movement INSERT. Drift checks fail closed.
DO $patch_product_engine$
DECLARE
  v_def text;
  v_before text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'internal.reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)'::regprocedure
  )
  INTO v_def;

  -- Windows'ta daha eski CLI surumleri fonksiyon govdesini CRLF ile saklamis
  -- olabilir. Esleme kaliplarini platformdan bagimsiz tut.
  v_def := pg_catalog.replace(v_def, E'\r\n', E'\n');

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  v_aciklama text;
  v_expected_movement text;$old$,
    $new$  v_aciklama text;
  v_marka text;
  v_default_marka text;
  v_expected_movement text;$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_V3_DECLARATION_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$           'kdv_orani',
           'aciklama'$old$,
    $new$           'kdv_orani',
           'marka',
           'aciklama'$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_V3_ALLOWLIST_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$       OR (
         v_item ? 'aciklama'
         AND pg_catalog.jsonb_typeof(v_item->'aciklama')
             NOT IN ('string', 'null')
       )
       OR v_item->>'hareket_tipi' IS DISTINCT FROM v_expected_movement THEN$old$,
    $new$       OR (
         v_item ? 'aciklama'
         AND pg_catalog.jsonb_typeof(v_item->'aciklama')
             NOT IN ('string', 'null')
       )
       OR (
         v_item ? 'marka'
         AND pg_catalog.jsonb_typeof(v_item->'marka')
             NOT IN ('string', 'null')
       )
       OR (
         v_item ? 'marka'
         AND pg_catalog.char_length(
           pg_catalog.btrim(COALESCE(v_item->>'marka', ''))
         ) > 120
       )
       OR v_item->>'hareket_tipi' IS DISTINCT FROM v_expected_movement THEN$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_V3_VALIDATION_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$    SELECT product.miktar
    INTO v_before
    FROM public.urunler AS product$old$,
    $new$    SELECT
      product.miktar,
      NULLIF(pg_catalog.btrim(product.marka), '')
    INTO
      v_before,
      v_default_marka
    FROM public.urunler AS product$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_V3_DEFAULT_LOOKUP_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$    IF NOT FOUND THEN
      RAISE EXCEPTION 'CARI_PRODUCT_V3_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;

    v_after := COALESCE(v_before, 0) + CASE v_expected_movement$old$,
    $new$    IF NOT FOUND THEN
      RAISE EXCEPTION 'CARI_PRODUCT_V3_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;

    v_marka := CASE
      WHEN v_item ? 'marka'
        THEN NULLIF(pg_catalog.btrim(v_item->>'marka'), '')
      ELSE v_default_marka
    END;

    v_after := COALESCE(v_before, 0) + CASE v_expected_movement$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_V3_SNAPSHOT_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$      kdv_orani,
      onceki_miktar,$old$,
    $new$      kdv_orani,
      marka,
      onceki_miktar,$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_V3_INSERT_COLUMN_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$      v_kdv,
      v_before,$old$,
    $new$      v_kdv,
      v_marka,
      v_before,$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_V3_INSERT_VALUE_DRIFT';
  END IF;

  EXECUTE v_def;
END;
$patch_product_engine$;

ALTER FUNCTION internal.reapply_cari_urun_items_v3(
  uuid, uuid, jsonb, text, text
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.reapply_cari_urun_items_v3(
  uuid, uuid, jsonb, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

-- Enrich the existing price-history JSON without changing the RPC's OUT
-- columns. Brand-only transitions are retained as context, but they do not
-- increase the price-change count and cannot make a product enter the report.
DO $patch_price_report$
DECLARE
  v_def text;
  v_before text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.get_product_price_change_report_v1(uuid,timestamp with time zone,timestamp with time zone)'::regprocedure
  )
  INTO v_def;

  v_def := pg_catalog.replace(v_def, E'\r\n', E'\n');

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$      pg_catalog.abs(movement.miktar)::numeric AS quantity,
      supplier.id AS supplier_id,$old$,
    $new$      pg_catalog.abs(movement.miktar)::numeric AS quantity,
      NULLIF(pg_catalog.btrim(movement.marka), '')::text AS brand_name,
      supplier.id AS supplier_id,$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_REPORT_SOURCE_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$      ) AS previous_price,
      pg_catalog.first_value(timeline_row.unit_price) OVER ($old$,
    $new$      ) AS previous_price,
      pg_catalog.lag(timeline_row.brand_name) OVER (
        PARTITION BY timeline_row.product_id, timeline_row.price_currency
        ORDER BY
          timeline_row.transaction_date,
          timeline_row.transaction_id,
          timeline_row.movement_id
      ) AS previous_brand_name,
      pg_catalog.first_value(timeline_row.unit_price) OVER ($new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_REPORT_SEQUENCE_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$          'supplierName', row_data.supplier_name,
          'kind', CASE
            WHEN row_data.is_baseline THEN 'baseline'
            WHEN row_data.sequence_number = 1 THEN 'initial'
            ELSE 'change'
          END,
          'changeAmount', CASE
            WHEN row_data.previous_price IS NULL THEN NULL
            ELSE row_data.unit_price - row_data.previous_price
          END,
          'changePercent', CASE
            WHEN row_data.previous_price IS NULL
              OR row_data.previous_price = 0 THEN NULL
            ELSE (
              (row_data.unit_price - row_data.previous_price)
              / row_data.previous_price
            ) * 100
          END$old$,
    $new$          'supplierName', row_data.supplier_name,
          'brandName', row_data.brand_name,
          'kind', CASE
            WHEN row_data.is_baseline THEN 'baseline'
            WHEN row_data.sequence_number = 1 THEN 'initial'
            WHEN row_data.previous_price = row_data.unit_price
              AND row_data.previous_brand_name IS NOT NULL
              AND row_data.brand_name IS NOT NULL
              AND pg_catalog.lower(pg_catalog.btrim(row_data.previous_brand_name))
                  IS DISTINCT FROM
                  pg_catalog.lower(pg_catalog.btrim(row_data.brand_name))
              THEN 'brand_change'
            ELSE 'change'
          END,
          'changeAmount', CASE
            WHEN row_data.previous_price IS NULL
              OR row_data.previous_price = row_data.unit_price THEN NULL
            ELSE row_data.unit_price - row_data.previous_price
          END,
          'changePercent', CASE
            WHEN row_data.previous_price IS NULL
              OR row_data.previous_price = 0
              OR row_data.previous_price = row_data.unit_price THEN NULL
            ELSE (
              (row_data.unit_price - row_data.previous_price)
              / row_data.previous_price
            ) * 100
          END$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_REPORT_JSON_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$           OR (
             row_data.is_in_period
             AND row_data.previous_price IS NOT NULL
             AND row_data.previous_price <> row_data.unit_price
           )
      ) AS price_history$old$,
    $new$           OR (
             row_data.is_in_period
             AND row_data.previous_price IS NOT NULL
             AND row_data.previous_price <> row_data.unit_price
           )
           OR (
             row_data.is_in_period
             AND row_data.previous_brand_name IS NOT NULL
             AND row_data.brand_name IS NOT NULL
             AND pg_catalog.lower(pg_catalog.btrim(row_data.previous_brand_name))
                 IS DISTINCT FROM
                 pg_catalog.lower(pg_catalog.btrim(row_data.brand_name))
           )
      ) AS price_history$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_REPORT_HISTORY_FILTER_DRIFT';
  END IF;

  EXECUTE v_def;
END;
$patch_price_report$;

ALTER FUNCTION public.get_product_price_change_report_v1(
  uuid, timestamp with time zone, timestamp with time zone
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_product_price_change_report_v1(
  uuid, timestamp with time zone, timestamp with time zone
)
FROM PUBLIC, anon;
GRANT EXECUTE
ON FUNCTION public.get_product_price_change_report_v1(
  uuid, timestamp with time zone, timestamp with time zone
)
TO authenticated, service_role;

COMMIT;
