-- =============================================================================
-- RELEASED 1.5.6 SHARED MANUAL PRODUCT MOVEMENT COMPATIBILITY
-- =============================================================================
--
-- Released 1.5.6 clients mutate a manual (islem_id IS NULL) stock movement in
-- two HTTP requests:
--
--   CREATE
--     1) update_urun_miktar(new_effect)
--     2) INSERT urun_hareketler
--
--   UPDATE
--     1) update_urun_miktar(-old_effect + new_effect)
--     2) UPDATE urun_hareketler
--
--   DELETE
--     1) update_urun_miktar(-old_effect)
--     2) DELETE urun_hareketler
--
-- A shared caller's first request is already converted into a private,
-- short-lived intent by the linked-product compatibility bridge. This
-- migration completes that protocol for every manual movement action:
--
--   * staging is allowed when the actor has at least one product mutation
--     action; staging alone never changes stock;
--   * the final row action rechecks the exact create/update/delete own/all
--     permission against the actual movement creator;
--   * a BEFORE trigger locks the product, validates the exact fresh intent and
--     applies stock inside the row statement's transaction;
--   * INSERT/UPDATE WITH CHECK can pass only through an exact private,
--     transaction-local context created by that BEFORE trigger;
--   * AFTER success consumes both the exact context and the staged intent;
--   * a failed row statement rolls stock/context back and deliberately leaves
--     the intent available for the released client's compensating delta;
--   * replay or multi-row reuse of one intent fails closed.
--
-- Canonical V2 RPCs already apply stock before their movement DML. Each V2
-- function is therefore patched, with drift guards, to open an exact private
-- "canonical" context immediately before its row action. The bridge recognizes
-- only an exact context and skips legacy stock application. This prevents a
-- stale legacy intent from double-applying stock during a modern create/update/
-- delete. The AFTER trigger consumes any invalidated stale intent on success.
--
-- DATA / RELEASE SAFETY
--   * no application/user row is read for migration-time mutation;
--   * no user row is inserted, updated, deleted, backfilled or rewritten;
--   * no existing table, column, RPC signature or result type is removed;
--   * only one private context table, private helpers/triggers, restrictive RLS
--     expressions and drift-guarded function bodies are added/altered;
--   * owner behavior is unchanged;
--   * every runtime mutation remains one PostgreSQL transaction.
--
-- RELEASED 1.5.x EFFECT
--   * owner: unchanged;
--   * shared product-create actor: manual entry/exit/correction create works;
--   * shared update-own/all actor: authorized manual movement edits work;
--   * shared delete-own/all actor: authorized manual movement deletes work;
--   * a staged intent cannot grant a row action the actor does not have.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';

DO $precondition$
DECLARE
  v_insert_policy text;
  v_update_using text;
  v_update_check text;
  v_delete_using text;
  v_definition text;
  v_function pg_catalog.pg_proc;
  v_signature text;
BEGIN
  IF pg_catalog.to_regclass(
       'internal.legacy_shared_product_delta_intents_v1'
     ) IS NULL
     OR pg_catalog.to_regclass('public.urunler') IS NULL
     OR pg_catalog.to_regclass('public.urun_hareketler') IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.stage_legacy_shared_product_delta_v1(uuid,uuid,numeric)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.kayit_mutasyon_izni_v1(uuid,text,uuid,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.isletme_sahibi_v1(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.legacy_shared_product_insert_policy_allowed_v1(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.bridge_legacy_shared_product_insert_v1()'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.cleanup_legacy_shared_product_insert_v1()'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.update_urun_miktar(uuid,numeric,uuid)'
     ) IS NULL
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
       'extensions.gen_random_uuid()'
     ) IS NULL
     OR pg_catalog.to_regclass(
       'internal.legacy_shared_product_unlinked_mutation_context_v1'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'internal.legacy_shared_product_unlinked_old_row_allowed_v1(text,uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'internal.legacy_shared_product_unlinked_context_allowed_v1(text,uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'internal.open_canonical_unlinked_product_context_v1(text,uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,uuid,text,numeric,numeric,numeric)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'internal.assert_canonical_unlinked_product_context_consumed_v1(text,uuid)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'internal.bridge_legacy_shared_product_unlinked_mutation_v1()'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'internal.cleanup_legacy_shared_product_unlinked_mutation_v1()'
     ) IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger AS trigger_row
       WHERE trigger_row.tgrelid =
             'public.urun_hareketler'::pg_catalog.regclass
         AND trigger_row.tgname IN (
           'trg_02_legacy_shared_product_unlinked_mutation_v1',
           'trg_zy_legacy_shared_product_unlinked_mutation_cleanup_v1'
         )
         AND NOT trigger_row.tgisinternal
     ) THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_SCHEMA_PRECONDITION_FAILED';
  END IF;

  -- The prior linked bridge order fix must be present. It keeps intent
  -- consumption in AFTER success, not before RLS WITH CHECK.
  SELECT pg_catalog.pg_get_functiondef(
    'internal.bridge_legacy_shared_product_insert_v1()'
      ::pg_catalog.regprocedure
  )
  INTO v_definition;
  IF v_definition LIKE
       '%DELETE FROM internal.legacy_shared_product_delta_intents_v1%'
     OR v_definition NOT LIKE
       '%internal.legacy_shared_product_insert_context_v1%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_LINKED_BRIDGE_ORDER_DRIFT';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'internal.cleanup_legacy_shared_product_insert_v1()'
      ::pg_catalog.regprocedure
  )
  INTO v_definition;
  IF v_definition NOT LIKE
       '%DELETE FROM internal.legacy_shared_product_delta_intents_v1%'
     OR v_definition NOT LIKE '%IF v_context_count > 0 THEN%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_LINKED_CLEANUP_DRIFT';
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

  SELECT policy_row.qual, policy_row.with_check
  INTO v_update_using, v_update_check
  FROM pg_catalog.pg_policies AS policy_row
  WHERE policy_row.schemaname = 'public'
    AND policy_row.tablename = 'urun_hareketler'
    AND policy_row.policyname =
      'Permission v2 direct update urun hareketleri owner only'
    AND policy_row.permissive = 'RESTRICTIVE'
    AND policy_row.cmd = 'UPDATE';

  SELECT policy_row.qual
  INTO v_delete_using
  FROM pg_catalog.pg_policies AS policy_row
  WHERE policy_row.schemaname = 'public'
    AND policy_row.tablename = 'urun_hareketler'
    AND policy_row.policyname =
      'Permission v2 direct delete urun hareketleri owner only'
    AND policy_row.permissive = 'RESTRICTIVE'
    AND policy_row.cmd = 'DELETE';

  IF v_insert_policy NOT LIKE '%internal.isletme_sahibi_v1%'
     OR v_insert_policy NOT LIKE
       '%internal.legacy_shared_product_insert_policy_allowed_v1%'
     OR v_insert_policy LIKE
       '%internal.legacy_shared_product_unlinked_context_allowed_v1%'
     OR v_update_using IS DISTINCT FROM
       'internal.isletme_sahibi_v1(isletme_id)'
     OR v_update_check IS DISTINCT FROM
       'internal.isletme_sahibi_v1(isletme_id)'
     OR v_delete_using IS DISTINCT FROM
       'internal.isletme_sahibi_v1(isletme_id)' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_POLICY_PRECONDITION_FAILED';
  END IF;

  -- Validate every function that will be patched before reading/re-executing
  -- its pg_get_functiondef output.
  FOREACH v_signature IN ARRAY ARRAY[
    'internal.stage_legacy_shared_product_delta_v1(uuid,uuid,numeric)',
    'public.update_urun_miktar(uuid,numeric,uuid)',
    'public.create_urun_hareket_atomik_v2(uuid,jsonb)',
    'public.update_urun_hareket_atomik_v2(uuid,uuid,jsonb)',
    'public.delete_urun_hareket_atomik_v2(uuid,uuid)'
  ]::text[] LOOP
    SELECT procedure_row.*
    INTO v_function
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.oid = v_signature::pg_catalog.regprocedure;

    IF v_function.provolatile IS DISTINCT FROM 'v'
       OR v_function.prosecdef IS NOT TRUE
       OR pg_catalog.pg_get_userbyid(v_function.proowner)
          IS DISTINCT FROM 'postgres'
       OR NOT (
         COALESCE(v_function.proconfig, ARRAY[]::text[])
         @> ARRAY['search_path=""']::text[]
       ) THEN
      RAISE EXCEPTION
        'LEGACY_SHARED_UNLINKED_MUTATION_PATCH_TARGET_DRIFT: %',
        v_signature;
    END IF;
  END LOOP;

  SELECT pg_catalog.pg_get_functiondef(
    'internal.stage_legacy_shared_product_delta_v1(uuid,uuid,numeric)'
      ::pg_catalog.regprocedure
  )
  INTO v_definition;
  IF v_definition NOT LIKE
       '%internal.kayit_mutasyon_izni_v1(%''create''%'
     OR v_definition LIKE '%any released manual action%'
     OR v_definition NOT LIKE
       '%INSERT INTO internal.legacy_shared_product_delta_intents_v1%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_STAGE_FUNCTION_DRIFT';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.update_urun_miktar(uuid,numeric,uuid)'
      ::pg_catalog.regprocedure
  )
  INTO v_definition;
  IF v_definition NOT LIKE
       '%RETURN internal.stage_legacy_shared_product_delta_v1(%'
     OR v_definition NOT LIKE
       '%internal.kayit_mutasyon_izni_v1(%''create''%'
     OR v_definition LIKE
       '%pg_catalog.round(p_miktar_degisim, 3)%'
     OR v_definition LIKE '%any released manual action%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_UPDATE_RPC_DRIFT';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.create_urun_hareket_atomik_v2(uuid,jsonb)'
      ::pg_catalog.regprocedure
  )
  INTO v_definition;
  IF v_definition NOT LIKE
       '%INSERT INTO public.urun_hareketler (%'
     OR v_definition LIKE
       '%open_canonical_unlinked_product_context_v1%'
     OR v_definition LIKE '%v_hareket_id uuid%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_CREATE_V2_DRIFT';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.update_urun_hareket_atomik_v2(uuid,uuid,jsonb)'
      ::pg_catalog.regprocedure
  )
  INTO v_definition;
  IF v_definition NOT LIKE
       '%UPDATE public.urun_hareketler AS movement%'
     OR v_definition LIKE
       '%open_canonical_unlinked_product_context_v1%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_UPDATE_V2_DRIFT';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.delete_urun_hareket_atomik_v2(uuid,uuid)'
      ::pg_catalog.regprocedure
  )
  INTO v_definition;
  IF v_definition NOT LIKE
       '%DELETE FROM public.urun_hareketler AS movement%'
     OR v_definition LIKE
       '%open_canonical_unlinked_product_context_v1%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_DELETE_V2_DRIFT';
  END IF;
END;
$precondition$;

CREATE TABLE
  internal.legacy_shared_product_unlinked_mutation_context_v1 (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  actor_user_id uuid NOT NULL,
  source text NOT NULL,
  action text NOT NULL,
  movement_id uuid NOT NULL,
  isletme_id uuid NOT NULL,
  urun_id uuid NOT NULL,
  old_created_by uuid,
  old_hareket_tipi text,
  old_miktar numeric,
  old_onceki_miktar numeric,
  old_yeni_miktar numeric,
  new_created_by uuid,
  new_hareket_tipi text,
  new_miktar numeric,
  new_onceki_miktar numeric,
  new_yeni_miktar numeric,
  CONSTRAINT legacy_shared_product_unlinked_mutation_context_v1_pkey
    PRIMARY KEY (
      backend_pid,
      transaction_id,
      actor_user_id,
      movement_id,
      action
    ),
  CONSTRAINT legacy_shared_product_unlinked_mutation_context_v1_source_check
    CHECK (source IN ('canonical', 'legacy')),
  CONSTRAINT legacy_shared_product_unlinked_mutation_context_v1_action_check
    CHECK (action IN ('create', 'update', 'delete')),
  CONSTRAINT legacy_shared_product_unlinked_mutation_context_v1_shape_check
    CHECK (
      (
        action = 'create'
        AND old_created_by IS NULL
        AND old_hareket_tipi IS NULL
        AND old_miktar IS NULL
        AND old_onceki_miktar IS NULL
        AND old_yeni_miktar IS NULL
        AND new_hareket_tipi IN ('giris', 'cikis', 'duzeltme')
        AND new_miktar IS NOT NULL
      )
      OR (
        action = 'update'
        AND old_hareket_tipi IN ('giris', 'cikis', 'duzeltme')
        AND old_miktar IS NOT NULL
        AND new_hareket_tipi IN ('giris', 'cikis', 'duzeltme')
        AND new_miktar IS NOT NULL
      )
      OR (
        action = 'delete'
        AND old_hareket_tipi IN ('giris', 'cikis', 'duzeltme')
        AND old_miktar IS NOT NULL
        AND new_created_by IS NULL
        AND new_hareket_tipi IS NULL
        AND new_miktar IS NULL
        AND new_onceki_miktar IS NULL
        AND new_yeni_miktar IS NULL
      )
    )
);

ALTER TABLE
  internal.legacy_shared_product_unlinked_mutation_context_v1
  OWNER TO postgres;
ALTER TABLE
  internal.legacy_shared_product_unlinked_mutation_context_v1
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL
ON TABLE internal.legacy_shared_product_unlinked_mutation_context_v1
FROM PUBLIC, anon, authenticated, service_role;

-- RLS USING runs before row BEFORE triggers. This helper authorizes only the
-- OLD manual row for the exact requested update/delete own/all action. It does
-- not authorize stock: the BEFORE trigger still requires the exact intent for
-- every non-zero delta.
CREATE FUNCTION
  internal.legacy_shared_product_unlinked_old_row_allowed_v1(
    p_action text,
    p_movement_id uuid,
    p_isletme_id uuid,
    p_urun_id uuid,
    p_islem_id uuid,
    p_created_by uuid,
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
BEGIN
  IF v_uid IS NULL
     OR p_action NOT IN ('update', 'delete')
     OR p_movement_id IS NULL
     OR p_isletme_id IS NULL
     OR p_urun_id IS NULL
     OR p_islem_id IS NOT NULL
     OR p_hareket_tipi NOT IN ('giris', 'cikis', 'duzeltme')
     OR p_miktar IS NULL
     OR p_miktar = 'NaN'::numeric
     OR p_miktar = 'Infinity'::numeric
     OR p_miktar = '-Infinity'::numeric
     OR p_miktar IS DISTINCT FROM pg_catalog.round(p_miktar, 3)
     OR NOT internal.kayit_mutasyon_izni_v1(
       p_isletme_id,
       'urunler',
       p_created_by,
       p_action
     ) THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.urunler AS product
    WHERE product.id = p_urun_id
      AND product.isletme_id = p_isletme_id
      AND product.is_active IS TRUE
      AND product.is_archived IS FALSE
  );
END;
$function$;

-- INSERT/UPDATE WITH CHECK runs after BEFORE triggers. VOLATILE is intentional:
-- unlike a STABLE helper, this function must see the exact transaction-local
-- context inserted by the preceding row trigger in the same SQL command.
CREATE FUNCTION
  internal.legacy_shared_product_unlinked_context_allowed_v1(
    p_action text,
    p_movement_id uuid,
    p_isletme_id uuid,
    p_urun_id uuid,
    p_islem_id uuid,
    p_created_by uuid,
    p_hareket_tipi text,
    p_miktar numeric,
    p_onceki_miktar numeric,
    p_yeni_miktar numeric
  )
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL
     OR p_action NOT IN ('create', 'update')
     OR p_movement_id IS NULL
     OR p_isletme_id IS NULL
     OR p_urun_id IS NULL
     OR p_islem_id IS NOT NULL
     OR p_hareket_tipi NOT IN ('giris', 'cikis', 'duzeltme')
     OR p_miktar IS NULL
     OR p_miktar = 'NaN'::numeric
     OR p_miktar = 'Infinity'::numeric
     OR p_miktar = '-Infinity'::numeric
     OR p_miktar IS DISTINCT FROM pg_catalog.round(p_miktar, 3)
     OR NOT internal.kayit_mutasyon_izni_v1(
       p_isletme_id,
       'urunler',
       p_created_by,
       p_action
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.urunler AS product
       WHERE product.id = p_urun_id
         AND product.isletme_id = p_isletme_id
         AND product.is_active IS TRUE
         AND product.is_archived IS FALSE
     ) THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM internal.legacy_shared_product_unlinked_mutation_context_v1
      AS context_row
    WHERE context_row.backend_pid = pg_catalog.pg_backend_pid()
      AND context_row.transaction_id = pg_catalog.txid_current()
      AND context_row.actor_user_id = v_uid
      AND context_row.action = p_action
      AND context_row.movement_id = p_movement_id
      AND context_row.isletme_id = p_isletme_id
      AND context_row.urun_id = p_urun_id
      AND context_row.new_created_by IS NOT DISTINCT FROM p_created_by
      AND context_row.new_hareket_tipi
          IS NOT DISTINCT FROM p_hareket_tipi
      AND context_row.new_miktar IS NOT DISTINCT FROM p_miktar
      AND context_row.new_onceki_miktar
          IS NOT DISTINCT FROM p_onceki_miktar
      AND context_row.new_yeni_miktar
          IS NOT DISTINCT FROM p_yeni_miktar
  );
END;
$function$;

-- Canonical V2 functions call this only for a shared, unlinked movement after
-- they have locked and updated the product, immediately before their movement
-- row DML. The final row permission is rechecked against the actual creator.
CREATE FUNCTION
  internal.open_canonical_unlinked_product_context_v1(
    p_action text,
    p_movement_id uuid,
    p_isletme_id uuid,
    p_urun_id uuid,
    p_old_created_by uuid,
    p_old_hareket_tipi text,
    p_old_miktar numeric,
    p_old_onceki_miktar numeric,
    p_old_yeni_miktar numeric,
    p_new_created_by uuid,
    p_new_hareket_tipi text,
    p_new_miktar numeric,
    p_new_onceki_miktar numeric,
    p_new_yeni_miktar numeric
  )
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_permission_creator uuid;
BEGIN
  v_permission_creator := CASE p_action
    WHEN 'create' THEN p_new_created_by
    ELSE p_old_created_by
  END;

  IF v_uid IS NULL
     OR p_action NOT IN ('create', 'update', 'delete')
     OR p_movement_id IS NULL
     OR p_isletme_id IS NULL
     OR p_urun_id IS NULL
     OR internal.isletme_sahibi_v1(p_isletme_id)
     OR NOT internal.kayit_mutasyon_izni_v1(
       p_isletme_id,
       'urunler',
       v_permission_creator,
       p_action
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.urunler AS product
       WHERE product.id = p_urun_id
         AND product.isletme_id = p_isletme_id
         AND product.is_active IS TRUE
         AND product.is_archived IS FALSE
     )
     OR (
       p_action = 'create'
       AND (
         p_old_created_by IS NOT NULL
         OR p_old_hareket_tipi IS NOT NULL
         OR p_old_miktar IS NOT NULL
         OR p_old_onceki_miktar IS NOT NULL
         OR p_old_yeni_miktar IS NOT NULL
         OR p_new_created_by IS DISTINCT FROM v_uid
         OR p_new_hareket_tipi NOT IN ('giris', 'cikis', 'duzeltme')
         OR p_new_miktar IS NULL
       )
     )
     OR (
       p_action = 'update'
       AND (
         p_old_hareket_tipi NOT IN ('giris', 'cikis', 'duzeltme')
         OR p_old_miktar IS NULL
         OR p_new_created_by IS DISTINCT FROM p_old_created_by
         OR p_new_hareket_tipi NOT IN ('giris', 'cikis', 'duzeltme')
         OR p_new_miktar IS NULL
       )
     )
     OR (
       p_action = 'delete'
       AND (
         p_old_hareket_tipi NOT IN ('giris', 'cikis', 'duzeltme')
         OR p_old_miktar IS NULL
         OR p_new_created_by IS NOT NULL
         OR p_new_hareket_tipi IS NOT NULL
         OR p_new_miktar IS NOT NULL
         OR p_new_onceki_miktar IS NOT NULL
         OR p_new_yeni_miktar IS NOT NULL
       )
     ) THEN
    RAISE EXCEPTION 'CANONICAL_UNLINKED_PRODUCT_CONTEXT_INVALID'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO
    internal.legacy_shared_product_unlinked_mutation_context_v1 (
      backend_pid,
      transaction_id,
      actor_user_id,
      source,
      action,
      movement_id,
      isletme_id,
      urun_id,
      old_created_by,
      old_hareket_tipi,
      old_miktar,
      old_onceki_miktar,
      old_yeni_miktar,
      new_created_by,
      new_hareket_tipi,
      new_miktar,
      new_onceki_miktar,
      new_yeni_miktar
    )
  VALUES (
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current(),
    v_uid,
    'canonical',
    p_action,
    p_movement_id,
    p_isletme_id,
    p_urun_id,
    p_old_created_by,
    p_old_hareket_tipi,
    p_old_miktar,
    p_old_onceki_miktar,
    p_old_yeni_miktar,
    p_new_created_by,
    p_new_hareket_tipi,
    p_new_miktar,
    p_new_onceki_miktar,
    p_new_yeni_miktar
  );
END;
$function$;

CREATE FUNCTION
  internal.assert_canonical_unlinked_product_context_consumed_v1(
    p_action text,
    p_movement_id uuid
  )
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM internal.legacy_shared_product_unlinked_mutation_context_v1
      AS context_row
    WHERE context_row.backend_pid = pg_catalog.pg_backend_pid()
      AND context_row.transaction_id = pg_catalog.txid_current()
      AND context_row.actor_user_id = auth.uid()
      AND context_row.source = 'canonical'
      AND context_row.action = p_action
      AND context_row.movement_id = p_movement_id
  ) THEN
    RAISE EXCEPTION 'CANONICAL_UNLINKED_PRODUCT_CONTEXT_NOT_CONSUMED'
      USING ERRCODE = '55000';
  END IF;
END;
$function$;

CREATE FUNCTION
  internal.bridge_legacy_shared_product_unlinked_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_action text := CASE TG_OP
    WHEN 'INSERT' THEN 'create'
    WHEN 'UPDATE' THEN 'update'
    ELSE 'delete'
  END;
  v_created_by uuid;
  v_isletme_id uuid;
  v_movement_id uuid;
  v_urun_id uuid;
  v_old_effect numeric;
  v_new_effect numeric;
  v_delta numeric;
  v_current_quantity numeric;
  v_expected_quantity numeric;
  v_intent internal.legacy_shared_product_delta_intents_v1;
  v_has_canonical_context boolean;
BEGIN
  -- Ignore linked rows, FK link cleanup, unauthenticated internal cascades and
  -- the owner's released direct-table path.
  IF v_uid IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF (
       TG_OP = 'INSERT'
       AND NEW.islem_id IS NOT NULL
     )
     OR (
       TG_OP = 'UPDATE'
       AND (
         OLD.islem_id IS NOT NULL
         OR NEW.islem_id IS NOT NULL
       )
     )
     OR (
       TG_OP = 'DELETE'
       AND OLD.islem_id IS NOT NULL
     ) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_isletme_id := CASE WHEN TG_OP = 'DELETE'
    THEN OLD.isletme_id ELSE NEW.isletme_id END;
  v_movement_id := CASE WHEN TG_OP = 'DELETE'
    THEN OLD.id ELSE NEW.id END;
  v_urun_id := CASE WHEN TG_OP = 'DELETE'
    THEN OLD.urun_id ELSE NEW.urun_id END;
  v_created_by := CASE WHEN TG_OP = 'INSERT'
    THEN NEW.created_by ELSE OLD.created_by END;

  IF internal.isletme_sahibi_v1(v_isletme_id) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- A canonical marker for this row/action may never fall through into the
  -- legacy intent path. Exact match skips stock; mismatch aborts atomically.
  SELECT EXISTS (
    SELECT 1
    FROM internal.legacy_shared_product_unlinked_mutation_context_v1
      AS context_row
    WHERE context_row.backend_pid = pg_catalog.pg_backend_pid()
      AND context_row.transaction_id = pg_catalog.txid_current()
      AND context_row.actor_user_id = v_uid
      AND context_row.source = 'canonical'
      AND context_row.action = v_action
      AND context_row.movement_id = v_movement_id
      AND context_row.isletme_id = v_isletme_id
      AND context_row.urun_id = v_urun_id
  )
  INTO v_has_canonical_context;

  IF v_has_canonical_context THEN
    IF (
      TG_OP = 'INSERT'
      AND EXISTS (
        SELECT 1
        FROM internal.legacy_shared_product_unlinked_mutation_context_v1
          AS context_row
        WHERE context_row.backend_pid = pg_catalog.pg_backend_pid()
          AND context_row.transaction_id = pg_catalog.txid_current()
          AND context_row.actor_user_id = v_uid
          AND context_row.source = 'canonical'
          AND context_row.action = 'create'
          AND context_row.movement_id = NEW.id
          AND context_row.isletme_id = NEW.isletme_id
          AND context_row.urun_id = NEW.urun_id
          AND context_row.new_created_by
              IS NOT DISTINCT FROM NEW.created_by
          AND context_row.new_hareket_tipi
              IS NOT DISTINCT FROM NEW.hareket_tipi
          AND context_row.new_miktar IS NOT DISTINCT FROM NEW.miktar
          AND context_row.new_onceki_miktar
              IS NOT DISTINCT FROM NEW.onceki_miktar
          AND context_row.new_yeni_miktar
              IS NOT DISTINCT FROM NEW.yeni_miktar
      )
    ) OR (
      TG_OP = 'UPDATE'
      AND EXISTS (
        SELECT 1
        FROM internal.legacy_shared_product_unlinked_mutation_context_v1
          AS context_row
        WHERE context_row.backend_pid = pg_catalog.pg_backend_pid()
          AND context_row.transaction_id = pg_catalog.txid_current()
          AND context_row.actor_user_id = v_uid
          AND context_row.source = 'canonical'
          AND context_row.action = 'update'
          AND context_row.movement_id = OLD.id
          AND context_row.isletme_id = OLD.isletme_id
          AND context_row.urun_id = OLD.urun_id
          AND context_row.old_created_by
              IS NOT DISTINCT FROM OLD.created_by
          AND context_row.old_hareket_tipi
              IS NOT DISTINCT FROM OLD.hareket_tipi
          AND context_row.old_miktar IS NOT DISTINCT FROM OLD.miktar
          AND context_row.old_onceki_miktar
              IS NOT DISTINCT FROM OLD.onceki_miktar
          AND context_row.old_yeni_miktar
              IS NOT DISTINCT FROM OLD.yeni_miktar
          AND context_row.new_created_by
              IS NOT DISTINCT FROM NEW.created_by
          AND context_row.new_hareket_tipi
              IS NOT DISTINCT FROM NEW.hareket_tipi
          AND context_row.new_miktar IS NOT DISTINCT FROM NEW.miktar
          AND context_row.new_onceki_miktar
              IS NOT DISTINCT FROM NEW.onceki_miktar
          AND context_row.new_yeni_miktar
              IS NOT DISTINCT FROM NEW.yeni_miktar
      )
    ) OR (
      TG_OP = 'DELETE'
      AND EXISTS (
        SELECT 1
        FROM internal.legacy_shared_product_unlinked_mutation_context_v1
          AS context_row
        WHERE context_row.backend_pid = pg_catalog.pg_backend_pid()
          AND context_row.transaction_id = pg_catalog.txid_current()
          AND context_row.actor_user_id = v_uid
          AND context_row.source = 'canonical'
          AND context_row.action = 'delete'
          AND context_row.movement_id = OLD.id
          AND context_row.isletme_id = OLD.isletme_id
          AND context_row.urun_id = OLD.urun_id
          AND context_row.old_created_by
              IS NOT DISTINCT FROM OLD.created_by
          AND context_row.old_hareket_tipi
              IS NOT DISTINCT FROM OLD.hareket_tipi
          AND context_row.old_miktar IS NOT DISTINCT FROM OLD.miktar
          AND context_row.old_onceki_miktar
              IS NOT DISTINCT FROM OLD.onceki_miktar
          AND context_row.old_yeni_miktar
              IS NOT DISTINCT FROM OLD.yeni_miktar
      )
    ) THEN
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'CANONICAL_UNLINKED_PRODUCT_CONTEXT_MISMATCH'
      USING ERRCODE = '55000';
  END IF;

  IF v_movement_id IS NULL
     OR v_isletme_id IS NULL
     OR v_urun_id IS NULL
     OR NOT internal.kayit_mutasyon_izni_v1(
       v_isletme_id,
       'urunler',
       v_created_by,
       v_action
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.urunler AS product
       WHERE product.id = v_urun_id
         AND product.isletme_id = v_isletme_id
         AND product.is_active IS TRUE
         AND product.is_archived IS FALSE
     ) THEN
    RAISE EXCEPTION 'LEGACY_UNLINKED_PRODUCT_MUTATION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM v_uid
       OR NEW.hareket_tipi NOT IN ('giris', 'cikis', 'duzeltme')
       OR NEW.miktar IS NULL
       OR NEW.miktar = 'NaN'::numeric
       OR NEW.miktar = 'Infinity'::numeric
       OR NEW.miktar = '-Infinity'::numeric
       OR NEW.miktar = 0
       OR NEW.miktar IS DISTINCT FROM pg_catalog.round(NEW.miktar, 3)
       OR NEW.onceki_miktar IS NULL
       OR NEW.yeni_miktar IS NULL THEN
      RAISE EXCEPTION 'LEGACY_UNLINKED_PRODUCT_MUTATION_INVALID'
        USING ERRCODE = '22023';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.isletme_id, NEW.urun_id, NEW.islem_id)
         IS DISTINCT FROM
       (OLD.id, OLD.isletme_id, OLD.urun_id, OLD.islem_id)
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.hareket_tipi NOT IN ('giris', 'cikis', 'duzeltme')
       OR NEW.miktar IS NULL
       OR NEW.miktar = 'NaN'::numeric
       OR NEW.miktar = 'Infinity'::numeric
       OR NEW.miktar = '-Infinity'::numeric
       OR NEW.miktar = 0
       OR NEW.miktar IS DISTINCT FROM pg_catalog.round(NEW.miktar, 3)
       OR NEW.onceki_miktar IS DISTINCT FROM OLD.onceki_miktar
       OR NEW.yeni_miktar IS NULL THEN
      RAISE EXCEPTION 'LEGACY_UNLINKED_PRODUCT_MUTATION_INVALID'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    IF OLD.hareket_tipi NOT IN ('giris', 'cikis', 'duzeltme')
       OR OLD.miktar IS NULL
       OR OLD.miktar = 'NaN'::numeric
       OR OLD.miktar = 'Infinity'::numeric
       OR OLD.miktar = '-Infinity'::numeric
       OR OLD.miktar IS DISTINCT FROM pg_catalog.round(OLD.miktar, 3) THEN
      RAISE EXCEPTION 'LEGACY_UNLINKED_PRODUCT_MUTATION_INVALID'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_old_effect := CASE
    WHEN TG_OP = 'INSERT' THEN 0
    WHEN OLD.hareket_tipi = 'giris' THEN pg_catalog.abs(OLD.miktar)
    WHEN OLD.hareket_tipi = 'cikis' THEN -pg_catalog.abs(OLD.miktar)
    ELSE OLD.miktar
  END;
  v_new_effect := CASE
    WHEN TG_OP = 'DELETE' THEN 0
    WHEN NEW.hareket_tipi = 'giris' THEN pg_catalog.abs(NEW.miktar)
    WHEN NEW.hareket_tipi = 'cikis' THEN -pg_catalog.abs(NEW.miktar)
    ELSE NEW.miktar
  END;
  v_delta := -v_old_effect + v_new_effect;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'legacy-shared-product-delta:'
      || v_uid::text
      || ':'
      || v_isletme_id::text
      || ':'
      || v_urun_id::text,
      0
    )
  );

  SELECT COALESCE(product.miktar, 0)
  INTO v_current_quantity
  FROM public.urunler AS product
  WHERE product.id = v_urun_id
    AND product.isletme_id = v_isletme_id
    AND product.is_active IS TRUE
    AND product.is_archived IS FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEGACY_UNLINKED_PRODUCT_MUTATION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  v_expected_quantity := v_current_quantity + v_delta;
  IF v_expected_quantity = 'NaN'::numeric
     OR v_expected_quantity = 'Infinity'::numeric
     OR v_expected_quantity = '-Infinity'::numeric
     OR pg_catalog.abs(v_expected_quantity) > 999999999999.999 THEN
    RAISE EXCEPTION 'LEGACY_UNLINKED_PRODUCT_MUTATION_INVALID'
      USING ERRCODE = '22003';
  END IF;

  IF v_delta <> 0 THEN
    SELECT intent.*
    INTO v_intent
    FROM internal.legacy_shared_product_delta_intents_v1 AS intent
    WHERE intent.actor_user_id = v_uid
      AND intent.isletme_id = v_isletme_id
      AND intent.urun_id = v_urun_id
      AND intent.expires_at > pg_catalog.clock_timestamp()
    FOR UPDATE;

    IF NOT FOUND
       OR v_intent.previous_quantity
          IS DISTINCT FROM v_current_quantity
       OR v_intent.delta IS DISTINCT FROM v_delta
       OR v_intent.expected_quantity
          IS DISTINCT FROM v_expected_quantity THEN
      RAISE EXCEPTION 'LEGACY_UNLINKED_PRODUCT_INTENT_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.onceki_miktar IS DISTINCT FROM v_current_quantity
       OR NEW.yeni_miktar IS DISTINCT FROM v_expected_quantity THEN
      RAISE EXCEPTION 'LEGACY_UNLINKED_PRODUCT_INTENT_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.yeni_miktar IS DISTINCT FROM v_expected_quantity THEN
      RAISE EXCEPTION 'LEGACY_UNLINKED_PRODUCT_INTENT_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_delta <> 0 THEN
    UPDATE public.urunler AS product
    SET miktar = v_expected_quantity,
        updated_at = pg_catalog.clock_timestamp()
    WHERE product.id = v_urun_id
      AND product.isletme_id = v_isletme_id;
  END IF;

  INSERT INTO
    internal.legacy_shared_product_unlinked_mutation_context_v1 (
      backend_pid,
      transaction_id,
      actor_user_id,
      source,
      action,
      movement_id,
      isletme_id,
      urun_id,
      old_created_by,
      old_hareket_tipi,
      old_miktar,
      old_onceki_miktar,
      old_yeni_miktar,
      new_created_by,
      new_hareket_tipi,
      new_miktar,
      new_onceki_miktar,
      new_yeni_miktar
    )
  VALUES (
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current(),
    v_uid,
    'legacy',
    v_action,
    v_movement_id,
    v_isletme_id,
    v_urun_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.created_by END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.hareket_tipi END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.miktar END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.onceki_miktar END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.yeni_miktar END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.created_by END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.hareket_tipi END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.miktar END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.onceki_miktar END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.yeni_miktar END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION
  internal.cleanup_legacy_shared_product_unlinked_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_action text := CASE TG_OP
    WHEN 'INSERT' THEN 'create'
    WHEN 'UPDATE' THEN 'update'
    ELSE 'delete'
  END;
  v_source text;
  v_isletme_id uuid;
  v_movement_id uuid;
  v_urun_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_isletme_id := CASE WHEN TG_OP = 'DELETE'
    THEN OLD.isletme_id ELSE NEW.isletme_id END;
  v_movement_id := CASE WHEN TG_OP = 'DELETE'
    THEN OLD.id ELSE NEW.id END;
  v_urun_id := CASE WHEN TG_OP = 'DELETE'
    THEN OLD.urun_id ELSE NEW.urun_id END;

  IF (
       TG_OP = 'INSERT'
       AND NEW.islem_id IS NOT NULL
     )
     OR (
       TG_OP = 'UPDATE'
       AND (
         OLD.islem_id IS NOT NULL
         OR NEW.islem_id IS NOT NULL
       )
     )
     OR (
       TG_OP = 'DELETE'
       AND OLD.islem_id IS NOT NULL
     ) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    DELETE FROM
      internal.legacy_shared_product_unlinked_mutation_context_v1
      AS context_row
    WHERE context_row.backend_pid = pg_catalog.pg_backend_pid()
      AND context_row.transaction_id = pg_catalog.txid_current()
      AND context_row.actor_user_id = v_uid
      AND context_row.action = 'create'
      AND context_row.movement_id = NEW.id
      AND context_row.isletme_id = NEW.isletme_id
      AND context_row.urun_id = NEW.urun_id
      AND context_row.new_created_by
          IS NOT DISTINCT FROM NEW.created_by
      AND context_row.new_hareket_tipi
          IS NOT DISTINCT FROM NEW.hareket_tipi
      AND context_row.new_miktar IS NOT DISTINCT FROM NEW.miktar
      AND context_row.new_onceki_miktar
          IS NOT DISTINCT FROM NEW.onceki_miktar
      AND context_row.new_yeni_miktar
          IS NOT DISTINCT FROM NEW.yeni_miktar
    RETURNING context_row.source INTO v_source;
  ELSIF TG_OP = 'UPDATE' THEN
    DELETE FROM
      internal.legacy_shared_product_unlinked_mutation_context_v1
      AS context_row
    WHERE context_row.backend_pid = pg_catalog.pg_backend_pid()
      AND context_row.transaction_id = pg_catalog.txid_current()
      AND context_row.actor_user_id = v_uid
      AND context_row.action = 'update'
      AND context_row.movement_id = OLD.id
      AND context_row.isletme_id = OLD.isletme_id
      AND context_row.urun_id = OLD.urun_id
      AND context_row.old_created_by
          IS NOT DISTINCT FROM OLD.created_by
      AND context_row.old_hareket_tipi
          IS NOT DISTINCT FROM OLD.hareket_tipi
      AND context_row.old_miktar IS NOT DISTINCT FROM OLD.miktar
      AND context_row.old_onceki_miktar
          IS NOT DISTINCT FROM OLD.onceki_miktar
      AND context_row.old_yeni_miktar
          IS NOT DISTINCT FROM OLD.yeni_miktar
      AND context_row.new_created_by
          IS NOT DISTINCT FROM NEW.created_by
      AND context_row.new_hareket_tipi
          IS NOT DISTINCT FROM NEW.hareket_tipi
      AND context_row.new_miktar IS NOT DISTINCT FROM NEW.miktar
      AND context_row.new_onceki_miktar
          IS NOT DISTINCT FROM NEW.onceki_miktar
      AND context_row.new_yeni_miktar
          IS NOT DISTINCT FROM NEW.yeni_miktar
    RETURNING context_row.source INTO v_source;
  ELSE
    DELETE FROM
      internal.legacy_shared_product_unlinked_mutation_context_v1
      AS context_row
    WHERE context_row.backend_pid = pg_catalog.pg_backend_pid()
      AND context_row.transaction_id = pg_catalog.txid_current()
      AND context_row.actor_user_id = v_uid
      AND context_row.action = 'delete'
      AND context_row.movement_id = OLD.id
      AND context_row.isletme_id = OLD.isletme_id
      AND context_row.urun_id = OLD.urun_id
      AND context_row.old_created_by
          IS NOT DISTINCT FROM OLD.created_by
      AND context_row.old_hareket_tipi
          IS NOT DISTINCT FROM OLD.hareket_tipi
      AND context_row.old_miktar IS NOT DISTINCT FROM OLD.miktar
      AND context_row.old_onceki_miktar
          IS NOT DISTINCT FROM OLD.onceki_miktar
      AND context_row.old_yeni_miktar
          IS NOT DISTINCT FROM OLD.yeni_miktar
    RETURNING context_row.source INTO v_source;
  END IF;

  IF v_source IS NOT NULL THEN
    -- The row action has succeeded. Consume the intent only now. If any later
    -- trigger raises, this DELETE and the stock mutation roll back together.
    DELETE FROM internal.legacy_shared_product_delta_intents_v1 AS intent
    WHERE intent.actor_user_id = v_uid
      AND intent.isletme_id = v_isletme_id
      AND intent.urun_id = v_urun_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION
  internal.legacy_shared_product_unlinked_old_row_allowed_v1(
    text, uuid, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric
  ) OWNER TO postgres;
ALTER FUNCTION
  internal.legacy_shared_product_unlinked_context_allowed_v1(
    text, uuid, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric
  ) OWNER TO postgres;
ALTER FUNCTION
  internal.open_canonical_unlinked_product_context_v1(
    text, uuid, uuid, uuid,
    uuid, text, numeric, numeric, numeric,
    uuid, text, numeric, numeric, numeric
  ) OWNER TO postgres;
ALTER FUNCTION
  internal.assert_canonical_unlinked_product_context_consumed_v1(
    text, uuid
  ) OWNER TO postgres;
ALTER FUNCTION
  internal.bridge_legacy_shared_product_unlinked_mutation_v1()
  OWNER TO postgres;
ALTER FUNCTION
  internal.cleanup_legacy_shared_product_unlinked_mutation_v1()
  OWNER TO postgres;

REVOKE ALL
ON FUNCTION
  internal.legacy_shared_product_unlinked_old_row_allowed_v1(
    text, uuid, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric
  )
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION
  internal.legacy_shared_product_unlinked_old_row_allowed_v1(
    text, uuid, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric
  )
TO authenticated;

REVOKE ALL
ON FUNCTION
  internal.legacy_shared_product_unlinked_context_allowed_v1(
    text, uuid, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric
  )
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION
  internal.legacy_shared_product_unlinked_context_allowed_v1(
    text, uuid, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric
  )
TO authenticated;

REVOKE ALL
ON FUNCTION
  internal.open_canonical_unlinked_product_context_v1(
    text, uuid, uuid, uuid,
    uuid, text, numeric, numeric, numeric,
    uuid, text, numeric, numeric, numeric
  )
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL
ON FUNCTION
  internal.assert_canonical_unlinked_product_context_consumed_v1(
    text, uuid
  )
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL
ON FUNCTION
  internal.bridge_legacy_shared_product_unlinked_mutation_v1()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL
ON FUNCTION
  internal.cleanup_legacy_shared_product_unlinked_mutation_v1()
FROM PUBLIC, anon, authenticated, service_role;

-- Widen only the shared staging gate. Final row permissions are not widened:
-- the row action helpers/trigger above recheck exact create/update/delete
-- own/all against the actual movement.
DO $patch_stage_and_wrapper$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'internal.stage_legacy_shared_product_delta_v1(uuid,uuid,numeric)'
      ::pg_catalog.regprocedure
  )
  INTO v_definition;
  v_before := v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$     OR NOT internal.kayit_mutasyon_izni_v1(
       p_isletme_id,
       'urunler',
       v_uid,
       'create'
     ) THEN$old$,
    $new$     -- Staging changes no stock; any released manual action (CREATE,
     -- UPDATE or DELETE) may stage; final row action rechecks exact own/all.
     OR NOT (
       internal.kayit_mutasyon_izni_v1(
         p_isletme_id,
         'urunler',
         v_uid,
         'create'
       )
       OR internal.kayit_mutasyon_izni_v1(
         p_isletme_id,
         'urunler',
         v_uid,
         'update'
       )
       OR internal.kayit_mutasyon_izni_v1(
         p_isletme_id,
         'urunler',
         v_uid,
         'delete'
       )
     ) THEN$new$
  );
  IF v_definition IS NOT DISTINCT FROM v_before
     OR v_definition NOT LIKE '%any released manual action%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_STAGE_PATCH_DRIFT';
  END IF;
  EXECUTE v_definition;

  SELECT pg_catalog.pg_get_functiondef(
    'public.update_urun_miktar(uuid,numeric,uuid)'
      ::pg_catalog.regprocedure
  )
  INTO v_definition;
  v_before := v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$     OR NOT internal.kayit_mutasyon_izni_v1(
       p_isletme_id,
       'urunler',
       auth.uid(),
       'create'
     ) THEN$old$,
    $new$     -- Shared staging is harmless by itself; exact row permissions are
     -- checked by the eventual manual movement statement.
     OR NOT (
       internal.kayit_mutasyon_izni_v1(
         p_isletme_id,
         'urunler',
         auth.uid(),
         'create'
       )
       OR internal.kayit_mutasyon_izni_v1(
         p_isletme_id,
         'urunler',
         auth.uid(),
         'update'
       )
       OR internal.kayit_mutasyon_izni_v1(
         p_isletme_id,
         'urunler',
         auth.uid(),
         'delete'
       )
     ) THEN$new$
  );
  IF v_definition IS NOT DISTINCT FROM v_before
     OR v_definition NOT LIKE
       '%exact row permissions are%eventual manual movement%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_UPDATE_RPC_PATCH_DRIFT';
  END IF;

  -- Released UPDATE computes -old_effect + new_effect in JavaScript. Values
  -- such as 0.3 - 0.1 can arrive as 0.19999999999999998 even though both
  -- movement quantities obey the three-decimal contract. Normalize only the
  -- shared staging argument; the owner branch remains byte-for-byte unchanged.
  v_before := v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$    RETURN internal.stage_legacy_shared_product_delta_v1(
      p_isletme_id,
      p_urun_id,
      p_miktar_degisim
    );$old$,
    $new$    RETURN internal.stage_legacy_shared_product_delta_v1(
      p_isletme_id,
      p_urun_id,
      pg_catalog.round(p_miktar_degisim, 3)
    );$new$
  );
  IF v_definition IS NOT DISTINCT FROM v_before
     OR v_definition NOT LIKE
       '%pg_catalog.round(p_miktar_degisim, 3)%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_UPDATE_RPC_ROUND_DRIFT';
  END IF;
  EXECUTE v_definition;
