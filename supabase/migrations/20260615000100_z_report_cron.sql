-- =============================================================================
-- send-z-report cron'u: her akşam TR 23:30 (UTC 20:30) gün sonu Z raporu push'u
-- (Esnafın dükkanı ~23:00 kapanıyor; 23:30 günün tamamını yakalar. 23:30 gece
--  yarısından önce olduğu için "bugün" TR tarihi doğru kalır.)
--
-- !!! BU MIGRATION VARSAYILAN OLARAK UYGULANMAZ — DIŞA DÖNÜK (658 kullanıcıya
--     bildirim gönderir). Yalnızca aşağıdaki TEST + ONAY adımlarından SONRA uygula.
--
-- ETKİNLEŞTİRME SIRASI:
--   1) Edge function deploy: send-z-report  (deploy tek başına bir şey GÖNDERMEZ;
--      yalnızca çağrılınca çalışır).
--   2) TEST: function'ı SADECE kendi hesabına çağır:
--        POST .../functions/v1/send-z-report   body: {"test_user_id":"<senin-user-id>"}
--      Telefonuna tek bildirim gelir; metni/rakamı doğrula. (Önce {"dry_run":true}
--      ile hiç göndermeden örnek metni de görebilirsin.)
--   3) Onaylanınca: service-role anahtarını GUC olarak ayarla (cron auth'u için):
--        ALTER DATABASE postgres SET app.settings.service_role_key = '<SERVICE_ROLE_KEY>';
--      NOT: Bu GUC şu an HİÇ set değil; bu yüzden delete-scheduled-accounts-daily
--      cron'unun auth'u da muhtemelen kırık — bu adım onu da onarır. (Sır git'e
--      girmez; yalnızca DB config'inde tutulur.)
--   4) Bu migration'ı uygula (cron'u planlar). Aynı jobname ile tekrar çağrı job'u
--      GÜNCELLER (mükerrer yaratmaz) -> idempotent.
--
-- GERİ ALMA:  SELECT cron.unschedule('send-z-report-evening');
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron yok, cron planlama atlandi';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'send-z-report-evening',
    '30 20 * * *',  -- UTC 20:30 = TR 23:30 (TR sabit UTC+3)
    $cmd$
    SELECT net.http_post(
      url := 'https://ulohxpkhesxozwnlnonb.supabase.co/functions/v1/send-z-report',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $cmd$
  );
END $$;
