-- =============================================================================
-- Faz 2: app_events — uygulama içi olay izleme (app_sessions deseni)
-- Yeni tablo; mevcut veriye/akışa dokunmaz. Olaylar PII-SİZ meta taşır.
-- =============================================================================
CREATE TABLE IF NOT EXISTS app_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  isletme_id  UUID        REFERENCES isletmeler(id) ON DELETE SET NULL,
  event_name  TEXT        NOT NULL CHECK (length(event_name) > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  platform    TEXT        CHECK (platform IN ('ios', 'android', 'web')),
  app_version TEXT,
  meta        JSONB
);

CREATE INDEX IF NOT EXISTS idx_app_events_user ON app_events(user_id);
CREATE INDEX IF NOT EXISTS idx_app_events_event ON app_events(event_name);
CREATE INDEX IF NOT EXISTS idx_app_events_created ON app_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_user_event ON app_events(user_id, event_name);

ALTER TABLE app_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own events' AND tablename = 'app_events') THEN
    CREATE POLICY "Users can insert own events"
    ON app_events FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- =============================================================================
-- Analitik view'ler (security_invoker; internal hesap hariç). App yayınlanınca dolar.
-- =============================================================================

-- olay_ozeti — hangi olay ne sıklıkta
CREATE OR REPLACE VIEW olay_ozeti WITH (security_invoker = on) AS
SELECT
  event_name AS olay,
  COUNT(*) AS toplam,
  COUNT(DISTINCT user_id) AS kullanici,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS son_30g,
  MAX(created_at)::date AS son_olay
FROM app_events
WHERE user_id NOT IN (SELECT user_id FROM isletmeler WHERE is_internal)
GROUP BY event_name
ORDER BY toplam DESC;

-- onboarding_olay_hunisi — aktivasyon nerede tıkanıyor (olay bazlı)
CREATE OR REPLACE VIEW onboarding_olay_hunisi WITH (security_invoker = on) AS
WITH u AS (
  SELECT user_id,
    bool_or(event_name = 'business_created')    AS b,
    bool_or(event_name = 'account_created')     AS a,
    bool_or(event_name = 'transaction_created') AS t,
    bool_or(event_name = 'report_viewed')       AS r
  FROM app_events
  WHERE user_id NOT IN (SELECT user_id FROM isletmeler WHERE is_internal)
  GROUP BY user_id
)
SELECT
  COUNT(*) AS toplam_kullanici,
  COUNT(*) FILTER (WHERE b) AS isletme_olusturan,
  COUNT(*) FILTER (WHERE a) AS hesap_ekleyen,
  COUNT(*) FILTER (WHERE t) AS islem_giren,
  COUNT(*) FILTER (WHERE r) AS rapor_goren,
  ROUND(100.0 * COUNT(*) FILTER (WHERE a) / NULLIF(COUNT(*) FILTER (WHERE b), 0), 1) AS hesap_orani,
  ROUND(100.0 * COUNT(*) FILTER (WHERE t) / NULLIF(COUNT(*) FILTER (WHERE b), 0), 1) AS islem_orani,
  ROUND(100.0 * COUNT(*) FILTER (WHERE r) / NULLIF(COUNT(*) FILTER (WHERE b), 0), 1) AS rapor_orani
FROM u;

-- ekran_gorunumleri — hangi ekran trafik alıyor
CREATE OR REPLACE VIEW ekran_gorunumleri WITH (security_invoker = on) AS
SELECT
  meta->>'screen' AS ekran,
  COUNT(*) AS goruntulenme,
  COUNT(DISTINCT user_id) AS kullanici,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS son_30g
FROM app_events
WHERE event_name = 'screen_view'
  AND user_id NOT IN (SELECT user_id FROM isletmeler WHERE is_internal)
GROUP BY meta->>'screen'
ORDER BY goruntulenme DESC;

-- surum_benimseme — sürüm dağılımı
CREATE OR REPLACE VIEW surum_benimseme WITH (security_invoker = on) AS
SELECT
  app_version AS surum,
  COUNT(DISTINCT user_id) AS kullanici,
  COUNT(DISTINCT user_id) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS aktif_30g,
  COUNT(*) AS olay
FROM app_events
WHERE user_id NOT IN (SELECT user_id FROM isletmeler WHERE is_internal)
GROUP BY app_version
ORDER BY kullanici DESC;
