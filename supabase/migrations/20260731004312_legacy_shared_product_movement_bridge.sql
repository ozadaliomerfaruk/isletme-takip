-- =============================================================================
-- LEGACY 1.5.x SHARED PRODUCT MOVEMENT BRIDGE
-- =============================================================================
-- Released clients created a product movement in two HTTP requests:
--   1) update_urun_miktar(delta)
--   2) INSERT urun_hareketler
--
-- Permission Contract V2 correctly made that unsafe delta RPC owner-only, since
-- request 2 could fail after request 1 committed. That also blocked released
-- shared users who had both Cari and Products create permission.
--
-- This compatibility bridge does NOT reopen the two-write hole:
--   * owner behavior remains byte-for-byte equivalent;
--   * a shared caller's legacy delta call only stages a private, short-lived
--     intent and returns the projected stock;
--   * the matching linked movement INSERT consumes that intent, updates stock,
--     and inserts the movement in the INSERT statement's own transaction;
--   * an unmatched/expired/raw INSERT still fails closed;
--   * the released client's compensating opposite delta cancels the intent.
--
-- DATA SAFETY
--   * no user row is updated, deleted, backfilled, or rewritten by migration;
--   * no public signature/result type changes;
--   * only private tables/functions/triggers and one restrictive policy
--     expression are added/altered.
--
-- OLD CLIENT EFFECT
--   * owner 1.5.x: unchanged;
--   * shared 1.5.x with Cari + Products create permission: linked product
--     purchase/sale creation works without partial stock;
--   * shared direct movement INSERT without a matching staged delta: blocked.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';

DO $precondition$
DECLARE
  v_update_definition text;
  v_insert_policy text;
  v_update_function pg_catalog.pg_proc;
