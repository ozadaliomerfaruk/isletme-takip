-- =============================================================================
-- Faz 4b — BİRİKİM ENFORCEMENT (hesaplar)
-- =============================================================================
-- AMAÇ: Yeni "Birikim hesaplarını göster" toggle'ını (modules.birikim) sunucuda
--   uygula. Bir shared user'ın birikim-tipi hesapları görmesi/oluşturması/
--   düzenlemesi/silmesi modules.birikim iznine bağlanır.
--
-- GERİYE-UYUM (karar: yok→true): modules.birikim alanı OLMAYAN mevcut kullanıcılar
--   birikim hesaplarını görmeye/yönetmeye DEVAM eder (COALESCE(..., true)). Yalnızca
--   yeni editörle AÇIKÇA birikim-kapalı yapılanlar (Operatör preset'i gibi) kısıtlanır.
--   → Mevcut 8 kullanıcının hiçbiri erişim kaybetmez.
--
-- KAPSAM: Yalnızca "Shared ..." (davetli) politikaları. Owner "Users can manage
--   hesaplar" (ALL) politikası DOKUNULMADI → sahip her tipi görür/yönetir.
--
-- Her politika canlı tanımdan birebir korundu; yalnızca şu koşul eklendi:
--   AND (hesaplar.type <> 'birikim' OR COALESCE((iu.permissions->'modules'->>'birikim')::boolean, true))
-- =============================================================================

-- ── SELECT ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Shared select hesaplar" ON hesaplar;
CREATE POLICY "Shared select hesaplar" ON hesaplar FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = hesaplar.isletme_id
      AND iu.user_id = auth.uid()
      AND iu.status = 'active'
      AND COALESCE((iu.permissions->'modules'->>'hesaplar')::boolean, false)
      AND (hesaplar.type <> 'birikim'
           OR COALESCE((iu.permissions->'modules'->>'birikim')::boolean, true))
      AND (COALESCE((iu.permissions->'visibility'->>'can_see_archived')::boolean, false)
           OR hesaplar.is_archived = false)
      AND (COALESCE((iu.permissions->'visibility'->>'can_see_passive')::boolean, false)
           OR hesaplar.is_active = true)
  )
);

-- ── INSERT ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Shared insert hesaplar" ON hesaplar;
CREATE POLICY "Shared insert hesaplar" ON hesaplar FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = hesaplar.isletme_id
      AND iu.user_id = auth.uid()
      AND iu.status = 'active'
      AND COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_create')::boolean, false)
      AND (hesaplar.type <> 'birikim'
           OR COALESCE((iu.permissions->'modules'->>'birikim')::boolean, true))
  )
);

-- ── UPDATE ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Shared update hesaplar" ON hesaplar;
CREATE POLICY "Shared update hesaplar" ON hesaplar FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = hesaplar.isletme_id
      AND iu.user_id = auth.uid()
      AND iu.status = 'active'
      AND (hesaplar.type <> 'birikim'
           OR COALESCE((iu.permissions->'modules'->>'birikim')::boolean, true))
      AND (
        COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_update_all')::boolean, false)
        OR (COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_update_own')::boolean, false)
            AND hesaplar.created_by = auth.uid())
      )
  )
);

-- ── DELETE ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Shared delete hesaplar" ON hesaplar;
CREATE POLICY "Shared delete hesaplar" ON hesaplar FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = hesaplar.isletme_id
      AND iu.user_id = auth.uid()
      AND iu.status = 'active'
      AND (hesaplar.type <> 'birikim'
           OR COALESCE((iu.permissions->'modules'->>'birikim')::boolean, true))
      AND (
        COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_delete_all')::boolean, false)
        OR (COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_delete_own')::boolean, false)
            AND hesaplar.created_by = auth.uid())
      )
  )
);

-- =============================================================================
-- GERİ ALMA (gerekirse — birikim koşulu olmadan orijinal 4 politika):
-- =============================================================================
-- DROP POLICY IF EXISTS "Shared select hesaplar" ON hesaplar;
-- CREATE POLICY "Shared select hesaplar" ON hesaplar FOR SELECT USING (
--   EXISTS (SELECT 1 FROM isletme_users iu WHERE iu.isletme_id = hesaplar.isletme_id
--     AND iu.user_id = auth.uid() AND iu.status='active'
--     AND COALESCE((iu.permissions->'modules'->>'hesaplar')::boolean, false)
--     AND (COALESCE((iu.permissions->'visibility'->>'can_see_archived')::boolean, false) OR hesaplar.is_archived = false)
--     AND (COALESCE((iu.permissions->'visibility'->>'can_see_passive')::boolean, false) OR hesaplar.is_active = true)));
-- DROP POLICY IF EXISTS "Shared insert hesaplar" ON hesaplar;
-- CREATE POLICY "Shared insert hesaplar" ON hesaplar FOR INSERT WITH CHECK (
--   EXISTS (SELECT 1 FROM isletme_users iu WHERE iu.isletme_id = hesaplar.isletme_id
--     AND iu.user_id = auth.uid() AND iu.status='active'
--     AND COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_create')::boolean, false)));
-- DROP POLICY IF EXISTS "Shared update hesaplar" ON hesaplar;
-- CREATE POLICY "Shared update hesaplar" ON hesaplar FOR UPDATE USING (
--   EXISTS (SELECT 1 FROM isletme_users iu WHERE iu.isletme_id = hesaplar.isletme_id
--     AND iu.user_id = auth.uid() AND iu.status='active'
--     AND (COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_update_all')::boolean, false)
--       OR (COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_update_own')::boolean, false) AND hesaplar.created_by = auth.uid()))));
-- DROP POLICY IF EXISTS "Shared delete hesaplar" ON hesaplar;
-- CREATE POLICY "Shared delete hesaplar" ON hesaplar FOR DELETE USING (
--   EXISTS (SELECT 1 FROM isletme_users iu WHERE iu.isletme_id = hesaplar.isletme_id
--     AND iu.user_id = auth.uid() AND iu.status='active'
--     AND (COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_delete_all')::boolean, false)
--       OR (COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_delete_own')::boolean, false) AND hesaplar.created_by = auth.uid()))));
