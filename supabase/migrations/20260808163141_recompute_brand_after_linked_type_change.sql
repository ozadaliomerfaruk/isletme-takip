-- A linked transaction can be edited from a purchase type to a non-purchase
-- type. Remember whether its previous product rows were inbound so removing a
-- former purchase also exposes the preceding purchase brand.
--
-- Data safety: function-only patch; no table alteration, backfill, or data DML.
DO $patch_linked_type_change$
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
    $old$  v_existing_ids uuid[];
  v_all_ids uuid[];$old$,
    $new$  v_existing_ids uuid[];
  v_existing_had_ingress boolean;
  v_all_ids uuid[];$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_LINKED_TYPE_DECLARATION_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  SELECT COALESCE(
    pg_catalog.array_agg(
      DISTINCT movement.urun_id
      ORDER BY movement.urun_id
    ),
    ARRAY[]::uuid[]
  )
  INTO v_existing_ids
  FROM public.urun_hareketler AS movement
  WHERE movement.isletme_id = p_isletme_id
    AND movement.islem_id = p_islem_id;$old$,
    $new$  SELECT
    COALESCE(
      pg_catalog.array_agg(
        DISTINCT movement.urun_id
        ORDER BY movement.urun_id
      ),
      ARRAY[]::uuid[]
    ),
    COALESCE(
      pg_catalog.bool_or(movement.hareket_tipi = 'giris'),
      false
    )
  INTO
    v_existing_ids,
    v_existing_had_ingress
  FROM public.urun_hareketler AS movement
  WHERE movement.isletme_id = p_isletme_id
    AND movement.islem_id = p_islem_id;$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_LINKED_TYPE_READ_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  IF p_type IN ('gider', 'cari_alis') THEN
    PERFORM internal.sync_product_current_brand_v1(
      p_isletme_id,
      v_all_ids
    );
  END IF;$old$,
    $new$  IF p_type IN ('gider', 'cari_alis')
     OR v_existing_had_ingress THEN
    PERFORM internal.sync_product_current_brand_v1(
      p_isletme_id,
      v_all_ids
    );
  END IF;$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_LINKED_TYPE_SYNC_DRIFT';
  END IF;

  EXECUTE v_def;
END;
$patch_linked_type_change$;

ALTER FUNCTION internal.reapply_cari_urun_items_v3(
  uuid, uuid, jsonb, text, text
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.reapply_cari_urun_items_v3(
  uuid, uuid, jsonb, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
