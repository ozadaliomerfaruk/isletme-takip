-- =============================================================================
-- P0-S8: urun alis/satis raporu kaynak-modul + creator gorunurlugu
-- =============================================================================
--
-- CANLI V1 SNAPSHOT (20260729201911 migration'i uygulanmadan hemen once):
--   identity : public.get_product_report(
--                uuid, timestamptz, timestamptz, text[]
--              )
--   result   : TABLE(
--                urun_id uuid,
--                urun_adi text,
--                urun_birim text,
--                kategori_id uuid,
--                kategori_adi text,
--                toplam_miktar numeric,
--                toplam_tutar numeric,
--                toplam_tutar_kdvsiz numeric,
--                islem_sayisi bigint
--              )
--   owner    : postgres
--   security : SECURITY DEFINER, VOLATILE, search_path=public
--   ACL      : postgres + authenticated + service_role
--   md5      : 6139dd322f98a53bfd7e4d009acb7a65
--
-- SORUN:
-- V1 yalniz aktif isletme uyeligini kontrol ediyor. Raporlar/Urunler kaynak kapisi
-- ve visibility.can_see_all_users_data filtresi yok. SECURITY DEFINER oldugu icin
-- tablo RLS'i bu aciklari kapatmiyor.
--
-- COZUM:
-- 1) Additive public.get_product_report_v2 ayni imza ve ayni dokuz kolonu ekler.
-- 2) Raporlar + Urunler zorunludur. Bu rapor cari/personel adini veya kaydini
--    dondurmez; bagli ve bagimsiz butun satirlar Urun hareketi kaynagidir. Urunler
--    + Raporlar sozlesmesi korunur, Cariler/Personel ayrica zorunlu tutulmaz.
-- 3) Isleme bagli olmayan toplu giris/cikis da ayni Urunler kaynaginda kalir.
-- 4) can_see_all_users_data=false iken bagli harekette kanonik sahip olan islem,
--    bagimsiz harekette hareket created_by degeri auth.uid() olmak zorundadir.
--    Reapply turetilmis hareketi editor adina yeniden yaratabildigi icin bagli
--    harekette movement.created_by sahiplik otoritesi olarak kullanilmaz.
-- 5) Butun join'ler tenant-kapsamli; bozuk/capraz referans fail-closed olur.
-- 6) V1 ayni imza/sonuc sekliyle V2'ye delege eden guvenli wrapper olur.
--
-- ARSIV / PASIF:
-- Bilincli davranis korunur. is_archived filtresi eklenmez; arsivli urunler rapora
-- girmeye devam eder. Mevcut is_active filtreleri korunur; pasif urun ve bagli
-- pasif hesap/cari/personel rapora girmez.
--
-- VERI GUVENLIGI:
-- Bu migration tablo veya kullanici satirlarina yazmaz. Kolon/tablo/policy/index
-- degistirmez; DML/backfill yapmaz. Yalniz yeni salt-okunur RPC ekler ve mevcut
-- V1 govdesini ayni imza/sonuc sekliyle guvenli wrapper'a cevirir.
--
-- 1.5.x / ESKI CLIENT:
-- Eski istemci V1 adini cagirmaya ve ayni dokuz kolonu almaya devam eder. Owner'in
-- tenant-tutarli sonucu degismez. Kisitli ortak yalniz Raporlar + Urunler ve own/all
-- creator kapsaminda daha az veya bos sonuc alabilir; Cariler/Personel kapali olsa
-- da yetkili Urun hareketleri raporda kalir. Bu beklenen guvenlik daralmasidir.
-- Response shape degismez. Sunucu migration'i eski binary'nin daha once diske
-- yazdigi stale aggregate cache'ini cihazdan silemez; eski build offline durumda
-- cache suresi/yenileme/logout'a kadar onceki goruntuyu gosterebilir. Yeni client
-- V2 + user/yetki key + persist:false ve cache buster ile bu kalintiyi devralmaz.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Drift guard: V1 yalniz denetlenen canli snapshot uzerindeyse degistirilebilir.
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_oid oid := to_regprocedure(
    'public.get_product_report(uuid,timestamp with time zone,timestamp with time zone,text[])'
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
      'P0-S8 drift: get_product_report beklenen imzayla bulunamadi';
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
       'TABLE(urun_id uuid, urun_adi text, urun_birim text, kategori_id uuid, kategori_adi text, toplam_miktar numeric, toplam_tutar numeric, toplam_tutar_kdvsiz numeric, islem_sayisi bigint)'
     OR v_security_definer IS DISTINCT FROM true
     OR v_volatility IS DISTINCT FROM 'v'
     OR v_config IS DISTINCT FROM ARRAY['search_path=public']::text[]
     OR v_acl IS DISTINCT FROM
       '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
     OR v_definition_md5 IS DISTINCT FROM
       '6139dd322f98a53bfd7e4d009acb7a65'
  THEN
    RAISE EXCEPTION
      'P0-S8 drift: get_product_report canli snapshot degisti '
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
    'public.get_product_report_v2(uuid,timestamp with time zone,timestamp with time zone,text[])'
  ) IS NOT NULL THEN
    RAISE EXCEPTION
      'P0-S8 drift: get_product_report_v2 migration oncesinde zaten var';
  END IF;
