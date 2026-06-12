-- =============================================================================
-- GERİ ALMA: 20260612000000_onboarding_v15_sector_auto_kasa.sql
-- Onboarding v1.5 beğenilmezse bu script eski duruma döndürür.
-- Not: Otomatik açılmış Kasa hesapları ve sektör kategorileri veri olarak kalır
-- (zararsız); yalnızca mekanizma ve şema geri alınır.
-- =============================================================================

-- 6) Kohort view'ını kaldır
DROP VIEW IF EXISTS onboarding_kohort_hunisi;

-- 5) Aktivasyon view'larını ORİJİNAL (20260604010000) haline döndür
CREATE OR REPLACE VIEW isletme_aktivasyon WITH (security_invoker = on) AS
SELECT
  i.id AS isletme_id, i.name AS isletme_adi, i.created_at::date AS kayit_tarihi,
  EXISTS (SELECT 1 FROM hesaplar h WHERE h.isletme_id = i.id) AS hesap_var,
  COALESCE(s.islem_sayisi, 0) AS islem_sayisi, s.ilk_islem::date AS ilk_islem_tarihi,
  (s.ilk_islem::date - i.created_at::date) AS ilk_islem_gun_farki
FROM isletmeler i
LEFT JOIN (SELECT isletme_id, COUNT(*) AS islem_sayisi, MIN(created_at) AS ilk_islem FROM islemler GROUP BY isletme_id) s ON s.isletme_id = i.id
WHERE NOT i.is_internal
ORDER BY i.created_at DESC;

CREATE OR REPLACE VIEW aktivasyon_hunisi WITH (security_invoker = on) AS
SELECT
  COUNT(*) AS toplam_isletme,
  COUNT(*) FILTER (WHERE has_hesap) AS hesap_ekleyen,
  COUNT(*) FILTER (WHERE has_islem) AS ilk_islem_giren,
  COUNT(*) FILTER (WHERE has_cari_personel) AS cari_personel_ekleyen,
  ROUND(100.0 * COUNT(*) FILTER (WHERE has_hesap) / NULLIF(COUNT(*), 0), 1) AS hesap_orani,
  ROUND(100.0 * COUNT(*) FILTER (WHERE has_islem) / NULLIF(COUNT(*), 0), 1) AS islem_orani,
  ROUND(100.0 * COUNT(*) FILTER (WHERE has_cari_personel) / NULLIF(COUNT(*), 0), 1) AS cari_personel_orani
FROM (
  SELECT i.id,
    EXISTS (SELECT 1 FROM hesaplar h WHERE h.isletme_id = i.id) AS has_hesap,
    EXISTS (SELECT 1 FROM islemler x WHERE x.isletme_id = i.id) AS has_islem,
    (EXISTS (SELECT 1 FROM cariler c WHERE c.isletme_id = i.id) OR EXISTS (SELECT 1 FROM personel p WHERE p.isletme_id = i.id)) AS has_cari_personel
  FROM isletmeler i
  WHERE NOT i.is_internal
) t;

-- 4) Sektör trigger'ını ve fonksiyonunu kaldır
DROP TRIGGER IF EXISTS on_isletme_sector_set ON isletmeler;
DROP FUNCTION IF EXISTS add_sector_kategoriler();

-- 3) create_default_kategoriler'i ORİJİNAL (20260101130000) haline döndür (Kasa eklemesi çıkar)
CREATE OR REPLACE FUNCTION create_default_kategoriler()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO kategoriler (isletme_id, name, type, icon, color) VALUES
    (NEW.id, 'Satış', 'gelir', 'shopping-cart', '#10B981'),
    (NEW.id, 'Hizmet', 'gelir', 'briefcase', '#3B82F6'),
    (NEW.id, 'Diğer Gelir', 'gelir', 'plus-circle', '#8B5CF6');

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

-- 2) ve 1) Kolonları kaldır
ALTER TABLE hesaplar DROP COLUMN IF EXISTS is_auto_created;
ALTER TABLE isletmeler DROP COLUMN IF EXISTS sector;
