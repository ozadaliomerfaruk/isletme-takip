-- =============================================================================
-- İleri tarihli (scheduled) işlem tamamlama: çift kayıt (double-post) koruması
-- =============================================================================
-- SORUN: useCompleteIleriTarihliIslem, ileri tarihli bir işlemi gerçek 'islemler'
-- kaydına dönüştürürken atomik değildi. Çift dokunma, iki cihaz/oturum veya
-- çevrimdışı sonrası yeniden deneme durumunda aynı ileri tarihli satır birden
-- fazla kez kayda geçebilir ve bakiyeler çift sayılabilirdi.
--
-- ÇÖZÜM (veritabanı seviyesinde savunma derinliği):
--   1. islemler tablosuna kaynak ileri tarihli satıra bağlanan source_ileri_id
--      kolonu eklenir (nullable -> mevcut tüm satırlar etkilenmez).
--   2. Partial UNIQUE index ile bir ileri tarihli satıra EN FAZLA bir islem
--      kaydı bağlanabilir. NULL değerler (tüm normal işlemler) index dışıdır,
--      bu yüzden mevcut veri tamamen güvendedir.
--
-- Uygulama katmanındaki atomik "claim" (status pending/notified -> completed)
-- ile birlikte bu index, çift kaydı hem mantık hem de veritabanı seviyesinde
-- imkânsız hâle getirir.
-- =============================================================================

ALTER TABLE islemler
  ADD COLUMN IF NOT EXISTS source_ileri_id UUID
  REFERENCES ileri_tarihli_islemler(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS islemler_source_ileri_id_key
  ON islemler (source_ileri_id)
  WHERE source_ileri_id IS NOT NULL;

COMMENT ON COLUMN islemler.source_ileri_id IS
  'Bu islem bir ileri tarihli işlemin tamamlanmasıyla oluştuysa kaynak satırın id''si. Çift kayıt korumasi için kullanilir.';
