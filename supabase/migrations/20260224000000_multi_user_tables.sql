-- =============================================
-- MIGRATION 1/4: YENİ TABLOLAR + HELPER FUNCTIONS
-- Çoklu kullanıcı (multi-user) özelliği
-- Güvenli: Mevcut tablolara dokunmuyor
-- =============================================
-- NOT: Bu migration zaten production'da manuel çalıştırıldı (2026-02-24)
-- Bu dosya sadece kayıt amaçlıdır.

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. ISLETME_INVITES
CREATE TABLE IF NOT EXISTS isletme_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  invite_code CHAR(6) NOT NULL UNIQUE,
  invited_email TEXT,
  role TEXT NOT NULL CHECK (role IN ('manager', 'operator', 'purchaser', 'custom')),
  role_label TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_invites_code ON isletme_invites(invite_code) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_invites_isletme ON isletme_invites(isletme_id);
CREATE INDEX IF NOT EXISTS idx_invites_status ON isletme_invites(isletme_id, status);
ALTER TABLE isletme_invites ENABLE ROW LEVEL SECURITY;

-- 3. ISLETME_USERS
CREATE TABLE IF NOT EXISTS isletme_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_id UUID REFERENCES isletme_invites(id),
  role TEXT NOT NULL CHECK (role IN ('manager', 'operator', 'purchaser', 'custom')),
  role_label TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_per_isletme UNIQUE (isletme_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_isletme_users_isletme ON isletme_users(isletme_id);
CREATE INDEX IF NOT EXISTS idx_isletme_users_user ON isletme_users(user_id);
CREATE INDEX IF NOT EXISTS idx_isletme_users_active ON isletme_users(user_id, status) WHERE status = 'active';
DROP TRIGGER IF EXISTS update_isletme_users_updated_at ON isletme_users;
CREATE TRIGGER update_isletme_users_updated_at BEFORE UPDATE ON isletme_users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE isletme_users ENABLE ROW LEVEL SECURITY;

-- 4. ROLE_TEMPLATES
CREATE TABLE IF NOT EXISTS role_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  label_tr TEXT NOT NULL,
  label_en TEXT NOT NULL,
  description_tr TEXT,
  description_en TEXT,
  default_permissions JSONB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE role_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read" ON role_templates;
CREATE POLICY "Anyone can read" ON role_templates FOR SELECT TO authenticated USING (true);

-- Varsayılan rol şablonları
INSERT INTO role_templates (name, label_tr, label_en, sort_order, default_permissions) VALUES
('manager', 'Yönetici', 'Manager', 1, '{"modules":{"dashboard":true,"hesaplar":true,"cariler":true,"personel":true,"islemler":true,"kategoriler":true,"raporlar":true,"cekler":true,"nakit_avans":true,"ileri_tarihli":true,"urunler":true,"arsiv":true,"ayarlar":false},"actions":{"hesaplar":{"can_create":true,"can_update_own":true,"can_update_all":true,"can_delete_own":true,"can_delete_all":false},"cariler":{"can_create":true,"can_update_own":true,"can_update_all":true,"can_delete_own":true,"can_delete_all":false},"personel":{"can_create":true,"can_update_own":true,"can_update_all":true,"can_delete_own":true,"can_delete_all":false},"islemler":{"can_create":true,"can_update_own":true,"can_update_all":true,"can_delete_own":true,"can_delete_all":false},"kategoriler":{"can_create":true,"can_update_own":true,"can_update_all":true,"can_delete_own":true,"can_delete_all":false},"cekler":{"can_create":true,"can_update_own":true,"can_update_all":true,"can_delete_own":true,"can_delete_all":false},"nakit_avans":{"can_create":true,"can_update_own":true,"can_update_all":false,"can_delete_own":true,"can_delete_all":false},"ileri_tarihli":{"can_create":true,"can_update_own":true,"can_update_all":true,"can_delete_own":true,"can_delete_all":false},"urunler":{"can_create":true,"can_update_own":true,"can_update_all":true,"can_delete_own":true,"can_delete_all":false}},"visibility":{"can_see_passive":true,"can_see_archived":true,"can_see_all_users_data":true},"restrictions":{}}'),
('operator', 'Operatör', 'Operator', 2, '{"modules":{"dashboard":false,"hesaplar":true,"cariler":true,"personel":false,"islemler":true,"kategoriler":false,"raporlar":false,"cekler":false,"nakit_avans":false,"ileri_tarihli":false,"urunler":false,"arsiv":false,"ayarlar":false},"actions":{"hesaplar":{"can_create":false,"can_update_own":false,"can_update_all":false,"can_delete_own":false,"can_delete_all":false},"cariler":{"can_create":true,"can_update_own":true,"can_update_all":false,"can_delete_own":false,"can_delete_all":false},"islemler":{"can_create":true,"can_update_own":true,"can_update_all":false,"can_delete_own":false,"can_delete_all":false}},"visibility":{"can_see_passive":false,"can_see_archived":false,"can_see_all_users_data":false},"restrictions":{"islem_types":["gelir","gider","cari_satis","cari_tahsilat"]}}'),
('purchaser', 'Satın Almacı', 'Purchaser', 3, '{"modules":{"dashboard":false,"hesaplar":true,"cariler":true,"personel":false,"islemler":true,"kategoriler":false,"raporlar":true,"cekler":true,"nakit_avans":false,"ileri_tarihli":true,"urunler":true,"arsiv":false,"ayarlar":false},"actions":{"hesaplar":{"can_create":false,"can_update_own":false,"can_update_all":false,"can_delete_own":false,"can_delete_all":false},"cariler":{"can_create":true,"can_update_own":true,"can_update_all":false,"can_delete_own":false,"can_delete_all":false},"islemler":{"can_create":true,"can_update_own":true,"can_update_all":false,"can_delete_own":false,"can_delete_all":false},"cekler":{"can_create":true,"can_update_own":true,"can_update_all":false,"can_delete_own":false,"can_delete_all":false},"ileri_tarihli":{"can_create":true,"can_update_own":true,"can_update_all":false,"can_delete_own":false,"can_delete_all":false},"urunler":{"can_create":true,"can_update_own":true,"can_update_all":false,"can_delete_own":false,"can_delete_all":false}},"visibility":{"can_see_passive":false,"can_see_archived":false,"can_see_all_users_data":true},"restrictions":{"cari_types":["tedarikci"],"islem_types":["cari_alis","cari_odeme","cari_alis_iade"]}}'),
('custom', 'Özel', 'Custom', 99, '{}')
ON CONFLICT (name) DO NOTHING;

-- 5. HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION user_has_isletme_access(p_isletme_id UUID) RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM isletmeler WHERE id = p_isletme_id AND user_id = auth.uid()) OR EXISTS (SELECT 1 FROM isletme_users WHERE isletme_id = p_isletme_id AND user_id = auth.uid() AND status = 'active');
$$;

