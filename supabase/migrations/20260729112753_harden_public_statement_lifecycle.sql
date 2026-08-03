-- =============================================================================
-- P0-S10 - PUBLIC CARI EKSTRESI SUNUCU SINIRI
-- =============================================================================
-- Canli migration history: 20260729112753 / harden_public_statement_lifecycle.
-- K12/K12-a/K12-b:
--   * Cariler can_view, level=view dahil link uretebilir/iptal edebilir.
--   * Ortak: exact 1/7/30 gun; owner: exact 1/7/30/365 gun.
--   * Yeni suresiz/NULL/ara deger link YOK.
--   * Aktif link anahtari (isletme, cari, uretici); ortak yalniz kendisininkini,
--     owner tum ureticilerin linklerini gorur/iptal eder.
--   * Public Edge her acilista link ureticisinin GUNCEL Cariler yetkisini yeniden
--     service_role-only RPC ile dogrular.
--
-- VERI GUVENLIGI
--   * Mevcut satirlara DML/backfill YOK.
--   * Kolon/tablo silme/yeniden adlandirma/tip degistirme YOK.
--   * Mevcut 100-yillik linklere dokunulmaz; yeni linklerde allowlist uygulanir.
--   * Yalniz iki mevcut RPC ayni imza/sonuc tipiyle CREATE OR REPLACE edilir,
--     bir yeni dar RPC ve bir partial unique index eklenir; policy/ACL daraltilir.
--
-- IKI-FAZLI KESINTISIZ ROLLOUT (SIRA ZORUNLU)
--   1) BU PHASE-1 migration uygulanir. Canli Edge v5'in dogrudan link okumasinin
--      kirilmamasi icin service_role tablo yetkisi gecici olarak YALNIZ SELECT
--      seviyesinde korunur; tum yazma/genis grantlar kapanir.
--   2) cari-ekstre Edge v6 deploy edilir ve validator RPC smoke'u gecilir.
--   3) 20260729113246 phase-2 cleanup migration uygulanir; service_role'un
--      dogrudan tablo SELECT'i de kapanir. Validator RPC EXECUTE kalir.
--   Phase-2, Edge v6'dan ONCE uygulanamaz; aksi halde canli Edge v5 500 verir.
--
-- ESKI CLIENT (1.5.x)
--   * Ayni RPC adlari, parametreleri, DEFAULT 30 ve sonuc sekilleri korunur.
--   * Owner'in 30-gunluk normal akisi aynen calisir.
--   * Cariler acik ortak 1/7/30 gun link uretebilir; eski client'in NULL/suresiz,
--     ara deger veya ortak 365 gun istegi artik 22023 ile reddedilir.
--   * Ortak yeni link ureterek owner/baska ortagin linkini iptal edemez.
--   * Yetkisi kaldirilan ureticinin mevcut public linki bir sonraki acilista 404 olur.
--
-- CANLI SNAPSHOT PROVENANCE (2026-07-29, cari-ekstre Edge v5)
--   Audit tablo hash'i (audit aracinin provenance degeri):
--     8edd3ee7ad1f4733d00b0a0f3ec321bb
--   Bu migration hash formulu bilinmeden onu calistiriyormus gibi davranmaz.
--   Asagida migration'in acikca tanimladigi kanonik katalog parmak izleri ayri
--   ayri kilitlenir.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. UYGULAMA-ANI DRIFT KAPISI
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_table_oid             oid;
  v_create_oid            oid;
  v_cancel_oid            oid;
  v_resolver_oid          oid;
  v_columns_md5           text;
  v_constraints_md5       text;
  v_policies_md5          text;
  v_indexes_md5           text;
  v_acl_md5               text;
  v_create_md5            text;
  v_cancel_md5            text;
  v_resolver_md5          text;
  v_user_trigger_count    bigint;
  v_active_duplicate_count bigint;
