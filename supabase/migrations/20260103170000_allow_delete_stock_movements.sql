 -- stok_hareketler tablosu için DELETE politikası
  CREATE POLICY "Users can delete own stok_hareketler" ON stok_hareketler
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM urunler u
      JOIN isletmeler i ON u.isletme_id = i.id
      WHERE u.id = stok_hareketler.urun_id
      AND i.user_id = auth.uid()
    )
  );