CREATE OR REPLACE FUNCTION users_share_isletme(p_viewer UUID, p_target UUID) RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM isletme_users iu JOIN isletmeler i ON i.id = iu.isletme_id WHERE i.user_id = p_viewer AND iu.user_id = p_target AND iu.status = 'active')
    OR EXISTS (SELECT 1 FROM isletme_users iu JOIN isletmeler i ON i.id = iu.isletme_id WHERE iu.user_id = p_viewer AND iu.status = 'active' AND i.user_id = p_target)
    OR EXISTS (SELECT 1 FROM isletme_users iu1 JOIN isletme_users iu2 ON iu1.isletme_id = iu2.isletme_id WHERE iu1.user_id = p_viewer AND iu2.user_id = p_target AND iu1.status = 'active' AND iu2.status = 'active');
$$;

CREATE OR REPLACE FUNCTION get_user_permissions(p_isletme_id UUID) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE v_permissions JSONB;
BEGIN
  IF EXISTS (SELECT 1 FROM isletmeler WHERE id = p_isletme_id AND user_id = auth.uid()) THEN RETURN '{"is_owner": true}'::jsonb; END IF;
  SELECT permissions INTO v_permissions FROM isletme_users WHERE isletme_id = p_isletme_id AND user_id = auth.uid() AND status = 'active';
  IF v_permissions IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('is_owner', false, 'permissions', v_permissions);
END;
$$;

CREATE OR REPLACE FUNCTION user_can_see_record(p_isletme_id UUID, p_is_archived BOOLEAN DEFAULT false, p_is_active BOOLEAN DEFAULT true) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE v_permissions JSONB;
BEGIN
  IF EXISTS (SELECT 1 FROM isletmeler WHERE id = p_isletme_id AND user_id = auth.uid()) THEN RETURN TRUE; END IF;
  SELECT permissions INTO v_permissions FROM isletme_users WHERE isletme_id = p_isletme_id AND user_id = auth.uid() AND status = 'active';
  IF v_permissions IS NULL THEN RETURN FALSE; END IF;
  IF p_is_archived = true AND NOT COALESCE((v_permissions->'visibility'->>'can_see_archived')::boolean, false) THEN RETURN FALSE; END IF;
  IF p_is_active = false AND NOT COALESCE((v_permissions->'visibility'->>'can_see_passive')::boolean, false) THEN RETURN FALSE; END IF;
  RETURN TRUE;
END;
$$;

-- 6. YENİ TABLOLAR İÇİN RLS
DROP POLICY IF EXISTS "View profiles" ON profiles;
CREATE POLICY "View profiles" ON profiles FOR SELECT TO authenticated USING (id = auth.uid() OR users_share_isletme(auth.uid(), id));
DROP POLICY IF EXISTS "Update own profile" ON profiles;
CREATE POLICY "Update own profile" ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "View invites" ON isletme_invites;
CREATE POLICY "View invites" ON isletme_invites FOR SELECT TO authenticated USING (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Create invites" ON isletme_invites;
CREATE POLICY "Create invites" ON isletme_invites FOR INSERT TO authenticated WITH CHECK (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Update invites" ON isletme_invites;
CREATE POLICY "Update invites" ON isletme_invites FOR UPDATE TO authenticated USING (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())) WITH CHECK (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()) AND status = 'pending');
DROP POLICY IF EXISTS "Delete invites" ON isletme_invites;
CREATE POLICY "Delete invites" ON isletme_invites FOR DELETE TO authenticated USING (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "View isletme users" ON isletme_users;
CREATE POLICY "View isletme users" ON isletme_users FOR SELECT TO authenticated USING (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()) OR isletme_id IN (SELECT isletme_id FROM isletme_users WHERE user_id = auth.uid() AND status = 'active'));

-- 7. PROFILES TRIGGER
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name) VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 8. MEVCUT KULLANICILAR İÇİN PROFILES
INSERT INTO profiles (id, email, display_name) SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)) FROM auth.users ON CONFLICT (id) DO NOTHING;
