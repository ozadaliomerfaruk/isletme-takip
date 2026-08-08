-- Scheduled account deletion must clear only references owned by the due,
-- still-pending deletion job before Auth removes that user.
--
-- SCOPE:
--   * Does not change any FK, table, column, RLS policy, trigger, or RPC
--     signature.
--   * The invite DELETE is injected inside the canonical preflight's existing
--     `pending` + post-due-activity + zero-Storage-residue safety fence.
--   * A job is refused when its owned business still has any other member;
--     another user's membership or business data is never cascade-deleted.
--   * It removes only invite rows in the job's own business that reference the
--     deleting user. Other businesses and other users' invite references are
--     left to the existing transfer/detach logic.
--   * Category validation triggers remain SECURITY INVOKER. Audit-only FK
--     updates return before reading category rows; real hierarchy/type changes
--     keep the existing validation semantics.
--
-- 1.5.x / OLD CLIENT EFFECT:
--   None. The mobile API contracts and function signatures are unchanged.
--   Active users keep the same category and invite behavior. Only a due,
--   server-claimed account-deletion job can reach the new cleanup statement.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.prepare_account_deletion_storage_v1(uuid)'
  );
  v_definition text;
  v_before constant text := E'IF v_auth_user_exists AND v_remaining_count = 0 THEN\n    -- Clear only attribution FKs that historically used RESTRICT. Business\n    -- records remain. Other audit columns already use ON DELETE SET NULL and\n    -- memberships use ON DELETE CASCADE.\n    PERFORM pg_catalog.set_config(';
  v_after constant text := E'IF v_auth_user_exists AND v_remaining_count = 0 THEN\n    -- Clear only attribution FKs that historically used RESTRICT. Business\n    -- records remain. Other audit columns already use ON DELETE SET NULL and\n    -- memberships use ON DELETE CASCADE.\n    --\n    -- The business row is intentionally still present here. Remove only its\n    -- invite rows that reference the deleting user so auth.users can cascade\n    -- the already-due business without crossing into another tenant.\n    DELETE FROM public.isletme_invites AS invite_row\n    WHERE v_job.isletme_id IS NOT NULL\n      AND invite_row.isletme_id = v_job.isletme_id\n      AND (\n        invite_row.invited_by = v_job.user_id\n        OR invite_row.accepted_by = v_job.user_id\n      );\n\n    PERFORM pg_catalog.set_config(';
  v_member_before constant text :=
    E'    END IF;\n  ELSIF v_business_exists THEN';
  v_member_after constant text := E'    END IF;\n\n    -- Deleting an owned business would cascade every membership and every row\n    -- created there. Refuse the job if any other account is still a member;\n    -- ownership transfer/removal must be handled explicitly first.\n    IF v_job.isletme_id IS NOT NULL\n       AND EXISTS (\n         SELECT 1\n         FROM public.isletme_users AS member_row\n         WHERE member_row.isletme_id = v_job.isletme_id\n           AND member_row.user_id <> v_job.user_id\n       )\n    THEN\n      RAISE EXCEPTION ''ACCOUNT_DELETE_OTHER_BUSINESS_MEMBERS_PRESENT''\n        USING ERRCODE = ''P0001'';\n    END IF;\n  ELSIF v_business_exists THEN';
  v_match_count integer;
  v_changed boolean := false;
  v_owner oid;
  v_acl aclitem[];
  v_security_definer boolean;
  v_config text[];
  v_language oid;
  v_identity_arguments text;
  v_result_type text;
