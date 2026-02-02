 -- urunler tablosuna kategori_id kolonu ekle
  ALTER TABLE urunler
  ADD COLUMN kategori_id UUID REFERENCES kategoriler(id) ON DELETE SET NULL;

  -- kategoriler tablosunda 'stok' type'ı için check constraint güncelle
  ALTER TABLE kategoriler
  DROP CONSTRAINT IF EXISTS kategoriler_type_check;

  ALTER TABLE kategoriler
  ADD CONSTRAINT kategoriler_type_check
  CHECK (type IN ('gelir', 'gider', 'stok'));