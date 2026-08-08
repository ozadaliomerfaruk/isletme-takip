-- A parent business can remain visible to the row trigger briefly during an
-- FK cascade even though the later constraint check treats it as deleted.
-- Therefore existence of the business row is not a reliable cascade signal.
--
-- Scope the audit skip to the durable account-deletion job instead: the same
-- business must have a pending job and that job's Auth user must already be
-- absent inside the Auth deletion transaction.
--
-- 1.5.x / OLD CLIENT EFFECT:
-- None. No table, FK, trigger, RLS policy, function signature, or grant changes.
-- Normal transaction and business deletes keep their existing audit behavior.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.log_islem_changes()'
  );
  v_definition text;
  v_eol text;
  v_before text;
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
  v_before :=
    '      -- A parent-business cascade has no durable audit destination.' || v_eol ||
    '      IF NOT EXISTS (' || v_eol ||
    '        SELECT 1' || v_eol ||
    '        FROM public.isletmeler AS business_row' || v_eol ||
    '        WHERE business_row.id = OLD.isletme_id' || v_eol ||
    '      ) THEN' || v_eol ||
    '        RETURN OLD;' || v_eol ||
    '      END IF;';
  v_after :=
    '      -- Skip only the durable Auth-deletion cascade. Ordinary deletes' || v_eol ||
    '      -- keep their existing transaction audit row.' || v_eol ||
    '      IF EXISTS (' || v_eol ||
    '        SELECT 1' || v_eol ||
    '        FROM internal.account_deletion_jobs_v1 AS deletion_job' || v_eol ||
    '        WHERE deletion_job.isletme_id = OLD.isletme_id' || v_eol ||
    '          AND deletion_job.state = ''pending''' || v_eol ||
    '          AND NOT EXISTS (' || v_eol ||
    '            SELECT 1' || v_eol ||
    '            FROM auth.users AS deleting_auth_user' || v_eol ||
    '            WHERE deleting_auth_user.id = deletion_job.user_id' || v_eol ||
    '          )' || v_eol ||
    '      ) THEN' || v_eol ||
    '        RETURN OLD;' || v_eol ||
    '      END IF;';

  IF pg_catalog.strpos(
       v_definition,
       'FROM internal.account_deletion_jobs_v1 AS deletion_job'
     ) = 0
  THEN
    v_match_count := (
      pg_catalog.length(v_definition)
      - pg_catalog.length(
          pg_catalog.replace(v_definition, v_before, '')
        )
    ) / pg_catalog.length(v_before);

    IF v_match_count <> 1 THEN
      RAISE EXCEPTION
        'MIGRATION_PRECONDITION_FAILED:business_guard_matches_%',
        v_match_count;
    END IF;

    v_definition := pg_catalog.replace(
      v_definition,
      v_before,
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
       'FROM internal.account_deletion_jobs_v1 AS deletion_job'
     ) = 0
     OR pg_catalog.strpos(
          v_definition,
          'deletion_job.isletme_id = OLD.isletme_id'
        ) = 0
     OR pg_catalog.strpos(
          v_definition,
          'deletion_job.state = ''pending'''
        ) = 0
     OR pg_catalog.strpos(
          v_definition,
          'deleting_auth_user.id = deletion_job.user_id'
        ) = 0
     OR pg_catalog.strpos(v_definition, 'FROM auth.users AS auth_user') = 0
     OR pg_catalog.strpos(
          v_definition,
          'A parent-business cascade has no durable audit destination.'
        ) <> 0
  THEN
    RAISE EXCEPTION
      'MIGRATION_POSTCONDITION_FAILED:account_deletion_cascade_guard_missing';
  END IF;
END;
$migration$;
