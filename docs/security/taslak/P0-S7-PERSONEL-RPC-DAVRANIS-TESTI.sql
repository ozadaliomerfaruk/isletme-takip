-- P0-S7 / C3 personel projection RPC behavior test
--
-- This harness is intentionally self-contained and data-safe:
--   * every fixture write is inside one transaction,
--   * the transaction is always rolled back,
--   * no existing row is updated or deleted,
--   * no user-facing value/UUID is printed.
--
-- Run after the two projection RPCs exist. Acceptance output:
--   P0_S7_PERSONEL_RPC_BEHAVIOR_OK|<server version>

BEGIN;

-- BEGIN TEST BODY
DO $test$
DECLARE
  v_rows_signature text :=
    'public.get_personel_islem_satirlari_v1(uuid,uuid,integer,timestamp without time zone,timestamp with time zone,uuid)';
  v_quotas_signature text :=
    'public.get_personel_izin_kotalari_v1(uuid)';

  v_owner_id uuid;
  v_owner_isletme_id uuid;
  v_owner_personel_id uuid;
  v_other_personel_id uuid;

  v_personel_off_user_id uuid;
  v_personel_off_isletme_id uuid;

  v_p_only_user_id uuid;
  v_p_only_isletme_id uuid;
  v_p_only_personel_id uuid := gen_random_uuid();
  v_p_only_hesap_id uuid := gen_random_uuid();

  v_own_user_id uuid;
  v_own_isletme_id uuid;
  v_own_owner_id uuid;
  v_own_personel_id uuid := gen_random_uuid();
  v_foreign_personel_id uuid := gen_random_uuid();
  v_own_hesap_id uuid := gen_random_uuid();

  v_all_user_id uuid;
  v_all_isletme_id uuid;
  v_all_owner_id uuid;
  v_all_personel_id uuid := gen_random_uuid();
  v_all_hesap_id uuid := gen_random_uuid();

  v_first_id uuid;
  v_second_id uuid;
  v_first_date timestamp without time zone;
  v_first_created_at timestamp with time zone;
  v_second_date timestamp without time zone;
  v_second_created_at timestamp with time zone;
  v_row_count integer;
  v_expected_count integer;
  v_entitlement numeric;
  v_usage numeric;