BEGIN
  v_table_oid := pg_catalog.to_regclass('public.cari_ekstre_links');
  v_create_oid := pg_catalog.to_regprocedure(
    'public.ekstre_link_olustur(uuid,uuid,integer)'
  );
  v_cancel_oid := pg_catalog.to_regprocedure(
    'public.ekstre_link_iptal(uuid,uuid)'
  );
  v_resolver_oid := pg_catalog.to_regprocedure(
    'internal.etkin_yetki(uuid,text)'
  );

  IF v_table_oid IS NULL
     OR v_create_oid IS NULL
     OR v_cancel_oid IS NULL
     OR v_resolver_oid IS NULL THEN
    RAISE EXCEPTION
      'P0-S10 drift: gerekli tablo/RPC/resolver bulunamadi'
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
      'P0-S10 drift: cari_ekstre_links owner/RLS/relkind degisti'
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

  SELECT pg_catalog.count(*) FILTER (WHERE NOT trigger_row.tgisinternal)
  INTO v_user_trigger_count
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = v_table_oid;

  SELECT
    pg_catalog.md5(pg_catalog.pg_get_functiondef(v_create_oid)),
    pg_catalog.md5(pg_catalog.pg_get_functiondef(v_cancel_oid)),
    pg_catalog.md5(pg_catalog.pg_get_functiondef(v_resolver_oid))
  INTO v_create_md5, v_cancel_md5, v_resolver_md5;

  IF v_columns_md5 IS DISTINCT FROM
       '9836499cea373e719c7cb8c8288c8e7f'
     OR v_constraints_md5 IS DISTINCT FROM
       'a77ab3ae466ec92cb4d53402023c841a'
     OR v_policies_md5 IS DISTINCT FROM
       '71892c1efea89373200c887b20321904'
     OR v_indexes_md5 IS DISTINCT FROM
       'cf71a1041f0bd1ef3f4f05a3b03b550c'
     OR v_acl_md5 NOT IN (
       -- Denetlenen canli snapshot.
       '46875263bd6598c4534e2df7d1847a5e',
       -- Temiz PostgreSQL 17 migration replay snapshot'i.
       'dd7b8e47a159b5b3bc4c7a7ee584b350'
     )
     OR v_user_trigger_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION
      'P0-S10 drift: tablo snapshot degisti '
      '(columns=%, constraints=%, policies=%, indexes=%, acl=%, triggers=%)',
      v_columns_md5,
      v_constraints_md5,
      v_policies_md5,
      v_indexes_md5,
      v_acl_md5,
      v_user_trigger_count
      USING ERRCODE = '55000';
  END IF;

  IF v_create_md5 IS DISTINCT FROM 'd9a2ef379260e4b5fd1d7ec795ddd7ea'
     OR v_cancel_md5 IS DISTINCT FROM '1b75693d54ee84a30c98977e1c6edb66'
     OR v_resolver_md5 IS DISTINCT FROM 'f8aebb82851b89301f6679f92a217e96' THEN
    RAISE EXCEPTION
      'P0-S10 drift: RPC/resolver govdesi snapshot ile eslesmiyor '
      '(create=%, cancel=%, resolver=%)',
      v_create_md5,
      v_cancel_md5,
      v_resolver_md5
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    WHERE function_row.oid = v_create_oid
      AND function_row.proowner = 'postgres'::pg_catalog.regrole
      AND function_row.prosecdef IS TRUE
      AND function_row.provolatile = 'v'
      AND function_row.proconfig = ARRAY['search_path=public']::text[]
      AND pg_catalog.pg_get_function_result(function_row.oid) = 'jsonb'
      AND function_row.proacl::text =
        '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    WHERE function_row.oid = v_cancel_oid
      AND function_row.proowner = 'postgres'::pg_catalog.regrole
      AND function_row.prosecdef IS TRUE
      AND function_row.provolatile = 'v'
      AND function_row.proconfig = ARRAY['search_path=public']::text[]
      AND pg_catalog.pg_get_function_result(function_row.oid) = 'integer'
      AND function_row.proacl::text =
        '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  ) THEN
    RAISE EXCEPTION
      'P0-S10 drift: mevcut RPC owner/SECDEF/ACL/imza ayari degisti'
      USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.to_regclass(
    'public.ux_cari_ekstre_links_active_creator'
  ) IS NOT NULL THEN
    RAISE EXCEPTION
      'P0-S10 drift: hedef partial unique index adi zaten kullaniliyor'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_active_duplicate_count
  FROM (
    SELECT
      link_row.isletme_id,
      link_row.cari_id,
      link_row.created_by
    FROM public.cari_ekstre_links AS link_row
    WHERE link_row.revoked IS FALSE
      AND link_row.created_by IS NOT NULL
    GROUP BY
      link_row.isletme_id,
      link_row.cari_id,
      link_row.created_by
    HAVING pg_catalog.count(*) > 1
  ) AS duplicate_group;

  IF v_active_duplicate_count > 0 THEN
    RAISE EXCEPTION
      'P0-S10 DURDU: aktif isletme+cari+uretici duplicate grubu var; veri otomatik degistirilmeyecek'
      USING ERRCODE = '23505';
  END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- 2. DB-SEVIYESINDE URETICI + CARI BASINA TEK AKTIF LINK
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX ux_cari_ekstre_links_active_creator
ON public.cari_ekstre_links (isletme_id, cari_id, created_by)
WHERE revoked IS FALSE
  AND created_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2.b SERVICE VALIDATOR ICIN DAR CARILER-UYELIK PARITE YARDIMCISI
