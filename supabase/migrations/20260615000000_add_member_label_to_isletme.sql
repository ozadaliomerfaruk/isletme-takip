-- =============================================================================
-- member_label: İşletme sahibinin paylaşılan kişiye verdiği "görünen ad".
-- Amaç: kullanıcı listesinde garip/anlamsız e-posta yerine tanınır bir isim
--       gösterebilmek (owner davet anında ya da sonradan düzenleyerek atar).
-- Güvenli/ek (additive): yalnızca yeni nullable kolon + accept RPC'sine kopyalama.
--   - Mevcut veriler değişmez (kolonlar NULL başlar).
--   - accept_isletme_invite gövdesi BİREBİR korunur; imza (p_code TEXT) aynıdır,
--     yalnızca member_label INSERT/ON CONFLICT'e eklenir.
-- =============================================================================

ALTER TABLE isletme_invites ADD COLUMN IF NOT EXISTS member_label TEXT;
ALTER TABLE isletme_users   ADD COLUMN IF NOT EXISTS member_label TEXT;

-- accept_isletme_invite: davetteki member_label'ı kabul eden kullanıcı satırına taşı.
CREATE OR REPLACE FUNCTION public.accept_isletme_invite(p_code TEXT)
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
    role, role_label, permissions, status, member_label
  ) VALUES (
    v_invite.isletme_id, auth.uid(), v_invite.id,
    v_invite.role, v_invite.role_label, v_invite.permissions, 'active', v_invite.member_label
  )
  ON CONFLICT (isletme_id, user_id) DO UPDATE SET
    invite_id = EXCLUDED.invite_id,
    role = EXCLUDED.role,
    role_label = EXCLUDED.role_label,
    permissions = EXCLUDED.permissions,
    status = 'active',
    member_label = EXCLUDED.member_label,
    updated_at = NOW();

  RETURN v_invite.isletme_id;
END;
$$;
