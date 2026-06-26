-- İşlem audit log retention: 30 gün.
-- İşlem Geçmişi sayfası yalnızca bilgi amaçlıdır (silinen/düzeltilen işlemler geri
-- alınamaz). 30 günden eski kayıtlar yer kaplamasın diye günlük otomatik silinir.

-- Temizlik fonksiyonu. SECURITY DEFINER: pg_cron job'u tablo sahibi yetkisiyle çalıştırır.
CREATE OR REPLACE FUNCTION public.cleanup_old_islem_audit_log()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.islem_audit_log
  WHERE created_at < now() - interval '30 days';
$$;

-- Günlük zamanla (03:15 UTC). cron.schedule jobname'e göre upsert yapar → idempotent.
SELECT cron.schedule(
  'cleanup-old-islem-audit-log',
  '15 3 * * *',
  $$ SELECT public.cleanup_old_islem_audit_log(); $$
);

-- Mevcut 30 günden eski kayıtları hemen temizle.
SELECT public.cleanup_old_islem_audit_log();
