-- Günlük kullanım snapshot'ı: DB boyutu + en büyük tablolar + app_events büyümesi
-- her gün OTOMATİK kaydedilir (elle script çalıştırmaya gerek yok). Free planda
-- ilk dolacak metrik DB boyutu → trendi burada takip ederiz.
-- NOT: Egress bu tabloda YOK (Supabase ağ muhasebesi, SQL'den okunamaz) → panelden
-- veya Management API (PAT) ile ayrıca bakılır.
-- Additive + salt-ekleme (yeni tablo/fn/cron; hiçbir veri silinmez).

CREATE TABLE IF NOT EXISTS public.usage_gunluk (
  gun                date PRIMARY KEY,
  db_mb              numeric,
  app_events_raw     integer,   -- ham olay satırı (90 günde tavanlanır)
  app_events_ozet    integer,   -- kalıcı özet satırı
  en_buyuk_tablolar  jsonb,     -- [{tablo, mb}] top 8
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- İç tablo: RLS açık, client politikası yok → yalnız service-role / SQL editor.
ALTER TABLE public.usage_gunluk ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.usage_snapshot_al()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usage_gunluk (gun, db_mb, app_events_raw, app_events_ozet, en_buyuk_tablolar)
  SELECT
    (now() AT TIME ZONE 'UTC')::date,
    round(pg_database_size(current_database()) / 1024.0 / 1024.0, 1),
    (SELECT count(*) FROM public.app_events),
    (SELECT count(*) FROM public.app_events_gunluk_ozet),
    (SELECT jsonb_agg(t) FROM (
        SELECT c.relname AS tablo,
               round(pg_total_relation_size(c.oid) / 1024.0 / 1024.0, 1) AS mb
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 8
     ) t)
  ON CONFLICT (gun) DO UPDATE SET
    db_mb             = EXCLUDED.db_mb,
    app_events_raw    = EXCLUDED.app_events_raw,
    app_events_ozet   = EXCLUDED.app_events_ozet,
    en_buyuk_tablolar = EXCLUDED.en_buyuk_tablolar,
    created_at        = now();
END;
$$;

-- Bugünün satırını hemen al (baz çizgi).
SELECT public.usage_snapshot_al();

-- Günlük zamanla (03:35 UTC, rollup'tan hemen sonra). İsimle idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('usage_snapshot_gunluk');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'usage_snapshot_gunluk',
  '35 3 * * *',
  $cron$SELECT public.usage_snapshot_al()$cron$
);
