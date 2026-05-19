-- =============================================================================
-- FIX: increment_balance - Add isletme ownership check
-- =============================================================================
-- SECURITY DEFINER bypasses RLS, so a malicious caller could pass another
-- business's row_id and change their balance. This migration adds a WHERE
-- clause that ensures the target row belongs to the calling user's isletme
-- (either as owner or shared user).
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
  IF table_name NOT IN ('hesaplar', 'cariler', 'personel') THEN
    RAISE EXCEPTION 'increment_balance: yetkisiz tablo "%"', table_name;
  END IF;

  EXECUTE format(
    'UPDATE %I SET balance = balance + $1, updated_at = NOW()
     WHERE id = $2
       AND isletme_id IN (
         SELECT id FROM isletmeler WHERE user_id = auth.uid()
         UNION
         SELECT isletme_id FROM isletme_users WHERE user_id = auth.uid() AND status = ''active''
       )',
    table_name
  ) USING amount, row_id;
END;
$$;
