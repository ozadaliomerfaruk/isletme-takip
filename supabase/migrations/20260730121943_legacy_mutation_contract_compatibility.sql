-- =============================================================================
-- LEGACY MUTATION CONTRACT COMPATIBILITY
--
-- Purpose:
--   Keep strict V2/V3 server-derived balance and stock guarantees while adapting
--   payloads sent by already-released 1.5.x clients at the legacy RPC boundary.
--
-- Data safety:
--   * no user-row INSERT/UPDATE/DELETE
--   * no column/table DROP, rename or type change
--   * function signatures and grants stay unchanged
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';

DO $precondition$
DECLARE
  v_price_scale integer;
  v_quantity_scale integer;
BEGIN
  SELECT numeric_scale
  INTO v_price_scale
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'urun_hareketler'
    AND column_name = 'birim_fiyat';

  SELECT numeric_scale
  INTO v_quantity_scale
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'urun_hareketler'
    AND column_name = 'miktar';

  IF v_price_scale IS DISTINCT FROM 4
     OR v_quantity_scale IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION
      'LEGACY_MUTATION_COMPAT_SCHEMA_MISMATCH price_scale=%, quantity_scale=%',
      v_price_scale,
      v_quantity_scale;
  END IF;
END;
$precondition$;

-- Released clients included created_at in product item objects. The canonical
-- movement date is transaction.date; only that known legacy field is removed.
CREATE OR REPLACE FUNCTION internal.sanitize_legacy_cari_product_items_v1(
  p_items jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT COALESCE(
    pg_catalog.jsonb_agg(item.value - 'created_at' ORDER BY item.ordinality),
    '[]'::jsonb
  )
  FROM pg_catalog.jsonb_array_elements(p_items)
       WITH ORDINALITY AS item(value, ordinality);
$function$;

ALTER FUNCTION internal.sanitize_legacy_cari_product_items_v1(jsonb)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.sanitize_legacy_cari_product_items_v1(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

-- Patch only exact, known definitions. Every replacement is guarded so a
-- future definition drift fails the migration instead of silently weakening it.
DO $patch$
DECLARE
  v_def text;
  v_before text;
BEGIN
  -- Legacy transaction update: old full-row payloads contain JSON null currency
  -- assertions. Omit only those two null assertions; explicit non-null values
  -- remain checked by the strict V2 engine.
  SELECT pg_catalog.pg_get_functiondef(
    'public.update_islem_atomik(uuid,uuid,jsonb,jsonb)'::regprocedure
  )
  INTO v_def;
  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$    'vade_tarihi'
  );$old$,
    $new$    'vade_tarihi'
  )
    AND NOT (
      field.key IN ('source_currency', 'target_currency')
      AND field.value = 'null'::jsonb
    );$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'LEGACY_MUTATION_COMPAT_UPDATE_WRAPPER_DRIFT';
  END IF;
  EXECUTE v_def;

  -- V2 update may keep an unchanged historical link to an archived/passive
  -- entity. A newly selected or role-swapped entity must still be active and
  -- non-archived.
  SELECT pg_catalog.pg_get_functiondef(
    'public.update_islem_atomik_v2(uuid,uuid,jsonb)'::regprocedure
  )
  INTO v_def;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$      AND customer.is_active IS TRUE
      AND customer.is_archived IS FALSE$old$,
    $new$      AND (
        v_new.cari_id IS NOT DISTINCT FROM v_old.cari_id
        OR (
          customer.is_active IS TRUE
          AND customer.is_archived IS FALSE
        )
      )$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'LEGACY_MUTATION_COMPAT_CARI_GUARD_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$      AND employee.is_active IS TRUE
      AND employee.is_archived IS FALSE$old$,
    $new$      AND (
        v_new.personel_id IS NOT DISTINCT FROM v_old.personel_id
        OR (
          employee.is_active IS TRUE
          AND employee.is_archived IS FALSE
        )
      )$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'LEGACY_MUTATION_COMPAT_PERSONEL_GUARD_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$      AND account.is_active IS TRUE
      AND account.is_archived IS FALSE$old$,
    $new$      AND (
        (
          account.id IS NOT DISTINCT FROM v_old.hesap_id
          AND account.id IS NOT DISTINCT FROM v_new.hesap_id
        )
        OR (
          account.id IS NOT DISTINCT FROM v_old.hedef_hesap_id
          AND account.id IS NOT DISTINCT FROM v_new.hedef_hesap_id
        )
        OR (
          account.is_active IS TRUE
          AND account.is_archived IS FALSE
        )
      )$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'LEGACY_MUTATION_COMPAT_ACCOUNT_GUARD_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$      AND category.is_active IS TRUE
      AND category.type::text = v_expected_category_type$old$,
    $new$      AND (
        v_new.kategori_id IS NOT DISTINCT FROM v_old.kategori_id
        OR category.is_active IS TRUE
      )
      AND category.type::text = v_expected_category_type$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'LEGACY_MUTATION_COMPAT_CATEGORY_GUARD_DRIFT';
  END IF;
  EXECUTE v_def;

  -- V3 item contract follows the actual column contract:
  -- quantity scale 3, unit price scale 4, nullable legacy price/VAT.
  SELECT pg_catalog.pg_get_functiondef(
    'internal.reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)'::regprocedure
  )
  INTO v_def;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$       OR pg_catalog.jsonb_typeof(v_item->'birim_fiyat')
          IS DISTINCT FROM 'number'
       OR pg_catalog.jsonb_typeof(v_item->'kdv_orani')
          IS DISTINCT FROM 'number'$old$,
    $new$       OR NOT (v_item ? 'birim_fiyat')
       OR pg_catalog.jsonb_typeof(v_item->'birim_fiyat')
          NOT IN ('number', 'null')
       OR NOT (v_item ? 'kdv_orani')
       OR pg_catalog.jsonb_typeof(v_item->'kdv_orani')
          NOT IN ('number', 'null')$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'LEGACY_MUTATION_COMPAT_PRODUCT_ITEM_TYPE_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$       OR v_birim_fiyat IS NULL
       OR v_birim_fiyat = 'NaN'::numeric
       OR v_birim_fiyat = 'Infinity'::numeric
       OR v_birim_fiyat = '-Infinity'::numeric
       OR v_birim_fiyat < 0
       OR v_birim_fiyat > 9999999999999.99
       OR v_birim_fiyat IS DISTINCT FROM pg_catalog.round(v_birim_fiyat, 2)
       OR v_kdv < 0
       OR v_kdv > 100 THEN$old$,
    $new$       OR (
         v_birim_fiyat IS NOT NULL
         AND (
           v_birim_fiyat = 'NaN'::numeric
           OR v_birim_fiyat = 'Infinity'::numeric
           OR v_birim_fiyat = '-Infinity'::numeric
           OR v_birim_fiyat < 0
           OR v_birim_fiyat > 99999999999.9999
           OR v_birim_fiyat
              IS DISTINCT FROM pg_catalog.round(v_birim_fiyat, 4)
         )
       )
       OR (
         v_kdv IS NOT NULL
         AND (v_kdv < 0 OR v_kdv > 100)
       ) THEN$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'LEGACY_MUTATION_COMPAT_PRODUCT_ITEM_SCALE_DRIFT';
  END IF;
  EXECUTE v_def;

  -- The table trigger must enforce the same scale as the V3 entry point.
  SELECT pg_catalog.pg_get_functiondef(
    'internal.enforce_linked_product_movement_permission_v1()'::regprocedure
  )
  INTO v_def;
  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    'NEW.birim_fiyat > 9999999999999.99',
    'NEW.birim_fiyat > 99999999999.9999'
  );
  v_def := pg_catalog.replace(
    v_def,
    'pg_catalog.round(NEW.birim_fiyat, 2)',
    'pg_catalog.round(NEW.birim_fiyat, 4)'
  );
  IF v_def IS NOT DISTINCT FROM v_before
     OR pg_catalog.strpos(
       v_def,
       'pg_catalog.round(NEW.birim_fiyat, 2)'
     ) > 0 THEN
    RAISE EXCEPTION 'LEGACY_MUTATION_COMPAT_PRODUCT_TRIGGER_DRIFT';
  END IF;
  EXECUTE v_def;

  -- Released product-create clients also sent created_at inside each item.
  SELECT pg_catalog.pg_get_functiondef(
    'public.create_islem_with_urun_atomik(uuid,jsonb,jsonb,jsonb)'::regprocedure
  )
  INTO v_def;
  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$    p_items,
    v_type,
    'create'$old$,
    $new$    internal.sanitize_legacy_cari_product_items_v1(p_items),
    v_type,
    'create'$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'LEGACY_MUTATION_COMPAT_PRODUCT_CREATE_WRAPPER_DRIFT';
  END IF;
  EXECUTE v_def;

  SELECT pg_catalog.pg_get_functiondef(
    'public.reapply_urun_hareketler_for_islem(uuid,uuid,jsonb)'::regprocedure
  )
  INTO v_def;
  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$    COALESCE(p_items, '[]'::jsonb),
    v_transaction.type::text,
    'update'$old$,
    $new$    internal.sanitize_legacy_cari_product_items_v1(
      COALESCE(p_items, '[]'::jsonb)
    ),
    v_transaction.type::text,
    'update'$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'LEGACY_MUTATION_COMPAT_PRODUCT_REAPPLY_WRAPPER_DRIFT';
  END IF;
  EXECUTE v_def;
END;
$patch$;

COMMENT ON FUNCTION internal.sanitize_legacy_cari_product_items_v1(jsonb) IS
  'Released-client adapter: strips only created_at before strict V3 product validation.';

COMMIT;