END;
$patch_stage_and_wrapper$;

-- Patch the three live canonical V2 bodies by exact source fragments. A
-- mismatch aborts the migration instead of silently publishing a partial
-- compatibility contract.
DO $patch_canonical_v2$
DECLARE
  v_definition text;
  v_before text;
  v_create_replacement text;
BEGIN
  -- CREATE: generate the movement id before INSERT, then open an exact context.
  SELECT pg_catalog.pg_get_functiondef(
    'public.create_urun_hareket_atomik_v2(uuid,jsonb)'
      ::pg_catalog.regprocedure
  )
  INTO v_definition;
  v_before := v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$  v_hareket public.urun_hareketler;
BEGIN$old$,
    $new$  v_hareket public.urun_hareketler;
  v_uid uuid := auth.uid();
  v_hareket_id uuid := extensions.gen_random_uuid();
BEGIN$new$
  );
  IF v_definition IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_CREATE_V2_DECLARE_DRIFT';
  END IF;

  v_create_replacement := $replacement$  IF v_islem_id IS NULL
     AND NOT internal.isletme_sahibi_v1(p_isletme_id) THEN
    PERFORM internal.open_canonical_unlinked_product_context_v1(
      'create',
      v_hareket_id,
      p_isletme_id,
      v_urun_id,
      NULL::uuid,
      NULL::text,
      NULL::numeric,
      NULL::numeric,
      NULL::numeric,
      v_uid,
      v_hareket_tipi,
      v_miktar,
      v_onceki_miktar,
      v_yeni_miktar
    );
  END IF;

  INSERT INTO public.urun_hareketler (
    id, isletme_id, urun_id, islem_id, hareket_tipi, miktar,
    birim_fiyat, kdv_orani, onceki_miktar, yeni_miktar,
    aciklama, created_at
  )
  VALUES (
    v_hareket_id, p_isletme_id, v_urun_id, v_islem_id,
    v_hareket_tipi, v_miktar, v_birim_fiyat, v_kdv_orani,
    v_onceki_miktar, v_yeni_miktar, v_aciklama,
    COALESCE(v_created_at, pg_catalog.clock_timestamp())
  )
  RETURNING * INTO v_hareket;

  IF v_islem_id IS NULL
     AND NOT internal.isletme_sahibi_v1(p_isletme_id) THEN
    PERFORM
      internal.assert_canonical_unlinked_product_context_consumed_v1(
        'create', v_hareket_id
      );
  END IF;

  RETURN pg_catalog.to_jsonb(v_hareket);$replacement$;

  v_before := v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$  INSERT INTO public.urun_hareketler (
    isletme_id, urun_id, islem_id, hareket_tipi, miktar,
    birim_fiyat, kdv_orani, onceki_miktar, yeni_miktar,
    aciklama, created_at
  )
  VALUES (
    p_isletme_id, v_urun_id, v_islem_id, v_hareket_tipi, v_miktar,
    v_birim_fiyat, v_kdv_orani, v_onceki_miktar, v_yeni_miktar,
    v_aciklama, COALESCE(v_created_at, pg_catalog.clock_timestamp())
  )
  RETURNING * INTO v_hareket;

  RETURN pg_catalog.to_jsonb(v_hareket);$old$,
    v_create_replacement
  );

  -- Fresh databases preserve the original one-column-per-line source shape,
  -- while production currently has the equivalent compact source shape.
  -- Accept exactly those two audited definitions; any third shape still aborts.
  IF v_definition IS NOT DISTINCT FROM v_before THEN
    v_definition := pg_catalog.replace(
      v_definition,
      $old$  INSERT INTO public.urun_hareketler (
    isletme_id,
    urun_id,
    islem_id,
    hareket_tipi,
    miktar,
    birim_fiyat,
    kdv_orani,
    onceki_miktar,
    yeni_miktar,
    aciklama,
    created_at
  )
  VALUES (
    p_isletme_id,
    v_urun_id,
    v_islem_id,
    v_hareket_tipi,
    v_miktar,
    v_birim_fiyat,
    v_kdv_orani,
    v_onceki_miktar,
    v_yeni_miktar,
    v_aciklama,
    COALESCE(v_created_at, pg_catalog.clock_timestamp())
  )
  RETURNING * INTO v_hareket;

  RETURN pg_catalog.to_jsonb(v_hareket);$old$,
      v_create_replacement
    );
  END IF;

  IF v_definition IS NOT DISTINCT FROM v_before
     OR v_definition NOT LIKE
       '%open_canonical_unlinked_product_context_v1%'
     OR v_definition NOT LIKE
       '%assert_canonical_unlinked_product_context_consumed_v1%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_CREATE_V2_DML_DRIFT';
  END IF;
  EXECUTE v_definition;

  -- UPDATE: stock is already adjusted; mark the exact OLD/NEW row transition.
  SELECT pg_catalog.pg_get_functiondef(
    'public.update_urun_hareket_atomik_v2(uuid,uuid,jsonb)'
      ::pg_catalog.regprocedure
  )
  INTO v_definition;
  v_before := v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$  UPDATE public.urun_hareketler AS movement
  SET hareket_tipi = v_hareket_tipi,
      miktar = v_miktar,
      birim_fiyat = v_birim_fiyat,
      yeni_miktar = v_urun_miktar,
      created_at = v_created_at
  WHERE movement.id = p_hareket_id
    AND movement.isletme_id = p_isletme_id
  RETURNING movement.* INTO v_hareket;

  RETURN pg_catalog.to_jsonb(v_hareket);$old$,
    $new$  IF NOT internal.isletme_sahibi_v1(p_isletme_id) THEN
    PERFORM internal.open_canonical_unlinked_product_context_v1(
      'update',
      p_hareket_id,
      p_isletme_id,
      v_hareket.urun_id,
      v_hareket.created_by,
      v_hareket.hareket_tipi,
      v_hareket.miktar,
      v_hareket.onceki_miktar,
      v_hareket.yeni_miktar,
      v_hareket.created_by,
      v_hareket_tipi,
      v_miktar,
      v_hareket.onceki_miktar,
      v_urun_miktar
    );
  END IF;

  UPDATE public.urun_hareketler AS movement
  SET hareket_tipi = v_hareket_tipi,
      miktar = v_miktar,
      birim_fiyat = v_birim_fiyat,
      yeni_miktar = v_urun_miktar,
      created_at = v_created_at
  WHERE movement.id = p_hareket_id
    AND movement.isletme_id = p_isletme_id
  RETURNING movement.* INTO v_hareket;

  IF NOT internal.isletme_sahibi_v1(p_isletme_id) THEN
    PERFORM
      internal.assert_canonical_unlinked_product_context_consumed_v1(
        'update', p_hareket_id
      );
  END IF;

  RETURN pg_catalog.to_jsonb(v_hareket);$new$
  );
  IF v_definition IS NOT DISTINCT FROM v_before
     OR v_definition NOT LIKE
       '%open_canonical_unlinked_product_context_v1%'
     OR v_definition NOT LIKE
       '%assert_canonical_unlinked_product_context_consumed_v1%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_UPDATE_V2_DML_DRIFT';
  END IF;
  EXECUTE v_definition;

  -- DELETE: stock is already reversed; mark the exact OLD row being removed.
  SELECT pg_catalog.pg_get_functiondef(
    'public.delete_urun_hareket_atomik_v2(uuid,uuid)'
      ::pg_catalog.regprocedure
  )
  INTO v_definition;
  v_before := v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$  DELETE FROM public.urun_hareketler AS movement
  WHERE movement.id = p_hareket_id
    AND movement.isletme_id = p_isletme_id;

  RETURN true;$old$,
    $new$  IF NOT internal.isletme_sahibi_v1(p_isletme_id) THEN
    PERFORM internal.open_canonical_unlinked_product_context_v1(
      'delete',
      p_hareket_id,
      p_isletme_id,
      v_hareket.urun_id,
      v_hareket.created_by,
      v_hareket.hareket_tipi,
      v_hareket.miktar,
      v_hareket.onceki_miktar,
      v_hareket.yeni_miktar,
      NULL::uuid,
      NULL::text,
      NULL::numeric,
      NULL::numeric,
      NULL::numeric
    );
  END IF;

  DELETE FROM public.urun_hareketler AS movement
  WHERE movement.id = p_hareket_id
    AND movement.isletme_id = p_isletme_id;

  IF NOT internal.isletme_sahibi_v1(p_isletme_id) THEN
    PERFORM
      internal.assert_canonical_unlinked_product_context_consumed_v1(
        'delete', p_hareket_id
      );
  END IF;

  RETURN true;$new$
  );
  IF v_definition IS NOT DISTINCT FROM v_before
     OR v_definition NOT LIKE
       '%open_canonical_unlinked_product_context_v1%'
     OR v_definition NOT LIKE
       '%assert_canonical_unlinked_product_context_consumed_v1%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_DELETE_V2_DML_DRIFT';
  END IF;
  EXECUTE v_definition;
