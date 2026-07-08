-- GLOBAL EKONOMİK GÖSTERGE REFERANS TABLOSU (kiracıdan bağımsız).
--
-- NEDEN: Net-varlık trendini REEL göstermek için — nominal TRY'yi (a) enflasyona göre
-- "bugünün lirası"na, (b) USD/EUR'ya, (c) gram altına çevirmek. Repricing client'ta yapılır;
-- bu tablo yalnız aylık gösterge serilerini tutar.
--
-- Aylık zaman serisi: her ay = bir satır, PK = ayın ilk günü (date). exchange_rates'ten
-- FARKI: çok-satırlı (geçmiş saklanır). KULLANICI VERİSİ DEĞİLDİR → güvenlik/veri-kaybı
-- riski yok, additive-only; eski client'lar bu tabloyu sorgulamaz.
--
-- KAYNAKLAR: usd/eur/gram_altin → MetalpriceAPI (mevcut) + frankfurter (backfill, key'siz).
-- tufe → TÜİK/TCMB kamu verisi (statik seed; geçmiş sabittir). EVDS gerekmez.
-- Kolonlar NULL kalabilir (eksik-ay graceful davranışının temeli).

CREATE TABLE IF NOT EXISTS ekonomik_gostergeler (
  ay              DATE PRIMARY KEY,   -- ör. 2026-07-01 (ayın 1'i, ay anahtarı)
  usd_try         NUMERIC,            -- 1 USD = X TRY (ay son iş günü)
  eur_try         NUMERIC,            -- 1 EUR = X TRY
  gram_altin_try  NUMERIC,            -- 1 gram altın = X TRY
  tufe            NUMERIC,            -- TÜFE endeks (baz 2003=100); yalnız ORAN anlamlı
  source          TEXT NOT NULL DEFAULT 'metalpriceapi+frankfurter+tuik',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ekonomik_gostergeler_ay ON ekonomik_gostergeler (ay DESC);

ALTER TABLE ekonomik_gostergeler ENABLE ROW LEVEL SECURITY;

-- Herkes (authenticated) OKUR (kiracı-bağımsız referans veri):
DROP POLICY IF EXISTS "Authenticated users can read economic indicators" ON ekonomik_gostergeler;
CREATE POLICY "Authenticated users can read economic indicators"
  ON ekonomik_gostergeler FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE policy YOK → yalnız service_role (edge fn / seed) RLS'i bypass edip yazar.
