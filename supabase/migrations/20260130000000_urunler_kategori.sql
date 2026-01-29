-- =============================================
-- ÜRÜNLERE KATEGORİ DESTEĞİ
-- Migration: urunler_kategori
-- Purpose: Add category support for products/stock items
-- =============================================

-- =============================================
-- URUNLER TABLOSUNA KATEGORİ_ID EKLE
-- =============================================
-- Ürünler mevcut gelir/gider kategorilerini kullanacak
ALTER TABLE urunler
ADD COLUMN IF NOT EXISTS kategori_id UUID REFERENCES kategoriler(id) ON DELETE SET NULL;

-- Index for category lookups
CREATE INDEX IF NOT EXISTS idx_urunler_kategori ON urunler(kategori_id) WHERE kategori_id IS NOT NULL;

COMMENT ON COLUMN urunler.kategori_id IS 'Optional product category reference (uses existing gelir/gider categories)';

-- =============================================
-- DOCUMENTATION
-- =============================================
-- Bu migration:
-- - urunler tablosuna kategori_id kolonu ekliyor
-- - Ürünler mevcut gelir/gider kategorilerini kullanıyor
-- - Yeni kategori tipi eklenmedi