BEGIN
  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION
      'MIGRATION_PRECONDITION_FAILED:prepare_account_deletion_storage_v1_missing';
  END IF;

  SELECT
    proc.proowner,
    proc.proacl,
    proc.prosecdef,
    proc.proconfig,
    proc.prolang,
    pg_catalog.pg_get_function_identity_arguments(proc.oid),
    pg_catalog.pg_get_function_result(proc.oid),
    pg_catalog.pg_get_functiondef(proc.oid)
  INTO
    v_owner,
    v_acl,
    v_security_definer,
    v_config,
    v_language,
    v_identity_arguments,
    v_result_type,
    v_definition
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid = v_function_oid;

  -- Exact body patches must behave identically on Windows (CRLF) and CI (LF).
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');

  IF v_identity_arguments IS DISTINCT FROM 'p_user_id uuid'
     OR v_result_type IS DISTINCT FROM
       'TABLE(job_state text, business_exists boolean, auth_user_exists boolean, user_id uuid, scheduled_deletion_at timestamp with time zone, paths text[], remaining_count bigint, transferred_count bigint)'
     OR v_security_definer IS NOT TRUE
     OR v_config IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
  THEN
    RAISE EXCEPTION
      'MIGRATION_PRECONDITION_FAILED:prepare_account_deletion_storage_v1_contract_changed';
  END IF;

  IF pg_catalog.strpos(v_definition, v_after) = 0 THEN
    v_match_count := (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_before, ''))
    ) / pg_catalog.length(v_before);

    IF v_match_count <> 1 THEN
      RAISE EXCEPTION
        'MIGRATION_PRECONDITION_FAILED:account_deletion_invite_gate_matches_%',
        v_match_count;
    END IF;

    v_definition := pg_catalog.replace(v_definition, v_before, v_after);
    v_changed := true;
  END IF;

  IF pg_catalog.strpos(v_definition, v_member_after) = 0 THEN
    v_match_count := (
      pg_catalog.length(v_definition)
      - pg_catalog.length(
          pg_catalog.replace(v_definition, v_member_before, '')
        )
    ) / pg_catalog.length(v_member_before);

    IF v_match_count <> 1 THEN
      RAISE EXCEPTION
        'MIGRATION_PRECONDITION_FAILED:account_deletion_member_gate_matches_%',
        v_match_count;
    END IF;

    v_definition := pg_catalog.replace(
      v_definition,
      v_member_before,
      v_member_after
    );
    v_changed := true;
  END IF;

  IF v_changed THEN
    EXECUTE v_definition;
  END IF;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.prepare_account_deletion_storage_v1(uuid)'
  );

  IF v_function_oid IS NULL OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    WHERE proc.oid = v_function_oid
      AND (
        proc.proowner IS DISTINCT FROM v_owner
        OR proc.proacl IS DISTINCT FROM v_acl
        OR proc.prosecdef IS DISTINCT FROM v_security_definer
        OR proc.proconfig IS DISTINCT FROM v_config
        OR proc.prolang IS DISTINCT FROM v_language
        OR pg_catalog.pg_get_function_identity_arguments(proc.oid)
          IS DISTINCT FROM v_identity_arguments
        OR pg_catalog.pg_get_function_result(proc.oid)
          IS DISTINCT FROM v_result_type
      )
  ) THEN
    RAISE EXCEPTION
      'MIGRATION_POSTCONDITION_FAILED:prepare_account_deletion_storage_v1_contract_changed';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(proc.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid = v_function_oid;

  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');

  IF pg_catalog.strpos(v_definition, v_after) = 0
     OR pg_catalog.strpos(v_definition, v_before) <> 0
     OR pg_catalog.strpos(v_definition, v_member_after) = 0
  THEN
    RAISE EXCEPTION
      'MIGRATION_POSTCONDITION_FAILED:account_deletion_invite_cleanup_missing';
  END IF;
END;
$migration$;

DO $migration$
DECLARE
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.check_kategori_no_cycle()'
  );
  v_definition text;
  v_header_before constant text := E' LANGUAGE plpgsql\nAS $function$';
  v_header_after constant text := E' LANGUAGE plpgsql\n SET search_path TO ''pg_catalog''\nAS $function$';
  v_eol text;
  v_body_before text;
  v_body_after text;
  v_query_before constant text :=
    'SELECT parent_id INTO current_parent FROM kategoriler WHERE id = current_parent;';
  v_query_after constant text :=
    'SELECT parent_id INTO current_parent FROM public.kategoriler WHERE id = current_parent;';
  v_owner oid;
  v_acl aclitem[];
  v_language oid;
  v_result_type text;
