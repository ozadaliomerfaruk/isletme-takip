-- Fix: Owner (A) B'nin linked cari üzerinde oluşturduğu işlemleri göremiyor
-- Mevcut view_linked_islemler sadece viewer'a (B) owner'ın (A) işlemlerini gösteriyor
-- Bu güncelleme ile owner da viewer'ın işlemlerini görebilecek

-- Eski policy'yi kaldır
DROP POLICY IF EXISTS "view_linked_islemler" ON islemler;

-- Genişletilmiş policy: hem owner hem viewer linked cari işlemlerini görebilir
CREATE POLICY "view_linked_islemler" ON islemler
  FOR SELECT
  TO authenticated
  USING (
    cari_id IS NOT NULL
    AND cari_id IN (
      SELECT cari_id FROM cari_links
      WHERE viewer_isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
         OR owner_isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    )
  );
