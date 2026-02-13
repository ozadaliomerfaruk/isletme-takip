-- =============================================================================
-- MIGRATION: Cari Sharing (Cari Hesap Paylasim Ozelligi)
-- =============================================================================
-- Two businesses can mutually view each other's cari account statements
-- (balance + transactions) via a temporary share code mechanism.
--
-- Tables: cari_share_codes, cari_links
-- RPC Functions: generate_cari_share_code, accept_cari_share_code,
--                remove_cari_link, get_linked_cari_info
-- RLS Policies: cross-tenant read-only access for linked cariler/islemler
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLE: cari_share_codes (temporary share codes)
-- ---------------------------------------------------------------------------
CREATE TABLE cari_share_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cari_id UUID NOT NULL REFERENCES cariler(id) ON DELETE CASCADE,
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  code CHAR(6) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  used_at TIMESTAMPTZ DEFAULT NULL,
  used_by_isletme_id UUID REFERENCES isletmeler(id) ON DELETE SET NULL,
  CONSTRAINT valid_code CHECK (code ~ '^[A-Z0-9]{6}$')
);

-- Index: fast code lookup (only unused codes)
CREATE INDEX idx_share_codes_code ON cari_share_codes(code) WHERE used_at IS NULL;

-- Index: find codes by cari
CREATE INDEX idx_share_codes_cari ON cari_share_codes(cari_id);

-- ---------------------------------------------------------------------------
-- 2. TABLE: cari_links (permanent bidirectional links)
-- ---------------------------------------------------------------------------
CREATE TABLE cari_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Side A (code generator)
  isletme_a_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  cari_a_id UUID NOT NULL REFERENCES cariler(id) ON DELETE CASCADE,

  -- Side B (code acceptor)
  isletme_b_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  cari_b_id UUID NOT NULL REFERENCES cariler(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_cari_a UNIQUE (cari_a_id),  -- Each cari can only be shared with one party
  CONSTRAINT unique_cari_b UNIQUE (cari_b_id),  -- Each cari can only be shared with one party
  CONSTRAINT no_self_link CHECK (isletme_a_id != isletme_b_id)
);

-- Indexes
CREATE INDEX idx_links_isletme_a ON cari_links(isletme_a_id);
CREATE INDEX idx_links_isletme_b ON cari_links(isletme_b_id);
CREATE INDEX idx_links_cari_a ON cari_links(cari_a_id);
CREATE INDEX idx_links_cari_b ON cari_links(cari_b_id);

-- ---------------------------------------------------------------------------
-- 3. RLS: cari_share_codes
-- ---------------------------------------------------------------------------
ALTER TABLE cari_share_codes ENABLE ROW LEVEL SECURITY;

-- INSERT: Users can only create codes for their own isletme's cariler
CREATE POLICY "create_own_codes" ON cari_share_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    AND cari_id IN (SELECT id FROM cariler WHERE isletme_id = cari_share_codes.isletme_id)
  );

-- SELECT: Users can see their own codes + look up any code by value (for accepting)
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

