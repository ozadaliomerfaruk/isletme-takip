-- Hesaplar tablosuna is_archived ekle
  ALTER TABLE hesaplar ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

  -- Cariler tablosuna is_archived ekle
  ALTER TABLE cariler ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

  -- Personel tablosuna is_archived ekle
  ALTER TABLE personel ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;