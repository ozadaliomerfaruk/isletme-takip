-- =============================================
-- MIGRATION 4/4: RPC FONKSİYONLARI + AUDIT LOG
-- Davet oluşturma/kabul etme + işlem geçmişi
-- =============================================
-- NOT: Bu migration zaten production'da manuel çalıştırıldı (2026-02-24)

-- 1. DAVET OLUŞTURMA RPC
CREATE OR REPLACE FUNCTION create_isletme_invite(
  p_isletme_id UUID,
  p_role TEXT,
  p_role_label TEXT DEFAULT NULL,
  p_permissions JSONB DEFAULT NULL,
  p_invited_email TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_default_permissions JSONB;
BEGIN
  -- Sadece owner
  IF NOT EXISTS (SELECT 1 FROM isletmeler WHERE id = p_isletme_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Sadece işletme sahibi davet oluşturabilir';
  END IF;

  -- Rate limit: saatte 10 davet
  IF (
    SELECT COUNT(*) FROM isletme_invites
    WHERE isletme_id = p_isletme_id
      AND created_at > NOW() - INTERVAL '1 hour'
      AND status = 'pending'
  ) >= 10 THEN
    RAISE EXCEPTION 'Çok fazla davet oluşturdunuz. Lütfen 1 saat sonra tekrar deneyin.';
  END IF;

  -- Varsayılan yetkiler
  IF p_permissions IS NULL AND p_role != 'custom' THEN
    SELECT default_permissions INTO v_default_permissions
    FROM role_templates WHERE name = p_role;
    p_permissions := COALESCE(v_default_permissions, '{}');
  END IF;

  -- Benzersiz kod oluştur
  LOOP
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    v_code := translate(v_code, '0O1IL', 'XYZAB');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM isletme_invites WHERE invite_code = v_code AND status = 'pending'
    );
  END LOOP;

  -- Davet kaydı
  INSERT INTO isletme_invites (
    isletme_id, invited_by, invite_code, invited_email,
    role, role_label, permissions
  ) VALUES (
    p_isletme_id, auth.uid(), v_code, p_invited_email,
    p_role, p_role_label, COALESCE(p_permissions, '{}')
  );

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION create_isletme_invite TO authenticated;

-- 2. DAVET KABUL ETME RPC
CREATE OR REPLACE FUNCTION accept_isletme_invite(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
BEGIN
  -- Daveti bul ve kilitle (race condition önleme)
  SELECT * INTO v_invite
  FROM isletme_invites
  WHERE invite_code = upper(p_code)
    AND status = 'pending'
    AND expires_at > NOW()
  FOR UPDATE;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Geçersiz veya süresi dolmuş davet kodu';
  END IF;

  -- Kullanıcı zaten bu işletmede mi?
  IF EXISTS (
    SELECT 1 FROM isletme_users
    WHERE isletme_id = v_invite.isletme_id
      AND user_id = auth.uid()
      AND status IN ('active', 'suspended')
  ) THEN
    RAISE EXCEPTION 'Bu işletmeye zaten erişiminiz var';
  END IF;

  -- Kullanıcı işletme sahibi mi?
  IF EXISTS (
    SELECT 1 FROM isletmeler
    WHERE id = v_invite.isletme_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Kendi işletmenize davet kabul edemezsiniz';
  END IF;

  -- Daveti güncelle
  UPDATE isletme_invites
  SET status = 'accepted',
      accepted_at = NOW(),
      accepted_by = auth.uid()
  WHERE id = v_invite.id;

  -- Kullanıcıyı ekle
  INSERT INTO isletme_users (
    isletme_id, user_id, invite_id,
    role, role_label, permissions
  ) VALUES (
    v_invite.isletme_id, auth.uid(), v_invite.id,
    v_invite.role, v_invite.role_label, v_invite.permissions
  );

  RETURN v_invite.isletme_id;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_isletme_invite TO authenticated;

-- 3. AUDIT LOG TABLOSU
CREATE TABLE IF NOT EXISTS islem_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  islem_id UUID,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_isletme ON islem_audit_log(isletme_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON islem_audit_log(isletme_id, action) WHERE action = 'delete';

ALTER TABLE islem_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can view audit log" ON islem_audit_log;
CREATE POLICY "Owner can view audit log" ON islem_audit_log FOR SELECT
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

-- Düzenlenen işlemler için index
CREATE INDEX IF NOT EXISTS idx_islemler_edited ON islemler(isletme_id, updated_at)
  WHERE updated_by IS NOT NULL AND updated_by != created_by;

-- 4. AUDIT LOG TRİGGER'LARI
CREATE OR REPLACE FUNCTION log_islem_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO islem_audit_log (isletme_id, islem_id, action, performed_by, old_data)
  VALUES (OLD.isletme_id, OLD.id, 'delete', auth.uid(), to_jsonb(OLD));
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION log_islem_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO islem_audit_log (isletme_id, islem_id, action, performed_by, old_data, new_data)
  VALUES (OLD.isletme_id, OLD.id, 'update', auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_islem_audit_delete ON islemler;
CREATE TRIGGER trg_islem_audit_delete
  BEFORE DELETE ON islemler
  FOR EACH ROW EXECUTE FUNCTION log_islem_delete();

DROP TRIGGER IF EXISTS trg_islem_audit_update ON islemler;
CREATE TRIGGER trg_islem_audit_update
  BEFORE UPDATE ON islemler
  FOR EACH ROW EXECUTE FUNCTION log_islem_update();
