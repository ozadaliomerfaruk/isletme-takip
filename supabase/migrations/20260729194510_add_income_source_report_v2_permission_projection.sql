-- =============================================================================
-- P0-S8: gelir kaynagi raporu kaynak-modul + creator gorunurlugu (canli: 20260729194510)
-- =============================================================================
--
-- CANLI V1 SNAPSHOT (migration hazirlanirken):
--   identity : public.get_income_by_source(
--                uuid, timestamptz, timestamptz
--              )
--   result   : TABLE(
--                source_kind text,
--                source_type text,
--                source_id uuid,
--                source_name text,
--                source_currency text,
--                islem_count bigint,
--                total_amount numeric,
--                total_native numeric
--              )
--   owner    : postgres
--   security : SECURITY DEFINER, VOLATILE, search_path=public
--   ACL      : postgres + authenticated + service_role
--   md5      : d2364968ef2b56a2fb079ebf1eb45b6b
--
-- SORUN:
-- V1 aktif isletme uyeligini ve Raporlar modulunu kontrol ediyor; ancak Hesaplar,
-- Cariler ve Personel kaynaklarini kendi can_view izinleriyle ayirmiyordu.
-- visibility.can_see_all_users_data=false iken de butun kullanicilarin islemlerini
-- topluyordu. SECURITY DEFINER oldugu icin tablo RLS'i bu aciklari kapatmiyordu.
--
-- COZUM:
-- 1) Additive public.get_income_by_source_v2 ayni imza ve ayni sekiz kolonu ekler.
-- 2) Raporlar, uc kaynak modulu ve Birikim alt izni internal.etkin_yetki uzerinden
--    fail-closed cozulur.
-- 3) Her kaynak dali yalniz kendi modulu aciksa calisir; kismi rapor desteklenir.
-- 4) can_see_all_users_data=false ise islem created_by filtresi SUM/COUNT oncesinde
--    uygulanir. Cari/personel kaynak adlari da mevcut tablo RLS'iyle ayni bicimde
--    kaynak kaydin created_by degeriyle daraltilir. Hesaplarin mevcut SELECT RLS'i
--    kaynak created_by filtresi istemedigi icin hesap adi davranisi korunur.
-- 5) V1 ayni imza/sonuc sekliyle V2'ye delege eden guvenli wrapper olur.
--
-- ARSIV / PASIF:
-- Mevcut bilincli davranis korunur. is_archived filtresi eklenmez; arsivli
-- kaynaklar rapora girmeye devam eder. Mevcut is_active filtreleri aynen kalir;
-- pasif hesap/cari/personel rapora girmez.
--
-- VERI GUVENLIGI:
-- Bu migration tablo veya kullanici satirlarina yazmaz. Kolon/tablo/policy/index
-- degistirmez; DML/backfill yapmaz. Yalniz yeni salt-okunur RPC ekler ve mevcut
-- V1 govdesini ayni imza/sonuc sekliyle guvenli wrapper'a cevirir.
--
-- 1.5.x / ESKI CLIENT:
-- Eski istemci V1 adini cagirmaya devam eder ve ayni sekiz kolonu ayni sirada alir.
-- Tenant-tutarli owner ve tam kaynak yetkili ortak icin hesaplama sonucu degismez.
-- Canli on taramada bulunan 6 capraz-tenant cari referansinin rapor kosuluna uyan
-- 1 tanesi artik yanlis islem tenantinin gelir kaynagi olarak gosterilmez. Ilgili
-- islem/cari satiri silinmez veya degistirilmez; yalniz hatali rapor eslesmesi
-- kapanir. Kisitli ortak yalniz acik kaynak modullerinden ve izinli creator
-- kapsamindan daha az veya bos sonuc alabilir; bu beklenen guvenlik daralmasidir.
-- Response shape degismedigi icin eski istemciyi cokertmez.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Drift guard: V1 yalniz denetlenen canli snapshot uzerindeyse degistirilebilir.
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_oid oid := to_regprocedure(
    'public.get_income_by_source(uuid,timestamp with time zone,timestamp with time zone)'
  );
  v_owner text;
  v_result text;
  v_security_definer boolean;
  v_volatility "char";
  v_config text[];
  v_acl text;
  v_definition_md5 text;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION
      'P0-S8 drift: get_income_by_source beklenen imzayla bulunamadi';
  END IF;

  SELECT
    pg_get_userbyid(proc.proowner),
    pg_get_function_result(proc.oid),
    proc.prosecdef,
    proc.provolatile,
    proc.proconfig,
    proc.proacl::text,
    md5(pg_get_functiondef(proc.oid))
  INTO
    v_owner,
    v_result,
    v_security_definer,
    v_volatility,
    v_config,
    v_acl,
    v_definition_md5
  FROM pg_proc AS proc
  WHERE proc.oid = v_oid;

  IF v_owner IS DISTINCT FROM 'postgres'
     OR v_result IS DISTINCT FROM
       'TABLE(source_kind text, source_type text, source_id uuid, source_name text, source_currency text, islem_count bigint, total_amount numeric, total_native numeric)'
     OR v_security_definer IS DISTINCT FROM true
     OR v_volatility IS DISTINCT FROM 'v'
     OR v_config IS DISTINCT FROM ARRAY['search_path=public']::text[]
     OR v_acl NOT IN (
       -- Denetlenen canli snapshot.
       '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}',
       -- Temiz migration replay: tarihsel V1 yalniz authenticated EXECUTE verir.
       '{postgres=X/postgres,authenticated=X/postgres}'
     )
     OR v_definition_md5 NOT IN (
       'd2364968ef2b56a2fb079ebf1eb45b6b',
       '0237f3b06530c8d8799e6ce493bcfc7a'
     )
  THEN
    RAISE EXCEPTION
      'P0-S8 drift: get_income_by_source canli snapshot degisti '
      '(owner=%, result=%, secdef=%, volatility=%, config=%, acl=%, md5=%)',
      v_owner,
      v_result,
      v_security_definer,
      v_volatility,
      v_config,
      v_acl,
      v_definition_md5;
  END IF;

  IF to_regprocedure(
    'public.get_income_by_source_v2(uuid,timestamp with time zone,timestamp with time zone)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION
      'P0-S8 drift: get_income_by_source_v2 migration oncesinde zaten var';
  END IF;
END;
$guard$;


-- ---------------------------------------------------------------------------
-- V2: exact-output, kaynak-modul ve creator filtreli aggregate.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_income_by_source_v2(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(
  source_kind text,
  source_type text,
  source_id uuid,
  source_name text,
  source_currency text,
  islem_count bigint,
  total_amount numeric,
  total_native numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_reports_can_view boolean := false;
  v_can_see_all_users_data boolean := false;
  v_has_hesaplar boolean := false;
  v_has_birikim boolean := false;
  v_has_cariler boolean := false;
  v_has_personel boolean := false;
BEGIN
  IF p_isletme_id IS NULL
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
  THEN
    RETURN;
  END IF;

  SELECT
    permission.can_view,
    permission.can_see_all_users_data
  INTO
    v_reports_can_view,
    v_can_see_all_users_data
  FROM internal.etkin_yetki(p_isletme_id, 'raporlar') AS permission
  LIMIT 1;

  -- Anonim, pasif, capraz-tenant ve Raporlar-kapali cagri ayni bicimde bos doner.
  IF v_user_id IS NULL OR v_reports_can_view IS NOT TRUE THEN
    RETURN;
  END IF;

  SELECT permission.can_view
  INTO v_has_hesaplar
  FROM internal.etkin_yetki(p_isletme_id, 'hesaplar') AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_has_birikim
  FROM internal.etkin_yetki(p_isletme_id, 'birikim') AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_has_cariler
  FROM internal.etkin_yetki(p_isletme_id, 'cariler') AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_has_personel
  FROM internal.etkin_yetki(p_isletme_id, 'personel') AS permission
  LIMIT 1;

  IF v_has_hesaplar IS NOT TRUE
     AND v_has_cariler IS NOT TRUE
     AND v_has_personel IS NOT TRUE
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH rates AS MATERIALIZED (
    SELECT rate_row.rates
    FROM public.exchange_rates AS rate_row
    WHERE rate_row.base_currency = 'TRY'
    LIMIT 1
  ),
  hesap_gelir AS (
    SELECT
      'hesap'::text AS source_kind,
      account.type::text AS source_type,
      account.id AS source_id,
      account.name::text AS source_name,
      COALESCE(account.currency, 'TRY')::text AS source_currency,
      pg_catalog.count(transaction_row.id) AS islem_count,
      pg_catalog.sum(
        CASE
          WHEN COALESCE(account.currency, 'TRY') = 'TRY' THEN
            transaction_row.amount
          ELSE
            transaction_row.amount * COALESCE(
              (
                SELECT
                  (rate.rates->>account.currency)::decimal
                FROM rates AS rate
              ),
              1
            )
        END
      ) AS total_amount,
      pg_catalog.sum(transaction_row.amount) AS total_native
    FROM public.islemler AS transaction_row
    INNER JOIN public.hesaplar AS account
      ON account.id = transaction_row.hesap_id
     AND account.isletme_id = p_isletme_id
    WHERE v_has_hesaplar IS TRUE
      AND transaction_row.isletme_id = p_isletme_id
      AND transaction_row.type = 'gelir'
      AND transaction_row.date >= p_start_date
      AND transaction_row.date <= p_end_date
      AND account.is_active = true
      AND (
        account.type <> 'birikim'
        OR v_has_birikim IS TRUE
      )
      AND (
        v_can_see_all_users_data IS TRUE
        OR transaction_row.created_by = v_user_id
      )
    GROUP BY
      account.id,
      account.type,
      account.name,
      account.currency
  ),
  cari_gelir AS (
    SELECT
      'cari'::text AS source_kind,
      'cari'::text AS source_type,
      cari.id AS source_id,
      cari.name::text AS source_name,
      COALESCE(cari.currency, 'TRY')::text AS source_currency,
      pg_catalog.count(transaction_row.id) AS islem_count,
      pg_catalog.sum(
        (
          CASE
            WHEN COALESCE(cari.currency, 'TRY') = 'TRY' THEN
              transaction_row.amount
            ELSE
              transaction_row.amount * COALESCE(
                (
                  SELECT
                    (rate.rates->>cari.currency)::decimal
                  FROM rates AS rate
                ),
                1
              )
          END
        ) * CASE
              WHEN transaction_row.type = 'cari_satis_iade' THEN -1
              ELSE 1
            END
      ) AS total_amount,
      pg_catalog.sum(
        transaction_row.amount * CASE
          WHEN transaction_row.type = 'cari_satis_iade' THEN -1
          ELSE 1
        END
      ) AS total_native
    FROM public.islemler AS transaction_row
    INNER JOIN public.cariler AS cari
      ON cari.id = transaction_row.cari_id
     AND cari.isletme_id = p_isletme_id
    WHERE v_has_cariler IS TRUE
      AND transaction_row.isletme_id = p_isletme_id
      AND transaction_row.type IN ('cari_satis', 'cari_satis_iade')
      AND transaction_row.date >= p_start_date
      AND transaction_row.date <= p_end_date
      AND cari.is_active IS NOT FALSE
      AND (
        v_can_see_all_users_data IS TRUE
        OR (
          transaction_row.created_by = v_user_id
          AND cari.created_by = v_user_id
        )
      )
    GROUP BY
      cari.id,
      cari.name,
      cari.currency
  ),
  personel_gelir AS (
    SELECT
      'personel'::text AS source_kind,
      'personel'::text AS source_type,
      employee.id AS source_id,
      pg_catalog.btrim(
        COALESCE(employee.first_name, '')
        || ' '
        || COALESCE(employee.last_name, '')
      )::text AS source_name,
      COALESCE(employee.currency, 'TRY')::text AS source_currency,
      pg_catalog.count(transaction_row.id) AS islem_count,
      pg_catalog.sum(
        CASE
          WHEN COALESCE(employee.currency, 'TRY') = 'TRY' THEN
            transaction_row.amount
          ELSE
            transaction_row.amount * COALESCE(
              (
                SELECT
                  (rate.rates->>employee.currency)::decimal
                FROM rates AS rate
              ),
              1
            )
        END
      ) AS total_amount,
      pg_catalog.sum(transaction_row.amount) AS total_native
    FROM public.islemler AS transaction_row
    INNER JOIN public.personel AS employee
      ON employee.id = transaction_row.personel_id
     AND employee.isletme_id = p_isletme_id
    WHERE v_has_personel IS TRUE
      AND transaction_row.isletme_id = p_isletme_id
      AND transaction_row.type = 'personel_satis'
      AND transaction_row.date >= p_start_date
      AND transaction_row.date <= p_end_date
      AND employee.is_active IS NOT FALSE
      AND (
        v_can_see_all_users_data IS TRUE
        OR (
          transaction_row.created_by = v_user_id
          AND employee.created_by = v_user_id
        )
      )
    GROUP BY
      employee.id,
      employee.first_name,
      employee.last_name,
      employee.currency
  )
  SELECT
    report_row.source_kind,
    report_row.source_type,
    report_row.source_id,
    report_row.source_name,
    report_row.source_currency,
    report_row.islem_count,
    report_row.total_amount,
    report_row.total_native
  FROM hesap_gelir AS report_row
  UNION ALL
  SELECT
    report_row.source_kind,
    report_row.source_type,
    report_row.source_id,
    report_row.source_name,
    report_row.source_currency,
    report_row.islem_count,
    report_row.total_amount,
    report_row.total_native
  FROM cari_gelir AS report_row
  UNION ALL
  SELECT
    report_row.source_kind,
    report_row.source_type,
    report_row.source_id,
    report_row.source_name,
    report_row.source_currency,
    report_row.islem_count,
    report_row.total_amount,
    report_row.total_native
  FROM personel_gelir AS report_row;
END;
$function$;


-- ---------------------------------------------------------------------------
-- V1 compatibility wrapper: eski isim ve exact output korunur.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_income_by_source(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(
  source_kind text,
  source_type text,
  source_id uuid,
  source_name text,
  source_currency text,
  islem_count bigint,
  total_amount numeric,
  total_native numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $wrapper$
  SELECT
    report_row.source_kind,
    report_row.source_type,
    report_row.source_id,
    report_row.source_name,
    report_row.source_currency,
    report_row.islem_count,
    report_row.total_amount,
    report_row.total_native
  FROM public.get_income_by_source_v2(
    p_isletme_id,
    p_start_date,
    p_end_date
  ) AS report_row;
$wrapper$;


-- ---------------------------------------------------------------------------
-- Dar callable yuzey: owner postgres; istemci icin yalniz authenticated.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_income_by_source_v2(
  uuid,
  timestamp with time zone,
  timestamp with time zone
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_income_by_source_v2(
  uuid,
  timestamp with time zone,
  timestamp with time zone
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_income_by_source(
  uuid,
  timestamp with time zone,
  timestamp with time zone
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_income_by_source(
  uuid,
  timestamp with time zone,
  timestamp with time zone
) TO authenticated;


-- ---------------------------------------------------------------------------
-- Postcondition: iki public uc da exact-shape, postgres owner, STABLE, SECDEF,
-- pg_catalog search path ve dar ACL ile kalmalidir.
-- ---------------------------------------------------------------------------
DO $postcondition$
DECLARE
  v_name text;
  v_oid oid;
  v_owner text;
  v_result text;
  v_security_definer boolean;
  v_volatility "char";
  v_config text[];
  v_public_execute boolean;
  v_anon_execute boolean;
  v_authenticated_execute boolean;
  v_service_role_execute boolean;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'public.get_income_by_source_v2(uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_income_by_source(uuid,timestamp with time zone,timestamp with time zone)'
  ]::text[]
  LOOP
    v_oid := to_regprocedure(v_name);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'P0-S8 postcondition: % bulunamadi', v_name;
    END IF;

    SELECT
      pg_get_userbyid(proc.proowner),
      pg_get_function_result(proc.oid),
      proc.prosecdef,
      proc.provolatile,
      proc.proconfig,
      EXISTS (
        SELECT 1
        FROM aclexplode(
          COALESCE(proc.proacl, acldefault('f', proc.proowner))
        ) AS privilege
        WHERE privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
      ),
      has_function_privilege('anon', proc.oid, 'EXECUTE'),
      has_function_privilege('authenticated', proc.oid, 'EXECUTE'),
      has_function_privilege('service_role', proc.oid, 'EXECUTE')
    INTO
      v_owner,
      v_result,
      v_security_definer,
      v_volatility,
      v_config,
      v_public_execute,
      v_anon_execute,
      v_authenticated_execute,
      v_service_role_execute
    FROM pg_proc AS proc
    WHERE proc.oid = v_oid;

    IF v_owner IS DISTINCT FROM 'postgres'
       OR v_result IS DISTINCT FROM
         'TABLE(source_kind text, source_type text, source_id uuid, source_name text, source_currency text, islem_count bigint, total_amount numeric, total_native numeric)'
       OR v_security_definer IS DISTINCT FROM true
       OR v_volatility IS DISTINCT FROM 's'
       OR v_config IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
       OR v_public_execute IS DISTINCT FROM false
       OR v_anon_execute IS DISTINCT FROM false
       OR v_authenticated_execute IS DISTINCT FROM true
       OR v_service_role_execute IS DISTINCT FROM false
    THEN
      RAISE EXCEPTION
        'P0-S8 postcondition: guvenlik sozlesmesi saglanmadi '
        '(name=%, owner=%, result=%, secdef=%, volatility=%, config=%, '
        'public=%, anon=%, authenticated=%, service_role=%)',
        v_name,
        v_owner,
        v_result,
        v_security_definer,
        v_volatility,
        v_config,
        v_public_execute,
        v_anon_execute,
        v_authenticated_execute,
        v_service_role_execute;
    END IF;
  END LOOP;
END;
$postcondition$;
