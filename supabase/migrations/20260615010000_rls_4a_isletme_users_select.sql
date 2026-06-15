-- =============================================================================
-- Faz 4a — §2.2 GÜVENLİK: isletme_users SELECT sızıntısı
-- =============================================================================
-- SORUN: "View isletme users" politikası user_has_isletme_access(isletme_id)
--   kullanıyordu → işletmedeki HERHANGİ bir aktif üye, TÜM üyelerin permissions
--   JSONB'sini (can_delete_all, can_see_all_users_data vb.) doğrudan API ile okuyabiliyordu.
--   Kullanıcı-yönetimi ekranı useRequireOwner ile korunuyor ama RLS bunu zorlamıyordu.
--
-- ÇÖZÜM: SELECT'i "kendi satırın VEYA owner'sın" ile sınırla.
--
-- NEDEN GÜVENLİ (doğrulandı):
--   - user_has_isletme_access / users_share_isletme / is_linked_* hepsi SECURITY
--     DEFINER → RLS'i bypass eder, bu politikadan etkilenmez (profil görünürlüğü,
--     erişim kontrolü çalışmaya devam eder).
--   - Diğer tabloların shared politikaları "iu.user_id = auth.uid()" ile yalnızca
--     kendi satırını okur → izinli.
--   - useSharedIsletmeler kendi satırını (user_id=auth.uid()) okur → izinli.
--   - Owner, kullanıcı-yönetiminde tüm üyeleri görür → izinli.
-- =============================================================================

DROP POLICY IF EXISTS "View isletme users" ON isletme_users;

CREATE POLICY "View isletme users" ON isletme_users FOR SELECT USING (
  user_id = auth.uid()                                                    -- kendi satırın
  OR isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()) -- veya owner'sın
);

-- GERİ ALMA (gerekirse):
-- DROP POLICY IF EXISTS "View isletme users" ON isletme_users;
-- CREATE POLICY "View isletme users" ON isletme_users FOR SELECT
--   USING (user_has_isletme_access(isletme_id));
