CREATE OR REPLACE FUNCTION increment_balance(
  table_name TEXT,
  row_id UUID,
  amount NUMERIC
)
RETURNS VOID AS $$
BEGIN
  -- Güvenlik: Sadece izin verilen tablolar
  IF table_name NOT IN ('hesaplar', 'cariler', 'personel') THEN
    RAISE EXCEPTION 'Geçersiz tablo adı: %', table_name;
  END IF;

  EXECUTE format(
    'UPDATE %I SET balance = balance + $1 WHERE id = $2',
    table_name
  ) USING amount, row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
