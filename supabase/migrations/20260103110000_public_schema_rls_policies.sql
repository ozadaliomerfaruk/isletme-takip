 -- Mevcut işlemleri etkilemez, sadece yeni sütun ekler
  ALTER TABLE islemler ADD COLUMN IF NOT EXISTS photo_path TEXT DEFAULT NULL;

  -- Fotoğraflı işlemler için index (opsiyonel, performans için)
  CREATE INDEX IF NOT EXISTS idx_islemler_photo ON islemler(isletme_id)
    WHERE photo_path IS NOT NULL;