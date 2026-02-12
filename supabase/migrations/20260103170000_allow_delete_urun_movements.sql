 -- urun_hareketler tablosu için DELETE politikası
  CREATE POLICY "Users can delete own urun_hareketler" ON urun_hareketler
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM urunler u
      JOIN isletmeler i ON u.isletme_id = i.id
      WHERE u.id = urun_hareketler.urun_id
      AND i.user_id = auth.uid()
    )
  );