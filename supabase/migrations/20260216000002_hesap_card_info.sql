-- Hesaplara kart bilgisi ekleme (POS fisi otomatik eslestirme icin)
ALTER TABLE hesaplar ADD COLUMN IF NOT EXISTS card_last_four TEXT;
ALTER TABLE hesaplar ADD COLUMN IF NOT EXISTS card_network TEXT;

CREATE INDEX idx_hesaplar_card ON hesaplar(isletme_id, card_last_four)
  WHERE card_last_four IS NOT NULL;
