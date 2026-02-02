 ALTER TABLE urunler
  ADD COLUMN IF NOT EXISTS kdv_orani integer DEFAULT 0
  CHECK (kdv_orani IN (0, 1, 10, 20));