BEGIN
  IF pg_catalog.to_regclass(
       'internal.legacy_shared_product_delta_intents_v1'
     ) IS NOT NULL
     OR pg_catalog.to_regclass(
       'internal.legacy_shared_product_insert_context_v1'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'internal.stage_legacy_shared_product_delta_v1(uuid,uuid,numeric)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'internal.legacy_shared_product_insert_policy_allowed_v1(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'internal.bridge_legacy_shared_product_insert_v1()'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'internal.cleanup_legacy_shared_product_insert_v1()'
     ) IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger AS trigger_row
       WHERE trigger_row.tgname IN (
         'trg_00_legacy_shared_product_insert_v1',
         'trg_zz_legacy_shared_product_insert_cleanup_v1'
       )
         AND NOT trigger_row.tgisinternal
     )
     OR pg_catalog.to_regclass('public.urunler') IS NULL
     OR pg_catalog.to_regclass('public.urun_hareketler') IS NULL
     OR pg_catalog.to_regclass('public.islemler') IS NULL
     OR pg_catalog.to_regclass(
       'internal.permission_v2_movement_action_context'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.isletme_sahibi_v1(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.kayit_mutasyon_izni_v1(uuid,text,uuid,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.islem_tipi_modulu(text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.update_urun_miktar(uuid,numeric,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.enforce_linked_product_movement_permission_v1()'
     ) IS NULL THEN
    RAISE EXCEPTION 'LEGACY_SHARED_PRODUCT_BRIDGE_SCHEMA_PRECONDITION_FAILED';
  END IF;

  SELECT procedure_row.*
  INTO v_update_function
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = (
    'public.update_urun_miktar(uuid,numeric,uuid)'
  )::pg_catalog.regprocedure;

  SELECT pg_catalog.pg_get_functiondef(v_update_function.oid)
  INTO v_update_definition;

  IF v_update_function.prosecdef IS NOT TRUE
     OR v_update_function.provolatile IS DISTINCT FROM 'v'
     OR pg_catalog.pg_get_userbyid(v_update_function.proowner)
        IS DISTINCT FROM 'postgres'
     OR NOT (
       COALESCE(v_update_function.proconfig, ARRAY[]::text[])
       @> ARRAY['search_path=""']::text[]
     )
     OR pg_catalog.strpos(
       v_update_definition,
       'OR NOT internal.isletme_sahibi_v1(p_isletme_id)'
     ) = 0
     OR pg_catalog.strpos(
       v_update_definition,
       'PRODUCT_STOCK_DELTA_NOT_AUTHORIZED'
     ) = 0 THEN
    RAISE EXCEPTION 'LEGACY_SHARED_PRODUCT_BRIDGE_UPDATE_RPC_DRIFT';
  END IF;

  SELECT policy_row.with_check
  INTO v_insert_policy
  FROM pg_catalog.pg_policies AS policy_row
  WHERE policy_row.schemaname = 'public'
    AND policy_row.tablename = 'urun_hareketler'
    AND policy_row.policyname =
      'Permission v2 direct insert urun hareketleri owner only'
    AND policy_row.permissive = 'RESTRICTIVE'
    AND policy_row.cmd = 'INSERT';

  IF v_insert_policy IS DISTINCT FROM
       'internal.isletme_sahibi_v1(isletme_id)' THEN
    RAISE EXCEPTION 'LEGACY_SHARED_PRODUCT_BRIDGE_INSERT_POLICY_DRIFT';
  END IF;

END;
$precondition$;

CREATE TABLE internal.legacy_shared_product_delta_intents_v1 (
  actor_user_id uuid NOT NULL,
  isletme_id uuid NOT NULL,
  urun_id uuid NOT NULL,
  previous_quantity numeric NOT NULL,
  delta numeric NOT NULL,
  expected_quantity numeric NOT NULL,
  staged_at timestamp with time zone NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT legacy_shared_product_delta_intents_v1_pkey
    PRIMARY KEY (actor_user_id, isletme_id, urun_id),
  CONSTRAINT legacy_shared_product_delta_intents_v1_shape_check
    CHECK (
      delta <> 0
      AND delta = pg_catalog.round(delta, 3)
      AND expected_quantity = previous_quantity + delta
      AND expires_at > staged_at
    )
);

CREATE INDEX legacy_shared_product_delta_intents_v1_expiry_idx
ON internal.legacy_shared_product_delta_intents_v1 (expires_at);

CREATE TABLE internal.legacy_shared_product_insert_context_v1 (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  actor_user_id uuid NOT NULL,
  movement_id uuid NOT NULL,
  isletme_id uuid NOT NULL,
  urun_id uuid NOT NULL,
  islem_id uuid NOT NULL,
  CONSTRAINT legacy_shared_product_insert_context_v1_pkey
    PRIMARY KEY (
      backend_pid,
      transaction_id,
      actor_user_id,
      movement_id
    )
);

ALTER TABLE internal.legacy_shared_product_delta_intents_v1
  OWNER TO postgres;
ALTER TABLE internal.legacy_shared_product_insert_context_v1
  OWNER TO postgres;

REVOKE ALL
ON TABLE internal.legacy_shared_product_delta_intents_v1
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL
ON TABLE internal.legacy_shared_product_insert_context_v1
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION internal.stage_legacy_shared_product_delta_v1(
  p_isletme_id uuid,
  p_urun_id uuid,
  p_delta numeric
)
RETURNS numeric
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_current_quantity numeric;
  v_expected_quantity numeric;
  v_existing internal.legacy_shared_product_delta_intents_v1;
BEGIN
  IF v_uid IS NULL
     OR p_isletme_id IS NULL
     OR p_urun_id IS NULL
     OR p_delta IS NULL
     OR p_delta = 'NaN'::numeric
     OR p_delta = 'Infinity'::numeric
     OR p_delta = '-Infinity'::numeric
     OR p_delta IS DISTINCT FROM pg_catalog.round(p_delta, 3)
     OR pg_catalog.abs(p_delta) > 999999999999.999
     OR NOT internal.kayit_mutasyon_izni_v1(
       p_isletme_id,
       'urunler',
       v_uid,
       'create'
     ) THEN
    RAISE EXCEPTION 'PRODUCT_STOCK_DELTA_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'legacy-shared-product-delta:'
      || v_uid::text
      || ':'
      || p_isletme_id::text
      || ':'
      || p_urun_id::text,
      0
    )
  );

  SELECT COALESCE(product.miktar, 0)
  INTO v_current_quantity
  FROM public.urunler AS product
  WHERE product.id = p_urun_id
    AND product.isletme_id = p_isletme_id
    AND product.is_active IS TRUE
    AND product.is_archived IS FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_STOCK_DELTA_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM internal.legacy_shared_product_delta_intents_v1 AS intent
  WHERE intent.expires_at <= pg_catalog.clock_timestamp();

  SELECT intent.*
  INTO v_existing
  FROM internal.legacy_shared_product_delta_intents_v1 AS intent
  WHERE intent.actor_user_id = v_uid
    AND intent.isletme_id = p_isletme_id
    AND intent.urun_id = p_urun_id
  FOR UPDATE;

  -- Released clients compensate a failed movement INSERT by sending the exact
  -- opposite delta. Since the shared path never changed stock, cancel only the
  -- matching pending intent and report the unchanged current quantity.
  IF FOUND
     AND v_existing.expires_at > pg_catalog.clock_timestamp()
     AND v_existing.previous_quantity = v_current_quantity
     AND v_existing.delta = -p_delta THEN
    DELETE FROM internal.legacy_shared_product_delta_intents_v1 AS intent
    WHERE intent.actor_user_id = v_uid
      AND intent.isletme_id = p_isletme_id
      AND intent.urun_id = p_urun_id;
    RETURN v_current_quantity;
  END IF;

  IF p_delta = 0 THEN
    DELETE FROM internal.legacy_shared_product_delta_intents_v1 AS intent
    WHERE intent.actor_user_id = v_uid
      AND intent.isletme_id = p_isletme_id
      AND intent.urun_id = p_urun_id;
    RETURN v_current_quantity;
  END IF;

  v_expected_quantity := v_current_quantity + p_delta;
  IF v_expected_quantity = 'NaN'::numeric
     OR v_expected_quantity = 'Infinity'::numeric
     OR v_expected_quantity = '-Infinity'::numeric
     OR pg_catalog.abs(v_expected_quantity) > 999999999999.999 THEN
    RAISE EXCEPTION 'PRODUCT_STOCK_DELTA_NOT_AUTHORIZED'
      USING ERRCODE = '22003';
  END IF;

  INSERT INTO internal.legacy_shared_product_delta_intents_v1 (
    actor_user_id,
    isletme_id,
    urun_id,
    previous_quantity,
    delta,
    expected_quantity,
    staged_at,
    expires_at
  )
  VALUES (
    v_uid,
    p_isletme_id,
    p_urun_id,
    v_current_quantity,
    p_delta,
    v_expected_quantity,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp() + INTERVAL '90 seconds'
  )
  ON CONFLICT (actor_user_id, isletme_id, urun_id)
  DO UPDATE
  SET previous_quantity = EXCLUDED.previous_quantity,
      delta = EXCLUDED.delta,
      expected_quantity = EXCLUDED.expected_quantity,
      staged_at = EXCLUDED.staged_at,
      expires_at = EXCLUDED.expires_at;

  RETURN v_expected_quantity;
END;
$function$;

CREATE FUNCTION internal.legacy_shared_product_insert_policy_allowed_v1(
  p_movement_id uuid,
  p_isletme_id uuid,
  p_urun_id uuid,
  p_islem_id uuid,
  p_hareket_tipi text,
  p_miktar numeric,
  p_onceki_miktar numeric,
  p_yeni_miktar numeric
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_transaction public.islemler;
  v_current_quantity numeric;
  v_expected_movement text;
  v_delta numeric;
  v_intent internal.legacy_shared_product_delta_intents_v1;
  v_modules text[];
  v_module text;
BEGIN
  IF v_uid IS NULL
     OR p_movement_id IS NULL
     OR p_isletme_id IS NULL
     OR p_urun_id IS NULL
     OR p_islem_id IS NULL
     OR p_hareket_tipi NOT IN ('giris', 'cikis')
     OR p_miktar IS NULL
     OR p_miktar <= 0
     OR p_miktar IS DISTINCT FROM pg_catalog.round(p_miktar, 3)
     OR p_onceki_miktar IS NULL
     OR p_yeni_miktar IS NULL
     OR NOT internal.kayit_mutasyon_izni_v1(
       p_isletme_id,
       'urunler',
       v_uid,
       'create'
     ) THEN
    RETURN FALSE;
  END IF;

  SELECT transaction_row.*
  INTO v_transaction
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = p_islem_id
    AND transaction_row.isletme_id = p_isletme_id
    AND transaction_row.created_by = v_uid
    AND transaction_row.created_at
        >= pg_catalog.clock_timestamp() - INTERVAL '10 minutes';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_expected_movement := CASE
    WHEN v_transaction.type::text IN (
      'gider', 'cari_alis', 'cari_satis_iade'
    ) THEN 'giris'
    WHEN v_transaction.type::text IN (
      'gelir', 'cari_satis', 'cari_alis_iade', 'personel_satis'
    ) THEN 'cikis'
    ELSE NULL
  END;

  IF v_expected_movement IS NULL
     OR p_hareket_tipi IS DISTINCT FROM v_expected_movement THEN
    RETURN FALSE;
  END IF;

  v_modules := internal.islem_tipi_modulu(v_transaction.type::text);
  IF v_modules IS NULL THEN
    RETURN FALSE;
  END IF;

  FOREACH v_module IN ARRAY v_modules LOOP
    IF NOT internal.kayit_mutasyon_izni_v1(
      p_isletme_id,
      v_module,
      v_uid,
      'create'
    ) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  SELECT COALESCE(product.miktar, 0)
  INTO v_current_quantity
  FROM public.urunler AS product
  WHERE product.id = p_urun_id
    AND product.isletme_id = p_isletme_id
    AND product.is_active IS TRUE
    AND product.is_archived IS FALSE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_delta := CASE p_hareket_tipi
    WHEN 'giris' THEN pg_catalog.abs(p_miktar)
    ELSE -pg_catalog.abs(p_miktar)
  END;

  SELECT intent.*
  INTO v_intent
  FROM internal.legacy_shared_product_delta_intents_v1 AS intent
  WHERE intent.actor_user_id = v_uid
    AND intent.isletme_id = p_isletme_id
    AND intent.urun_id = p_urun_id
    AND intent.expires_at > pg_catalog.clock_timestamp();

  RETURN FOUND
    AND v_intent.previous_quantity IS NOT DISTINCT FROM v_current_quantity
    AND v_intent.delta IS NOT DISTINCT FROM v_delta
    AND v_intent.expected_quantity
        IS NOT DISTINCT FROM v_current_quantity + v_delta
    AND p_onceki_miktar IS NOT DISTINCT FROM v_current_quantity
    AND p_yeni_miktar IS NOT DISTINCT FROM v_current_quantity + v_delta;
END;
$function$;

CREATE FUNCTION internal.bridge_legacy_shared_product_insert_v1()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_transaction public.islemler;
  v_current_quantity numeric;
  v_delta numeric;
  v_expected_movement text;
  v_intent internal.legacy_shared_product_delta_intents_v1;
  v_modules text[];
  v_module text;
BEGIN
  IF v_uid IS NULL
     OR NEW.islem_id IS NULL
     OR internal.isletme_sahibi_v1(NEW.isletme_id) THEN
    RETURN NEW;
  END IF;

  -- Canonical V2/V3 RPCs already opened an exact transaction-local context and
  -- already applied stock. Never double-apply their INSERT.
  IF EXISTS (
    SELECT 1
    FROM internal.permission_v2_movement_action_context AS action_context
    WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
      AND action_context.transaction_id = pg_catalog.txid_current()
      AND action_context.actor_user_id = v_uid
      AND action_context.isletme_id = NEW.isletme_id
      AND action_context.islem_id = NEW.islem_id
      AND action_context.action IN ('create', 'update')
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS NULL
     OR NEW.urun_id IS NULL
     OR NEW.created_by IS DISTINCT FROM v_uid
     OR NEW.hareket_tipi NOT IN ('giris', 'cikis')
     OR NEW.miktar IS NULL
     OR NEW.miktar <= 0
     OR NEW.miktar IS DISTINCT FROM pg_catalog.round(NEW.miktar, 3)
     OR NEW.onceki_miktar IS NULL
     OR NEW.yeni_miktar IS NULL
     OR NOT internal.kayit_mutasyon_izni_v1(
       NEW.isletme_id,
       'urunler',
       v_uid,
       'create'
     ) THEN
    RAISE EXCEPTION 'PRODUCT_MOVEMENT_CANONICAL_RPC_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  SELECT transaction_row.*
  INTO v_transaction
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = NEW.islem_id
    AND transaction_row.isletme_id = NEW.isletme_id
    AND transaction_row.created_by = v_uid
    AND transaction_row.created_at
        >= pg_catalog.clock_timestamp() - INTERVAL '10 minutes'
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_MOVEMENT_CANONICAL_RPC_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  v_expected_movement := CASE
    WHEN v_transaction.type::text IN (
      'gider', 'cari_alis', 'cari_satis_iade'
    ) THEN 'giris'
    WHEN v_transaction.type::text IN (
      'gelir', 'cari_satis', 'cari_alis_iade', 'personel_satis'
    ) THEN 'cikis'
    ELSE NULL
  END;

  IF v_expected_movement IS NULL
     OR NEW.hareket_tipi IS DISTINCT FROM v_expected_movement THEN
    RAISE EXCEPTION 'PRODUCT_MOVEMENT_CANONICAL_RPC_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  v_modules := internal.islem_tipi_modulu(v_transaction.type::text);
  IF v_modules IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_MOVEMENT_CANONICAL_RPC_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  FOREACH v_module IN ARRAY v_modules LOOP
    IF NOT internal.kayit_mutasyon_izni_v1(
      NEW.isletme_id,
      v_module,
      v_uid,
      'create'
    ) THEN
      RAISE EXCEPTION 'PRODUCT_MOVEMENT_CANONICAL_RPC_REQUIRED'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  v_delta := CASE NEW.hareket_tipi
    WHEN 'giris' THEN pg_catalog.abs(NEW.miktar)
    ELSE -pg_catalog.abs(NEW.miktar)
  END;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'legacy-shared-product-delta:'
      || v_uid::text
      || ':'
      || NEW.isletme_id::text
      || ':'
      || NEW.urun_id::text,
      0
    )
  );

  SELECT COALESCE(product.miktar, 0)
  INTO v_current_quantity
  FROM public.urunler AS product
  WHERE product.id = NEW.urun_id
    AND product.isletme_id = NEW.isletme_id
    AND product.is_active IS TRUE
    AND product.is_archived IS FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_MOVEMENT_CANONICAL_RPC_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  SELECT intent.*
  INTO v_intent
  FROM internal.legacy_shared_product_delta_intents_v1 AS intent
  WHERE intent.actor_user_id = v_uid
    AND intent.isletme_id = NEW.isletme_id
    AND intent.urun_id = NEW.urun_id
    AND intent.expires_at > pg_catalog.clock_timestamp()
  FOR UPDATE;

  IF NOT FOUND
     OR v_intent.previous_quantity IS DISTINCT FROM v_current_quantity
     OR v_intent.delta IS DISTINCT FROM v_delta
     OR v_intent.expected_quantity
        IS DISTINCT FROM v_current_quantity + v_delta
     OR NEW.onceki_miktar IS DISTINCT FROM v_current_quantity
     OR NEW.yeni_miktar
        IS DISTINCT FROM v_current_quantity + v_delta THEN
    RAISE EXCEPTION 'PRODUCT_MOVEMENT_CANONICAL_RPC_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM internal.legacy_shared_product_delta_intents_v1 AS intent
  WHERE intent.actor_user_id = v_uid
    AND intent.isletme_id = NEW.isletme_id
    AND intent.urun_id = NEW.urun_id;

  UPDATE public.urunler AS product
  SET miktar = v_intent.expected_quantity,
      updated_at = pg_catalog.clock_timestamp()
  WHERE product.id = NEW.urun_id
    AND product.isletme_id = NEW.isletme_id;

  INSERT INTO internal.permission_v2_movement_action_context (
    backend_pid,
    transaction_id,
    actor_user_id,
    isletme_id,
    islem_id,
    action
  )
  VALUES (
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current(),
    v_uid,
    NEW.isletme_id,
    NEW.islem_id,
    'create'
  )
  ON CONFLICT (
    backend_pid,
    transaction_id,
    actor_user_id,
    isletme_id,
    islem_id
  )
  DO UPDATE SET action = 'create';

  INSERT INTO internal.legacy_shared_product_insert_context_v1 (
    backend_pid,
    transaction_id,
    actor_user_id,
    movement_id,
    isletme_id,
    urun_id,
    islem_id
  )
  VALUES (
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current(),
    v_uid,
    NEW.id,
    NEW.isletme_id,
    NEW.urun_id,
    NEW.islem_id
  );

  RETURN NEW;
END;
$function$;

CREATE FUNCTION internal.cleanup_legacy_shared_product_insert_v1()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_context_count integer;
BEGIN
  DELETE FROM internal.legacy_shared_product_insert_context_v1 AS context_row
  WHERE context_row.backend_pid = pg_catalog.pg_backend_pid()
    AND context_row.transaction_id = pg_catalog.txid_current()
    AND context_row.actor_user_id = auth.uid()
    AND context_row.movement_id = NEW.id
    AND context_row.isletme_id = NEW.isletme_id
    AND context_row.urun_id = NEW.urun_id
    AND context_row.islem_id = NEW.islem_id;

  GET DIAGNOSTICS v_context_count = ROW_COUNT;
  IF v_context_count > 0 THEN
    DELETE FROM internal.permission_v2_movement_action_context AS action_context
    WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
      AND action_context.transaction_id = pg_catalog.txid_current()
      AND action_context.actor_user_id = auth.uid()
      AND action_context.isletme_id = NEW.isletme_id
      AND action_context.islem_id = NEW.islem_id
      AND action_context.action = 'create';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_urun_miktar(
  p_urun_id uuid,
  p_miktar_degisim numeric,
  p_isletme_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_yeni_miktar numeric;
BEGIN
  IF auth.uid() IS NULL
     OR p_isletme_id IS NULL
     OR p_urun_id IS NULL
     OR p_miktar_degisim IS NULL
     OR p_miktar_degisim = 'NaN'::numeric
     OR p_miktar_degisim = 'Infinity'::numeric
     OR p_miktar_degisim = '-Infinity'::numeric
     OR pg_catalog.abs(p_miktar_degisim) > 999999999999.999
     OR NOT internal.kayit_mutasyon_izni_v1(
       p_isletme_id,
       'urunler',
       auth.uid(),
       'create'
     ) THEN
    RAISE EXCEPTION 'PRODUCT_STOCK_DELTA_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF NOT internal.isletme_sahibi_v1(p_isletme_id) THEN
    RETURN internal.stage_legacy_shared_product_delta_v1(
      p_isletme_id,
      p_urun_id,
      p_miktar_degisim
    );
  END IF;

  -- Preserve the released owner path exactly: the legacy RPC still applies the
  -- delta immediately and the owner's direct movement INSERT remains unchanged.
  UPDATE public.urunler AS product
  SET miktar = COALESCE(product.miktar, 0) + p_miktar_degisim,
      updated_at = pg_catalog.clock_timestamp()
  WHERE product.id = p_urun_id
    AND product.isletme_id = p_isletme_id
  RETURNING product.miktar INTO v_yeni_miktar;

  IF v_yeni_miktar IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_STOCK_DELTA_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_yeni_miktar;
END;
$function$;

ALTER FUNCTION internal.stage_legacy_shared_product_delta_v1(
  uuid, uuid, numeric
) OWNER TO postgres;
ALTER FUNCTION internal.legacy_shared_product_insert_policy_allowed_v1(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric
) OWNER TO postgres;
ALTER FUNCTION internal.bridge_legacy_shared_product_insert_v1()
  OWNER TO postgres;
ALTER FUNCTION internal.cleanup_legacy_shared_product_insert_v1()
  OWNER TO postgres;
ALTER FUNCTION public.update_urun_miktar(uuid, numeric, uuid)
  OWNER TO postgres;

REVOKE ALL
ON FUNCTION internal.stage_legacy_shared_product_delta_v1(
  uuid, uuid, numeric
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL
ON FUNCTION internal.legacy_shared_product_insert_policy_allowed_v1(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric
)
FROM PUBLIC, anon, authenticated, service_role;
-- PostgreSQL checks EXECUTE on functions referenced by an RLS policy as the
-- calling API role. The helper is read-only, SECURITY DEFINER, and returns true
-- only for the caller's exact fresh transaction, product, quantities and
-- private staged intent; granting authenticated cannot manufacture an allowance.
GRANT EXECUTE
ON FUNCTION internal.legacy_shared_product_insert_policy_allowed_v1(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric
)
TO authenticated;
REVOKE ALL
ON FUNCTION internal.bridge_legacy_shared_product_insert_v1()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL
ON FUNCTION internal.cleanup_legacy_shared_product_insert_v1()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL
ON FUNCTION public.update_urun_miktar(uuid, numeric, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.update_urun_miktar(uuid, numeric, uuid)
TO authenticated;

CREATE TRIGGER trg_00_legacy_shared_product_insert_v1
BEFORE INSERT ON public.urun_hareketler
FOR EACH ROW
WHEN (NEW.islem_id IS NOT NULL)
EXECUTE FUNCTION internal.bridge_legacy_shared_product_insert_v1();

CREATE TRIGGER trg_zz_legacy_shared_product_insert_cleanup_v1
AFTER INSERT ON public.urun_hareketler
FOR EACH ROW
WHEN (NEW.islem_id IS NOT NULL)
EXECUTE FUNCTION internal.cleanup_legacy_shared_product_insert_v1();

ALTER POLICY "Permission v2 direct insert urun hareketleri owner only"
ON public.urun_hareketler
WITH CHECK (
  internal.isletme_sahibi_v1(urun_hareketler.isletme_id)
  OR internal.legacy_shared_product_insert_policy_allowed_v1(
    urun_hareketler.id,
    urun_hareketler.isletme_id,
    urun_hareketler.urun_id,
    urun_hareketler.islem_id,
    urun_hareketler.hareket_tipi,
    urun_hareketler.miktar,
    urun_hareketler.onceki_miktar,
    urun_hareketler.yeni_miktar
  )
);

COMMENT ON FUNCTION public.update_urun_miktar(uuid, numeric, uuid) IS
  'Legacy stock delta adapter: owner applies immediately; shared product-create actors stage a private linked-movement intent.';
COMMENT ON FUNCTION internal.stage_legacy_shared_product_delta_v1(
  uuid, uuid, numeric
) IS
  'Stages or cancels the short-lived shared legacy stock intent without changing stock.';
COMMENT ON FUNCTION internal.bridge_legacy_shared_product_insert_v1() IS
  'Consumes an exact shared legacy linked-movement intent and applies stock inside the movement INSERT transaction.';

DO $postcondition$
DECLARE
  v_policy text;
  v_update_definition text;
  v_function pg_catalog.pg_proc;
  v_signature text;
BEGIN
  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'public.urun_hareketler'::regclass
      AND trigger_row.tgname IN (
        'trg_00_legacy_shared_product_insert_v1',
        'trg_zz_legacy_shared_product_insert_cleanup_v1'
      )
      AND NOT trigger_row.tgisinternal
  ) <> 2 THEN
    RAISE EXCEPTION 'LEGACY_SHARED_PRODUCT_BRIDGE_TRIGGER_POSTCONDITION_FAILED';
  END IF;

  SELECT policy_row.with_check
  INTO v_policy
  FROM pg_catalog.pg_policies AS policy_row
  WHERE policy_row.schemaname = 'public'
    AND policy_row.tablename = 'urun_hareketler'
    AND policy_row.policyname =
      'Permission v2 direct insert urun hareketleri owner only';

  IF v_policy NOT LIKE
       '%internal.legacy_shared_product_insert_policy_allowed_v1%'
     OR v_policy NOT LIKE '%internal.isletme_sahibi_v1%' THEN
    RAISE EXCEPTION 'LEGACY_SHARED_PRODUCT_BRIDGE_POLICY_POSTCONDITION_FAILED';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'internal.stage_legacy_shared_product_delta_v1(uuid,uuid,numeric)',
    'internal.bridge_legacy_shared_product_insert_v1()',
    'internal.cleanup_legacy_shared_product_insert_v1()'
  ]::text[] LOOP
    SELECT procedure_row.*
    INTO v_function
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.oid = v_signature::pg_catalog.regprocedure;

    IF v_function.prosecdef IS NOT TRUE
       OR pg_catalog.pg_get_userbyid(v_function.proowner)
          IS DISTINCT FROM 'postgres'
       OR NOT (
         COALESCE(v_function.proconfig, ARRAY[]::text[])
         @> ARRAY['search_path=""']::text[]
       )
       OR pg_catalog.has_function_privilege(
         'anon', v_signature, 'EXECUTE'
       )
       OR pg_catalog.has_function_privilege(
         'authenticated', v_signature, 'EXECUTE'
       )
       OR pg_catalog.has_function_privilege(
         'service_role', v_signature, 'EXECUTE'
       ) THEN
      RAISE EXCEPTION
        'LEGACY_SHARED_PRODUCT_BRIDGE_INTERNAL_ACL_POSTCONDITION_FAILED: %',
        v_signature;
    END IF;
  END LOOP;

  v_signature :=
    'internal.legacy_shared_product_insert_policy_allowed_v1(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)';
  SELECT procedure_row.*
  INTO v_function
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = v_signature::pg_catalog.regprocedure;

  IF v_function.prosecdef IS NOT TRUE
     OR pg_catalog.pg_get_userbyid(v_function.proowner)
        IS DISTINCT FROM 'postgres'
     OR NOT (
       COALESCE(v_function.proconfig, ARRAY[]::text[])
       @> ARRAY['search_path=""']::text[]
     )
     OR pg_catalog.has_function_privilege(
       'anon', v_signature, 'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'authenticated', v_signature, 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role', v_signature, 'EXECUTE'
     ) THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_PRODUCT_BRIDGE_RLS_HELPER_ACL_POSTCONDITION_FAILED';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure_row.oid)
  INTO v_update_definition
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = (
    'public.update_urun_miktar(uuid,numeric,uuid)'
  )::pg_catalog.regprocedure;

  IF v_update_definition NOT LIKE
       '%RETURN internal.stage_legacy_shared_product_delta_v1(%'
     OR v_update_definition NOT LIKE
       '%Preserve the released owner path exactly%'
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'public.update_urun_miktar(uuid,numeric,uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.update_urun_miktar(uuid,numeric,uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.update_urun_miktar(uuid,numeric,uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_table_privilege(
       'anon',
       'internal.legacy_shared_product_delta_intents_v1',
       'SELECT'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'internal.legacy_shared_product_delta_intents_v1',
       'SELECT'
     )
     OR pg_catalog.has_table_privilege(
       'service_role',
       'internal.legacy_shared_product_delta_intents_v1',
       'SELECT'
     )
     OR EXISTS (
       SELECT 1
       FROM internal.legacy_shared_product_delta_intents_v1
     )
     OR EXISTS (
       SELECT 1
       FROM internal.legacy_shared_product_insert_context_v1
     ) THEN
    RAISE EXCEPTION 'LEGACY_SHARED_PRODUCT_BRIDGE_POSTCONDITION_FAILED';
  END IF;
END;
$postcondition$;

COMMIT;
