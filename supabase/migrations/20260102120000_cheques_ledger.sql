CREATE TABLE cekler (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
    hesap_id UUID NOT NULL REFERENCES hesaplar(id) ON DELETE CASCADE,
    cari_id UUID NOT NULL REFERENCES cariler(id) ON DELETE CASCADE,
    cek_no VARCHAR(50) NOT NULL,
    tutar DECIMAL(15,2) NOT NULL,
    kesim_tarihi DATE NOT NULL DEFAULT CURRENT_DATE,
    vade_tarihi DATE NOT NULL,
    durum VARCHAR(20) NOT NULL DEFAULT 'beklemede',
    odeme_tarihi DATE,
    kategori_id UUID REFERENCES kategoriler(id) ON DELETE SET NULL,
    aciklama TEXT,
    notification_id VARCHAR(100),
    islem_id UUID REFERENCES islemler(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- RLS
  ALTER TABLE cekler ENABLE ROW LEVEL SECURITY;

  -- Indexes
  CREATE INDEX idx_cekler_hesap ON cekler(hesap_id);
  CREATE INDEX idx_cekler_cari ON cekler(cari_id);
  CREATE INDEX idx_cekler_durum ON cekler(durum);
  CREATE INDEX idx_cekler_vade ON cekler(vade_tarihi) WHERE durum = 'beklemede';