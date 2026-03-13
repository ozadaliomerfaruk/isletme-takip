-- Ürün kategorilerini gelir/gider kategorilerine eşleme
-- Her ürün kategorisi (type='urun') bir gelir ve/veya gider kategorisine eşlenebilir
-- Bu eşleme raporlarda kullanılarak ürünlü işlemler doğru gelir/gider kategorisinde gösterilir

ALTER TABLE kategoriler
ADD COLUMN mapped_gelir_kategori_id UUID REFERENCES kategoriler(id) ON DELETE SET NULL,
ADD COLUMN mapped_gider_kategori_id UUID REFERENCES kategoriler(id) ON DELETE SET NULL;

-- Lookup performansı için indeksler
CREATE INDEX idx_kategoriler_mapped_gelir ON kategoriler(mapped_gelir_kategori_id) WHERE mapped_gelir_kategori_id IS NOT NULL;
CREATE INDEX idx_kategoriler_mapped_gider ON kategoriler(mapped_gider_kategori_id) WHERE mapped_gider_kategori_id IS NOT NULL;

COMMENT ON COLUMN kategoriler.mapped_gelir_kategori_id IS 'Ürün kategorileri için: gelir raporlarında hangi gelir kategorisine eşlenecek';
COMMENT ON COLUMN kategoriler.mapped_gider_kategori_id IS 'Ürün kategorileri için: gider raporlarında hangi gider kategorisine eşlenecek';
