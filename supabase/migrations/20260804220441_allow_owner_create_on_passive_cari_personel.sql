-- Owner, arsivlenmemis pasif cari ve personele yeni islem yazabilmelidir.
--
-- KAPSAM:
--   * Yalniz public.create_islem_atomik_v2(uuid, jsonb) entity kapilari.
--   * Ortak kullanici icin aktif cari/personel zorunlulugu aynen kalir.
--   * Arsivli cari/personel owner dahil reddedilmeye devam eder.
--   * Pasif hesap icin mevcut owner istisnasi aynen korunur.
--   * RPC imzasi, donus tipi, ACL, owner, SECURITY DEFINER ve search_path korunur.
--   * Tablo/veri degisikligi, backfill veya mevcut satir yazimi yoktur.
--
-- 1.5.x / ESKI CLIENT ETKISI:
--   Eski create wrapper'lari zaten create_islem_atomik_v2 motoruna yonlenir.
--   Imza degismedigi icin eski client kirilmaz. Pasif cari/personel UUID'si
--   gonderen owner artik basarili olur; ortak kullanici ve arsivli kayit reddi
--   degismez.

DO $migration$
DECLARE
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.create_islem_atomik_v2(uuid,jsonb)'
  );
  v_definition text;
  v_cari_before constant text := E'      AND c.is_active IS TRUE\n      AND c.is_archived IS FALSE';
  v_cari_after constant text := E'      AND (c.is_active IS TRUE OR v_owner_id = v_uid)\n      AND c.is_archived IS FALSE';
  v_personel_before constant text := E'      AND p.is_active IS TRUE\n      AND p.is_archived IS FALSE';
  v_personel_after constant text := E'      AND (p.is_active IS TRUE OR v_owner_id = v_uid)\n      AND p.is_archived IS FALSE';
  v_account_owner_gate constant text := E'      AND (h.is_active IS TRUE OR v_owner_id = v_uid)\n      AND h.is_archived IS FALSE';
  v_cari_match_count integer;
  v_personel_match_count integer;
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

  v_cari_match_count := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_cari_before, ''))
  ) / pg_catalog.length(v_cari_before);

  v_personel_match_count := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_personel_before, ''))
  ) / pg_catalog.length(v_personel_before);

  IF v_cari_match_count <> 1 THEN
    RAISE EXCEPTION
      'MIGRATION_PRECONDITION_FAILED:create_islem_atomik_v2_cari_gate_matches_%',
      v_cari_match_count;
  END IF;

  IF v_personel_match_count <> 1 THEN
    RAISE EXCEPTION
      'MIGRATION_PRECONDITION_FAILED:create_islem_atomik_v2_personel_gate_matches_%',
      v_personel_match_count;
  END IF;

  IF pg_catalog.strpos(v_definition, v_account_owner_gate) = 0 THEN
    RAISE EXCEPTION
      'MIGRATION_PRECONDITION_FAILED:create_islem_atomik_v2_account_owner_gate_missing';
  END IF;

  EXECUTE pg_catalog.replace(
    pg_catalog.replace(v_definition, v_cari_before, v_cari_after),
    v_personel_before,
    v_personel_after
  );

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

  IF pg_catalog.strpos(v_definition, v_cari_before) <> 0
     OR pg_catalog.strpos(v_definition, v_cari_after) = 0
     OR pg_catalog.strpos(v_definition, v_personel_before) <> 0
     OR pg_catalog.strpos(v_definition, v_personel_after) = 0
     OR pg_catalog.strpos(v_definition, v_account_owner_gate) = 0 THEN
    RAISE EXCEPTION
      'MIGRATION_POSTCONDITION_FAILED:create_islem_atomik_v2_owner_passive_entity_gates';
  END IF;
END;
$migration$;
