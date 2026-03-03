-- =============================================================================
-- API Rate Limiting: Kullanici bazli gunluk API cagrisi limiti
-- =============================================================================
-- parse-invoice gibi maliyetli Edge Function'lara kullanici basina
-- gunluk limit koyarak API key kotuye kullanimini onler.
-- Fotograftaki Gemini API key calinma senaryosuna karsi koruma saglar.
-- =============================================================================

CREATE TABLE IF NOT EXISTS api_usage (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name TEXT        NOT NULL,
  called_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_usage_user_func_date ON api_usage(user_id, function_name, called_at);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Kimse client'tan bu tabloya dogrudan erisemez (sadece SECURITY DEFINER fonksiyonlar)
-- RLS policy yok = varsayilan olarak hicbir kullanici erisemez

-- Rate limit kontrolu: kullanici son 24 saatte kac kez cagirmis?
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_function_name TEXT,
  p_daily_limit INT DEFAULT 20
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM api_usage
  WHERE user_id = p_user_id
    AND function_name = p_function_name
    AND called_at > NOW() - INTERVAL '24 hours';

  RETURN v_count < p_daily_limit;
END;
$$;

-- Kullanim kaydi ekle
CREATE OR REPLACE FUNCTION record_api_usage(
  p_user_id UUID,
  p_function_name TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO api_usage (user_id, function_name)
  VALUES (p_user_id, p_function_name);
END;
$$;

-- Kalan kullanim hakkini dondur (client-side bilgilendirme icin)
CREATE OR REPLACE FUNCTION get_remaining_usage(
  p_user_id UUID,
  p_function_name TEXT,
  p_daily_limit INT DEFAULT 20
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM api_usage
  WHERE user_id = p_user_id
    AND function_name = p_function_name
    AND called_at > NOW() - INTERVAL '24 hours';

  RETURN GREATEST(0, p_daily_limit - v_count);
END;
$$;

-- =============================================================================
-- Temizlik: 30 gunden eski kayitlari sil (Supabase pg_cron ile)
-- Dashboard > SQL Editor'da calistir:
-- SELECT cron.schedule('cleanup-api-usage', '0 3 * * *',
--   $$DELETE FROM api_usage WHERE called_at < NOW() - INTERVAL '30 days'$$
-- );
-- =============================================================================
