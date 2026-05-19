-- =============================================================================
-- FIX: Storage policies - Include shared users (isletme_users)
-- =============================================================================
-- Existing policies only check isletmeler.user_id (owner). Shared users added
-- via isletme_users cannot upload or view photos. This migration recreates all
-- 4 CRUD policies to also check isletme_users membership.
-- =============================================================================

DROP POLICY IF EXISTS "Users can view own islem photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own islem photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own islem photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own islem photos" ON storage.objects;

CREATE POLICY "Users can view own islem photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'islem-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM isletmeler WHERE user_id = auth.uid()
    UNION
    SELECT isletme_id::text FROM isletme_users WHERE user_id = auth.uid() AND status = 'active'
  )
);

CREATE POLICY "Users can upload own islem photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'islem-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM isletmeler WHERE user_id = auth.uid()
    UNION
    SELECT isletme_id::text FROM isletme_users WHERE user_id = auth.uid() AND status = 'active'
  )
);

CREATE POLICY "Users can update own islem photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'islem-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM isletmeler WHERE user_id = auth.uid()
    UNION
    SELECT isletme_id::text FROM isletme_users WHERE user_id = auth.uid() AND status = 'active'
  )
);

CREATE POLICY "Users can delete own islem photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'islem-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM isletmeler WHERE user_id = auth.uid()
    UNION
    SELECT isletme_id::text FROM isletme_users WHERE user_id = auth.uid() AND status = 'active'
  )
);
