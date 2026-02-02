-- Yeni işletme oluşturulduğunda varsayılan kategorileri ekle
CREATE OR REPLACE FUNCTION create_default_kategoriler()
RETURNS TRIGGER AS $$
BEGIN
  -- Gelir kategorileri
  INSERT INTO kategoriler (isletme_id, name, type, icon, color) VALUES
    (NEW.id, 'Satış', 'gelir', 'shopping-cart', '#10B981'),
    (NEW.id, 'Hizmet', 'gelir', 'briefcase', '#3B82F6'),
    (NEW.id, 'Diğer Gelir', 'gelir', 'plus-circle', '#8B5CF6');
  
  -- Gider kategorileri
  INSERT INTO kategoriler (isletme_id, name, type, icon, color) VALUES
    (NEW.id, 'Malzeme', 'gider', 'package', '#EF4444'),
    (NEW.id, 'Personel', 'gider', 'users', '#F59E0B'),
    (NEW.id, 'Kira', 'gider', 'home', '#EC4899'),
    (NEW.id, 'Fatura', 'gider', 'file-text', '#6366F1'),
    (NEW.id, 'Ulaşım', 'gider', 'truck', '#14B8A6'),
    (NEW.id, 'Diğer Gider', 'gider', 'minus-circle', '#6B7280');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
CREATE TRIGGER on_isletme_created
  AFTER INSERT ON isletmeler
  FOR EACH ROW
  EXECUTE FUNCTION create_default_kategoriler();
