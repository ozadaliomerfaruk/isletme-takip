-- Legacy empty product-reapply compatibility.
--
-- Released 1.5.x clients update the transaction first and may then call the
-- legacy product reapply RPC even when the final transaction type cannot carry
-- products. If both the canonical item array and existing movement set are
-- empty, that second call has no work to perform. Treat only that exact,
-- already-authorized state as a no-op instead of showing a false product error.
--
-- Data safety:
--   * no user row is inserted, updated, deleted, or backfilled;
--   * the public RPC signature and grants stay unchanged;
--   * non-empty items and transactions with existing movements still pass
--     through the strict V3 validator and fail closed when unsupported.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';

DO $precondition$
DECLARE
  v_function pg_catalog.pg_proc;
BEGIN
  IF pg_catalog.to_regprocedure(
       'public.reapply_urun_hareketler_for_islem(uuid,uuid,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.sanitize_legacy_cari_product_items_v1(jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)'
     ) IS NULL
     OR pg_catalog.to_regclass('public.urun_hareketler') IS NULL THEN
    RAISE EXCEPTION 'LEGACY_EMPTY_PRODUCT_REAPPLY_SCHEMA_PRECONDITION_FAILED';
  END IF;

  SELECT procedure_row.*
  INTO v_function
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = (
    'public.reapply_urun_hareketler_for_islem(uuid,uuid,jsonb)'
  )::pg_catalog.regprocedure;

  IF v_function.prosecdef IS NOT TRUE
     OR v_function.provolatile IS DISTINCT FROM 'v'
     OR NOT (
       COALESCE(v_function.proconfig, ARRAY[]::text[])
       @> ARRAY['search_path=""']::text[]
     ) THEN
    RAISE EXCEPTION
      'LEGACY_EMPTY_PRODUCT_REAPPLY_FUNCTION_PRECONDITION_FAILED';
  END IF;
END;
$precondition$;

DO $patch$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.reapply_urun_hareketler_for_islem(uuid,uuid,jsonb)'::regprocedure
  )
  INTO v_definition;

  v_before := v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$DECLARE
  v_transaction public.islemler;
BEGIN$old$,
    $new$DECLARE
  v_transaction public.islemler;
  v_items jsonb;
BEGIN$new$
  );
  IF v_definition IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION
      'LEGACY_EMPTY_PRODUCT_REAPPLY_DECLARATION_DRIFT';
  END IF;

  v_before := v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$  PERFORM internal.reapply_cari_urun_items_v3(
    p_isletme_id,
    p_islem_id,
    internal.sanitize_legacy_cari_product_items_v1(
      COALESCE(p_items, '[]'::jsonb)
    ),
    v_transaction.type::text,
    'update'
  );$old$,
    $new$  v_items := internal.sanitize_legacy_cari_product_items_v1(
    COALESCE(p_items, '[]'::jsonb)
  );

  -- Released 1.5.x compatibility: after the transaction update, the old
  -- client can issue a redundant empty reapply for an unsupported final type.
  -- Permission checks above still run. This branch is safe only when neither
  -- the request nor the database contains a product movement to mutate.
  IF v_transaction.type::text NOT IN (
    'gelir',
    'gider',
    'cari_alis',
    'cari_satis',
    'cari_alis_iade',
    'cari_satis_iade'
  )
  AND pg_catalog.jsonb_array_length(v_items) = 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.urun_hareketler AS movement
    WHERE movement.isletme_id = p_isletme_id
      AND movement.islem_id = p_islem_id
  ) THEN
    RETURN;
  END IF;

  PERFORM internal.reapply_cari_urun_items_v3(
    p_isletme_id,
    p_islem_id,
    v_items,
    v_transaction.type::text,
    'update'
  );$new$
  );
  IF v_definition IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION
      'LEGACY_EMPTY_PRODUCT_REAPPLY_BODY_DRIFT';
  END IF;

  EXECUTE v_definition;
END;
$patch$;

COMMENT ON FUNCTION public.reapply_urun_hareketler_for_islem(
  uuid, uuid, jsonb
) IS
  'Legacy adapter: authorized empty/no-movement unsupported-type reapply is a no-op; all other requests use strict V3.';

DO $postcondition$
DECLARE
  v_function pg_catalog.pg_proc;
  v_definition text;
  v_permission_position integer;
  v_noop_position integer;
BEGIN
  SELECT procedure_row.*
  INTO v_function
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = (
    'public.reapply_urun_hareketler_for_islem(uuid,uuid,jsonb)'
  )::pg_catalog.regprocedure;

  v_definition := pg_catalog.pg_get_functiondef(v_function.oid);
  v_permission_position := pg_catalog.strpos(
    v_definition,
    'internal.kayit_mutasyon_izni_v1('
  );
  v_noop_position := pg_catalog.strpos(
    v_definition,
    'pg_catalog.jsonb_array_length(v_items) = 0'
  );

  IF v_function.prosecdef IS NOT TRUE
     OR v_function.provolatile IS DISTINCT FROM 'v'
     OR NOT (
       COALESCE(v_function.proconfig, ARRAY[]::text[])
       @> ARRAY['search_path=""']::text[]
     )
     OR v_permission_position = 0
     OR v_noop_position = 0
     OR v_permission_position > v_noop_position
     OR pg_catalog.strpos(
       v_definition,
       'movement.islem_id = p_islem_id'
     ) = 0
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'public.reapply_urun_hareketler_for_islem(uuid,uuid,jsonb)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.reapply_urun_hareketler_for_islem(uuid,uuid,jsonb)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.reapply_urun_hareketler_for_islem(uuid,uuid,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'LEGACY_EMPTY_PRODUCT_REAPPLY_POSTCONDITION_FAILED';
  END IF;
END;
$postcondition$;

COMMIT;
