-- Editing an outbound/adjustment row must not overwrite a manually selected
-- current product brand. Recompute only when the old or new movement is a
-- purchase (`giris`).
--
-- Data safety: function-only patch; no table alteration, backfill, or data DML.
DO $patch_direct_brand_sync_scope$
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
    $old$  v_net_delta numeric;
BEGIN$old$,
    $new$  v_net_delta numeric;
  v_brand_sync_required boolean;
BEGIN$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_DIRECT_SYNC_DECLARATION_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  UPDATE public.urun_hareketler AS movement
  SET hareket_tipi = v_hareket_tipi,$old$,
    $new$  v_brand_sync_required :=
    v_hareket.hareket_tipi = 'giris'
    OR v_hareket_tipi = 'giris';

  UPDATE public.urun_hareketler AS movement
  SET hareket_tipi = v_hareket_tipi,$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_DIRECT_SYNC_CAPTURE_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  PERFORM internal.sync_product_current_brand_v1(
    p_isletme_id,
    ARRAY[v_hareket.urun_id]
  );$old$,
    $new$  IF v_brand_sync_required THEN
    PERFORM internal.sync_product_current_brand_v1(
      p_isletme_id,
      ARRAY[v_hareket.urun_id]
    );
  END IF;$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_DIRECT_SYNC_SCOPE_DRIFT';
  END IF;

  EXECUTE v_def;
END;
$patch_direct_brand_sync_scope$;

ALTER FUNCTION public.update_urun_hareket_atomik_v2(uuid, uuid, jsonb)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.update_urun_hareket_atomik_v2(uuid, uuid, jsonb)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE
ON FUNCTION public.update_urun_hareket_atomik_v2(uuid, uuid, jsonb)
TO authenticated;
