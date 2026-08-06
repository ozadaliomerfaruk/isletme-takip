-- Gelir/gider tarihsel mercekleri icin global gunluk TCMB referanslari.
--
-- Geriye uyumluluk:
--   * mevcut ekonomik_gostergeler (aylik) tablosu ve get_category_report_v2
--     aynen kalir;
--   * eski istemciler yeni tablo/RPC'yi bilmedikleri icin davranislari degismez;
--   * tablo kullanici verisi degil, tum tenant'larin okudugu global referanstir.

CREATE TABLE public.ekonomik_gostergeler_gunluk (
  gun date PRIMARY KEY,
  usd_try numeric(18, 8),
  eur_try numeric(18, 8),
  gbp_try numeric(18, 8),
  gram_altin_try numeric(18, 8),
  doviz_yayim_zamani timestamp with time zone,
  altin_yayim_zamani timestamp with time zone,
  source text NOT NULL DEFAULT 'tcmb',
  updated_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT ekonomik_gostergeler_gunluk_usd_positive
    CHECK (usd_try IS NULL OR usd_try > 0),
  CONSTRAINT ekonomik_gostergeler_gunluk_eur_positive
    CHECK (eur_try IS NULL OR eur_try > 0),
  CONSTRAINT ekonomik_gostergeler_gunluk_gbp_positive
    CHECK (gbp_try IS NULL OR gbp_try > 0),
  CONSTRAINT ekonomik_gostergeler_gunluk_gold_positive
    CHECK (gram_altin_try IS NULL OR gram_altin_try > 0),
  CONSTRAINT ekonomik_gostergeler_gunluk_has_value
    CHECK (
      usd_try IS NOT NULL
      OR eur_try IS NOT NULL
      OR gbp_try IS NOT NULL
      OR gram_altin_try IS NOT NULL
    )
);

COMMENT ON TABLE public.ekonomik_gostergeler_gunluk IS
  'TCMB is gunu referanslari: doviz gosterge satis kuru ve TCMB 11:00 XAU gram/TL.';
COMMENT ON COLUMN public.ekonomik_gostergeler_gunluk.gun IS
  'Kaynak gozlemin ait oldugu is gunu; hafta sonu/tatiller tabloya yapay satir eklemez.';
COMMENT ON COLUMN public.ekonomik_gostergeler_gunluk.gram_altin_try IS
  'TCMB saatlik arsivindeki 11:00 XAU alis degeri (1 gram altinin TL karsiligi).';

ALTER TABLE public.ekonomik_gostergeler_gunluk ENABLE ROW LEVEL SECURITY;

CREATE POLICY ekonomik_gostergeler_gunluk_authenticated_read
  ON public.ekonomik_gostergeler_gunluk
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.ekonomik_gostergeler_gunluk
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ekonomik_gostergeler_gunluk TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ekonomik_gostergeler_gunluk
  TO service_role;

CREATE FUNCTION public.get_category_report_lens_v1(
  p_isletme_id uuid,
  p_types text[],
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone,
  p_lens text
)
RETURNS jsonb
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
  v_empty jsonb := pg_catalog.jsonb_build_object(
    'rows', '[]'::jsonb,
    'lens', p_lens,
    'conversion_incomplete', false,
    'missing_rate_count', 0,
    'rate_coverage_start', NULL,
    'rate_coverage_end', NULL
  );
  v_payload jsonb;
