-- =============================================================================
-- MIGRATION: Cari Sharing v2 - Yeniden Tasarim
-- =============================================================================
-- Model degisikligi:
--   Eski: Iki cari birbirine baglanir (cari_a <-> cari_b)
--   Yeni: Bir cari baska bir isletmeye paylasilir, alicinin listesinde gorunur
--
-- Henuz kullanici verisi yok, eski tablolari drop edip yeniden olusturuyoruz.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. TEMIZLIK: Eski v1 yapilarini kaldir
-- ---------------------------------------------------------------------------

-- Eski realtime (guvenli: tablo varsa publication'dan cikar)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cari_links'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE cari_links;
  END IF;
END
$$;

-- Eski RPC'ler
DROP FUNCTION IF EXISTS generate_cari_share_code(UUID, UUID);
DROP FUNCTION IF EXISTS accept_cari_share_code(TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS remove_cari_link(UUID, UUID);
DROP FUNCTION IF EXISTS get_linked_cari_info(UUID, UUID);

-- Eski cross-tenant policy'ler
DROP POLICY IF EXISTS "view_linked_cariler" ON cariler;
DROP POLICY IF EXISTS "view_linked_islemler" ON islemler;

-- Eski "Users can manage own cariler" policy'yi kaldir
DROP POLICY IF EXISTS "Users can manage own cariler" ON cariler;

-- Orijinal policy'yi geri yukle (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage cariler' AND tablename = 'cariler'
  ) THEN
    CREATE POLICY "Users can manage cariler" ON cariler
      FOR ALL
      USING (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()))
      WITH CHECK (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()));
  END IF;
END
$$;

-- Eski RLS policy'leri
DROP POLICY IF EXISTS "create_own_codes" ON cari_share_codes;
DROP POLICY IF EXISTS "view_own_or_lookup_codes" ON cari_share_codes;
DROP POLICY IF EXISTS "view_own_links" ON cari_links;
DROP POLICY IF EXISTS "delete_own_links" ON cari_links;

-- Eski tablolar
DROP TABLE IF EXISTS cari_links CASCADE;
DROP TABLE IF EXISTS cari_share_codes CASCADE;

-- ---------------------------------------------------------------------------
-- 1. TABLE: cari_share_codes (permission kolonu eklendi)
-- ---------------------------------------------------------------------------
CREATE TABLE cari_share_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cari_id UUID NOT NULL REFERENCES cariler(id) ON DELETE CASCADE,
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  code CHAR(6) NOT NULL UNIQUE,
  permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'full')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  used_at TIMESTAMPTZ DEFAULT NULL,
  used_by_isletme_id UUID REFERENCES isletmeler(id) ON DELETE SET NULL,
  CONSTRAINT valid_code CHECK (code ~ '^[A-Z0-9]{6}$')
);

CREATE INDEX idx_share_codes_code ON cari_share_codes(code) WHERE used_at IS NULL;
CREATE INDEX idx_share_codes_cari ON cari_share_codes(cari_id);

-- ---------------------------------------------------------------------------
-- 2. TABLE: cari_links (tek yonlu paylasim modeli)
-- ---------------------------------------------------------------------------
CREATE TABLE cari_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Paylasilan cari (owner tarafinda)
  cari_id UUID NOT NULL REFERENCES cariler(id) ON DELETE CASCADE,
  owner_isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,

  -- Alici (viewer) taraf
  viewer_isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  viewer_type TEXT NOT NULL DEFAULT 'musteri' CHECK (viewer_type IN ('musteri', 'tedarikci')),

  -- Erisim seviyesi
  permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'full')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Her cari sadece bir kez paylasilabilir
  CONSTRAINT unique_cari_link UNIQUE (cari_id),
  CONSTRAINT no_self_link CHECK (owner_isletme_id != viewer_isletme_id)
);

CREATE INDEX idx_links_owner ON cari_links(owner_isletme_id);
CREATE INDEX idx_links_viewer ON cari_links(viewer_isletme_id);
CREATE INDEX idx_links_cari ON cari_links(cari_id);

