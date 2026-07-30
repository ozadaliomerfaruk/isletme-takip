-- Product mutation V3 contract compatibility.
--
-- Data safety:
--   * no user row is inserted, updated, deleted, or backfilled;
--   * existing function signatures stay unchanged;
--   * unsupported final transaction types are accepted only while p_items is
--     an empty array, so the old stock effect can be reversed and removed in
--     the same transaction as the transaction update;
--   * only the business owner may keep an inactive/archived product that was
--     already linked to this exact transaction. New product links still require
--     active + unarchived rows, and shared roles receive no exemption.
--   * a productful create retry with the same client UUID is a no-op only when
--     both the transaction payload and canonical product item set are identical.
--     A different item set, or an itemless pre-existing transaction, conflicts
--     instead of being silently converted into a stock mutation.
--   * legacy null unit price / tax values are normalized to numeric zero only
--     inside the private V3 item boundary and its idempotency comparison. The
--     linked movement trigger remains strict for independent/direct writes.
--
-- Released 1.5.x clients:
--   Their public RPC signatures and normal active-product behavior do not
--   change. The private item engine only gains the narrow owner/history
--   exception above. Exact same-UUID product retries stay successful, while
--   mismatched retries now fail closed. No released-client payload field is
--   removed or renamed. Historical null price/tax payloads become canonical
--   zeroes instead of failing at the linked movement trigger.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';

DO $precondition$
DECLARE
  v_required_columns integer;
BEGIN
  IF pg_catalog.to_regprocedure(
       'internal.reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
        'public.update_cari_urunlu_islem_atomik_v3(uuid,uuid,jsonb,jsonb)'
      ) IS NULL
     OR pg_catalog.to_regprocedure(
        'public.create_islem_with_urun_atomik(uuid,jsonb,jsonb,jsonb)'
      ) IS NULL
     OR pg_catalog.to_regprocedure(
        'internal.enforce_linked_product_movement_permission_v1()'
      ) IS NULL
     OR pg_catalog.to_regprocedure(
        'internal.isletme_sahibi_v1(uuid)'
      ) IS NULL
     OR pg_catalog.to_regprocedure(
        'internal.kayit_mutasyon_izni_v1(uuid,text,uuid,text)'
      ) IS NULL
     OR pg_catalog.to_regprocedure(
        'internal.sanitize_legacy_cari_product_items_v1(jsonb)'
      ) IS NULL
     OR pg_catalog.to_regclass(
       'internal.product_edit_v3_history_context'
     ) IS NOT NULL
     OR pg_catalog.to_regclass('public.islemler') IS NULL
     OR pg_catalog.to_regclass('public.urunler') IS NULL
     OR pg_catalog.to_regclass('public.urun_hareketler') IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_SCHEMA_PRECONDITION_FAILED';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_required_columns
  FROM information_schema.columns AS column_row
  WHERE column_row.table_schema = 'public'
    AND (
      (
        column_row.table_name = 'urunler'
        AND column_row.column_name IN (
          'id', 'isletme_id', 'is_active', 'is_archived', 'miktar'
        )
      )
      OR (
        column_row.table_name = 'urun_hareketler'
        AND column_row.column_name IN (
          'id',
          'isletme_id',
          'islem_id',
          'urun_id',
          'hareket_tipi',
          'miktar',
          'birim_fiyat',
          'kdv_orani',
          'aciklama'
        )
      )
    );

  IF v_required_columns IS DISTINCT FROM 14 THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_COLUMN_PRECONDITION_FAILED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    INNER JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = procedure_row.pronamespace
    WHERE (
      (
        namespace_row.nspname = 'internal'
        AND procedure_row.proname = 'reapply_cari_urun_items_v3'
        AND procedure_row.oid = (
          'internal.reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)'
        )::pg_catalog.regprocedure
      )
      OR (
        namespace_row.nspname = 'public'
        AND procedure_row.proname = 'update_cari_urunlu_islem_atomik_v3'
        AND procedure_row.oid = (
          'public.update_cari_urunlu_islem_atomik_v3(uuid,uuid,jsonb,jsonb)'
        )::pg_catalog.regprocedure
      )
      OR (
        namespace_row.nspname = 'public'
        AND procedure_row.proname = 'create_islem_with_urun_atomik'
        AND procedure_row.oid = (
          'public.create_islem_with_urun_atomik(uuid,jsonb,jsonb,jsonb)'
        )::pg_catalog.regprocedure
      )
      OR (
        namespace_row.nspname = 'internal'
        AND procedure_row.proname =
            'enforce_linked_product_movement_permission_v1'
        AND procedure_row.oid = (
          'internal.enforce_linked_product_movement_permission_v1()'
        )::pg_catalog.regprocedure
      )
    )
    AND (
      procedure_row.prosecdef IS NOT TRUE
      OR procedure_row.provolatile IS DISTINCT FROM 'v'
      OR NOT (
        COALESCE(procedure_row.proconfig, ARRAY[]::text[])
        @> ARRAY['search_path=""']::text[]
      )
    )
  ) THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_FUNCTION_PRECONDITION_FAILED';
  END IF;