END;
$patch_canonical_v2$;

CREATE TRIGGER trg_02_legacy_shared_product_unlinked_mutation_v1
BEFORE INSERT OR UPDATE OR DELETE
ON public.urun_hareketler
FOR EACH ROW
EXECUTE FUNCTION
  internal.bridge_legacy_shared_product_unlinked_mutation_v1();

CREATE TRIGGER
  trg_zy_legacy_shared_product_unlinked_mutation_cleanup_v1
AFTER INSERT OR UPDATE OR DELETE
ON public.urun_hareketler
FOR EACH ROW
EXECUTE FUNCTION
  internal.cleanup_legacy_shared_product_unlinked_mutation_v1();

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
  OR internal.legacy_shared_product_unlinked_context_allowed_v1(
    'create',
    urun_hareketler.id,
    urun_hareketler.isletme_id,
    urun_hareketler.urun_id,
    urun_hareketler.islem_id,
    urun_hareketler.created_by,
    urun_hareketler.hareket_tipi,
    urun_hareketler.miktar,
    urun_hareketler.onceki_miktar,
    urun_hareketler.yeni_miktar
  )
);

ALTER POLICY "Permission v2 direct update urun hareketleri owner only"
ON public.urun_hareketler
USING (
  internal.isletme_sahibi_v1(urun_hareketler.isletme_id)
  OR internal.legacy_shared_product_unlinked_old_row_allowed_v1(
    'update',
    urun_hareketler.id,
    urun_hareketler.isletme_id,
    urun_hareketler.urun_id,
    urun_hareketler.islem_id,
    urun_hareketler.created_by,
    urun_hareketler.hareket_tipi,
    urun_hareketler.miktar,
    urun_hareketler.onceki_miktar,
    urun_hareketler.yeni_miktar
  )
)
WITH CHECK (
  internal.isletme_sahibi_v1(urun_hareketler.isletme_id)
  OR internal.legacy_shared_product_unlinked_context_allowed_v1(
    'update',
    urun_hareketler.id,
    urun_hareketler.isletme_id,
    urun_hareketler.urun_id,
    urun_hareketler.islem_id,
    urun_hareketler.created_by,
    urun_hareketler.hareket_tipi,
    urun_hareketler.miktar,
    urun_hareketler.onceki_miktar,
    urun_hareketler.yeni_miktar
  )
);

