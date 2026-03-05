-- =============================================================================
-- created_by / updated_by FK'ları: ON DELETE SET NULL
-- =============================================================================
-- Tüm tablolarda created_by ve updated_by, auth.users(id) ve profiles(id)'ye
-- REFERENCES ile bağlı ama ON DELETE davranışı belirtilmemiş (varsayılan RESTRICT).
-- Bu, paylaşılan kullanıcı kendi hesabını sildiğinde silmeyi ENGELLİYOR.
--
-- Doğru davranış: Kullanıcı silindiğinde işlemleri KORUMALI ama
-- created_by/updated_by alanları NULL olmalı.
-- =============================================================================

-- 1. islemler - auth.users FK'ları
ALTER TABLE islemler DROP CONSTRAINT IF EXISTS islemler_created_by_fkey;
ALTER TABLE islemler DROP CONSTRAINT IF EXISTS islemler_updated_by_fkey;
ALTER TABLE islemler ADD CONSTRAINT islemler_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE islemler ADD CONSTRAINT islemler_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- islemler - profiles FK (PostgREST join desteği)
ALTER TABLE islemler DROP CONSTRAINT IF EXISTS islemler_created_by_profiles_fk;
ALTER TABLE islemler ADD CONSTRAINT islemler_created_by_profiles_fk
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. hesaplar
ALTER TABLE hesaplar DROP CONSTRAINT IF EXISTS hesaplar_created_by_fkey;
ALTER TABLE hesaplar DROP CONSTRAINT IF EXISTS hesaplar_updated_by_fkey;
ALTER TABLE hesaplar ADD CONSTRAINT hesaplar_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE hesaplar ADD CONSTRAINT hesaplar_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. cariler
ALTER TABLE cariler DROP CONSTRAINT IF EXISTS cariler_created_by_fkey;
ALTER TABLE cariler DROP CONSTRAINT IF EXISTS cariler_updated_by_fkey;
ALTER TABLE cariler ADD CONSTRAINT cariler_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE cariler ADD CONSTRAINT cariler_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. personel
ALTER TABLE personel DROP CONSTRAINT IF EXISTS personel_created_by_fkey;
ALTER TABLE personel DROP CONSTRAINT IF EXISTS personel_updated_by_fkey;
ALTER TABLE personel ADD CONSTRAINT personel_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE personel ADD CONSTRAINT personel_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5. kategoriler
ALTER TABLE kategoriler DROP CONSTRAINT IF EXISTS kategoriler_created_by_fkey;
ALTER TABLE kategoriler DROP CONSTRAINT IF EXISTS kategoriler_updated_by_fkey;
ALTER TABLE kategoriler ADD CONSTRAINT kategoriler_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE kategoriler ADD CONSTRAINT kategoriler_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 6. cekler
ALTER TABLE cekler DROP CONSTRAINT IF EXISTS cekler_created_by_fkey;
ALTER TABLE cekler DROP CONSTRAINT IF EXISTS cekler_updated_by_fkey;
ALTER TABLE cekler ADD CONSTRAINT cekler_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE cekler ADD CONSTRAINT cekler_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 7. ileri_tarihli_islemler
ALTER TABLE ileri_tarihli_islemler DROP CONSTRAINT IF EXISTS ileri_tarihli_islemler_created_by_fkey;
ALTER TABLE ileri_tarihli_islemler DROP CONSTRAINT IF EXISTS ileri_tarihli_islemler_updated_by_fkey;
ALTER TABLE ileri_tarihli_islemler ADD CONSTRAINT ileri_tarihli_islemler_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ileri_tarihli_islemler ADD CONSTRAINT ileri_tarihli_islemler_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 8. nakit_avanslar
ALTER TABLE nakit_avanslar DROP CONSTRAINT IF EXISTS nakit_avanslar_created_by_fkey;
ALTER TABLE nakit_avanslar DROP CONSTRAINT IF EXISTS nakit_avanslar_updated_by_fkey;
ALTER TABLE nakit_avanslar ADD CONSTRAINT nakit_avanslar_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE nakit_avanslar ADD CONSTRAINT nakit_avanslar_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 9. urunler
ALTER TABLE urunler DROP CONSTRAINT IF EXISTS urunler_created_by_fkey;
ALTER TABLE urunler DROP CONSTRAINT IF EXISTS urunler_updated_by_fkey;
ALTER TABLE urunler ADD CONSTRAINT urunler_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE urunler ADD CONSTRAINT urunler_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 10. urun_hareketler
ALTER TABLE urun_hareketler DROP CONSTRAINT IF EXISTS urun_hareketler_created_by_fkey;
ALTER TABLE urun_hareketler DROP CONSTRAINT IF EXISTS urun_hareketler_updated_by_fkey;
ALTER TABLE urun_hareketler ADD CONSTRAINT urun_hareketler_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE urun_hareketler ADD CONSTRAINT urun_hareketler_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