END;
$guard$;


-- ---------------------------------------------------------------------------
-- V2: exact-output, kaynak-modul ve creator filtreli aggregate.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_product_report_v2(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone,
  p_islem_types text[]
)
RETURNS TABLE(
  urun_id uuid,
  urun_adi text,
  urun_birim text,
  kategori_id uuid,
  kategori_adi text,
  toplam_miktar numeric,
  toplam_tutar numeric,
  toplam_tutar_kdvsiz numeric,
  islem_sayisi bigint
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
  v_has_urunler boolean := false;
  v_include_unlinked_giris boolean := false;
  v_include_unlinked_cikis boolean := false;
BEGIN
  IF p_isletme_id IS NULL
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
     OR p_islem_types IS NULL
     OR pg_catalog.cardinality(p_islem_types) < 1
     OR pg_catalog.cardinality(p_islem_types) > 16
  THEN
    RETURN;
  END IF;

  -- Bu RPC yalniz mevcut Alis/Satis ekraninin bes finansal tipini kabul eder.
  -- Tek bir NULL/bilinmeyen tip butun cagrinin fail-closed bos donmesini saglar.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(p_islem_types) AS requested_type(type_name)
    WHERE requested_type.type_name IS NULL
       OR requested_type.type_name NOT IN (
         'cari_alis',
         'cari_alis_iade',
         'cari_satis',
         'cari_satis_iade',
         'personel_satis'
       )
  ) THEN
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

  SELECT permission.can_view
  INTO v_has_urunler
  FROM internal.etkin_yetki(p_isletme_id, 'urunler') AS permission
  LIMIT 1;

  -- Anonim, pasif, capraz-tenant, Raporlar-kapali veya Urunler-kapali cagri bos.
  IF v_user_id IS NULL
     OR v_reports_can_view IS NOT TRUE
     OR v_has_urunler IS NOT TRUE
  THEN
    RETURN;
  END IF;

  -- Bagli ve bagimsiz hareketler Urunler verisidir. Cari/personel join'leri
  -- yalniz mevcut tutar/aktiflik semantigini korur; kaynak isimlerini dondurmez.
  v_include_unlinked_giris := 'cari_alis' = ANY(p_islem_types);
  v_include_unlinked_cikis :=
    'cari_satis' = ANY(p_islem_types)
    OR 'personel_satis' = ANY(p_islem_types);

  RETURN QUERY
  WITH rates AS MATERIALIZED (
    SELECT rate_row.rates
    FROM public.exchange_rates AS rate_row
    WHERE rate_row.base_currency = 'TRY'
    LIMIT 1
  )
  SELECT
    product.id AS urun_id,
    product.ad::text AS urun_adi,
    product.birim::text AS urun_birim,
    category.id AS kategori_id,
    category.name::text AS kategori_adi,
    pg_catalog.sum(pg_catalog.abs(movement.miktar)) AS toplam_miktar,
    pg_catalog.sum(
      pg_catalog.abs(movement.miktar)
      * COALESCE(movement.birim_fiyat, 0)
      * (1 + COALESCE(movement.kdv_orani, 0) / 100.0)
      * CASE
          WHEN transaction_row.id IS NULL THEN 1
          WHEN COALESCE(
            account.currency,
            cari.currency,
            employee.currency,
            'TRY'
          ) = 'TRY' THEN 1
          ELSE COALESCE(
            (
              SELECT
                (
                  rate.rates->>COALESCE(
                    account.currency,
                    cari.currency,
                    employee.currency
                  )
                )::decimal
              FROM rates AS rate
            ),
            1
          )
        END
    ) AS toplam_tutar,
    pg_catalog.sum(
      pg_catalog.abs(movement.miktar)
      * COALESCE(movement.birim_fiyat, 0)
      * CASE
          WHEN transaction_row.id IS NULL THEN 1
          WHEN COALESCE(
            account.currency,
            cari.currency,
            employee.currency,
            'TRY'
          ) = 'TRY' THEN 1
          ELSE COALESCE(
            (
              SELECT
                (
                  rate.rates->>COALESCE(
                    account.currency,
                    cari.currency,
                    employee.currency
                  )
                )::decimal
              FROM rates AS rate
            ),
            1
          )
        END
    ) AS toplam_tutar_kdvsiz,
    pg_catalog.count(
      DISTINCT COALESCE(movement.islem_id, movement.id)
    ) AS islem_sayisi
  FROM public.urun_hareketler AS movement
  INNER JOIN public.urunler AS product
    ON product.id = movement.urun_id
   AND product.isletme_id = p_isletme_id
  LEFT JOIN public.kategoriler AS category
    ON category.id = product.kategori_id
   AND category.isletme_id = p_isletme_id
  LEFT JOIN public.islemler AS transaction_row
    ON transaction_row.id = movement.islem_id
   AND transaction_row.isletme_id = p_isletme_id
  LEFT JOIN public.hesaplar AS account
    ON account.id = transaction_row.hesap_id
   AND account.isletme_id = p_isletme_id
  LEFT JOIN public.hesaplar AS target_account
    ON target_account.id = transaction_row.hedef_hesap_id
   AND target_account.isletme_id = p_isletme_id
  LEFT JOIN public.cariler AS cari
    ON cari.id = transaction_row.cari_id
   AND cari.isletme_id = p_isletme_id
  LEFT JOIN public.personel AS employee
    ON employee.id = transaction_row.personel_id
   AND employee.isletme_id = p_isletme_id
  WHERE movement.isletme_id = p_isletme_id
    AND product.is_active IS NOT FALSE
    AND (
      (
        movement.islem_id IS NOT NULL
        AND transaction_row.id IS NOT NULL
        AND transaction_row.type = ANY(p_islem_types)
        AND transaction_row.date >= p_start_date
        AND transaction_row.date <= p_end_date
        AND (
          transaction_row.hesap_id IS NULL
          OR account.id IS NOT NULL
        )
        AND (
          transaction_row.hedef_hesap_id IS NULL
          OR target_account.id IS NOT NULL
        )
        AND (
          transaction_row.cari_id IS NULL
          OR cari.id IS NOT NULL
        )
        AND (
          transaction_row.personel_id IS NULL
          OR employee.id IS NOT NULL
        )
        AND (account.id IS NULL OR account.is_active = true)
        AND (
          target_account.id IS NULL
          OR target_account.is_active = true
        )
        AND (cari.id IS NULL OR cari.is_active IS NOT FALSE)
        AND (
          employee.id IS NULL
          OR employee.is_active IS NOT FALSE
        )
        AND (
          v_can_see_all_users_data IS TRUE
          OR transaction_row.created_by = v_user_id
        )
      )
      OR
      (
        movement.islem_id IS NULL
        AND movement.created_at >= p_start_date
        AND movement.created_at <= p_end_date
        AND (
          (
            v_include_unlinked_giris IS TRUE
            AND movement.hareket_tipi = 'giris'
          )
          OR
          (
            v_include_unlinked_cikis IS TRUE
            AND movement.hareket_tipi = 'cikis'
          )
        )
        AND (
          v_can_see_all_users_data IS TRUE
          OR movement.created_by = v_user_id
        )
      )
    )
  GROUP BY
    product.id,
    product.ad,
    product.birim,
    category.id,
    category.name
  ORDER BY 7 DESC;
