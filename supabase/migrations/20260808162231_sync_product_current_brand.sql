-- Keep public.urunler.marka aligned with the chronologically latest purchase
-- snapshot without rewriting existing rows.
--
-- Data safety:
--   * no table/column/data backfill is performed;
--   * existing public RPC signatures and result shapes stay unchanged;
--   * old clients may keep omitting `marka`; direct movements then snapshot the
--     current product brand, matching the existing linked-transaction engine;
--   * backdated purchases cannot replace a newer current brand because the
--     helper always resolves the latest effective purchase date.
--
-- Released 1.5.x clients:
--   Their payloads remain valid. They do not see a new required field, their
--   writes keep succeeding, and existing movement/product rows are untouched.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';

DO $precondition$
BEGIN
  IF pg_catalog.to_regclass('public.urunler') IS NULL
     OR pg_catalog.to_regclass('public.urun_hareketler') IS NULL
     OR pg_catalog.to_regclass('public.islemler') IS NULL
     OR pg_catalog.to_regprocedure(
          'public.create_urun_hareket_atomik_v2(uuid,jsonb)'
        ) IS NULL
     OR pg_catalog.to_regprocedure(
          'public.update_urun_hareket_atomik_v2(uuid,uuid,jsonb)'
        ) IS NULL
     OR pg_catalog.to_regprocedure(
          'public.delete_urun_hareket_atomik_v2(uuid,uuid)'
        ) IS NULL
     OR pg_catalog.to_regprocedure(
          'internal.reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)'
        ) IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_SCHEMA_PRECONDITION_FAILED';
  END IF;
END;
$precondition$;

