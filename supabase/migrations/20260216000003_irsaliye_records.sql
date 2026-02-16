-- İrsaliye bekleme sistemi
-- İrsaliye ile alınan ürünler stok'a girilir ama cari borç oluşturulmaz.
-- Fatura geldiğinde irsaliye bağlanır ve cari borç o zaman oluşturulur.

CREATE TABLE irsaliye_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  cari_id UUID REFERENCES cariler(id) ON DELETE SET NULL,
  tarih DATE NOT NULL DEFAULT CURRENT_DATE,
  toplam_tutar NUMERIC(15,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'linked', 'cancelled')),
  linked_islem_id UUID REFERENCES islemler(id) ON DELETE SET NULL,
  belge_no TEXT,
  items JSONB DEFAULT '[]',
  photo_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_irsaliye_isletme ON irsaliye_records(isletme_id);
CREATE INDEX idx_irsaliye_cari ON irsaliye_records(cari_id);
CREATE INDEX idx_irsaliye_status ON irsaliye_records(isletme_id, status);
CREATE INDEX idx_irsaliye_tarih ON irsaliye_records(isletme_id, tarih DESC);

ALTER TABLE irsaliye_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own irsaliye_records"
  ON irsaliye_records FOR ALL USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );
