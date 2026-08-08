-- Deleting an auth user cascades the owned business before its islemler rows.
-- The AFTER DELETE transaction trigger then tries to insert an audit row for
-- a business that no longer exists, violating the audit table's business FK.
-- Those audit rows would be deleted by the same business cascade anyway.
--
-- Keep normal transaction-delete auditing unchanged. Skip only when the
-- transaction's business row is already absent inside the cascade.
--
-- 1.5.x / OLD CLIENT EFFECT:
-- None. No table, FK, trigger, RLS policy, function signature, or grant changes.
-- Active businesses keep the same transaction audit behavior.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.log_islem_changes()'
  );
  v_definition text;
  v_eol text;
  v_before constant text := '    IF TG_OP = ''DELETE'' THEN';
  v_clean_replay_before constant text := '  IF TG_OP = ''DELETE'' THEN';
  v_source_before text;
  v_after text;
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
     OR pg_catalog.strpos(
          v_definition,
          'FROM auth.users AS auth_user'
        ) = 0
  THEN
    RAISE EXCEPTION
      'MIGRATION_PRECONDITION_FAILED:log_islem_changes_contract_changed';
  END IF;

  v_eol := CASE
    WHEN pg_catalog.strpos(v_definition, E'\r\n') > 0 THEN E'\r\n'
    ELSE E'\n'
  END;
  v_after :=
    CASE
      WHEN pg_catalog.strpos(v_definition, v_before) > 0 THEN v_before
      ELSE v_clean_replay_before
    END;
  v_source_before := v_after;
  v_after :=
    v_source_before || v_eol ||
    '      -- A parent-business cascade has no durable audit destination.' || v_eol ||
    '      IF NOT EXISTS (' || v_eol ||
    '        SELECT 1' || v_eol ||
    '        FROM public.isletmeler AS business_row' || v_eol ||
    '        WHERE business_row.id = OLD.isletme_id' || v_eol ||
    '      ) THEN' || v_eol ||
    '        RETURN OLD;' || v_eol ||
    '      END IF;';

  IF pg_catalog.strpos(
       v_definition,
       'A parent-business cascade has no durable audit destination.'
     ) = 0
  THEN
    v_match_count := (
      pg_catalog.length(v_definition)
      - pg_catalog.length(
          pg_catalog.replace(v_definition, v_source_before, '')
        )
    ) / pg_catalog.length(v_source_before);

    IF v_match_count <> 1 THEN
      RAISE EXCEPTION
        'MIGRATION_PRECONDITION_FAILED:delete_branch_matches_%',
        v_match_count;
    END IF;

    v_definition := pg_catalog.replace(
      v_definition,
      v_source_before,
      v_after
    );
    EXECUTE v_definition;
  END IF;

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

  IF pg_catalog.strpos(
       v_definition,
       'A parent-business cascade has no durable audit destination.'
     ) = 0
     OR pg_catalog.strpos(
          v_definition,
          'FROM public.isletmeler AS business_row'
        ) = 0
     OR pg_catalog.strpos(
          v_definition,
          'WHERE business_row.id = OLD.isletme_id'
        ) = 0
     OR pg_catalog.strpos(v_definition, 'FROM auth.users AS auth_user') = 0
  THEN
    RAISE EXCEPTION
      'MIGRATION_POSTCONDITION_FAILED:business_cascade_guard_missing';
  END IF;
END;
$migration$;
