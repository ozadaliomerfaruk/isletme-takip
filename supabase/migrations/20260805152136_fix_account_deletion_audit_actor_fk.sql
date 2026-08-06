-- Auth deletion cascades an owned business and its transactions. The existing
-- transaction audit trigger records OLD.updated_by when auth.uid() is null.
-- During auth.users deletion that actor row is already gone, so the audit
-- INSERT violates islem_audit_log_performed_by_fkey before the cascade can
-- finish.
--
-- Keep normal audit attribution unchanged. Only normalize the actor to NULL
-- when the selected UUID no longer exists in auth.users, matching the FK's
-- existing ON DELETE SET NULL contract.
--
-- 1.5.x / OLD CLIENT EFFECT:
-- None. No table, FK, trigger, RLS policy, function signature, or grant changes.
-- Active-user updates/deletes keep the same performed_by UUID.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.log_islem_changes()'
  );
  v_definition text;
  v_old_delete constant text :=
    'COALESCE(auth.uid(), OLD.updated_by)';
  v_new_delete constant text := $replacement$
(SELECT auth_user.id
       FROM auth.users AS auth_user
       WHERE auth_user.id = CASE
         WHEN auth.uid() IS NOT NULL THEN auth.uid()
         ELSE OLD.updated_by
       END)$replacement$;
  v_old_update constant text :=
    'COALESCE(auth.uid(), NEW.updated_by)';
  v_new_update constant text := $replacement$
(SELECT auth_user.id
       FROM auth.users AS auth_user
       WHERE auth_user.id = CASE
         WHEN auth.uid() IS NOT NULL THEN auth.uid()
         ELSE NEW.updated_by
       END)$replacement$;
  v_owner oid;
  v_acl aclitem[];
  v_security_definer boolean;
  v_config text[];
  v_language oid;
  v_identity_arguments text;
  v_result_type text;
  v_match_count integer;
BEGIN
  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION
      'MIGRATION_PRECONDITION_FAILED:log_islem_changes_missing';
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

  IF v_identity_arguments IS DISTINCT FROM ''
     OR v_result_type IS DISTINCT FROM 'trigger'
     OR v_security_definer IS NOT TRUE
     OR v_config IS DISTINCT FROM
       ARRAY['search_path=public, pg_temp']::text[]
  THEN
    RAISE EXCEPTION
      'MIGRATION_PRECONDITION_FAILED:log_islem_changes_contract_changed';
  END IF;

  IF pg_catalog.strpos(v_definition, v_new_delete) = 0 THEN
    v_match_count := (
      pg_catalog.length(v_definition)
      - pg_catalog.length(
          pg_catalog.replace(v_definition, v_old_delete, '')
        )
    ) / pg_catalog.length(v_old_delete);

    IF v_match_count <> 1 THEN
      RAISE EXCEPTION
        'MIGRATION_PRECONDITION_FAILED:delete_actor_matches_%',
        v_match_count;
    END IF;

    v_definition := pg_catalog.replace(
      v_definition,
      v_old_delete,
      v_new_delete
    );
  END IF;

  IF pg_catalog.strpos(v_definition, v_new_update) = 0 THEN
    v_match_count := (
      pg_catalog.length(v_definition)
      - pg_catalog.length(
          pg_catalog.replace(v_definition, v_old_update, '')
        )
    ) / pg_catalog.length(v_old_update);

    IF v_match_count <> 1 THEN
      RAISE EXCEPTION
        'MIGRATION_PRECONDITION_FAILED:update_actor_matches_%',
        v_match_count;
    END IF;

    v_definition := pg_catalog.replace(
      v_definition,
      v_old_update,
      v_new_update
    );
  END IF;

  EXECUTE v_definition;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.log_islem_changes()'
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
      'MIGRATION_POSTCONDITION_FAILED:log_islem_changes_contract_changed';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(proc.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid = v_function_oid;

  IF pg_catalog.strpos(v_definition, v_new_delete) = 0
     OR pg_catalog.strpos(v_definition, v_new_update) = 0
     OR pg_catalog.strpos(v_definition, v_old_delete) <> 0
     OR pg_catalog.strpos(v_definition, v_old_update) <> 0
  THEN
    RAISE EXCEPTION
      'MIGRATION_POSTCONDITION_FAILED:audit_actor_guard_missing';
  END IF;
END;
$migration$;