CREATE OR REPLACE FUNCTION internal.sync_product_current_brand_v1(
  p_isletme_id uuid,
  p_urun_ids uuid[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH latest_purchase AS (
    SELECT DISTINCT ON (movement.urun_id)
      movement.urun_id,
      NULLIF(pg_catalog.btrim(movement.marka), '') AS latest_brand
    FROM public.urun_hareketler AS movement
    LEFT JOIN public.islemler AS transaction_row
      ON transaction_row.id = movement.islem_id
     AND transaction_row.isletme_id = movement.isletme_id
    WHERE movement.isletme_id = p_isletme_id
      AND movement.urun_id = ANY(COALESCE(p_urun_ids, ARRAY[]::uuid[]))
      AND (
        (
          movement.islem_id IS NULL
          AND movement.hareket_tipi = 'giris'
        )
        OR transaction_row.type::text IN ('gider', 'cari_alis')
      )
    ORDER BY
      movement.urun_id,
      COALESCE(transaction_row.date, movement.created_at) DESC,
      movement.created_at DESC,
      movement.id DESC
  )
  UPDATE public.urunler AS product
  SET marka = latest_purchase.latest_brand,
      updated_at = pg_catalog.clock_timestamp()
  FROM latest_purchase
  WHERE product.id = latest_purchase.urun_id
    AND product.isletme_id = p_isletme_id
    AND product.marka IS DISTINCT FROM latest_purchase.latest_brand;
$function$;

ALTER FUNCTION internal.sync_product_current_brand_v1(uuid, uuid[])
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.sync_product_current_brand_v1(uuid, uuid[])
FROM PUBLIC, anon, authenticated, service_role;

-- Direct stock movements: accept the optional snapshot, fall back to the
-- product's current brand for old clients, then recompute current brand once.
DO $patch_direct_create$
DECLARE
  v_def text;
  v_before text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.create_urun_hareket_atomik_v2(uuid,jsonb)'::regprocedure
  ) INTO v_def;

  v_def := pg_catalog.replace(v_def, E'\r\n', E'\n');

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  v_aciklama text;
  v_created_at timestamptz;$old$,
    $new$  v_aciklama text;
  v_marka text;
  v_default_marka text;
  v_created_at timestamptz;$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_CREATE_DECLARATION_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.regexp_replace(
    v_def,
    $pattern$      'birim_fiyat',[[:space:]]*'kdv_orani',[[:space:]]*'aciklama',[[:space:]]*'created_at'$pattern$,
    $replacement$      'birim_fiyat',
      'kdv_orani',
      'marka',
      'aciklama',
      'created_at'$replacement$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_CREATE_ALLOWLIST_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$    v_aciklama := p_new_row->>'aciklama';
    v_created_at := NULLIF(p_new_row->>'created_at', '')::timestamptz;$old$,
    $new$    v_aciklama := p_new_row->>'aciklama';
    v_marka := CASE
      WHEN p_new_row ? 'marka'
        THEN NULLIF(pg_catalog.btrim(p_new_row->>'marka'), '')
      ELSE NULL
    END;
    v_created_at := NULLIF(p_new_row->>'created_at', '')::timestamptz;$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_CREATE_PARSE_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  IF v_urun_id IS NULL
     OR v_hareket_tipi NOT IN ('giris', 'cikis', 'duzeltme')
     OR v_miktar IS NULL THEN$old$,
    $new$  IF v_urun_id IS NULL
     OR v_hareket_tipi NOT IN ('giris', 'cikis', 'duzeltme')
     OR v_miktar IS NULL
     OR (
       p_new_row ? 'marka'
       AND pg_catalog.jsonb_typeof(p_new_row->'marka')
           NOT IN ('string', 'null')
     )
     OR pg_catalog.char_length(COALESCE(v_marka, '')) > 120 THEN$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_CREATE_VALIDATION_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  SELECT COALESCE(product.miktar, 0)
  INTO v_onceki_miktar
  FROM public.urunler AS product$old$,
    $new$  SELECT
    COALESCE(product.miktar, 0),
    NULLIF(pg_catalog.btrim(product.marka), '')
  INTO
    v_onceki_miktar,
    v_default_marka
  FROM public.urunler AS product$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_CREATE_PRODUCT_LOOKUP_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  IF v_islem_id IS NOT NULL THEN$old$,
    $new$  IF NOT (p_new_row ? 'marka') THEN
    v_marka := v_default_marka;
  END IF;

  IF v_islem_id IS NOT NULL THEN$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_CREATE_FALLBACK_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$    birim_fiyat, kdv_orani, onceki_miktar, yeni_miktar,
    aciklama, created_at$old$,
    $new$    birim_fiyat, kdv_orani, marka, onceki_miktar, yeni_miktar,
    aciklama, created_at$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_CREATE_INSERT_COLUMN_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$    v_hareket_tipi, v_miktar, v_birim_fiyat, v_kdv_orani,
    v_onceki_miktar, v_yeni_miktar, v_aciklama,$old$,
    $new$    v_hareket_tipi, v_miktar, v_birim_fiyat, v_kdv_orani,
    v_marka, v_onceki_miktar, v_yeni_miktar, v_aciklama,$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_CREATE_INSERT_VALUE_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  IF v_islem_id IS NULL
     AND NOT internal.isletme_sahibi_v1(p_isletme_id) THEN
    PERFORM
      internal.assert_canonical_unlinked_product_context_consumed_v1(
        'create', v_hareket_id
      );
  END IF;

  RETURN pg_catalog.to_jsonb(v_hareket);$old$,
    $new$  IF v_islem_id IS NULL
     AND NOT internal.isletme_sahibi_v1(p_isletme_id) THEN
    PERFORM
      internal.assert_canonical_unlinked_product_context_consumed_v1(
        'create', v_hareket_id
      );
  END IF;

  IF v_islem_id IS NULL AND v_hareket_tipi = 'giris' THEN
    PERFORM internal.sync_product_current_brand_v1(
      p_isletme_id,
      ARRAY[v_urun_id]
    );
  END IF;

  RETURN pg_catalog.to_jsonb(v_hareket);$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_CREATE_SYNC_DRIFT';
  END IF;

  EXECUTE v_def;
END;
$patch_direct_create$;

ALTER FUNCTION public.create_urun_hareket_atomik_v2(uuid, jsonb)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.create_urun_hareket_atomik_v2(uuid, jsonb)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE
ON FUNCTION public.create_urun_hareket_atomik_v2(uuid, jsonb)
TO authenticated;

-- Direct movement edits may change the snapshot or effective date. Preserve
-- the old snapshot when new clients omit `marka`, then recompute chronologically.
DO $patch_direct_update$
DECLARE
  v_def text;
  v_before text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.update_urun_hareket_atomik_v2(uuid,uuid,jsonb)'::regprocedure
  ) INTO v_def;

  v_def := pg_catalog.replace(v_def, E'\r\n', E'\n');

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  v_birim_fiyat numeric;
  v_created_at timestamptz;$old$,
    $new$  v_birim_fiyat numeric;
  v_marka text;
  v_created_at timestamptz;$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_UPDATE_DECLARATION_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.regexp_replace(
    v_def,
    $pattern$      'hareket_tipi',[[:space:]]*'miktar',[[:space:]]*'birim_fiyat',[[:space:]]*'created_at'$pattern$,
    $replacement$      'hareket_tipi',
      'miktar',
      'birim_fiyat',
      'marka',
      'created_at'$replacement$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_UPDATE_ALLOWLIST_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$    v_birim_fiyat := NULLIF(p_patch->>'birim_fiyat', '')::numeric;
    v_created_at := CASE$old$,
    $new$    v_birim_fiyat := NULLIF(p_patch->>'birim_fiyat', '')::numeric;
    v_marka := CASE
      WHEN p_patch ? 'marka'
        THEN NULLIF(pg_catalog.btrim(p_patch->>'marka'), '')
      ELSE NULLIF(pg_catalog.btrim(v_hareket.marka), '')
    END;
    v_created_at := CASE$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_UPDATE_PARSE_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  IF v_hareket_tipi NOT IN ('giris', 'cikis', 'duzeltme')
     OR v_miktar IS NULL
     OR v_created_at IS NULL THEN$old$,
    $new$  IF v_hareket_tipi NOT IN ('giris', 'cikis', 'duzeltme')
     OR v_miktar IS NULL
     OR v_created_at IS NULL
     OR (
       p_patch ? 'marka'
       AND pg_catalog.jsonb_typeof(p_patch->'marka')
           NOT IN ('string', 'null')
     )
     OR pg_catalog.char_length(COALESCE(v_marka, '')) > 120 THEN$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_UPDATE_VALIDATION_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$      birim_fiyat = v_birim_fiyat,
      yeni_miktar = v_urun_miktar,$old$,
    $new$      birim_fiyat = v_birim_fiyat,
      marka = v_marka,
      yeni_miktar = v_urun_miktar,$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_UPDATE_WRITE_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  RETURN pg_catalog.to_jsonb(v_hareket);
END;$old$,
    $new$  PERFORM internal.sync_product_current_brand_v1(
    p_isletme_id,
    ARRAY[v_hareket.urun_id]
  );

  RETURN pg_catalog.to_jsonb(v_hareket);
END;$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_UPDATE_SYNC_DRIFT';
  END IF;

  EXECUTE v_def;
END;
$patch_direct_update$;

ALTER FUNCTION public.update_urun_hareket_atomik_v2(uuid, uuid, jsonb)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.update_urun_hareket_atomik_v2(uuid, uuid, jsonb)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE
ON FUNCTION public.update_urun_hareket_atomik_v2(uuid, uuid, jsonb)
TO authenticated;

-- Deleting the latest direct purchase should expose the previous purchase
-- brand when one exists. Products with no remaining purchase are left as-is.
DO $patch_direct_delete$
DECLARE
  v_def text;
  v_before text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.delete_urun_hareket_atomik_v2(uuid,uuid)'::regprocedure
  ) INTO v_def;

  v_def := pg_catalog.replace(v_def, E'\r\n', E'\n');

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  RETURN true;
END;$old$,
    $new$  IF v_hareket.hareket_tipi = 'giris' THEN
    PERFORM internal.sync_product_current_brand_v1(
      p_isletme_id,
      ARRAY[v_hareket.urun_id]
    );
  END IF;

  RETURN true;
END;$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_DELETE_SYNC_DRIFT';
  END IF;

  EXECUTE v_def;
END;
$patch_direct_delete$;

ALTER FUNCTION public.delete_urun_hareket_atomik_v2(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.delete_urun_hareket_atomik_v2(uuid, uuid)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE
ON FUNCTION public.delete_urun_hareket_atomik_v2(uuid, uuid)
TO authenticated;

-- Linked purchases are reapplied in one atomic V3 transaction. Recompute once
-- after all rows are replaced so bulk invoices do not run a query per item.
DO $patch_linked_engine$
DECLARE
  v_def text;
  v_before text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'internal.reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)'::regprocedure
  ) INTO v_def;

  v_def := pg_catalog.replace(v_def, E'\r\n', E'\n');

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  -- INSERT trigger'lari da ayni exact private outer-action baglamini ister.
  -- Bu nedenle context, eski hareket DELETE'i ile tum yeni hareket INSERT'leri
  -- bitene kadar yasatilir ve basarili yolun sonunda temizlenir.
  DELETE FROM internal.permission_v2_movement_action_context AS action_context$old$,
    $new$  IF p_type IN ('gider', 'cari_alis') THEN
    PERFORM internal.sync_product_current_brand_v1(
      p_isletme_id,
      v_all_ids
    );
  END IF;

  -- INSERT trigger'lari da ayni exact private outer-action baglamini ister.
  -- Bu nedenle context, eski hareket DELETE'i ile tum yeni hareket INSERT'leri
  -- bitene kadar yasatilir ve basarili yolun sonunda temizlenir.
  DELETE FROM internal.permission_v2_movement_action_context AS action_context$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CURRENT_BRAND_LINKED_SYNC_DRIFT';
  END IF;

  EXECUTE v_def;
END;
$patch_linked_engine$;

ALTER FUNCTION internal.reapply_cari_urun_items_v3(
  uuid, uuid, jsonb, text, text
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.reapply_cari_urun_items_v3(
  uuid, uuid, jsonb, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
