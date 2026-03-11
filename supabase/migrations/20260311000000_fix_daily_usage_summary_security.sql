-- Fix: daily_usage_summary view should use SECURITY INVOKER (default)
-- instead of SECURITY DEFINER to respect RLS policies.
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

CREATE OR REPLACE VIEW daily_usage_summary
WITH (security_invoker = on) AS
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
