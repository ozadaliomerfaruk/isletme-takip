-- =============================================================================
-- EVDS (TCMB) RESMÎ ALTIN HATTI — spot-sync'ten altını çıkar + EVDS cron notu
--
-- NEDEN: gram altın artık EVDS resmî Kapalıçarşı (TP.MK.KUL.YTL) — geçmiş backfill'lendi
-- (edge fn: sync-ekonomik-gostergeler-evds). Günlük spot-sync (sync-ekonomik-gostergeler,
-- exchange_rates/MetalpriceAPI → cari ay) ARTIK altını YAZMAMALI, yoksa cari ayın Kapalıçarşı
-- değerini ~%3.4 primsiz spot'la ezip grafikte kırık oluşturur. Bu migration spot-sync'i
-- yalnız USD/EUR yazacak şekilde yeniden planlar (altın kolonuna dokunmaz).
-- =============================================================================

-- 1) spot-sync'i yeniden planla: SADECE usd/eur (gram_altin_try DROP). Idempotent.
DO $do$
BEGIN
  PERFORM cron.unschedule('sync-ekonomik-gostergeler');
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;

SELECT cron.schedule(
  'sync-ekonomik-gostergeler',
  '30 6 * * *',
  $cron$
    INSERT INTO ekonomik_gostergeler (ay, usd_try, eur_try, updated_at)
    SELECT date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul'))::date,
           (er.rates->>'USD')::numeric,
           (er.rates->>'EUR')::numeric,
           now()
    FROM exchange_rates er
    WHERE er.base_currency = 'TRY' AND (er.rates ? 'USD')
    LIMIT 1
    ON CONFLICT (ay) DO UPDATE
      SET usd_try = EXCLUDED.usd_try,
          eur_try = EXCLUDED.eur_try,
          updated_at = now();
  $cron$
);

-- 2) EVDS SÜREGELEN CRON — CANLI (9 Tem 2026 kuruldu, doğrulandı).
--    - Edge fn `sync-ekonomik-gostergeler-evds` deploy edildi (verify_jwt=true), TÜFE=TP.GENENDEKS.T1
--      (2003=100 süren kod) + gram altın=TP.MK.KUL.YTL çeker.
--    - Secret EVDS_API_KEY Dashboard>Edge Functions>Secrets'ta set edildi.
--    - Cron `sync-ekonomik-gostergeler-evds` @ '15 7 * * *' (UTC 07:15), net.http_post ile
--      fonksiyonu çağırır. AUTH = ANON key (verify_jwt'yi geçer, service_role gerekmez, daha az
--      yetkili; anahtar cron.job.command'da, git'te DEĞİL). z-report/service_role deseninden
--      bilinçli sapma — fn iç işini kendi SERVICE_ROLE_KEY env'iyle yapar, çağıranın yetkisi önemsiz.
--    - Yeniden kurulum/geri alma (SQL Editor): anon key = Settings>API>anon 'eyJ...':
--        SELECT cron.schedule('sync-ekonomik-gostergeler-evds','15 7 * * *',
--          $cmd$ SELECT net.http_post(
--            url := 'https://ulohxpkhesxozwnlnonb.supabase.co/functions/v1/sync-ekonomik-gostergeler-evds',
--            headers := jsonb_build_object('Authorization','Bearer <ANON_JWT>','Content-Type','application/json'),
--            body := '{}'::jsonb); $cmd$);
--        -- geri alma: SELECT cron.unschedule('sync-ekonomik-gostergeler-evds');
DO $$
BEGIN
  RAISE NOTICE 'spot-sync yeniden planlandi (yalniz USD/EUR). EVDS cron CANLI (anon-key auth).';
END $$;
