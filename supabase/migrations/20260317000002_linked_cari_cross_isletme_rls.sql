-- =============================================
-- MIGRATION: Linked cari cross-isletme RLS policies
--
-- Problem: When two isletmes are linked via cari_links,
-- they cannot read each other's isletme name or user profiles.
-- This causes:
--   1. useCariLinkStatus FK join to owner_isletme/viewer_isletme returns null
--   2. islemler FK join to creator profiles returns null for cross-isletme transactions
--
-- Fix: SECURITY DEFINER helper functions + permissive SELECT policies
-- Note: Direct JOIN to isletmeler inside an isletmeler policy causes infinite recursion.
--       SECURITY DEFINER functions bypass RLS, avoiding the recursion.
-- =============================================

-- 1. Helper: Check if isletme is linked to current user's isletme via cari_links
CREATE OR REPLACE FUNCTION is_linked_via_cari(p_isletme_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM cari_links cl
    JOIN isletmeler my ON my.user_id = auth.uid()
    WHERE (
      (cl.owner_isletme_id = my.id AND cl.viewer_isletme_id = p_isletme_id)
      OR
      (cl.viewer_isletme_id = my.id AND cl.owner_isletme_id = p_isletme_id)
    )
  );
$$;

-- 2. Helper: Check if a user belongs to an isletme linked to current user via cari_links
CREATE OR REPLACE FUNCTION is_linked_cari_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM cari_links cl
    JOIN isletmeler my ON my.user_id = auth.uid()
    JOIN isletmeler other ON other.user_id = p_user_id
    WHERE (
      (cl.owner_isletme_id = my.id AND cl.viewer_isletme_id = other.id)
      OR
      (cl.viewer_isletme_id = my.id AND cl.owner_isletme_id = other.id)
    )
  );
$$;

-- 3. isletmeler: Allow reading isletme if linked via cari_links
DROP POLICY IF EXISTS "Linked cari view isletmeler" ON isletmeler;
CREATE POLICY "Linked cari view isletmeler" ON isletmeler FOR SELECT TO authenticated
  USING (is_linked_via_cari(id));

-- 4. profiles: Allow reading profile if user belongs to a linked isletme
DROP POLICY IF EXISTS "Linked cari view profiles" ON profiles;
CREATE POLICY "Linked cari view profiles" ON profiles FOR SELECT TO authenticated
  USING (is_linked_cari_user(id));
