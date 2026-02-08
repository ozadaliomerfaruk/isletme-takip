-- =============================================================================
-- FIX: increment_balance - Table Name Allowlist
-- =============================================================================
-- BUG: Mevcut fonksiyon herhangi bir tablo adını kabul ediyor.
-- SECURITY DEFINER ile çalıştığı için yetkisiz tablolara erişim riski var.
--
-- FIX: Sadece balance kolonu olan tablolara izin ver (hesaplar, cariler, personel)
-- =============================================================================

CREATE OR REPLACE FUNCTION increment_balance(
  table_name TEXT,
  row_id UUID,
  amount DECIMAL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allowlist: sadece balance kolonu olan tablolar
  IF table_name NOT IN ('hesaplar', 'cariler', 'personel') THEN
    RAISE EXCEPTION 'increment_balance: yetkisiz tablo "%"', table_name;
  END IF;

  EXECUTE format(
    'UPDATE %I SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
    table_name
  ) USING amount, row_id;
END;
$$;
