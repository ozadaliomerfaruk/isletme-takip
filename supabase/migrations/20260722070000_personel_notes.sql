-- Personele serbest metin "Not" alanı ekle (cari.notes ile aynı amaç).
-- Additive + nullable: mevcut satırlar NULL alır, eski client'lar kolonu
-- görmezden gelir (insert'lerde göndermez → NULL), hiçbir davranış bozulmaz.
ALTER TABLE personel ADD COLUMN IF NOT EXISTS notes TEXT;
