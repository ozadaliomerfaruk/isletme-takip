-- İleri Tarihli İşlemler Tablosu
CREATE TABLE ileri_tarihli_islemler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  type VARCHAR NOT NULL,
  amount DECIMAL NOT NULL,
  description TEXT,
  scheduled_date DATE NOT NULL,
  hesap_id UUID REFERENCES hesaplar(id) ON DELETE SET NULL,
  hedef_hesap_id UUID REFERENCES hesaplar(id) ON DELETE SET NULL,
  kategori_id UUID REFERENCES kategoriler(id) ON DELETE SET NULL,
  cari_id UUID REFERENCES cariler(id) ON DELETE SET NULL,
  personel_id UUID REFERENCES personel(id) ON DELETE SET NULL,
  status VARCHAR DEFAULT 'pending',
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexler (performans için kritik)
CREATE INDEX idx_ileri_tarihli_scheduled_date 
ON ileri_tarihli_islemler (scheduled_date);

CREATE INDEX idx_ileri_tarihli_isletme_status 
ON ileri_tarihli_islemler (isletme_id, status);

-- RLS Politikaları
ALTER TABLE ileri_tarihli_islemler ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scheduled transactions" 
ON ileri_tarihli_islemler FOR SELECT 
USING (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own scheduled transactions" 
ON ileri_tarihli_islemler FOR INSERT 
WITH CHECK (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own scheduled transactions" 
ON ileri_tarihli_islemler FOR UPDATE 
USING (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own scheduled transactions" 
ON ileri_tarihli_islemler FOR DELETE 
USING (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()));
