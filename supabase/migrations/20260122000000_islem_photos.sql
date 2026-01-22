-- =============================================
-- ISLEMLER TABLOSUNA PHOTO ALANI EKLEME
-- Migration: islem_photos
-- Purpose: Add photo attachment capability to transactions
-- =============================================

-- Add photo_path column to islemler table
ALTER TABLE islemler ADD COLUMN IF NOT EXISTS photo_path TEXT DEFAULT NULL;

-- Index for finding transactions with photos (partial index for efficiency)
CREATE INDEX IF NOT EXISTS idx_islemler_photo ON islemler(isletme_id)
  WHERE photo_path IS NOT NULL;

-- =============================================
-- STORAGE RLS POLİCYLERİ
-- =============================================
-- Note: Bucket 'islem-photos' must be created via Supabase Dashboard:
-- - Name: islem-photos
-- - Public: false
-- - File size limit: 500KB
-- - Allowed MIME types: image/webp, image/jpeg, image/png

-- Policy: Users can upload photos to their own business folder
CREATE POLICY "Users can upload own islem photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'islem-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM isletmeler WHERE user_id = auth.uid()
  )
);

-- Policy: Users can view photos from their own business folder
CREATE POLICY "Users can view own islem photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'islem-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM isletmeler WHERE user_id = auth.uid()
  )
);

-- Policy: Users can delete photos from their own business folder
CREATE POLICY "Users can delete own islem photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'islem-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM isletmeler WHERE user_id = auth.uid()
  )
);

-- Policy: Users can update (replace) photos in their own business folder
CREATE POLICY "Users can update own islem photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'islem-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM isletmeler WHERE user_id = auth.uid()
  )
);

-- =============================================
-- DOCUMENTATION
-- =============================================
COMMENT ON COLUMN islemler.photo_path IS 'Storage path for transaction receipt/document photo (format: {isletme_id}/{islem_id}_{timestamp}.webp)';
