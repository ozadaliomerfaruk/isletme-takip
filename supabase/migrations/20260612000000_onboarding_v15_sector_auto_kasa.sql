-- =============================================================================
-- Onboarding v1.5 — sektör kolonu + otomatik Kasa + sektör kategorileri + ölçüm
--
-- DİKKAT: Bu migration HENÜZ üretime uygulanmadı (feature/onboarding-v15 dalı).
-- Akış onaylanınca uygulanacak. Geri alma script'i:
--   supabase/rollback/20260612000000_onboarding_v15_down.sql
--
-- Kararlar (11-12 Haziran):
-- * Yalnızca KASA otomatik açılır (Banka değil — bankası olmayan esnafta boş
--   banka hesabı liste gürültüsü; Banka "kurulumu bitir" kartına bırakıldı).
-- * Otomatik hesaplar is_auto_created=true ile işaretlenir ve aktivasyon
--   metriklerinde "hesap ekledi" SAYILMAZ (sahte %100 önlenir).
-- =============================================================================

-- 1) isletmeler.sector — onboarding'de seçilen sektör (NULL = seçilmedi / eski kullanıcı)
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sector text;

-- 2) hesaplar.is_auto_created — sistem tarafından otomatik açılan hesap işareti
ALTER TABLE hesaplar ADD COLUMN IF NOT EXISTS is_auto_created boolean NOT NULL DEFAULT false;

-- 3) Yeni işletme trigger'ı: varsayılan kategoriler (değişmedi) + OTOMATİK KASA
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

  -- Otomatik Kasa: kullanıcı "hesap ekleme" duvarına takılmadan ilk işlemini girebilsin.
  -- is_auto_created=true → aktivasyon metriklerinde "hesap ekledi" sayılmaz.
  INSERT INTO hesaplar (isletme_id, name, type, currency, is_auto_created)
  VALUES (NEW.id, 'Kasa', 'nakit', 'TRY', true);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4) Sektör seçilince sektöre özel kategoriler ekle (idempotent: aynı isim varsa atla)
CREATE OR REPLACE FUNCTION add_sector_kategoriler()
RETURNS TRIGGER AS $$
DECLARE
  k record;
BEGIN
  FOR k IN
    SELECT v.name, v.type, v.icon, v.color FROM (VALUES
      ('market_bakkal',  'Market Satışı',        'gelir', 'shopping-cart', '#10B981'),
      ('market_bakkal',  'Mal Alımı',            'gider', 'package',       '#EF4444'),
      ('kafe_restoran',  'Yemek/İçecek Satışı',  'gelir', 'shopping-cart', '#10B981'),
      ('kafe_restoran',  'Paket Servis',         'gelir', 'truck',         '#3B82F6'),
      ('kafe_restoran',  'Gıda Malzemesi',       'gider', 'package',       '#EF4444'),
      ('berber_kuafor',  'Hizmet Satışı',        'gelir', 'briefcase',     '#10B981'),
      ('berber_kuafor',  'Kozmetik/Malzeme',     'gider', 'package',       '#EF4444'),
      ('giyim_tekstil',  'Ürün Satışı',          'gelir', 'shopping-cart', '#10B981'),
      ('giyim_tekstil',  'Ürün/Kumaş Alımı',     'gider', 'package',       '#EF4444'),
      ('oto',            'Servis/İşçilik',       'gelir', 'briefcase',     '#10B981'),
      ('oto',            'Parça Satışı',         'gelir', 'shopping-cart', '#3B82F6'),
      ('oto',            'Yedek Parça Alımı',    'gider', 'package',       '#EF4444'),
      ('nalbur_insaat',  'Malzeme Satışı',       'gelir', 'shopping-cart', '#10B981'),
      ('nalbur_insaat',  'Proje/İşçilik',        'gelir', 'briefcase',     '#3B82F6'),
      ('nalbur_insaat',  'Malzeme Alımı',        'gider', 'package',       '#EF4444'),
      ('toptan_dagitim', 'Toptan Satış',         'gelir', 'truck',         '#10B981'),
      ('toptan_dagitim', 'Depo/Lojistik',        'gider', 'home',          '#EF4444'),
      ('toptan_dagitim', 'Yakıt',                'gider', 'minus-circle',  '#F59E0B')
    ) AS v(sector, name, type, icon, color)
    WHERE v.sector = NEW.sector
  LOOP
    INSERT INTO kategoriler (isletme_id, name, type, icon, color)
    SELECT NEW.id, k.name, k.type, k.icon, k.color
    WHERE NOT EXISTS (
      SELECT 1 FROM kategoriler ex
      WHERE ex.isletme_id = NEW.id AND lower(ex.name) = lower(k.name)
    );
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_isletme_sector_set ON isletmeler;
CREATE TRIGGER on_isletme_sector_set
  AFTER UPDATE OF sector ON isletmeler
  FOR EACH ROW
  WHEN (NEW.sector IS NOT NULL AND NEW.sector IS DISTINCT FROM OLD.sector)
  EXECUTE FUNCTION add_sector_kategoriler();

