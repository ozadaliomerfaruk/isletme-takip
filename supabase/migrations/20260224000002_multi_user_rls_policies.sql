-- =============================================
-- MIGRATION 3/4: RLS POLICY GÜNCELLEMELERİ (v2 - SAFE ADDITIVE)
-- Güvenli: Owner policy'lere DOKUNULMAZ, shared user policy'ler EKLENIR
-- PERMISSIVE policy'ler OR ile birleşir → sadece erişim ekler
-- =============================================
-- NOT: Bu migration zaten production'da manuel çalıştırıldı (2026-02-24)

-- =============================================
-- ADIM 1: isletme_users RLS düzelt
-- Circular self-reference → SECURITY DEFINER fonksiyon
-- =============================================

DROP POLICY IF EXISTS "View isletme users" ON isletme_users;
CREATE POLICY "View isletme users" ON isletme_users FOR SELECT TO authenticated
  USING (user_has_isletme_access(isletme_id));

DROP POLICY IF EXISTS "Owner insert isletme users" ON isletme_users;
CREATE POLICY "Owner insert isletme users" ON isletme_users FOR INSERT TO authenticated
  WITH CHECK (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Owner update isletme users" ON isletme_users;
CREATE POLICY "Owner update isletme users" ON isletme_users FOR UPDATE TO authenticated
  USING (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()))
  WITH CHECK (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Owner delete isletme users" ON isletme_users;
CREATE POLICY "Owner delete isletme users" ON isletme_users FOR DELETE TO authenticated
  USING (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()));

-- =============================================
-- ADIM 2: isletmeler'e shared user view ekle
-- Mevcut "Users can manage isletmeler" FOR ALL → DOKUNULMADI
-- =============================================

DROP POLICY IF EXISTS "Shared users view isletmeler" ON isletmeler;
CREATE POLICY "Shared users view isletmeler" ON isletmeler FOR SELECT TO authenticated
  USING (user_has_isletme_access(id));

-- =============================================
-- ADIM 3: Data tabloları — shared user policy'leri
-- Mevcut "Users can manage X" FOR ALL → DOKUNULMADI
-- =============================================

-- ISLEMLER (Module: islemler | Data ownership: can_see_all_users_data)
DROP POLICY IF EXISTS "Shared select islemler" ON islemler;
CREATE POLICY "Shared select islemler" ON islemler FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = islemler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'islemler')::boolean, false)
    AND (COALESCE((iu.permissions->'visibility'->>'can_see_all_users_data')::boolean, false) OR islemler.created_by = auth.uid())
  ));
DROP POLICY IF EXISTS "Shared insert islemler" ON islemler;
CREATE POLICY "Shared insert islemler" ON islemler FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = islemler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'actions'->'islemler'->>'can_create')::boolean, false)
  ));
DROP POLICY IF EXISTS "Shared update islemler" ON islemler;
CREATE POLICY "Shared update islemler" ON islemler FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = islemler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'islemler'->>'can_update_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'islemler'->>'can_update_own')::boolean, false) AND islemler.created_by = auth.uid()))
  ));
DROP POLICY IF EXISTS "Shared delete islemler" ON islemler;
CREATE POLICY "Shared delete islemler" ON islemler FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = islemler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'islemler'->>'can_delete_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'islemler'->>'can_delete_own')::boolean, false) AND islemler.created_by = auth.uid()))
  ));

-- HESAPLAR (Module: hesaplar | Visibility: is_archived, is_active)
DROP POLICY IF EXISTS "Shared select hesaplar" ON hesaplar;
CREATE POLICY "Shared select hesaplar" ON hesaplar FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = hesaplar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'hesaplar')::boolean, false)
    AND (COALESCE((iu.permissions->'visibility'->>'can_see_archived')::boolean, false) OR hesaplar.is_archived = false)
    AND (COALESCE((iu.permissions->'visibility'->>'can_see_passive')::boolean, false) OR hesaplar.is_active = true)
  ));
DROP POLICY IF EXISTS "Shared insert hesaplar" ON hesaplar;
CREATE POLICY "Shared insert hesaplar" ON hesaplar FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = hesaplar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_create')::boolean, false)
  ));
