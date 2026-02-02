-- Mevcut constraint'i kaldır
  ALTER TABLE hesaplar DROP CONSTRAINT hesaplar_type_check;

  -- Yeni constraint ekle (hem diger hem birikim dahil)
  ALTER TABLE hesaplar ADD CONSTRAINT hesaplar_type_check
  CHECK (type IN ('nakit', 'banka', 'kredi_karti', 'birikim', 'diger'));