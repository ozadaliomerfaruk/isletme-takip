-- =============================================================================
-- FIX: Multi-User RLS Issues
-- =============================================================================
-- 1. Allow shared users to leave (update own status to 'removed')
-- 2. Granular policies for nakit_avanslar (replace FOR ALL)
-- 3. Granular policies for ileri_tarihli_islemler (replace FOR ALL)
-- 4. Granular policies for urun_hareketler (replace FOR ALL)
-- 5. Fix invite_code uniqueness loop (check all statuses, not just pending)
-- =============================================================================

-- ─────────────────────────────────────────────
-- 1. Allow shared users to leave a business
-- ─────────────────────────────────────────────
-- Currently only the owner can UPDATE isletme_users (policy: "Owner update isletme users").
-- A shared user trying to leave (set own status = 'removed') gets blocked by RLS.
-- This policy lets a user set ONLY their own row to 'removed'.

DROP POLICY IF EXISTS "User can leave isletme" ON isletme_users;
CREATE POLICY "User can leave isletme" ON isletme_users
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND status = 'active'
  )
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'removed'
  );

-- ─────────────────────────────────────────────
-- 2. Granular policies for nakit_avanslar
-- ─────────────────────────────────────────────
-- Replace the overly permissive FOR ALL policy with separate SELECT/INSERT/UPDATE/DELETE.

DROP POLICY IF EXISTS "Shared manage nakit_avanslar" ON nakit_avanslar;

CREATE POLICY "Shared select nakit_avanslar" ON nakit_avanslar FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = nakit_avanslar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'nakit_avans')::boolean, false)
  ));

CREATE POLICY "Shared insert nakit_avanslar" ON nakit_avanslar FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = nakit_avanslar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'actions'->'nakit_avans'->>'can_create')::boolean, false)
  ));

CREATE POLICY "Shared update nakit_avanslar" ON nakit_avanslar FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = nakit_avanslar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'nakit_avans'->>'can_update_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'nakit_avans'->>'can_update_own')::boolean, false) AND nakit_avanslar.created_by = auth.uid()))
  ));

CREATE POLICY "Shared delete nakit_avanslar" ON nakit_avanslar FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = nakit_avanslar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'nakit_avans'->>'can_delete_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'nakit_avans'->>'can_delete_own')::boolean, false) AND nakit_avanslar.created_by = auth.uid()))
  ));

-- ─────────────────────────────────────────────
-- 3. Granular policies for ileri_tarihli_islemler
-- ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Shared manage ileri_tarihli" ON ileri_tarihli_islemler;

CREATE POLICY "Shared select ileri_tarihli" ON ileri_tarihli_islemler FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = ileri_tarihli_islemler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'ileri_tarihli')::boolean, false)
  ));

CREATE POLICY "Shared insert ileri_tarihli" ON ileri_tarihli_islemler FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = ileri_tarihli_islemler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'actions'->'ileri_tarihli'->>'can_create')::boolean, false)
  ));

CREATE POLICY "Shared update ileri_tarihli" ON ileri_tarihli_islemler FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = ileri_tarihli_islemler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'ileri_tarihli'->>'can_update_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'ileri_tarihli'->>'can_update_own')::boolean, false) AND ileri_tarihli_islemler.created_by = auth.uid()))
  ));

CREATE POLICY "Shared delete ileri_tarihli" ON ileri_tarihli_islemler FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = ileri_tarihli_islemler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'ileri_tarihli'->>'can_delete_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'ileri_tarihli'->>'can_delete_own')::boolean, false) AND ileri_tarihli_islemler.created_by = auth.uid()))
  ));

-- ─────────────────────────────────────────────
-- 4. Granular policies for urun_hareketler
-- ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Shared manage urun_hareketler" ON urun_hareketler;

CREATE POLICY "Shared select urun_hareketler" ON urun_hareketler FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = urun_hareketler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'urunler')::boolean, false)
  ));

CREATE POLICY "Shared insert urun_hareketler" ON urun_hareketler FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = urun_hareketler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'actions'->'urunler'->>'can_create')::boolean, false)
  ));

CREATE POLICY "Shared update urun_hareketler" ON urun_hareketler FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = urun_hareketler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'urunler'->>'can_update_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'urunler'->>'can_update_own')::boolean, false) AND urun_hareketler.created_by = auth.uid()))
  ));

CREATE POLICY "Shared delete urun_hareketler" ON urun_hareketler FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = urun_hareketler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'urunler'->>'can_delete_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'urunler'->>'can_delete_own')::boolean, false) AND urun_hareketler.created_by = auth.uid()))
  ));

-- ─────────────────────────────────────────────
-- 5. Fix invite_code uniqueness in create_isletme_invite RPC
-- ─────────────────────────────────────────────
-- The loop previously only checked status='pending', but invite_code has a UNIQUE constraint
-- on ALL rows. Fix: make the UNIQUE constraint partial (only pending invites need unique codes)
-- so expired/accepted codes can reuse the same value.

ALTER TABLE isletme_invites DROP CONSTRAINT IF EXISTS isletme_invites_invite_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_isletme_invites_unique_code_pending
  ON isletme_invites(invite_code) WHERE status = 'pending';
