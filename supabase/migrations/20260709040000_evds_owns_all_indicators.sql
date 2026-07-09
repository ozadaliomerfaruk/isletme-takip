-- EVDS artık 4 göstergenin de TEK kaynağı → spot-sync (MetalpriceAPI/exchange_rates) cron'u EMEKLİ.
--
-- Edge fn sync-ekonomik-gostergeler-evds artık USD/EUR'yu da çekiyor (TP.DK.USD.S.YTL /
-- TP.DK.EUR.S.YTL, döviz satış) — gram altın (TP.MK.KUL.YTL) + TÜFE (TP.GENENDEKS.T1) ile birlikte.
-- Böylece net-varlık raporunun reel/dolar/euro/altın göstergelerinin HEPSİ TCMB/EVDS kaynaklı.
-- USD/EUR geçmişi execute_sql ile backfill'lendi (56 ay); frontend cari-ay dahil tablodan okur
-- (canlı kur değil) → kaynak-kopukluğu yok.
--
-- sync-ekonomik-gostergeler (exchange_rates → ekonomik_gostergeler usd/eur) artık GEREKSİZ:
-- kaldırılır. (exchange_rates + fetch-exchange-rates uygulamanın CANLI kur gösterimi için AYNEN
-- durur; yalnız net-varlık'a besleyen spot-sync köprüsü kalkar.)
--
-- EVDS cron'u (sync-ekonomik-gostergeler-evds) CANLI kalır — bkz 20260709020000/030000.

DO $do$
BEGIN
  PERFORM cron.unschedule('sync-ekonomik-gostergeler');
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;

DO $$
BEGIN
  RAISE NOTICE 'spot-sync (sync-ekonomik-gostergeler) emekli edildi; EVDS 4 gostergenin tek kaynagi.';
END $$;
