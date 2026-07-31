-- =============================================================================
-- CANLI GÖVDE SNAPSHOT'I — public.cleanup_old_islem_audit_log()
-- =============================================================================
-- ⚠️ BU DOSYA ÇALIŞTIRILMAK İÇİN DEĞİLDİR. Referans/denetim amaçlıdır.
--
-- Alındığı yer : ÜRETİM (proje ulohxpkhesxozwnlnonb), 26 Temmuz 2026
-- Kaynak       : pg_get_functiondef(oid)  — repo migration'ından DEĞİL
-- md5          : 638fc810853a0acbea7b106407ac1a1b
-- uzunluk      : 250 karakter
--
-- NEDEN CANLIDAN: repo ile üretim gövdeleri bu projede geçmişte ayrıştı.
-- ACL değişikliği uygulanmadan önce canlı md5'in hâlâ bu değer olduğu
-- doğrulanacak; farklıysa DURULACAK.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- GÖVDE (canlıdan birebir)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_old_islem_audit_log()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM public.islem_audit_log
  WHERE created_at < now() - interval '30 days';
$function$

-- ---------------------------------------------------------------------------
-- ACL — DEĞİŞİKLİK ÖNCESİ (canlı)
-- ---------------------------------------------------------------------------
--   {=X/postgres, postgres=X/postgres, anon=X/postgres,
--    authenticated=X/postgres, service_role=X/postgres}
--
--   "=X/postgres" -> PUBLIC'e EXECUTE. Ayrıca anon/authenticated'a AÇIK grant.
--   Bu yüzden REVOKE hem PUBLIC hem anon hem authenticated için gerekli.
--
-- ACL — HEDEF
-- ---------------------------------------------------------------------------
--   {postgres=X/postgres, service_role=X/postgres}
--
--   Kardeş cron fonksiyonlarıyla AYNI:
--     app_events_rollup_and_trim  -> {postgres=X, service_role=X}
--     usage_snapshot_al           -> {postgres=X, service_role=X}
--
-- ---------------------------------------------------------------------------
-- ÇAĞIRAN — doğrulama (26 Tem, salt-okunur)
-- ---------------------------------------------------------------------------
--   cron.job jobid 8 : "cleanup-old-islem-audit-log"
--                      schedule "15 3 * * *"
--                      username "postgres"
--                      command  " SELECT public.cleanup_old_islem_audit_log(); "
--                      -> veritabanı İÇİNDEN doğrudan çağrı. HTTP/service_role DEĞİL.
--                      -> postgres fonksiyon sahibi; grant'lardan BAĞIMSIZ çalışır.
--
--   src/                     : referans YOK
--   supabase/functions/      : referans YOK
--   repo geneli tek referans : supabase/migrations/20260627090000_cleanup_old_islem_audit_log.sql
--                              (tanım + cron kaydı)
--
--   -> Uygulama öncesi bu üç tarama TEKRARLANACAK.
-- =============================================================================
