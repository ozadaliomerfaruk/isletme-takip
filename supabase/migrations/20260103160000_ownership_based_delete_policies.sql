 -- Mevcut politikaları kontrol et
  SELECT * FROM pg_policies WHERE tablename = 'urunler';
  SELECT * FROM pg_policies WHERE tablename = 'stok_hareketleri';