END;
$precondition$;

CREATE TABLE internal.product_edit_v3_history_context (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  actor_user_id uuid NOT NULL,
  isletme_id uuid NOT NULL,
  islem_id uuid NOT NULL,
  urun_id uuid NOT NULL,
  CONSTRAINT product_edit_v3_history_context_pkey
    PRIMARY KEY (
      backend_pid,
      transaction_id,
      actor_user_id,
      isletme_id,
      islem_id,
      urun_id
    )
);

ALTER TABLE internal.product_edit_v3_history_context OWNER TO postgres;
REVOKE ALL
ON TABLE internal.product_edit_v3_history_context
FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE internal.product_edit_v3_history_context IS
  'Transaction-local old product ids for owner V3 history-preserving edits.';

DO $patch$
DECLARE
  v_def text;
  v_before text;
  v_clear_position integer;
  v_update_position integer;
  v_final_reapply_position integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'internal.reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)'::regprocedure
  )
  INTO v_def;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  v_new_ids uuid[];
  v_all_ids uuid[];$old$,
    $new$  v_new_ids uuid[];
  v_existing_ids uuid[];
  v_all_ids uuid[];$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_EXISTING_IDS_DECLARATION_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  v_transaction_type text;
  v_product_action text;
BEGIN$old$,
    $new$  v_transaction_type text;
  v_product_action text;
  v_is_owner boolean;
