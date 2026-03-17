-- =============================================
-- LINKED CARI PHOTO ACCESS
-- Migration: storage_linked_cari_photo_access
-- Purpose: Allow viewers of shared caris to access
--          transaction photos from the owner's storage folder
-- =============================================

-- Viewer (B) needs to read photos stored under Owner (A)'s isletme_id folder
-- when the caris are linked via cari_links table.
-- Path format: {owner_isletme_id}/{islem_id}_{timestamp}.webp
--
-- We check that the storage object name matches an actual photo_path
-- in the islemler table for a linked cari, ensuring viewers can only
-- access photos they should be able to see.

CREATE POLICY "Viewers can view linked cari islem photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'islem-photos'
  AND name IN (
    SELECT i.photo_path
    FROM islemler i
    JOIN cari_links cl ON cl.cari_id = i.cari_id
    WHERE i.photo_path IS NOT NULL
      AND cl.viewer_isletme_id IN (
        SELECT id FROM isletmeler WHERE user_id = auth.uid()
      )
  )
);
