-- İzin kullanımında tarih aralığı desteği için date_end kolonu
-- Nullable - mevcut kayıtlar etkilenmez
ALTER TABLE islemler ADD COLUMN IF NOT EXISTS date_end text;
