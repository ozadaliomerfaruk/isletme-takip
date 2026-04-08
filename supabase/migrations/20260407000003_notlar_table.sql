-- Create notlar (notes) table for adding notes to entities
-- This is a new table; existing users are not affected (no data changes to existing tables)
CREATE TABLE IF NOT EXISTS notlar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('hesap','cari','personel','urun','genel')),
  entity_id UUID,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient querying by entity (idempotent)
CREATE INDEX IF NOT EXISTS idx_notlar_isletme_entity ON notlar(isletme_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notlar_isletme_created ON notlar(isletme_id, created_at DESC);

-- Enable RLS (safe to call multiple times)
ALTER TABLE notlar ENABLE ROW LEVEL SECURITY;

-- Owner policy (isletme sahibi tum notlara erisebilir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notlar' AND policyname = 'Users can manage notlar'
  ) THEN
    CREATE POLICY "Users can manage notlar" ON notlar
      FOR ALL USING (
        isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- Shared user policies (davetli kullanicilar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notlar' AND policyname = 'Shared select notlar'
  ) THEN
    CREATE POLICY "Shared select notlar" ON notlar FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM isletme_users iu
        WHERE iu.isletme_id = notlar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notlar' AND policyname = 'Shared insert notlar'
  ) THEN
    CREATE POLICY "Shared insert notlar" ON notlar FOR INSERT TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM isletme_users iu
        WHERE iu.isletme_id = notlar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notlar' AND policyname = 'Shared update notlar'
  ) THEN
    CREATE POLICY "Shared update notlar" ON notlar FOR UPDATE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM isletme_users iu
        WHERE iu.isletme_id = notlar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
        AND notlar.created_by = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notlar' AND policyname = 'Shared delete notlar'
  ) THEN
    CREATE POLICY "Shared delete notlar" ON notlar FOR DELETE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM isletme_users iu
        WHERE iu.isletme_id = notlar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
        AND notlar.created_by = auth.uid()
      ));
  END IF;
END $$;
