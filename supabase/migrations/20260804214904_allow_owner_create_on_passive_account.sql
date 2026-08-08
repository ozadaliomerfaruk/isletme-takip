-- Owner, arsivlenmemis pasif hesaba yeni islem yazabilmelidir.
--
-- KAPSAM:
--   * Yalniz public.create_islem_atomik_v2(uuid, jsonb) hesap uygunluk kapisi.
--   * Ortak kullanici icin aktif hesap zorunlulugu aynen kalir.
--   * Arsivli hesap owner dahil reddedilmeye devam eder.
--   * RPC imzasi, donus tipi, ACL, owner, SECURITY DEFINER ve search_path korunur.
--   * Tablo/veri degisikligi, backfill veya mevcut satir yazimi yoktur.
--
-- 1.5.x / ESKI CLIENT ETKISI:
--   Eski create wrapper'lari zaten create_islem_atomik_v2 motoruna yonlenir.
--   Imza degismedigi icin eski client kirilmaz. Pasif hesap UUID'si gonderebilen
--   owner artik basarili olur; ortak kullanici ve arsivli hesap reddi degismez.

DO $migration$
DECLARE
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.create_islem_atomik_v2(uuid,jsonb)'
  );
  v_definition text;
  v_before constant text := E'      AND h.is_active IS TRUE\n      AND h.is_archived IS FALSE';
  v_after constant text := E'      AND (h.is_active IS TRUE OR v_owner_id = v_uid)\n      AND h.is_archived IS FALSE';
  v_match_count integer;
  v_owner oid;
  v_acl aclitem[];
  v_security_definer boolean;
  v_config text[];
  v_identity_arguments text;
  v_result_type text;
BEGIN
  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION
      'MIGRATION_PRECONDITION_FAILED:create_islem_atomik_v2_missing';
  END IF;

  SELECT
    pg_catalog.pg_get_functiondef(proc.oid),
    proc.proowner,
    proc.proacl,
    proc.prosecdef,
    proc.proconfig,
    pg_catalog.pg_get_function_identity_arguments(proc.oid),
    pg_catalog.pg_get_function_result(proc.oid)
  INTO
    v_definition,
    v_owner,
    v_acl,
    v_security_definer,
    v_config,
    v_identity_arguments,
    v_result_type
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid = v_function_oid;

  -- Windows clean replay pg_get_functiondef icinde CRLF koruyabilir. Exact
  -- kaynak guard'i platformdan bagimsiz kalsin; calistirilacak DDL LF'e normalize edilir.
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');

  v_match_count := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_before, ''))
  ) / pg_catalog.length(v_before);

  IF v_match_count <> 1 THEN
    RAISE EXCEPTION
      'MIGRATION_PRECONDITION_FAILED:create_islem_atomik_v2_account_gate_matches_%',
      v_match_count;
  END IF;

  EXECUTE pg_catalog.replace(v_definition, v_before, v_after);

  v_function_oid := pg_catalog.to_regprocedure(
    'public.create_islem_atomik_v2(uuid,jsonb)'
  );

  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION
      'MIGRATION_POSTCONDITION_FAILED:create_islem_atomik_v2_missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    WHERE proc.oid = v_function_oid
      AND (
        proc.proowner IS DISTINCT FROM v_owner
        OR proc.proacl IS DISTINCT FROM v_acl
        OR proc.prosecdef IS DISTINCT FROM v_security_definer
        OR proc.proconfig IS DISTINCT FROM v_config
        OR pg_catalog.pg_get_function_identity_arguments(proc.oid)
          IS DISTINCT FROM v_identity_arguments
        OR pg_catalog.pg_get_function_result(proc.oid)
          IS DISTINCT FROM v_result_type
      )
  ) THEN
    RAISE EXCEPTION
      'MIGRATION_POSTCONDITION_FAILED:create_islem_atomik_v2_contract_changed';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(proc.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid = v_function_oid;

  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');

  IF pg_catalog.strpos(v_definition, v_before) <> 0
     OR pg_catalog.strpos(v_definition, v_after) = 0 THEN
    RAISE EXCEPTION
      'MIGRATION_POSTCONDITION_FAILED:create_islem_atomik_v2_owner_passive_gate';
  END IF;
END;
$migration$;
