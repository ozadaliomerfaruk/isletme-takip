-- =============================================================================
-- P0-S10 PHASE-2 - PUBLIC EKSTRE DIRECT SERVICE_ROLE TABLE SELECT CLEANUP
-- =============================================================================
-- Canli migration history: 20260729113246 / finalize_public_statement_service_role_acl.
-- DURUM: Edge v6 canlı smoke'u tamamlandıktan sonra canlıya uygulanmıştır.
-- OPERATOR GATE (PAZARLIK DISI):
--   Bu migration YALNIZ su iki kosuldan SONRA uygulanir:
--     1) 20260729112753 phase-1 canlida ve smoke'u yesil;
--     2) cari-ekstre Edge v6 canlida, token lookup
--        cari_ekstre_token_dogrula_v1 RPC'sini kullaniyor ve public JSON smoke'u
--        yesil.
--
-- Edge v5 hala canliyken bunu uygulamak public ekstreleri 500'e dusurur. Bu
-- nedenle phase-2 ayri migration'dir; phase-1 ile ayni apply cagrisi/batch'i
-- icinde calistirilmaz.
--
-- ETKI
--   * Yalniz service_role'un public.cari_ekstre_links tablosundaki gecici SELECT
--     grant'i kaldirilir.
--   * service_role'un cari_ekstre_token_dogrula_v1(text) EXECUTE hakki korunur.
--   * Tablo/kolon/satir DML/backfill, RPC govdesi, policy veya index degismez.
--
-- ESKI CLIENT (1.5.x)
--   Mobil client tabloyu dogrudan okumaz; ayni create/cancel RPC imzalari devam
--   eder. Dogru rollout sirasinda eski mobil client etkilenmez. Yalniz eski Edge
--   v5 bu direct SELECT'e baglidir; bu yuzden yukaridaki operator gate zorunludur.
-- =============================================================================

DO $preflight$
DECLARE
  v_table_oid       oid := pg_catalog.to_regclass(
    'public.cari_ekstre_links'
  );
  v_create_oid      oid := pg_catalog.to_regprocedure(
    'public.ekstre_link_olustur(uuid,uuid,integer)'
  );
  v_cancel_oid      oid := pg_catalog.to_regprocedure(
    'public.ekstre_link_iptal(uuid,uuid)'
  );
  v_validate_oid    oid := pg_catalog.to_regprocedure(
    'public.cari_ekstre_token_dogrula_v1(text)'
  );
  v_profile_helper_oid oid := pg_catalog.to_regprocedure(
    'internal.public_ekstre_cariler_uyeligi_izinli(text,jsonb)'
  );
  v_columns_md5     text;
  v_constraints_md5 text;
  v_policies_md5    text;
  v_indexes_md5     text;
  v_acl_md5         text;
  v_create_md5      text;
  v_cancel_md5      text;
  v_validate_md5    text;
  v_profile_helper_md5 text;