DROP POLICY IF EXISTS "Shared update hesaplar" ON hesaplar;
CREATE POLICY "Shared update hesaplar" ON hesaplar FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = hesaplar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_update_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_update_own')::boolean, false) AND hesaplar.created_by = auth.uid()))
  ));
DROP POLICY IF EXISTS "Shared delete hesaplar" ON hesaplar;
CREATE POLICY "Shared delete hesaplar" ON hesaplar FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = hesaplar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_delete_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_delete_own')::boolean, false) AND hesaplar.created_by = auth.uid()))
  ));

-- CARILER (Module: cariler | Data ownership + is_archived + is_active)
DROP POLICY IF EXISTS "Shared select cariler" ON cariler;
CREATE POLICY "Shared select cariler" ON cariler FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = cariler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'cariler')::boolean, false)
    AND (COALESCE((iu.permissions->'visibility'->>'can_see_all_users_data')::boolean, false) OR cariler.created_by = auth.uid())
    AND (COALESCE((iu.permissions->'visibility'->>'can_see_archived')::boolean, false) OR cariler.is_archived = false)
    AND (COALESCE((iu.permissions->'visibility'->>'can_see_passive')::boolean, false) OR cariler.is_active = true)
  ));
DROP POLICY IF EXISTS "Shared insert cariler" ON cariler;
CREATE POLICY "Shared insert cariler" ON cariler FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = cariler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'actions'->'cariler'->>'can_create')::boolean, false)
  ));
DROP POLICY IF EXISTS "Shared update cariler" ON cariler;
CREATE POLICY "Shared update cariler" ON cariler FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = cariler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'cariler'->>'can_update_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'cariler'->>'can_update_own')::boolean, false) AND cariler.created_by = auth.uid()))
  ));
DROP POLICY IF EXISTS "Shared delete cariler" ON cariler;
CREATE POLICY "Shared delete cariler" ON cariler FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = cariler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'cariler'->>'can_delete_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'cariler'->>'can_delete_own')::boolean, false) AND cariler.created_by = auth.uid()))
  ));

-- PERSONEL (Module: personel | Data ownership + is_archived + is_active)
DROP POLICY IF EXISTS "Shared select personel" ON personel;
CREATE POLICY "Shared select personel" ON personel FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = personel.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'personel')::boolean, false)
    AND (COALESCE((iu.permissions->'visibility'->>'can_see_all_users_data')::boolean, false) OR personel.created_by = auth.uid())
    AND (COALESCE((iu.permissions->'visibility'->>'can_see_archived')::boolean, false) OR personel.is_archived = false)
    AND (COALESCE((iu.permissions->'visibility'->>'can_see_passive')::boolean, false) OR personel.is_active = true)
  ));
DROP POLICY IF EXISTS "Shared insert personel" ON personel;
CREATE POLICY "Shared insert personel" ON personel FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = personel.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'actions'->'personel'->>'can_create')::boolean, false)
  ));
DROP POLICY IF EXISTS "Shared update personel" ON personel;
CREATE POLICY "Shared update personel" ON personel FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = personel.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'personel'->>'can_update_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'personel'->>'can_update_own')::boolean, false) AND personel.created_by = auth.uid()))
  ));
DROP POLICY IF EXISTS "Shared delete personel" ON personel;
CREATE POLICY "Shared delete personel" ON personel FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = personel.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'personel'->>'can_delete_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'personel'->>'can_delete_own')::boolean, false) AND personel.created_by = auth.uid()))
  ));

-- KATEGORILER (Module: kategoriler | is_active only)
DROP POLICY IF EXISTS "Shared select kategoriler" ON kategoriler;
CREATE POLICY "Shared select kategoriler" ON kategoriler FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = kategoriler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'kategoriler')::boolean, false)
    AND (COALESCE((iu.permissions->'visibility'->>'can_see_passive')::boolean, false) OR kategoriler.is_active = true)
  ));
DROP POLICY IF EXISTS "Shared insert kategoriler" ON kategoriler;
CREATE POLICY "Shared insert kategoriler" ON kategoriler FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = kategoriler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'actions'->'kategoriler'->>'can_create')::boolean, false)
  ));
