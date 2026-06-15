-- =============================================================================
-- Faz 4 §2.4 — ileri_tarihli_islemler SELECT görünürlük açığı (latent)
-- =============================================================================
-- SORUN: "Shared select ileri_tarihli" modül kontrolü yapıyor AMA islemler'deki
--   can_see_all_users_data görünürlük kontrolünü ATLIYORDU → ileri_tarihli modülü
--   olan + can_see_all_users_data=false bir davetli, BAŞKA kullanıcıların ileri
--   tarihli işlemlerini görebiliyordu.
-- DURUM: Şu an tüm kullanıcılar (eski şablon + yeni model) can_see_all_users_data=true
--   → kimse etkilenmiyor (latent). Yine de islemler SELECT desenini birebir kopyalayıp
--   açığı kapatıyoruz. → En güvenli RLS fix'i (kimseyi etkilemez).
-- =============================================================================

DROP POLICY IF EXISTS "Shared select ileri_tarihli" ON ileri_tarihli_islemler;
CREATE POLICY "Shared select ileri_tarihli" ON ileri_tarihli_islemler FOR SELECT USING (
  EXISTS (SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = ileri_tarihli_islemler.isletme_id
      AND iu.user_id = auth.uid()
      AND iu.status = 'active'
      AND COALESCE((iu.permissions->'modules'->>'ileri_tarihli')::boolean, false)
      AND (COALESCE((iu.permissions->'visibility'->>'can_see_all_users_data')::boolean, false)
           OR ileri_tarihli_islemler.created_by = auth.uid())));

-- GERİ ALMA (görünürlük kontrolü olmadan orijinal):
-- DROP POLICY IF EXISTS "Shared select ileri_tarihli" ON ileri_tarihli_islemler;
-- CREATE POLICY "Shared select ileri_tarihli" ON ileri_tarihli_islemler FOR SELECT USING (
--   EXISTS (SELECT 1 FROM isletme_users iu WHERE iu.isletme_id = ileri_tarihli_islemler.isletme_id
--     AND iu.user_id = auth.uid() AND iu.status='active'
--     AND COALESCE((iu.permissions->'modules'->>'ileri_tarihli')::boolean, false)));