END;
$function$;


-- ---------------------------------------------------------------------------
-- V1 compatibility wrapper: eski isim ve exact output korunur.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_product_report(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone,
  p_islem_types text[]
)
RETURNS TABLE(
  urun_id uuid,
  urun_adi text,
  urun_birim text,
  kategori_id uuid,
  kategori_adi text,
  toplam_miktar numeric,
  toplam_tutar numeric,
  toplam_tutar_kdvsiz numeric,
  islem_sayisi bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $wrapper$
  SELECT
    report_row.urun_id,
    report_row.urun_adi,
    report_row.urun_birim,
    report_row.kategori_id,
    report_row.kategori_adi,
    report_row.toplam_miktar,
    report_row.toplam_tutar,
    report_row.toplam_tutar_kdvsiz,
    report_row.islem_sayisi
  FROM public.get_product_report_v2(
    p_isletme_id,
    p_start_date,
    p_end_date,
    p_islem_types
  ) AS report_row;
$wrapper$;


-- ---------------------------------------------------------------------------
-- Dar callable yuzey: owner postgres; istemci icin yalniz authenticated.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_product_report_v2(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  text[]
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_product_report_v2(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  text[]
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_product_report(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  text[]
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_product_report(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  text[]
) TO authenticated;


-- ---------------------------------------------------------------------------
-- Postcondition: iki public uc exact-shape, postgres owner, STABLE, SECDEF,
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
    'public.get_product_report_v2(uuid,timestamp with time zone,timestamp with time zone,text[])',
    'public.get_product_report(uuid,timestamp with time zone,timestamp with time zone,text[])'
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
         'TABLE(urun_id uuid, urun_adi text, urun_birim text, kategori_id uuid, kategori_adi text, toplam_miktar numeric, toplam_tutar numeric, toplam_tutar_kdvsiz numeric, islem_sayisi bigint)'
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
