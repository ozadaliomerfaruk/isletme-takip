-- Updated_at otomatik güncelleme fonksiyonu
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggerlari ekle
CREATE TRIGGER update_isletmeler_updated_at
  BEFORE UPDATE ON isletmeler
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_hesaplar_updated_at
  BEFORE UPDATE ON hesaplar
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_cariler_updated_at
  BEFORE UPDATE ON cariler
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_personel_updated_at
  BEFORE UPDATE ON personel
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_islemler_updated_at
  BEFORE UPDATE ON islemler
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
