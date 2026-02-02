-- İşlemler Tablosu
CREATE TABLE islemler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID REFERENCES isletmeler(id) ON DELETE CASCADE NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN (
    'gelir', 'gider', 'transfer',
    'cari_alis', 'cari_satis', 'cari_odeme', 'cari_tahsilat',
    'personel_maas', 'personel_avans', 'personel_odeme'
  )),
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- İlişkili kayıtlar (nullable)
  hesap_id UUID REFERENCES hesaplar(id) ON DELETE SET NULL,
  hedef_hesap_id UUID REFERENCES hesaplar(id) ON DELETE SET NULL,
  kategori_id UUID REFERENCES kategoriler(id) ON DELETE SET NULL,
  cari_id UUID REFERENCES cariler(id) ON DELETE SET NULL,
  personel_id UUID REFERENCES personel(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexler
CREATE INDEX idx_islemler_isletme ON islemler(isletme_id);
CREATE INDEX idx_islemler_date ON islemler(isletme_id, date DESC);
CREATE INDEX idx_islemler_type ON islemler(isletme_id, type);
CREATE INDEX idx_islemler_hesap ON islemler(hesap_id);
CREATE INDEX idx_islemler_cari ON islemler(cari_id);
CREATE INDEX idx_islemler_personel ON islemler(personel_id);
