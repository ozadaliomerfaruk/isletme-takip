-- =============================================================================
-- FIX LEGACY SHARED LINKED PRODUCT INSERT / RLS ORDER
--
-- PostgreSQL evaluates INSERT WITH CHECK policies after BEFORE ROW triggers.
-- The original legacy bridge consumed its private staged intent in the BEFORE
-- trigger. The restrictive policy therefore could no longer see the intent and
-- rejected the row, rolling the whole statement back.
--
-- Keep the intent through the policy check and consume it only from the exact
-- AFTER-trigger context. The policy helper intentionally remains STABLE:
-- PostgreSQL then evaluates the product quantity from the statement-start
-- snapshot, before the bridge's same-statement stock update.
--
-- Data safety:
--   * no application/user rows are changed by this migration;
--   * no table, column, public function, policy, or trigger is dropped;
--   * existing function signatures, ownership and grants stay unchanged;
--   * only private, short-lived compatibility intents are consumed at runtime.
--
-- Released 1.5.x clients:
--   Shared users with product/create permission can again complete the old
--   two-request linked product flow. Owners and canonical V2/V3 clients keep
--   their existing behavior. Failed statements still roll back stock and keep
--   the intent available for the released client's compensation request.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

DO $precondition$
DECLARE
  v_bridge_definition text;
  v_cleanup_definition text;
  v_policy text;
  v_function pg_catalog.pg_proc;
  v_delete_block constant text := $block$  DELETE FROM internal.legacy_shared_product_delta_intents_v1 AS intent
  WHERE intent.actor_user_id = v_uid
    AND intent.isletme_id = NEW.isletme_id
    AND intent.urun_id = NEW.urun_id;

$block$;
BEGIN
  IF pg_catalog.to_regclass(
       'internal.legacy_shared_product_delta_intents_v1'
     ) IS NULL
     OR pg_catalog.to_regclass(
       'internal.legacy_shared_product_insert_context_v1'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.legacy_shared_product_insert_policy_allowed_v1(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.bridge_legacy_shared_product_insert_v1()'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.cleanup_legacy_shared_product_insert_v1()'
     ) IS NULL THEN
    RAISE EXCEPTION 'LEGACY_SHARED_LINKED_RLS_ORDER_SCHEMA_MISMATCH';
  END IF;

  SELECT procedure_row.*
  INTO v_function
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid =
    'internal.legacy_shared_product_insert_policy_allowed_v1(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)'::pg_catalog.regprocedure;

  IF v_function.provolatile IS DISTINCT FROM 's'
     OR v_function.prosecdef IS NOT TRUE
     OR pg_catalog.pg_get_userbyid(v_function.proowner)
        IS DISTINCT FROM 'postgres'
     OR NOT (
       COALESCE(v_function.proconfig, ARRAY[]::text[])
       @> ARRAY['search_path=""']::text[]
     ) THEN
    RAISE EXCEPTION 'LEGACY_SHARED_LINKED_POLICY_HELPER_DRIFT';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'internal.bridge_legacy_shared_product_insert_v1()'::pg_catalog.regprocedure
  )
  INTO v_bridge_definition;

  IF (
    pg_catalog.length(v_bridge_definition)
    - pg_catalog.length(
        pg_catalog.replace(v_bridge_definition, v_delete_block, '')
      )
  ) / pg_catalog.length(v_delete_block) <> 1 THEN
    RAISE EXCEPTION 'LEGACY_SHARED_LINKED_BRIDGE_DELETE_DRIFT';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'internal.cleanup_legacy_shared_product_insert_v1()'::pg_catalog.regprocedure
  )
  INTO v_cleanup_definition;

  IF v_cleanup_definition LIKE
       '%DELETE FROM internal.legacy_shared_product_delta_intents_v1%'
     OR v_cleanup_definition NOT LIKE
       '%IF v_context_count > 0 THEN%'
     OR v_cleanup_definition NOT LIKE
       '%DELETE FROM internal.permission_v2_movement_action_context%' THEN
    RAISE EXCEPTION 'LEGACY_SHARED_LINKED_CLEANUP_DRIFT';
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
    RAISE EXCEPTION 'LEGACY_SHARED_LINKED_POLICY_DRIFT';
  END IF;
