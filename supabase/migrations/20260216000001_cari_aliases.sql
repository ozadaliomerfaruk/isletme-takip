-- Cari alias tablosu: OCR'dan gelen farkli cari isimlerini ogrenme
CREATE TABLE cari_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  cari_id UUID NOT NULL REFERENCES cariler(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  usage_count INTEGER DEFAULT 1,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_cari_aliases_unique ON cari_aliases(isletme_id, alias_normalized);
CREATE INDEX idx_cari_aliases_isletme ON cari_aliases(isletme_id);
CREATE INDEX idx_cari_aliases_cari ON cari_aliases(cari_id);

ALTER TABLE cari_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cari_aliases"
  ON cari_aliases FOR ALL USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );
