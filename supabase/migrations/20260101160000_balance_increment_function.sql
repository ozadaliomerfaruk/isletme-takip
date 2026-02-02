-- Bakiye güncelleme fonksiyonu
CREATE OR REPLACE FUNCTION increment_balance(
  table_name TEXT,
  row_id UUID,
  amount DECIMAL
)
RETURNS VOID AS $$
BEGIN
  EXECUTE format(
    'UPDATE %I SET balance = balance + $1 WHERE id = $2',
    table_name
  ) USING amount, row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
