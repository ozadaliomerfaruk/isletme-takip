  -- ============================================
  -- NAKIT AVANS SİSTEMİ - TAM SQL MİGRASYON
  -- ============================================

  -- 1. hesaplar tablosuna credit_limit kolonu ekle (eğer yoksa)
  ALTER TABLE hesaplar ADD COLUMN IF NOT EXISTS credit_limit NUMERIC DEFAULT NULL;

  -- 2. nakit_avanslar tablosu
  CREATE TABLE IF NOT EXISTS nakit_avanslar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
    kredi_karti_id UUID NOT NULL REFERENCES hesaplar(id) ON DELETE CASCADE,
    hedef_hesap_id UUID NOT NULL REFERENCES hesaplar(id) ON DELETE CASCADE,
    tutar NUMERIC NOT NULL,
    geri_odeme_tutari NUMERIC NOT NULL,
    kategori_id UUID REFERENCES kategoriler(id) ON DELETE SET NULL,
    aciklama TEXT,
    tarih TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_taksitli BOOLEAN DEFAULT FALSE,
    taksit_sayisi INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- 3. nakit_avans_taksitler tablosu
  CREATE TABLE IF NOT EXISTS nakit_avans_taksitler (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nakit_avans_id UUID NOT NULL REFERENCES nakit_avanslar(id) ON DELETE CASCADE,
    sira_no INTEGER NOT NULL,
    tutar NUMERIC NOT NULL,
    odeme_tarihi DATE NOT NULL,
    odenen_tarih TIMESTAMPTZ,
    reminder_enabled BOOLEAN DEFAULT FALSE,
    reminder_days_before INTEGER DEFAULT 1,
    reminder_time TEXT DEFAULT '09:00',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- 4. RLS (Row Level Security) Aktifleştirme
  ALTER TABLE nakit_avanslar ENABLE ROW LEVEL SECURITY;
  ALTER TABLE nakit_avans_taksitler ENABLE ROW LEVEL SECURITY;

  -- 5. nakit_avanslar için RLS Policies
  DROP POLICY IF EXISTS "Users can view their own nakit_avanslar" ON nakit_avanslar;
  CREATE POLICY "Users can view their own nakit_avanslar" ON nakit_avanslar
    FOR SELECT USING (
      isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    );

  DROP POLICY IF EXISTS "Users can insert their own nakit_avanslar" ON nakit_avanslar;
  CREATE POLICY "Users can insert their own nakit_avanslar" ON nakit_avanslar
    FOR INSERT WITH CHECK (
      isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    );

  DROP POLICY IF EXISTS "Users can update their own nakit_avanslar" ON nakit_avanslar;
  CREATE POLICY "Users can update their own nakit_avanslar" ON nakit_avanslar
    FOR UPDATE USING (
      isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    );

  DROP POLICY IF EXISTS "Users can delete their own nakit_avanslar" ON nakit_avanslar;
  CREATE POLICY "Users can delete their own nakit_avanslar" ON nakit_avanslar
    FOR DELETE USING (
      isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    );

  -- 6. nakit_avans_taksitler için RLS Policies
  DROP POLICY IF EXISTS "Users can view their own taksitler" ON nakit_avans_taksitler;
  CREATE POLICY "Users can view their own taksitler" ON nakit_avans_taksitler
    FOR SELECT USING (
      nakit_avans_id IN (
        SELECT id FROM nakit_avanslar WHERE isletme_id IN (
          SELECT id FROM isletmeler WHERE user_id = auth.uid()
        )
      )
    );

  DROP POLICY IF EXISTS "Users can insert their own taksitler" ON nakit_avans_taksitler;
  CREATE POLICY "Users can insert their own taksitler" ON nakit_avans_taksitler
    FOR INSERT WITH CHECK (
      nakit_avans_id IN (
        SELECT id FROM nakit_avanslar WHERE isletme_id IN (
          SELECT id FROM isletmeler WHERE user_id = auth.uid()
        )
      )
    );

  DROP POLICY IF EXISTS "Users can update their own taksitler" ON nakit_avans_taksitler;
  CREATE POLICY "Users can update their own taksitler" ON nakit_avans_taksitler
    FOR UPDATE USING (
      nakit_avans_id IN (
        SELECT id FROM nakit_avanslar WHERE isletme_id IN (
          SELECT id FROM isletmeler WHERE user_id = auth.uid()
        )
      )
    );

  DROP POLICY IF EXISTS "Users can delete their own taksitler" ON nakit_avans_taksitler;
  CREATE POLICY "Users can delete their own taksitler" ON nakit_avans_taksitler
    FOR DELETE USING (
      nakit_avans_id IN (
        SELECT id FROM nakit_avanslar WHERE isletme_id IN (
          SELECT id FROM isletmeler WHERE user_id = auth.uid()
        )
      )
    );

  -- 7. Updated_at trigger fonksiyonu (eğer yoksa)
  CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  -- 8. Trigger'ları ekle
  DROP TRIGGER IF EXISTS update_nakit_avanslar_updated_at ON nakit_avanslar;
  CREATE TRIGGER update_nakit_avanslar_updated_at
    BEFORE UPDATE ON nakit_avanslar
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_nakit_avans_taksitler_updated_at ON nakit_avans_taksitler;
  CREATE TRIGGER update_nakit_avans_taksitler_updated_at
    BEFORE UPDATE ON nakit_avans_taksitler
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  -- 9. Performans için Indexler
  CREATE INDEX IF NOT EXISTS idx_nakit_avanslar_isletme_id ON nakit_avanslar(isletme_id);
  CREATE INDEX IF NOT EXISTS idx_nakit_avanslar_kredi_karti_id ON nakit_avanslar(kredi_karti_id);
  CREATE INDEX IF NOT EXISTS idx_nakit_avanslar_status ON nakit_avanslar(status);
  CREATE INDEX IF NOT EXISTS idx_nakit_avans_taksitler_nakit_avans_id ON nakit_avans_taksitler(nakit_avans_id);
  CREATE INDEX IF NOT EXISTS idx_nakit_avans_taksitler_odeme_tarihi ON nakit_avans_taksitler(odeme_tarihi);
  CREATE INDEX IF NOT EXISTS idx_nakit_avans_taksitler_status ON nakit_avans_taksitler(status);

  -- 10. Tamamlandı mesajı
  SELECT 'Nakit Avans tabloları ve RLS policies başarıyla oluşturuldu!' as message;