BEGIN
  -- Nominal gorunum mevcut get_category_report_v2'de kalir. Bu RPC yalnizca
  -- tarihsel referans gerektiren mercekleri kabul eder.
  IF p_isletme_id IS NULL
     OR p_types IS NULL
     OR pg_catalog.cardinality(p_types) < 1
     OR pg_catalog.cardinality(p_types) > 16
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
     OR p_lens IS NULL
     OR NOT (p_lens = ANY (ARRAY['reel', 'usd', 'eur', 'altin']::text[]))
  THEN
    RETURN v_empty;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(p_types) AS requested_type(type_name)
    WHERE requested_type.type_name IS NULL
       OR internal.islem_tipi_modulu(requested_type.type_name) IS NULL
  ) THEN
    RETURN v_empty;
  END IF;

  SELECT permission.can_view, permission.can_see_all_users_data
  INTO v_reports_can_view, v_can_see_all_users_data
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission
  LIMIT 1;

  IF v_user_id IS NULL OR v_reports_can_view IS NOT TRUE THEN
    RETURN v_empty;
  END IF;

  -- get_category_report_v2 ile ayni reports-only kaynak sozlesmesi.
  SELECT permission.can_view INTO v_has_hesaplar
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission LIMIT 1;
  SELECT permission.can_view INTO v_has_cariler
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission LIMIT 1;
  SELECT permission.can_view INTO v_has_urunler
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission LIMIT 1;
  SELECT permission.can_view INTO v_has_personel
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission LIMIT 1;

  IF v_has_hesaplar IS TRUE THEN
    v_allowed_source_modules := pg_catalog.array_append(
      v_allowed_source_modules, 'hesaplar'::text
    );
  END IF;
  IF v_has_cariler IS TRUE THEN
    v_allowed_source_modules := pg_catalog.array_append(
      v_allowed_source_modules, 'cariler'::text
    );
  END IF;
  IF v_has_personel IS TRUE THEN
    v_allowed_source_modules := pg_catalog.array_append(
      v_allowed_source_modules, 'personel'::text
    );
  END IF;

  SELECT COALESCE(
    pg_catalog.array_agg(requested_type.type_name ORDER BY requested_type.ordinality),
    ARRAY[]::text[]
  )
  INTO v_allowed_types
  FROM pg_catalog.unnest(p_types) WITH ORDINALITY
    AS requested_type(type_name, ordinality)
  WHERE internal.islem_tipi_modulu(requested_type.type_name)
        <@ v_allowed_source_modules;

  IF pg_catalog.cardinality(v_allowed_types) < 1 THEN
    RETURN v_empty;
  END IF;

  v_is_expense := p_types && ARRAY[
    'gider', 'cari_alis', 'personel_gider', 'cari_alis_iade'
  ]::text[];

  WITH eligible_islemler AS MATERIALIZED (
    SELECT
      transaction_row.id,
      transaction_row.kategori_id,
      transaction_row.amount,
      transaction_row.date::date AS islem_gunu,
      pg_catalog.upper(COALESCE(
        account.currency,
        cari.currency,
        employee.currency,
        'TRY'
      )) AS txn_currency
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
      AND (target_account.id IS NULL OR target_account.is_active = true)
      AND (cari.id IS NULL OR cari.is_active IS TRUE)
      AND (employee.id IS NULL OR employee.is_active IS TRUE)
  ),
  rate_keys AS MATERIALIZED (
    SELECT DISTINCT islem_gunu, txn_currency
    FROM eligible_islemler
  ),
  latest_cpi AS (
    SELECT monthly.ay, monthly.tufe
    FROM public.ekonomik_gostergeler AS monthly
    WHERE monthly.tufe IS NOT NULL
      AND monthly.tufe > 0
      AND monthly.ay >= (
        pg_catalog.date_trunc('month', CURRENT_DATE::timestamp)
        - '2 months'::interval
      )::date
    ORDER BY monthly.ay DESC
    LIMIT 1
  ),
  rate_lookup AS MATERIALIZED (
    SELECT
      rate_key.islem_gunu,
      rate_key.txn_currency,
      CASE
        WHEN rate_key.txn_currency = 'TRY' THEN 1::numeric
        ELSE source_observation.source_rate
      END AS source_rate,
      CASE
        WHEN p_lens = 'reel' THEN NULL::numeric
        ELSE lens_observation.lens_rate
      END AS lens_rate,
      transaction_cpi.tufe AS transaction_cpi,
      current_cpi.tufe AS current_cpi,
      CASE
        WHEN p_lens = 'reel' THEN transaction_cpi.ay
        ELSE lens_observation.gun
      END AS reference_date,
      (
        (rate_key.txn_currency = 'TRY' OR source_observation.source_rate > 0)
        AND (
          (
            p_lens = 'reel'
            AND transaction_cpi.tufe > 0
            AND current_cpi.tufe > 0
          )
          OR (
            p_lens <> 'reel'
            AND lens_observation.lens_rate > 0
          )
        )
      ) AS rate_complete
    FROM rate_keys AS rate_key
    LEFT JOIN LATERAL (
      SELECT
        daily.gun,
        CASE rate_key.txn_currency
          WHEN 'USD' THEN daily.usd_try
          WHEN 'EUR' THEN daily.eur_try
          WHEN 'GBP' THEN daily.gbp_try
          WHEN 'XAU' THEN daily.gram_altin_try
          ELSE NULL::numeric
        END AS source_rate
      FROM public.ekonomik_gostergeler_gunluk AS daily
      WHERE daily.gun <= rate_key.islem_gunu
        -- Yalniz hafta sonu/resmi tatil boslugunu tasir; haftalarca bayat
        -- kalan bir seriyi guncelmis gibi kullanmaz.
        AND daily.gun >= rate_key.islem_gunu - 7
        AND CASE rate_key.txn_currency
          WHEN 'USD' THEN daily.usd_try
          WHEN 'EUR' THEN daily.eur_try
          WHEN 'GBP' THEN daily.gbp_try
          WHEN 'XAU' THEN daily.gram_altin_try
          ELSE NULL::numeric
        END > 0
      ORDER BY daily.gun DESC
      LIMIT 1
    ) AS source_observation
      ON rate_key.txn_currency <> 'TRY'
    LEFT JOIN LATERAL (
      SELECT
        daily.gun,
        CASE p_lens
          WHEN 'usd' THEN daily.usd_try
          WHEN 'eur' THEN daily.eur_try
          WHEN 'altin' THEN daily.gram_altin_try
          ELSE NULL::numeric
        END AS lens_rate
      FROM public.ekonomik_gostergeler_gunluk AS daily
      WHERE daily.gun <= rate_key.islem_gunu
        AND daily.gun >= rate_key.islem_gunu - 7
        AND CASE p_lens
          WHEN 'usd' THEN daily.usd_try
          WHEN 'eur' THEN daily.eur_try
          WHEN 'altin' THEN daily.gram_altin_try
          ELSE NULL::numeric
        END > 0
      ORDER BY daily.gun DESC
      LIMIT 1
    ) AS lens_observation
      ON p_lens <> 'reel'
    LEFT JOIN LATERAL (
      SELECT monthly.ay, monthly.tufe
      FROM public.ekonomik_gostergeler AS monthly
      WHERE monthly.ay <= pg_catalog.date_trunc(
              'month', rate_key.islem_gunu::timestamp
            )::date
        AND monthly.ay >= (
          pg_catalog.date_trunc('month', rate_key.islem_gunu::timestamp)
          - '2 months'::interval
        )::date
        AND monthly.tufe IS NOT NULL
        AND monthly.tufe > 0
      ORDER BY monthly.ay DESC
      LIMIT 1
    ) AS transaction_cpi
      ON p_lens = 'reel'
    LEFT JOIN latest_cpi AS current_cpi
      ON p_lens = 'reel'
  ),
  rated_islemler AS MATERIALIZED (
    SELECT
      eligible.*,
      rate.rate_complete,
      rate.reference_date,
      CASE
        WHEN rate.rate_complete IS NOT TRUE THEN NULL::numeric
        WHEN p_lens = 'reel' THEN
          rate.source_rate * rate.current_cpi / rate.transaction_cpi
        ELSE rate.source_rate / rate.lens_rate
      END AS conversion_factor
    FROM eligible_islemler AS eligible
    INNER JOIN rate_lookup AS rate
      ON rate.islem_gunu = eligible.islem_gunu
     AND rate.txn_currency = eligible.txn_currency
  ),
  urun_islem_tutar AS (
    SELECT
      movement.islem_id,
      CASE
        WHEN v_is_expense THEN COALESCE(
          product_category.mapped_gider_kategori_id,
          product.kategori_id
        )
        ELSE COALESCE(
          product_category.mapped_gelir_kategori_id,
          product.kategori_id
        )
      END AS resolved_kategori_id,
      pg_catalog.abs(movement.miktar)
        * COALESCE(movement.birim_fiyat, 0)
        * (1 + COALESCE(movement.kdv_orani, 0) / 100.0) AS hareket_tutar,
      eligible.amount AS islem_amount,
      eligible.conversion_factor
    FROM rated_islemler AS eligible
    INNER JOIN public.urun_hareketler AS movement
      ON movement.islem_id = eligible.id
     AND movement.isletme_id = p_isletme_id
    INNER JOIN public.urunler AS product
      ON product.id = movement.urun_id
     AND product.isletme_id = p_isletme_id
    LEFT JOIN public.kategoriler AS product_category
      ON product_category.id = product.kategori_id
     AND product_category.isletme_id = p_isletme_id
    WHERE v_has_urunler IS TRUE
      AND product.is_active IS TRUE
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
      CASE
        WHEN transaction_total.toplam_hareket_tutar > 0 THEN
          (
            movement_amount.hareket_tutar
            / transaction_total.toplam_hareket_tutar
          ) * movement_amount.islem_amount
        ELSE movement_amount.islem_amount
      END * movement_amount.conversion_factor AS converted_amount
    FROM urun_islem_tutar AS movement_amount
    INNER JOIN islem_toplam AS transaction_total
      ON transaction_total.islem_id = movement_amount.islem_id
  ),
  raw_rows AS (
    SELECT
      distributed.resolved_kategori_id AS kategori_id,
      category.name::text AS kategori_adi,
      category.color::text AS kategori_renk,
      category.icon::text AS kategori_icon,
      category.parent_id,
      pg_catalog.count(DISTINCT distributed.islem_id) AS islem_count,
      COALESCE(pg_catalog.sum(distributed.converted_amount), 0) AS total_amount
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
      COALESCE(
        pg_catalog.sum(
          transaction_row.amount * transaction_row.conversion_factor
        ),
        0
      ) AS total_amount
    FROM rated_islemler AS transaction_row
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
      category.parent_id
  ),
  meta AS (
    SELECT
      pg_catalog.count(DISTINCT rated.id)
        FILTER (WHERE rated.rate_complete IS NOT TRUE) AS missing_rate_count,
      pg_catalog.min(rated.reference_date)
        FILTER (WHERE rated.rate_complete IS TRUE) AS rate_coverage_start,
      pg_catalog.max(rated.reference_date)
        FILTER (WHERE rated.rate_complete IS TRUE) AS rate_coverage_end
    FROM rated_islemler AS rated
  )
  SELECT pg_catalog.jsonb_build_object(
    'rows', COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(report_row)
          ORDER BY report_row.kategori_adi NULLS LAST,
                   report_row.kategori_id NULLS LAST
        )
        FROM raw_rows AS report_row
      ),
      '[]'::jsonb
    ),
    'lens', p_lens,
    'conversion_incomplete', meta.missing_rate_count > 0,
    'missing_rate_count', meta.missing_rate_count,
    'rate_coverage_start', meta.rate_coverage_start,
    'rate_coverage_end', meta.rate_coverage_end
  )
  INTO v_payload
  FROM meta;

  RETURN COALESCE(v_payload, v_empty);
END;
$function$;

ALTER FUNCTION public.get_category_report_lens_v1(
  uuid, text[], timestamp with time zone, timestamp with time zone, text
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_category_report_lens_v1(
  uuid, text[], timestamp with time zone, timestamp with time zone, text
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_category_report_lens_v1(
  uuid, text[], timestamp with time zone, timestamp with time zone, text
)
TO authenticated;

-- Mevcut pg_net komutunu ve kimlik bilgisini degistirmeden yalniz calisma
-- saatini TCMB gosterge kuru yayimindan sonraya (TR 16:30) al.
DO $migration$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid
  INTO v_job_id
  FROM cron.job
  WHERE jobname = 'sync-ekonomik-gostergeler-evds'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(v_job_id, schedule := '30 13 * * *');
  ELSE
    RAISE NOTICE 'sync-ekonomik-gostergeler-evds cron job not found; deploy runbook must create it';
  END IF;
END;
$migration$;
