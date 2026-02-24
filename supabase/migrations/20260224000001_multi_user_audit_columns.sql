-- =============================================
-- MIGRATION 2/4: CREATED_BY/UPDATED_BY + AUDIT TRIGGER
-- Güvenli: DEFAULT NULL, mevcut satırlar etkilenmez
-- =============================================
-- NOT: Bu migration zaten production'da manuel çalıştırıldı (2026-02-24)

-- 1. KOLON EKLEME
ALTER TABLE islemler ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE islemler ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE hesaplar ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE hesaplar ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE cariler ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE cariler ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE personel ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE personel ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE kategoriler ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE kategoriler ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE cekler ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE cekler ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE ileri_tarihli_islemler ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE ileri_tarihli_islemler ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE nakit_avanslar ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE nakit_avanslar ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE urunler ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE urunler ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE urun_hareketler ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE urun_hareketler ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- 2. INDEXLER
CREATE INDEX IF NOT EXISTS idx_islemler_created_by ON islemler(created_by);
CREATE INDEX IF NOT EXISTS idx_cariler_created_by ON cariler(created_by);
CREATE INDEX IF NOT EXISTS idx_personel_created_by ON personel(created_by);

-- 3. GEÇMİŞ KAYITLARI SAHİBE ATA
UPDATE islemler SET created_by = (SELECT user_id FROM isletmeler WHERE id = islemler.isletme_id) WHERE created_by IS NULL;
UPDATE hesaplar SET created_by = (SELECT user_id FROM isletmeler WHERE id = hesaplar.isletme_id) WHERE created_by IS NULL;
UPDATE cariler SET created_by = (SELECT user_id FROM isletmeler WHERE id = cariler.isletme_id) WHERE created_by IS NULL;
UPDATE personel SET created_by = (SELECT user_id FROM isletmeler WHERE id = personel.isletme_id) WHERE created_by IS NULL;
UPDATE kategoriler SET created_by = (SELECT user_id FROM isletmeler WHERE id = kategoriler.isletme_id) WHERE created_by IS NULL;
UPDATE cekler SET created_by = (SELECT user_id FROM isletmeler WHERE id = cekler.isletme_id) WHERE created_by IS NULL;
UPDATE ileri_tarihli_islemler SET created_by = (SELECT user_id FROM isletmeler WHERE id = ileri_tarihli_islemler.isletme_id) WHERE created_by IS NULL;
UPDATE nakit_avanslar SET created_by = (SELECT user_id FROM isletmeler WHERE id = nakit_avanslar.isletme_id) WHERE created_by IS NULL;
UPDATE urunler SET created_by = (SELECT user_id FROM isletmeler WHERE id = urunler.isletme_id) WHERE created_by IS NULL;
UPDATE urun_hareketler SET created_by = (SELECT user_id FROM isletmeler WHERE id = urun_hareketler.isletme_id) WHERE created_by IS NULL;

UPDATE islemler SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE hesaplar SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE cariler SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE personel SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE kategoriler SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE cekler SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE ileri_tarihli_islemler SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE nakit_avanslar SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE urunler SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE urun_hareketler SET updated_by = created_by WHERE updated_by IS NULL;

-- 4. AUDIT TRIGGER
CREATE OR REPLACE FUNCTION set_audit_fields() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(auth.uid(), NEW.created_by);
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by := COALESCE(auth.uid(), OLD.updated_by);
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_audit_islemler ON islemler;
CREATE TRIGGER set_audit_islemler BEFORE INSERT OR UPDATE ON islemler FOR EACH ROW EXECUTE FUNCTION set_audit_fields();
DROP TRIGGER IF EXISTS set_audit_hesaplar ON hesaplar;
CREATE TRIGGER set_audit_hesaplar BEFORE INSERT OR UPDATE ON hesaplar FOR EACH ROW EXECUTE FUNCTION set_audit_fields();
DROP TRIGGER IF EXISTS set_audit_cariler ON cariler;
CREATE TRIGGER set_audit_cariler BEFORE INSERT OR UPDATE ON cariler FOR EACH ROW EXECUTE FUNCTION set_audit_fields();
DROP TRIGGER IF EXISTS set_audit_personel ON personel;
CREATE TRIGGER set_audit_personel BEFORE INSERT OR UPDATE ON personel FOR EACH ROW EXECUTE FUNCTION set_audit_fields();
DROP TRIGGER IF EXISTS set_audit_kategoriler ON kategoriler;
CREATE TRIGGER set_audit_kategoriler BEFORE INSERT OR UPDATE ON kategoriler FOR EACH ROW EXECUTE FUNCTION set_audit_fields();
DROP TRIGGER IF EXISTS set_audit_cekler ON cekler;
CREATE TRIGGER set_audit_cekler BEFORE INSERT OR UPDATE ON cekler FOR EACH ROW EXECUTE FUNCTION set_audit_fields();
DROP TRIGGER IF EXISTS set_audit_ileri_tarihli ON ileri_tarihli_islemler;
CREATE TRIGGER set_audit_ileri_tarihli BEFORE INSERT OR UPDATE ON ileri_tarihli_islemler FOR EACH ROW EXECUTE FUNCTION set_audit_fields();
DROP TRIGGER IF EXISTS set_audit_nakit_avanslar ON nakit_avanslar;
CREATE TRIGGER set_audit_nakit_avanslar BEFORE INSERT OR UPDATE ON nakit_avanslar FOR EACH ROW EXECUTE FUNCTION set_audit_fields();
DROP TRIGGER IF EXISTS set_audit_urunler ON urunler;
CREATE TRIGGER set_audit_urunler BEFORE INSERT OR UPDATE ON urunler FOR EACH ROW EXECUTE FUNCTION set_audit_fields();
DROP TRIGGER IF EXISTS set_audit_urun_hareketler ON urun_hareketler;
CREATE TRIGGER set_audit_urun_hareketler BEFORE INSERT OR UPDATE ON urun_hareketler FOR EACH ROW EXECUTE FUNCTION set_audit_fields();