-- ---------------------------------------------------------------------------
-- internal.etkin_yetki bilerek user_id parametresi kabul etmez ve auth.uid()
-- uzerinden calisir. Public Edge ise service_role baglaminda LINK URETICISININ
-- (baska bir user_id) guncel durumunu sinamak zorundadir. Bu nedenle genel bir
-- "baskasinin tum yetkilerini getir" kapisi acmak yerine yalniz Cariler can_view
-- icin status+permissions saf predicate'i kullanilir.
--
-- internal.etkin_yetki Cariler semantigiyle snapshot paritesi:
--   * role kolonu yetki vermez; manager/operator/custom izin JSON'una indirgenir,
--   * active + exact modules.cariler JSON true zorunludur,
--   * level yok/JSON null legacy kabul edilir,
--   * level varsa exact view/add/edit_own/edit_all,
--   * bilinmeyen level/tip/string "true"/kapali modul fail-closed.
-- Resolver semantigi ileride degisirse bu helper ve asagidaki profil matrisi de
-- AYNI migration'da guncellenmelidir. Bilinmeyen yeni profil fail-closed kalir.
CREATE FUNCTION internal.public_ekstre_cariler_uyeligi_izinli(
  p_status text,
  p_permissions jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'pg_catalog'
AS $function$
  SELECT COALESCE(
    p_status = 'active'
    AND pg_catalog.jsonb_typeof(p_permissions) = 'object'
    AND p_permissions->'modules'->'cariler' = 'true'::jsonb
    AND (
      p_permissions->'level' IS NULL
      OR p_permissions->'level' = 'null'::jsonb
      OR (
        pg_catalog.jsonb_typeof(p_permissions->'level') = 'string'
        AND p_permissions->>'level' IN (
          'view',
          'add',
          'edit_own',
          'edit_all'
        )
      )
    ),
    false
  );
$function$;

ALTER FUNCTION internal.public_ekstre_cariler_uyeligi_izinli(text, jsonb)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION
  internal.public_ekstre_cariler_uyeligi_izinli(text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. AYNI IMZALI LINK URETIMI
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ekstre_link_olustur(
  p_isletme_id uuid,
  p_cari_id uuid,
  p_gecerlilik_gun integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_can_view   boolean := false;
  v_is_owner   boolean := false;
  v_rate       integer;
  v_token      text;
  v_expires    timestamptz;
BEGIN
  IF v_uid IS NULL
     OR p_isletme_id IS NULL
     OR p_cari_id IS NULL THEN
    RAISE EXCEPTION 'EKSTRE_LINK_YETKISIZ'
      USING ERRCODE = '42501';
  END IF;

  SELECT permission.can_view
  INTO v_can_view
  FROM internal.etkin_yetki(
    p_isletme_id,
    'cariler'
  ) AS permission;

  SELECT EXISTS(
    SELECT 1
    FROM public.isletmeler AS business_row
    WHERE business_row.id = p_isletme_id
      AND business_row.user_id = v_uid
  )
  INTO v_is_owner;

  IF v_can_view IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'EKSTRE_LINK_YETKISIZ'
      USING ERRCODE = '42501';
  END IF;

  IF p_gecerlilik_gun IS NULL
     OR (
       v_is_owner
       AND p_gecerlilik_gun NOT IN (1, 7, 30, 365)
     )
     OR (
       NOT v_is_owner
       AND p_gecerlilik_gun NOT IN (1, 7, 30)
     ) THEN
    RAISE EXCEPTION 'EKSTRE_LINK_GECERLILIK_GECERSIZ'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM public.cariler AS cari_row
    WHERE cari_row.id = p_cari_id
      AND cari_row.isletme_id = p_isletme_id
  ) THEN
    RAISE EXCEPTION 'EKSTRE_LINK_CARI_BULUNAMADI'
      USING ERRCODE = '42501';
  END IF;

  -- Isletme-bazli lock, mevcut 10/saat sayacini farkli carilerdeki paralel
  -- uretimlerde de deterministik tutar. Transaction bitiminde otomatik kalkar.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'public.cari_ekstre_links:business:' || p_isletme_id::text,
      0
    )
  );

  SELECT pg_catalog.count(*)::integer
  INTO v_rate
  FROM public.cari_ekstre_links AS rate_row
  WHERE rate_row.isletme_id = p_isletme_id
    AND rate_row.created_at > pg_catalog.now() - interval '1 hour';

  IF v_rate >= 10 THEN
    RAISE EXCEPTION
      'Cok fazla link olusturuldu, lutfen daha sonra deneyin'
      USING ERRCODE = 'P0001';
  END IF;

  -- Owner dahil herkes yalniz kendi onceki aktif linkini yeniler.
  UPDATE public.cari_ekstre_links AS old_link
  SET revoked = true
  WHERE old_link.isletme_id = p_isletme_id
    AND old_link.cari_id = p_cari_id
    AND old_link.created_by = v_uid
    AND old_link.revoked IS FALSE;

  v_token := pg_catalog.encode(
    extensions.gen_random_bytes(24),
    'hex'
  );
  v_expires := pg_catalog.now()
    + pg_catalog.make_interval(days => p_gecerlilik_gun);

  INSERT INTO public.cari_ekstre_links (
    token,
    isletme_id,
    cari_id,
    created_by,
    expires_at
  )
  VALUES (
    v_token,
    p_isletme_id,
    p_cari_id,
    v_uid,
    v_expires
  );

  RETURN pg_catalog.jsonb_build_object(
    'token', v_token,
    'expires_at', v_expires
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. AYNI IMZALI LINK IPTALI
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ekstre_link_iptal(
  p_isletme_id uuid,
  p_cari_id uuid
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_can_view   boolean := false;
  v_is_owner   boolean := false;
  v_adet       integer;
BEGIN
  IF v_uid IS NULL
     OR p_isletme_id IS NULL
     OR p_cari_id IS NULL THEN
    RAISE EXCEPTION 'EKSTRE_LINK_YETKISIZ'
      USING ERRCODE = '42501';
  END IF;

  SELECT permission.can_view
  INTO v_can_view
  FROM internal.etkin_yetki(
    p_isletme_id,
    'cariler'
  ) AS permission;

  SELECT EXISTS(
    SELECT 1
    FROM public.isletmeler AS business_row
    WHERE business_row.id = p_isletme_id
      AND business_row.user_id = v_uid
  )
  INTO v_is_owner;

  IF v_can_view IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'EKSTRE_LINK_YETKISIZ'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'public.cari_ekstre_links:business:' || p_isletme_id::text,
      0
    )
  );

  UPDATE public.cari_ekstre_links AS active_link
  SET revoked = true
  WHERE active_link.isletme_id = p_isletme_id
    AND active_link.cari_id = p_cari_id
    AND active_link.revoked IS FALSE
    AND (
      v_is_owner
      OR active_link.created_by = v_uid
    );

  GET DIAGNOSTICS v_adet = ROW_COUNT;
  RETURN v_adet;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. PUBLIC TOKEN -> GUNCEL URETICI YETKISI (YALNIZ SERVICE ROLE)