BEGIN
  IF v_function_oid IS NULL THEN
    -- Temiz repo replay'inde tarihsel parent_id kolonu ve bu trigger birlikte
    -- yoktur. Parent kolonu varsa fonksiyonun kaybi gercek drift sayilir.
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute_row
      WHERE attribute_row.attrelid = pg_catalog.to_regclass('public.kategoriler')
        AND attribute_row.attname = 'parent_id'
        AND attribute_row.attnum > 0
        AND NOT attribute_row.attisdropped
    ) THEN
      RAISE EXCEPTION
        'MIGRATION_PRECONDITION_FAILED:check_kategori_no_cycle_missing';
    END IF;
    RETURN;
  END IF;

  SELECT
    proc.proowner,
    proc.proacl,
    proc.prolang,
    pg_catalog.pg_get_function_result(proc.oid),
    pg_catalog.pg_get_functiondef(proc.oid)
  INTO v_owner, v_acl, v_language, v_result_type, v_definition
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid = v_function_oid;

  v_eol := CASE
    WHEN pg_catalog.strpos(v_definition, E'\r\n') > 0 THEN E'\r\n'
    ELSE E'\n'
  END;
  v_body_before :=
    'BEGIN' || v_eol ||
    '  IF NEW.parent_id IS NOT NULL THEN';
  v_body_after :=
    'BEGIN' || v_eol ||
    '  -- auth.users ON DELETE SET NULL changes only audit columns. Avoid a' || v_eol ||
    '  -- hierarchy read under the Auth role when hierarchy identity is unchanged.' || v_eol ||
    '  IF TG_OP = ''UPDATE'' THEN' || v_eol ||
    '    IF NEW.id IS NOT DISTINCT FROM OLD.id' || v_eol ||
    '       AND NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id THEN' || v_eol ||
    '      RETURN NEW;' || v_eol ||
    '    END IF;' || v_eol ||
    '  END IF;' || v_eol || v_eol ||
    '  IF NEW.parent_id IS NOT NULL THEN';

  IF v_result_type IS DISTINCT FROM 'trigger' THEN
    RAISE EXCEPTION
      'MIGRATION_PRECONDITION_FAILED:check_kategori_no_cycle_contract_changed';
  END IF;

  IF pg_catalog.strpos(v_definition, v_body_after) = 0 THEN
    IF pg_catalog.strpos(v_definition, v_header_before) = 0
       OR pg_catalog.strpos(v_definition, v_body_before) = 0
       OR pg_catalog.strpos(v_definition, v_query_before) = 0
    THEN
      RAISE EXCEPTION
        'MIGRATION_PRECONDITION_FAILED:check_kategori_no_cycle_body_changed';
    END IF;

    v_definition := pg_catalog.replace(
      v_definition,
      v_header_before,
      v_header_after
    );
    v_definition := pg_catalog.replace(
      v_definition,
      v_body_before,
      v_body_after
    );
    v_definition := pg_catalog.replace(
      v_definition,
      v_query_before,
      v_query_after
    );
    EXECUTE v_definition;
  END IF;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.check_kategori_no_cycle()'
  );

  IF v_function_oid IS NULL OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    WHERE proc.oid = v_function_oid
      AND (
        proc.proowner IS DISTINCT FROM v_owner
        OR proc.proacl IS DISTINCT FROM v_acl
        OR proc.prolang IS DISTINCT FROM v_language
        OR proc.prosecdef IS NOT FALSE
        OR proc.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
        OR pg_catalog.pg_get_function_result(proc.oid)
          IS DISTINCT FROM v_result_type
      )
  ) THEN
    RAISE EXCEPTION
      'MIGRATION_POSTCONDITION_FAILED:check_kategori_no_cycle_contract_changed';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(proc.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid = v_function_oid;

  IF pg_catalog.strpos(v_definition, v_body_after) = 0
     OR pg_catalog.strpos(v_definition, v_query_after) = 0
     OR pg_catalog.strpos(v_definition, v_query_before) <> 0
  THEN
    RAISE EXCEPTION
      'MIGRATION_POSTCONDITION_FAILED:check_kategori_no_cycle_fix_missing';
  END IF;
END;
$migration$;

DO $migration$
DECLARE
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.check_kategori_type_match()'
  );
  v_definition text;
  v_header_before constant text := E' LANGUAGE plpgsql\nAS $function$';
  v_header_after constant text := E' LANGUAGE plpgsql\n SET search_path TO ''pg_catalog''\nAS $function$';
  v_eol text;
  v_body_before text;
  v_body_after text;
  v_query_before constant text :=
    '(SELECT type FROM kategoriler WHERE id = NEW.parent_id)';
  v_query_after constant text :=
    '(SELECT type FROM public.kategoriler WHERE id = NEW.parent_id)';
  v_owner oid;
  v_acl aclitem[];
  v_language oid;
  v_result_type text;
