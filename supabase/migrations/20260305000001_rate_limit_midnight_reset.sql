-- =============================================================================
-- Rate Limit: Gece yarisi (00:00 UTC+3) sifirlama
-- =============================================================================
-- Onceki: kayan 24 saat penceresi (NOW() - INTERVAL '24 hours')
-- Yeni: bugunun baslangicina gore sayar (gece yarisi sifirlanir)
-- =============================================================================

-- Turkiye saatine gore bugunun baslangicini donduren yardimci
-- UTC+3 = 'Europe/Istanbul'
CREATE OR REPLACE FUNCTION _today_start_tr() RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE AS $$
  SELECT (NOW() AT TIME ZONE 'Europe/Istanbul')::date::timestamptz;
$$;

-- Rate limit kontrolu: kullanici BUGUN kac kez cagirmis?
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
    AND called_at >= _today_start_tr();

  RETURN v_count < p_daily_limit;
END;
$$;

-- Kalan kullanim hakkini dondur
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
    AND called_at >= _today_start_tr();

  RETURN GREATEST(0, p_daily_limit - v_count);
END;
$$;
