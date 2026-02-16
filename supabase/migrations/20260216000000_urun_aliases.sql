-- Urun alias tablosu: OCR'dan gelen farkli urun isimlerini ogrenme
CREATE TABLE urun_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  urun_id UUID NOT NULL REFERENCES urunler(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  supplier_cari_id UUID REFERENCES cariler(id) ON DELETE SET NULL,
  usage_count INTEGER DEFAULT 1,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Global alias unique (supplier_cari_id NULL)
CREATE UNIQUE INDEX idx_urun_aliases_unique ON urun_aliases(isletme_id, alias_normalized)
  WHERE supplier_cari_id IS NULL;

-- Supplier-specific alias unique
CREATE UNIQUE INDEX idx_urun_aliases_supplier_unique ON urun_aliases(isletme_id, alias_normalized, supplier_cari_id)
  WHERE supplier_cari_id IS NOT NULL;

CREATE INDEX idx_urun_aliases_isletme ON urun_aliases(isletme_id);
CREATE INDEX idx_urun_aliases_urun ON urun_aliases(urun_id);

ALTER TABLE urun_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own urun_aliases"
  ON urun_aliases FOR ALL USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );
