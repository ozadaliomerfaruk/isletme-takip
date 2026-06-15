-- =============================================================================
-- Faz 4c — §2.1 GÜVENLİK: notlar modül kontrolü yoktu
-- =============================================================================
-- SORUN: notlar tablosu multi-user RLS deseninden (20260224) SONRA (20260407)
--   eklendiği için shared policy'leri HİÇ modül/izin kontrolü almamıştı:
--     - "Shared select notlar": yalnızca aktif üyelik → dashboard-only bir davetli
--       bile TÜM notları okuyabiliyordu.
--     - "Shared insert notlar": yalnızca aktif üyelik → izinsiz not oluşturma.
--   (update/delete zaten created_by=own ile sınırlıydı ama modül kontrolü yoktu.)
--
-- ÇÖZÜM (sade model, option B): notlar artık kendi modülü; tüm shared policy'lere
--   modules.notlar kontrolü eklendi. Tek 'notlar' toggle'ı tüm notları (entity_type
--   farketmeksizin) yönetir — editördeki Notlar anahtarıyla birebir.
--
-- GERİYE-UYUM (karar: yok→true): modules.notlar alanı OLMAYAN mevcut kullanıcılar
--   (yöneticiler/operatörler) notları görmeye/yönetmeye DEVAM eder. Yalnızca yeni
--   editörle notlar-kapalı yapılanlar engellenir. (Tam kapanış Faz 3 ile — herkes
--   açık değere taşınınca.)
--
-- KAPSAM: Yalnızca "Shared ..." (davetli) politikaları. Owner "Users can manage
--   notlar" (ALL) DOKUNULMADI. Düzenle/sil yine yalnızca kendi notu (created_by).
-- =============================================================================

DROP POLICY IF EXISTS "Shared select notlar" ON notlar;
CREATE POLICY "Shared select notlar" ON notlar FOR SELECT USING (
  EXISTS (SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = notlar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
      AND COALESCE((iu.permissions->'modules'->>'notlar')::boolean, true)));

DROP POLICY IF EXISTS "Shared insert notlar" ON notlar;
CREATE POLICY "Shared insert notlar" ON notlar FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = notlar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
      AND COALESCE((iu.permissions->'modules'->>'notlar')::boolean, true)));

DROP POLICY IF EXISTS "Shared update notlar" ON notlar;
CREATE POLICY "Shared update notlar" ON notlar FOR UPDATE USING (
  EXISTS (SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = notlar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
      AND COALESCE((iu.permissions->'modules'->>'notlar')::boolean, true)
      AND notlar.created_by = auth.uid()));

DROP POLICY IF EXISTS "Shared delete notlar" ON notlar;
CREATE POLICY "Shared delete notlar" ON notlar FOR DELETE USING (
  EXISTS (SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = notlar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
      AND COALESCE((iu.permissions->'modules'->>'notlar')::boolean, true)
      AND notlar.created_by = auth.uid()));

-- =============================================================================
-- GERİ ALMA (gerekirse — modül kontrolü olmadan orijinal):
-- =============================================================================
-- DROP POLICY IF EXISTS "Shared select notlar" ON notlar;
-- CREATE POLICY "Shared select notlar" ON notlar FOR SELECT USING (
--   EXISTS (SELECT 1 FROM isletme_users iu WHERE iu.isletme_id = notlar.isletme_id
--     AND iu.user_id = auth.uid() AND iu.status='active'));
-- DROP POLICY IF EXISTS "Shared insert notlar" ON notlar;
-- CREATE POLICY "Shared insert notlar" ON notlar FOR INSERT WITH CHECK (
--   EXISTS (SELECT 1 FROM isletme_users iu WHERE iu.isletme_id = notlar.isletme_id
--     AND iu.user_id = auth.uid() AND iu.status='active'));
-- DROP POLICY IF EXISTS "Shared update notlar" ON notlar;
-- CREATE POLICY "Shared update notlar" ON notlar FOR UPDATE USING (
--   EXISTS (SELECT 1 FROM isletme_users iu WHERE iu.isletme_id = notlar.isletme_id
--     AND iu.user_id = auth.uid() AND iu.status='active' AND notlar.created_by = auth.uid()));
-- DROP POLICY IF EXISTS "Shared delete notlar" ON notlar;
-- CREATE POLICY "Shared delete notlar" ON notlar FOR DELETE USING (
--   EXISTS (SELECT 1 FROM isletme_users iu WHERE iu.isletme_id = notlar.isletme_id
--     AND iu.user_id = auth.uid() AND iu.status='active' AND notlar.created_by = auth.uid()));
