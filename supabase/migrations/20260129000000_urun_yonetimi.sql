-- =============================================
-- ÜRÜN YÖNETİMİ TABLOLARI
-- Migration: urun_yonetimi
-- Purpose: Add basic inventory/product management capability
-- =============================================

-- =============================================
-- 1. URUNLER (Products) TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS urunler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  ad TEXT NOT NULL,
  kod TEXT,
  birim TEXT DEFAULT 'adet',
  miktar NUMERIC(15,3) DEFAULT 0,
  alis_fiyati NUMERIC(15,2) DEFAULT 0,
  satis_fiyati NUMERIC(15,2) DEFAULT 0,
  currency TEXT DEFAULT 'TRY',
  aciklama TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_urunler_isletme ON urunler(isletme_id);
CREATE INDEX IF NOT EXISTS idx_urunler_ad ON urunler(isletme_id, ad);
CREATE INDEX IF NOT EXISTS idx_urunler_active ON urunler(isletme_id) WHERE is_active = TRUE AND is_archived = FALSE;

-- RLS
ALTER TABLE urunler ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own urunler"
  ON urunler FOR ALL USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

COMMENT ON TABLE urunler IS 'Products/inventory items for stock management';
COMMENT ON COLUMN urunler.ad IS 'Product name';
COMMENT ON COLUMN urunler.kod IS 'Optional product code';
COMMENT ON COLUMN urunler.birim IS 'Unit of measurement (adet, kg, lt, m, m2, paket, kutu)';
COMMENT ON COLUMN urunler.miktar IS 'Current stock quantity (stored balance pattern)';
COMMENT ON COLUMN urunler.alis_fiyati IS 'Default purchase price';
COMMENT ON COLUMN urunler.satis_fiyati IS 'Default sale price';

-- =============================================
-- 2. URUN_HAREKETLER (Product Movements) TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS urun_hareketler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  urun_id UUID NOT NULL REFERENCES urunler(id) ON DELETE CASCADE,
  hareket_tipi TEXT NOT NULL CHECK (hareket_tipi IN ('giris', 'cikis', 'duzeltme')),
  miktar NUMERIC(15,3) NOT NULL,
  birim_fiyat NUMERIC(15,2),
  onceki_miktar NUMERIC(15,3),
  yeni_miktar NUMERIC(15,3),
  aciklama TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_urun_hareketler_isletme ON urun_hareketler(isletme_id);
CREATE INDEX IF NOT EXISTS idx_urun_hareketler_urun ON urun_hareketler(urun_id);
CREATE INDEX IF NOT EXISTS idx_urun_hareketler_tarih ON urun_hareketler(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_urun_hareketler_ay ON urun_hareketler(isletme_id, urun_id, date_trunc('month', created_at));

-- RLS
ALTER TABLE urun_hareketler ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own urun_hareketler"
  ON urun_hareketler FOR ALL USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

COMMENT ON TABLE urun_hareketler IS 'Stock movement log (entries, exits, adjustments)';
COMMENT ON COLUMN urun_hareketler.hareket_tipi IS 'Movement type: giris (entry), cikis (exit), duzeltme (adjustment)';
COMMENT ON COLUMN urun_hareketler.miktar IS 'Movement quantity (positive for giris, negative for cikis)';
COMMENT ON COLUMN urun_hareketler.onceki_miktar IS 'Stock quantity before movement';
COMMENT ON COLUMN urun_hareketler.yeni_miktar IS 'Stock quantity after movement';

-- =============================================
-- 3. RPC: Atomik Ürün Güncelleme
-- =============================================
CREATE OR REPLACE FUNCTION update_urun_miktar(
  p_urun_id UUID,
  p_miktar_degisim NUMERIC
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_yeni_miktar NUMERIC;
BEGIN
  UPDATE urunler
  SET miktar = miktar + p_miktar_degisim,
      updated_at = NOW()
  WHERE id = p_urun_id
  RETURNING miktar INTO v_yeni_miktar;

  RETURN v_yeni_miktar;
END;
$$;

COMMENT ON FUNCTION update_urun_miktar IS 'Atomically update product stock quantity. Returns new quantity.';

-- =============================================
-- DOCUMENTATION
-- =============================================
-- Bu migration mevcut tablolara dokunmuyor.
-- Sadece yeni tablolar ekliyor:
-- - urunler: Ürün tanımları ve ürün miktarları
-- - urun_hareketler: Ürün giriş/çıkış log'u
--
-- Ürün miktarı "stored balance" pattern ile urunler.miktar'da tutuluyor.
-- Her hareket urun_hareketler'e kaydediliyor ve urunler.miktar atomik olarak güncelleniyor.
