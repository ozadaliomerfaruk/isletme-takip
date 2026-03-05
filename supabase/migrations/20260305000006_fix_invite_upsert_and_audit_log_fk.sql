-- =============================================================================
-- 1. accept_isletme_invite: UPSERT ile yeniden davet edilen kullanıcıları destekle
-- 2. islem_audit_log.performed_by: ON DELETE SET NULL ile kullanıcı silinmesini engelleme
-- =============================================================================
-- SORUN 1: Kullanıcı "removed" statüsüne alındıktan sonra yeniden davet edildiğinde
-- UNIQUE(isletme_id, user_id) constraint'i nedeniyle INSERT başarısız oluyor.
-- ÇÖZÜM: INSERT yerine ON CONFLICT DO UPDATE kullan.
--
-- SORUN 2: islem_audit_log.performed_by NOT NULL REFERENCES auth.users(id) ile
-- varsayılan RESTRICT davranışı, kullanıcı hesabı silinmesini engelliyor.
-- ÇÖZÜM: NULL'a izin ver + ON DELETE SET NULL.
-- =============================================================================

-- ─────────────────────────────────────────────
-- 1. accept_isletme_invite RPC - UPSERT desteği
-- ─────────────────────────────────────────────
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

  -- Kullanıcı zaten bu işletmede aktif mi?
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

  -- Kullanıcıyı ekle veya yeniden aktifleştir (removed durumunda)
  INSERT INTO isletme_users (
    isletme_id, user_id, invite_id,
    role, role_label, permissions, status
  ) VALUES (
    v_invite.isletme_id, auth.uid(), v_invite.id,
    v_invite.role, v_invite.role_label, v_invite.permissions, 'active'
  )
  ON CONFLICT (isletme_id, user_id) DO UPDATE SET
    invite_id = EXCLUDED.invite_id,
    role = EXCLUDED.role,
    role_label = EXCLUDED.role_label,
    permissions = EXCLUDED.permissions,
    status = 'active',
    updated_at = NOW();

  RETURN v_invite.isletme_id;
END;
$$;

-- ─────────────────────────────────────────────
-- 2. islem_audit_log.performed_by FK düzeltmesi
-- ─────────────────────────────────────────────

-- NOT NULL kaldır
ALTER TABLE islem_audit_log ALTER COLUMN performed_by DROP NOT NULL;

-- Eski FK'yı kaldır (isim bilinmiyorsa olası isimleri dene)
ALTER TABLE islem_audit_log DROP CONSTRAINT IF EXISTS islem_audit_log_performed_by_fkey;

-- Yeni FK: ON DELETE SET NULL
ALTER TABLE islem_audit_log ADD CONSTRAINT islem_audit_log_performed_by_fkey
  FOREIGN KEY (performed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
