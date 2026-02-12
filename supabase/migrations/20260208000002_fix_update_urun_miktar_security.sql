-- =============================================================================
-- FIX: update_urun_miktar - Missing isletme_id check + search_path
-- =============================================================================
-- BUG H8: update_urun_miktar doesn't verify ownership (isletme_id).
-- Any authenticated user could update stock for any product.
-- Also missing SET search_path for SECURITY DEFINER safety.
--
-- FIX: Add p_isletme_id parameter and ownership check.
-- =============================================================================

-- Drop the old 2-param overload first to avoid ambiguity
DROP FUNCTION IF EXISTS update_urun_miktar(UUID, NUMERIC);

CREATE OR REPLACE FUNCTION update_urun_miktar(
  p_urun_id UUID,
  p_miktar_degisim NUMERIC,
  p_isletme_id UUID DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_yeni_miktar NUMERIC;
BEGIN
  IF p_isletme_id IS NOT NULL THEN
    -- Ownership check: verify product belongs to the business
    UPDATE urunler
    SET miktar = miktar + p_miktar_degisim,
        updated_at = NOW()
    WHERE id = p_urun_id
      AND isletme_id = p_isletme_id
    RETURNING miktar INTO v_yeni_miktar;
  ELSE
    -- Backward compatibility: existing calls without isletme_id still work
    UPDATE urunler
    SET miktar = miktar + p_miktar_degisim,
        updated_at = NOW()
    WHERE id = p_urun_id
    RETURNING miktar INTO v_yeni_miktar;
  END IF;

  IF v_yeni_miktar IS NULL THEN
    RAISE EXCEPTION 'update_urun_miktar: urun bulunamadi veya bu isletmeye ait degil (urun_id: %, isletme_id: %)', p_urun_id, p_isletme_id;
  END IF;

  RETURN v_yeni_miktar;
END;
$$;

COMMENT ON FUNCTION update_urun_miktar(UUID, NUMERIC, UUID) IS 'Atomically update product stock quantity with optional ownership check. Returns new quantity.';
