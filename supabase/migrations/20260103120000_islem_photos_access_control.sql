 -- Upload policy
  CREATE POLICY "Users can upload own islem photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'islem-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM isletmeler WHERE user_id = auth.uid()
    )
  );

  -- View policy
  CREATE POLICY "Users can view own islem photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'islem-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM isletmeler WHERE user_id = auth.uid()
    )
  );

  -- Delete policy
  CREATE POLICY "Users can delete own islem photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'islem-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM isletmeler WHERE user_id = auth.uid()
    )
  );