-- Gelir raporundaki "hesaba gore" kirilimini tarihsel USD/EUR/altin ve
-- reel TL merceklerinde hesaplar. Nominal get_income_by_source_v2 imzasi ve
-- sonucu degistirilmez.
--
-- 1.5.x / ESKI CLIENT:
--   * Eski istemci get_income_by_source_v2 cagirmaya devam eder ve ayni sekiz
--     kolonu ayni sirada alir.
--   * Yeni fonksiyon yalniz yeni istemci tarafindan cagrilir.
--   * Bu migration tablo veya kullanici satirlarina yazmaz; DML/backfill yapmaz.
--   * Arsivli ama aktif kaynaklar raporda kalir, pasif kaynaklar dislanir.

CREATE FUNCTION public.get_income_by_source_lens_v1(
  p_isletme_id uuid,
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
  v_reference_today date := (
    CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul'
  )::date;
  v_reports boolean := false;
  v_hesaplar boolean := false;
  v_cariler boolean := false;
  v_personel boolean := false;
  v_birikim boolean := false;
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
  IF p_isletme_id IS NULL
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
     OR p_lens IS NULL
     OR NOT (p_lens = ANY (ARRAY['reel', 'usd', 'eur', 'altin']::text[]))
     OR NOT internal.aktif_uye_v1(p_isletme_id)
  THEN
    RETURN v_empty;
  END IF;

  SELECT permission.can_view INTO v_reports
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission;
  SELECT permission.can_view INTO v_hesaplar
  FROM internal.etkin_yetki_v2(p_isletme_id, 'hesaplar') AS permission;
  SELECT permission.can_view INTO v_cariler
  FROM internal.etkin_yetki_v2(p_isletme_id, 'cariler') AS permission;
  SELECT permission.can_view INTO v_personel
  FROM internal.etkin_yetki_v2(p_isletme_id, 'personel') AS permission;
  SELECT permission.can_view INTO v_birikim
  FROM internal.etkin_yetki_v2(p_isletme_id, 'birikim') AS permission;

  -- Canlidaki nominal V2 ile ayni kaynak kapilari.
  v_hesaplar := v_reports OR v_hesaplar;
  v_cariler := v_reports OR v_cariler;
  v_personel := v_reports OR v_personel;
  v_birikim := v_reports OR v_birikim;

  IF v_hesaplar IS NOT TRUE
     AND v_cariler IS NOT TRUE
     AND v_personel IS NOT TRUE
  THEN
    RETURN v_empty;
  END IF;

  WITH eligible_income AS MATERIALIZED (
    SELECT
      transaction_row.id,
      'hesap'::text AS source_kind,
      account.type::text AS source_type,
      account.id AS source_id,
      account.name::text AS source_name,
      pg_catalog.upper(COALESCE(account.currency, 'TRY')) AS source_currency,
      transaction_row.amount AS native_amount,
      1::numeric AS direction_sign,
      LEAST(transaction_row.date::date, v_reference_today) AS reference_day
    FROM public.islemler AS transaction_row
    INNER JOIN public.hesaplar AS account
      ON account.id = transaction_row.hesap_id
     AND account.isletme_id = transaction_row.isletme_id
    WHERE v_hesaplar IS TRUE
      AND transaction_row.isletme_id = p_isletme_id
      AND transaction_row.type::text = 'gelir'
      AND transaction_row.date::timestamp with time zone >= p_start_date
      AND transaction_row.date::timestamp with time zone <= p_end_date
      AND account.is_active IS TRUE
      AND (account.type::text <> 'birikim' OR v_birikim IS TRUE)

    UNION ALL

    SELECT
      transaction_row.id,
      'cari'::text AS source_kind,
      'cari'::text AS source_type,
      customer.id AS source_id,
      customer.name::text AS source_name,
      pg_catalog.upper(COALESCE(customer.currency, 'TRY')) AS source_currency,
      transaction_row.amount AS native_amount,
      CASE
        WHEN transaction_row.type::text = 'cari_satis_iade' THEN -1::numeric
        ELSE 1::numeric
      END AS direction_sign,
      LEAST(transaction_row.date::date, v_reference_today) AS reference_day
    FROM public.islemler AS transaction_row
    INNER JOIN public.cariler AS customer
      ON customer.id = transaction_row.cari_id
     AND customer.isletme_id = transaction_row.isletme_id
    WHERE v_cariler IS TRUE
      AND transaction_row.isletme_id = p_isletme_id
      AND transaction_row.type::text IN ('cari_satis', 'cari_satis_iade')
      AND transaction_row.date::timestamp with time zone >= p_start_date
      AND transaction_row.date::timestamp with time zone <= p_end_date
      AND customer.is_active IS TRUE

    UNION ALL

    SELECT
      transaction_row.id,
      'personel'::text AS source_kind,
      'personel'::text AS source_type,
      employee.id AS source_id,
      pg_catalog.btrim(
        COALESCE(employee.first_name, '')
        || ' '
        || COALESCE(employee.last_name, '')
      )::text AS source_name,
      pg_catalog.upper(COALESCE(employee.currency, 'TRY')) AS source_currency,
      transaction_row.amount AS native_amount,
      1::numeric AS direction_sign,
      LEAST(transaction_row.date::date, v_reference_today) AS reference_day
    FROM public.islemler AS transaction_row
    INNER JOIN public.personel AS employee
      ON employee.id = transaction_row.personel_id
     AND employee.isletme_id = transaction_row.isletme_id
    WHERE v_personel IS TRUE
      AND transaction_row.isletme_id = p_isletme_id
      AND transaction_row.type::text = 'personel_satis'
      AND transaction_row.date::timestamp with time zone >= p_start_date
      AND transaction_row.date::timestamp with time zone <= p_end_date
      AND employee.is_active IS TRUE
  ),
  rate_keys AS MATERIALIZED (
    SELECT DISTINCT income.reference_day, income.source_currency
    FROM eligible_income AS income
  ),
  latest_cpi AS (
    SELECT monthly.ay, monthly.tufe
    FROM public.ekonomik_gostergeler AS monthly
    WHERE monthly.tufe IS NOT NULL
      AND monthly.tufe > 0
      AND monthly.ay >= (
        pg_catalog.date_trunc('month', v_reference_today::timestamp)
        - '2 months'::interval
      )::date
    ORDER BY monthly.ay DESC
    LIMIT 1
  ),
  rate_lookup AS MATERIALIZED (
    SELECT
      rate_key.reference_day,
      rate_key.source_currency,
      CASE
        WHEN rate_key.source_currency = 'TRY' THEN 1::numeric
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
        (rate_key.source_currency = 'TRY' OR source_observation.source_rate > 0)
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
        CASE rate_key.source_currency
          WHEN 'USD' THEN daily.usd_try
          WHEN 'EUR' THEN daily.eur_try
          WHEN 'GBP' THEN daily.gbp_try
          WHEN 'XAU' THEN daily.gram_altin_try
          WHEN 'XAG' THEN daily.gram_gumus_try
          ELSE NULL::numeric
        END AS source_rate
      FROM public.ekonomik_gostergeler_gunluk AS daily
      WHERE daily.gun <= rate_key.reference_day
        AND daily.gun >= rate_key.reference_day - 7
        AND CASE rate_key.source_currency
          WHEN 'USD' THEN daily.usd_try
          WHEN 'EUR' THEN daily.eur_try
          WHEN 'GBP' THEN daily.gbp_try
          WHEN 'XAU' THEN daily.gram_altin_try
          WHEN 'XAG' THEN daily.gram_gumus_try
          ELSE NULL::numeric
        END > 0
      ORDER BY daily.gun DESC
      LIMIT 1
    ) AS source_observation
      ON rate_key.source_currency <> 'TRY'
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
      WHERE daily.gun <= rate_key.reference_day
        AND daily.gun >= rate_key.reference_day - 7
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
              'month', rate_key.reference_day::timestamp
            )::date
        AND monthly.ay >= (
          pg_catalog.date_trunc('month', rate_key.reference_day::timestamp)
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
  rated_income AS MATERIALIZED (
    SELECT
      income.*,
      rate.rate_complete,
      rate.reference_date,
      CASE
        WHEN rate.rate_complete IS NOT TRUE THEN NULL::numeric
        WHEN p_lens = 'reel' THEN
          rate.source_rate * rate.current_cpi / rate.transaction_cpi
        ELSE rate.source_rate / rate.lens_rate
      END AS conversion_factor
    FROM eligible_income AS income
    INNER JOIN rate_lookup AS rate
      ON rate.reference_day = income.reference_day
     AND rate.source_currency = income.source_currency
  ),
  report_rows AS (
    SELECT
      income.source_kind,
      income.source_type,
      income.source_id,
      income.source_name,
      income.source_currency,
      pg_catalog.count(income.id)::bigint AS islem_count,
      COALESCE(
        pg_catalog.sum(
          income.native_amount
          * income.direction_sign
          * income.conversion_factor
        ) FILTER (WHERE income.rate_complete IS TRUE),
        0
      )::numeric AS total_amount,
      COALESCE(
        pg_catalog.sum(income.native_amount * income.direction_sign),
        0
      )::numeric AS total_native
    FROM rated_income AS income
    GROUP BY
      income.source_kind,
      income.source_type,
      income.source_id,
      income.source_name,
      income.source_currency
  ),
  meta AS (
    SELECT
      pg_catalog.count(DISTINCT income.id)
        FILTER (WHERE income.rate_complete IS NOT TRUE) AS missing_rate_count,
      pg_catalog.min(income.reference_date)
        FILTER (WHERE income.rate_complete IS TRUE) AS rate_coverage_start,
      pg_catalog.max(income.reference_date)
        FILTER (WHERE income.rate_complete IS TRUE) AS rate_coverage_end
    FROM rated_income AS income
  )
  SELECT pg_catalog.jsonb_build_object(
    'rows', COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(report_row)
          ORDER BY report_row.source_kind,
                   report_row.source_type,
                   report_row.source_name,
                   report_row.source_id
        )
        FROM report_rows AS report_row
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

ALTER FUNCTION public.get_income_by_source_lens_v1(
  uuid, timestamp with time zone, timestamp with time zone, text
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_income_by_source_lens_v1(
  uuid, timestamp with time zone, timestamp with time zone, text
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_income_by_source_lens_v1(
  uuid, timestamp with time zone, timestamp with time zone, text
)
TO authenticated;

COMMENT ON FUNCTION public.get_income_by_source_lens_v1(
  uuid, timestamp with time zone, timestamp with time zone, text
) IS
  'Gelir kaynaklarini islem gunu doviz/altin referansi veya guncel reel TL ile toplar.';
