-- =============================================================================
-- process-scheduled-transactions cron'unu Türkiye 08:00 (UTC 05:00) yap
-- =============================================================================
-- Önceki ayar '5 21 * * *' = UTC 21:05 = TR 00:05 idi; hatırlatma bildirimleri gece
-- yarısı gidiyordu. Kullanıcı isteği: bildirimler iş başı saati TR 08:00'de gitsin.
-- TR = UTC+3 (sabit, yaz/kış saati yok) olduğundan TR 08:00 = UTC 05:00 -> '0 5 * * *'.
--
-- NOT: Bu cron başlangıçta Supabase Dashboard üzerinden oluşturulmuştu (migration'da
-- tanımlı değildi); bu migration onu sürüm kontrolüne alır. cron.schedule aynı jobname
-- ile çağrılınca mevcut job'u GÜNCELLER (yeni job yaratmaz) -> idempotent.
--
-- Authorization: canlı job, dashboard'da set edilmiş service-role JWT kullanıyor. Sırrı
-- git'e sızdırmamak için burada current_setting('app.settings.service_role_key') kullanılır
-- (delete-scheduled-accounts-daily ile aynı desen). Eğer bu GUC set değilse canlıdaki
-- mevcut (dashboard) komut korunur; bu migration'ı yalnızca GUC mevcutsa uygula.
-- =============================================================================

-- GÜVENLİ YENİDEN PLANLAMA: Canlı cron ZATEN doğru ayarlandı (0 5 * * *, dashboard
-- komutuyla, gömülü service-role JWT ile). Bu migration yalnızca, var olan job'un
-- KOMUTUNU değiştirmeden yalnızca SCHEDULE'ını '0 5 * * *' yapar. Böylece komuttaki
-- çalışan Authorization (JWT) korunur; bozma riski olmaz. Yalnızca dakika/saat sürüm
-- kontrolünde belgelenir.
DO $$
DECLARE
  v_cmd text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron yok, cron yeniden planlama atlandı';
    RETURN;
  END IF;

  -- Mevcut job'un komutunu oku; yoksa hiçbir şey yapma (dashboard'da yönetiliyor olabilir)
  SELECT command INTO v_cmd
  FROM cron.job
  WHERE jobname = 'process-scheduled-transactions'
  LIMIT 1;

  IF v_cmd IS NULL THEN
    RAISE NOTICE 'process-scheduled-transactions job bulunamadı, atlandı (dashboard''da yönetiliyor olabilir)';
    RETURN;
  END IF;

  -- Aynı komutu koru, yalnızca schedule'ı TR 08:00 (UTC 05:00) yap
  PERFORM cron.schedule('process-scheduled-transactions', '0 5 * * *', v_cmd);
END $$;
