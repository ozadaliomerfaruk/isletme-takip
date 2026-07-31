-- =============================================================================
-- P-A GERİ ALMA — public.cleanup_old_islem_audit_log()
-- =============================================================================
-- ⚠️ BU DOSYA SAVUNMASIZ HÂLE DÖNMEZ.
--
--    Geri alma gerekirse YALNIZ `authenticated` iade edilir.
--    PUBLIC ve anon KESİNLİKLE iade EDİLMEZ — asıl açık oydu:
--    anonim çağrıyla denetim kaydı silme.
--
-- NE ZAMAN KULLANILIR
--   Beklenmedik bir çağıran ortaya çıkarsa (ör. bilinmeyen bir Edge Function
--   veya entegrasyon 42501 alırsa). Bu durumda önce ÇAĞIRAN TESPİT EDİLİR;
--   bu dosya yalnız acil süre kazanmak içindir.
--
-- KULLANILMADAN ÖNCE
--   1) Gerçek çağıranı tespit et (pg_stat_statements / log)
--   2) O çağıranın meşru olup olmadığına karar ver
--   3) Meşruysa: kalıcı çözüm bu GRANT değil, çağırana özel guard'lı bir yol
--
-- BU DOSYA MIGRATION DEĞİLDİR — elle, bilinçli olarak çalıştırılır.
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.cleanup_old_islem_audit_log() TO authenticated;

-- ⛔ AŞAĞIDAKİLER BİLİNÇLİ OLARAK YOKTUR — EKLEMEYİN:
--    GRANT EXECUTE ON FUNCTION public.cleanup_old_islem_audit_log() TO anon;
--    GRANT EXECUTE ON FUNCTION public.cleanup_old_islem_audit_log() TO PUBLIC;
