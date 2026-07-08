-- ONGOING: cari ayın USD/EUR/gram-altın göstergelerini exchange_rates'ten kopyala.
--
-- exchange_rates (tek satır, MetalpriceAPI ile GÜNLÜK güncellenir) zaten USD/EUR/XAU'yu
-- gram-TRY olarak tutuyor. Bu cron, her gün cari ayın satırını ekonomik_gostergeler'e yazar
-- → net-varlık reel/döviz/altın lensleri güncel kalır. SIFIR ek API çağrısı, SIFIR edge-fn
-- riski (canlı FX fonksiyonuna dokunmaz). TÜFE'ye dokunmaz (ayrı, statik/aylık).
-- NOT: net.http_post / secret YOK → git-güvenli, migration'a konabilir.

-- Idempotent: varsa önce kaldır.
DO $do$
BEGIN
  PERFORM cron.unschedule('sync-ekonomik-gostergeler');
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;

SELECT cron.schedule(
  'sync-ekonomik-gostergeler',
  '30 6 * * *',   -- her gün 06:30 UTC
  $cron$
    INSERT INTO ekonomik_gostergeler (ay, usd_try, eur_try, gram_altin_try, source, updated_at)
    SELECT date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul'))::date,
           (er.rates->>'USD')::numeric,
           (er.rates->>'EUR')::numeric,
           (er.rates->>'XAU')::numeric,
           'exchange_rates_sync',
           now()
    FROM exchange_rates er
    WHERE er.base_currency = 'TRY' AND (er.rates ? 'USD')
    LIMIT 1
    ON CONFLICT (ay) DO UPDATE
      SET usd_try = EXCLUDED.usd_try,
          eur_try = EXCLUDED.eur_try,
          gram_altin_try = EXCLUDED.gram_altin_try,
          updated_at = now();
  $cron$
);

-- Hemen bir kez çalıştır (cari ay altını dahil hemen dolsun).
INSERT INTO ekonomik_gostergeler (ay, usd_try, eur_try, gram_altin_try, source, updated_at)
SELECT date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul'))::date,
       (er.rates->>'USD')::numeric,
       (er.rates->>'EUR')::numeric,
       (er.rates->>'XAU')::numeric,
       'exchange_rates_sync',
       now()
FROM exchange_rates er
WHERE er.base_currency = 'TRY' AND (er.rates ? 'USD')
LIMIT 1
ON CONFLICT (ay) DO UPDATE
  SET usd_try = EXCLUDED.usd_try,
      eur_try = EXCLUDED.eur_try,
      gram_altin_try = EXCLUDED.gram_altin_try,
      updated_at = now();