DROP POLICY IF EXISTS "Shared update kategoriler" ON kategoriler;
CREATE POLICY "Shared update kategoriler" ON kategoriler FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = kategoriler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'kategoriler'->>'can_update_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'kategoriler'->>'can_update_own')::boolean, false) AND kategoriler.created_by = auth.uid()))
  ));
DROP POLICY IF EXISTS "Shared delete kategoriler" ON kategoriler;
CREATE POLICY "Shared delete kategoriler" ON kategoriler FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = kategoriler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'kategoriler'->>'can_delete_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'kategoriler'->>'can_delete_own')::boolean, false) AND kategoriler.created_by = auth.uid()))
  ));

-- CEKLER (Module: cekler | Module-level access)
DROP POLICY IF EXISTS "Shared select cekler" ON cekler;
CREATE POLICY "Shared select cekler" ON cekler FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = cekler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'cekler')::boolean, false)
  ));
DROP POLICY IF EXISTS "Shared insert cekler" ON cekler;
CREATE POLICY "Shared insert cekler" ON cekler FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = cekler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'actions'->'cekler'->>'can_create')::boolean, false)
  ));
DROP POLICY IF EXISTS "Shared update cekler" ON cekler;
CREATE POLICY "Shared update cekler" ON cekler FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = cekler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'cekler'->>'can_update_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'cekler'->>'can_update_own')::boolean, false) AND cekler.created_by = auth.uid()))
  ));
DROP POLICY IF EXISTS "Shared delete cekler" ON cekler;
CREATE POLICY "Shared delete cekler" ON cekler FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = cekler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'cekler'->>'can_delete_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'cekler'->>'can_delete_own')::boolean, false) AND cekler.created_by = auth.uid()))
  ));

-- NAKIT_AVANSLAR (Module: nakit_avans | Simple module access)
DROP POLICY IF EXISTS "Shared manage nakit_avanslar" ON nakit_avanslar;
CREATE POLICY "Shared manage nakit_avanslar" ON nakit_avanslar FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = nakit_avanslar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'nakit_avans')::boolean, false)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = nakit_avanslar.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'nakit_avans')::boolean, false)
  ));

-- ILERI_TARIHLI_ISLEMLER (Module: ileri_tarihli | Simple module access)
DROP POLICY IF EXISTS "Shared manage ileri_tarihli" ON ileri_tarihli_islemler;
CREATE POLICY "Shared manage ileri_tarihli" ON ileri_tarihli_islemler FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = ileri_tarihli_islemler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'ileri_tarihli')::boolean, false)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = ileri_tarihli_islemler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'ileri_tarihli')::boolean, false)
  ));

-- URUNLER (Module: urunler | Visibility: is_archived)
DROP POLICY IF EXISTS "Shared select urunler" ON urunler;
CREATE POLICY "Shared select urunler" ON urunler FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = urunler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'urunler')::boolean, false)
    AND (COALESCE((iu.permissions->'visibility'->>'can_see_archived')::boolean, false) OR urunler.is_archived = false)
  ));
DROP POLICY IF EXISTS "Shared insert urunler" ON urunler;
CREATE POLICY "Shared insert urunler" ON urunler FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = urunler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'actions'->'urunler'->>'can_create')::boolean, false)
  ));
DROP POLICY IF EXISTS "Shared update urunler" ON urunler;
CREATE POLICY "Shared update urunler" ON urunler FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = urunler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'urunler'->>'can_update_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'urunler'->>'can_update_own')::boolean, false) AND urunler.created_by = auth.uid()))
  ));
DROP POLICY IF EXISTS "Shared delete urunler" ON urunler;
CREATE POLICY "Shared delete urunler" ON urunler FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = urunler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND (COALESCE((iu.permissions->'actions'->'urunler'->>'can_delete_all')::boolean, false)
      OR (COALESCE((iu.permissions->'actions'->'urunler'->>'can_delete_own')::boolean, false) AND urunler.created_by = auth.uid()))
  ));

-- URUN_HAREKETLER (Module: urunler | Simple module access)
DROP POLICY IF EXISTS "Shared manage urun_hareketler" ON urun_hareketler;
CREATE POLICY "Shared manage urun_hareketler" ON urun_hareketler FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = urun_hareketler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'urunler')::boolean, false)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = urun_hareketler.isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
    AND COALESCE((iu.permissions->'modules'->>'urunler')::boolean, false)
  ));
