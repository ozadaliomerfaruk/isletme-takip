-- =============================================================================
-- App Session Tracking: DAU, session count, new vs returning users
-- =============================================================================
-- Her uygulama acilisinda 1 satir eklenir.
-- Supabase Dashboard > Table Editor'da "daily_usage_summary" view'i ile
-- gunluk kullanici sayisi, yeni/geri donen ayrimi ve toplam giris gorunur.
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_sessions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opened_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  platform   TEXT        NOT NULL CHECK (platform IN ('ios', 'android', 'web'))
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_app_sessions_opened ON app_sessions(opened_at);

ALTER TABLE app_sessions ENABLE ROW LEVEL SECURITY;

-- Kullanici sadece kendi session kaydini ekleyebilir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own session' AND tablename = 'app_sessions'
  ) THEN
    CREATE POLICY "Users can insert own session"
    ON app_sessions FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- =============================================================================
-- Dashboard View: daily_usage_summary
-- =============================================================================
-- Supabase Dashboard > Table Editor'da tablo gibi gorunur:
-- gun | toplam_kullanici | yeni_kullanici | geri_donen | toplam_giris
-- =============================================================================

CREATE OR REPLACE VIEW daily_usage_summary AS
WITH first_seen AS (
  SELECT user_id, MIN(opened_at::date) AS ilk_giris
  FROM app_sessions
  GROUP BY user_id
)
SELECT
  s.opened_at::date AS gun,
  COUNT(DISTINCT s.user_id) AS toplam_kullanici,
  COUNT(DISTINCT CASE WHEN f.ilk_giris = s.opened_at::date THEN s.user_id END) AS yeni_kullanici,
  COUNT(DISTINCT CASE WHEN f.ilk_giris < s.opened_at::date THEN s.user_id END) AS geri_donen,
  COUNT(*) AS toplam_giris
FROM app_sessions s
JOIN first_seen f ON f.user_id = s.user_id
GROUP BY s.opened_at::date
ORDER BY s.opened_at::date DESC;