BEGIN
  IF v_table_oid IS NULL
     OR v_create_oid IS NULL
     OR v_cancel_oid IS NULL
     OR v_validate_oid IS NULL
     OR v_profile_helper_oid IS NULL THEN
    RAISE EXCEPTION
      'P0-S10 phase-2 drift: phase-1 nesneleri eksik'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS table_class
    WHERE table_class.oid = v_table_oid
      AND table_class.relkind = 'r'
      AND table_class.relowner = 'postgres'::pg_catalog.regrole
      AND table_class.relrowsecurity IS TRUE
      AND table_class.relforcerowsecurity IS FALSE
  ) THEN
    RAISE EXCEPTION
      'P0-S10 phase-2 drift: tablo owner/RLS/relkind degisti'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.md5(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        attribute_row.attnum,
        attribute_row.attname,
        pg_catalog.format_type(
          attribute_row.atttypid,
          attribute_row.atttypmod
        ),
        attribute_row.attnotnull,
        pg_catalog.pg_get_expr(
          default_row.adbin,
          default_row.adrelid
        ),
        attribute_row.attgenerated,
        attribute_row.attidentity
      )
      ORDER BY attribute_row.attnum
    )::text
  )
  INTO v_columns_md5
  FROM pg_catalog.pg_attribute AS attribute_row
  LEFT JOIN pg_catalog.pg_attrdef AS default_row
    ON default_row.adrelid = attribute_row.attrelid
   AND default_row.adnum = attribute_row.attnum
  WHERE attribute_row.attrelid = v_table_oid
    AND attribute_row.attnum > 0
    AND NOT attribute_row.attisdropped;

  SELECT pg_catalog.md5(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        constraint_row.conname,
        constraint_row.contype,
        constraint_row.condeferrable,
        constraint_row.condeferred,
        constraint_row.convalidated,
        pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
      )
      ORDER BY constraint_row.conname
    )::text
  )
  INTO v_constraints_md5
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = v_table_oid;

  SELECT pg_catalog.md5(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        policy_row.polname,
        policy_row.polcmd,
        policy_row.polpermissive,
        policy_row.polroles::pg_catalog.regrole[],
        pg_catalog.pg_get_expr(
          policy_row.polqual,
          policy_row.polrelid
        ),
        pg_catalog.pg_get_expr(
          policy_row.polwithcheck,
          policy_row.polrelid
        )
      )
      ORDER BY policy_row.polname
    )::text
  )
  INTO v_policies_md5
  FROM pg_catalog.pg_policy AS policy_row
  WHERE policy_row.polrelid = v_table_oid;

  SELECT pg_catalog.md5(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        index_row.indexrelid::pg_catalog.regclass::text,
        index_row.indisunique,
        index_row.indisvalid,
        pg_catalog.pg_get_indexdef(index_row.indexrelid)
      )
      ORDER BY index_row.indexrelid::pg_catalog.regclass::text
    )::text
  )
  INTO v_indexes_md5
  FROM pg_catalog.pg_index AS index_row
  WHERE index_row.indrelid = v_table_oid;

  SELECT pg_catalog.md5(COALESCE(table_class.relacl::text, ''))
  INTO v_acl_md5
  FROM pg_catalog.pg_class AS table_class
  WHERE table_class.oid = v_table_oid;

  SELECT
    pg_catalog.md5(pg_catalog.pg_get_functiondef(v_create_oid)),
    pg_catalog.md5(pg_catalog.pg_get_functiondef(v_cancel_oid)),
    pg_catalog.md5(pg_catalog.pg_get_functiondef(v_validate_oid)),
    pg_catalog.md5(pg_catalog.pg_get_functiondef(v_profile_helper_oid))
  INTO
    v_create_md5,
    v_cancel_md5,
    v_validate_md5,
    v_profile_helper_md5;

  IF v_columns_md5 IS DISTINCT FROM
       '9836499cea373e719c7cb8c8288c8e7f'
     OR v_constraints_md5 IS DISTINCT FROM
       'a77ab3ae466ec92cb4d53402023c841a'
     OR v_policies_md5 IS DISTINCT FROM
       'baed2df421f8e6296e2d991dd64a7b0d'
     OR v_indexes_md5 IS DISTINCT FROM
       'c4fba23c8d13d8d8c209f4d44bc23e09'
     OR v_acl_md5 NOT IN (
       -- Denetlenen canli phase-1 snapshot'i.
       '821d2cba3aacaf8063ed1120f1af8f08',
       -- Temiz PostgreSQL 17 migration replay phase-1 snapshot'i.
       '785266260c6014ee265c71ed89f123e0'
     ) THEN
    RAISE EXCEPTION
      'P0-S10 phase-2 drift: phase-1 tablo snapshot eslesmiyor '
      '(columns=%, constraints=%, policies=%, indexes=%, acl=%; '
      'create=%, cancel=%, validate=%, helper=%)',
      v_columns_md5,
      v_constraints_md5,
      v_policies_md5,
      v_indexes_md5,
      v_acl_md5,
      v_create_md5,
      v_cancel_md5,
      v_validate_md5,
      v_profile_helper_md5
      USING ERRCODE = '55000';
  END IF;

  IF v_create_md5 NOT IN (
       '19fd96efcf842866e922c1eb1c27f007',
       'b41c180495900f97d127cfd1a43be4c6'
     )
     OR v_cancel_md5 NOT IN (
       '00eab03f65c493d212f25e5266e2a663',
       'dd7633d8d68a6a1b49a15fa041590cb8'
     )
     OR v_validate_md5 NOT IN (
       '971f225e93bd10942e742b6174ca5775',
       '2b400f1a4c2603898096779aa5c4fb0b'
     )
     OR v_profile_helper_md5 NOT IN (
       'e7d034e4a4b23abcaaadbc08b146ada3',
       '144483ac24228485803fce17a894713d'
     ) THEN
    RAISE EXCEPTION
      'P0-S10 phase-2 drift: phase-1 fonksiyon govdeleri eslesmiyor '
      '(create=%, cancel=%, validate=%, helper=%)',
      v_create_md5,
      v_cancel_md5,
      v_validate_md5,
      v_profile_helper_md5
      USING ERRCODE = '55000';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
    'service_role',
    v_table_oid,
    'SELECT'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    v_table_oid,
    'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
  ) OR NOT pg_catalog.has_function_privilege(
    'service_role',
    v_validate_oid,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    v_validate_oid,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'P0-S10 phase-2 drift: gecici SELECT/validator ACL faz durumu bozuk'
      USING ERRCODE = '55000';
  END IF;
END;
$preflight$;

REVOKE ALL ON TABLE public.cari_ekstre_links
  FROM service_role;

DO $postcondition$
DECLARE
  v_table_oid       oid := pg_catalog.to_regclass(
    'public.cari_ekstre_links'
  );
  v_validate_oid    oid := pg_catalog.to_regprocedure(
    'public.cari_ekstre_token_dogrula_v1(text)'
  );
BEGIN
  IF v_table_oid IS NULL OR v_validate_oid IS NULL THEN
    RAISE EXCEPTION
      'P0-S10 phase-2 postcondition: nesne eksik'
      USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.has_table_privilege(
    'service_role',
    v_table_oid,
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
  ) OR NOT pg_catalog.has_table_privilege(
    'authenticated',
    v_table_oid,
    'SELECT'
  ) OR NOT pg_catalog.has_function_privilege(
    'service_role',
    v_validate_oid,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    v_validate_oid,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    v_validate_oid,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'P0-S10 phase-2 postcondition: direct tablo SELECT/validator ACL bozuk'
      USING ERRCODE = '55000';
  END IF;

  IF (
    SELECT table_class.relacl::text
    FROM pg_catalog.pg_class AS table_class
    WHERE table_class.oid = v_table_oid
  ) IS DISTINCT FROM
    '{postgres=arwdDxtm/postgres,authenticated=r/postgres}' THEN
    RAISE EXCEPTION
      'P0-S10 phase-2 postcondition: final tablo ACL exact eslesmiyor'
      USING ERRCODE = '55000';
  END IF;
END;
$postcondition$;