-- ---------------------------------------------------------------------------
-- Edge hata/JSON sozlesmesini koruyabilsin diye revoked ve expires_at satiri
-- filtrelenmeden doner. Edge 404/410 ayrimini aynen yapar. Yalniz ureticinin
-- GUNCEL Cariler can_view kosulu saglanmazsa satir hic donmez.
CREATE FUNCTION public.cari_ekstre_token_dogrula_v1(
  p_token text
)
RETURNS TABLE (
  id uuid,
  isletme_id uuid,
  cari_id uuid,
  expires_at timestamptz,
  revoked boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
  SELECT
    link_row.id,
    link_row.isletme_id,
    link_row.cari_id,
    link_row.expires_at,
    link_row.revoked
  FROM public.cari_ekstre_links AS link_row
  WHERE p_token ~ '^[0-9a-f]{48}$'
    AND link_row.token = p_token
    AND link_row.created_by IS NOT NULL
    AND (
      EXISTS(
        SELECT 1
        FROM public.isletmeler AS owner_business
        WHERE owner_business.id = link_row.isletme_id
          AND owner_business.user_id = link_row.created_by
      )
      OR EXISTS(
        SELECT 1
        FROM public.isletme_users AS active_member
        WHERE active_member.isletme_id = link_row.isletme_id
          AND active_member.user_id = link_row.created_by
          AND internal.public_ekstre_cariler_uyeligi_izinli(
            active_member.status,
            active_member.permissions
          )
      )
    )
  LIMIT 1;
$function$;

ALTER FUNCTION public.cari_ekstre_token_dogrula_v1(text)
  OWNER TO postgres;

-- ---------------------------------------------------------------------------
-- 6. RLS + ACL: authenticated link listesini owner-all/shared-own yap
-- ---------------------------------------------------------------------------
ALTER POLICY "cari_ekstre_links_select"
ON public.cari_ekstre_links
TO authenticated
USING (
  EXISTS(
    SELECT 1
    FROM public.isletmeler AS owner_business
    WHERE owner_business.id = cari_ekstre_links.isletme_id
      AND owner_business.user_id = auth.uid()
  )
  OR (
    cari_ekstre_links.created_by = auth.uid()
    AND EXISTS(
      SELECT 1
      FROM internal.etkin_yetki(
        cari_ekstre_links.isletme_id,
        'cariler'
      ) AS permission
      WHERE permission.can_view IS TRUE
    )
  )
);

REVOKE ALL ON TABLE public.cari_ekstre_links
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.cari_ekstre_links
  FROM service_role;
GRANT SELECT ON TABLE public.cari_ekstre_links
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ekstre_link_olustur(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ekstre_link_olustur(uuid, uuid, integer)
  TO authenticated;

REVOKE ALL ON FUNCTION public.ekstre_link_iptal(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ekstre_link_iptal(uuid, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.cari_ekstre_token_dogrula_v1(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cari_ekstre_token_dogrula_v1(text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 7. MIGRATION-SONU POSTCONDITION
-- ---------------------------------------------------------------------------
DO $postcondition$
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
  v_profile_helper_oid oid := pg_catalog.to_regprocedure(
    'internal.public_ekstre_cariler_uyeligi_izinli(text,jsonb)'
  );
  v_validate_oid    oid := pg_catalog.to_regprocedure(
    'public.cari_ekstre_token_dogrula_v1(text)'
  );
  v_policy_count    bigint;
  v_index_definition text;
  v_profile_failure_count bigint;
BEGIN
  IF v_table_oid IS NULL
     OR v_create_oid IS NULL
     OR v_cancel_oid IS NULL
     OR v_profile_helper_oid IS NULL
     OR v_validate_oid IS NULL THEN
    RAISE EXCEPTION
      'P0-S10 postcondition: nesne eksik'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    WHERE function_row.oid = v_create_oid
      AND function_row.proowner = 'postgres'::pg_catalog.regrole
      AND function_row.prosecdef IS TRUE
      AND function_row.provolatile = 'v'
      AND function_row.proconfig =
        ARRAY['search_path=pg_catalog']::text[]
      AND pg_catalog.pg_get_function_result(function_row.oid) = 'jsonb'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    WHERE function_row.oid = v_cancel_oid
      AND function_row.proowner = 'postgres'::pg_catalog.regrole
      AND function_row.prosecdef IS TRUE
      AND function_row.provolatile = 'v'
      AND function_row.proconfig =
        ARRAY['search_path=pg_catalog']::text[]
      AND pg_catalog.pg_get_function_result(function_row.oid) = 'integer'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    WHERE function_row.oid = v_validate_oid
      AND function_row.proowner = 'postgres'::pg_catalog.regrole
      AND function_row.prosecdef IS TRUE
      AND function_row.provolatile = 's'
      AND function_row.proconfig =
        ARRAY['search_path=pg_catalog']::text[]
      AND pg_catalog.pg_get_function_result(function_row.oid) =
        'TABLE(id uuid, isletme_id uuid, cari_id uuid, expires_at timestamp with time zone, revoked boolean)'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    WHERE function_row.oid = v_profile_helper_oid
      AND function_row.proowner = 'postgres'::pg_catalog.regrole
      AND function_row.prosecdef IS FALSE
      AND function_row.provolatile = 'i'
      AND function_row.proparallel = 's'
      AND function_row.proconfig =
        ARRAY['search_path=pg_catalog']::text[]
      AND pg_catalog.pg_get_function_result(function_row.oid) = 'boolean'
  ) THEN
    RAISE EXCEPTION
      'P0-S10 postcondition: fonksiyon imza/owner/SECDEF/search_path bozuk'
      USING ERRCODE = '55000';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'authenticated',
    v_create_oid,
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'authenticated',
    v_cancel_oid,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    v_create_oid,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    v_create_oid,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    v_cancel_oid,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    v_cancel_oid,
    'EXECUTE'
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
  ) OR pg_catalog.has_function_privilege(
    'anon',
    v_profile_helper_oid,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    v_profile_helper_oid,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    v_profile_helper_oid,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'P0-S10 postcondition: fonksiyon ACL siniri bozuk'
      USING ERRCODE = '55000';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
    'authenticated',
    v_table_oid,
    'SELECT'
  ) OR pg_catalog.has_table_privilege(
    'authenticated',
    v_table_oid,
    'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
  ) OR pg_catalog.has_table_privilege(
    'anon',
    v_table_oid,
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
  ) OR NOT pg_catalog.has_table_privilege(
    'service_role',
    v_table_oid,
    'SELECT'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    v_table_oid,
    'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
  ) THEN
    RAISE EXCEPTION
      'P0-S10 phase-1 postcondition: gecici service SELECT/tablo ACL siniri bozuk'
      USING ERRCODE = '55000';
  END IF;

  -- PostgreSQL davranisinda owner/role/custom/legacy/closed/invalid matrisini
  -- kilitle. `role` helper girdisi degildir: resolver gibi yetki permissions
  -- JSON'undan gelir; profil isimleri kanit etiketidir.
  SELECT pg_catalog.count(*)
  INTO v_profile_failure_count
  FROM (
    VALUES
      (
        'manager',
        'active',
        '{"level":"edit_all","modules":{"cariler":true}}'::jsonb,
        true
      ),
      (
        'operator',
        'active',
        '{"level":"add","modules":{"cariler":true}}'::jsonb,
        true
      ),
      (
        'custom_view',
        'active',
        '{"level":"view","modules":{"cariler":true}}'::jsonb,
        true
      ),
      (
        'legacy_level_missing',
        'active',
        '{"modules":{"cariler":true},"actions":{}}'::jsonb,
        true
      ),
      (
        'legacy_level_json_null',
        'active',
        '{"level":null,"modules":{"cariler":true}}'::jsonb,
        true
      ),
      (
        'closed_module',
        'active',
        '{"level":"edit_all","modules":{"cariler":false}}'::jsonb,
        false
      ),
      (
        'invalid_level',
        'active',
        '{"level":"admin","modules":{"cariler":true}}'::jsonb,
        false
      ),
      (
        'string_true',
        'active',
        '{"level":"view","modules":{"cariler":"true"}}'::jsonb,
        false
      ),
      (
        'suspended',
        'suspended',
        '{"level":"edit_all","modules":{"cariler":true}}'::jsonb,
        false
      ),
      (
        'bad_permissions_container',
        'active',
        '[]'::jsonb,
        false
      )
  ) AS profile_fixture(
    profile_name,
    member_status,
    permissions,
    expected
  )
  WHERE internal.public_ekstre_cariler_uyeligi_izinli(
    profile_fixture.member_status,
    profile_fixture.permissions
  ) IS DISTINCT FROM profile_fixture.expected;

  IF v_profile_failure_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION
      'P0-S10 postcondition: Cariler creator profile parity matrisi bozuk'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_policy_count
  FROM pg_catalog.pg_policy AS policy_row
  WHERE policy_row.polrelid = v_table_oid;

  IF v_policy_count IS DISTINCT FROM 1
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policy AS policy_row
       WHERE policy_row.polrelid = v_table_oid
         AND policy_row.polname = 'cari_ekstre_links_select'
         AND policy_row.polcmd = 'r'
         AND policy_row.polpermissive IS TRUE
         AND policy_row.polroles =
           ARRAY['authenticated'::pg_catalog.regrole]::oid[]
         AND pg_catalog.pg_get_expr(
           policy_row.polqual,
           policy_row.polrelid
         ) LIKE '%created_by = auth.uid()%'
         AND pg_catalog.pg_get_expr(
           policy_row.polqual,
           policy_row.polrelid
         ) LIKE '%internal.etkin_yetki(cari_ekstre_links.isletme_id, ''cariler''::text)%'
     ) THEN
    RAISE EXCEPTION
      'P0-S10 postcondition: owner-all/shared-own SELECT policy bozuk'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.pg_get_indexdef(index_row.indexrelid)
  INTO v_index_definition
  FROM pg_catalog.pg_index AS index_row
  WHERE index_row.indexrelid = pg_catalog.to_regclass(
    'public.ux_cari_ekstre_links_active_creator'
  );

  IF v_index_definition IS DISTINCT FROM
    'CREATE UNIQUE INDEX ux_cari_ekstre_links_active_creator ON public.cari_ekstre_links USING btree (isletme_id, cari_id, created_by) WHERE ((revoked IS FALSE) AND (created_by IS NOT NULL))' THEN
    RAISE EXCEPTION
      'P0-S10 postcondition: partial unique index bozuk'
      USING ERRCODE = '55000';
  END IF;
END;
$postcondition$;