BEGIN
  IF v_function_oid IS NULL THEN
    -- Temiz repo replay'inde tarihsel parent_id kolonu ve bu trigger birlikte
    -- yoktur. Parent kolonu varsa fonksiyonun kaybi gercek drift sayilir.
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute_row
      WHERE attribute_row.attrelid = pg_catalog.to_regclass('public.kategoriler')
        AND attribute_row.attname = 'parent_id'
        AND attribute_row.attnum > 0
        AND NOT attribute_row.attisdropped
    ) THEN
      RAISE EXCEPTION
        'MIGRATION_PRECONDITION_FAILED:check_kategori_type_match_missing';
    END IF;
    RETURN;
  END IF;

  SELECT
    proc.proowner,
    proc.proacl,
    proc.prolang,
    pg_catalog.pg_get_function_result(proc.oid),
    pg_catalog.pg_get_functiondef(proc.oid)
  INTO v_owner, v_acl, v_language, v_result_type, v_definition
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid = v_function_oid;

  v_eol := CASE
    WHEN pg_catalog.strpos(v_definition, E'\r\n') > 0 THEN E'\r\n'
    ELSE E'\n'
  END;
  v_body_before :=
    'BEGIN' || v_eol ||
    '  IF NEW.parent_id IS NOT NULL THEN';
  v_body_after :=
    'BEGIN' || v_eol ||
    '  -- auth.users ON DELETE SET NULL changes only audit columns. Avoid a parent' || v_eol ||
    '  -- category read under the Auth role when the validated fields are unchanged.' || v_eol ||
    '  IF TG_OP = ''UPDATE'' THEN' || v_eol ||
    '    IF NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id' || v_eol ||
    '       AND NEW.type IS NOT DISTINCT FROM OLD.type THEN' || v_eol ||
    '      RETURN NEW;' || v_eol ||
    '    END IF;' || v_eol ||
    '  END IF;' || v_eol || v_eol ||
    '  IF NEW.parent_id IS NOT NULL THEN';

  IF v_result_type IS DISTINCT FROM 'trigger' THEN
    RAISE EXCEPTION
      'MIGRATION_PRECONDITION_FAILED:check_kategori_type_match_contract_changed';
  END IF;

  IF pg_catalog.strpos(v_definition, v_body_after) = 0 THEN
    IF pg_catalog.strpos(v_definition, v_header_before) = 0
       OR pg_catalog.strpos(v_definition, v_body_before) = 0
       OR pg_catalog.strpos(v_definition, v_query_before) = 0
    THEN
      RAISE EXCEPTION
        'MIGRATION_PRECONDITION_FAILED:check_kategori_type_match_body_changed';
    END IF;

    v_definition := pg_catalog.replace(
      v_definition,
      v_header_before,
      v_header_after
    );
    v_definition := pg_catalog.replace(
      v_definition,
      v_body_before,
      v_body_after
    );
    v_definition := pg_catalog.replace(
      v_definition,
      v_query_before,
      v_query_after
    );
    EXECUTE v_definition;
  END IF;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.check_kategori_type_match()'
  );

  IF v_function_oid IS NULL OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    WHERE proc.oid = v_function_oid
      AND (
        proc.proowner IS DISTINCT FROM v_owner
        OR proc.proacl IS DISTINCT FROM v_acl
        OR proc.prolang IS DISTINCT FROM v_language
        OR proc.prosecdef IS NOT FALSE
        OR proc.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
        OR pg_catalog.pg_get_function_result(proc.oid)
          IS DISTINCT FROM v_result_type
      )
  ) THEN
    RAISE EXCEPTION
      'MIGRATION_POSTCONDITION_FAILED:check_kategori_type_match_contract_changed';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(proc.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid = v_function_oid;

  IF pg_catalog.strpos(v_definition, v_body_after) = 0
     OR pg_catalog.strpos(v_definition, v_query_after) = 0
     OR pg_catalog.strpos(v_definition, v_query_before) <> 0
  THEN
    RAISE EXCEPTION
      'MIGRATION_POSTCONDITION_FAILED:check_kategori_type_match_fix_missing';
  END IF;
END;
$migration$;

DO $postcondition$
DECLARE
  v_prepare_definition text := pg_catalog.pg_get_functiondef(
    'public.prepare_account_deletion_storage_v1(uuid)'::regprocedure
  );
BEGIN
  IF pg_catalog.strpos(
       v_prepare_definition,
       'DELETE FROM public.isletme_invites AS invite_row'
     ) = 0
     OR pg_catalog.strpos(
       v_prepare_definition,
       'WHERE v_job.isletme_id IS NOT NULL'
     ) = 0
     OR pg_catalog.strpos(
       v_prepare_definition,
       'AND invite_row.isletme_id = v_job.isletme_id'
     ) = 0
     OR pg_catalog.strpos(
       v_prepare_definition,
       'IF v_job.state <> ''pending'' THEN'
     ) = 0
     OR pg_catalog.strpos(
       v_prepare_definition,
       'account_deletion_has_post_due_user_activity_v1'
     ) = 0
     OR pg_catalog.strpos(
       v_prepare_definition,
       'account_deletion_has_post_due_business_activity_v1'
     ) = 0
     OR pg_catalog.strpos(
       v_prepare_definition,
       'ACCOUNT_DELETE_OTHER_BUSINESS_MEMBERS_PRESENT'
     ) = 0
     OR pg_catalog.strpos(
       v_prepare_definition,
       'member_row.user_id <> v_job.user_id'
     ) = 0
  THEN
    RAISE EXCEPTION
      'MIGRATION_POSTCONDITION_FAILED:account_deletion_active_user_fence_missing';
  END IF;
END;
$postcondition$;
