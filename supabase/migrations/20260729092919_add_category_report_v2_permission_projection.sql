-- =============================================================================
-- P0-S8: kategori raporu kaynak-modul + creator gorunurlugu
-- =============================================================================
--
-- CANLI V1 SNAPSHOT (migration hazirlanirken):
--   identity : public.get_category_report(
--                uuid, text[], timestamptz, timestamptz
--              )
--   result   : TABLE(
--                kategori_id uuid,
--                kategori_adi text,
--                kategori_renk text,
--                kategori_icon text,
--                parent_id uuid,
--                islem_count bigint,
--                total_amount numeric
--              )
--   owner    : postgres
--   security : SECURITY DEFINER, VOLATILE, search_path=public
--   ACL      : postgres + authenticated + service_role
--   md5      : 92536d5b251422599d8d7f270e4f2240
--
-- SORUN:
-- V1 aktif isletme uyeligini kontrol ediyor; ancak Raporlar modulu, islem
-- tipinin gerektirdigi kaynak modulleri ve visibility.can_see_all_users_data
-- kontrol edilmiyordu. SECURITY DEFINER oldugu icin bu eksikler tablo RLS'i
-- tarafindan telafi edilmiyordu.
--
-- COZUM:
-- 1) Additive public.get_category_report_v2 ayni imza ve ayni yedi kolonu ekler.
-- 2) internal.etkin_yetki ile Raporlar ve kaynak modulleri fail-closed cozulur.
-- 3) internal.islem_tipi_modulu bilinmeyen tipte NULL dondurur; cagri bos doner.
-- 4) Urun hareketinden kategori tureten dal ayrica Urunler can_view ister.
-- 5) can_see_all_users_data=false ise SUM/COUNT oncesinde created_by suzulur.
-- 6) V1 ayni imza/sonuc sekliyle V2'ye delege eden guvenli wrapper olur.
--
-- ARSIV / PASIF:
-- Mevcut bilincli davranis korunur. is_archived filtresi eklenmez; arsivli
-- kayitlar rapora girmeye devam eder. Mevcut is_active filtreleri aynen kalir;
-- pasif hesap/cari/personel/urun rapora girmez.
--
-- VERI GUVENLIGI:
-- Bu migration tablo veya kullanici satirlarina yazmaz. Kolon/tablo/policy
-- degistirmez. Yalniz yeni salt-okunur RPC ekler ve mevcut V1 govdesini ayni
-- imza/sonuc sekliyle guvenli wrapper'a cevirir.
--
-- 1.5.x / ESKI CLIENT:
-- Eski istemci V1 adini cagirmaya devam eder ve ayni yedi kolonu ayni sirada
-- alir. Owner ve tam kaynak yetkili ortak icin hesaplama govdesi degismez.
-- Kisitli ortak daha az veya bos sonuc alabilir; bu beklenen guvenlik
-- daralmasidir ve response shape degismedigi icin istemciyi cokertmez.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Drift guard: V1 yalniz denetlenen canli snapshot uzerindeyse degistirilebilir.
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_oid oid := to_regprocedure(
    'public.get_category_report(uuid,text[],timestamp with time zone,timestamp with time zone)'
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
      'P0-S8 drift: get_category_report beklenen imzayla bulunamadi';
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
       'TABLE(kategori_id uuid, kategori_adi text, kategori_renk text, kategori_icon text, parent_id uuid, islem_count bigint, total_amount numeric)'
     OR v_security_definer IS DISTINCT FROM true
     OR v_volatility IS DISTINCT FROM 'v'
     OR v_config IS DISTINCT FROM ARRAY['search_path=public']::text[]
     OR NOT (
       (
         v_acl = '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
         AND v_definition_md5 = '92536d5b251422599d8d7f270e4f2240'
       )
       OR (
         -- Clean PostgreSQL 17 replay of the canonical repository source.
         v_acl IS NULL
         AND v_definition_md5 = '2c8e3f8a6f47087f1124307162a28acb'
       )
     )
  THEN
    RAISE EXCEPTION
      'P0-S8 drift: get_category_report canli snapshot degisti '
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
    'public.get_category_report_v2(uuid,text[],timestamp with time zone,timestamp with time zone)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION
      'P0-S8 drift: get_category_report_v2 migration oncesinde zaten var';
  END IF;
END;
$guard$;


-- ---------------------------------------------------------------------------
-- V2: exact-output, kaynak-modul ve creator filtreli aggregate.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_category_report_v2(
  p_isletme_id uuid,
  p_types text[],
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(
  kategori_id uuid,
  kategori_adi text,
  kategori_renk text,
  kategori_icon text,
  parent_id uuid,
  islem_count bigint,
  total_amount numeric
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
  v_has_cariler boolean := false;
  v_has_urunler boolean := false;
  v_has_personel boolean := false;
  v_allowed_source_modules text[] := ARRAY[]::text[];
  v_is_expense boolean;
BEGIN
  -- Parametre sozlesmesi. Tek bir NULL/bilinmeyen tip bile butun cagrinin bos
  -- donmesine yol acar; gecerli tiplerle karistirilarak allowlist asilamaz.
  IF p_isletme_id IS NULL
     OR p_types IS NULL
     OR pg_catalog.cardinality(p_types) < 1
     OR pg_catalog.cardinality(p_types) > 16
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
  THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(p_types) AS requested_type(type_name)
    WHERE requested_type.type_name IS NULL
       OR internal.islem_tipi_modulu(requested_type.type_name) IS NULL
  ) THEN
    RETURN;
  END IF;

  SELECT permission.can_view, permission.can_see_all_users_data
  INTO v_reports_can_view, v_can_see_all_users_data
  FROM internal.etkin_yetki(p_isletme_id, 'raporlar') AS permission
  LIMIT 1;

  -- Yetkisiz, pasif, capraz-tenant ve anonim cagri ayni bicimde bos doner.
  IF v_user_id IS NULL OR v_reports_can_view IS NOT TRUE THEN
    RETURN;
  END IF;

  SELECT permission.can_view
  INTO v_has_hesaplar
  FROM internal.etkin_yetki(p_isletme_id, 'hesaplar') AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_has_cariler
  FROM internal.etkin_yetki(p_isletme_id, 'cariler') AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_has_urunler
  FROM internal.etkin_yetki(p_isletme_id, 'urunler') AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_has_personel
  FROM internal.etkin_yetki(p_isletme_id, 'personel') AS permission
  LIMIT 1;

  IF v_has_hesaplar IS TRUE THEN
    v_allowed_source_modules :=
      pg_catalog.array_append(v_allowed_source_modules, 'hesaplar'::text);
  END IF;
  IF v_has_cariler IS TRUE THEN
    v_allowed_source_modules :=
      pg_catalog.array_append(v_allowed_source_modules, 'cariler'::text);
  END IF;
  IF v_has_personel IS TRUE THEN
    v_allowed_source_modules :=
      pg_catalog.array_append(v_allowed_source_modules, 'personel'::text);
  END IF;

  -- Urunler, islem_tipi_modulu sonucuna eklenmez: o helper islem bakiyesinin
  -- kaynak modullerini dondurur. Urun-hareket dali asagida ayrica gate edilir.
  v_is_expense := (
    p_types && ARRAY[
      'gider',
      'cari_alis',
      'personel_gider',
      'cari_alis_iade'
    ]::text[]
  );

  RETURN QUERY
  WITH rates AS (
    SELECT rate_row.rates
    FROM public.exchange_rates AS rate_row
    WHERE rate_row.base_currency = 'TRY'
    LIMIT 1
  ),
  -- Yetki/tarih/tip/creator filtresi bir kez ve hareket SUM'larindan once
  -- uygulanir. MATERIALIZED, iki rapor dalinin ayni izinli islem snapshotini
  -- kullanmasini ve urun hareketlerinin yalniz hedef islem id'leriyle aranmasini
  -- garanti eder.
  eligible_islemler AS MATERIALIZED (
    SELECT
      transaction_row.id,
      transaction_row.kategori_id,
      transaction_row.amount,
      COALESCE(
        account.currency,
        cari.currency,
        employee.currency,
        'TRY'
      ) AS txn_currency
    FROM public.islemler AS transaction_row
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
    CROSS JOIN LATERAL (
      SELECT
        internal.islem_tipi_modulu(transaction_row.type) AS required_modules
    ) AS source_mapping
    WHERE transaction_row.isletme_id = p_isletme_id
      AND transaction_row.type = ANY(p_types)
      AND transaction_row.date >= p_start_date
      AND transaction_row.date <= p_end_date
      AND source_mapping.required_modules IS NOT NULL
      AND source_mapping.required_modules <@ v_allowed_source_modules
      AND (
        v_can_see_all_users_data IS TRUE
        OR transaction_row.created_by = v_user_id
      )
      AND (account.id IS NULL OR account.is_active = true)
      AND (target_account.id IS NULL OR target_account.is_active = true)
      AND (cari.id IS NULL OR cari.is_active IS NOT FALSE)
      AND (employee.id IS NULL OR employee.is_active IS NOT FALSE)
  ),
  -- Part 1: urun hareketli islemler. Urunler kapaliysa bu dal satir uretmez.
  urun_islem_tutar AS (
    SELECT
      movement.islem_id,
      CASE
        WHEN v_is_expense THEN
          COALESCE(product_category.mapped_gider_kategori_id, product.kategori_id)
        ELSE
          COALESCE(product_category.mapped_gelir_kategori_id, product.kategori_id)
      END AS resolved_kategori_id,
      pg_catalog.abs(movement.miktar)
        * COALESCE(movement.birim_fiyat, 0)
        * (1 + COALESCE(movement.kdv_orani, 0) / 100.0) AS hareket_tutar,
      eligible_transaction.amount AS islem_amount,
      eligible_transaction.txn_currency
    FROM eligible_islemler AS eligible_transaction
    INNER JOIN public.urun_hareketler AS movement
      ON movement.islem_id = eligible_transaction.id
     AND movement.isletme_id = p_isletme_id
    INNER JOIN public.urunler AS product
      ON product.id = movement.urun_id
     AND product.isletme_id = p_isletme_id
    LEFT JOIN public.kategoriler AS product_category
      ON product_category.id = product.kategori_id
     AND product_category.isletme_id = p_isletme_id
    WHERE v_has_urunler IS TRUE
      AND product.is_active IS NOT FALSE
  ),
  islem_toplam AS (
    SELECT
      movement_amount.islem_id,
      pg_catalog.sum(movement_amount.hareket_tutar) AS toplam_hareket_tutar
    FROM urun_islem_tutar AS movement_amount
    GROUP BY movement_amount.islem_id
  ),
  dagitim AS (
    SELECT
      movement_amount.islem_id,
      movement_amount.resolved_kategori_id,
      movement_amount.hareket_tutar,
      transaction_total.toplam_hareket_tutar,
      movement_amount.islem_amount,
      movement_amount.txn_currency,
      CASE
        WHEN transaction_total.toplam_hareket_tutar > 0 THEN
          (
            movement_amount.hareket_tutar
            / transaction_total.toplam_hareket_tutar
          ) * movement_amount.islem_amount
        ELSE movement_amount.islem_amount
      END AS dagitilan_tutar
    FROM urun_islem_tutar AS movement_amount
    INNER JOIN islem_toplam AS transaction_total
      ON transaction_total.islem_id = movement_amount.islem_id
  )
  SELECT
    distributed.resolved_kategori_id AS kategori_id,
    category.name::text AS kategori_adi,
    category.color::text AS kategori_renk,
    category.icon::text AS kategori_icon,
    category.parent_id,
    pg_catalog.count(DISTINCT distributed.islem_id) AS islem_count,
    pg_catalog.sum(
      CASE
        WHEN distributed.txn_currency = 'TRY' THEN
          distributed.dagitilan_tutar
        ELSE
          distributed.dagitilan_tutar * COALESCE(
            (
              SELECT
                (rate.rates->>distributed.txn_currency)::decimal
              FROM rates AS rate
            ),
            1
          )
      END
    ) AS total_amount
  FROM dagitim AS distributed
  LEFT JOIN public.kategoriler AS category
    ON category.id = distributed.resolved_kategori_id
   AND category.isletme_id = p_isletme_id
  GROUP BY
    distributed.resolved_kategori_id,
    category.name,
    category.color,
    category.icon,
    category.parent_id

  UNION ALL

  -- Part 2: urun hareketi olmayan islemler; islemler.kategori_id kullanilir.
  SELECT
    category.id AS kategori_id,
    category.name::text AS kategori_adi,
    category.color::text AS kategori_renk,
    category.icon::text AS kategori_icon,
    category.parent_id,
    pg_catalog.count(transaction_row.id) AS islem_count,
    pg_catalog.sum(
      CASE
        WHEN transaction_row.txn_currency = 'TRY' THEN
          transaction_row.amount
        ELSE
          transaction_row.amount * COALESCE(
            (
              SELECT
                (rate.rates->>transaction_row.txn_currency)::decimal
              FROM rates AS rate
            ),
            1
          )
      END
    ) AS total_amount
  FROM eligible_islemler AS transaction_row
  LEFT JOIN public.kategoriler AS category
    ON category.id = transaction_row.kategori_id
   AND category.isletme_id = p_isletme_id
  WHERE NOT EXISTS (
      SELECT 1
      FROM public.urun_hareketler AS movement_check
      WHERE movement_check.islem_id = transaction_row.id
        AND movement_check.isletme_id = p_isletme_id
    )
  GROUP BY
    category.id,
    category.name,
    category.color,
    category.icon,
    category.parent_id;
END;
$function$;


-- ---------------------------------------------------------------------------
-- V1 compatibility wrapper: eski isim ve exact output korunur.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_category_report(
  p_isletme_id uuid,
  p_types text[],
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(
  kategori_id uuid,
  kategori_adi text,
  kategori_renk text,
  kategori_icon text,
  parent_id uuid,
  islem_count bigint,
  total_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $wrapper$
  SELECT
    report_row.kategori_id,
    report_row.kategori_adi,
    report_row.kategori_renk,
    report_row.kategori_icon,
    report_row.parent_id,
    report_row.islem_count,
    report_row.total_amount
  FROM public.get_category_report_v2(
    p_isletme_id,
    p_types,
    p_start_date,
    p_end_date
  ) AS report_row;
$wrapper$;


-- ---------------------------------------------------------------------------
-- Dar callable yuzey: owner postgres; istemci icin yalniz authenticated.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_category_report_v2(
  uuid,
  text[],
  timestamp with time zone,
  timestamp with time zone
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_category_report_v2(
  uuid,
  text[],
  timestamp with time zone,
  timestamp with time zone
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_category_report(
  uuid,
  text[],
  timestamp with time zone,
  timestamp with time zone
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_category_report(
  uuid,
  text[],
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
    'public.get_category_report_v2(uuid,text[],timestamp with time zone,timestamp with time zone)',
    'public.get_category_report(uuid,text[],timestamp with time zone,timestamp with time zone)'
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
         'TABLE(kategori_id uuid, kategori_adi text, kategori_renk text, kategori_icon text, parent_id uuid, islem_count bigint, total_amount numeric)'
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
