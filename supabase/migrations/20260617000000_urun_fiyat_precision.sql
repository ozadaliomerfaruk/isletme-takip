-- =============================================================================
-- Ürün/birim fiyat hassasiyeti: numeric(15,2) -> numeric(15,4)
--
-- Sorun: alis_fiyati/satis_fiyati/birim_fiyat kolonları scale 2 olduğundan DB,
-- uygulamanın gönderdiği tam-hassasiyet birim fiyatı 2 ondalığa YUVARLIYORDU.
-- Sonuç: fişteki gerçek tutar (ör. 12,48) ürün satırlarından yeniden hesaplanınca
-- 12,45 gibi sapıyor → cari mutabakat / kredi kartı ekstresi / banka hareketi
-- uyuşmazlığı. (Bkz. ürün detayında 314,25 vs 314,21 tutarsızlığı.)
--
-- Çözüm: birim FİYAT kolonlarını scale 4'e çıkar (sub-cent birim fiyat saklanır).
-- - islemler.amount ve cari/hesap bakiyeleri PARA'dır, scale 2 KALIR (değişmez).
-- - urunler/urun_hareketler.miktar zaten scale 3 (değişmez).
-- - Mevcut değerler kayıpsız korunur (20.74 -> 20.7400).
-- - Tablolar küçük (urunler ~501, urun_hareketler ~791) → rewrite anında.
-- - Bağımlı fonksiyonlar (get_product_report/get_category_report/reapply) birim_fiyat
--   kullanır ama scale-2 cast/round yapmaz → otomatik daha hassas hesaplar.
-- - Uygulama birim fiyatı zaten parseFloat/parseCurrency ile tam-hassasiyet gönderir;
--   görüntü formatCurrency ile 2 ondalıkta kalır (sakla-tam / göster-2).
-- =============================================================================
ALTER TABLE public.urunler        ALTER COLUMN alis_fiyati  TYPE numeric(15,4);
ALTER TABLE public.urunler        ALTER COLUMN satis_fiyati TYPE numeric(15,4);
ALTER TABLE public.urun_hareketler ALTER COLUMN birim_fiyat TYPE numeric(15,4);