END;
$precondition$;

DO $patch$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'internal.bridge_legacy_shared_product_insert_v1()'::pg_catalog.regprocedure
  )
  INTO v_definition;
  v_before := v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$  DELETE FROM internal.legacy_shared_product_delta_intents_v1 AS intent
  WHERE intent.actor_user_id = v_uid
    AND intent.isletme_id = NEW.isletme_id
    AND intent.urun_id = NEW.urun_id;

$old$,
    ''
  );
  IF v_definition IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'LEGACY_SHARED_LINKED_BRIDGE_PATCH_DRIFT';
  END IF;
  EXECUTE v_definition;

  SELECT pg_catalog.pg_get_functiondef(
    'internal.cleanup_legacy_shared_product_insert_v1()'::pg_catalog.regprocedure
  )
  INTO v_definition;
  v_before := v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$  IF v_context_count > 0 THEN
    DELETE FROM internal.permission_v2_movement_action_context AS action_context$old$,
    $new$  IF v_context_count > 0 THEN
    -- WITH CHECK has succeeded. Consume only the intent represented by this
    -- exact transaction-local context; any later error rolls this DELETE back.
    DELETE FROM internal.legacy_shared_product_delta_intents_v1 AS intent
    WHERE intent.actor_user_id = auth.uid()
      AND intent.isletme_id = NEW.isletme_id
      AND intent.urun_id = NEW.urun_id;

    DELETE FROM internal.permission_v2_movement_action_context AS action_context$new$
  );
  IF v_definition IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'LEGACY_SHARED_LINKED_CLEANUP_PATCH_DRIFT';
  END IF;
  EXECUTE v_definition;
END;
$patch$;

DO $postcondition$
DECLARE
  v_bridge_definition text;
  v_cleanup_definition text;
  v_function pg_catalog.pg_proc;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'internal.bridge_legacy_shared_product_insert_v1()'::pg_catalog.regprocedure
  )
  INTO v_bridge_definition;
  SELECT pg_catalog.pg_get_functiondef(
    'internal.cleanup_legacy_shared_product_insert_v1()'::pg_catalog.regprocedure
  )
  INTO v_cleanup_definition;

  IF v_bridge_definition LIKE
       '%DELETE FROM internal.legacy_shared_product_delta_intents_v1%'
     OR v_cleanup_definition NOT LIKE
       '%IF v_context_count > 0 THEN%'
     OR v_cleanup_definition NOT LIKE
       '%DELETE FROM internal.legacy_shared_product_delta_intents_v1%'
     OR pg_catalog.strpos(
          v_cleanup_definition,
          'DELETE FROM internal.legacy_shared_product_delta_intents_v1'
        )
        >= pg_catalog.strpos(
          v_cleanup_definition,
          'DELETE FROM internal.permission_v2_movement_action_context'
        ) THEN
    RAISE EXCEPTION 'LEGACY_SHARED_LINKED_RLS_ORDER_POSTCONDITION_FAILED';
  END IF;

  SELECT procedure_row.*
  INTO v_function
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid =
    'internal.legacy_shared_product_insert_policy_allowed_v1(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)'::pg_catalog.regprocedure;

  IF v_function.provolatile IS DISTINCT FROM 's'
     OR v_function.prosecdef IS NOT TRUE
     OR pg_catalog.pg_get_userbyid(v_function.proowner)
        IS DISTINCT FROM 'postgres'
     OR NOT (
       COALESCE(v_function.proconfig, ARRAY[]::text[])
       @> ARRAY['search_path=""']::text[]
     )
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'internal.legacy_shared_product_insert_policy_allowed_v1(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'internal.legacy_shared_product_insert_policy_allowed_v1(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'internal.legacy_shared_product_insert_policy_allowed_v1(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'LEGACY_SHARED_LINKED_HELPER_POSTCONDITION_FAILED';
  END IF;
END;
$postcondition$;

COMMIT;