-- 5) Aktivasyon view'ları: otomatik açılan hesaplar "hesap ekledi" SAYILMAZ
CREATE OR REPLACE VIEW isletme_aktivasyon WITH (security_invoker = on) AS
SELECT
  i.id AS isletme_id, i.name AS isletme_adi, i.created_at::date AS kayit_tarihi,
  EXISTS (SELECT 1 FROM hesaplar h WHERE h.isletme_id = i.id AND NOT h.is_auto_created) AS hesap_var,
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
    EXISTS (SELECT 1 FROM hesaplar h WHERE h.isletme_id = i.id AND NOT h.is_auto_created) AS has_hesap,
    EXISTS (SELECT 1 FROM islemler x WHERE x.isletme_id = i.id) AS has_islem,
    (EXISTS (SELECT 1 FROM cariler c WHERE c.isletme_id = i.id) OR EXISTS (SELECT 1 FROM personel p WHERE p.isletme_id = i.id)) AS has_cari_personel
  FROM isletmeler i
  WHERE NOT i.is_internal
) t;

-- 6) onboarding_kohort_hunisi — kayıt HAFTASI bazlı aktivasyon (önce/sonra karşılaştırma)
--    "kayıt → 7 gün içinde ilk işlem" oranı; yeni onboarding'in etkisi hafta hafta izlenir.
--    olgun=false satırlarda 7 günlük pencere henüz dolmamıştır — oranı yorumlama.
CREATE OR REPLACE VIEW onboarding_kohort_hunisi WITH (security_invoker = on) AS
SELECT
  date_trunc('week', i.created_at)::date AS kayit_haftasi,
  COUNT(*) AS kayit,
  COUNT(*) FILTER (WHERE i.sector IS NOT NULL) AS sektor_secen,
  COUNT(*) FILTER (WHERE s.ilk_islem IS NOT NULL AND s.ilk_islem < i.created_at + interval '7 days') AS ilk7gun_islem_giren,
  ROUND(100.0 * COUNT(*) FILTER (WHERE s.ilk_islem IS NOT NULL AND s.ilk_islem < i.created_at + interval '7 days') / NULLIF(COUNT(*), 0), 1) AS ilk7gun_aktivasyon_orani,
  COUNT(*) FILTER (WHERE s.ilk_islem IS NOT NULL) AS herhangi_islem_giren,
  (MAX(i.created_at) + interval '7 days' <= now()) AS olgun
FROM isletmeler i
LEFT JOIN (SELECT isletme_id, MIN(created_at) AS ilk_islem FROM islemler GROUP BY isletme_id) s ON s.isletme_id = i.id
WHERE NOT i.is_internal
GROUP BY 1
ORDER BY 1 DESC;