BEGIN$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_OWNER_DECLARATION_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  END IF;

  SELECT
    transaction_row.created_by,$old$,
    $new$  END IF;

  v_is_owner := internal.isletme_sahibi_v1(p_isletme_id);

  SELECT
    transaction_row.created_by,$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_OWNER_LOOKUP_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  END;

  IF pg_catalog.cardinality(v_new_ids) <> ($old$,
    $new$  END;

  SELECT COALESCE(
    pg_catalog.array_agg(
      DISTINCT movement.urun_id
      ORDER BY movement.urun_id
    ),
    ARRAY[]::uuid[]
  )
  INTO v_existing_ids
  FROM public.urun_hareketler AS movement
  WHERE movement.isletme_id = p_isletme_id
    AND movement.islem_id = p_islem_id;

  IF pg_catalog.cardinality(v_new_ids) <> ($new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_EXISTING_IDS_LOOKUP_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$      AND product.is_active IS TRUE
      AND product.is_archived IS FALSE;$old$,
    $new$      AND (
        (
          product.is_active IS TRUE
          AND product.is_archived IS FALSE
        )
        OR (
          p_authorization_action = 'update'
          AND v_is_owner IS TRUE
          AND (
            product.id = ANY(v_existing_ids)
            OR EXISTS (
              SELECT 1
              FROM internal.product_edit_v3_history_context
                AS history_context
              WHERE history_context.backend_pid =
                    pg_catalog.pg_backend_pid()
                AND history_context.transaction_id =
                    pg_catalog.txid_current()
                AND history_context.actor_user_id = auth.uid()
                AND history_context.isletme_id = p_isletme_id
                AND history_context.islem_id = p_islem_id
                AND history_context.urun_id = product.id
            )
          )
        )
      );$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_PRODUCT_LOOKUP_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$      v_miktar := (v_item->>'miktar')::numeric;
      v_birim_fiyat := (v_item->>'birim_fiyat')::numeric;
      v_kdv := (v_item->>'kdv_orani')::integer;$old$,
    $new$      v_miktar := (v_item->>'miktar')::numeric;
      v_birim_fiyat := COALESCE(
        (v_item->>'birim_fiyat')::numeric,
        0::numeric
      );
      v_kdv := COALESCE(
        (v_item->>'kdv_orani')::integer,
        0
      );$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION
      'PRODUCT_EDIT_V3_HISTORY_VALIDATION_NULL_NORMALIZATION_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$    v_urun_id := (v_item->>'urun_id')::uuid;
    v_miktar := (v_item->>'miktar')::numeric;
    v_birim_fiyat := (v_item->>'birim_fiyat')::numeric;
    v_kdv := (v_item->>'kdv_orani')::integer;$old$,
    $new$    v_urun_id := (v_item->>'urun_id')::uuid;
    v_miktar := (v_item->>'miktar')::numeric;
    v_birim_fiyat := COALESCE(
      (v_item->>'birim_fiyat')::numeric,
      0::numeric
    );
    v_kdv := COALESCE(
      (v_item->>'kdv_orani')::integer,
      0
    );$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION
      'PRODUCT_EDIT_V3_HISTORY_INSERT_NULL_NORMALIZATION_DRIFT';
  END IF;

  EXECUTE v_def;

  SELECT pg_catalog.pg_get_functiondef(
    'public.update_cari_urunlu_islem_atomik_v3(uuid,uuid,jsonb,jsonb)'::regprocedure
  )
  INTO v_def;

  v_clear_position := pg_catalog.strpos(
    v_def,
    $needle$  PERFORM internal.reapply_cari_urun_items_v3(
    p_isletme_id,
    p_islem_id,
    '[]'::jsonb,
    v_old.type::text,
    'update'
  );$needle$
  );
  v_update_position := pg_catalog.strpos(
    v_def,
    'FROM public.update_islem_atomik_v2('
  );
  v_final_reapply_position := pg_catalog.strpos(
    v_def,
    $needle$  PERFORM internal.reapply_cari_urun_items_v3(
    p_isletme_id,
    p_islem_id,
    p_items,
    v_result.type,
    'update'
  );$needle$
  );
  IF v_clear_position = 0
     OR v_update_position = 0
     OR v_final_reapply_position = 0
     OR NOT (
       v_clear_position < v_update_position
       AND v_update_position < v_final_reapply_position
     ) THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_ATOMIC_SEQUENCE_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  IF NOT FOUND
     OR v_old.type::text NOT IN (
       'gelir',
       'gider',
       'cari_alis',
       'cari_satis',
       'cari_alis_iade',
       'cari_satis_iade'
     )
     OR NOT internal.islem_mutasyon_izni_v2($old$,
    $new$  IF NOT FOUND
     OR NOT internal.islem_mutasyon_izni_v2($new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_OLD_TYPE_GATE_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  v_old public.islemler;
  v_new_type text;
  v_result record;
BEGIN$old$,
    $new$  v_old public.islemler;
  v_new_type text;
  v_result record;
  v_is_owner boolean;
BEGIN$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_WRAPPER_OWNER_DECLARATION_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  END IF;

  v_new_type := COALESCE(NULLIF(p_patch->>'type', ''), v_old.type::text);$old$,
    $new$  END IF;

  v_is_owner := internal.isletme_sahibi_v1(p_isletme_id);

  v_new_type := COALESCE(NULLIF(p_patch->>'type', ''), v_old.type::text);$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_WRAPPER_OWNER_LOOKUP_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  IF v_new_type NOT IN (
    'gelir',
    'gider',
    'cari_alis',
    'cari_satis',
    'cari_alis_iade',
    'cari_satis_iade'
  ) THEN$old$,
    $new$  IF v_old.type::text NOT IN (
    'gelir',
    'gider',
    'cari_alis',
    'cari_satis',
    'cari_alis_iade',
    'cari_satis_iade'
  )
  AND EXISTS (
    SELECT 1
    FROM public.urun_hareketler AS unexpected_movement
    WHERE unexpected_movement.isletme_id = p_isletme_id
      AND unexpected_movement.islem_id = p_islem_id
  ) THEN
    RAISE EXCEPTION 'CARI_PRODUCT_V3_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  IF (
    v_old.type::text NOT IN (
      'gelir',
      'gider',
      'cari_alis',
      'cari_satis',
      'cari_alis_iade',
      'cari_satis_iade'
    )
    AND v_new_type NOT IN (
      'gelir',
      'gider',
      'cari_alis',
      'cari_satis',
      'cari_alis_iade',
      'cari_satis_iade'
    )
  )
  OR (
    v_new_type NOT IN (
    'gelir',
    'gider',
    'cari_alis',
    'cari_satis',
    'cari_alis_iade',
    'cari_satis_iade'
  )
    AND pg_catalog.jsonb_array_length(p_items) <> 0
  ) THEN$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_FINAL_TYPE_GUARD_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  END IF;

  -- Once stok etkisi geri alinir ve hareketler kaldirilir; UPDATE V2'nin$old$,
    $new$  END IF;

  IF v_is_owner IS TRUE THEN
    INSERT INTO internal.product_edit_v3_history_context (
      backend_pid,
      transaction_id,
      actor_user_id,
      isletme_id,
      islem_id,
      urun_id
    )
    SELECT
      pg_catalog.pg_backend_pid(),
      pg_catalog.txid_current(),
      auth.uid(),
      p_isletme_id,
      p_islem_id,
      movement.urun_id
    FROM public.urun_hareketler AS movement
    WHERE movement.isletme_id = p_isletme_id
      AND movement.islem_id = p_islem_id
    ON CONFLICT DO NOTHING;
  END IF;

  -- Once stok etkisi geri alinir ve hareketler kaldirilir; UPDATE V2'nin$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_CONTEXT_CAPTURE_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  PERFORM internal.reapply_cari_urun_items_v3(
    p_isletme_id,
    p_islem_id,
    '[]'::jsonb,
    v_old.type::text,
    'update'
  );$old$,
    $new$  IF v_old.type::text IN (
    'gelir',
    'gider',
    'cari_alis',
    'cari_satis',
    'cari_alis_iade',
    'cari_satis_iade'
  ) THEN
    PERFORM internal.reapply_cari_urun_items_v3(
      p_isletme_id,
      p_islem_id,
      '[]'::jsonb,
      v_old.type::text,
      'update'
    );
  END IF;$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_CONDITIONAL_CLEAR_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  PERFORM internal.reapply_cari_urun_items_v3(
    p_isletme_id,
    p_islem_id,
    p_items,
    v_result.type,
    'update'
  );

  RETURN QUERY$old$,
    $new$  IF v_result.type IN (
    'gelir',
    'gider',
    'cari_alis',
    'cari_satis',
    'cari_alis_iade',
    'cari_satis_iade'
  ) THEN
    PERFORM internal.reapply_cari_urun_items_v3(
      p_isletme_id,
      p_islem_id,
      p_items,
      v_result.type,
      'update'
    );
  ELSIF pg_catalog.jsonb_array_length(p_items) <> 0 THEN
    RAISE EXCEPTION 'CARI_PRODUCT_V3_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM internal.product_edit_v3_history_context AS history_context
  WHERE history_context.backend_pid = pg_catalog.pg_backend_pid()
    AND history_context.transaction_id = pg_catalog.txid_current()
    AND history_context.actor_user_id = auth.uid()
    AND history_context.isletme_id = p_isletme_id
    AND history_context.islem_id = p_islem_id;

  RETURN QUERY$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_FINAL_REAPPLY_DRIFT';
  END IF;

  EXECUTE v_def;

  SELECT pg_catalog.pg_get_functiondef(
    'public.create_islem_with_urun_atomik(uuid,jsonb,jsonb,jsonb)'::regprocedure
  )
  INTO v_def;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$DECLARE
  v_result jsonb;
  v_islem_id uuid;
  v_type text;
BEGIN$old$,
    $new$DECLARE
  v_result jsonb;
  v_islem_id uuid;
  v_requested_id uuid;
  v_type text;
  v_items jsonb;
  v_item jsonb;
  v_urun_id uuid;
  v_expected_movement text;
  v_miktar numeric;
  v_birim_fiyat numeric;
  v_kdv integer;
  v_item_count integer;
  v_distinct_product_count integer;
  v_existed_before boolean := false;
  v_transaction_created_by uuid;
  v_payload_items jsonb;
  v_existing_items jsonb;
BEGIN$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CREATE_V3_IDEMPOTENCY_DECLARATION_DRIFT';
  END IF;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$  v_result := public.create_islem_atomik(
    p_isletme_id,
    p_new_row,
    '[]'::jsonb
  );
  v_islem_id := (v_result->>'id')::uuid;
  v_type := v_result->>'type';

  -- The V3 private item engine validates product tenant, activity, duplicate
  -- products, expected movement direction and every finite numeric field.
  PERFORM internal.reapply_cari_urun_items_v3(
    p_isletme_id,
    v_islem_id,
    internal.sanitize_legacy_cari_product_items_v1(p_items),
    v_type,
    'create'
  );$old$,
    $new$  v_items := internal.sanitize_legacy_cari_product_items_v1(p_items);

  BEGIN
    v_requested_id := NULLIF(p_new_row->>'id', '')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'ISLEM_LEGACY_PRODUCT_INVALID_INPUT'
        USING ERRCODE = '22023';
  END;

  -- A row lock cannot serialize a not-yet-created client UUID. This private
  -- transaction advisory lock makes concurrent retries for the same UUID
  -- deterministic before the existence probe and canonical create call.
  IF v_requested_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'product-create:' || v_requested_id::text,
        205500
      )
    );

    PERFORM 1
    FROM public.islemler AS existing_transaction
    WHERE existing_transaction.id = v_requested_id
    FOR SHARE;
    v_existed_before := FOUND;
  END IF;

  v_result := public.create_islem_atomik(
    p_isletme_id,
    p_new_row,
    '[]'::jsonb
  );
  v_islem_id := (v_result->>'id')::uuid;
  v_type := v_result->>'type';

  IF v_existed_before IS TRUE THEN
    v_transaction_created_by := (v_result->>'created_by')::uuid;

    -- Idempotent create remains a create permission check. It never borrows
    -- update scope merely because the transaction row already exists.
    IF NOT internal.kayit_mutasyon_izni_v1(
      p_isletme_id,
      'urunler',
      v_transaction_created_by,
      'create'
    ) THEN
      RAISE EXCEPTION 'CARI_PRODUCT_V3_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;

    v_expected_movement := CASE
      WHEN v_type IN ('gider', 'cari_alis', 'cari_satis_iade') THEN 'giris'
      ELSE 'cikis'
    END;

    -- Retry payloads are normalized and validated without touching stock.
    -- The checks mirror the private V3 engine's canonical item contract.
    FOR v_item IN
      SELECT item.value
      FROM pg_catalog.jsonb_array_elements(v_items) AS item(value)
    LOOP
      IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object'
         OR EXISTS (
           SELECT 1
           FROM pg_catalog.jsonb_object_keys(v_item)
                AS item_key(key_name)
           WHERE item_key.key_name NOT IN (
             'urun_id',
             'hareket_tipi',
             'miktar',
             'birim_fiyat',
             'kdv_orani',
             'aciklama'
           )
         )
         OR pg_catalog.jsonb_typeof(v_item->'urun_id')
            IS DISTINCT FROM 'string'
         OR pg_catalog.jsonb_typeof(v_item->'hareket_tipi')
            IS DISTINCT FROM 'string'
         OR pg_catalog.jsonb_typeof(v_item->'miktar')
            IS DISTINCT FROM 'number'
         OR NOT (v_item ? 'birim_fiyat')
         OR pg_catalog.jsonb_typeof(v_item->'birim_fiyat')
            NOT IN ('number', 'null')
         OR NOT (v_item ? 'kdv_orani')
         OR pg_catalog.jsonb_typeof(v_item->'kdv_orani')
            NOT IN ('number', 'null')
         OR (
           v_item ? 'aciklama'
           AND pg_catalog.jsonb_typeof(v_item->'aciklama')
               NOT IN ('string', 'null')
         )
         OR v_item->>'hareket_tipi'
            IS DISTINCT FROM v_expected_movement THEN
        RAISE EXCEPTION 'ISLEM_LEGACY_PRODUCT_INVALID_INPUT'
          USING ERRCODE = '22023';
      END IF;

      BEGIN
        v_urun_id := (v_item->>'urun_id')::uuid;
        v_miktar := (v_item->>'miktar')::numeric;
        v_birim_fiyat := COALESCE(
          (v_item->>'birim_fiyat')::numeric,
          0::numeric
        );
        v_kdv := COALESCE(
          (v_item->>'kdv_orani')::integer,
          0
        );
      EXCEPTION
        WHEN invalid_text_representation OR numeric_value_out_of_range THEN
          RAISE EXCEPTION 'ISLEM_LEGACY_PRODUCT_INVALID_INPUT'
            USING ERRCODE = '22023';
      END;

      IF v_miktar IS NULL
         OR v_miktar = 'NaN'::numeric
         OR v_miktar = 'Infinity'::numeric
         OR v_miktar = '-Infinity'::numeric
         OR v_miktar <= 0
         OR v_miktar > 999999999999.999
         OR v_miktar IS DISTINCT FROM pg_catalog.round(v_miktar, 3)
         OR (
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
         ) THEN
        RAISE EXCEPTION 'ISLEM_LEGACY_PRODUCT_INVALID_INPUT'
          USING ERRCODE = '22023';
      END IF;
    END LOOP;

    SELECT
      pg_catalog.count(*),
      pg_catalog.count(
        DISTINCT (item.value->>'urun_id')::uuid
      ),
      COALESCE(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'urun_id', (item.value->>'urun_id')::uuid,
            'hareket_tipi', item.value->>'hareket_tipi',
            'miktar', (item.value->>'miktar')::numeric,
            'birim_fiyat', COALESCE(
              (item.value->>'birim_fiyat')::numeric,
              0::numeric
            ),
            'kdv_orani', COALESCE(
              (item.value->>'kdv_orani')::integer,
              0
            ),
            'aciklama', NULLIF(
              pg_catalog.btrim(item.value->>'aciklama'),
              ''
            )
          )
          ORDER BY (item.value->>'urun_id')::uuid
        ),
        '[]'::jsonb
      )
    INTO
      v_item_count,
      v_distinct_product_count,
      v_payload_items
    FROM pg_catalog.jsonb_array_elements(v_items) AS item(value);

    IF v_item_count IS DISTINCT FROM v_distinct_product_count THEN
      RAISE EXCEPTION 'ISLEM_LEGACY_PRODUCT_INVALID_INPUT'
        USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'urun_id', movement.urun_id,
          'hareket_tipi', movement.hareket_tipi::text,
          'miktar', movement.miktar,
          'birim_fiyat', COALESCE(movement.birim_fiyat, 0::numeric),
          'kdv_orani', COALESCE(movement.kdv_orani, 0),
          'aciklama', NULLIF(
            pg_catalog.btrim(movement.aciklama),
            ''
          )
        )
        ORDER BY movement.urun_id, movement.id
      ),
      '[]'::jsonb
    )
    INTO v_existing_items
    FROM public.urun_hareketler AS movement
    WHERE movement.isletme_id = p_isletme_id
      AND movement.islem_id = v_islem_id;

    IF pg_catalog.jsonb_array_length(v_existing_items) = 0
       OR v_existing_items IS DISTINCT FROM v_payload_items THEN
      RAISE EXCEPTION 'ISLEM_LEGACY_PRODUCT_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;

    RETURN v_result;
  END IF;

  -- A genuinely new create keeps the strict V3 validation and stock write.
  PERFORM internal.reapply_cari_urun_items_v3(
    p_isletme_id,
    v_islem_id,
    v_items,
    v_type,
    'create'
  );$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'PRODUCT_CREATE_V3_IDEMPOTENCY_BODY_DRIFT';
  END IF;

  EXECUTE v_def;

  SELECT pg_catalog.pg_get_functiondef(
    'internal.enforce_linked_product_movement_permission_v1()'::regprocedure
  )
  INTO v_def;

  v_before := v_def;
  v_def := pg_catalog.replace(
    v_def,
    $old$      AND product.is_archived IS FALSE
      AND (
        product.is_active IS TRUE
        OR internal.isletme_sahibi_v1(NEW.isletme_id)
      )$old$,
    $new$      AND (
        (
          product.is_archived IS FALSE
          AND (
            product.is_active IS TRUE
            OR internal.isletme_sahibi_v1(NEW.isletme_id)
          )
        )
        OR (
          product.is_archived IS TRUE
          AND internal.isletme_sahibi_v1(NEW.isletme_id)
          AND NEW.islem_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM internal.permission_v2_movement_action_context
              AS archived_action_context
            WHERE archived_action_context.backend_pid =
                  pg_catalog.pg_backend_pid()
              AND archived_action_context.transaction_id =
                  pg_catalog.txid_current()
              AND archived_action_context.actor_user_id = auth.uid()
              AND archived_action_context.isletme_id = NEW.isletme_id
              AND archived_action_context.islem_id = NEW.islem_id
              AND archived_action_context.action = 'update'
          )
          AND EXISTS (
            SELECT 1
            FROM internal.product_edit_v3_history_context
              AS archived_history_context
            WHERE archived_history_context.backend_pid =
                  pg_catalog.pg_backend_pid()
              AND archived_history_context.transaction_id =
                  pg_catalog.txid_current()
              AND archived_history_context.actor_user_id = auth.uid()
              AND archived_history_context.isletme_id = NEW.isletme_id
              AND archived_history_context.islem_id = NEW.islem_id
              AND archived_history_context.urun_id = NEW.urun_id
          )
        )
      )$new$
  );
  IF v_def IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION
      'PRODUCT_EDIT_V3_HISTORY_LINKED_TRIGGER_ARCHIVE_GATE_DRIFT';
  END IF;

  EXECUTE v_def;
