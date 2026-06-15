-- =============================================================================
-- force_z_report bayrağı — bildirim-dahil ile analitik-dışlamayı AYIRIR
--
-- Sorun: is_internal=true hem analitikten hem Z-raporu push'undan dışlıyordu;
-- ikisi aynı bayrağa bağlıydı. Geliştirici/iç hesap, analitiğe karışmadan (is_internal
-- true kalır) gece bildirimini almak isteyebilir.
--
-- Çözüm: isletmeler.force_z_report. true ise işletme is_internal olsa bile
-- get_z_report_targets'a (cron modu) DAHİL edilir; analitik filtreleri (is_internal)
-- ETKİLENMEZ.
--
-- Not: CREATE OR REPLACE imza değiştirmediği için mevcut yetkiler (yalnızca
-- service_role — 20260616000000) KORUNUR.
-- =============================================================================
ALTER TABLE public.isletmeler
  ADD COLUMN IF NOT EXISTS force_z_report boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_z_report_targets(
  p_date date,
  p_include_internal boolean DEFAULT false
)
RETURNS TABLE(
  isletme_id uuid,
  user_id uuid,
  isletme_adi text,
  gelir numeric,
  gider numeric,
  islem_sayisi bigint,
  aktif_son14 boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH rates AS (
    SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1
  ),
  converted AS (
    SELECT
      i.isletme_id,
      i.type,
      i.amount * CASE
        WHEN COALESCE(h.currency, c.currency, p.currency, 'TRY') = 'TRY' THEN 1
        ELSE COALESCE(
          (SELECT (rt.rates->>COALESCE(h.currency, c.currency, p.currency))::numeric FROM rates rt),
          1
        )
      END AS try_amount
    FROM islemler i
    LEFT JOIN hesaplar h ON i.hesap_id = h.id
    LEFT JOIN cariler c ON i.cari_id = c.id
    LEFT JOIN personel p ON i.personel_id = p.id
    WHERE i.date >= p_date::timestamp
      AND i.date <  (p_date + 1)::timestamp
      AND (h.id IS NULL OR h.is_active = true)
  ),
  gunluk AS (
    SELECT
      cv.isletme_id,
      ROUND(
        COALESCE(SUM(cv.try_amount) FILTER (WHERE cv.type IN ('gelir','cari_satis','personel_satis')), 0)
        - COALESCE(SUM(cv.try_amount) FILTER (WHERE cv.type = 'cari_satis_iade'), 0)
      , 2) AS gelir,
      ROUND(
        COALESCE(SUM(cv.try_amount) FILTER (WHERE cv.type IN ('gider','cari_alis','personel_gider')), 0)
        - COALESCE(SUM(cv.try_amount) FILTER (WHERE cv.type = 'cari_alis_iade'), 0)
      , 2) AS gider,
      COUNT(*) AS islem_sayisi
    FROM converted cv
    GROUP BY cv.isletme_id
  ),
  son14 AS (
    SELECT DISTINCT s.isletme_id
    FROM islemler s
    WHERE s.date >= (p_date - 14)::timestamp
      AND s.date <  (p_date + 1)::timestamp
  )
  SELECT
    iz.id AS isletme_id,
    iz.user_id,
    iz.name AS isletme_adi,
    COALESCE(g.gelir, 0) AS gelir,
    COALESCE(g.gider, 0) AS gider,
    COALESCE(g.islem_sayisi, 0) AS islem_sayisi,
    (s.isletme_id IS NOT NULL) AS aktif_son14
  FROM isletmeler iz
  LEFT JOIN gunluk g ON g.isletme_id = iz.id
  LEFT JOIN son14 s ON s.isletme_id = iz.id
  WHERE (iz.is_internal = false OR p_include_internal OR iz.force_z_report = true)
    AND iz.scheduled_deletion_at IS NULL;
$function$;