-- SELECT: Users can see links where they are on either side
CREATE POLICY "view_own_links" ON cari_links
  FOR SELECT
  TO authenticated
  USING (
    isletme_a_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR isletme_b_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

-- DELETE: Users can delete links where they are on either side
CREATE POLICY "delete_own_links" ON cari_links
  FOR DELETE
  TO authenticated
  USING (
    isletme_a_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR isletme_b_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 5. RLS: Additional SELECT policies on cariler for linked cari viewing
-- ---------------------------------------------------------------------------
-- Drop the existing FOR ALL policy so we can create granular per-operation policies
-- that include cross-tenant read access for linked cariler.
DROP POLICY IF EXISTS "Users can manage cariler" ON cariler;

-- Re-create the original full-access policy for own isletme cariler (INSERT, UPDATE, DELETE)
CREATE POLICY "Users can manage own cariler" ON cariler
  FOR ALL
  USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  )
  WITH CHECK (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

-- Read-only access to linked cariler (cross-tenant)
CREATE POLICY "view_linked_cariler" ON cariler
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT cari_a_id FROM cari_links
      WHERE isletme_b_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
      UNION ALL
      SELECT cari_b_id FROM cari_links
      WHERE isletme_a_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 6. RLS: Additional SELECT policy on islemler for linked cari transactions
-- ---------------------------------------------------------------------------
-- Read-only access to transactions of linked cariler (cross-tenant)
CREATE POLICY "view_linked_islemler" ON islemler
  FOR SELECT
  TO authenticated
  USING (
    cari_id IS NOT NULL
    AND cari_id IN (
      SELECT cari_a_id FROM cari_links
      WHERE isletme_b_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
      UNION ALL
      SELECT cari_b_id FROM cari_links
      WHERE isletme_a_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 7. RPC: generate_cari_share_code
-- ---------------------------------------------------------------------------
-- Generates a unique 6-character share code for a cari.
-- Performs ownership check, already-linked check, rate limiting (5/hour),
-- cancels existing unused codes, and generates a unique code
-- (excluding ambiguous characters 0/O/1/I/L).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_cari_share_code(
  p_cari_id UUID,
  p_isletme_id UUID
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
  -- Ownership check: caller must own the isletme and the cari must belong to it
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
  WHERE cari_a_id = p_cari_id OR cari_b_id = p_cari_id;

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

  -- Cancel existing unused codes for this cari (expire them immediately)
  UPDATE cari_share_codes
  SET expires_at = NOW()
  WHERE cari_id = p_cari_id
    AND used_at IS NULL
    AND expires_at > NOW();

  -- Generate unique 6-char code (excluding 0/O/1/I/L)
  v_chars_len := length(v_chars);

  LOOP
    v_code := '';
    FOR v_i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * v_chars_len + 1)::INTEGER, 1);
    END LOOP;

    -- Check uniqueness among active (non-expired, non-used) codes
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM cari_share_codes
      WHERE code = v_code AND expires_at > NOW() AND used_at IS NULL
    );

    v_attempts := v_attempts + 1;
    IF v_attempts >= 10 THEN
      RAISE EXCEPTION 'Kod olusturulamadi. Lutfen tekrar deneyin.';
    END IF;
  END LOOP;

  -- Insert the new code
  INSERT INTO cari_share_codes (cari_id, isletme_id, code)
  VALUES (p_cari_id, p_isletme_id, v_code);

  RETURN v_code;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. RPC: accept_cari_share_code
-- ---------------------------------------------------------------------------
-- Accepts a share code, validates it, and creates a bidirectional cari link.
-- Performs ownership check on the accepting cari, already-linked check,
-- code validity check, self-link prevention, marks code as used,
-- and creates the cari_links record.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_cari_share_code(
  p_code TEXT,
  p_my_cari_id UUID,
  p_my_isletme_id UUID
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
  -- Ownership check: caller must own the isletme and the cari must belong to it
  IF NOT EXISTS (
    SELECT 1 FROM cariler c
    JOIN isletmeler i ON c.isletme_id = i.id
    WHERE c.id = p_my_cari_id
      AND i.id = p_my_isletme_id
      AND i.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Cari bulunamadi veya erisim yetkiniz yok';
  END IF;

  -- Check if my cari is already linked
  SELECT id INTO v_existing_link
  FROM cari_links
  WHERE cari_a_id = p_my_cari_id OR cari_b_id = p_my_cari_id;

  IF v_existing_link IS NOT NULL THEN
    RAISE EXCEPTION 'Bu cari zaten baska biriyle baglantili.';
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

  -- Self-link prevention: cannot link to own isletme
  IF v_share_code.isletme_id = p_my_isletme_id THEN
    RAISE EXCEPTION 'Kendi carinizle baglanti kuramazsiniz';
  END IF;

  -- Check if the code's cari is already linked (race condition guard)
  SELECT id INTO v_existing_link
  FROM cari_links
  WHERE cari_a_id = v_share_code.cari_id OR cari_b_id = v_share_code.cari_id;

  IF v_existing_link IS NOT NULL THEN
    RAISE EXCEPTION 'Paylasim kodundaki cari zaten baska biriyle baglantili.';
  END IF;

  -- Mark code as used
  UPDATE cari_share_codes
  SET used_at = NOW(),
      used_by_isletme_id = p_my_isletme_id
  WHERE id = v_share_code.id;

  -- Create bidirectional link
  INSERT INTO cari_links (
    isletme_a_id, cari_a_id,
    isletme_b_id, cari_b_id
  ) VALUES (
    v_share_code.isletme_id, v_share_code.cari_id,
    p_my_isletme_id, p_my_cari_id
  )
  RETURNING id INTO v_link_id;

  RETURN v_link_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. RPC: remove_cari_link
-- ---------------------------------------------------------------------------
-- Removes a cari link. Either side of the link can remove it.
-- Performs ownership check (caller must own one of the two isletmes).
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
  -- Ownership check: caller must own the isletme and it must be on one side of the link
  IF NOT EXISTS (
    SELECT 1 FROM cari_links cl
    JOIN isletmeler i ON (cl.isletme_a_id = i.id OR cl.isletme_b_id = i.id)
    WHERE cl.id = p_link_id
      AND i.id = p_isletme_id
      AND i.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Baglanti bulunamadi veya erisim yetkiniz yok';
  END IF;

  -- Delete the link (CASCADE will clean up any related records)
  DELETE FROM cari_links WHERE id = p_link_id;

  RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. RPC: get_linked_cari_info
-- ---------------------------------------------------------------------------
-- Returns linked cari details for a given cari, as seen by the viewer.
-- The viewer must own the p_viewer_isletme_id and the cari must either
-- belong to the viewer or be linked to the viewer's isletme.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_linked_cari_info(
  p_cari_id UUID,
  p_viewer_isletme_id UUID
)
RETURNS TABLE (
  cari_id UUID,
  cari_name TEXT,
  cari_balance NUMERIC,
  cari_currency TEXT,
  cari_type TEXT,
  owner_isletme_name TEXT,
  link_id UUID,
  is_owner BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Verify caller owns the viewer isletme
  IF NOT EXISTS (
    SELECT 1 FROM isletmeler
    WHERE id = p_viewer_isletme_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Isletme bulunamadi veya erisim yetkiniz yok';
  END IF;

  RETURN QUERY
  SELECT
    c.id AS cari_id,
    c.name::TEXT AS cari_name,
    c.balance AS cari_balance,
    c.currency::TEXT AS cari_currency,
    c.type::TEXT AS cari_type,
    i.name::TEXT AS owner_isletme_name,
    cl.id AS link_id,
    (c.isletme_id = p_viewer_isletme_id) AS is_owner
  FROM cariler c
  JOIN isletmeler i ON c.isletme_id = i.id
  LEFT JOIN cari_links cl ON (
    (cl.cari_a_id = c.id AND (cl.isletme_a_id = p_viewer_isletme_id OR cl.isletme_b_id = p_viewer_isletme_id))
    OR
    (cl.cari_b_id = c.id AND (cl.isletme_a_id = p_viewer_isletme_id OR cl.isletme_b_id = p_viewer_isletme_id))
  )
  WHERE c.id = p_cari_id
    AND (
      -- Own cari
      c.isletme_id = p_viewer_isletme_id
      OR
      -- Linked cari (viewer is on one side of the link)
      EXISTS (
        SELECT 1 FROM cari_links cl2
        WHERE (cl2.cari_a_id = c.id OR cl2.cari_b_id = c.id)
          AND (cl2.isletme_a_id = p_viewer_isletme_id OR cl2.isletme_b_id = p_viewer_isletme_id)
      )
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Realtime: enable realtime for cari_links
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE cari_links;