END;
$patch$;

ALTER FUNCTION internal.reapply_cari_urun_items_v3(
  uuid, uuid, jsonb, text, text
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.reapply_cari_urun_items_v3(
  uuid, uuid, jsonb, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.update_cari_urunlu_islem_atomik_v3(
  uuid, uuid, jsonb, jsonb
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.update_cari_urunlu_islem_atomik_v3(
  uuid, uuid, jsonb, jsonb
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.update_cari_urunlu_islem_atomik_v3(
  uuid, uuid, jsonb, jsonb
)
TO authenticated;

ALTER FUNCTION public.create_islem_with_urun_atomik(
  uuid, jsonb, jsonb, jsonb
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.create_islem_with_urun_atomik(
  uuid, jsonb, jsonb, jsonb
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.create_islem_with_urun_atomik(
  uuid, jsonb, jsonb, jsonb
)
TO authenticated;

ALTER FUNCTION internal.enforce_linked_product_movement_permission_v1()
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.enforce_linked_product_movement_permission_v1()
FROM PUBLIC, anon, authenticated, service_role;

DO $verify$
DECLARE
  v_reapply_def text;
  v_update_def text;
  v_create_def text;
  v_trigger_def text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'internal.reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)'::regprocedure
  )
  INTO v_reapply_def;
  SELECT pg_catalog.pg_get_functiondef(
    'public.update_cari_urunlu_islem_atomik_v3(uuid,uuid,jsonb,jsonb)'::regprocedure
  )
  INTO v_update_def;
  SELECT pg_catalog.pg_get_functiondef(
    'public.create_islem_with_urun_atomik(uuid,jsonb,jsonb,jsonb)'::regprocedure
  )
  INTO v_create_def;
  SELECT pg_catalog.pg_get_functiondef(
    'internal.enforce_linked_product_movement_permission_v1()'::regprocedure
  )
  INTO v_trigger_def;

  IF v_reapply_def NOT LIKE '%v_existing_ids uuid[];%'
     OR v_reapply_def NOT LIKE '%v_is_owner boolean;%'
     OR v_reapply_def NOT LIKE
       '%p_authorization_action = ''update''%product.id = ANY(v_existing_ids)%'
     OR v_reapply_def NOT LIKE
       '%internal.product_edit_v3_history_context%'
     OR v_update_def NOT LIKE
       '%jsonb_array_length(p_items) <> 0 THEN%'
     OR v_update_def NOT LIKE
       '%ELSIF pg_catalog.jsonb_array_length(p_items) <> 0 THEN%'
     OR v_update_def NOT LIKE
       '%INSERT INTO internal.product_edit_v3_history_context%'
     OR v_update_def NOT LIKE
       '%DELETE FROM internal.product_edit_v3_history_context%'
     OR v_update_def NOT LIKE
       '%IF v_old.type::text IN (%'
     OR v_update_def NOT LIKE
       '%unexpected_movement.islem_id = p_islem_id%'
     OR v_create_def NOT LIKE
       '%pg_advisory_xact_lock%'
     OR v_create_def NOT LIKE
       '%v_existed_before := FOUND%'
     OR v_create_def NOT LIKE
       '%ISLEM_LEGACY_PRODUCT_IDEMPOTENCY_CONFLICT%'
     OR v_create_def NOT LIKE
       '%RETURN v_result;%'
     OR v_create_def NOT LIKE
       '%internal.kayit_mutasyon_izni_v1(%''urunler''%'
     OR v_create_def NOT LIKE
       '%PERFORM internal.reapply_cari_urun_items_v3(%v_items%''create''%'
     OR v_create_def NOT LIKE
       '%''birim_fiyat'', COALESCE(%movement.birim_fiyat%'
     OR v_create_def NOT LIKE
       '%''kdv_orani'', COALESCE(%movement.kdv_orani%'
     OR v_reapply_def NOT LIKE
       '%v_birim_fiyat := COALESCE(%0::numeric%'
     OR v_reapply_def NOT LIKE
       '%v_kdv := COALESCE(%0%'
     OR v_trigger_def NOT LIKE
       '%product.is_archived IS TRUE%'
     OR v_trigger_def NOT LIKE
       '%archived_action_context.action = ''update''%'
     OR v_trigger_def NOT LIKE
       '%archived_history_context.urun_id = NEW.urun_id%'
     OR v_trigger_def NOT LIKE
       '%OR NEW.birim_fiyat IS NULL%OR NEW.kdv_orani IS NULL%' THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_POSTCONDITION_FAILED';
  END IF;

  IF pg_catalog.has_function_privilege(
       'anon',
       'public.update_cari_urunlu_islem_atomik_v3(uuid,uuid,jsonb,jsonb)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'public.update_cari_urunlu_islem_atomik_v3(uuid,uuid,jsonb,jsonb)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'internal.reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.create_islem_with_urun_atomik(uuid,jsonb,jsonb,jsonb)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'public.create_islem_with_urun_atomik(uuid,jsonb,jsonb,jsonb)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'internal.enforce_linked_product_movement_permission_v1()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'internal.enforce_linked_product_movement_permission_v1()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'internal.enforce_linked_product_movement_permission_v1()',
       'EXECUTE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS trigger_procedure
       WHERE trigger_procedure.oid = (
         'internal.enforce_linked_product_movement_permission_v1()'
       )::pg_catalog.regprocedure
         AND (
           trigger_procedure.prosecdef IS NOT TRUE
           OR trigger_procedure.provolatile IS DISTINCT FROM 'v'
           OR NOT (
             COALESCE(
               trigger_procedure.proconfig,
               ARRAY[]::text[]
             ) @> ARRAY['search_path=""']::text[]
           )
           OR trigger_procedure.proowner IS DISTINCT FROM
              'postgres'::pg_catalog.regrole
         )
     ) THEN
    RAISE EXCEPTION 'PRODUCT_EDIT_V3_HISTORY_PRIVILEGE_POSTCONDITION_FAILED';
  END IF;
END;
$verify$;

COMMIT;
