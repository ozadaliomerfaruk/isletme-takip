-- =============================================================================
-- P0-S8: get_category_report_v2 plan regresyonunu gider
-- Canli migration kaydi: 20260729095349
-- =============================================================================
--
-- CANLI ONCESI:
--   public.get_category_report_v2
--   md5      : 90f07fe33af89462f0dcc3a03f6790e8
--   owner    : postgres
--   security : SECURITY DEFINER, STABLE, search_path=pg_catalog
--   ACL      : postgres + authenticated
--
-- KOK NEDEN:
-- Onceki govde internal.islem_tipi_modulu(transaction_row.type) fonksiyonunu
-- uygun olabilecek her islem satirinda iki kez calistiriyordu. Daha onemlisi,
-- planner bu fonksiyon + array containment filtresinden sonra 23 bin satiri
-- yaklasik 84 satir tahmin ediyor; kucuk entity/kategori tablolarina hash join
-- yerine on binlerce PK lookup seciyor ve aggregate sort'u diske tasiyordu.
--
-- COZUM:
-- p_types en fazla 16 elemanlidir. Gerekli kaynak modulu izinli olan tipleri
-- internal.islem_tipi_modulu ile bir kez bu kucuk dizi uzerinden turet; buyuk
-- islemler taramasinda yalniz type = ANY(v_allowed_types) kullan. Boylece
-- canonical tip->modul eslemesi, creator filtresi, Urunler gate'i, pasif/arsiv
-- semantigi ve exact output degismez; planner gercek tipe ait istatistikleri
-- kullanabilir.
--
-- Bu RPC tenant, tarih ve tip dagilimina cok duyarlidir. PL/pgSQL'in birkac
-- cagridan sonra sectigi generic plan buyuk tenantta yeniden yavasladigi icin
-- plan_cache_mode yalniz bu fonksiyonun calisma suresince force_custom_plan
-- olur. Ayar cagri bitince otomatik geri yuklenir; session/global ayar degismez.
--
-- VERI / ESKI CLIENT:
-- DML, backfill, tablo/kolon/policy/index degisikligi yoktur. V2 exact imzasi
-- ve yedi kolonlu sonucu korunur. V1 wrapper degismez ve V2'ye delege etmeye
-- devam eder. 1.5.x authenticated client ayni RPC adini ve response shape'i
-- kullanir.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Drift guard: yalniz denetlenmis canli V2 + wrapper ciftini degistir.
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_v2_oid oid := to_regprocedure(
    'public.get_category_report_v2(uuid,text[],timestamp with time zone,timestamp with time zone)'
  );
  v_wrapper_oid oid := to_regprocedure(
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
  IF v_v2_oid IS NULL OR v_wrapper_oid IS NULL THEN
    RAISE EXCEPTION
      'P0-S8 perf drift: V2 veya V1 wrapper beklenen imzayla bulunamadi';
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
  WHERE proc.oid = v_v2_oid;

  IF v_owner IS DISTINCT FROM 'postgres'
     OR v_result IS DISTINCT FROM
       'TABLE(kategori_id uuid, kategori_adi text, kategori_renk text, kategori_icon text, parent_id uuid, islem_count bigint, total_amount numeric)'
     OR v_security_definer IS DISTINCT FROM true
     OR v_volatility IS DISTINCT FROM 's'
     OR v_config IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
     OR v_acl IS DISTINCT FROM
       '{postgres=X/postgres,authenticated=X/postgres}'
     OR v_definition_md5 NOT IN (
       -- Denetlenen canlı snapshot.
       '90f07fe33af89462f0dcc3a03f6790e8',
       -- Temiz PostgreSQL 17 migration replay snapshot'i.
       'ee3cb313963822927288fdbd26a8e469'
     )
  THEN
    RAISE EXCEPTION
      'P0-S8 perf drift: get_category_report_v2 canli snapshot degisti '
      '(owner=%, result=%, secdef=%, volatility=%, config=%, acl=%, md5=%)',
      v_owner,
      v_result,
      v_security_definer,
      v_volatility,
      v_config,
      v_acl,
      v_definition_md5;
  END IF;

  IF md5(pg_get_functiondef(v_wrapper_oid)) NOT IN (
       -- Denetlenen canlı wrapper snapshot'i.
       '41ac22948a7b42115976878d4cfca98f',
       -- Temiz PostgreSQL 17 migration replay wrapper snapshot'i.
       'f5e8a86be84f5464bcdae9b136c942f5'
     )
  THEN
    RAISE EXCEPTION
      'P0-S8 perf drift: V1 wrapper canli snapshot degisti (md5=%)',
      md5(pg_get_functiondef(v_wrapper_oid));
  END IF;
END;
$guard$;


-- ---------------------------------------------------------------------------
-- Exact-output V2: tip->modul eslemesini satir basi degil, istek basi yapar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_category_report_v2(
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
SET plan_cache_mode TO 'force_custom_plan'
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
  v_allowed_types text[] := ARRAY[]::text[];
  v_is_expense boolean;
BEGIN
  -- Parametre sozlesmesi degismez. Tek bir bilinmeyen/NULL tip tum cagrinin
  -- fail-closed bos donmesine yol acar.
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

  SELECT
    permission.can_view,
    permission.can_see_all_users_data
  INTO
    v_reports_can_view,
    v_can_see_all_users_data
  FROM internal.etkin_yetki(p_isletme_id, 'raporlar') AS permission
  LIMIT 1;

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

  -- PERF: canonical helper yalniz p_types (en fazla 16) uzerinde calisir.
  -- Dizi sirasi ve duplicate tipler semantigi degistirmez; ANY ayni sonucu verir.
  SELECT COALESCE(
    pg_catalog.array_agg(
      requested_type.type_name
      ORDER BY requested_type.ordinality
    ),
    ARRAY[]::text[]
  )
  INTO v_allowed_types
  FROM pg_catalog.unnest(p_types) WITH ORDINALITY
    AS requested_type(type_name, ordinality)
  WHERE internal.islem_tipi_modulu(requested_type.type_name)
        <@ v_allowed_source_modules;

  IF pg_catalog.cardinality(v_allowed_types) < 1 THEN
    RETURN;
  END IF;

  -- Urunler helper'in bakiyeye ait kaynak modulu listesine eklenmez. Urun
  -- hareketinden kategori tureten dal asagida ayrica gate edilir.
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
    WHERE transaction_row.isletme_id = p_isletme_id
      AND transaction_row.type = ANY(v_allowed_types)
      AND transaction_row.date >= p_start_date
      AND transaction_row.date <= p_end_date
      AND (
        v_can_see_all_users_data IS TRUE
        OR transaction_row.created_by = v_user_id
      )
      AND (account.id IS NULL OR account.is_active = true)
      AND (
        target_account.id IS NULL
        OR target_account.is_active = true
      )
      AND (cari.id IS NULL OR cari.is_active IS NOT FALSE)
      AND (employee.id IS NULL OR employee.is_active IS NOT FALSE)
  ),
  urun_islem_tutar AS (
    SELECT
      movement.islem_id,
      CASE
        WHEN v_is_expense THEN
          COALESCE(
            product_category.mapped_gider_kategori_id,
            product.kategori_id
          )
        ELSE
          COALESCE(
            product_category.mapped_gelir_kategori_id,
            product.kategori_id
          )
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
      pg_catalog.sum(movement_amount.hareket_tutar)
        AS toplam_hareket_tutar
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
                (
                  rate.rates->>transaction_row.txn_currency
                )::decimal
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


-- CREATE OR REPLACE mevcut ACL'yi korur; yine de callable yuzeyi explicit kilitle.
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


-- ---------------------------------------------------------------------------
-- Postcondition: exact shape/guvenlik + performans yapisi.
-- ---------------------------------------------------------------------------
DO $postcondition$
DECLARE
  v_v2_oid oid := to_regprocedure(
    'public.get_category_report_v2(uuid,text[],timestamp with time zone,timestamp with time zone)'
  );
  v_wrapper_oid oid := to_regprocedure(
    'public.get_category_report(uuid,text[],timestamp with time zone,timestamp with time zone)'
  );
  v_definition text;
  v_public_execute boolean;
BEGIN
  IF v_v2_oid IS NULL OR v_wrapper_oid IS NULL THEN
    RAISE EXCEPTION 'P0-S8 perf postcondition: V2 veya V1 wrapper bulunamadi';
  END IF;

  SELECT pg_get_functiondef(v_v2_oid)
  INTO v_definition;

  SELECT EXISTS (
    SELECT 1
    FROM aclexplode(
      COALESCE(proc.proacl, acldefault('f', proc.proowner))
    ) AS privilege
    WHERE privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  )
  INTO v_public_execute
  FROM pg_proc AS proc
  WHERE proc.oid = v_v2_oid;

  IF pg_get_userbyid(
       (SELECT proc.proowner FROM pg_proc AS proc WHERE proc.oid = v_v2_oid)
     ) IS DISTINCT FROM 'postgres'
     OR pg_get_function_result(v_v2_oid) IS DISTINCT FROM
       'TABLE(kategori_id uuid, kategori_adi text, kategori_renk text, kategori_icon text, parent_id uuid, islem_count bigint, total_amount numeric)'
     OR NOT (
       SELECT proc.prosecdef
       FROM pg_proc AS proc
       WHERE proc.oid = v_v2_oid
     )
     OR (
       SELECT proc.provolatile
       FROM pg_proc AS proc
       WHERE proc.oid = v_v2_oid
     ) IS DISTINCT FROM 's'
     OR NOT (
       (
         SELECT proc.proconfig
         FROM pg_proc AS proc
         WHERE proc.oid = v_v2_oid
       ) @> ARRAY[
         'search_path=pg_catalog',
         'plan_cache_mode=force_custom_plan'
       ]::text[]
       AND pg_catalog.cardinality(
         (
           SELECT proc.proconfig
           FROM pg_proc AS proc
           WHERE proc.oid = v_v2_oid
         )
       ) = 2
     )
     OR v_public_execute
     OR has_function_privilege(
       'anon',
       v_v2_oid,
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       v_v2_oid,
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       v_v2_oid,
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION
      'P0-S8 perf postcondition: V2 metadata/ACL sozlesmesi bozuldu';
  END IF;

  IF pg_catalog.strpos(v_definition, 'v_allowed_types') < 1
     OR pg_catalog.strpos(
       v_definition,
       'transaction_row.type = ANY(v_allowed_types)'
     ) < 1
     OR pg_catalog.strpos(
       v_definition,
       'internal.islem_tipi_modulu(transaction_row.type)'
     ) > 0
  THEN
    RAISE EXCEPTION
      'P0-S8 perf postcondition: istek-basi tip filtreleme yapisi bulunamadi';
  END IF;

  IF md5(pg_get_functiondef(v_wrapper_oid)) NOT IN (
       '41ac22948a7b42115976878d4cfca98f',
       'f5e8a86be84f5464bcdae9b136c942f5'
     )
  THEN
    RAISE EXCEPTION
      'P0-S8 perf postcondition: V1 wrapper degisti';
  END IF;
END;
$postcondition$;
