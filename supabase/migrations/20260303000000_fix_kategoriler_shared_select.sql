-- =============================================================================
-- FIX: Shared users should always see categories (read-only)
-- =============================================================================
-- Previously, the SELECT policy required permissions->'modules'->>'kategoriler' = true.
-- This blocked operator and purchaser roles from seeing categories when creating
-- transactions. Categories should be visible to ALL active shared users.
-- Write/update/delete policies remain unchanged (require specific action permissions).
-- =============================================================================

DROP POLICY IF EXISTS "Shared select kategoriler" ON kategoriler;
CREATE POLICY "Shared select kategoriler" ON kategoriler FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = kategoriler.isletme_id
      AND iu.user_id = auth.uid()
      AND iu.status = 'active'
      AND (COALESCE((iu.permissions->'visibility'->>'can_see_passive')::boolean, false) OR kategoriler.is_active = true)
  ));