ALTER POLICY "Permission v2 direct delete urun hareketleri owner only"
ON public.urun_hareketler
USING (
  internal.isletme_sahibi_v1(urun_hareketler.isletme_id)
  OR internal.legacy_shared_product_unlinked_old_row_allowed_v1(
    'delete',
    urun_hareketler.id,
    urun_hareketler.isletme_id,
    urun_hareketler.urun_id,
    urun_hareketler.islem_id,
    urun_hareketler.created_by,
    urun_hareketler.hareket_tipi,
    urun_hareketler.miktar,
    urun_hareketler.onceki_miktar,
    urun_hareketler.yeni_miktar
  )
);

COMMENT ON TABLE
  internal.legacy_shared_product_unlinked_mutation_context_v1 IS
  'Exact private transaction-local proof for canonical or released legacy manual product movement DML.';
COMMENT ON FUNCTION
  internal.legacy_shared_product_unlinked_old_row_allowed_v1(
    text, uuid, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric
  ) IS
  'Restrictive pre-trigger RLS gate for exact manual movement update/delete own/all permission.';
COMMENT ON FUNCTION
  internal.legacy_shared_product_unlinked_context_allowed_v1(
    text, uuid, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric
  ) IS
  'VOLATILE restrictive post-trigger RLS gate requiring an exact private INSERT/UPDATE context.';
COMMENT ON FUNCTION
  internal.bridge_legacy_shared_product_unlinked_mutation_v1() IS
  'Applies an exact released legacy manual movement delta atomically, while exact canonical contexts bypass legacy stock application.';
COMMENT ON FUNCTION
  public.update_urun_miktar(uuid, numeric, uuid) IS
  'Legacy stock adapter: owner applies immediately; a shared actor with any product mutation action stages a private intent whose final row action is checked exactly.';

