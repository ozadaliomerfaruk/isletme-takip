-- Advisor taraması (22 Tem) güvenlik bulguları — yalnız ERİŞİM sıkılaştırma, veri değişmez.
--
-- 1) islem_tahsis_yedek_20260722 (tahsis işinden kalan YEDEK tablo) public + RLS KAPALI
--    → ERROR (dışarıya açık). RLS aç: politika yok = client erişimi kapalı. Yedek veri
--    korunur, uygulama bu tabloyu okumaz, service-role (backup) RLS'i baypaslar.
--
-- 2) Bu oturumda eklenen 2 SECURITY DEFINER fonksiyonu (cron-only) anon/authenticated'a
--    EXECUTE açıktı. Yalnız cron (owner) çalıştırsın diye REVOKE — client asla çağırmaz.

ALTER TABLE IF EXISTS public.islem_tahsis_yedek_20260722 ENABLE ROW LEVEL SECURITY;

REVOKE EXECUTE ON FUNCTION public.app_events_rollup_and_trim() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.usage_snapshot_al() FROM PUBLIC, anon, authenticated;
