-- =============================================================================
-- Onboarding V2 GERİ ALMA (sade akışa dönüş) — KULLANICI VERİSİNE DOKUNMAZ
--
-- Onboarding V2 (anket + adaptif modüller) kaldırıldı; sade akışa dönüldü
-- (sektör → hesap/cari/personel oluştur → kutlama). Bu migration, V2 için
-- eklenen DB nesnelerini geri alır:
--   1) 4 funnel view'ı düşür (yalnızca rapor görünümü — VERİ YOK).
--   2) add_sector_kategoriler'i v15 haline döndür (eczane/serbest_meslek çıkar).
--
-- KORUNUR (silinmez):
--   * isletmeler.onboarding_prefs kolonu — boş/atıl bırakılır (içindeki tek şey
--     test sırasındaki modül tercihleridir; çekirdek veri değil). Veri kaybı
--     olmasın diye DROP EDİLMEZ.
--   * Daha önce eczane/serbest_meslek seçilip oluşmuş kategori satırları (varsa)
--     KULLANICI VERİSİDİR — silinmez; sadece fonksiyon ileride eklemeyecek.
--   * Acil bug fix (notify_linked_users_on_islem_insert) — onboarding'le alakasız, kalır.
-- =============================================================================

-- 1) Funnel view'larını düşür (veri yok)
DROP VIEW IF EXISTS onboarding_funnel;
DROP VIEW IF EXISTS onboarding_skip_oranlari;
DROP VIEW IF EXISTS onboarding_cevap_dagilimi;
DROP VIEW IF EXISTS onboarding_aktivasyon;

-- 2) add_sector_kategoriler → v15 hali (eczane/serbest_meslek satırları olmadan)
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