-- ---------------------------------------------------------------------------
-- 3. RLS: cari_share_codes
-- ---------------------------------------------------------------------------
ALTER TABLE cari_share_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "create_own_codes" ON cari_share_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    AND cari_id IN (SELECT id FROM cariler WHERE isletme_id = cari_share_codes.isletme_id)
  );

CREATE POLICY "view_own_or_lookup_codes" ON cari_share_codes
  FOR SELECT
  TO authenticated
  USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 4. RLS: cari_links
-- ---------------------------------------------------------------------------
ALTER TABLE cari_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_links" ON cari_links
  FOR SELECT
  TO authenticated
  USING (
    owner_isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR viewer_isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

CREATE POLICY "delete_own_links" ON cari_links
  FOR DELETE
  TO authenticated
  USING (
    owner_isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR viewer_isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 5. Cross-tenant SELECT on cariler: viewer paylasilan cari'yi gorebilir
-- ---------------------------------------------------------------------------
CREATE POLICY "view_linked_cariler" ON cariler
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT cari_id FROM cari_links
      WHERE viewer_isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Cross-tenant SELECT on islemler: linked cari islemleri
-- ---------------------------------------------------------------------------
CREATE POLICY "view_linked_islemler" ON islemler
  FOR SELECT
  TO authenticated
  USING (
    cari_id IS NOT NULL
    AND cari_id IN (
      SELECT cari_id FROM cari_links
      WHERE viewer_isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Cross-tenant INSERT/UPDATE/DELETE on islemler: sadece permission='full'
-- ---------------------------------------------------------------------------
CREATE POLICY "manage_linked_islemler" ON islemler
  FOR ALL
  TO authenticated
  USING (
    cari_id IS NOT NULL
    AND cari_id IN (
      SELECT cari_id FROM cari_links
      WHERE viewer_isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
        AND permission = 'full'
    )
  )
  WITH CHECK (
    cari_id IS NOT NULL
    AND cari_id IN (
      SELECT cari_id FROM cari_links
      WHERE viewer_isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
        AND permission = 'full'
    )
  );

-- ---------------------------------------------------------------------------
-- 8. RPC: generate_cari_share_code (v2 - permission parametresi eklendi)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_cari_share_code(
  p_cari_id UUID,
  p_isletme_id UUID,
  p_permission TEXT DEFAULT 'view'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code TEXT;
  v_attempts INTEGER := 0;
  v_rate_limit INTEGER;
  v_existing_link UUID;
  v_chars TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_chars_len INTEGER;
  v_i INTEGER;
BEGIN
  -- Permission dogrulama
  IF p_permission NOT IN ('view', 'full') THEN
    RAISE EXCEPTION 'Gecersiz izin seviyesi: %', p_permission;
  END IF;

  -- Ownership check
  IF NOT EXISTS (
    SELECT 1 FROM cariler c
    JOIN isletmeler i ON c.isletme_id = i.id
    WHERE c.id = p_cari_id
      AND i.id = p_isletme_id
      AND i.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Cari bulunamadi veya erisim yetkiniz yok';
  END IF;

  -- Already linked check
  SELECT id INTO v_existing_link
  FROM cari_links
  WHERE cari_id = p_cari_id;

  IF v_existing_link IS NOT NULL THEN
    RAISE EXCEPTION 'Bu cari zaten paylasilmis. Once mevcut baglantiyi kaldirin.';
  END IF;

  -- Rate limit: max 5 codes per hour per isletme
  SELECT COUNT(*) INTO v_rate_limit
  FROM cari_share_codes
  WHERE isletme_id = p_isletme_id
    AND created_at > NOW() - INTERVAL '1 hour';

  IF v_rate_limit >= 5 THEN
    RAISE EXCEPTION 'Cok fazla paylasim kodu olusturdunuz. Lutfen daha sonra tekrar deneyin.';
  END IF;

  -- Cancel existing unused codes for this cari
  UPDATE cari_share_codes
  SET expires_at = NOW()
  WHERE cari_id = p_cari_id
    AND used_at IS NULL
    AND expires_at > NOW();

  -- Generate unique 6-char code
  v_chars_len := length(v_chars);

  LOOP
    v_code := '';
    FOR v_i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * v_chars_len + 1)::INTEGER, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM cari_share_codes
      WHERE code = v_code AND expires_at > NOW() AND used_at IS NULL
    );

    v_attempts := v_attempts + 1;
    IF v_attempts >= 10 THEN
      RAISE EXCEPTION 'Kod olusturulamadi. Lutfen tekrar deneyin.';
    END IF;
  END LOOP;

  -- Insert the new code with permission
  INSERT INTO cari_share_codes (cari_id, isletme_id, code, permission)
  VALUES (p_cari_id, p_isletme_id, v_code, p_permission);

  RETURN v_code;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. RPC: accept_cari_share_code (v2 - cari_id yok, viewer_type eklendi)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_cari_share_code(
  p_code TEXT,
  p_isletme_id UUID,
  p_viewer_type TEXT DEFAULT 'musteri'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_share_code RECORD;
  v_link_id UUID;
  v_existing_link UUID;
BEGIN
  -- viewer_type dogrulama
  IF p_viewer_type NOT IN ('musteri', 'tedarikci') THEN
    RAISE EXCEPTION 'Gecersiz cari tipi: %', p_viewer_type;
  END IF;

  -- Ownership check: caller must own the isletme
  IF NOT EXISTS (
    SELECT 1 FROM isletmeler
    WHERE id = p_isletme_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Isletme bulunamadi veya erisim yetkiniz yok';
  END IF;

  -- Find and lock the valid code
  SELECT * INTO v_share_code
  FROM cari_share_codes
  WHERE code = upper(p_code)
    AND used_at IS NULL
    AND expires_at > NOW()
  FOR UPDATE;

  IF v_share_code IS NULL THEN
    RAISE EXCEPTION 'Gecersiz veya suresi dolmus paylasim kodu';
  END IF;

  -- Self-link prevention
  IF v_share_code.isletme_id = p_isletme_id THEN
    RAISE EXCEPTION 'Kendi carinizle baglanti kuramazsiniz';
  END IF;

  -- Check if the code's cari is already linked (race condition guard)
  SELECT id INTO v_existing_link
  FROM cari_links
  WHERE cari_id = v_share_code.cari_id;

  IF v_existing_link IS NOT NULL THEN
    RAISE EXCEPTION 'Paylasim kodundaki cari zaten baska biriyle baglantili.';
  END IF;

  -- Mark code as used
  UPDATE cari_share_codes
  SET used_at = NOW(),
      used_by_isletme_id = p_isletme_id
  WHERE id = v_share_code.id;

  -- Create link (one-way: owner -> viewer)
  INSERT INTO cari_links (
    cari_id, owner_isletme_id,
    viewer_isletme_id, viewer_type, permission
  ) VALUES (
    v_share_code.cari_id, v_share_code.isletme_id,
    p_isletme_id, p_viewer_type, v_share_code.permission
  )
  RETURNING id INTO v_link_id;

  RETURN v_link_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. RPC: remove_cari_link (v2 - kolon adlari guncellendi)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION remove_cari_link(
  p_link_id UUID,
  p_isletme_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Ownership check: caller must be owner or viewer
  IF NOT EXISTS (
    SELECT 1 FROM cari_links cl
    JOIN isletmeler i ON (cl.owner_isletme_id = i.id OR cl.viewer_isletme_id = i.id)
    WHERE cl.id = p_link_id
      AND i.id = p_isletme_id
      AND i.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Baglanti bulunamadi veya erisim yetkiniz yok';
  END IF;

  DELETE FROM cari_links WHERE id = p_link_id;

  RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Realtime: enable for cari_links
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE cari_links;
