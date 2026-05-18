-- Add 'personel_izin' to notlar entity_type CHECK constraint
-- This allows notes to be created from the leave history page
ALTER TABLE notlar DROP CONSTRAINT IF EXISTS notlar_entity_type_check;
ALTER TABLE notlar ADD CONSTRAINT notlar_entity_type_check
  CHECK (entity_type IN ('hesap','cari','personel','personel_izin','urun','genel'));
