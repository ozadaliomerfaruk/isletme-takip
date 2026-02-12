 -- islem_id ve kdv_orani kolonları ekle
  ALTER TABLE urun_hareketler ADD COLUMN IF NOT EXISTS islem_id uuid REFERENCES islemler(id) ON DELETE SET NULL;
  ALTER TABLE urun_hareketler ADD COLUMN IF NOT EXISTS kdv_orani integer DEFAULT 0;

  -- Index ekle
  CREATE INDEX IF NOT EXISTS idx_urun_hareketler_islem_id ON urun_hareketler(islem_id);