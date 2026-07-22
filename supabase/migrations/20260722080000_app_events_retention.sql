-- app_events retention: kalıcı günlük ÖZET + 90 günden eski ham veriyi buda.
-- Amaç: analytics tablosu (şu an ~22MB, en büyük 2. tablo) sonsuza dek şişmesin
-- ama TREND kaybolmasın. Özet forever kalır; ham veri 90 gün (detay/funnel için).
--
-- GÜVENLİK: additive. Bugün HİÇBİR ŞEY silinmez (en eski kayıt ~7 haftalık,
-- 90 günden eski = 0 satır). Geri-alınabilir: tabloyu drop + cron unschedule.
-- islem_audit_log'a DOKUNULMAZ (güvenlik izi, sayıya indirgenmez).

-- 1) Kalıcı günlük özet: gün × olay × platform × sürüm → adet
--    (jsonb/id yok → çok küçük; ~150 satır/gün, ham 45K/ay yerine)
CREATE TABLE IF NOT EXISTS public.app_events_gunluk_ozet (
  gun          date    NOT NULL,
  event_name   text    NOT NULL,
  platform     text    NOT NULL DEFAULT '?',
  app_version  text    NOT NULL DEFAULT '?',
  adet         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (gun, event_name, platform, app_version)
);

-- İç analitik tablosu: RLS açık, client politikası YOK → yalnız service-role /
-- SQL editor okur. Uygulama istemcisi erişemez (gereksiz egress/erişim olmaz).
ALTER TABLE public.app_events_gunluk_ozet ENABLE ROW LEVEL SECURITY;

-- 2) Rollup + trim fonksiyonu (idempotent)
CREATE OR REPLACE FUNCTION public.app_events_rollup_and_trim()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Son 3 günü yeniden hesapla (olaylar gerçek-zamanlı yazılır; 3 gün fazlasıyla
  -- yeter ve 90 günlük silme sınırıyla ÇAKIŞMAZ → undercount olmaz).
  INSERT INTO public.app_events_gunluk_ozet (gun, event_name, platform, app_version, adet)
  SELECT (created_at AT TIME ZONE 'UTC')::date,
         event_name,
         COALESCE(platform, '?'),
         COALESCE(app_version, '?'),
         count(*)
  FROM public.app_events
  WHERE created_at >= (now() - interval '3 days')
  GROUP BY 1, 2, 3, 4
  ON CONFLICT (gun, event_name, platform, app_version)
  DO UPDATE SET adet = EXCLUDED.adet;

  -- 90 günden eski ham veriyi sil (özete zaten yansımış durumda).
  DELETE FROM public.app_events WHERE created_at < now() - interval '90 days';
END;
$$;

-- 3) BACKFILL: mevcut TÜM geçmişi özete al (hepsi <90 gün → hiçbir şey kaybolmaz).
INSERT INTO public.app_events_gunluk_ozet (gun, event_name, platform, app_version, adet)
SELECT (created_at AT TIME ZONE 'UTC')::date,
       event_name,
       COALESCE(platform, '?'),
       COALESCE(app_version, '?'),
       count(*)
FROM public.app_events
GROUP BY 1, 2, 3, 4
ON CONFLICT (gun, event_name, platform, app_version)
DO UPDATE SET adet = EXCLUDED.adet;

-- 4) Günlük zamanla (03:30 UTC). İsimle idempotent: varsa önce kaldır.
DO $$
BEGIN
  PERFORM cron.unschedule('app_events_rollup_and_trim');
EXCEPTION WHEN OTHERS THEN NULL; -- yoksa sorun değil
END $$;

SELECT cron.schedule(
  'app_events_rollup_and_trim',
  '30 3 * * *',
  $cron$SELECT public.app_events_rollup_and_trim()$cron$
);