BEGIN
  IF to_regprocedure(v_rows_signature) IS NULL
     OR to_regprocedure(v_quotas_signature) IS NULL THEN
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_FUNCTION_MISSING';
  END IF;

  IF has_function_privilege('anon', v_rows_signature, 'EXECUTE')
     OR has_function_privilege('service_role', v_rows_signature, 'EXECUTE')
     OR NOT has_function_privilege(
       'authenticated',
       v_rows_signature,
       'EXECUTE'
     )
     OR has_function_privilege('anon', v_quotas_signature, 'EXECUTE')
     OR has_function_privilege('service_role', v_quotas_signature, 'EXECUTE')
     OR NOT has_function_privilege(
       'authenticated',
       v_quotas_signature,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_ACL_INVALID';
  END IF;

  IF (
    SELECT NOT (
      p.provolatile = 's'
      AND p.prosecdef IS TRUE
      AND p.proconfig = ARRAY['search_path=pg_catalog']
      AND pg_get_userbyid(p.proowner) = 'postgres'
    )
    FROM pg_proc AS p
    WHERE p.oid = to_regprocedure(v_rows_signature)
  ) OR (
    SELECT NOT (
      p.provolatile = 's'
      AND p.prosecdef IS TRUE
      AND p.proconfig = ARRAY['search_path=pg_catalog']
      AND pg_get_userbyid(p.proowner) = 'postgres'
    )
    FROM pg_proc AS p
    WHERE p.oid = to_regprocedure(v_quotas_signature)
  ) THEN
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_METADATA_INVALID';
  END IF;

  -- Anonymous/falsy JWT claims fail closed.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM *
    FROM public.get_personel_islem_satirlari_v1(
      gen_random_uuid(),
      gen_random_uuid()
    );
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_ANON_ROWS_ALLOWED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM *
    FROM public.get_personel_izin_kotalari_v1(gen_random_uuid());
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_ANON_QUOTAS_ALLOWED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- Existing owner fixture: owner sees the exact source row set.
  SELECT
    isletme.user_id,
    isletme.id,
    personel.id
  INTO
    v_owner_id,
    v_owner_isletme_id,
    v_owner_personel_id
  FROM public.isletmeler AS isletme
  JOIN LATERAL (
    SELECT candidate.id
    FROM public.personel AS candidate
    WHERE candidate.isletme_id = isletme.id
      AND EXISTS (
        SELECT 1
        FROM public.islemler AS transaction_row
        WHERE transaction_row.isletme_id = isletme.id
          AND transaction_row.personel_id = candidate.id
      )
    ORDER BY (
      SELECT count(*)
      FROM public.islemler AS transaction_row
      WHERE transaction_row.isletme_id = isletme.id
        AND transaction_row.personel_id = candidate.id
    ) DESC
    LIMIT 1
  ) AS personel ON true
  ORDER BY (
    SELECT count(*)
    FROM public.islemler AS transaction_row
    WHERE transaction_row.isletme_id = isletme.id
      AND transaction_row.personel_id = personel.id
  ) DESC
  LIMIT 1;

  IF v_owner_id IS NULL OR v_owner_personel_id IS NULL THEN
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_OWNER_FIXTURE_MISSING';
  END IF;

  PERFORM set_config(
    'request.jwt.claim.sub',
    v_owner_id::text,
    true
  );

  SELECT count(*)
  INTO v_row_count
  FROM public.get_personel_islem_satirlari_v1(
    v_owner_isletme_id,
    v_owner_personel_id,
    100
  );

  SELECT least(count(*), 100)::integer
  INTO v_expected_count
  FROM public.islemler AS transaction_row
  WHERE transaction_row.isletme_id = v_owner_isletme_id
    AND transaction_row.personel_id = v_owner_personel_id
    AND internal.islem_tipi_modulu(transaction_row.type) IN (
      ARRAY['personel']::text[],
      ARRAY['personel', 'hesaplar']::text[]
    );

  IF v_row_count <> v_expected_count THEN
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_OWNER_COUNT_MISMATCH';
  END IF;

  -- Three-part keyset cursor must advance without duplicate IDs.
  SELECT
    page.id,
    page.date,
    page.created_at
  INTO
    v_first_id,
    v_first_date,
    v_first_created_at
  FROM public.get_personel_islem_satirlari_v1(
    v_owner_isletme_id,
    v_owner_personel_id,
    1
  ) AS page;

  IF v_first_id IS NOT NULL THEN
    SELECT
      page.id,
      page.date,
      page.created_at
    INTO
      v_second_id,
      v_second_date,
      v_second_created_at
    FROM public.get_personel_islem_satirlari_v1(
      v_owner_isletme_id,
      v_owner_personel_id,
      1,
      v_first_date,
      v_first_created_at,
      v_first_id
    ) AS page;

    IF v_second_id = v_first_id
       OR (
         v_second_id IS NOT NULL
         AND ROW(v_second_date, v_second_created_at, v_second_id)
           >= ROW(v_first_date, v_first_created_at, v_first_id)
       ) THEN
      RAISE EXCEPTION 'PERSONEL_RPC_TEST_CURSOR_DID_NOT_ADVANCE';
    END IF;
  END IF;

  -- Invalid limit and partial cursor return the documented SQLSTATE.
  BEGIN
    PERFORM *
    FROM public.get_personel_islem_satirlari_v1(
      v_owner_isletme_id,
      v_owner_personel_id,
      0
    );
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_INVALID_LIMIT_ALLOWED';
  EXCEPTION
    WHEN invalid_parameter_value THEN NULL;
  END;

  BEGIN
    PERFORM *
    FROM public.get_personel_islem_satirlari_v1(
      v_owner_isletme_id,
      v_owner_personel_id,
      50,
      current_timestamp::timestamp without time zone,
      NULL,
      NULL
    );
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_PARTIAL_CURSOR_ALLOWED';
  EXCEPTION
    WHEN invalid_parameter_value THEN NULL;
  END;

  -- A same-shape parent from a different tenant does not disclose existence.
  SELECT candidate.id
  INTO v_other_personel_id
  FROM public.personel AS candidate
  WHERE candidate.isletme_id <> v_owner_isletme_id
  LIMIT 1;

  IF v_other_personel_id IS NOT NULL THEN
    BEGIN
      PERFORM *
      FROM public.get_personel_islem_satirlari_v1(
        v_owner_isletme_id,
        v_other_personel_id
      );
      RAISE EXCEPTION 'PERSONEL_RPC_TEST_CROSS_TENANT_ALLOWED';
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
    END;
  END IF;

  BEGIN
    PERFORM *
    FROM public.get_personel_islem_satirlari_v1(
      v_owner_isletme_id,
      gen_random_uuid()
    );
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_MISSING_PARENT_ALLOWED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- Personel closed: endpoint access is denied before parent lookup.
  SELECT member.user_id, member.isletme_id
  INTO v_personel_off_user_id, v_personel_off_isletme_id
  FROM public.isletme_users AS member
  WHERE member.status = 'active'
    AND COALESCE(
      member.permissions->'modules'->'personel' = 'true'::jsonb,
      false
    ) IS FALSE
  LIMIT 1;

  IF v_personel_off_user_id IS NULL THEN
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_PERSONEL_OFF_FIXTURE_MISSING';
  END IF;

  PERFORM set_config(
    'request.jwt.claim.sub',
    v_personel_off_user_id::text,
    true
  );
  BEGIN
    PERFORM *
    FROM public.get_personel_islem_satirlari_v1(
      v_personel_off_isletme_id,
      gen_random_uuid()
    );
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_PERSONEL_OFF_ROWS_ALLOWED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM *
    FROM public.get_personel_izin_kotalari_v1(
      v_personel_off_isletme_id
    );
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_PERSONEL_OFF_QUOTAS_ALLOWED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- P-only profile: P rows remain; P+H payment rows disappear entirely.
  SELECT member.user_id, member.isletme_id
  INTO v_p_only_user_id, v_p_only_isletme_id
  FROM public.isletme_users AS member
  WHERE member.status = 'active'
    AND member.permissions->'modules'->'personel' = 'true'::jsonb
    AND COALESCE(
      member.permissions->'modules'->'hesaplar' = 'true'::jsonb,
      false
    ) IS FALSE
  LIMIT 1;

  IF v_p_only_user_id IS NULL THEN
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_P_ONLY_FIXTURE_MISSING';
  END IF;

  INSERT INTO public.hesaplar (
    id,
    isletme_id,
    name,
    type,
    currency,
    is_active,
    is_archived,
    created_by
  ) VALUES (
    v_p_only_hesap_id,
    v_p_only_isletme_id,
    '__P0_S7_ROLLBACK_ACCOUNT__',
    'nakit',
    'TRY',
    true,
    false,
    v_p_only_user_id
  );

  INSERT INTO public.personel (
    id,
    isletme_id,
    first_name,
    last_name,
    currency,
    is_active,
    is_archived,
    created_by
  ) VALUES (
    v_p_only_personel_id,
    v_p_only_isletme_id,
    '__P0_S7_ROLLBACK__',
    'P_ONLY',
    'TRY',
    true,
    false,
    v_p_only_user_id
  );

  INSERT INTO public.islemler (
    id,
    isletme_id,
    personel_id,
    hesap_id,
    type,
    amount,
    description,
    date,
    date_end,
    source_currency,
    target_currency,
    exchange_rate,
    created_by,
    created_at
  )
  SELECT
    gen_random_uuid(),
    v_p_only_isletme_id,
    v_p_only_personel_id,
    v_p_only_hesap_id,
    fixture.type,
    fixture.amount,
    '__P0_S7_ROLLBACK_TX__',
    timestamp '2099-01-01 12:00:00'
      + fixture.row_no * interval '1 minute',
    CASE
      WHEN fixture.type = 'personel_izin_kullanimi'
        THEN '2099-01-03'
      ELSE NULL
    END,
    'TRY',
    NULL,
    NULL,
    v_p_only_user_id,
    timestamptz '2099-01-01 09:00:00+00'
      + fixture.row_no * interval '1 minute'
  FROM (
    VALUES
      (1, 'personel_gider', 101::numeric),
      (2, 'personel_satis', 102::numeric),
      (3, 'personel_izin_hakki', 20::numeric),
      (4, 'personel_izin_kullanimi', 3::numeric),
      (5, 'personel_odeme', 105::numeric),
      (6, 'personel_tahsilat', 106::numeric)
  ) AS fixture(row_no, type, amount);

  PERFORM set_config('request.jwt.claim.sub', v_p_only_user_id::text, true);
  SELECT count(*)
  INTO v_row_count
  FROM public.get_personel_islem_satirlari_v1(
    v_p_only_isletme_id,
    v_p_only_personel_id,
    100
  );

  IF v_row_count <> 4 OR EXISTS (
    SELECT 1
    FROM public.get_personel_islem_satirlari_v1(
      v_p_only_isletme_id,
      v_p_only_personel_id,
      100
    ) AS row
    WHERE row.type IN ('personel_odeme', 'personel_tahsilat')
       OR row.hesap_name IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_P_ONLY_MATRIX_INVALID';
  END IF;

  SELECT quota.hak_edilen, quota.kullanilan
  INTO v_entitlement, v_usage
  FROM public.get_personel_izin_kotalari_v1(v_p_only_isletme_id) AS quota
  WHERE quota.personel_id = v_p_only_personel_id;

  IF v_entitlement <> 20 OR v_usage <> 3 THEN
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_P_ONLY_QUOTA_INVALID';
  END IF;

  -- P+H own-only profile: own parent/rows are visible; another creator is not.
  SELECT
    member.user_id,
    member.isletme_id,
    isletme.user_id
  INTO
    v_own_user_id,
    v_own_isletme_id,
    v_own_owner_id
  FROM public.isletme_users AS member
  JOIN public.isletmeler AS isletme
    ON isletme.id = member.isletme_id
  WHERE member.status = 'active'
    AND member.permissions->'modules'->'personel' = 'true'::jsonb
    AND member.permissions->'modules'->'hesaplar' = 'true'::jsonb
    AND COALESCE(
      member.permissions->'visibility'->'can_see_all_users_data'
        = 'true'::jsonb,
      false
    ) IS FALSE
  LIMIT 1;

  IF v_own_user_id IS NULL OR v_own_owner_id IS NULL THEN
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_OWN_FIXTURE_MISSING';
  END IF;

  INSERT INTO public.hesaplar (
    id,
    isletme_id,
    name,
    type,
    currency,
    is_active,
    is_archived,
    created_by
  ) VALUES (
    v_own_hesap_id,
    v_own_isletme_id,
    '__P0_S7_ROLLBACK_ACCOUNT__',
    'nakit',
    'TRY',
    true,
    false,
    v_own_user_id
  );

  INSERT INTO public.personel (
    id,
    isletme_id,
    first_name,
    last_name,
    currency,
    is_active,
    is_archived,
    created_by
  ) VALUES
    (
      v_own_personel_id,
      v_own_isletme_id,
      '__P0_S7_ROLLBACK__',
      'OWN',
      'TRY',
      true,
      false,
      v_own_user_id
    ),
    (
      v_foreign_personel_id,
      v_own_isletme_id,
      '__P0_S7_ROLLBACK__',
      'FOREIGN',
      'TRY',
      true,
      false,
      v_own_owner_id
    );

  INSERT INTO public.islemler (
    id,
    isletme_id,
    personel_id,
    hesap_id,
    type,
    amount,
    description,
    date,
    source_currency,
    created_by,
    created_at
  )
  SELECT
    gen_random_uuid(),
    v_own_isletme_id,
    parent.personel_id,
    v_own_hesap_id,
    fixture.type,
    fixture.amount,
    '__P0_S7_ROLLBACK_TX__',
    timestamp '2099-02-01 12:00:00'
      + fixture.row_no * interval '1 minute',
    'TRY',
    parent.creator_id,
    timestamptz '2099-02-01 09:00:00+00'
      + fixture.row_no * interval '1 minute'
  FROM (
    VALUES
      (v_own_personel_id, v_own_user_id),
      (v_foreign_personel_id, v_own_owner_id)
  ) AS parent(personel_id, creator_id)
  CROSS JOIN (
    VALUES
      (1, 'personel_gider', 201::numeric),
      (2, 'personel_satis', 202::numeric),
      (3, 'personel_izin_hakki', 24::numeric),
      (4, 'personel_izin_kullanimi', 4::numeric),
      (5, 'personel_odeme', 205::numeric),
      (6, 'personel_tahsilat', 206::numeric)
  ) AS fixture(row_no, type, amount);

  PERFORM set_config('request.jwt.claim.sub', v_own_user_id::text, true);
  SELECT count(*)
  INTO v_row_count
  FROM public.get_personel_islem_satirlari_v1(
    v_own_isletme_id,
    v_own_personel_id,
    100
  );

  IF v_row_count <> 6
     OR (
       SELECT count(*)
       FROM public.get_personel_islem_satirlari_v1(
         v_own_isletme_id,
         v_own_personel_id,
         100
       ) AS row
       WHERE row.type IN ('personel_odeme', 'personel_tahsilat')
         AND row.hesap_name = '__P0_S7_ROLLBACK_ACCOUNT__'
     ) <> 2 THEN
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_OWN_ROWS_INVALID';
  END IF;

  BEGIN
    PERFORM *
    FROM public.get_personel_islem_satirlari_v1(
      v_own_isletme_id,
      v_foreign_personel_id,
      100
    );
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_OWN_FOREIGN_PARENT_ALLOWED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  IF EXISTS (
    SELECT 1
    FROM public.get_personel_izin_kotalari_v1(v_own_isletme_id) AS quota
    WHERE quota.personel_id = v_foreign_personel_id
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.get_personel_izin_kotalari_v1(v_own_isletme_id) AS quota
    WHERE quota.personel_id = v_own_personel_id
      AND quota.hak_edilen = 24
      AND quota.kullanilan = 4
  ) THEN
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_OWN_QUOTA_SCOPE_INVALID';
  END IF;

  -- P+H all-data profile sees another creator's six rows.
  SELECT
    member.user_id,
    member.isletme_id,
    isletme.user_id
  INTO
    v_all_user_id,
    v_all_isletme_id,
    v_all_owner_id
  FROM public.isletme_users AS member
  JOIN public.isletmeler AS isletme
    ON isletme.id = member.isletme_id
  WHERE member.status = 'active'
    AND member.permissions->'modules'->'personel' = 'true'::jsonb
    AND member.permissions->'modules'->'hesaplar' = 'true'::jsonb
    AND member.permissions->'visibility'->'can_see_all_users_data'
      = 'true'::jsonb
  LIMIT 1;

  IF v_all_user_id IS NULL OR v_all_owner_id IS NULL THEN
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_ALL_FIXTURE_MISSING';
  END IF;

  INSERT INTO public.hesaplar (
    id,
    isletme_id,
    name,
    type,
    currency,
    is_active,
    is_archived,
    created_by
  ) VALUES (
    v_all_hesap_id,
    v_all_isletme_id,
    '__P0_S7_ROLLBACK_ACCOUNT__',
    'nakit',
    'TRY',
    true,
    false,
    v_all_owner_id
  );

  INSERT INTO public.personel (
    id,
    isletme_id,
    first_name,
    last_name,
    currency,
    is_active,
    is_archived,
    created_by
  ) VALUES (
    v_all_personel_id,
    v_all_isletme_id,
    '__P0_S7_ROLLBACK__',
    'ALL',
    'TRY',
    true,
    false,
    v_all_owner_id
  );

  INSERT INTO public.islemler (
    id,
    isletme_id,
    personel_id,
    hesap_id,
    type,
    amount,
    description,
    date,
    source_currency,
    created_by,
    created_at
  )
  SELECT
    gen_random_uuid(),
    v_all_isletme_id,
    v_all_personel_id,
    v_all_hesap_id,
    fixture.type,
    fixture.amount,
    '__P0_S7_ROLLBACK_TX__',
    timestamp '2099-03-01 12:00:00'
      + fixture.row_no * interval '1 minute',
    'TRY',
    v_all_owner_id,
    timestamptz '2099-03-01 09:00:00+00'
      + fixture.row_no * interval '1 minute'
  FROM (
    VALUES
      (1, 'personel_gider', 301::numeric),
      (2, 'personel_satis', 302::numeric),
      (3, 'personel_izin_hakki', 30::numeric),
      (4, 'personel_izin_kullanimi', 5::numeric),
      (5, 'personel_odeme', 305::numeric),
      (6, 'personel_tahsilat', 306::numeric)
  ) AS fixture(row_no, type, amount);

  PERFORM set_config('request.jwt.claim.sub', v_all_user_id::text, true);
  SELECT count(*)
  INTO v_row_count
  FROM public.get_personel_islem_satirlari_v1(
    v_all_isletme_id,
    v_all_personel_id,
    100
  );

  IF v_row_count <> 6 THEN
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_ALL_ROWS_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_personel_izin_kotalari_v1(v_all_isletme_id) AS quota
    WHERE quota.personel_id = v_all_personel_id
      AND quota.hak_edilen = 30
      AND quota.kullanilan = 5
  ) THEN
    RAISE EXCEPTION 'PERSONEL_RPC_TEST_ALL_QUOTA_INVALID';
  END IF;

END
$test$;
-- END TEST BODY

ROLLBACK;

SELECT
  'P0_S7_PERSONEL_RPC_BEHAVIOR_OK|' || current_setting('server_version')
    AS result;