DO $postcondition$
DECLARE
  v_insert_policy text;
  v_update_using text;
  v_update_check text;
  v_delete_using text;
  v_definition text;
  v_function pg_catalog.pg_proc;
  v_signature text;
BEGIN
  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid =
          'public.urun_hareketler'::pg_catalog.regclass
      AND trigger_row.tgname IN (
        'trg_02_legacy_shared_product_unlinked_mutation_v1',
        'trg_zy_legacy_shared_product_unlinked_mutation_cleanup_v1'
      )
      AND NOT trigger_row.tgisinternal
  ) <> 2 THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_TRIGGER_POSTCONDITION_FAILED';
  END IF;

  -- set_audit_fields must populate created_by before the compatibility bridge.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS audit_trigger
    WHERE audit_trigger.tgrelid =
          'public.urun_hareketler'::pg_catalog.regclass
      AND audit_trigger.tgname = 'set_audit_urun_hareketler'
      AND NOT audit_trigger.tgisinternal
  )
     OR 'set_audit_urun_hareketler' >=
        'trg_02_legacy_shared_product_unlinked_mutation_v1' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_TRIGGER_ORDER_FAILED';
  END IF;

  SELECT policy_row.with_check
  INTO v_insert_policy
  FROM pg_catalog.pg_policies AS policy_row
  WHERE policy_row.schemaname = 'public'
    AND policy_row.tablename = 'urun_hareketler'
    AND policy_row.policyname =
      'Permission v2 direct insert urun hareketleri owner only';

  SELECT policy_row.qual, policy_row.with_check
  INTO v_update_using, v_update_check
  FROM pg_catalog.pg_policies AS policy_row
  WHERE policy_row.schemaname = 'public'
    AND policy_row.tablename = 'urun_hareketler'
    AND policy_row.policyname =
      'Permission v2 direct update urun hareketleri owner only';

  SELECT policy_row.qual
  INTO v_delete_using
  FROM pg_catalog.pg_policies AS policy_row
  WHERE policy_row.schemaname = 'public'
    AND policy_row.tablename = 'urun_hareketler'
    AND policy_row.policyname =
      'Permission v2 direct delete urun hareketleri owner only';

  IF v_insert_policy NOT LIKE
       '%internal.legacy_shared_product_insert_policy_allowed_v1%'
     OR v_insert_policy NOT LIKE
       '%internal.legacy_shared_product_unlinked_context_allowed_v1%'
     OR v_update_using NOT LIKE
       '%internal.legacy_shared_product_unlinked_old_row_allowed_v1%'
     OR v_update_check NOT LIKE
       '%internal.legacy_shared_product_unlinked_context_allowed_v1%'
     OR v_delete_using NOT LIKE
       '%internal.legacy_shared_product_unlinked_old_row_allowed_v1%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_POLICY_POSTCONDITION_FAILED';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'internal.legacy_shared_product_unlinked_old_row_allowed_v1(text,uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)',
    'internal.legacy_shared_product_unlinked_context_allowed_v1(text,uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)',
    'internal.open_canonical_unlinked_product_context_v1(text,uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,uuid,text,numeric,numeric,numeric)',
    'internal.assert_canonical_unlinked_product_context_consumed_v1(text,uuid)',
    'internal.bridge_legacy_shared_product_unlinked_mutation_v1()',
    'internal.cleanup_legacy_shared_product_unlinked_mutation_v1()',
    'internal.stage_legacy_shared_product_delta_v1(uuid,uuid,numeric)',
    'public.update_urun_miktar(uuid,numeric,uuid)',
    'public.create_urun_hareket_atomik_v2(uuid,jsonb)',
    'public.update_urun_hareket_atomik_v2(uuid,uuid,jsonb)',
    'public.delete_urun_hareket_atomik_v2(uuid,uuid)'
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
       ) THEN
      RAISE EXCEPTION
        'LEGACY_SHARED_UNLINKED_MUTATION_FUNCTION_POSTCONDITION_FAILED: %',
        v_signature;
    END IF;
  END LOOP;

  IF (
    SELECT procedure_row.provolatile
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.oid =
      'internal.legacy_shared_product_unlinked_context_allowed_v1(text,uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)'
        ::pg_catalog.regprocedure
  ) IS DISTINCT FROM 'v'
     OR (
       SELECT procedure_row.provolatile
       FROM pg_catalog.pg_proc AS procedure_row
       WHERE procedure_row.oid =
         'internal.legacy_shared_product_unlinked_old_row_allowed_v1(text,uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)'
           ::pg_catalog.regprocedure
     ) IS DISTINCT FROM 's' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_VOLATILITY_POSTCONDITION_FAILED';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
       'authenticated',
       'internal.legacy_shared_product_unlinked_old_row_allowed_v1(text,uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'internal.legacy_shared_product_unlinked_context_allowed_v1(text,uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'internal.legacy_shared_product_unlinked_old_row_allowed_v1(text,uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'internal.legacy_shared_product_unlinked_context_allowed_v1(text,uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'internal.open_canonical_unlinked_product_context_v1(text,uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,uuid,text,numeric,numeric,numeric)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'internal.assert_canonical_unlinked_product_context_consumed_v1(text,uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'internal.bridge_legacy_shared_product_unlinked_mutation_v1()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'internal.cleanup_legacy_shared_product_unlinked_mutation_v1()',
       'EXECUTE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'internal.legacy_shared_product_unlinked_mutation_context_v1',
       'SELECT'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'internal.legacy_shared_product_unlinked_mutation_context_v1',
       'INSERT'
     )
     OR pg_catalog.has_table_privilege(
       'service_role',
       'internal.legacy_shared_product_unlinked_mutation_context_v1',
       'SELECT'
     ) THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_ACL_POSTCONDITION_FAILED';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.update_urun_miktar(uuid,numeric,uuid)',
    'public.create_urun_hareket_atomik_v2(uuid,jsonb)',
    'public.update_urun_hareket_atomik_v2(uuid,uuid,jsonb)',
    'public.delete_urun_hareket_atomik_v2(uuid,uuid)'
  ]::text[] LOOP
    IF NOT pg_catalog.has_function_privilege(
         'authenticated', v_signature, 'EXECUTE'
       )
       OR pg_catalog.has_function_privilege(
         'anon', v_signature, 'EXECUTE'
       )
       OR pg_catalog.has_function_privilege(
         'service_role', v_signature, 'EXECUTE'
       ) THEN
      RAISE EXCEPTION
        'LEGACY_SHARED_UNLINKED_MUTATION_PUBLIC_RPC_ACL_FAILED: %',
        v_signature;
    END IF;
  END LOOP;

  SELECT pg_catalog.pg_get_functiondef(
    'internal.stage_legacy_shared_product_delta_v1(uuid,uuid,numeric)'
      ::pg_catalog.regprocedure
  )
  INTO v_definition;
  IF v_definition NOT LIKE '%any released manual action%'
     OR v_definition NOT LIKE
       '%internal.kayit_mutasyon_izni_v1(%''update''%'
     OR v_definition NOT LIKE
       '%internal.kayit_mutasyon_izni_v1(%''delete''%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_STAGE_POSTCONDITION_FAILED';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.update_urun_miktar(uuid,numeric,uuid)'
      ::pg_catalog.regprocedure
  )
  INTO v_definition;
  IF v_definition NOT LIKE
       '%exact row permissions are%eventual manual movement%'
     OR v_definition NOT LIKE
       '%pg_catalog.round(p_miktar_degisim, 3)%' THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_UPDATE_RPC_POSTCONDITION_FAILED';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.create_urun_hareket_atomik_v2(uuid,jsonb)',
    'public.update_urun_hareket_atomik_v2(uuid,uuid,jsonb)',
    'public.delete_urun_hareket_atomik_v2(uuid,uuid)'
  ]::text[] LOOP
    SELECT pg_catalog.pg_get_functiondef(
      v_signature::pg_catalog.regprocedure
    )
    INTO v_definition;
    IF v_definition NOT LIKE
         '%internal.open_canonical_unlinked_product_context_v1%'
       OR v_definition NOT LIKE
         '%internal.assert_canonical_unlinked_product_context_consumed_v1%' THEN
      RAISE EXCEPTION
        'LEGACY_SHARED_UNLINKED_MUTATION_CANONICAL_PATCH_FAILED: %',
        v_signature;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM internal.legacy_shared_product_unlinked_mutation_context_v1
  ) THEN
    RAISE EXCEPTION
      'LEGACY_SHARED_UNLINKED_MUTATION_CONTEXT_NOT_EMPTY';
  END IF;
END;
$postcondition$;

COMMIT;
