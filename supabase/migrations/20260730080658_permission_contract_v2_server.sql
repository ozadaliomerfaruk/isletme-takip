-- =============================================================================
-- YETKI SOZLESMESI V2 - SERVER PAKETI
-- =============================================================================
-- Bu migration mevcut kullanici/islem satirlarina yazmaz. Migration-time
-- INSERT/UPDATE/DELETE/TRUNCATE, backfill, tablo/kolon DROP veya rename yoktur.
-- Yalniz surumlu helper/RPC'ler, mevcut public imzalari koruyan CREATE OR
-- REPLACE uyumluluk govdeleri, additive policy/trigger'lar ve kategori policy
-- ayarlari ile transaction-local action/code-attempt icin yeni private internal
-- tablolar vardir.
--
-- 1.5.x / eski client:
--   * Hicbir public RPC imzasi silinmez.
--   * Acik modul artik creator/visibility=false ayrimi olmadan read-all'dir.
--   * dashboard, Raporlar modulu ile ayni gorunurluge gelir.
--   * Personel odeme/tahsilat artik Hesaplar modulu istemez; hesap secimi yeni
--     bakiyesiz RPC ile yapilabilir.
--   * Shared pasif kayitlari okuyamaz ve is_active degerini degistiremez.
--   * Custom kategori yazamaz; aktif manager ve owner yazabilir.
--   Bunlar yeni urun kararinin kasitli yetki davranisi degisiklikleridir;
--   kullanici tablolari/kolonlari ve mevcut satirlar degismez.
--
-- Eski shared client policy etkisi:
--   * Yeni RPC adlarini bilmez; mevcut ekranlar direct SELECT kullanmaya devam
--     eder. Acik H/C/P/U modulu creator filtresiz okunur.
--   * Yeni RESTRICTIVE source gate, kapali kaynak tipini eski modules.islemler
--     bayragiyla okumayi/yazmayi engeller. Bu bilincli guvenlik daralmasidir.
--   * Eski direct entity UPDATE/DELETE, modern/legacy exact own/all kapisindan
--     gecmedikce artik 0-row/42501 olur. Owner davranisi degismez.
--   * Cari/Personel-only eski client hesap tablosunu acamaz ve bakiye sizdirmaz;
--     yeni client bakiyesiz get_islem_hesap_referanslari_v2'ye opt-in olur.
--   * Eski productful edit yolu V3'u bilmez; mevcut owner yolu korunur, shared
--     client yeni V3'e opt-in olmadan urunlu satiri degistiremez.
--   * Mevcut istemcilerin hicbir mesru akisi satir id/tenant/product/islem
--     bagini UPDATE etmez; boyle bir direct-table denemesi artik 42501 alir.
--   * Manager kategori arsivleme atomik RPC'si calisir; direct NULL/pasif state
--     yazimi kapanir. Owner'in false arsivlemesi bagli-islem guardina tabidir.
--   * Owner'in eski manuel stok yolu korunur. Eski shared client'in iki HTTP
--     adimli update_urun_miktar + raw urun_hareketler yolu ilk adimda, hicbir
--     satir yazilmadan 42501 alir; modern client uc atomik V2 RPC ile calisir.
--     Owner'in eski delta RPC'si calisir. Shared metadata UPDATE'i guvenli urun
--     kolonlarinda calisir; raw miktar PATCH ve NULL/nonzero ilk miktarli INSERT
--     reddedilir. Raw hareket INSERT/UPDATE/DELETE owner-only'dir.
--   * 1.5.x kalici H/C/P/U silme akisi once notu genel yapmayi dener. Bu direct
--     detach artik 42501 alir; eski client hatayi yutup DELETE'e devam edebilir.
--     DELETE basariliysa server notu ayni transaction'da genel yapar. Bagli-kayit
--     guard'i DELETE'i reddederse not parent'a bagli kalir; erken detach olmaz.
--   * P2 uyumluluk borcu: public.islemler direct SELECT=* eski client sozlesmesi
--     nedeniyle satir okunabildiginde updated_by kolonunu kolon-bazli maskeleyemez.
--     Bu paket yeni projection/export ciktilarinda updated_by'yi shared icin NULL
--     yapar; creator display etiketi kalir. Raw kolonun tamamen kapanmasi ancak
--     eski direct-table client'lar kaldirildiktan sonra ayri bir surumde yapilir.
--
-- Uretim precondition/snapshot (uygulama operatoru migration'dan once saklar):
--   SELECT p.oid::regprocedure, p.prosecdef, p.provolatile, p.proconfig,
--          md5(pg_get_functiondef(p.oid)), p.proacl
--   FROM pg_proc p
--   WHERE p.oid IN (
--     'internal.etkin_yetki(uuid,text)'::regprocedure,
--     'internal.islem_tipi_modulu(text)'::regprocedure,
--     'public.update_islem_atomik_v2(uuid,uuid,jsonb)'::regprocedure
--   );
--   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual,
--          with_check
--   FROM pg_policies
--   WHERE schemaname='public'
--     AND tablename IN (
--       'islemler','ileri_tarihli_islemler','hesaplar','cariler','personel',
--       'urunler','urun_hareketler','notlar','kategoriler'
--     )
--   ORDER BY tablename, policyname;
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';

DO $precondition$
BEGIN
  IF pg_catalog.to_regprocedure('internal.etkin_yetki(uuid,text)') IS NULL
     OR pg_catalog.to_regprocedure('internal.islem_tipi_modulu(text)') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.update_islem_atomik_v2(uuid,uuid,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.get_islem_mutation_context_v1(uuid,uuid,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.get_urun_hareket_minimal_cari_labels(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.get_personel_izin_kotalari_v1(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.get_transaction_creator_labels(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.ekstre_link_iptal(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.delete_islem_atomik_v2(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.archive_kategori_atomik(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.set_urun_miktar_hedef(uuid,uuid,numeric,timestamp with time zone,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.create_urun_hareket_atomik_v2(uuid,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.update_urun_hareket_atomik_v2(uuid,uuid,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.delete_urun_hareket_atomik_v2(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.get_category_report_v2(uuid,text[],timestamp with time zone,timestamp with time zone)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.get_product_report_v2(uuid,timestamp with time zone,timestamp with time zone,text[])'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.get_account_report(uuid,text[],timestamp with time zone,timestamp with time zone)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.get_cari_islem_satirlari_v1(uuid,uuid,integer,timestamp without time zone,timestamp with time zone,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.get_personel_islem_satirlari_v1(uuid,uuid,integer,timestamp without time zone,timestamp with time zone,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.get_hesap_islem_satirlari_v1(uuid,uuid,integer,timestamp without time zone,timestamp with time zone,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.storage_photo_path_parse_v1(text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.storage_photo_insert_allowed_v1(text,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.storage_note_photo_select_allowed_v1(text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'internal.storage_note_photo_delete_allowed_v1(text,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure('public.handle_new_user()') IS NULL
     OR pg_catalog.to_regprocedure('public.log_islem_changes()') IS NULL
     OR pg_catalog.to_regprocedure('public.set_audit_fields()') IS NULL
     OR pg_catalog.to_regclass('public.isletme_users') IS NULL
     OR pg_catalog.to_regclass('public.islemler') IS NULL
     OR pg_catalog.to_regclass('public.ileri_tarihli_islemler') IS NULL
     OR pg_catalog.to_regclass('public.hesaplar') IS NULL
     OR pg_catalog.to_regclass('public.cariler') IS NULL
     OR pg_catalog.to_regclass('public.personel') IS NULL
     OR pg_catalog.to_regclass('public.urunler') IS NULL
     OR pg_catalog.to_regclass('public.urun_hareketler') IS NULL
     OR pg_catalog.to_regclass('public.notlar') IS NULL
     OR pg_catalog.to_regclass('public.kategoriler') IS NULL
     OR pg_catalog.to_regclass('public.taksit_planlari') IS NULL
     OR pg_catalog.to_regclass('public.taksitler') IS NULL
     OR pg_catalog.to_regclass('public.islem_tahsis') IS NULL
     OR pg_catalog.to_regclass('public.cari_ekstre_links') IS NULL
     OR pg_catalog.to_regclass('public.cekler') IS NULL
     OR pg_catalog.to_regclass('public.nakit_avanslar') IS NULL
     OR pg_catalog.to_regclass('public.cari_links') IS NULL
     OR pg_catalog.to_regclass('public.irsaliye_records') IS NULL
     OR pg_catalog.to_regclass('storage.objects') IS NULL
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_proc AS function_row
       INNER JOIN pg_catalog.pg_roles AS owner_role
         ON owner_role.oid = function_row.proowner
       WHERE function_row.oid IN (
         pg_catalog.to_regprocedure(
           'public.create_urun_hareket_atomik_v2(uuid,jsonb)'
         ),
         pg_catalog.to_regprocedure(
           'public.update_urun_hareket_atomik_v2(uuid,uuid,jsonb)'
         ),
         pg_catalog.to_regprocedure(
           'public.delete_urun_hareket_atomik_v2(uuid,uuid)'
         )
       )
         AND function_row.prosecdef IS TRUE
         AND owner_role.rolname = 'postgres'
         AND EXISTS (
           SELECT 1
           FROM pg_catalog.unnest(function_row.proconfig) AS config(value)
           WHERE config.value LIKE 'search_path=%'
         )
     ) <> 3
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_policies AS policy_row
       WHERE policy_row.schemaname = 'public'
         AND policy_row.tablename = 'kategoriler'
         AND policy_row.policyname IN (
           'Category writes require owner - insert',
           'Category writes require owner - update',
           'Category writes require owner - delete'
         )
     ) <> 3
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_policies AS policy_row
       WHERE policy_row.schemaname = 'public'
         AND (
           (policy_row.tablename = 'kategoriler'
            AND policy_row.policyname = 'Shared select kategoriler')
           OR (policy_row.tablename = 'taksit_planlari'
               AND policy_row.policyname = 'taksit_planlari_select')
           OR (policy_row.tablename = 'taksitler'
               AND policy_row.policyname = 'taksitler_select')
           OR (policy_row.tablename = 'islem_tahsis'
               AND policy_row.policyname = 'islem_tahsis_select')
           OR (policy_row.tablename = 'cari_ekstre_links'
               AND policy_row.policyname = 'cari_ekstre_links_select')
         )
     ) <> 5 THEN
    RAISE EXCEPTION 'PERMISSION_V2_PRECONDITION_FAILED'
      USING ERRCODE = '55000';
  END IF;
END;
$precondition$;


-- ---------------------------------------------------------------------------
-- 1) KANONIK RESOLVER V2
--    Son kolonun adi geriye uyum icin korunur; V2'de anlami "acik modulde
--    read-all"dir. Legacy visibility=false artik acik modulu own-only yapmaz.
-- ---------------------------------------------------------------------------
CREATE FUNCTION internal.etkin_yetki_v2(
  p_isletme_id uuid,
  p_modul text
)
RETURNS TABLE (
  can_view boolean,
  can_create boolean,
  can_update_own boolean,
  can_update_all boolean,
  can_delete_own boolean,
  can_delete_all boolean,
  can_see_all_users_data boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_permissions jsonb;
  v_modules jsonb;
  v_actions jsonb;
  v_level_json jsonb;
  v_level text;
  v_legacy boolean;
  v_raw_module boolean := false;
  v_hesaplar boolean := false;
  v_cariler boolean := false;
  v_urunler boolean := false;
  v_personel boolean := false;
  v_any_source boolean := false;
  v_visible boolean := false;
  v_mutation_surface boolean := false;
BEGIN
  IF v_uid IS NULL OR p_isletme_id IS NULL OR p_modul IS NULL THEN
    RETURN QUERY SELECT false, false, false, false, false, false, false;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.isletmeler AS business
    WHERE business.id = p_isletme_id
      AND business.user_id = v_uid
  ) THEN
    RETURN QUERY SELECT true, true, true, true, true, true, true;
    RETURN;
  END IF;

  SELECT member.permissions
  INTO v_permissions
  FROM public.isletme_users AS member
  WHERE member.isletme_id = p_isletme_id
    AND member.user_id = v_uid
    AND member.status = 'active'
  LIMIT 1;

  IF NOT FOUND OR v_permissions IS NULL
     OR pg_catalog.jsonb_typeof(v_permissions) IS DISTINCT FROM 'object' THEN
    RETURN QUERY SELECT false, false, false, false, false, false, false;
    RETURN;
  END IF;

  v_modules := v_permissions->'modules';
  v_actions := v_permissions->'actions';
  v_level_json := v_permissions->'level';
  v_legacy := v_level_json IS NULL OR v_level_json = 'null'::jsonb;

  IF NOT v_legacy THEN
    IF pg_catalog.jsonb_typeof(v_level_json) IS DISTINCT FROM 'string' THEN
      RETURN QUERY SELECT false, false, false, false, false, false, false;
      RETURN;
    END IF;

    v_level := v_permissions->>'level';
    IF v_level NOT IN ('view', 'add', 'edit_own', 'edit_all') THEN
      RETURN QUERY SELECT false, false, false, false, false, false, false;
      RETURN;
    END IF;
  END IF;

  v_raw_module := COALESCE(v_modules->p_modul = 'true'::jsonb, false);
  v_hesaplar := COALESCE(v_modules->'hesaplar' = 'true'::jsonb, false);
  v_cariler := COALESCE(v_modules->'cariler' = 'true'::jsonb, false);
  v_urunler := COALESCE(v_modules->'urunler' = 'true'::jsonb, false);
  v_personel := COALESCE(v_modules->'personel' = 'true'::jsonb, false);
  v_any_source := v_hesaplar OR v_cariler OR v_urunler OR v_personel;

  v_visible := CASE p_modul
    WHEN 'dashboard' THEN
      COALESCE(v_modules->'raporlar' = 'true'::jsonb, false)
    WHEN 'hesaplar' THEN v_hesaplar
    WHEN 'cariler' THEN v_cariler
    WHEN 'urunler' THEN v_urunler
    WHEN 'personel' THEN v_personel
    WHEN 'raporlar' THEN
      COALESCE(v_modules->'raporlar' = 'true'::jsonb, false)
    WHEN 'notlar' THEN
      COALESCE(v_modules->'notlar' = 'true'::jsonb, false)
      OR (
        v_legacy
        AND (
          v_modules IS NULL
          OR v_modules = 'null'::jsonb
          OR (
            pg_catalog.jsonb_typeof(v_modules) = 'object'
            AND NOT (v_modules ? 'notlar')
          )
        )
      )
    WHEN 'birikim' THEN
      v_hesaplar
      AND (
        COALESCE(v_modules->'birikim' = 'true'::jsonb, false)
        OR (
          v_legacy
          AND (
            v_modules IS NULL
            OR v_modules = 'null'::jsonb
            OR (
              pg_catalog.jsonb_typeof(v_modules) = 'object'
              AND NOT (v_modules ? 'birikim')
            )
          )
        )
      )
    WHEN 'islemler' THEN v_any_source
    WHEN 'ileri_tarihli' THEN v_any_source
    WHEN 'arsiv' THEN v_any_source
    ELSE false
  END;

  IF NOT v_visible THEN
    RETURN QUERY SELECT false, false, false, false, false, false, false;
    RETURN;
  END IF;

  -- Rapor/dashboard salt-okunur; arsiv mutasyonu kaydin kaynak modulunden yapilir.
  v_mutation_surface :=
    v_raw_module
    OR (p_modul IN ('islemler', 'ileri_tarihli') AND v_any_source);
  IF p_modul IN ('dashboard', 'raporlar', 'arsiv') THEN
    v_mutation_surface := false;
  END IF;

  IF NOT v_mutation_surface THEN
    RETURN QUERY SELECT true, false, false, false, false, false, true;
    RETURN;
  END IF;

  IF NOT v_legacy THEN
    RETURN QUERY SELECT
      true,
      v_level IN ('add', 'edit_own', 'edit_all'),
      v_level IN ('edit_own', 'edit_all'),
      v_level = 'edit_all',
      v_level IN ('edit_own', 'edit_all'),
      v_level = 'edit_all',
      true;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    COALESCE(v_actions->p_modul->'can_create' = 'true'::jsonb, false),
    COALESCE(v_actions->p_modul->'can_update_all' = 'true'::jsonb, false)
      OR COALESCE(v_actions->p_modul->'can_update_own' = 'true'::jsonb, false),
    COALESCE(v_actions->p_modul->'can_update_all' = 'true'::jsonb, false),
    COALESCE(v_actions->p_modul->'can_delete_all' = 'true'::jsonb, false)
      OR COALESCE(v_actions->p_modul->'can_delete_own' = 'true'::jsonb, false),
    COALESCE(v_actions->p_modul->'can_delete_all' = 'true'::jsonb, false),
    true;
END;
$function$;

ALTER FUNCTION internal.etkin_yetki_v2(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.etkin_yetki_v2(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.etkin_yetki_v2(uuid, text)
  TO authenticated;

-- Mevcut imza korunur: eski projection/RPC/izin-kota yuzeyleri de V2 read-all
-- semantigini ayni anda alir.
CREATE OR REPLACE FUNCTION internal.etkin_yetki(
  p_isletme_id uuid,
  p_modul text
)
RETURNS TABLE (
  can_view boolean,
  can_create boolean,
  can_update_own boolean,
  can_update_all boolean,
  can_delete_own boolean,
  can_delete_all boolean,
  can_see_all_users_data boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT permission.can_view,
         permission.can_create,
         permission.can_update_own,
         permission.can_update_all,
         permission.can_delete_own,
         permission.can_delete_all,
         permission.can_see_all_users_data
  FROM internal.etkin_yetki_v2(p_isletme_id, p_modul) AS permission;
$function$;

ALTER FUNCTION internal.etkin_yetki(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.etkin_yetki(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.etkin_yetki(uuid, text) TO authenticated;


-- Personel nakit hareketinde hesap bir mutation modulu degil, yalniz bakiyesiz
-- destek referansidir. Imza ve diger tiplerin eslemesi korunur.
CREATE OR REPLACE FUNCTION internal.islem_tipi_modulu(p_type text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $function$
  SELECT CASE p_type
    WHEN 'gelir'                   THEN ARRAY['hesaplar']
    WHEN 'gider'                   THEN ARRAY['hesaplar']
    WHEN 'transfer'                THEN ARRAY['hesaplar']
    WHEN 'cari_alis'               THEN ARRAY['cariler']
    WHEN 'cari_satis'              THEN ARRAY['cariler']
    WHEN 'cari_alis_iade'          THEN ARRAY['cariler']
    WHEN 'cari_satis_iade'         THEN ARRAY['cariler']
    WHEN 'cari_odeme'              THEN ARRAY['cariler']
    WHEN 'cari_tahsilat'           THEN ARRAY['cariler']
    WHEN 'personel_gider'          THEN ARRAY['personel']
    WHEN 'personel_satis'          THEN ARRAY['personel']
    WHEN 'personel_izin_hakki'     THEN ARRAY['personel']
    WHEN 'personel_izin_kullanimi' THEN ARRAY['personel']
    WHEN 'personel_odeme'          THEN ARRAY['personel']
    WHEN 'personel_tahsilat'       THEN ARRAY['personel']
    ELSE NULL
  END;
$function$;

ALTER FUNCTION internal.islem_tipi_modulu(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.islem_tipi_modulu(text)
  FROM PUBLIC, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2) MUTATION HELPERS: simple level + own/all + created_by NULL kurali.
-- ---------------------------------------------------------------------------
CREATE FUNCTION internal.kayit_mutasyon_izni_v1(
  p_isletme_id uuid,
  p_modul text,
  p_created_by uuid,
  p_action text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE((
    SELECT CASE p_action
      WHEN 'create' THEN
        permission.can_create
        AND p_created_by IS NOT NULL
        AND p_created_by = auth.uid()
      WHEN 'update' THEN
        permission.can_update_all
        OR (
          permission.can_update_own
          AND p_created_by IS NOT NULL
          AND p_created_by = auth.uid()
        )
      WHEN 'delete' THEN
        permission.can_delete_all
        OR (
          permission.can_delete_own
          AND p_created_by IS NOT NULL
          AND p_created_by = auth.uid()
        )
      ELSE false
    END
    FROM internal.etkin_yetki_v2(p_isletme_id, p_modul) AS permission
  ), false);
$function$;

ALTER FUNCTION internal.kayit_mutasyon_izni_v1(uuid, text, uuid, text)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.kayit_mutasyon_izni_v1(uuid, text, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION internal.islem_mutasyon_izni_v2(
  p_isletme_id uuid,
  p_type text,
  p_created_by uuid,
  p_action text,
  p_islem_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_modules text[];
  v_module text;
BEGIN
  v_modules := internal.islem_tipi_modulu(p_type);
  IF v_modules IS NULL THEN
    RETURN false;
  END IF;

  FOREACH v_module IN ARRAY v_modules LOOP
    IF NOT internal.kayit_mutasyon_izni_v1(
      p_isletme_id, v_module, p_created_by, p_action
    ) THEN
      RETURN false;
    END IF;
  END LOOP;

  -- Var olan urunlu finansal satir update/delete icin kaynak modul + Urunler.
  IF p_action IN ('update', 'delete')
     AND p_islem_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.urun_hareketler AS movement
       WHERE movement.isletme_id = p_isletme_id
         AND movement.islem_id = p_islem_id
     )
     AND NOT internal.kayit_mutasyon_izni_v1(
       p_isletme_id, 'urunler', p_created_by, p_action
     ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

ALTER FUNCTION internal.islem_mutasyon_izni_v2(
  uuid, text, uuid, text, uuid
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.islem_mutasyon_izni_v2(
  uuid, text, uuid, text, uuid
)
FROM PUBLIC, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3) TENANT / KAYNAK / PASIF KAYIT ZARFLARI
-- ---------------------------------------------------------------------------
CREATE FUNCTION internal.isletme_sahibi_v1(p_isletme_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.isletmeler AS business
       WHERE business.id = p_isletme_id
         AND business.user_id = auth.uid()
     );
$function$;

ALTER FUNCTION internal.isletme_sahibi_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.isletme_sahibi_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION internal.aktif_uye_v1(p_isletme_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND (
       internal.isletme_sahibi_v1(p_isletme_id)
       OR EXISTS (
         SELECT 1
         FROM public.isletme_users AS member
         WHERE member.isletme_id = p_isletme_id
           AND member.user_id = auth.uid()
           AND member.status = 'active'
       )
     );
$function$;

ALTER FUNCTION internal.aktif_uye_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.aktif_uye_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION internal.islem_kaynagi_okunabilir_v1(
  p_isletme_id uuid,
  p_type text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_modules text[] := internal.islem_tipi_modulu(p_type);
  v_module text;
BEGIN
  IF v_modules IS NULL OR NOT internal.aktif_uye_v1(p_isletme_id) THEN
    RETURN false;
  END IF;

  FOREACH v_module IN ARRAY v_modules LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(p_isletme_id, v_module) AS permission
      WHERE permission.can_view IS TRUE
    ) THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$function$;

ALTER FUNCTION internal.islem_kaynagi_okunabilir_v1(uuid, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.islem_kaynagi_okunabilir_v1(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Type-level module access is not enough for a row that points at a passive,
-- cross-tenant or Savings-only source. This row envelope keeps archived-but-
-- active parents readable while treating passive/NULL-active parents as
-- owner-only. Account-source rows remain readable when at least one active
-- non-Savings leg is available; a mixed normal/Savings transfer can therefore
-- stay visible while its closed Savings leg is masked by the projections.
CREATE FUNCTION internal.islem_satiri_okunabilir_v2(
  p_isletme_id uuid,
  p_type text,
  p_hesap_id uuid,
  p_hedef_hesap_id uuid,
  p_cari_id uuid,
  p_personel_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
  v_can_view_savings boolean := false;
BEGIN
  IF NOT internal.islem_kaynagi_okunabilir_v1(p_isletme_id, p_type) THEN
    RETURN false;
  END IF;

  IF v_is_owner THEN
    RETURN true;
  END IF;

  IF p_type IN ('gelir', 'gider', 'transfer') THEN
    SELECT COALESCE(permission.can_view, false)
    INTO v_can_view_savings
    FROM internal.etkin_yetki_v2(
      p_isletme_id, 'birikim'
    ) AS permission;

    RETURN EXISTS (
      SELECT 1
      FROM public.hesaplar AS account
      WHERE account.isletme_id = p_isletme_id
        AND account.id IN (p_hesap_id, p_hedef_hesap_id)
        AND account.is_active IS TRUE
        AND (
          account.type::text <> 'birikim'
          OR v_can_view_savings IS TRUE
        )
    );
  END IF;

  IF p_type IN (
    'cari_alis',
    'cari_satis',
    'cari_alis_iade',
    'cari_satis_iade',
    'cari_odeme',
    'cari_tahsilat'
  ) THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cariler AS customer
      WHERE customer.id = p_cari_id
        AND customer.isletme_id = p_isletme_id
        AND customer.is_active IS TRUE
    );
  END IF;

  IF p_type IN (
    'personel_gider',
    'personel_satis',
    'personel_izin_hakki',
    'personel_izin_kullanimi',
    'personel_odeme',
    'personel_tahsilat'
  ) THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.personel AS employee
      WHERE employee.id = p_personel_id
        AND employee.isletme_id = p_isletme_id
        AND employee.is_active IS TRUE
    );
  END IF;

  RETURN false;
END;
$function$;

ALTER FUNCTION internal.islem_satiri_okunabilir_v2(
  uuid, text, uuid, uuid, uuid, uuid
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.islem_satiri_okunabilir_v2(
  uuid, text, uuid, uuid, uuid, uuid
)
FROM PUBLIC, anon, authenticated, service_role;

-- Supporting account legs are allowed without opening Accounts (Cari/Personel
-- payment pickers need that), but a Savings leg always requires Birikim and
-- every shared leg must still resolve to an active account in this tenant.
CREATE FUNCTION internal.islem_birikim_bacaklari_okunabilir_v1(
  p_isletme_id uuid,
  p_hesap_id uuid,
  p_hedef_hesap_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_can_view_savings boolean := false;
BEGIN
  IF NOT internal.aktif_uye_v1(p_isletme_id) THEN
    RETURN false;
  END IF;

  IF internal.isletme_sahibi_v1(p_isletme_id) THEN
    RETURN true;
  END IF;

  SELECT COALESCE(permission.can_view, false)
  INTO v_can_view_savings
  FROM internal.etkin_yetki_v2(
    p_isletme_id, 'birikim'
  ) AS permission;

  RETURN NOT EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT leg.account_id
      FROM pg_catalog.unnest(
        ARRAY[p_hesap_id, p_hedef_hesap_id]::uuid[]
      ) AS leg(account_id)
      WHERE leg.account_id IS NOT NULL
    ) AS referenced_leg
    LEFT JOIN public.hesaplar AS account
      ON account.id = referenced_leg.account_id
     AND account.isletme_id = p_isletme_id
    WHERE account.id IS NULL
       OR account.is_active IS NOT TRUE
       OR (
         account.type::text = 'birikim'
         AND v_can_view_savings IS NOT TRUE
       )
  );
END;
$function$;

ALTER FUNCTION internal.islem_birikim_bacaklari_okunabilir_v1(
  uuid, uuid, uuid
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.islem_birikim_bacaklari_okunabilir_v1(
  uuid, uuid, uuid
)
FROM PUBLIC, anon, authenticated, service_role;

-- Raw table SELECT exposes every FK/audit/photo column, so it needs a stricter
-- envelope than the masked projections. Normal active account legs remain a
-- deliberate Cari/Personel payment exception; Savings and unrelated secondary
-- Cari/Personel references require their own open module.
CREATE FUNCTION internal.islem_ham_satiri_okunabilir_v1(
  p_isletme_id uuid,
  p_type text,
  p_hesap_id uuid,
  p_hedef_hesap_id uuid,
  p_cari_id uuid,
  p_personel_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF internal.islem_tipi_modulu(p_type) IS NULL
     OR NOT internal.aktif_uye_v1(p_isletme_id) THEN
    RETURN false;
  END IF;

  IF internal.isletme_sahibi_v1(p_isletme_id) THEN
    RETURN true;
  END IF;

  IF NOT internal.islem_satiri_okunabilir_v2(
       p_isletme_id,
       p_type,
       p_hesap_id,
       p_hedef_hesap_id,
       p_cari_id,
       p_personel_id
     )
     OR NOT internal.islem_birikim_bacaklari_okunabilir_v1(
       p_isletme_id,
       p_hesap_id,
       p_hedef_hesap_id
     ) THEN
    RETURN false;
  END IF;

  IF p_cari_id IS NOT NULL AND (
    NOT EXISTS (
      SELECT 1
      FROM public.cariler AS customer
      WHERE customer.id = p_cari_id
        AND customer.isletme_id = p_isletme_id
        AND customer.is_active IS TRUE
    )
    OR (
      p_type NOT IN (
        'cari_alis',
        'cari_satis',
        'cari_alis_iade',
        'cari_satis_iade',
        'cari_odeme',
        'cari_tahsilat'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM internal.etkin_yetki_v2(
          p_isletme_id, 'cariler'
        ) AS customer_permission
        WHERE customer_permission.can_view IS TRUE
      )
    )
  ) THEN
    RETURN false;
  END IF;

  IF p_personel_id IS NOT NULL AND (
    NOT EXISTS (
      SELECT 1
      FROM public.personel AS employee
      WHERE employee.id = p_personel_id
        AND employee.isletme_id = p_isletme_id
        AND employee.is_active IS TRUE
    )
    OR (
      p_type NOT IN (
        'personel_gider',
        'personel_satis',
        'personel_izin_hakki',
        'personel_izin_kullanimi',
        'personel_odeme',
        'personel_tahsilat'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM internal.etkin_yetki_v2(
          p_isletme_id, 'personel'
        ) AS personnel_permission
        WHERE personnel_permission.can_view IS TRUE
      )
    )
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

ALTER FUNCTION internal.islem_ham_satiri_okunabilir_v1(
  uuid, text, uuid, uuid, uuid, uuid
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.islem_ham_satiri_okunabilir_v1(
  uuid, text, uuid, uuid, uuid, uuid
)
FROM PUBLIC, anon, authenticated, service_role;

-- Policy ifadeleri bu dar boolean helper'lari authenticated principal ile
-- cagirir. Tablo satiri veya permissions JSON dondurmezler.
GRANT EXECUTE ON FUNCTION internal.isletme_sahibi_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION internal.aktif_uye_v1(uuid) TO authenticated;
GRANT EXECUTE
ON FUNCTION internal.islem_kaynagi_okunabilir_v1(uuid, text)
TO authenticated;
GRANT EXECUTE
ON FUNCTION internal.islem_satiri_okunabilir_v2(
  uuid, text, uuid, uuid, uuid, uuid
)
TO authenticated;
GRANT EXECUTE
ON FUNCTION internal.islem_ham_satiri_okunabilir_v1(
  uuid, text, uuid, uuid, uuid, uuid
)
TO authenticated;


-- Global arama da temel tabloyu acmadan ayni dar projection seklini kullanir.
CREATE FUNCTION public.search_yetkili_islem_satirlari_v1(
  p_isletme_id uuid,
  p_search_query text DEFAULT NULL,
  p_min_amount numeric DEFAULT NULL,
  p_max_amount numeric DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  isletme_id uuid,
  type text,
  amount numeric,
  description text,
  "date" timestamp without time zone,
  hesap_id uuid,
  hedef_hesap_id uuid,
  kategori_id uuid,
  cari_id uuid,
  personel_id uuid,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  photo_path text,
  date_end text,
  source_ileri_id uuid,
  vade_tarihi date,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  hesap jsonb,
  hedef_hesap jsonb,
  kategori jsonb,
  cari jsonb,
  personel jsonb,
  creator jsonb,
  counterparty_kind text,
  counterparty_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_has_accounts boolean := false;
  v_has_customers boolean := false;
  v_has_personnel boolean := false;
  v_has_products boolean := false;
  v_has_savings boolean := false;
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
  v_search_pattern text;
BEGIN
  IF p_isletme_id IS NULL
     OR p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 100
     OR pg_catalog.char_length(COALESCE(p_search_query, '')) > 200
     OR p_min_amount = 'NaN'::numeric
     OR p_min_amount = 'Infinity'::numeric
     OR p_min_amount = '-Infinity'::numeric
     OR p_max_amount = 'NaN'::numeric
     OR p_max_amount = 'Infinity'::numeric
     OR p_max_amount = '-Infinity'::numeric
     OR (
       p_min_amount IS NOT NULL
       AND p_max_amount IS NOT NULL
       AND p_min_amount > p_max_amount
     )
     OR (
       p_date_from IS NOT NULL
       AND p_date_to IS NOT NULL
       AND p_date_from > p_date_to
     )
     OR NOT internal.aktif_uye_v1(p_isletme_id) THEN
    RAISE EXCEPTION 'TRANSACTION_SEARCH_INVALID_INPUT_OR_ACCESS'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(pg_catalog.btrim(p_search_query), '') IS NOT NULL THEN
    v_search_pattern := '%'
      || pg_catalog.replace(
        pg_catalog.replace(
          pg_catalog.replace(
            pg_catalog.btrim(p_search_query),
            E'\\',
            E'\\\\'
          ),
          '%',
          E'\\%'
        ),
        '_',
        E'\\_'
      )
      || '%';
  END IF;

  SELECT
    COALESCE(account_permission.can_view, false),
    COALESCE(customer_permission.can_view, false),
    COALESCE(personnel_permission.can_view, false),
    COALESCE(product_permission.can_view, false),
    COALESCE(savings_permission.can_view, false)
  INTO
    v_has_accounts,
    v_has_customers,
    v_has_personnel,
    v_has_products,
    v_has_savings
  FROM internal.etkin_yetki_v2(
    p_isletme_id, 'hesaplar'
  ) AS account_permission
  CROSS JOIN internal.etkin_yetki_v2(
    p_isletme_id, 'cariler'
  ) AS customer_permission
  CROSS JOIN internal.etkin_yetki_v2(
    p_isletme_id, 'personel'
  ) AS personnel_permission
  CROSS JOIN internal.etkin_yetki_v2(
    p_isletme_id, 'urunler'
  ) AS product_permission
  CROSS JOIN internal.etkin_yetki_v2(
    p_isletme_id, 'birikim'
  ) AS savings_permission;

  RETURN QUERY
  SELECT
    transaction_row.id,
    transaction_row.isletme_id,
    transaction_row.type::text,
    transaction_row.amount,
    transaction_row.description,
    transaction_row.date::timestamp without time zone,
    CASE
      WHEN v_has_accounts IS TRUE
       AND source_account.id IS NOT NULL
       AND (source_account.is_active IS TRUE OR v_is_owner)
       AND (
         source_account.type::text <> 'birikim'
         OR v_has_savings IS TRUE
         OR v_is_owner IS TRUE
       )
        THEN transaction_row.hesap_id
      ELSE NULL::uuid
    END,
    CASE
      WHEN v_has_accounts IS TRUE
       AND target_account.id IS NOT NULL
       AND (target_account.is_active IS TRUE OR v_is_owner)
       AND (
         target_account.type::text <> 'birikim'
         OR v_has_savings IS TRUE
         OR v_is_owner IS TRUE
       )
        THEN transaction_row.hedef_hesap_id
      ELSE NULL::uuid
    END,
    transaction_row.kategori_id,
    CASE
      WHEN v_has_customers IS TRUE
       AND customer.id IS NOT NULL
       AND (customer.is_active IS TRUE OR v_is_owner)
        THEN transaction_row.cari_id
      ELSE NULL::uuid
    END,
    CASE
      WHEN v_has_personnel IS TRUE
       AND employee.id IS NOT NULL
       AND (employee.is_active IS TRUE OR v_is_owner)
        THEN transaction_row.personel_id
      ELSE NULL::uuid
    END,
    transaction_row.source_currency::text,
    transaction_row.target_currency::text,
    transaction_row.exchange_rate,
    CASE
      WHEN internal.islem_satiri_okunabilir_v2(
             transaction_row.isletme_id,
             transaction_row.type::text,
             transaction_row.hesap_id,
             transaction_row.hedef_hesap_id,
             transaction_row.cari_id,
             transaction_row.personel_id
           )
       AND internal.islem_birikim_bacaklari_okunabilir_v1(
             transaction_row.isletme_id,
             transaction_row.hesap_id,
             transaction_row.hedef_hesap_id
           )
       AND transaction_row.photo_path ~ (
        '^'
        || p_isletme_id::text
        || '/'
        || transaction_row.id::text
        || '_[0-9]{10,20}[.]webp$'
      ) THEN transaction_row.photo_path
      ELSE NULL::text
    END,
    transaction_row.date_end,
    transaction_row.source_ileri_id,
    transaction_row.vade_tarihi,
    transaction_row.created_by,
    CASE
      WHEN v_is_owner THEN transaction_row.updated_by
      ELSE NULL::uuid
    END,
    transaction_row.created_at,
    transaction_row.updated_at,
    CASE
      WHEN v_has_accounts IS NOT TRUE
        OR source_account.id IS NULL
        OR (source_account.is_active IS NOT TRUE AND NOT v_is_owner)
        OR (
          source_account.type::text = 'birikim'
          AND v_has_savings IS NOT TRUE
          AND v_is_owner IS NOT TRUE
        )
        THEN NULL::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'id', source_account.id,
        'name', source_account.name,
        'currency', source_account.currency,
        'type', source_account.type
      )
    END,
    CASE
      WHEN v_has_accounts IS NOT TRUE
        OR target_account.id IS NULL
        OR (target_account.is_active IS NOT TRUE AND NOT v_is_owner)
        OR (
          target_account.type::text = 'birikim'
          AND v_has_savings IS NOT TRUE
          AND v_is_owner IS NOT TRUE
        )
        THEN NULL::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'id', target_account.id,
        'name', target_account.name,
        'currency', target_account.currency,
        'type', target_account.type
      )
    END,
    CASE
      WHEN category.id IS NULL THEN NULL::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'id', category.id,
        'name', category.name,
        'type', category.type,
        'color', category.color
      )
    END,
    CASE
      WHEN v_has_customers IS NOT TRUE
        OR customer.id IS NULL
        OR (customer.is_active IS NOT TRUE AND NOT v_is_owner)
        THEN NULL::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'id', customer.id,
        'name', customer.name,
        'type', customer.type
      )
    END,
    CASE
      WHEN v_has_personnel IS NOT TRUE
        OR employee.id IS NULL
        OR (employee.is_active IS NOT TRUE AND NOT v_is_owner)
        THEN NULL::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'id', employee.id,
        'first_name', employee.first_name,
        'last_name', employee.last_name
      )
    END,
    CASE
      WHEN transaction_row.created_by IS NULL THEN NULL::jsonb
      WHEN transaction_row.created_by = business.user_id THEN
        pg_catalog.jsonb_build_object(
          'display_name', 'İşletme sahibi'
        )
      WHEN creator_member.user_id IS NOT NULL THEN
        pg_catalog.jsonb_build_object(
          'display_name',
          COALESCE(
            NULLIF(pg_catalog.btrim(creator_member.member_label), ''),
            'Ortak kullanıcı'
          )
        )
      ELSE pg_catalog.jsonb_build_object(
        'display_name', 'Eski kullanıcı'
      )
    END,
    CASE
      WHEN v_has_customers IS NOT TRUE
       AND customer.id IS NOT NULL
       AND customer.is_active IS TRUE
       AND EXISTS (
         SELECT 1
         FROM public.urun_hareketler AS label_movement
         INNER JOIN public.urunler AS label_product
           ON label_product.id = label_movement.urun_id
          AND label_product.isletme_id = label_movement.isletme_id
         WHERE label_movement.isletme_id = transaction_row.isletme_id
           AND label_movement.islem_id = transaction_row.id
           AND label_product.is_active IS TRUE
       )
        THEN 'cari'::text
      WHEN v_has_accounts IS NOT TRUE
       AND transaction_row.type::text IN (
         'cari_odeme',
         'cari_tahsilat',
         'personel_odeme',
         'personel_tahsilat'
       )
       AND source_account.id IS NOT NULL
       AND source_account.is_active IS TRUE
       AND (
         source_account.type::text <> 'birikim'
         OR v_has_savings IS TRUE
       )
        THEN 'hesap'::text
      ELSE NULL::text
    END,
    CASE
      WHEN v_has_customers IS NOT TRUE
       AND customer.id IS NOT NULL
       AND customer.is_active IS TRUE
       AND EXISTS (
         SELECT 1
         FROM public.urun_hareketler AS label_movement
         INNER JOIN public.urunler AS label_product
           ON label_product.id = label_movement.urun_id
          AND label_product.isletme_id = label_movement.isletme_id
         WHERE label_movement.isletme_id = transaction_row.isletme_id
           AND label_movement.islem_id = transaction_row.id
           AND label_product.is_active IS TRUE
       )
        THEN customer.name::text
      WHEN v_has_accounts IS NOT TRUE
       AND transaction_row.type::text IN (
         'cari_odeme',
         'cari_tahsilat',
         'personel_odeme',
         'personel_tahsilat'
       )
       AND source_account.id IS NOT NULL
       AND source_account.is_active IS TRUE
       AND (
         source_account.type::text <> 'birikim'
         OR v_has_savings IS TRUE
       )
        THEN source_account.name::text
      ELSE NULL::text
    END
  FROM public.islemler AS transaction_row
  INNER JOIN public.isletmeler AS business
    ON business.id = transaction_row.isletme_id
  LEFT JOIN public.hesaplar AS source_account
    ON source_account.id = transaction_row.hesap_id
   AND source_account.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.hesaplar AS target_account
    ON target_account.id = transaction_row.hedef_hesap_id
   AND target_account.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.kategoriler AS category
    ON category.id = transaction_row.kategori_id
   AND category.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.cariler AS customer
    ON customer.id = transaction_row.cari_id
   AND customer.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.personel AS employee
    ON employee.id = transaction_row.personel_id
   AND employee.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.isletme_users AS creator_member
    ON creator_member.isletme_id = transaction_row.isletme_id
   AND creator_member.user_id = transaction_row.created_by
  WHERE transaction_row.isletme_id = p_isletme_id
    AND (
      internal.islem_satiri_okunabilir_v2(
        transaction_row.isletme_id,
        transaction_row.type::text,
        transaction_row.hesap_id,
        transaction_row.hedef_hesap_id,
        transaction_row.cari_id,
        transaction_row.personel_id
      )
      OR (
        v_has_products IS TRUE
        AND EXISTS (
          SELECT 1
          FROM public.urun_hareketler AS movement
          INNER JOIN public.urunler AS product
            ON product.id = movement.urun_id
           AND product.isletme_id = movement.isletme_id
          WHERE movement.isletme_id = transaction_row.isletme_id
            AND movement.islem_id = transaction_row.id
            AND (product.is_active IS TRUE OR v_is_owner)
        )
      )
    )
    AND (
      p_min_amount IS NULL
      OR transaction_row.amount >= p_min_amount
    )
    AND (
      p_max_amount IS NULL
      OR transaction_row.amount <= p_max_amount
    )
    AND (
      p_date_from IS NULL
      OR transaction_row.date::date >= p_date_from
    )
    AND (
      p_date_to IS NULL
      OR transaction_row.date::date <= p_date_to
    )
    AND (
      NULLIF(pg_catalog.btrim(p_search_query), '') IS NULL
      OR COALESCE(transaction_row.description, '') ILIKE
        v_search_pattern ESCAPE E'\\'
      OR (
        (
          v_has_accounts IS TRUE
          OR transaction_row.type::text IN (
            'cari_odeme',
            'cari_tahsilat',
            'personel_odeme',
            'personel_tahsilat'
          )
        )
        AND
        (source_account.is_active IS TRUE OR v_is_owner)
        AND (
          source_account.type::text <> 'birikim'
          OR v_has_savings IS TRUE
          OR v_is_owner IS TRUE
        )
        AND COALESCE(source_account.name, '') ILIKE
          v_search_pattern ESCAPE E'\\'
      )
      OR (
        v_has_accounts IS TRUE
        AND
        (target_account.is_active IS TRUE OR v_is_owner)
        AND (
          target_account.type::text <> 'birikim'
          OR v_has_savings IS TRUE
          OR v_is_owner IS TRUE
        )
        AND COALESCE(target_account.name, '') ILIKE
          v_search_pattern ESCAPE E'\\'
      )
      OR COALESCE(category.name, '') ILIKE
        v_search_pattern ESCAPE E'\\'
      OR (
        (
          v_has_customers IS TRUE
          OR EXISTS (
            SELECT 1
            FROM public.urun_hareketler AS search_movement
            INNER JOIN public.urunler AS search_product
              ON search_product.id = search_movement.urun_id
             AND search_product.isletme_id = search_movement.isletme_id
            WHERE search_movement.isletme_id = transaction_row.isletme_id
              AND search_movement.islem_id = transaction_row.id
              AND search_product.is_active IS TRUE
          )
        )
        AND (customer.is_active IS TRUE OR v_is_owner)
        AND COALESCE(customer.name, '') ILIKE
          v_search_pattern ESCAPE E'\\'
      )
      OR (
        v_has_personnel IS TRUE
        AND (employee.is_active IS TRUE OR v_is_owner)
        AND pg_catalog.concat_ws(
          ' ',
          employee.first_name,
          NULLIF(employee.last_name, '')
        ) ILIKE v_search_pattern ESCAPE E'\\'
      )
      OR (
        CASE
          WHEN transaction_row.created_by = business.user_id
            THEN 'İşletme sahibi'
          WHEN creator_member.user_id IS NOT NULL
            THEN COALESCE(
              NULLIF(pg_catalog.btrim(creator_member.member_label), ''),
              'Ortak kullanıcı'
            )
          ELSE 'Eski kullanıcı'
        END
      ) ILIKE v_search_pattern ESCAPE E'\\'
    )
  ORDER BY
    transaction_row.date::timestamp without time zone DESC,
    transaction_row.id DESC
  LIMIT p_limit;
END;
$function$;

ALTER FUNCTION public.search_yetkili_islem_satirlari_v1(
  uuid, text, numeric, numeric, date, date, integer
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.search_yetkili_islem_satirlari_v1(
  uuid, text, numeric, numeric, date, date, integer
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.search_yetkili_islem_satirlari_v1(
  uuid, text, numeric, numeric, date, date, integer
)
TO authenticated;

GRANT EXECUTE
ON FUNCTION internal.kayit_mutasyon_izni_v1(uuid, text, uuid, text)
TO authenticated;
GRANT EXECUTE
ON FUNCTION internal.islem_mutasyon_izni_v2(uuid, text, uuid, text, uuid)
TO authenticated;

-- Acik entity modulu = creator filtresiz read-all. Raporlar-only rol bu temel
-- tablolari direct REST/SELECT ile acamaz; yalniz dar SECURITY DEFINER rapor
-- RPC'lerinden toplamlari gorebilir. Pasif satirlar asagidaki RESTRICTIVE zarf
-- nedeniyle yine yalniz owner'a aittir.
CREATE POLICY "Permission v2 read hesaplar"
ON public.hesaplar
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM internal.etkin_yetki_v2(hesaplar.isletme_id, 'hesaplar') AS p
    WHERE p.can_view IS TRUE
  )
  AND (
    hesaplar.type::text <> 'birikim'
    OR internal.isletme_sahibi_v1(hesaplar.isletme_id)
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        hesaplar.isletme_id, 'birikim'
      ) AS savings_permission
      WHERE savings_permission.can_view IS TRUE
    )
  )
);

CREATE POLICY "Permission v2 read cariler"
ON public.cariler
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM internal.etkin_yetki_v2(cariler.isletme_id, 'cariler') AS p
    WHERE p.can_view IS TRUE
  )
);

CREATE POLICY "Permission v2 read personel"
ON public.personel
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM internal.etkin_yetki_v2(personel.isletme_id, 'personel') AS p
    WHERE p.can_view IS TRUE
  )
);

CREATE POLICY "Permission v2 read urunler"
ON public.urunler
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM internal.etkin_yetki_v2(urunler.isletme_id, 'urunler') AS p
    WHERE p.can_view IS TRUE
  )
);

CREATE POLICY "Permission v2 passive hesaplar owner only"
ON public.hesaplar
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  (
    hesaplar.is_active IS TRUE
    OR internal.isletme_sahibi_v1(hesaplar.isletme_id)
  )
  AND (
    hesaplar.type::text <> 'birikim'
    OR internal.isletme_sahibi_v1(hesaplar.isletme_id)
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        hesaplar.isletme_id, 'birikim'
      ) AS savings_permission
      WHERE savings_permission.can_view IS TRUE
    )
  )
)
WITH CHECK (
  (
    hesaplar.is_active IS TRUE
    OR internal.isletme_sahibi_v1(hesaplar.isletme_id)
  )
  AND (
    hesaplar.type::text <> 'birikim'
    OR internal.isletme_sahibi_v1(hesaplar.isletme_id)
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        hesaplar.isletme_id, 'birikim'
      ) AS savings_permission
      WHERE savings_permission.can_view IS TRUE
    )
  )
);

CREATE POLICY "Permission v2 passive cariler owner only"
ON public.cariler
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  cariler.is_active IS TRUE
  OR internal.isletme_sahibi_v1(cariler.isletme_id)
)
WITH CHECK (
  cariler.is_active IS TRUE
  OR internal.isletme_sahibi_v1(cariler.isletme_id)
);

CREATE POLICY "Permission v2 passive personel owner only"
ON public.personel
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  personel.is_active IS TRUE
  OR internal.isletme_sahibi_v1(personel.isletme_id)
)
WITH CHECK (
  personel.is_active IS TRUE
  OR internal.isletme_sahibi_v1(personel.isletme_id)
);

CREATE POLICY "Permission v2 passive urunler owner only"
ON public.urunler
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  urunler.is_active IS TRUE
  OR internal.isletme_sahibi_v1(urunler.isletme_id)
)
WITH CHECK (
  urunler.is_active IS TRUE
  OR internal.isletme_sahibi_v1(urunler.isletme_id)
);

-- A permissive legacy Product policy can otherwise expose every movement in
-- the tenant, including rows whose product is now passive/NULL-active. Keep
-- archived-but-active product history readable, but make passive history
-- owner-only for direct REST and every movement shape (linked or manual).
CREATE POLICY "Permission v2 active urun hareketleri owner only"
ON public.urun_hareketler
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  internal.isletme_sahibi_v1(urun_hareketler.isletme_id)
  OR EXISTS (
    SELECT 1
    FROM public.urunler AS product
    WHERE product.id = urun_hareketler.urun_id
      AND product.isletme_id = urun_hareketler.isletme_id
      AND product.is_active IS TRUE
  )
);

-- Raw movement DML cannot keep urunler.miktar and movement history atomic.
-- Owners retain the 1.5.x direct-table compatibility path. Shared users must
-- use the three SECURITY DEFINER V2 RPCs, whose own authorization and row locks
-- update both legs in one PostgreSQL transaction. FK cascade cleanup is an
-- internal referential action and is not an authenticated direct-table write.
CREATE POLICY "Permission v2 direct insert urun hareketleri owner only"
ON public.urun_hareketler
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  internal.isletme_sahibi_v1(urun_hareketler.isletme_id)
);

CREATE POLICY "Permission v2 direct update urun hareketleri owner only"
ON public.urun_hareketler
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  internal.isletme_sahibi_v1(urun_hareketler.isletme_id)
)
WITH CHECK (
  internal.isletme_sahibi_v1(urun_hareketler.isletme_id)
);

CREATE POLICY "Permission v2 direct delete urun hareketleri owner only"
ON public.urun_hareketler
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  internal.isletme_sahibi_v1(urun_hareketler.isletme_id)
);

ALTER FUNCTION public.create_urun_hareket_atomik_v2(uuid, jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.update_urun_hareket_atomik_v2(uuid, uuid, jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.delete_urun_hareket_atomik_v2(uuid, uuid)
  OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.create_urun_hareket_atomik_v2(uuid, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL
ON FUNCTION public.update_urun_hareket_atomik_v2(uuid, uuid, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL
ON FUNCTION public.delete_urun_hareket_atomik_v2(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.create_urun_hareket_atomik_v2(uuid, jsonb)
TO authenticated;
GRANT EXECUTE
ON FUNCTION public.update_urun_hareket_atomik_v2(uuid, uuid, jsonb)
TO authenticated;
GRANT EXECUTE
ON FUNCTION public.delete_urun_hareket_atomik_v2(uuid, uuid)
TO authenticated;

-- Modern simple-level mutation policy'leri. Eski permissive action policy'leri
-- silinmez; bu yeni yol modern rollerin own/all semantigini verir.
CREATE POLICY "Permission v2 insert hesaplar"
ON public.hesaplar
FOR INSERT
TO authenticated
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    hesaplar.isletme_id, 'hesaplar', hesaplar.created_by, 'create'
  )
  AND (
    hesaplar.type::text <> 'birikim'
    OR internal.isletme_sahibi_v1(hesaplar.isletme_id)
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        hesaplar.isletme_id, 'birikim'
      ) AS savings_permission
      WHERE savings_permission.can_view IS TRUE
    )
  )
);

CREATE POLICY "Permission v2 update hesaplar"
ON public.hesaplar
FOR UPDATE
TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    hesaplar.isletme_id, 'hesaplar', hesaplar.created_by, 'update'
  )
  AND (
    hesaplar.type::text <> 'birikim'
    OR internal.isletme_sahibi_v1(hesaplar.isletme_id)
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        hesaplar.isletme_id, 'birikim'
      ) AS savings_permission
      WHERE savings_permission.can_view IS TRUE
    )
  )
)
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    hesaplar.isletme_id, 'hesaplar', hesaplar.created_by, 'update'
  )
  AND (
    hesaplar.type::text <> 'birikim'
    OR internal.isletme_sahibi_v1(hesaplar.isletme_id)
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        hesaplar.isletme_id, 'birikim'
      ) AS savings_permission
      WHERE savings_permission.can_view IS TRUE
    )
  )
);

CREATE POLICY "Permission v2 delete hesaplar"
ON public.hesaplar
FOR DELETE
TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    hesaplar.isletme_id, 'hesaplar', hesaplar.created_by, 'delete'
  )
  AND (
    hesaplar.type::text <> 'birikim'
    OR internal.isletme_sahibi_v1(hesaplar.isletme_id)
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        hesaplar.isletme_id, 'birikim'
      ) AS savings_permission
      WHERE savings_permission.can_view IS TRUE
    )
  )
);

CREATE POLICY "Permission v2 insert cariler"
ON public.cariler
FOR INSERT
TO authenticated
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    cariler.isletme_id, 'cariler', cariler.created_by, 'create'
  )
);

CREATE POLICY "Permission v2 update cariler"
ON public.cariler
FOR UPDATE
TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    cariler.isletme_id, 'cariler', cariler.created_by, 'update'
  )
)
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    cariler.isletme_id, 'cariler', cariler.created_by, 'update'
  )
);

CREATE POLICY "Permission v2 delete cariler"
ON public.cariler
FOR DELETE
TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    cariler.isletme_id, 'cariler', cariler.created_by, 'delete'
  )
);

CREATE POLICY "Permission v2 insert personel"
ON public.personel
FOR INSERT
TO authenticated
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    personel.isletme_id, 'personel', personel.created_by, 'create'
  )
);

CREATE POLICY "Permission v2 update personel"
ON public.personel
FOR UPDATE
TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    personel.isletme_id, 'personel', personel.created_by, 'update'
  )
)
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    personel.isletme_id, 'personel', personel.created_by, 'update'
  )
);

CREATE POLICY "Permission v2 delete personel"
ON public.personel
FOR DELETE
TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    personel.isletme_id, 'personel', personel.created_by, 'delete'
  )
);

CREATE POLICY "Permission v2 insert urunler"
ON public.urunler
FOR INSERT
TO authenticated
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    urunler.isletme_id, 'urunler', urunler.created_by, 'create'
  )
);

CREATE POLICY "Permission v2 update urunler"
ON public.urunler
FOR UPDATE
TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    urunler.isletme_id, 'urunler', urunler.created_by, 'update'
  )
)
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    urunler.isletme_id, 'urunler', urunler.created_by, 'update'
  )
);

CREATE POLICY "Permission v2 delete urunler"
ON public.urunler
FOR DELETE
TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    urunler.isletme_id, 'urunler', urunler.created_by, 'delete'
  )
);

-- Eski permissive JSON action policy'leri OR ile modern seviyeyi asamasin;
-- exact action helper ayni anda RESTRICTIVE sonuc zarfi olur.
CREATE POLICY "Permission v2 insert gate hesaplar"
ON public.hesaplar AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    hesaplar.isletme_id, 'hesaplar', hesaplar.created_by, 'create'
  )
  AND (
    hesaplar.type::text <> 'birikim'
    OR internal.isletme_sahibi_v1(hesaplar.isletme_id)
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        hesaplar.isletme_id, 'birikim'
      ) AS savings_permission
      WHERE savings_permission.can_view IS TRUE
    )
  )
);
CREATE POLICY "Permission v2 update gate hesaplar"
ON public.hesaplar AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    hesaplar.isletme_id, 'hesaplar', hesaplar.created_by, 'update'
  )
  AND (
    hesaplar.type::text <> 'birikim'
    OR internal.isletme_sahibi_v1(hesaplar.isletme_id)
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        hesaplar.isletme_id, 'birikim'
      ) AS savings_permission
      WHERE savings_permission.can_view IS TRUE
    )
  )
)
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    hesaplar.isletme_id, 'hesaplar', hesaplar.created_by, 'update'
  )
  AND (
    hesaplar.type::text <> 'birikim'
    OR internal.isletme_sahibi_v1(hesaplar.isletme_id)
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        hesaplar.isletme_id, 'birikim'
      ) AS savings_permission
      WHERE savings_permission.can_view IS TRUE
    )
  )
);
CREATE POLICY "Permission v2 delete gate hesaplar"
ON public.hesaplar AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    hesaplar.isletme_id, 'hesaplar', hesaplar.created_by, 'delete'
  )
  AND (
    hesaplar.type::text <> 'birikim'
    OR internal.isletme_sahibi_v1(hesaplar.isletme_id)
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        hesaplar.isletme_id, 'birikim'
      ) AS savings_permission
      WHERE savings_permission.can_view IS TRUE
    )
  )
);

CREATE POLICY "Permission v2 insert gate cariler"
ON public.cariler AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    cariler.isletme_id, 'cariler', cariler.created_by, 'create'
  )
);
CREATE POLICY "Permission v2 update gate cariler"
ON public.cariler AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    cariler.isletme_id, 'cariler', cariler.created_by, 'update'
  )
)
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    cariler.isletme_id, 'cariler', cariler.created_by, 'update'
  )
);
CREATE POLICY "Permission v2 delete gate cariler"
ON public.cariler AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    cariler.isletme_id, 'cariler', cariler.created_by, 'delete'
  )
);

CREATE POLICY "Permission v2 insert gate personel"
ON public.personel AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    personel.isletme_id, 'personel', personel.created_by, 'create'
  )
);
CREATE POLICY "Permission v2 update gate personel"
ON public.personel AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    personel.isletme_id, 'personel', personel.created_by, 'update'
  )
)
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    personel.isletme_id, 'personel', personel.created_by, 'update'
  )
);
CREATE POLICY "Permission v2 delete gate personel"
ON public.personel AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    personel.isletme_id, 'personel', personel.created_by, 'delete'
  )
);

CREATE POLICY "Permission v2 insert gate urunler"
ON public.urunler AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    urunler.isletme_id, 'urunler', urunler.created_by, 'create'
  )
  AND (
    urunler.miktar IS NOT DISTINCT FROM 0
    OR internal.isletme_sahibi_v1(urunler.isletme_id)
  )
);
CREATE POLICY "Permission v2 update gate urunler"
ON public.urunler AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    urunler.isletme_id, 'urunler', urunler.created_by, 'update'
  )
)
WITH CHECK (
  internal.kayit_mutasyon_izni_v1(
    urunler.isletme_id, 'urunler', urunler.created_by, 'update'
  )
);
CREATE POLICY "Permission v2 delete gate urunler"
ON public.urunler AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  internal.kayit_mutasyon_izni_v1(
    urunler.isletme_id, 'urunler', urunler.created_by, 'delete'
  )
);

-- urunler.miktar yalniz urun_hareketler ile ayni transaction'da calisan
-- SECURITY DEFINER stok RPC'leri tarafindan degistirilir. Authenticated
-- istemciler metadata alanlarini mevcut RLS own/all kapisiyla duzenlemeye devam
-- eder; identity, tenant, miktar ve audit kolonlari direct PATCH'e kapatilir.
-- service_role tablo grant'i temiz kurulumlarda Supabase varsayimina bagli
-- birakilmaz; postgres sahiplik yetkisiyle birlikte server-side stok akislari
-- acik kalir.
REVOKE UPDATE
ON TABLE public.urunler
FROM PUBLIC, anon, authenticated;

GRANT UPDATE
ON TABLE public.urunler
TO service_role;

GRANT UPDATE (
  ad,
  kod,
  birim,
  alis_fiyati,
  satis_fiyati,
  currency,
  aciklama,
  is_active,
  is_archived,
  kategori_id,
  kdv_orani
)
ON TABLE public.urunler
TO authenticated;

-- is_active gecisini RLS'in OLD/NEW karsilastiramadigi yerde kapatir. Trigger
-- migration sirasinda hicbir satiri calistirmaz.
CREATE FUNCTION internal.enforce_owner_only_active_toggle_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.is_active IS DISTINCT FROM OLD.is_active
     AND NOT internal.isletme_sahibi_v1(OLD.isletme_id) THEN
    RAISE EXCEPTION 'PASSIVE_STATE_OWNER_ONLY'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION internal.enforce_owner_only_active_toggle_v1()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.enforce_owner_only_active_toggle_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_hesaplar_active_owner_v1
BEFORE UPDATE OF is_active ON public.hesaplar
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_owner_only_active_toggle_v1();

CREATE TRIGGER trg_cariler_active_owner_v1
BEFORE UPDATE OF is_active ON public.cariler
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_owner_only_active_toggle_v1();

CREATE TRIGGER trg_personel_active_owner_v1
BEFORE UPDATE OF is_active ON public.personel
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_owner_only_active_toggle_v1();

CREATE TRIGGER trg_urunler_active_owner_v1
BEFORE UPDATE OF is_active ON public.urunler
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_owner_only_active_toggle_v1();

-- A row's primary key and tenant are identity, not editable business fields.
-- RLS evaluates OLD and NEW independently, so a user authorized in two
-- businesses could otherwise move a row between them. Product movements also
-- have a direct UPDATE path and share the same invariant. Notes already carry
-- the equivalent enforce_notlar_identity_v1 guard from the prior migration.
CREATE FUNCTION internal.enforce_tenant_row_identity_immutable_v1()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.isletme_id IS DISTINCT FROM OLD.isletme_id THEN
    RAISE EXCEPTION 'TENANT_ROW_IDENTITY_IMMUTABLE'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION internal.enforce_tenant_row_identity_immutable_v1()
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.enforce_tenant_row_identity_immutable_v1()
FROM PUBLIC, anon, authenticated, service_role;

-- Product movement updates may change quantity/price/date through the atomic
-- RPC, but never re-parent an existing ledger row to another product or
-- transaction.
CREATE FUNCTION internal.enforce_product_movement_identity_immutable_v1()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Business hard-delete can cascade through islemler first and invoke the
  -- islem_id SET NULL action before urun_hareketler itself is deleted.
  IF NOT EXISTS (
    SELECT 1
    FROM public.isletmeler AS business
    WHERE business.id = OLD.isletme_id
  ) THEN
    RETURN NEW;
  END IF;

  -- The FK islem_id -> islemler uses ON DELETE SET NULL. Accept only that
  -- narrow cleanup: immutable movement identity, non-NULL -> NULL link, and
  -- the same-tenant OLD transaction is already absent. A direct detach while
  -- the transaction still exists, or any re-parent to another id, is rejected
  -- by the generic identity guard below.
  IF (NEW.id, NEW.isletme_id, NEW.urun_id)
       IS NOT DISTINCT FROM (OLD.id, OLD.isletme_id, OLD.urun_id)
     AND OLD.islem_id IS NOT NULL
     AND NEW.islem_id IS NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.islemler AS transaction_row
       WHERE transaction_row.id = OLD.islem_id
         AND transaction_row.isletme_id = OLD.isletme_id
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.isletme_id IS DISTINCT FROM OLD.isletme_id
     OR NEW.urun_id IS DISTINCT FROM OLD.urun_id
     OR NEW.islem_id IS DISTINCT FROM OLD.islem_id THEN
    RAISE EXCEPTION 'PRODUCT_MOVEMENT_IDENTITY_IMMUTABLE'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION internal.enforce_product_movement_identity_immutable_v1()
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.enforce_product_movement_identity_immutable_v1()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_permission_v2_identity_immutable_hesaplar
BEFORE UPDATE ON public.hesaplar
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_tenant_row_identity_immutable_v1();

CREATE TRIGGER trg_permission_v2_identity_immutable_cariler
BEFORE UPDATE ON public.cariler
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_tenant_row_identity_immutable_v1();

CREATE TRIGGER trg_permission_v2_identity_immutable_personel
BEFORE UPDATE ON public.personel
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_tenant_row_identity_immutable_v1();

CREATE TRIGGER trg_permission_v2_identity_immutable_urunler
BEFORE UPDATE ON public.urunler
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_tenant_row_identity_immutable_v1();

CREATE TRIGGER trg_permission_v2_identity_immutable_kategoriler
BEFORE UPDATE ON public.kategoriler
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_tenant_row_identity_immutable_v1();

CREATE TRIGGER trg_permission_v2_identity_immutable_ileri_tarihli_islemler
BEFORE UPDATE ON public.ileri_tarihli_islemler
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_tenant_row_identity_immutable_v1();

CREATE TRIGGER trg_permission_v2_identity_immutable_urun_hareketler
BEFORE UPDATE ON public.urun_hareketler
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_product_movement_identity_immutable_v1();

-- Serialize contextual-note attachment against parent deletion. The same
-- function keeps its public signature for old clients; only relation changes
-- validate/lock the parent, so ordinary content/assignment edits are unchanged.
-- Direct authenticated contextual -> general detaches are rejected. The entity
-- delete trigger below opens a row-exact transaction-local context while it
-- performs the authoritative detach in the parent DELETE statement.
CREATE OR REPLACE FUNCTION public.enforce_notlar_identity_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_validate_entity boolean := false;
  v_validate_cari_assignment boolean := false;
  v_validate_personel_assignment boolean := false;
  v_validate_user_assignment boolean := false;
  v_validate_photo boolean := false;
  v_expected_detach_context text;
BEGIN
  IF v_user_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.isletmeler AS actor_business_row
       WHERE actor_business_row.id = NEW.isletme_id
         AND actor_business_row.user_id = v_user_id
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.isletme_users AS actor_member_row
       WHERE actor_member_row.isletme_id = NEW.isletme_id
         AND actor_member_row.user_id = v_user_id
         AND actor_member_row.status = 'active'
     )
  THEN
    RAISE EXCEPTION 'NOTLAR_INVALID_TENANT_CONTEXT'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_user_id IS NOT NULL THEN
      NEW.created_by := v_user_id;
    END IF;

    v_validate_entity := true;
    v_validate_cari_assignment := true;
    v_validate_personel_assignment := true;
    v_validate_user_assignment := true;
    v_validate_photo := NEW.photo_path IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.isletme_id IS DISTINCT FROM OLD.isletme_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'NOTLAR_IMMUTABLE_IDENTITY'
        USING ERRCODE = '42501';
    END IF;

    IF v_user_id IS NOT NULL
       AND OLD.entity_type IN (
         'hesap', 'cari', 'personel', 'personel_izin', 'urun'
       )
       AND OLD.entity_id IS NOT NULL
       AND NEW.entity_type = 'genel'
       AND NEW.entity_id IS NULL
    THEN
      v_expected_detach_context :=
        OLD.isletme_id::text
        || ':'
        || CASE
             WHEN OLD.entity_type = 'personel_izin' THEN 'personel'
             ELSE OLD.entity_type::text
           END
        || ':'
        || OLD.entity_id::text;

      IF pg_catalog.current_setting(
           'internal.permission_v2_note_detach_context',
           true
         ) IS DISTINCT FROM v_expected_detach_context
      THEN
        RAISE EXCEPTION 'NOTLAR_DIRECT_ENTITY_DETACH_FORBIDDEN'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    v_validate_entity :=
      NEW.entity_type IS DISTINCT FROM OLD.entity_type
      OR NEW.entity_id IS DISTINCT FROM OLD.entity_id;
    v_validate_cari_assignment :=
      NEW.assigned_to_cari IS DISTINCT FROM OLD.assigned_to_cari;
    v_validate_personel_assignment :=
      NEW.assigned_to_personel IS DISTINCT FROM OLD.assigned_to_personel;
    v_validate_user_assignment :=
      NEW.assigned_to_user IS DISTINCT FROM OLD.assigned_to_user;
    v_validate_photo :=
      NEW.photo_path IS DISTINCT FROM OLD.photo_path
      AND NEW.photo_path IS NOT NULL;
  END IF;

  IF v_validate_photo
     AND (
       pg_catalog.char_length(NEW.photo_path) > 200
       OR NEW.photo_path !~ (
         '^'
         || NEW.isletme_id::text
         || '/notlar/'
         || NEW.id::text
         || '_[0-9]{10,20}[.]webp$'
       )
       OR NOT EXISTS (
         SELECT 1
         FROM storage.objects AS object_row
         WHERE object_row.bucket_id = 'islem-photos'
           AND object_row.name = NEW.photo_path
           AND (
             v_user_id IS NULL
             OR object_row.owner_id = v_user_id::text
           )
       )
     )
  THEN
    RAISE EXCEPTION 'NOTLAR_INVALID_PHOTO_REFERENCE'
      USING ERRCODE = '23514';
  END IF;

  IF v_validate_entity THEN
    CASE NEW.entity_type
      WHEN 'genel' THEN
        IF NEW.entity_id IS NOT NULL THEN
          RAISE EXCEPTION 'NOTLAR_INVALID_ENTITY_REFERENCE'
            USING ERRCODE = '23514';
        END IF;
      WHEN 'hesap' THEN
        IF NEW.entity_id IS NULL OR NOT EXISTS (
          SELECT 1
          FROM public.hesaplar AS account_row
          WHERE account_row.id = NEW.entity_id
            AND account_row.isletme_id = NEW.isletme_id
          FOR KEY SHARE
        ) THEN
          RAISE EXCEPTION 'NOTLAR_INVALID_ENTITY_REFERENCE'
            USING ERRCODE = '23514';
        END IF;
      WHEN 'cari' THEN
        IF NEW.entity_id IS NULL OR NOT EXISTS (
          SELECT 1
          FROM public.cariler AS cari_row
          WHERE cari_row.id = NEW.entity_id
            AND cari_row.isletme_id = NEW.isletme_id
          FOR KEY SHARE
        ) THEN
          RAISE EXCEPTION 'NOTLAR_INVALID_ENTITY_REFERENCE'
            USING ERRCODE = '23514';
        END IF;
      WHEN 'personel', 'personel_izin' THEN
        IF NEW.entity_id IS NULL OR NOT EXISTS (
          SELECT 1
          FROM public.personel AS employee_row
          WHERE employee_row.id = NEW.entity_id
            AND employee_row.isletme_id = NEW.isletme_id
          FOR KEY SHARE
        ) THEN
          RAISE EXCEPTION 'NOTLAR_INVALID_ENTITY_REFERENCE'
            USING ERRCODE = '23514';
        END IF;
      WHEN 'urun' THEN
        IF NEW.entity_id IS NULL OR NOT EXISTS (
          SELECT 1
          FROM public.urunler AS product_row
          WHERE product_row.id = NEW.entity_id
            AND product_row.isletme_id = NEW.isletme_id
          FOR KEY SHARE
        ) THEN
          RAISE EXCEPTION 'NOTLAR_INVALID_ENTITY_REFERENCE'
            USING ERRCODE = '23514';
        END IF;
      ELSE
        RAISE EXCEPTION 'NOTLAR_INVALID_ENTITY_REFERENCE'
          USING ERRCODE = '23514';
    END CASE;
  END IF;

  IF v_validate_cari_assignment
     AND NEW.assigned_to_cari IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.cariler AS assigned_cari_row
       WHERE assigned_cari_row.id = NEW.assigned_to_cari
         AND assigned_cari_row.isletme_id = NEW.isletme_id
     )
  THEN
    RAISE EXCEPTION 'NOTLAR_INVALID_CARI_ASSIGNMENT'
      USING ERRCODE = '23514';
  END IF;

  IF v_validate_personel_assignment
     AND NEW.assigned_to_personel IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.personel AS assigned_employee_row
       WHERE assigned_employee_row.id = NEW.assigned_to_personel
         AND assigned_employee_row.isletme_id = NEW.isletme_id
     )
  THEN
    RAISE EXCEPTION 'NOTLAR_INVALID_PERSONEL_ASSIGNMENT'
      USING ERRCODE = '23514';
  END IF;

  IF v_validate_user_assignment
     AND NEW.assigned_to_user IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.isletmeler AS business_row
       WHERE business_row.id = NEW.isletme_id
         AND business_row.user_id = NEW.assigned_to_user
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.isletme_users AS member_row
       WHERE member_row.isletme_id = NEW.isletme_id
         AND member_row.user_id = NEW.assigned_to_user
         AND member_row.status = 'active'
     )
  THEN
    RAISE EXCEPTION 'NOTLAR_INVALID_USER_ASSIGNMENT'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.enforce_notlar_identity_v1()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_notlar_identity_v1()
  FROM PUBLIC, anon, authenticated, service_role;

-- Permanent entity deletion must not silently NULL/CASCADE core ledger
-- references. Client preflights remain a friendly UX; this trigger is the
-- authoritative race-free guard. Ephemeral share/statement codes and aliases
-- deliberately remain outside this list. Product notes are detached in the
-- same delete transaction below; tenant-root cascades still return before it.
CREATE FUNCTION internal.enforce_entity_delete_references_v1()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Business deletion/cascade is not an individual entity deletion.
  IF NOT EXISTS (
    SELECT 1
    FROM public.isletmeler AS business
    WHERE business.id = OLD.isletme_id
  ) THEN
    RETURN OLD;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'hesaplar' THEN
      IF EXISTS (
        SELECT 1
        FROM public.islemler AS transaction_row
        WHERE transaction_row.isletme_id = OLD.isletme_id
          AND (
            transaction_row.hesap_id = OLD.id
            OR transaction_row.hedef_hesap_id = OLD.id
          )
      ) OR EXISTS (
        SELECT 1
        FROM public.ileri_tarihli_islemler AS scheduled_row
        WHERE scheduled_row.isletme_id = OLD.isletme_id
          AND (
            scheduled_row.hesap_id = OLD.id
            OR scheduled_row.hedef_hesap_id = OLD.id
          )
      ) OR EXISTS (
        SELECT 1
        FROM public.cekler AS cheque_row
        WHERE cheque_row.isletme_id = OLD.isletme_id
          AND cheque_row.hesap_id = OLD.id
      ) OR EXISTS (
        SELECT 1
        FROM public.nakit_avanslar AS advance_row
        WHERE advance_row.isletme_id = OLD.isletme_id
          AND (
            advance_row.kredi_karti_id = OLD.id
            OR advance_row.hedef_hesap_id = OLD.id
          )
      ) THEN
        RAISE EXCEPTION 'ACCOUNT_HAS_LINKED_RECORDS'
          USING ERRCODE = '23503';
      END IF;

      PERFORM pg_catalog.set_config(
        'internal.permission_v2_note_detach_context',
        OLD.isletme_id::text || ':hesap:' || OLD.id::text,
        true
      );
      UPDATE public.notlar
      SET entity_type = 'genel',
          entity_id = NULL,
          updated_at = clock_timestamp()
      WHERE isletme_id = OLD.isletme_id
        AND entity_type = 'hesap'
        AND entity_id = OLD.id;
      PERFORM pg_catalog.set_config(
        'internal.permission_v2_note_detach_context',
        '',
        true
      );

      RETURN OLD;

    WHEN 'cariler' THEN
      IF EXISTS (
        SELECT 1
        FROM public.islemler AS transaction_row
        WHERE transaction_row.isletme_id = OLD.isletme_id
          AND transaction_row.cari_id = OLD.id
      ) OR EXISTS (
        SELECT 1
        FROM public.ileri_tarihli_islemler AS scheduled_row
        WHERE scheduled_row.isletme_id = OLD.isletme_id
          AND scheduled_row.cari_id = OLD.id
      ) OR EXISTS (
        SELECT 1
        FROM public.cari_links AS link_row
        WHERE link_row.owner_isletme_id = OLD.isletme_id
          AND link_row.cari_id = OLD.id
      ) OR EXISTS (
        SELECT 1
        FROM public.cekler AS cheque_row
        WHERE cheque_row.isletme_id = OLD.isletme_id
          AND cheque_row.cari_id = OLD.id
      ) OR EXISTS (
        SELECT 1
        FROM public.irsaliye_records AS dispatch_row
        WHERE dispatch_row.isletme_id = OLD.isletme_id
          AND dispatch_row.cari_id = OLD.id
      ) OR EXISTS (
        SELECT 1
        FROM public.taksit_planlari AS plan_row
        WHERE plan_row.isletme_id = OLD.isletme_id
          AND plan_row.cari_id = OLD.id
      ) OR EXISTS (
        SELECT 1
        FROM public.islem_tahsis AS allocation_row
        WHERE allocation_row.isletme_id = OLD.isletme_id
          AND allocation_row.cari_id = OLD.id
      ) THEN
        RAISE EXCEPTION 'CUSTOMER_HAS_LINKED_RECORDS'
          USING ERRCODE = '23503';
      END IF;

      PERFORM pg_catalog.set_config(
        'internal.permission_v2_note_detach_context',
        OLD.isletme_id::text || ':cari:' || OLD.id::text,
        true
      );
      UPDATE public.notlar
      SET entity_type = 'genel',
          entity_id = NULL,
          updated_at = clock_timestamp()
      WHERE isletme_id = OLD.isletme_id
        AND entity_type = 'cari'
        AND entity_id = OLD.id;
      PERFORM pg_catalog.set_config(
        'internal.permission_v2_note_detach_context',
        '',
        true
      );

      RETURN OLD;

    WHEN 'personel' THEN
      IF EXISTS (
        SELECT 1
        FROM public.islemler AS transaction_row
        WHERE transaction_row.isletme_id = OLD.isletme_id
          AND transaction_row.personel_id = OLD.id
      ) OR EXISTS (
        SELECT 1
        FROM public.ileri_tarihli_islemler AS scheduled_row
        WHERE scheduled_row.isletme_id = OLD.isletme_id
          AND scheduled_row.personel_id = OLD.id
      ) THEN
        RAISE EXCEPTION 'PERSONNEL_HAS_LINKED_RECORDS'
          USING ERRCODE = '23503';
      END IF;

      PERFORM pg_catalog.set_config(
        'internal.permission_v2_note_detach_context',
        OLD.isletme_id::text || ':personel:' || OLD.id::text,
        true
      );
      UPDATE public.notlar
      SET entity_type = 'genel',
          entity_id = NULL,
          updated_at = clock_timestamp()
      WHERE isletme_id = OLD.isletme_id
        AND entity_type IN ('personel', 'personel_izin')
        AND entity_id = OLD.id;
      PERFORM pg_catalog.set_config(
        'internal.permission_v2_note_detach_context',
        '',
        true
      );

      RETURN OLD;

    WHEN 'urunler' THEN
      IF EXISTS (
        SELECT 1
        FROM public.urun_hareketler AS movement_row
        WHERE movement_row.isletme_id = OLD.isletme_id
          AND movement_row.urun_id = OLD.id
          AND movement_row.islem_id IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'PRODUCT_HAS_LINKED_TRANSACTIONS'
          USING ERRCODE = '23503';
      END IF;

      PERFORM pg_catalog.set_config(
        'internal.permission_v2_note_detach_context',
        OLD.isletme_id::text || ':urun:' || OLD.id::text,
        true
      );
      UPDATE public.notlar
      SET entity_type = 'genel',
          entity_id = NULL,
          updated_at = clock_timestamp()
      WHERE isletme_id = OLD.isletme_id
        AND entity_type = 'urun'
        AND entity_id = OLD.id;
      PERFORM pg_catalog.set_config(
        'internal.permission_v2_note_detach_context',
        '',
        true
      );

      RETURN OLD;

    ELSE
      RAISE EXCEPTION 'ENTITY_DELETE_GUARD_INVALID_TABLE'
        USING ERRCODE = '55000';
  END CASE;

  RETURN OLD;
END;
$function$;

ALTER FUNCTION internal.enforce_entity_delete_references_v1()
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.enforce_entity_delete_references_v1()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_permission_v2_delete_reference_guard_hesaplar
BEFORE DELETE ON public.hesaplar
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_entity_delete_references_v1();

CREATE TRIGGER trg_permission_v2_delete_reference_guard_cariler
BEFORE DELETE ON public.cariler
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_entity_delete_references_v1();

CREATE TRIGGER trg_permission_v2_delete_reference_guard_personel
BEFORE DELETE ON public.personel
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_entity_delete_references_v1();

CREATE TRIGGER trg_permission_v2_delete_reference_guard_urunler
BEFORE DELETE ON public.urunler
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_entity_delete_references_v1();


-- Islem satiri read/mutation kaynaktan turetilir. RESTRICTIVE policy eski
-- modules.islemler/visibility policy'sinin kapali kaynak tiplerini OR ile acmasini
-- engeller. created_by NULL own sayilmaz; edit_all/delete_all gecer.
CREATE POLICY "Permission v2 read islemler"
ON public.islemler
FOR SELECT
TO authenticated
USING (
  internal.islem_ham_satiri_okunabilir_v1(
    islemler.isletme_id,
    islemler.type::text,
    islemler.hesap_id,
    islemler.hedef_hesap_id,
    islemler.cari_id,
    islemler.personel_id
  )
);

CREATE POLICY "Permission v2 source gate islemler"
ON public.islemler
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  internal.islem_ham_satiri_okunabilir_v1(
    islemler.isletme_id,
    islemler.type::text,
    islemler.hesap_id,
    islemler.hedef_hesap_id,
    islemler.cari_id,
    islemler.personel_id
  )
);

CREATE POLICY "Permission v2 insert islemler"
ON public.islemler
FOR INSERT
TO authenticated
WITH CHECK (
  internal.islem_mutasyon_izni_v2(
    islemler.isletme_id, islemler.type::text, islemler.created_by, 'create', NULL
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    islemler.isletme_id,
    islemler.type::text,
    islemler.hesap_id,
    islemler.hedef_hesap_id,
    islemler.cari_id,
    islemler.personel_id
  )
);

CREATE POLICY "Permission v2 insert source gate islemler"
ON public.islemler
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  internal.islem_mutasyon_izni_v2(
    islemler.isletme_id, islemler.type::text, islemler.created_by, 'create', NULL
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    islemler.isletme_id,
    islemler.type::text,
    islemler.hesap_id,
    islemler.hedef_hesap_id,
    islemler.cari_id,
    islemler.personel_id
  )
);

CREATE POLICY "Permission v2 update islemler"
ON public.islemler
FOR UPDATE
TO authenticated
USING (
  internal.islem_mutasyon_izni_v2(
    islemler.isletme_id, islemler.type::text, islemler.created_by, 'update',
    islemler.id
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    islemler.isletme_id,
    islemler.type::text,
    islemler.hesap_id,
    islemler.hedef_hesap_id,
    islemler.cari_id,
    islemler.personel_id
  )
)
WITH CHECK (
  internal.islem_mutasyon_izni_v2(
    islemler.isletme_id, islemler.type::text, islemler.created_by, 'update',
    islemler.id
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    islemler.isletme_id,
    islemler.type::text,
    islemler.hesap_id,
    islemler.hedef_hesap_id,
    islemler.cari_id,
    islemler.personel_id
  )
);

CREATE POLICY "Permission v2 update source gate islemler"
ON public.islemler
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  internal.islem_mutasyon_izni_v2(
    islemler.isletme_id, islemler.type::text, islemler.created_by, 'update',
    islemler.id
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    islemler.isletme_id,
    islemler.type::text,
    islemler.hesap_id,
    islemler.hedef_hesap_id,
    islemler.cari_id,
    islemler.personel_id
  )
)
WITH CHECK (
  internal.islem_mutasyon_izni_v2(
    islemler.isletme_id, islemler.type::text, islemler.created_by, 'update',
    islemler.id
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    islemler.isletme_id,
    islemler.type::text,
    islemler.hesap_id,
    islemler.hedef_hesap_id,
    islemler.cari_id,
    islemler.personel_id
  )
);

CREATE POLICY "Permission v2 delete islemler"
ON public.islemler
FOR DELETE
TO authenticated
USING (
  internal.islem_mutasyon_izni_v2(
    islemler.isletme_id, islemler.type::text, islemler.created_by, 'delete',
    islemler.id
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    islemler.isletme_id,
    islemler.type::text,
    islemler.hesap_id,
    islemler.hedef_hesap_id,
    islemler.cari_id,
    islemler.personel_id
  )
);

CREATE POLICY "Permission v2 delete source gate islemler"
ON public.islemler
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  internal.islem_mutasyon_izni_v2(
    islemler.isletme_id, islemler.type::text, islemler.created_by, 'delete',
    islemler.id
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    islemler.isletme_id,
    islemler.type::text,
    islemler.hesap_id,
    islemler.hedef_hesap_id,
    islemler.cari_id,
    islemler.personel_id
  )
);


-- Ileri tarihli islemler de ham "ileri_tarihli" modulune degil islem tipinin
-- H/C/P kaynagina baglidir. Read creator-bagimsizdir.
CREATE POLICY "Permission v2 read ileri tarihli"
ON public.ileri_tarihli_islemler
FOR SELECT
TO authenticated
USING (
  internal.islem_ham_satiri_okunabilir_v1(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.hesap_id,
    ileri_tarihli_islemler.hedef_hesap_id,
    ileri_tarihli_islemler.cari_id,
    ileri_tarihli_islemler.personel_id
  )
);

CREATE POLICY "Permission v2 source gate ileri tarihli"
ON public.ileri_tarihli_islemler
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  internal.islem_ham_satiri_okunabilir_v1(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.hesap_id,
    ileri_tarihli_islemler.hedef_hesap_id,
    ileri_tarihli_islemler.cari_id,
    ileri_tarihli_islemler.personel_id
  )
);

CREATE POLICY "Permission v2 insert ileri tarihli"
ON public.ileri_tarihli_islemler
FOR INSERT
TO authenticated
WITH CHECK (
  internal.islem_mutasyon_izni_v2(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.created_by,
    'create',
    NULL
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.hesap_id,
    ileri_tarihli_islemler.hedef_hesap_id,
    ileri_tarihli_islemler.cari_id,
    ileri_tarihli_islemler.personel_id
  )
);

CREATE POLICY "Permission v2 insert source gate ileri tarihli"
ON public.ileri_tarihli_islemler
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  internal.islem_mutasyon_izni_v2(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.created_by,
    'create',
    NULL
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.hesap_id,
    ileri_tarihli_islemler.hedef_hesap_id,
    ileri_tarihli_islemler.cari_id,
    ileri_tarihli_islemler.personel_id
  )
);

CREATE POLICY "Permission v2 update ileri tarihli"
ON public.ileri_tarihli_islemler
FOR UPDATE
TO authenticated
USING (
  internal.islem_mutasyon_izni_v2(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.created_by,
    'update',
    NULL
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.hesap_id,
    ileri_tarihli_islemler.hedef_hesap_id,
    ileri_tarihli_islemler.cari_id,
    ileri_tarihli_islemler.personel_id
  )
)
WITH CHECK (
  internal.islem_mutasyon_izni_v2(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.created_by,
    'update',
    NULL
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.hesap_id,
    ileri_tarihli_islemler.hedef_hesap_id,
    ileri_tarihli_islemler.cari_id,
    ileri_tarihli_islemler.personel_id
  )
);

CREATE POLICY "Permission v2 update source gate ileri tarihli"
ON public.ileri_tarihli_islemler
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  internal.islem_mutasyon_izni_v2(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.created_by,
    'update',
    NULL
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.hesap_id,
    ileri_tarihli_islemler.hedef_hesap_id,
    ileri_tarihli_islemler.cari_id,
    ileri_tarihli_islemler.personel_id
  )
)
WITH CHECK (
  internal.islem_mutasyon_izni_v2(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.created_by,
    'update',
    NULL
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.hesap_id,
    ileri_tarihli_islemler.hedef_hesap_id,
    ileri_tarihli_islemler.cari_id,
    ileri_tarihli_islemler.personel_id
  )
);

CREATE POLICY "Permission v2 delete ileri tarihli"
ON public.ileri_tarihli_islemler
FOR DELETE
TO authenticated
USING (
  internal.islem_mutasyon_izni_v2(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.created_by,
    'delete',
    NULL
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.hesap_id,
    ileri_tarihli_islemler.hedef_hesap_id,
    ileri_tarihli_islemler.cari_id,
    ileri_tarihli_islemler.personel_id
  )
);

CREATE POLICY "Permission v2 delete source gate ileri tarihli"
ON public.ileri_tarihli_islemler
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  internal.islem_mutasyon_izni_v2(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.created_by,
    'delete',
    NULL
  )
  AND internal.islem_ham_satiri_okunabilir_v1(
    ileri_tarihli_islemler.isletme_id,
    ileri_tarihli_islemler.type::text,
    ileri_tarihli_islemler.hesap_id,
    ileri_tarihli_islemler.hedef_hesap_id,
    ileri_tarihli_islemler.cari_id,
    ileri_tarihli_islemler.personel_id
  )
);

-- Installment/allocation ledgers are Cari-derived data. Their historical
-- `modules.islemler` policies let unrelated H/P/U-only roles read raw Cari IDs,
-- amounts and dates, so retain the exact policy names and narrow their USING
-- clauses to active Cari source rows.
ALTER POLICY "taksit_planlari_select"
ON public.taksit_planlari
TO authenticated
USING (
  internal.isletme_sahibi_v1(taksit_planlari.isletme_id)
  OR (
    EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        taksit_planlari.isletme_id, 'cariler'
      ) AS permission
      WHERE permission.can_view IS TRUE
    )
    AND EXISTS (
      SELECT 1
      FROM public.cariler AS customer
      INNER JOIN public.islemler AS transaction_row
        ON transaction_row.id = taksit_planlari.islem_id
       AND transaction_row.isletme_id = taksit_planlari.isletme_id
       AND transaction_row.cari_id = taksit_planlari.cari_id
      WHERE customer.id = taksit_planlari.cari_id
        AND customer.isletme_id = taksit_planlari.isletme_id
        AND customer.is_active IS TRUE
        AND internal.islem_satiri_okunabilir_v2(
          transaction_row.isletme_id,
          transaction_row.type::text,
          transaction_row.hesap_id,
          transaction_row.hedef_hesap_id,
          transaction_row.cari_id,
          transaction_row.personel_id
        )
    )
  )
);

ALTER POLICY "taksitler_select"
ON public.taksitler
TO authenticated
USING (
  internal.isletme_sahibi_v1(taksitler.isletme_id)
  OR EXISTS (
    SELECT 1
    FROM public.taksit_planlari AS plan
    INNER JOIN public.cariler AS customer
      ON customer.id = plan.cari_id
     AND customer.isletme_id = plan.isletme_id
    INNER JOIN public.islemler AS transaction_row
      ON transaction_row.id = plan.islem_id
     AND transaction_row.isletme_id = plan.isletme_id
     AND transaction_row.cari_id = plan.cari_id
    WHERE plan.id = taksitler.plan_id
      AND plan.isletme_id = taksitler.isletme_id
      AND plan.islem_id = taksitler.islem_id
      AND customer.is_active IS TRUE
      AND EXISTS (
        SELECT 1
        FROM internal.etkin_yetki_v2(
          taksitler.isletme_id, 'cariler'
        ) AS permission
        WHERE permission.can_view IS TRUE
      )
      AND internal.islem_satiri_okunabilir_v2(
        transaction_row.isletme_id,
        transaction_row.type::text,
        transaction_row.hesap_id,
        transaction_row.hedef_hesap_id,
        transaction_row.cari_id,
        transaction_row.personel_id
      )
  )
);

ALTER POLICY "islem_tahsis_select"
ON public.islem_tahsis
TO authenticated
USING (
  internal.isletme_sahibi_v1(islem_tahsis.isletme_id)
  OR (
    EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        islem_tahsis.isletme_id, 'cariler'
      ) AS permission
      WHERE permission.can_view IS TRUE
    )
    AND EXISTS (
      SELECT 1
      FROM public.cariler AS customer
      WHERE customer.id = islem_tahsis.cari_id
        AND customer.isletme_id = islem_tahsis.isletme_id
        AND customer.is_active IS TRUE
    )
    AND EXISTS (
      SELECT 1
      FROM public.islemler AS debt_row
      WHERE debt_row.id = islem_tahsis.borc_islem_id
        AND debt_row.isletme_id = islem_tahsis.isletme_id
        AND debt_row.cari_id = islem_tahsis.cari_id
        AND internal.islem_satiri_okunabilir_v2(
          debt_row.isletme_id,
          debt_row.type::text,
          debt_row.hesap_id,
          debt_row.hedef_hesap_id,
          debt_row.cari_id,
          debt_row.personel_id
        )
    )
    AND EXISTS (
      SELECT 1
      FROM public.islemler AS payment_row
      WHERE payment_row.id = islem_tahsis.odeme_islem_id
        AND payment_row.isletme_id = islem_tahsis.isletme_id
        AND payment_row.cari_id = islem_tahsis.cari_id
        AND internal.islem_satiri_okunabilir_v2(
          payment_row.isletme_id,
          payment_row.type::text,
          payment_row.hesap_id,
          payment_row.hedef_hesap_id,
          payment_row.cari_id,
          payment_row.personel_id
        )
    )
  )
);


-- ---------------------------------------------------------------------------
-- 4) MANAGER KATEGORI YONETIMI
-- ---------------------------------------------------------------------------
-- Custom role, permissions JSON'unda kategori aksiyonu bulunsa bile kategori
-- yazamaz. Yalniz owner veya isletme_users.role='manager' olan aktif uye gecer.
ALTER POLICY "Shared select kategoriler"
ON public.kategoriler
TO authenticated
USING (
  internal.isletme_sahibi_v1(kategoriler.isletme_id)
  OR (
    kategoriler.is_active IS TRUE
    AND EXISTS (
      SELECT 1
      FROM public.isletme_users AS member
      WHERE member.isletme_id = kategoriler.isletme_id
        AND member.user_id = auth.uid()
        AND member.status = 'active'
        AND (
          member.role = 'manager'
          OR EXISTS (
            SELECT 1
            FROM pg_catalog.unnest(
              ARRAY['hesaplar', 'cariler', 'personel', 'urunler']::text[]
            ) AS module_name(name)
            CROSS JOIN LATERAL internal.etkin_yetki_v2(
              kategoriler.isletme_id,
              module_name.name
            ) AS permission
            WHERE permission.can_view IS TRUE
          )
        )
    )
  )
);

ALTER POLICY "Category writes require owner - insert"
ON public.kategoriler
WITH CHECK (
  internal.isletme_sahibi_v1(kategoriler.isletme_id)
  OR EXISTS (
    SELECT 1
    FROM public.isletme_users AS member
    WHERE member.isletme_id = kategoriler.isletme_id
      AND member.user_id = auth.uid()
      AND member.status = 'active'
      AND member.role = 'manager'
  )
);

ALTER POLICY "Category writes require owner - update"
ON public.kategoriler
USING (
  internal.isletme_sahibi_v1(kategoriler.isletme_id)
  OR EXISTS (
    SELECT 1
    FROM public.isletme_users AS member
    WHERE member.isletme_id = kategoriler.isletme_id
      AND member.user_id = auth.uid()
      AND member.status = 'active'
      AND member.role = 'manager'
  )
)
WITH CHECK (
  internal.isletme_sahibi_v1(kategoriler.isletme_id)
  OR EXISTS (
    SELECT 1
    FROM public.isletme_users AS member
    WHERE member.isletme_id = kategoriler.isletme_id
      AND member.user_id = auth.uid()
      AND member.status = 'active'
      AND member.role = 'manager'
  )
);

ALTER POLICY "Category writes require owner - delete"
ON public.kategoriler
USING (
  internal.isletme_sahibi_v1(kategoriler.isletme_id)
  OR EXISTS (
    SELECT 1
    FROM public.isletme_users AS member
    WHERE member.isletme_id = kategoriler.isletme_id
      AND member.user_id = auth.uid()
      AND member.status = 'active'
      AND member.role = 'manager'
  )
);

CREATE POLICY "Permission v2 active manager insert categories"
ON public.kategoriler
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.isletme_users AS member
    WHERE member.isletme_id = kategoriler.isletme_id
      AND member.user_id = auth.uid()
      AND member.status = 'active'
      AND member.role = 'manager'
  )
);

CREATE POLICY "Permission v2 active manager update categories"
ON public.kategoriler
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.isletme_users AS member
    WHERE member.isletme_id = kategoriler.isletme_id
      AND member.user_id = auth.uid()
      AND member.status = 'active'
      AND member.role = 'manager'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.isletme_users AS member
    WHERE member.isletme_id = kategoriler.isletme_id
      AND member.user_id = auth.uid()
      AND member.status = 'active'
      AND member.role = 'manager'
  )
);

CREATE POLICY "Permission v2 active manager delete categories"
ON public.kategoriler
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.isletme_users AS member
    WHERE member.isletme_id = kategoriler.isletme_id
      AND member.user_id = auth.uid()
      AND member.status = 'active'
      AND member.role = 'manager'
  )
);

-- Direct category writes keep a non-null state. Owners may intentionally
-- archive with is_active=false; managers archive through the canonical RPC so
-- its relation cleanup and linked-transaction checks cannot be skipped.
CREATE POLICY "Permission v2 category insert state gate"
ON public.kategoriler
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  kategoriler.is_active IS NOT NULL
  AND (
    kategoriler.is_active IS TRUE
    OR internal.isletme_sahibi_v1(kategoriler.isletme_id)
  )
);

CREATE POLICY "Permission v2 category update state gate"
ON public.kategoriler
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (
  kategoriler.is_active IS NOT NULL
  AND (
    kategoriler.is_active IS TRUE
    OR internal.isletme_sahibi_v1(kategoriler.isletme_id)
  )
);

CREATE OR REPLACE FUNCTION public.archive_kategori_atomik(
  p_isletme_id uuid,
  p_kategori_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_active boolean;
BEGIN
  IF p_isletme_id IS NULL OR p_kategori_id IS NULL THEN
    RAISE EXCEPTION 'CATEGORY_ARGUMENT_REQUIRED'
      USING ERRCODE = '22023';
  END IF;

  IF v_user_id IS NULL OR NOT (
    internal.isletme_sahibi_v1(p_isletme_id)
    OR EXISTS (
      SELECT 1
      FROM public.isletme_users AS member
      WHERE member.isletme_id = p_isletme_id
        AND member.user_id = v_user_id
        AND member.status = 'active'
        AND member.role = 'manager'
    )
  ) THEN
    RAISE EXCEPTION 'CATEGORY_MANAGER_OR_OWNER_ONLY'
      USING ERRCODE = '42501';
  END IF;

  SELECT category.is_active
  INTO v_is_active
  FROM public.kategoriler AS category
  WHERE category.id = p_kategori_id
    AND category.isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATEGORY_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_is_active IS NOT TRUE THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.islemler AS transaction_row
    WHERE transaction_row.kategori_id = p_kategori_id
      AND transaction_row.isletme_id = p_isletme_id
  ) OR EXISTS (
    SELECT 1
    FROM public.ileri_tarihli_islemler AS scheduled_row
    WHERE scheduled_row.kategori_id = p_kategori_id
      AND scheduled_row.isletme_id = p_isletme_id
      AND scheduled_row.status IN ('pending', 'notified')
  ) THEN
    RAISE EXCEPTION 'CATEGORY_HAS_TRANSACTIONS'
      USING ERRCODE = '23503';
  END IF;

  -- Bunlar migration-time DML degildir; fonksiyon ancak gelecekteki tek
  -- kullanici arsivleme eyleminde ayni transaction icinde calisir.
  UPDATE public.urunler AS product
  SET kategori_id = NULL
  WHERE product.kategori_id = p_kategori_id
    AND product.isletme_id = p_isletme_id;

  UPDATE public.kategoriler AS child
  SET parent_id = NULL
  WHERE child.parent_id = p_kategori_id
    AND child.isletme_id = p_isletme_id;

  UPDATE public.kategoriler AS source
  SET mapped_gelir_kategori_id = NULL
  WHERE source.mapped_gelir_kategori_id = p_kategori_id
    AND source.isletme_id = p_isletme_id;

  UPDATE public.kategoriler AS source
  SET mapped_gider_kategori_id = NULL
  WHERE source.mapped_gider_kategori_id = p_kategori_id
    AND source.isletme_id = p_isletme_id;

  UPDATE public.kategoriler AS category
  SET is_active = false
  WHERE category.id = p_kategori_id
    AND category.isletme_id = p_isletme_id
    AND category.is_active IS TRUE;
END;
$function$;

ALTER FUNCTION public.archive_kategori_atomik(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.archive_kategori_atomik(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_kategori_atomik(uuid, uuid)
  TO authenticated;

-- Direct table UPDATE/DELETE must obey the same "linked transaction" guard as
-- archive_kategori_atomik. This closes manager/owner RLS paths that could set
-- is_active=false or NULL without the RPC. A TRUE -> NULL transition first
-- runs the linked guard, then fails the non-null state invariant.
CREATE FUNCTION internal.enforce_category_archive_guard_v2()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old public.kategoriler;
BEGIN
  v_old := OLD;

  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_active IS TRUE
       AND NEW.is_active IS NOT TRUE THEN
      NULL; -- archive transition; continue to the linked-row guard below
    ELSIF NEW.is_active IS NULL THEN
      RAISE EXCEPTION 'CATEGORY_ACTIVE_STATE_REQUIRED'
        USING ERRCODE = '23514';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Business deletion/cascade is not a category archive action.
  IF NOT EXISTS (
    SELECT 1
    FROM public.isletmeler AS business
    WHERE business.id = v_old.isletme_id
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.islemler AS transaction_row
    WHERE transaction_row.kategori_id = v_old.id
      AND transaction_row.isletme_id = v_old.isletme_id
  ) OR EXISTS (
    SELECT 1
    FROM public.ileri_tarihli_islemler AS scheduled_row
    WHERE scheduled_row.kategori_id = v_old.id
      AND scheduled_row.isletme_id = v_old.isletme_id
      AND scheduled_row.status IN ('pending', 'notified')
  ) THEN
    RAISE EXCEPTION 'CATEGORY_HAS_TRANSACTIONS'
      USING ERRCODE = '23503';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW.is_active IS NULL THEN
    RAISE EXCEPTION 'CATEGORY_ACTIVE_STATE_REQUIRED'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION internal.enforce_category_archive_guard_v2()
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.enforce_category_archive_guard_v2()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_permission_v2_category_archive_guard
BEFORE UPDATE OF is_active OR DELETE
ON public.kategoriler
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_category_archive_guard_v2();


-- ---------------------------------------------------------------------------
-- 5) CARI/PERSONEL ODEME ICIN BAKIYESIZ HESAP REFERANSI
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_islem_hesap_referanslari_v2(
  p_isletme_id uuid,
  p_scope text
)
RETURNS TABLE (
  id uuid,
  name text,
  currency text,
  type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_module text;
BEGIN
  IF p_isletme_id IS NULL OR p_scope NOT IN ('cari', 'personel') THEN
    RAISE EXCEPTION 'ACCOUNT_REFERENCE_INVALID_SCOPE'
      USING ERRCODE = '22023';
  END IF;

  v_module := CASE p_scope
    WHEN 'cari' THEN 'cariler'
    WHEN 'personel' THEN 'personel'
  END;

  IF NOT internal.aktif_uye_v1(p_isletme_id)
     OR NOT EXISTS (
       SELECT 1
       FROM internal.etkin_yetki_v2(p_isletme_id, v_module) AS permission
       WHERE (
         permission.can_create
         OR permission.can_update_own
         OR permission.can_update_all
       ) IS TRUE
     ) THEN
    RAISE EXCEPTION 'ACCOUNT_REFERENCE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    account.id,
    account.name::text,
    account.currency::text,
    account.type::text
  FROM public.hesaplar AS account
  WHERE account.isletme_id = p_isletme_id
    AND account.is_active IS TRUE
    AND account.is_archived IS FALSE
    AND account.type::text <> 'birikim'
  ORDER BY account.name, account.id;
END;
$function$;

ALTER FUNCTION public.get_islem_hesap_referanslari_v2(uuid, text)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_islem_hesap_referanslari_v2(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_islem_hesap_referanslari_v2(uuid, text)
TO authenticated;


-- ---------------------------------------------------------------------------
-- 6) BAGLAMSAL NOTLAR: parent module read/action; Notlar hub ayri.
-- ---------------------------------------------------------------------------
CREATE FUNCTION internal.not_baglam_hedef_gecerli_v1(
  p_isletme_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_assigned_to_cari uuid,
  p_assigned_to_personel uuid,
  p_assigned_to_user uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
BEGIN
  -- SECURITY DEFINER hedef sorgulari tenant-disina UUID var/yok sizdirmasin.
  IF p_isletme_id IS NULL
     OR NOT internal.aktif_uye_v1(p_isletme_id) THEN
    RETURN false;
  END IF;

  -- entity_type ile entity_id birlikte ve ayni tenantta dogrulanir.
  -- personel_izin.entity_id dogrudan personel satirinin UUID'sidir.
  CASE p_entity_type
    WHEN 'genel' THEN
      IF p_entity_id IS NOT NULL THEN
        RETURN false;
      END IF;
    WHEN 'hesap' THEN
      IF p_entity_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.hesaplar AS account
        WHERE account.id = p_entity_id
          AND account.isletme_id = p_isletme_id
          AND (v_is_owner IS TRUE OR account.is_active IS TRUE)
          AND (
            account.type::text <> 'birikim'
            OR v_is_owner IS TRUE
            OR EXISTS (
              SELECT 1
              FROM internal.etkin_yetki_v2(
                p_isletme_id, 'birikim'
              ) AS savings_permission
              WHERE savings_permission.can_view IS TRUE
            )
          )
      ) THEN
        RETURN false;
      END IF;
    WHEN 'cari' THEN
      IF p_entity_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.cariler AS customer
        WHERE customer.id = p_entity_id
          AND customer.isletme_id = p_isletme_id
          AND (v_is_owner IS TRUE OR customer.is_active IS TRUE)
      ) THEN
        RETURN false;
      END IF;
    WHEN 'personel', 'personel_izin' THEN
      IF p_entity_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.personel AS employee
        WHERE employee.id = p_entity_id
          AND employee.isletme_id = p_isletme_id
          AND (v_is_owner IS TRUE OR employee.is_active IS TRUE)
      ) THEN
        RETURN false;
      END IF;
    WHEN 'urun' THEN
      IF p_entity_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.urunler AS product
        WHERE product.id = p_entity_id
          AND product.isletme_id = p_isletme_id
          AND (v_is_owner IS TRUE OR product.is_active IS TRUE)
      ) THEN
        RETURN false;
      END IF;
    ELSE
      RETURN false;
  END CASE;

  -- Arsivli fakat aktif kaynak rapor/domain sozlesmesine gore gecerlidir.
  -- Pasif assignment yalniz owner icin gorunebilir; tenant disi daima kapalidir.
  IF p_assigned_to_cari IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.cariler AS assigned_customer
       WHERE assigned_customer.id = p_assigned_to_cari
         AND assigned_customer.isletme_id = p_isletme_id
         AND (v_is_owner IS TRUE OR assigned_customer.is_active IS TRUE)
     ) THEN
    RETURN false;
  END IF;

  IF p_assigned_to_personel IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.personel AS assigned_employee
       WHERE assigned_employee.id = p_assigned_to_personel
         AND assigned_employee.isletme_id = p_isletme_id
         AND (v_is_owner IS TRUE OR assigned_employee.is_active IS TRUE)
     ) THEN
    RETURN false;
  END IF;

  -- Bu yalniz hedefin gecerli oldugunu dogrular. Yeni notu baska aktif uyeye
  -- atamak serbesttir; audience kontrolu OLD/okuma yolunda ayrica uygulanir.
  IF p_assigned_to_user IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.isletmeler AS business
       WHERE business.id = p_isletme_id
         AND business.user_id = p_assigned_to_user
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.isletme_users AS member
       WHERE member.isletme_id = p_isletme_id
         AND member.user_id = p_assigned_to_user
         AND member.status = 'active'
     ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

ALTER FUNCTION internal.not_baglam_hedef_gecerli_v1(
  uuid, text, uuid, uuid, uuid, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.not_baglam_hedef_gecerli_v1(
  uuid, text, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION internal.not_baglam_okuma_v2(
  p_isletme_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_assigned_to_cari uuid,
  p_assigned_to_personel uuid,
  p_assigned_to_user uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_modules text[] := ARRAY[]::text[];
  v_module text;
BEGIN
  IF NOT internal.aktif_uye_v1(p_isletme_id)
     OR NOT internal.not_baglam_hedef_gecerli_v1(
       p_isletme_id,
       p_entity_type,
       p_entity_id,
       p_assigned_to_cari,
       p_assigned_to_personel,
       p_assigned_to_user
     )
     OR (
       p_assigned_to_user IS NOT NULL
       AND p_assigned_to_user IS DISTINCT FROM auth.uid()
     ) THEN
    RETURN false;
  END IF;

  CASE p_entity_type
    WHEN 'genel' THEN
      IF p_assigned_to_cari IS NULL
         AND p_assigned_to_personel IS NULL THEN
        v_modules := pg_catalog.array_append(v_modules, 'notlar');
      END IF;
    WHEN 'hesap' THEN
      v_modules := pg_catalog.array_append(v_modules, 'hesaplar');
      IF EXISTS (
        SELECT 1
        FROM public.hesaplar AS account
        WHERE account.id = p_entity_id
          AND account.isletme_id = p_isletme_id
          AND account.type::text = 'birikim'
      ) THEN
        v_modules := pg_catalog.array_append(v_modules, 'birikim');
      END IF;
    WHEN 'cari' THEN
      v_modules := pg_catalog.array_append(v_modules, 'cariler');
    WHEN 'personel', 'personel_izin' THEN
      v_modules := pg_catalog.array_append(v_modules, 'personel');
    WHEN 'urun' THEN
      v_modules := pg_catalog.array_append(v_modules, 'urunler');
    ELSE
      RETURN false;
  END CASE;

  IF p_assigned_to_cari IS NOT NULL
     AND NOT ('cariler' = ANY(v_modules)) THEN
    v_modules := pg_catalog.array_append(v_modules, 'cariler');
  END IF;

  IF p_assigned_to_personel IS NOT NULL
     AND NOT ('personel' = ANY(v_modules)) THEN
    v_modules := pg_catalog.array_append(v_modules, 'personel');
  END IF;

  IF pg_catalog.cardinality(v_modules) = 0 THEN
    RETURN false;
  END IF;

  FOREACH v_module IN ARRAY v_modules LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(p_isletme_id, v_module) AS permission
      WHERE permission.can_view IS TRUE
    ) THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$function$;

ALTER FUNCTION internal.not_baglam_okuma_v2(
  uuid, text, uuid, uuid, uuid, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.not_baglam_okuma_v2(
  uuid, text, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.not_baglam_okuma_v2(
  uuid, text, uuid, uuid, uuid, uuid
) TO authenticated;

CREATE FUNCTION internal.not_baglam_mutasyon_v2(
  p_isletme_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_assigned_to_cari uuid,
  p_assigned_to_personel uuid,
  p_assigned_to_user uuid,
  p_created_by uuid,
  p_action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_modules text[] := ARRAY[]::text[];
  v_module text;
  v_permission record;
  v_own_note boolean :=
    p_created_by IS NOT NULL AND p_created_by = auth.uid();
  v_contextual boolean :=
    p_entity_type IS DISTINCT FROM 'genel'
    OR p_assigned_to_cari IS NOT NULL
    OR p_assigned_to_personel IS NOT NULL;
BEGIN
  IF p_action NOT IN ('create', 'update', 'delete')
     OR NOT internal.aktif_uye_v1(p_isletme_id)
     OR NOT internal.not_baglam_hedef_gecerli_v1(
       p_isletme_id,
       p_entity_type,
       p_entity_id,
       p_assigned_to_cari,
       p_assigned_to_personel,
       p_assigned_to_user
     ) THEN
    RETURN false;
  END IF;

  CASE p_entity_type
    WHEN 'genel' THEN
      IF p_assigned_to_cari IS NULL
         AND p_assigned_to_personel IS NULL THEN
        v_modules := pg_catalog.array_append(v_modules, 'notlar');
      END IF;
    WHEN 'hesap' THEN
      v_modules := pg_catalog.array_append(v_modules, 'hesaplar');
      IF EXISTS (
        SELECT 1
        FROM public.hesaplar AS account
        WHERE account.id = p_entity_id
          AND account.isletme_id = p_isletme_id
          AND account.type::text = 'birikim'
      ) THEN
        v_modules := pg_catalog.array_append(v_modules, 'birikim');
      END IF;
    WHEN 'cari' THEN
      v_modules := pg_catalog.array_append(v_modules, 'cariler');
    WHEN 'personel', 'personel_izin' THEN
      v_modules := pg_catalog.array_append(v_modules, 'personel');
    WHEN 'urun' THEN
      v_modules := pg_catalog.array_append(v_modules, 'urunler');
    ELSE
      RETURN false;
  END CASE;

  IF p_assigned_to_cari IS NOT NULL
     AND NOT ('cariler' = ANY(v_modules)) THEN
    v_modules := pg_catalog.array_append(v_modules, 'cariler');
  END IF;

  IF p_assigned_to_personel IS NOT NULL
     AND NOT ('personel' = ANY(v_modules)) THEN
    v_modules := pg_catalog.array_append(v_modules, 'personel');
  END IF;

  IF pg_catalog.cardinality(v_modules) = 0 THEN
    RETURN false;
  END IF;

  -- Serbest Notlar kaydi kendi modulunun normal level sozlesmesine uyar:
  -- view read-only, add create, edit_own/all mutate.
  IF NOT v_contextual THEN
    RETURN internal.kayit_mutasyon_izni_v1(
      p_isletme_id, 'notlar', p_created_by, p_action
    );
  END IF;

  FOREACH v_module IN ARRAY v_modules LOOP
    SELECT permission.*
    INTO v_permission
    FROM internal.etkin_yetki_v2(p_isletme_id, v_module) AS permission;

    -- Acik parent modul, baglamsal not olusturmak ve kendi notunu
    -- degistirmek/silmek icin yeterlidir. Baska kullanicinin notunda ise her
    -- parent modulun ilgili all yetkisi ayrica gerekir.
    IF NOT FOUND OR v_permission.can_view IS NOT TRUE THEN
      RETURN false;
    END IF;

    IF p_action = 'update'
       AND NOT v_own_note
       AND v_permission.can_update_all IS NOT TRUE THEN
      RETURN false;
    END IF;

    IF p_action = 'delete'
       AND NOT v_own_note
       AND v_permission.can_delete_all IS NOT TRUE THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$function$;

ALTER FUNCTION internal.not_baglam_mutasyon_v2(
  uuid, text, uuid, uuid, uuid, uuid, uuid, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.not_baglam_mutasyon_v2(
  uuid, text, uuid, uuid, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.not_baglam_mutasyon_v2(
  uuid, text, uuid, uuid, uuid, uuid, uuid, text
) TO authenticated;

ALTER POLICY "Shared select notlar"
ON public.notlar
TO authenticated
USING (
  internal.not_baglam_okuma_v2(
    notlar.isletme_id,
    notlar.entity_type,
    notlar.entity_id,
    notlar.assigned_to_cari,
    notlar.assigned_to_personel,
    notlar.assigned_to_user
  )
);

ALTER POLICY "Shared insert notlar"
ON public.notlar
TO authenticated
WITH CHECK (
  notlar.created_by = auth.uid()
  AND internal.not_baglam_mutasyon_v2(
    notlar.isletme_id,
    notlar.entity_type,
    notlar.entity_id,
    notlar.assigned_to_cari,
    notlar.assigned_to_personel,
    notlar.assigned_to_user,
    notlar.created_by,
    'create'
  )
);

ALTER POLICY "Shared update notlar"
ON public.notlar
TO authenticated
USING (
  (
    notlar.assigned_to_user IS NULL
    OR notlar.assigned_to_user = auth.uid()
  )
  AND internal.not_baglam_mutasyon_v2(
    notlar.isletme_id,
    notlar.entity_type,
    notlar.entity_id,
    notlar.assigned_to_cari,
    notlar.assigned_to_personel,
    notlar.assigned_to_user,
    notlar.created_by,
    'update'
  )
)
WITH CHECK (
  internal.not_baglam_mutasyon_v2(
    notlar.isletme_id,
    notlar.entity_type,
    notlar.entity_id,
    notlar.assigned_to_cari,
    notlar.assigned_to_personel,
    notlar.assigned_to_user,
    notlar.created_by,
    'update'
  )
);

ALTER POLICY "Shared delete notlar"
ON public.notlar
TO authenticated
USING (
  (
    notlar.assigned_to_user IS NULL
    OR notlar.assigned_to_user = auth.uid()
  )
  AND internal.not_baglam_mutasyon_v2(
    notlar.isletme_id,
    notlar.entity_type,
    notlar.entity_id,
    notlar.assigned_to_cari,
    notlar.assigned_to_personel,
    notlar.assigned_to_user,
    notlar.created_by,
    'delete'
  )
);

ALTER POLICY "Shared attach own not photo"
ON public.notlar
TO authenticated
USING (
  notlar.created_by = auth.uid()
  AND notlar.photo_path IS NULL
  AND (
    notlar.assigned_to_user IS NULL
    OR notlar.assigned_to_user = auth.uid()
  )
  AND internal.not_baglam_mutasyon_v2(
    notlar.isletme_id,
    notlar.entity_type,
    notlar.entity_id,
    notlar.assigned_to_cari,
    notlar.assigned_to_personel,
    notlar.assigned_to_user,
    notlar.created_by,
    'create'
  )
)
WITH CHECK (
  notlar.created_by = auth.uid()
  AND notlar.photo_path IS NOT NULL
  AND pg_catalog.char_length(notlar.photo_path) <= 200
  AND notlar.photo_path ~ (
    '^'
    || notlar.isletme_id::text
    || '/notlar/'
    || notlar.id::text
    || '_[0-9]{10,20}[.]webp$'
  )
  AND internal.not_baglam_mutasyon_v2(
    notlar.isletme_id,
    notlar.entity_type,
    notlar.entity_id,
    notlar.assigned_to_cari,
    notlar.assigned_to_personel,
    notlar.assigned_to_user,
    notlar.created_by,
    'create'
  )
);


-- Storage path parent module tasimaz; note UUID ile notlar satirina baglanir.
-- Bu OR REPLACE'ler mevcut policy adlarini/imzalarini korur.
CREATE OR REPLACE FUNCTION internal.storage_photo_insert_allowed_v1(
  p_name text,
  p_owner_id text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_path record;
  v_note public.notlar;
  v_transaction public.islemler;
  v_modules text[];
  v_module text;
BEGIN
  IF v_user_id IS NULL
     OR p_owner_id IS DISTINCT FROM v_user_id::text THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_path
  FROM internal.storage_photo_path_parse_v1(p_name);

  IF NOT FOUND OR NOT internal.aktif_uye_v1(v_path.isletme_id) THEN
    RETURN false;
  END IF;

  IF v_path.kayit_turu = 'islem' THEN
    SELECT transaction_row.*
    INTO v_transaction
    FROM public.islemler AS transaction_row
    WHERE transaction_row.id = v_path.kayit_id
      AND transaction_row.isletme_id = v_path.isletme_id;

    IF NOT FOUND THEN
      RETURN false;
    END IF;

    IF NOT internal.islem_satiri_okunabilir_v2(
         v_transaction.isletme_id,
         v_transaction.type::text,
         v_transaction.hesap_id,
         v_transaction.hedef_hesap_id,
         v_transaction.cari_id,
         v_transaction.personel_id
       )
       OR NOT internal.islem_birikim_bacaklari_okunabilir_v1(
         v_transaction.isletme_id,
         v_transaction.hesap_id,
         v_transaction.hedef_hesap_id
       ) THEN
      RETURN false;
    END IF;

    IF internal.isletme_sahibi_v1(v_path.isletme_id) THEN
      RETURN true;
    END IF;

    v_modules := internal.islem_tipi_modulu(v_transaction.type::text);
    IF v_modules IS NULL THEN
      RETURN false;
    END IF;

    -- Yeni olusturulan kendi satirinda create, mevcut satirda own/all update
    -- gerekir. Orphan UUID veya salt read yetkisi fotograf upload'u acmaz.
    FOREACH v_module IN ARRAY v_modules LOOP
      IF NOT (
        internal.kayit_mutasyon_izni_v1(
          v_transaction.isletme_id,
          v_module,
          v_transaction.created_by,
          'update'
        )
        OR (
          v_transaction.created_by = v_user_id
          AND internal.kayit_mutasyon_izni_v1(
            v_transaction.isletme_id,
            v_module,
            v_transaction.created_by,
            'create'
          )
        )
      ) THEN
        RETURN false;
      END IF;
    END LOOP;

    RETURN true;
  END IF;

  IF v_path.kayit_turu <> 'not' THEN
    RETURN false;
  END IF;

  SELECT note_row.*
  INTO v_note
  FROM public.notlar AS note_row
  WHERE note_row.id = v_path.kayit_id
    AND note_row.isletme_id = v_path.isletme_id;

  IF NOT FOUND
     OR v_note.created_by IS DISTINCT FROM v_user_id
     OR (
       v_note.assigned_to_user IS NOT NULL
       AND v_note.assigned_to_user IS DISTINCT FROM v_user_id
     ) THEN
    RETURN false;
  END IF;

  RETURN internal.not_baglam_mutasyon_v2(
    v_note.isletme_id,
    v_note.entity_type,
    v_note.entity_id,
    v_note.assigned_to_cari,
    v_note.assigned_to_personel,
    v_note.assigned_to_user,
    v_note.created_by,
    'create'
  );
END;
$function$;

ALTER FUNCTION internal.storage_photo_insert_allowed_v1(text, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.storage_photo_insert_allowed_v1(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION internal.storage_photo_insert_allowed_v1(text, text)
TO authenticated;

CREATE OR REPLACE FUNCTION internal.storage_note_photo_select_allowed_v1(
  p_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_path record;
  v_note public.notlar;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_path
  FROM internal.storage_photo_path_parse_v1(p_name);

  IF NOT FOUND OR v_path.kayit_turu <> 'not' THEN
    RETURN false;
  END IF;

  SELECT note_row.*
  INTO v_note
  FROM public.notlar AS note_row
  WHERE note_row.id = v_path.kayit_id
    AND note_row.isletme_id = v_path.isletme_id
    AND note_row.photo_path = p_name;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN internal.not_baglam_okuma_v2(
    v_note.isletme_id,
    v_note.entity_type,
    v_note.entity_id,
    v_note.assigned_to_cari,
    v_note.assigned_to_personel,
    v_note.assigned_to_user
  );
END;
$function$;

ALTER FUNCTION internal.storage_note_photo_select_allowed_v1(text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.storage_note_photo_select_allowed_v1(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION internal.storage_note_photo_select_allowed_v1(text)
TO authenticated;

CREATE OR REPLACE FUNCTION internal.storage_note_photo_delete_allowed_v1(
  p_name text,
  p_object_owner_id text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_path record;
  v_note public.notlar;
BEGIN
  IF v_user_id IS NULL OR p_object_owner_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_path
  FROM internal.storage_photo_path_parse_v1(p_name);

  IF NOT FOUND OR v_path.kayit_turu <> 'not'
     OR NOT internal.aktif_uye_v1(v_path.isletme_id) THEN
    RETURN false;
  END IF;

  SELECT note_row.*
  INTO v_note
  FROM public.notlar AS note_row
  WHERE note_row.id = v_path.kayit_id
    AND note_row.isletme_id = v_path.isletme_id;

  IF FOUND THEN
    IF v_note.assigned_to_user IS NOT NULL
       AND v_note.assigned_to_user IS DISTINCT FROM v_user_id THEN
      RETURN false;
    END IF;

    RETURN internal.not_baglam_mutasyon_v2(
      v_note.isletme_id,
      v_note.entity_type,
      v_note.entity_id,
      v_note.assigned_to_cari,
      v_note.assigned_to_personel,
      v_note.assigned_to_user,
      v_note.created_by,
      'update'
    )
    OR internal.not_baglam_mutasyon_v2(
      v_note.isletme_id,
      v_note.entity_type,
      v_note.entity_id,
      v_note.assigned_to_cari,
      v_note.assigned_to_personel,
      v_note.assigned_to_user,
      v_note.created_by,
      'delete'
    );
  END IF;

  -- Not satiri once silindiyse path'ten baglam artik yeniden kurulamaz. Yalniz
  -- objeyi yukleyen kullanici veya owner dar orphan cleanup yapabilir.
  RETURN p_object_owner_id = v_user_id::text
     OR internal.isletme_sahibi_v1(v_path.isletme_id);
END;
$function$;

ALTER FUNCTION internal.storage_note_photo_delete_allowed_v1(text, text)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.storage_note_photo_delete_allowed_v1(text, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION internal.storage_note_photo_delete_allowed_v1(text, text)
TO authenticated;

-- Transaction photos must be tied to the exact readable/mutable source row.
-- A tenant membership by itself never makes every transaction photo visible.
CREATE FUNCTION internal.storage_transaction_photo_select_allowed_v2(
  p_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.islemler AS transaction_row
       INNER JOIN internal.storage_photo_path_parse_v1(p_name) AS path_row
         ON path_row.kayit_id = transaction_row.id
        AND path_row.isletme_id = transaction_row.isletme_id
       WHERE path_row.kayit_turu = 'islem'
         AND transaction_row.photo_path = p_name
         AND internal.islem_kaynagi_okunabilir_v1(
           transaction_row.isletme_id,
           transaction_row.type::text
         )
         AND internal.islem_satiri_okunabilir_v2(
           transaction_row.isletme_id,
           transaction_row.type::text,
           transaction_row.hesap_id,
           transaction_row.hedef_hesap_id,
           transaction_row.cari_id,
           transaction_row.personel_id
         )
         AND internal.islem_birikim_bacaklari_okunabilir_v1(
           transaction_row.isletme_id,
           transaction_row.hesap_id,
           transaction_row.hedef_hesap_id
         )
     );
$function$;

ALTER FUNCTION internal.storage_transaction_photo_select_allowed_v2(text)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.storage_transaction_photo_select_allowed_v2(text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION internal.storage_transaction_photo_select_allowed_v2(text)
TO authenticated;

CREATE FUNCTION internal.storage_transaction_photo_delete_allowed_v2(
  p_name text,
  p_object_owner_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND p_object_owner_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.islemler AS transaction_row
       INNER JOIN internal.storage_photo_path_parse_v1(p_name) AS path_row
         ON path_row.kayit_id = transaction_row.id
        AND path_row.isletme_id = transaction_row.isletme_id
       WHERE path_row.kayit_turu = 'islem'
         AND transaction_row.photo_path = p_name
         AND internal.islem_mutasyon_izni_v2(
           transaction_row.isletme_id,
           transaction_row.type::text,
           transaction_row.created_by,
           'delete',
           transaction_row.id
         )
         AND internal.islem_satiri_okunabilir_v2(
           transaction_row.isletme_id,
           transaction_row.type::text,
           transaction_row.hesap_id,
           transaction_row.hedef_hesap_id,
           transaction_row.cari_id,
           transaction_row.personel_id
         )
         AND internal.islem_birikim_bacaklari_okunabilir_v1(
           transaction_row.isletme_id,
           transaction_row.hesap_id,
           transaction_row.hedef_hesap_id
         )
     );
$function$;

ALTER FUNCTION internal.storage_transaction_photo_delete_allowed_v2(
  text, text
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.storage_transaction_photo_delete_allowed_v2(text, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION internal.storage_transaction_photo_delete_allowed_v2(text, text)
TO authenticated;

ALTER POLICY "islem_photos_note_select_v1"
ON storage.objects
USING (
  bucket_id <> 'islem-photos'
  OR internal.storage_transaction_photo_select_allowed_v2(name)
  OR internal.storage_note_photo_select_allowed_v1(name)
  OR internal.storage_note_photo_delete_allowed_v1(name, owner_id)
);

ALTER POLICY "islem_photos_note_delete_v1"
ON storage.objects
USING (
  bucket_id <> 'islem-photos'
  OR internal.storage_transaction_photo_delete_allowed_v2(name, owner_id)
  OR internal.storage_note_photo_delete_allowed_v1(name, owner_id)
);

CREATE OR REPLACE FUNCTION public.not_guncelle_v1(
  p_isletme_id uuid,
  p_not_id uuid,
  p_patch jsonb
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_old public.notlar;
  v_new public.notlar;
  v_updated_id uuid;
BEGIN
  IF v_user_id IS NULL
     OR p_isletme_id IS NULL
     OR p_not_id IS NULL
     OR p_patch IS NULL
     OR pg_catalog.jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
     OR p_patch = '{}'::jsonb
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_object_keys(p_patch) AS patch_key(key_name)
       WHERE patch_key.key_name NOT IN (
         'content',
         'is_completed',
         'completed_at',
         'reminder_date',
         'photo_path',
         'assigned_to_user',
         'assigned_to_cari',
         'assigned_to_personel'
       )
     )
     OR (
       p_patch ? 'content'
       AND pg_catalog.jsonb_typeof(p_patch->'content') IS DISTINCT FROM 'string'
     )
     OR (
       p_patch ? 'is_completed'
       AND pg_catalog.jsonb_typeof(p_patch->'is_completed')
           IS DISTINCT FROM 'boolean'
     )
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           ('completed_at'),
           ('reminder_date'),
           ('photo_path'),
           ('assigned_to_user'),
           ('assigned_to_cari'),
           ('assigned_to_personel')
       ) AS nullable_key(key_name)
       WHERE p_patch ? nullable_key.key_name
         AND pg_catalog.jsonb_typeof(p_patch->nullable_key.key_name)
             NOT IN ('string', 'null')
     ) THEN
    RAISE EXCEPTION 'NOT_UPDATE_INVALID_PATCH'
      USING ERRCODE = '22023';
  END IF;

  SELECT note_row.*
  INTO v_old
  FROM public.notlar AS note_row
  WHERE note_row.id = p_not_id
    AND note_row.isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND
     OR (
       v_old.assigned_to_user IS NOT NULL
       AND v_old.assigned_to_user IS DISTINCT FROM v_user_id
     )
     OR NOT internal.not_baglam_mutasyon_v2(
       v_old.isletme_id,
       v_old.entity_type,
       v_old.entity_id,
       v_old.assigned_to_cari,
       v_old.assigned_to_personel,
       v_old.assigned_to_user,
       v_old.created_by,
       'update'
     ) THEN
    RAISE EXCEPTION 'NOT_UPDATE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  BEGIN
    v_new := pg_catalog.jsonb_populate_record(v_old, p_patch);
  EXCEPTION
    WHEN invalid_text_representation
      OR invalid_datetime_format
      OR datetime_field_overflow THEN
      RAISE EXCEPTION 'NOT_UPDATE_INVALID_PATCH'
        USING ERRCODE = '22023';
  END;

  IF v_new.content IS NULL OR v_new.is_completed IS NULL THEN
    RAISE EXCEPTION 'NOT_UPDATE_INVALID_PATCH'
      USING ERRCODE = '22023';
  END IF;

  IF v_new.photo_path IS DISTINCT FROM v_old.photo_path
     AND v_new.photo_path IS NOT NULL
     AND (
       pg_catalog.char_length(v_new.photo_path) > 200
       OR v_new.photo_path !~ (
         '^'
         || p_isletme_id::text
         || '/notlar/'
         || p_not_id::text
         || '_[0-9]{10,20}[.]webp$'
       )
       OR NOT EXISTS (
         SELECT 1
         FROM storage.objects AS object_row
         WHERE object_row.bucket_id = 'islem-photos'
           AND object_row.name = v_new.photo_path
           AND object_row.owner_id = v_user_id::text
       )
     ) THEN
    RAISE EXCEPTION 'NOT_UPDATE_INVALID_PHOTO_REFERENCE'
      USING ERRCODE = '23514';
  END IF;

  IF v_new.assigned_to_user IS DISTINCT FROM v_old.assigned_to_user
     AND v_new.assigned_to_user IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.isletmeler AS business
       WHERE business.id = p_isletme_id
         AND business.user_id = v_new.assigned_to_user
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.isletme_users AS member
       WHERE member.isletme_id = p_isletme_id
         AND member.user_id = v_new.assigned_to_user
         AND member.status = 'active'
     ) THEN
    RAISE EXCEPTION 'NOT_UPDATE_INVALID_USER_ASSIGNMENT'
      USING ERRCODE = '23514';
  END IF;

  IF v_new.assigned_to_cari IS DISTINCT FROM v_old.assigned_to_cari
     AND v_new.assigned_to_cari IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.cariler AS customer
       WHERE customer.id = v_new.assigned_to_cari
         AND customer.isletme_id = p_isletme_id
     ) THEN
    RAISE EXCEPTION 'NOT_UPDATE_INVALID_CARI_ASSIGNMENT'
      USING ERRCODE = '23514';
  END IF;

  IF v_new.assigned_to_personel IS DISTINCT FROM v_old.assigned_to_personel
     AND v_new.assigned_to_personel IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.personel AS employee
       WHERE employee.id = v_new.assigned_to_personel
         AND employee.isletme_id = p_isletme_id
     ) THEN
    RAISE EXCEPTION 'NOT_UPDATE_INVALID_PERSONEL_ASSIGNMENT'
      USING ERRCODE = '23514';
  END IF;

  IF NOT internal.not_baglam_mutasyon_v2(
    v_new.isletme_id,
    v_new.entity_type,
    v_new.entity_id,
    v_new.assigned_to_cari,
    v_new.assigned_to_personel,
    v_new.assigned_to_user,
    v_new.created_by,
    'update'
  ) THEN
    RAISE EXCEPTION 'NOT_UPDATE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.notlar AS note_row
  SET content = v_new.content,
      is_completed = v_new.is_completed,
      completed_at = v_new.completed_at,
      reminder_date = v_new.reminder_date,
      photo_path = v_new.photo_path,
      assigned_to_user = v_new.assigned_to_user,
      assigned_to_cari = v_new.assigned_to_cari,
      assigned_to_personel = v_new.assigned_to_personel,
      updated_at = pg_catalog.clock_timestamp()
  WHERE note_row.id = p_not_id
    AND note_row.isletme_id = p_isletme_id
  RETURNING note_row.id INTO v_updated_id;

  IF v_updated_id IS DISTINCT FROM p_not_id THEN
    RAISE EXCEPTION 'NOT_UPDATE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_updated_id;
END;
$function$;

ALTER FUNCTION public.not_guncelle_v1(uuid, uuid, jsonb)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.not_guncelle_v1(uuid, uuid, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.not_guncelle_v1(uuid, uuid, jsonb)
TO authenticated;


-- ---------------------------------------------------------------------------
-- 7) DAR, BAKIYESIZ OKUMA PROJEKSIYONLARI
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_yetkili_islem_satirlari_v1(
  p_isletme_id uuid,
  p_limit integer DEFAULT 50,
  p_before_date timestamp without time zone DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  isletme_id uuid,
  type text,
  amount numeric,
  description text,
  "date" timestamp without time zone,
  hesap_id uuid,
  hedef_hesap_id uuid,
  kategori_id uuid,
  cari_id uuid,
  personel_id uuid,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  photo_path text,
  date_end text,
  source_ileri_id uuid,
  vade_tarihi date,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  hesap jsonb,
  hedef_hesap jsonb,
  kategori jsonb,
  cari jsonb,
  personel jsonb,
  creator jsonb,
  counterparty_kind text,
  counterparty_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_has_accounts boolean := false;
  v_has_customers boolean := false;
  v_has_personnel boolean := false;
  v_has_products boolean := false;
  v_has_savings boolean := false;
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
BEGIN
  IF p_isletme_id IS NULL
     OR p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 100
     OR (
       (p_before_date IS NULL) IS DISTINCT FROM (p_before_id IS NULL)
     )
     OR NOT internal.aktif_uye_v1(p_isletme_id) THEN
    RAISE EXCEPTION 'TRANSACTION_ROWS_INVALID_INPUT_OR_ACCESS'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    COALESCE(account_permission.can_view, false),
    COALESCE(customer_permission.can_view, false),
    COALESCE(personnel_permission.can_view, false),
    COALESCE(product_permission.can_view, false),
    COALESCE(savings_permission.can_view, false)
  INTO
    v_has_accounts,
    v_has_customers,
    v_has_personnel,
    v_has_products,
    v_has_savings
  FROM internal.etkin_yetki_v2(
    p_isletme_id, 'hesaplar'
  ) AS account_permission
  CROSS JOIN internal.etkin_yetki_v2(
    p_isletme_id, 'cariler'
  ) AS customer_permission
  CROSS JOIN internal.etkin_yetki_v2(
    p_isletme_id, 'personel'
  ) AS personnel_permission
  CROSS JOIN internal.etkin_yetki_v2(
    p_isletme_id, 'urunler'
  ) AS product_permission
  CROSS JOIN internal.etkin_yetki_v2(
    p_isletme_id, 'birikim'
  ) AS savings_permission;

  RETURN QUERY
  SELECT
    transaction_row.id,
    transaction_row.isletme_id,
    transaction_row.type::text,
    transaction_row.amount,
    transaction_row.description,
    transaction_row.date::timestamp without time zone,
    CASE
      WHEN v_has_accounts IS TRUE
       AND source_account.id IS NOT NULL
       AND (source_account.is_active IS TRUE OR v_is_owner)
       AND (
         source_account.type::text <> 'birikim'
         OR v_has_savings IS TRUE
         OR v_is_owner IS TRUE
       )
        THEN transaction_row.hesap_id
      ELSE NULL::uuid
    END,
    CASE
      WHEN v_has_accounts IS TRUE
       AND target_account.id IS NOT NULL
       AND (target_account.is_active IS TRUE OR v_is_owner)
       AND (
         target_account.type::text <> 'birikim'
         OR v_has_savings IS TRUE
         OR v_is_owner IS TRUE
       )
        THEN transaction_row.hedef_hesap_id
      ELSE NULL::uuid
    END,
    transaction_row.kategori_id,
    CASE
      WHEN v_has_customers IS TRUE
       AND customer.id IS NOT NULL
       AND (customer.is_active IS TRUE OR v_is_owner)
        THEN transaction_row.cari_id
      ELSE NULL::uuid
    END,
    CASE
      WHEN v_has_personnel IS TRUE
       AND employee.id IS NOT NULL
       AND (employee.is_active IS TRUE OR v_is_owner)
        THEN transaction_row.personel_id
      ELSE NULL::uuid
    END,
    transaction_row.source_currency::text,
    transaction_row.target_currency::text,
    transaction_row.exchange_rate,
    CASE
      WHEN internal.islem_satiri_okunabilir_v2(
             transaction_row.isletme_id,
             transaction_row.type::text,
             transaction_row.hesap_id,
             transaction_row.hedef_hesap_id,
             transaction_row.cari_id,
             transaction_row.personel_id
           )
       AND internal.islem_birikim_bacaklari_okunabilir_v1(
             transaction_row.isletme_id,
             transaction_row.hesap_id,
             transaction_row.hedef_hesap_id
           )
       AND transaction_row.photo_path ~ (
        '^'
        || p_isletme_id::text
        || '/'
        || transaction_row.id::text
        || '_[0-9]{10,20}[.]webp$'
      ) THEN transaction_row.photo_path
      ELSE NULL::text
    END,
    transaction_row.date_end,
    transaction_row.source_ileri_id,
    transaction_row.vade_tarihi,
    transaction_row.created_by,
    CASE
      WHEN v_is_owner THEN transaction_row.updated_by
      ELSE NULL::uuid
    END,
    transaction_row.created_at,
    transaction_row.updated_at,
    CASE
      WHEN v_has_accounts IS NOT TRUE
        OR source_account.id IS NULL
        OR (source_account.is_active IS NOT TRUE AND NOT v_is_owner)
        OR (
          source_account.type::text = 'birikim'
          AND v_has_savings IS NOT TRUE
          AND v_is_owner IS NOT TRUE
        )
        THEN NULL::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'id', source_account.id,
        'name', source_account.name,
        'currency', source_account.currency,
        'type', source_account.type
      )
    END,
    CASE
      WHEN v_has_accounts IS NOT TRUE
        OR target_account.id IS NULL
        OR (target_account.is_active IS NOT TRUE AND NOT v_is_owner)
        OR (
          target_account.type::text = 'birikim'
          AND v_has_savings IS NOT TRUE
          AND v_is_owner IS NOT TRUE
        )
        THEN NULL::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'id', target_account.id,
        'name', target_account.name,
        'currency', target_account.currency,
        'type', target_account.type
      )
    END,
    CASE
      WHEN category.id IS NULL THEN NULL::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'id', category.id,
        'name', category.name,
        'type', category.type,
        'color', category.color
      )
    END,
    CASE
      WHEN v_has_customers IS NOT TRUE
        OR customer.id IS NULL
        OR (customer.is_active IS NOT TRUE AND NOT v_is_owner)
        THEN NULL::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'id', customer.id,
        'name', customer.name,
        'type', customer.type
      )
    END,
    CASE
      WHEN v_has_personnel IS NOT TRUE
        OR employee.id IS NULL
        OR (employee.is_active IS NOT TRUE AND NOT v_is_owner)
        THEN NULL::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'id', employee.id,
        'first_name', employee.first_name,
        'last_name', employee.last_name
      )
    END,
    CASE
      WHEN transaction_row.created_by IS NULL THEN NULL::jsonb
      WHEN transaction_row.created_by = business.user_id THEN
        pg_catalog.jsonb_build_object(
          'display_name', 'İşletme sahibi'
        )
      WHEN creator_member.user_id IS NOT NULL THEN
        pg_catalog.jsonb_build_object(
          'display_name',
          COALESCE(
            NULLIF(pg_catalog.btrim(creator_member.member_label), ''),
            'Ortak kullanıcı'
          )
        )
      ELSE pg_catalog.jsonb_build_object(
        'display_name', 'Eski kullanıcı'
      )
    END,
    CASE
      WHEN v_has_customers IS NOT TRUE
       AND customer.id IS NOT NULL
       AND customer.is_active IS TRUE
       AND EXISTS (
         SELECT 1
         FROM public.urun_hareketler AS label_movement
         INNER JOIN public.urunler AS label_product
           ON label_product.id = label_movement.urun_id
          AND label_product.isletme_id = label_movement.isletme_id
         WHERE label_movement.isletme_id = transaction_row.isletme_id
           AND label_movement.islem_id = transaction_row.id
           AND label_product.is_active IS TRUE
       )
        THEN 'cari'::text
      WHEN v_has_accounts IS NOT TRUE
       AND transaction_row.type::text IN (
         'cari_odeme',
         'cari_tahsilat',
         'personel_odeme',
         'personel_tahsilat'
       )
       AND source_account.id IS NOT NULL
       AND source_account.is_active IS TRUE
       AND (
         source_account.type::text <> 'birikim'
         OR v_has_savings IS TRUE
       )
        THEN 'hesap'::text
      ELSE NULL::text
    END,
    CASE
      WHEN v_has_customers IS NOT TRUE
       AND customer.id IS NOT NULL
       AND customer.is_active IS TRUE
       AND EXISTS (
         SELECT 1
         FROM public.urun_hareketler AS label_movement
         INNER JOIN public.urunler AS label_product
           ON label_product.id = label_movement.urun_id
          AND label_product.isletme_id = label_movement.isletme_id
         WHERE label_movement.isletme_id = transaction_row.isletme_id
           AND label_movement.islem_id = transaction_row.id
           AND label_product.is_active IS TRUE
       )
        THEN customer.name::text
      WHEN v_has_accounts IS NOT TRUE
       AND transaction_row.type::text IN (
         'cari_odeme',
         'cari_tahsilat',
         'personel_odeme',
         'personel_tahsilat'
       )
       AND source_account.id IS NOT NULL
       AND source_account.is_active IS TRUE
       AND (
         source_account.type::text <> 'birikim'
         OR v_has_savings IS TRUE
       )
        THEN source_account.name::text
      ELSE NULL::text
    END
  FROM public.islemler AS transaction_row
  INNER JOIN public.isletmeler AS business
    ON business.id = transaction_row.isletme_id
  LEFT JOIN public.hesaplar AS source_account
    ON source_account.id = transaction_row.hesap_id
   AND source_account.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.hesaplar AS target_account
    ON target_account.id = transaction_row.hedef_hesap_id
   AND target_account.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.kategoriler AS category
    ON category.id = transaction_row.kategori_id
   AND category.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.cariler AS customer
    ON customer.id = transaction_row.cari_id
   AND customer.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.personel AS employee
    ON employee.id = transaction_row.personel_id
   AND employee.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.isletme_users AS creator_member
    ON creator_member.isletme_id = transaction_row.isletme_id
   AND creator_member.user_id = transaction_row.created_by
  WHERE transaction_row.isletme_id = p_isletme_id
    AND (
      internal.islem_satiri_okunabilir_v2(
        transaction_row.isletme_id,
        transaction_row.type::text,
        transaction_row.hesap_id,
        transaction_row.hedef_hesap_id,
        transaction_row.cari_id,
        transaction_row.personel_id
      )
      OR (
        v_has_products IS TRUE
        AND EXISTS (
          SELECT 1
          FROM public.urun_hareketler AS movement
          INNER JOIN public.urunler AS product
            ON product.id = movement.urun_id
           AND product.isletme_id = movement.isletme_id
          WHERE movement.isletme_id = transaction_row.isletme_id
            AND movement.islem_id = transaction_row.id
            AND (product.is_active IS TRUE OR v_is_owner)
        )
      )
    )
    AND (
      p_before_date IS NULL
      OR ROW(
        transaction_row.date::timestamp without time zone,
        transaction_row.id
      ) < ROW(p_before_date, p_before_id)
    )
  ORDER BY
    transaction_row.date::timestamp without time zone DESC,
    transaction_row.id DESC
  LIMIT p_limit;
END;
$function$;

ALTER FUNCTION public.get_yetkili_islem_satirlari_v1(
  uuid, integer, timestamp without time zone, uuid
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_yetkili_islem_satirlari_v1(
  uuid, integer, timestamp without time zone, uuid
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_yetkili_islem_satirlari_v1(
  uuid, integer, timestamp without time zone, uuid
)
TO authenticated;


-- Cari acik / Urunler kapali profilinde urunlu cari islemine tiklaninca gereken
-- kalemler. Full urun satiri, stok, alis/satis fiyati veya kategori donmez.
CREATE FUNCTION public.get_yetkili_islem_urun_kalemleri_v1(
  p_isletme_id uuid,
  p_islem_ids uuid[]
)
RETURNS TABLE (
  islem_id uuid,
  miktar numeric,
  birim_fiyat numeric,
  urun_ad text,
  urun_birim text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
  v_reports boolean := false;
  v_products boolean := false;
BEGIN
  IF p_isletme_id IS NULL
     OR p_islem_ids IS NULL
     OR pg_catalog.cardinality(p_islem_ids) > 100
     OR NOT internal.aktif_uye_v1(p_isletme_id) THEN
    RAISE EXCEPTION 'TRANSACTION_PRODUCT_ITEMS_INVALID_INPUT_OR_ACCESS'
      USING ERRCODE = '42501';
  END IF;

  SELECT permission.can_view
  INTO v_reports
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission;

  SELECT permission.can_view
  INTO v_products
  FROM internal.etkin_yetki_v2(p_isletme_id, 'urunler') AS permission;

  RETURN QUERY
  SELECT
    movement.islem_id,
    movement.miktar,
    movement.birim_fiyat,
    CASE
      WHEN product.is_active IS TRUE OR v_is_owner
        THEN product.ad::text
      ELSE NULL::text
    END,
    CASE
      WHEN product.is_active IS TRUE OR v_is_owner
        THEN product.birim::text
      ELSE NULL::text
    END
  FROM public.urun_hareketler AS movement
  INNER JOIN public.islemler AS transaction_row
    ON transaction_row.id = movement.islem_id
   AND transaction_row.isletme_id = movement.isletme_id
  INNER JOIN public.urunler AS product
    ON product.id = movement.urun_id
   AND product.isletme_id = movement.isletme_id
  WHERE movement.isletme_id = p_isletme_id
    AND movement.islem_id = ANY(p_islem_ids)
    AND (product.is_active IS TRUE OR v_is_owner)
    AND (
      v_reports IS TRUE
      OR v_products IS TRUE
      OR internal.islem_satiri_okunabilir_v2(
        transaction_row.isletme_id,
        transaction_row.type::text,
        transaction_row.hesap_id,
        transaction_row.hedef_hesap_id,
        transaction_row.cari_id,
        transaction_row.personel_id
      )
    )
  ORDER BY movement.islem_id, movement.created_at, movement.id;
END;
$function$;

ALTER FUNCTION public.get_yetkili_islem_urun_kalemleri_v1(uuid, uuid[])
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_yetkili_islem_urun_kalemleri_v1(uuid, uuid[])
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_yetkili_islem_urun_kalemleri_v1(uuid, uuid[])
TO authenticated;


CREATE FUNCTION public.get_urun_hareket_kaynak_etiketleri_v1(
  p_isletme_id uuid,
  p_urun_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  movement_id uuid,
  islem_id uuid,
  islem_type text,
  islem_date timestamp without time zone,
  hesap_name text,
  cari_name text,
  personel_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
  v_can_view_accounts boolean := false;
  v_can_view_personnel boolean := false;
  v_can_view_savings boolean := false;
BEGIN
  IF p_isletme_id IS NULL
     OR p_urun_id IS NULL
     OR p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 200
     OR NOT EXISTS (
       SELECT 1
       FROM internal.etkin_yetki_v2(p_isletme_id, 'urunler') AS permission
       WHERE permission.can_view IS TRUE
     ) THEN
    RAISE EXCEPTION 'PRODUCT_SOURCE_LABELS_INVALID_INPUT_OR_ACCESS'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    COALESCE(account_permission.can_view, false),
    COALESCE(personnel_permission.can_view, false),
    COALESCE(savings_permission.can_view, false)
  INTO
    v_can_view_accounts,
    v_can_view_personnel,
    v_can_view_savings
  FROM internal.etkin_yetki_v2(
    p_isletme_id, 'hesaplar'
  ) AS account_permission
  CROSS JOIN internal.etkin_yetki_v2(
    p_isletme_id, 'personel'
  ) AS personnel_permission
  CROSS JOIN internal.etkin_yetki_v2(
    p_isletme_id, 'birikim'
  ) AS savings_permission;

  IF NOT EXISTS (
    SELECT 1
    FROM public.urunler AS product
    WHERE product.id = p_urun_id
      AND product.isletme_id = p_isletme_id
      AND (
        product.is_active IS TRUE
        OR internal.isletme_sahibi_v1(p_isletme_id)
      )
  ) THEN
    RAISE EXCEPTION 'PRODUCT_SOURCE_LABELS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    movement.id,
    movement.islem_id,
    transaction_row.type::text,
    transaction_row.date::timestamp without time zone,
    CASE
      WHEN v_can_view_accounts IS TRUE
       AND (account.is_active IS TRUE OR v_is_owner)
       AND (
         account.type::text <> 'birikim'
         OR v_can_view_savings IS TRUE
         OR v_is_owner IS TRUE
       )
        THEN account.name::text
      ELSE NULL::text
    END,
    CASE
      WHEN customer.is_active IS TRUE OR v_is_owner
        THEN customer.name::text
      ELSE NULL::text
    END,
    CASE
      WHEN v_can_view_personnel IS NOT TRUE
        OR employee.id IS NULL
        OR (employee.is_active IS NOT TRUE AND NOT v_is_owner)
        THEN NULL::text
      ELSE pg_catalog.concat_ws(
        ' ',
        employee.first_name,
        NULLIF(employee.last_name, '')
      )
    END
  FROM public.urun_hareketler AS movement
  LEFT JOIN public.islemler AS transaction_row
    ON transaction_row.id = movement.islem_id
   AND transaction_row.isletme_id = movement.isletme_id
  LEFT JOIN public.hesaplar AS account
    ON account.id = transaction_row.hesap_id
   AND account.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.cariler AS customer
    ON customer.id = transaction_row.cari_id
   AND customer.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.personel AS employee
    ON employee.id = transaction_row.personel_id
   AND employee.isletme_id = transaction_row.isletme_id
  WHERE movement.isletme_id = p_isletme_id
    AND movement.urun_id = p_urun_id
  ORDER BY movement.created_at DESC, movement.id DESC
  LIMIT p_limit;
END;
$function$;

ALTER FUNCTION public.get_urun_hareket_kaynak_etiketleri_v1(
  uuid, uuid, integer
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_urun_hareket_kaynak_etiketleri_v1(
  uuid, uuid, integer
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_urun_hareket_kaynak_etiketleri_v1(
  uuid, uuid, integer
)
TO authenticated;

-- Legacy two-column endpoint remains in old clients. Keep its signature and
-- the active linked-Cari plain-label exception, but route access through the
-- canonical Product permission and owner-only passive envelope.
CREATE OR REPLACE FUNCTION public.get_urun_hareket_minimal_cari_labels(
  p_isletme_id uuid,
  p_urun_id uuid
)
RETURNS TABLE (
  urun_hareket_id uuid,
  cari_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
BEGIN
  IF p_isletme_id IS NULL
     OR p_urun_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM internal.etkin_yetki_v2(
         p_isletme_id, 'urunler'
       ) AS permission
       WHERE permission.can_view IS TRUE
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.urunler AS product
       WHERE product.id = p_urun_id
         AND product.isletme_id = p_isletme_id
         AND (
           product.is_active IS TRUE
           OR v_is_owner
         )
     ) THEN
    RAISE EXCEPTION 'PRODUCT_MINIMAL_CARI_LABELS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    movement.id,
    CASE
      WHEN customer.is_active IS TRUE OR v_is_owner
        THEN customer.name::text
      ELSE NULL::text
    END
  FROM public.urun_hareketler AS movement
  INNER JOIN public.islemler AS transaction_row
    ON transaction_row.id = movement.islem_id
   AND transaction_row.isletme_id = movement.isletme_id
  INNER JOIN public.cariler AS customer
    ON customer.id = transaction_row.cari_id
   AND customer.isletme_id = transaction_row.isletme_id
  WHERE movement.isletme_id = p_isletme_id
    AND movement.urun_id = p_urun_id
  ORDER BY movement.created_at DESC, movement.id;
END;
$function$;

ALTER FUNCTION public.get_urun_hareket_minimal_cari_labels(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_urun_hareket_minimal_cari_labels(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_urun_hareket_minimal_cari_labels(uuid, uuid)
TO authenticated;

-- Legacy leave quota projection used creator/archive/passive visibility flags.
-- V2 reads every row in an open module, keeps archived-active personnel, and
-- reserves passive/NULL-active personnel for the owner.
CREATE OR REPLACE FUNCTION public.get_personel_izin_kotalari_v1(
  p_isletme_id uuid
)
RETURNS TABLE (
  personel_id uuid,
  hak_edilen numeric,
  kullanilan numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
BEGIN
  IF p_isletme_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM internal.etkin_yetki_v2(
         p_isletme_id, 'personel'
       ) AS permission
       WHERE permission.can_view IS TRUE
     ) THEN
    RAISE EXCEPTION 'PERSONEL_LEAVE_QUOTAS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    employee.id,
    COALESCE(
      pg_catalog.sum(transaction_row.amount) FILTER (
        WHERE transaction_row.type::text = 'personel_izin_hakki'
      ),
      0::numeric
    ),
    COALESCE(
      pg_catalog.sum(transaction_row.amount) FILTER (
        WHERE transaction_row.type::text = 'personel_izin_kullanimi'
      ),
      0::numeric
    )
  FROM public.personel AS employee
  INNER JOIN public.islemler AS transaction_row
    ON transaction_row.personel_id = employee.id
   AND transaction_row.isletme_id = employee.isletme_id
   AND transaction_row.type::text IN (
     'personel_izin_hakki',
     'personel_izin_kullanimi'
   )
  WHERE employee.isletme_id = p_isletme_id
    AND (
      employee.is_active IS TRUE
      OR v_is_owner
    )
  GROUP BY employee.id
  ORDER BY employee.id;
END;
$function$;

ALTER FUNCTION public.get_personel_izin_kotalari_v1(uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_personel_izin_kotalari_v1(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_personel_izin_kotalari_v1(uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_transaction_creator_labels(
  p_isletme_id uuid
)
RETURNS TABLE (
  user_id uuid,
  member_label text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    creator_member.user_id,
    creator_member.member_label::text
  FROM public.isletme_users AS creator_member
  WHERE internal.aktif_uye_v1(p_isletme_id)
    AND creator_member.isletme_id = p_isletme_id
    AND EXISTS (
      SELECT 1
      FROM public.islemler AS transaction_row
      WHERE transaction_row.isletme_id = p_isletme_id
        AND transaction_row.created_by = creator_member.user_id
        AND (
          internal.islem_satiri_okunabilir_v2(
            transaction_row.isletme_id,
            transaction_row.type::text,
            transaction_row.hesap_id,
            transaction_row.hedef_hesap_id,
            transaction_row.cari_id,
            transaction_row.personel_id
          )
          OR (
            EXISTS (
              SELECT 1
              FROM internal.etkin_yetki_v2(
                p_isletme_id, 'urunler'
              ) AS product_permission
              WHERE product_permission.can_view IS TRUE
            )
            AND EXISTS (
              SELECT 1
              FROM public.urun_hareketler AS movement
              INNER JOIN public.urunler AS product
                ON product.id = movement.urun_id
               AND product.isletme_id = movement.isletme_id
              WHERE movement.isletme_id = transaction_row.isletme_id
                AND movement.islem_id = transaction_row.id
                AND (
                  product.is_active IS TRUE
                  OR internal.isletme_sahibi_v1(p_isletme_id)
                )
            )
          )
        )
    )
  ORDER BY creator_member.user_id;
$function$;

ALTER FUNCTION public.get_transaction_creator_labels(uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_transaction_creator_labels(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_transaction_creator_labels(uuid)
TO authenticated;


CREATE FUNCTION public.get_gelir_kaynagi_islem_satirlari_v1(
  p_isletme_id uuid,
  p_kind text,
  p_source_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone,
  p_limit integer,
  p_before_date timestamp with time zone DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  isletme_id uuid,
  type text,
  amount numeric,
  description text,
  "date" timestamp without time zone,
  hesap_id uuid,
  hedef_hesap_id uuid,
  kategori_id uuid,
  cari_id uuid,
  personel_id uuid,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  photo_path text,
  date_end text,
  source_ileri_id uuid,
  vade_tarihi date,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  hesap jsonb,
  kategori jsonb,
  cari jsonb,
  personel jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_module text;
  v_reports boolean := false;
  v_accounts boolean := false;
  v_customers boolean := false;
  v_personnel boolean := false;
  v_savings boolean := false;
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
BEGIN
  IF p_isletme_id IS NULL
     OR p_kind NOT IN ('hesap', 'cari', 'personel')
     OR p_source_id IS NULL
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
     OR p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 100
     OR (
       (p_before_date IS NULL) IS DISTINCT FROM (p_before_id IS NULL)
     )
     OR NOT internal.aktif_uye_v1(p_isletme_id) THEN
    RAISE EXCEPTION 'INCOME_SOURCE_ROWS_INVALID_INPUT_OR_ACCESS'
      USING ERRCODE = '42501';
  END IF;

  v_module := CASE p_kind
    WHEN 'hesap' THEN 'hesaplar'
    WHEN 'cari' THEN 'cariler'
    WHEN 'personel' THEN 'personel'
  END;

  SELECT permission.can_view
  INTO v_reports
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission;

  SELECT
    COALESCE(account_permission.can_view, false),
    COALESCE(customer_permission.can_view, false),
    COALESCE(personnel_permission.can_view, false),
    COALESCE(savings_permission.can_view, false)
  INTO
    v_accounts,
    v_customers,
    v_personnel,
    v_savings
  FROM internal.etkin_yetki_v2(
    p_isletme_id, 'hesaplar'
  ) AS account_permission
  CROSS JOIN internal.etkin_yetki_v2(
    p_isletme_id, 'cariler'
  ) AS customer_permission
  CROSS JOIN internal.etkin_yetki_v2(
    p_isletme_id, 'personel'
  ) AS personnel_permission
  CROSS JOIN internal.etkin_yetki_v2(
    p_isletme_id, 'birikim'
  ) AS savings_permission;

  IF v_reports IS NOT TRUE
     AND NOT EXISTS (
       SELECT 1
       FROM internal.etkin_yetki_v2(p_isletme_id, v_module) AS permission
       WHERE permission.can_view IS TRUE
     ) THEN
    RAISE EXCEPTION 'INCOME_SOURCE_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF p_kind = 'hesap' AND NOT EXISTS (
    SELECT 1
    FROM public.hesaplar AS account
    WHERE account.id = p_source_id
      AND account.isletme_id = p_isletme_id
      AND (account.is_active IS TRUE OR v_is_owner)
      AND (
        account.type::text <> 'birikim'
        OR v_reports IS TRUE
        OR v_savings IS TRUE
        OR v_is_owner
      )
  ) THEN
    RAISE EXCEPTION 'INCOME_SOURCE_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  ELSIF p_kind = 'cari' AND NOT EXISTS (
    SELECT 1
    FROM public.cariler AS customer
    WHERE customer.id = p_source_id
      AND customer.isletme_id = p_isletme_id
      AND (customer.is_active IS TRUE OR v_is_owner)
  ) THEN
    RAISE EXCEPTION 'INCOME_SOURCE_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  ELSIF p_kind = 'personel' AND NOT EXISTS (
    SELECT 1
    FROM public.personel AS employee
    WHERE employee.id = p_source_id
      AND employee.isletme_id = p_isletme_id
      AND (employee.is_active IS TRUE OR v_is_owner)
  ) THEN
    RAISE EXCEPTION 'INCOME_SOURCE_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    transaction_row.id,
    transaction_row.isletme_id,
    transaction_row.type::text,
    transaction_row.amount,
    transaction_row.description,
    transaction_row.date::timestamp without time zone,
    CASE
      WHEN (v_is_owner OR v_reports OR v_accounts)
       AND account.id IS NOT NULL
       AND (account.is_active IS TRUE OR v_is_owner)
       AND (
         account.type::text <> 'birikim'
         OR v_savings
         OR v_reports
         OR v_is_owner
       )
        THEN transaction_row.hesap_id
      ELSE NULL::uuid
    END,
    CASE
      WHEN (v_is_owner OR v_reports OR v_accounts)
       AND target_account.id IS NOT NULL
       AND (target_account.is_active IS TRUE OR v_is_owner)
       AND (
         target_account.type::text <> 'birikim'
         OR v_savings
         OR v_reports
         OR v_is_owner
       )
        THEN transaction_row.hedef_hesap_id
      ELSE NULL::uuid
    END,
    transaction_row.kategori_id,
    CASE
      WHEN (v_is_owner OR v_reports OR v_customers)
       AND customer.id IS NOT NULL
       AND (customer.is_active IS TRUE OR v_is_owner)
        THEN transaction_row.cari_id
      ELSE NULL::uuid
    END,
    CASE
      WHEN (v_is_owner OR v_reports OR v_personnel)
       AND employee.id IS NOT NULL
       AND (employee.is_active IS TRUE OR v_is_owner)
        THEN transaction_row.personel_id
      ELSE NULL::uuid
    END,
    transaction_row.source_currency::text,
    transaction_row.target_currency::text,
    transaction_row.exchange_rate,
    CASE
      WHEN (
        v_reports
        OR (
          internal.islem_satiri_okunabilir_v2(
            transaction_row.isletme_id,
            transaction_row.type::text,
            transaction_row.hesap_id,
            transaction_row.hedef_hesap_id,
            transaction_row.cari_id,
            transaction_row.personel_id
          )
          AND internal.islem_birikim_bacaklari_okunabilir_v1(
            transaction_row.isletme_id,
            transaction_row.hesap_id,
            transaction_row.hedef_hesap_id
          )
        )
      )
       AND transaction_row.photo_path ~ (
        '^'
        || p_isletme_id::text
        || '/'
        || transaction_row.id::text
        || '_[0-9]{10,20}[.]webp$'
      ) THEN transaction_row.photo_path
      ELSE NULL::text
    END,
    transaction_row.date_end,
    transaction_row.source_ileri_id,
    transaction_row.vade_tarihi,
    transaction_row.created_by,
    CASE
      WHEN v_is_owner THEN transaction_row.updated_by
      ELSE NULL::uuid
    END,
    transaction_row.created_at,
    transaction_row.updated_at,
    CASE
      WHEN NOT (v_is_owner OR v_reports OR v_accounts)
        OR account.id IS NULL
        OR (account.is_active IS NOT TRUE AND NOT v_is_owner)
        OR (
          account.type::text = 'birikim'
          AND NOT (v_savings OR v_reports OR v_is_owner)
        )
        THEN NULL::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'id', account.id,
        'name', account.name,
        'currency', account.currency,
        'type', account.type,
        'is_active', account.is_active
      )
    END,
    CASE
      WHEN category.id IS NULL THEN NULL::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'id', category.id,
        'name', category.name
      )
    END,
    CASE
      WHEN NOT (v_is_owner OR v_reports OR v_customers)
        OR customer.id IS NULL
        OR (customer.is_active IS NOT TRUE AND NOT v_is_owner)
        THEN NULL::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'id', customer.id,
        'name', customer.name,
        'type', customer.type
      )
    END,
    CASE
      WHEN NOT (v_is_owner OR v_reports OR v_personnel)
        OR employee.id IS NULL
        OR (employee.is_active IS NOT TRUE AND NOT v_is_owner)
        THEN NULL::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'id', employee.id,
        'first_name', employee.first_name,
        'last_name', employee.last_name
      )
    END
  FROM public.islemler AS transaction_row
  LEFT JOIN public.hesaplar AS account
    ON account.id = transaction_row.hesap_id
   AND account.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.hesaplar AS target_account
    ON target_account.id = transaction_row.hedef_hesap_id
   AND target_account.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.kategoriler AS category
    ON category.id = transaction_row.kategori_id
   AND category.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.cariler AS customer
    ON customer.id = transaction_row.cari_id
   AND customer.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.personel AS employee
    ON employee.id = transaction_row.personel_id
   AND employee.isletme_id = transaction_row.isletme_id
  WHERE transaction_row.isletme_id = p_isletme_id
    AND transaction_row.date::timestamp with time zone >= p_start_date
    AND transaction_row.date::timestamp with time zone <= p_end_date
    AND CASE p_kind
      WHEN 'hesap' THEN
        transaction_row.type::text = 'gelir'
        AND transaction_row.hesap_id = p_source_id
      WHEN 'cari' THEN
        transaction_row.type::text IN ('cari_satis', 'cari_satis_iade')
        AND transaction_row.cari_id = p_source_id
      WHEN 'personel' THEN
        transaction_row.type::text = 'personel_satis'
        AND transaction_row.personel_id = p_source_id
      ELSE false
    END
    AND (
      p_before_date IS NULL
      OR ROW(
        transaction_row.date::timestamp with time zone,
        transaction_row.id
      ) < ROW(p_before_date, p_before_id)
    )
  ORDER BY
    transaction_row.date::timestamp without time zone DESC,
    transaction_row.id DESC
  LIMIT p_limit;
END;
$function$;

ALTER FUNCTION public.get_gelir_kaynagi_islem_satirlari_v1(
  uuid, text, uuid, timestamp with time zone, timestamp with time zone,
  integer, timestamp with time zone, uuid
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_gelir_kaynagi_islem_satirlari_v1(
  uuid, text, uuid, timestamp with time zone, timestamp with time zone,
  integer, timestamp with time zone, uuid
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_gelir_kaynagi_islem_satirlari_v1(
  uuid, text, uuid, timestamp with time zone, timestamp with time zone,
  integer, timestamp with time zone, uuid
)
TO authenticated;


-- ---------------------------------------------------------------------------
-- 8) REPORTS-ONLY MEVCUT RPC UYUMLULUGU
-- ---------------------------------------------------------------------------
-- Mevcut dashboard imzasi korunur. Reports aciksa kaynak modullerinin ayri ayri
-- acilmasi ve creator/legacy visibility filtresi aranmaz.
CREATE OR REPLACE FUNCTION public.get_income_expense_summary(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(type text, total numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_isletme_id IS NULL
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
     OR NOT EXISTS (
       SELECT 1
       FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission
       WHERE permission.can_view IS TRUE
     ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH rates AS MATERIALIZED (
    SELECT rate_row.rates
    FROM public.exchange_rates AS rate_row
    WHERE rate_row.base_currency = 'TRY'
    LIMIT 1
  )
  SELECT
    transaction_row.type::text,
    pg_catalog.sum(
      CASE
        WHEN COALESCE(
          account.currency,
          customer.currency,
          employee.currency,
          'TRY'
        ) = 'TRY' THEN transaction_row.amount
        ELSE transaction_row.amount * COALESCE(
          (
            SELECT (
              rate.rates->>COALESCE(
                account.currency,
                customer.currency,
                employee.currency
              )
            )::numeric
            FROM rates AS rate
          ),
          1
        )
      END
    )::numeric
  FROM public.islemler AS transaction_row
  LEFT JOIN public.hesaplar AS account
    ON account.id = transaction_row.hesap_id
   AND account.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.hesaplar AS target_account
    ON target_account.id = transaction_row.hedef_hesap_id
   AND target_account.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.cariler AS customer
    ON customer.id = transaction_row.cari_id
   AND customer.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.personel AS employee
    ON employee.id = transaction_row.personel_id
   AND employee.isletme_id = transaction_row.isletme_id
  WHERE transaction_row.isletme_id = p_isletme_id
    AND transaction_row.date::timestamp with time zone >= p_start_date
    AND transaction_row.date::timestamp with time zone <= p_end_date
    AND (account.id IS NULL OR account.is_active IS TRUE)
    AND (target_account.id IS NULL OR target_account.is_active IS TRUE)
    AND (customer.id IS NULL OR customer.is_active IS TRUE)
    AND (employee.id IS NULL OR employee.is_active IS TRUE)
    AND internal.islem_tipi_modulu(transaction_row.type::text) IS NOT NULL
  GROUP BY transaction_row.type;
END;
$function$;

ALTER FUNCTION public.get_income_expense_summary(
  uuid, timestamp with time zone, timestamp with time zone
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_income_expense_summary(
  uuid, timestamp with time zone, timestamp with time zone
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
ON FUNCTION public.get_income_expense_summary(
  uuid, timestamp with time zone, timestamp with time zone
)
TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_income_by_source_v2(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(
  source_kind text,
  source_type text,
  source_id uuid,
  source_name text,
  source_currency text,
  islem_count bigint,
  total_amount numeric,
  total_native numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_reports boolean := false;
  v_hesaplar boolean := false;
  v_cariler boolean := false;
  v_personel boolean := false;
  v_birikim boolean := false;
BEGIN
  IF p_isletme_id IS NULL
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
     OR NOT internal.aktif_uye_v1(p_isletme_id) THEN
    RETURN;
  END IF;

  SELECT permission.can_view INTO v_reports
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission;
  SELECT permission.can_view INTO v_hesaplar
  FROM internal.etkin_yetki_v2(p_isletme_id, 'hesaplar') AS permission;
  SELECT permission.can_view INTO v_cariler
  FROM internal.etkin_yetki_v2(p_isletme_id, 'cariler') AS permission;
  SELECT permission.can_view INTO v_personel
  FROM internal.etkin_yetki_v2(p_isletme_id, 'personel') AS permission;
  SELECT permission.can_view INTO v_birikim
  FROM internal.etkin_yetki_v2(p_isletme_id, 'birikim') AS permission;

  v_hesaplar := v_reports OR v_hesaplar;
  v_cariler := v_reports OR v_cariler;
  v_personel := v_reports OR v_personel;
  v_birikim := v_reports OR v_birikim;

  IF v_hesaplar IS NOT TRUE
     AND v_cariler IS NOT TRUE
     AND v_personel IS NOT TRUE THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH rates AS MATERIALIZED (
    SELECT rate_row.rates
    FROM public.exchange_rates AS rate_row
    WHERE rate_row.base_currency = 'TRY'
    LIMIT 1
  ),
  account_income AS (
    SELECT
      'hesap'::text AS source_kind,
      account.type::text AS source_type,
      account.id AS source_id,
      account.name::text AS source_name,
      COALESCE(account.currency, 'TRY')::text AS source_currency,
      pg_catalog.count(transaction_row.id)::bigint AS islem_count,
      pg_catalog.sum(
        CASE
          WHEN COALESCE(account.currency, 'TRY') = 'TRY'
            THEN transaction_row.amount
          ELSE transaction_row.amount * COALESCE(
            (
              SELECT (rate.rates->>account.currency)::numeric
              FROM rates AS rate
            ),
            1
          )
        END
      )::numeric AS total_amount,
      pg_catalog.sum(transaction_row.amount)::numeric AS total_native
    FROM public.islemler AS transaction_row
    INNER JOIN public.hesaplar AS account
      ON account.id = transaction_row.hesap_id
     AND account.isletme_id = transaction_row.isletme_id
    WHERE v_hesaplar IS TRUE
      AND transaction_row.isletme_id = p_isletme_id
      AND transaction_row.type::text = 'gelir'
      AND transaction_row.date::timestamp with time zone >= p_start_date
      AND transaction_row.date::timestamp with time zone <= p_end_date
      AND account.is_active IS TRUE
      AND (account.type::text <> 'birikim' OR v_birikim IS TRUE)
    GROUP BY account.id, account.type, account.name, account.currency
  ),
  customer_income AS (
    SELECT
      'cari'::text AS source_kind,
      'cari'::text AS source_type,
      customer.id AS source_id,
      customer.name::text AS source_name,
      COALESCE(customer.currency, 'TRY')::text AS source_currency,
      pg_catalog.count(transaction_row.id)::bigint AS islem_count,
      pg_catalog.sum(
        (
          CASE
            WHEN COALESCE(customer.currency, 'TRY') = 'TRY'
              THEN transaction_row.amount
            ELSE transaction_row.amount * COALESCE(
              (
                SELECT (rate.rates->>customer.currency)::numeric
                FROM rates AS rate
              ),
              1
            )
          END
        ) * CASE
          WHEN transaction_row.type::text = 'cari_satis_iade' THEN -1
          ELSE 1
        END
      )::numeric AS total_amount,
      pg_catalog.sum(
        transaction_row.amount * CASE
          WHEN transaction_row.type::text = 'cari_satis_iade' THEN -1
          ELSE 1
        END
      )::numeric AS total_native
    FROM public.islemler AS transaction_row
    INNER JOIN public.cariler AS customer
      ON customer.id = transaction_row.cari_id
     AND customer.isletme_id = transaction_row.isletme_id
    WHERE v_cariler IS TRUE
      AND transaction_row.isletme_id = p_isletme_id
      AND transaction_row.type::text IN ('cari_satis', 'cari_satis_iade')
      AND transaction_row.date::timestamp with time zone >= p_start_date
      AND transaction_row.date::timestamp with time zone <= p_end_date
      AND customer.is_active IS TRUE
    GROUP BY customer.id, customer.name, customer.currency
  ),
  employee_income AS (
    SELECT
      'personel'::text AS source_kind,
      'personel'::text AS source_type,
      employee.id AS source_id,
      pg_catalog.btrim(
        COALESCE(employee.first_name, '')
        || ' '
        || COALESCE(employee.last_name, '')
      )::text AS source_name,
      COALESCE(employee.currency, 'TRY')::text AS source_currency,
      pg_catalog.count(transaction_row.id)::bigint AS islem_count,
      pg_catalog.sum(
        CASE
          WHEN COALESCE(employee.currency, 'TRY') = 'TRY'
            THEN transaction_row.amount
          ELSE transaction_row.amount * COALESCE(
            (
              SELECT (rate.rates->>employee.currency)::numeric
              FROM rates AS rate
            ),
            1
          )
        END
      )::numeric AS total_amount,
      pg_catalog.sum(transaction_row.amount)::numeric AS total_native
    FROM public.islemler AS transaction_row
    INNER JOIN public.personel AS employee
      ON employee.id = transaction_row.personel_id
     AND employee.isletme_id = transaction_row.isletme_id
    WHERE v_personel IS TRUE
      AND transaction_row.isletme_id = p_isletme_id
      AND transaction_row.type::text = 'personel_satis'
      AND transaction_row.date::timestamp with time zone >= p_start_date
      AND transaction_row.date::timestamp with time zone <= p_end_date
      AND employee.is_active IS TRUE
    GROUP BY
      employee.id,
      employee.first_name,
      employee.last_name,
      employee.currency
  )
  SELECT * FROM account_income
  UNION ALL
  SELECT * FROM customer_income
  UNION ALL
  SELECT * FROM employee_income;
END;
$function$;

ALTER FUNCTION public.get_income_by_source_v2(
  uuid, timestamp with time zone, timestamp with time zone
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_income_by_source_v2(
  uuid, timestamp with time zone, timestamp with time zone
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_income_by_source_v2(
  uuid, timestamp with time zone, timestamp with time zone
)
TO authenticated;


-- ---------------------------------------------------------------------------
-- 9) URUN HAREKETI KAYNAK KAPISI
-- ---------------------------------------------------------------------------
CREATE TABLE internal.permission_v2_movement_action_context (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  actor_user_id uuid NOT NULL,
  isletme_id uuid NOT NULL,
  islem_id uuid NOT NULL,
  action text NOT NULL,
  CONSTRAINT permission_v2_movement_action_context_pkey
    PRIMARY KEY (backend_pid, transaction_id, actor_user_id, isletme_id, islem_id),
  CONSTRAINT permission_v2_movement_action_context_action_check
    CHECK (action IN ('create', 'update', 'delete'))
);

ALTER TABLE internal.permission_v2_movement_action_context
  OWNER TO postgres;
REVOKE ALL
ON TABLE internal.permission_v2_movement_action_context
FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE internal.permission_v2_movement_action_context IS
  'V3 urun hareketi ve V2 finansal islem motorlarinin private transaction-local action baglami.';

CREATE FUNCTION internal.enforce_linked_product_movement_permission_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_transaction public.islemler;
  v_modules text[];
  v_module text;
  v_action text;
  v_context_index integer;
  v_isletme_ids uuid[] := ARRAY[]::uuid[];
  v_islem_ids uuid[] := ARRAY[]::uuid[];
  v_actions text[] := ARRAY[]::text[];
  v_context_action text;
  v_is_owner boolean;
  v_expected_movement text;
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Business hard-delete cascades remove the tenant root before child rows.
  -- They are not an end-user movement mutation and must not be blocked by
  -- product/transaction lookups whose parents are already gone.
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1
    FROM public.isletmeler AS business
    WHERE business.id = OLD.isletme_id
  ) THEN
    RETURN OLD;
  END IF;

  -- islem_id has an ON DELETE SET NULL FK. Let that referential cleanup pass
  -- only after the OLD transaction is gone and only when every non-link payload
  -- field is unchanged (set_audit_fields may refresh updated_by first).
  IF TG_OP = 'UPDATE'
     AND OLD.islem_id IS NOT NULL
     AND NEW.islem_id IS NULL
     AND (NEW.id, NEW.isletme_id, NEW.urun_id)
         IS NOT DISTINCT FROM (OLD.id, OLD.isletme_id, OLD.urun_id)
     AND (
       pg_catalog.to_jsonb(NEW)
         - ARRAY['islem_id', 'updated_by']::text[]
     ) = (
       pg_catalog.to_jsonb(OLD)
         - ARRAY['islem_id', 'updated_by']::text[]
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.islemler AS transaction_row
       WHERE transaction_row.id = OLD.islem_id
         AND transaction_row.isletme_id = OLD.isletme_id
     ) THEN
    RETURN NEW;
  END IF;

  -- Every authenticated write must keep the movement attached to a product in
  -- the same tenant. Shared callers may mutate only active, non-archived
  -- products; owners retain passive legacy compatibility but must unarchive a
  -- product before changing its stock ledger.
  IF TG_OP <> 'DELETE' AND NOT EXISTS (
    SELECT 1
    FROM public.urunler AS product
    WHERE product.id = NEW.urun_id
      AND product.isletme_id = NEW.isletme_id
      AND product.is_archived IS FALSE
      AND (
        product.is_active IS TRUE
        OR internal.isletme_sahibi_v1(NEW.isletme_id)
      )
  ) THEN
    RAISE EXCEPTION 'PRODUCT_MOVEMENT_PRODUCT_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.urun_id, NEW.isletme_id)
         IS DISTINCT FROM (OLD.urun_id, OLD.isletme_id)
     AND NOT internal.isletme_sahibi_v1(OLD.isletme_id)
     AND NOT EXISTS (
       SELECT 1
       FROM public.urunler AS product
       WHERE product.id = OLD.urun_id
         AND product.isletme_id = OLD.isletme_id
         AND product.is_active IS TRUE
         AND product.is_archived IS FALSE
     ) THEN
    RAISE EXCEPTION 'PRODUCT_MOVEMENT_PRODUCT_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE'
     AND NOT internal.isletme_sahibi_v1(OLD.isletme_id)
     AND EXISTS (
       SELECT 1
       FROM public.urunler AS product
       WHERE product.id = OLD.urun_id
         AND product.isletme_id = OLD.isletme_id
         AND (
           product.is_active IS NOT TRUE
           OR product.is_archived IS NOT FALSE
         )
     ) THEN
    -- A same-tenant parent still present but passive/archived cannot have its
    -- ledger edited. If the parent is already absent, this row is being removed
    -- by the immediate FK cascade after an authorized product hard-delete.
    RAISE EXCEPTION 'PRODUCT_MOVEMENT_PRODUCT_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP <> 'DELETE' AND (
    NEW.miktar IS NULL
    OR NEW.miktar = 'NaN'::numeric
    OR NEW.miktar = 'Infinity'::numeric
    OR NEW.miktar = '-Infinity'::numeric
    OR NEW.miktar = 0
    OR pg_catalog.abs(NEW.miktar) > 999999999999.999
    OR NEW.miktar IS DISTINCT FROM pg_catalog.round(NEW.miktar, 3)
    OR (
      NEW.birim_fiyat IS NOT NULL
      AND (
        NEW.birim_fiyat = 'NaN'::numeric
        OR NEW.birim_fiyat = 'Infinity'::numeric
        OR NEW.birim_fiyat = '-Infinity'::numeric
        OR NEW.birim_fiyat < 0
        OR NEW.birim_fiyat > 9999999999999.99
        OR NEW.birim_fiyat
           IS DISTINCT FROM pg_catalog.round(NEW.birim_fiyat, 2)
      )
    )
    OR (
      NEW.kdv_orani IS NOT NULL
      AND (NEW.kdv_orani < 0 OR NEW.kdv_orani > 100)
    )
    OR (
      NEW.onceki_miktar IS NOT NULL
      AND (
        NEW.onceki_miktar = 'NaN'::numeric
        OR NEW.onceki_miktar = 'Infinity'::numeric
        OR NEW.onceki_miktar = '-Infinity'::numeric
        OR pg_catalog.abs(NEW.onceki_miktar) > 999999999999.999
        OR NEW.onceki_miktar
           IS DISTINCT FROM pg_catalog.round(NEW.onceki_miktar, 3)
      )
    )
    OR (
      NEW.yeni_miktar IS NOT NULL
      AND (
        NEW.yeni_miktar = 'NaN'::numeric
        OR NEW.yeni_miktar = 'Infinity'::numeric
        OR NEW.yeni_miktar = '-Infinity'::numeric
        OR pg_catalog.abs(NEW.yeni_miktar) > 999999999999.999
        OR NEW.yeni_miktar
           IS DISTINCT FROM pg_catalog.round(NEW.yeni_miktar, 3)
      )
    )
  ) THEN
    RAISE EXCEPTION 'PRODUCT_MOVEMENT_INVALID_PAYLOAD'
      USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_isletme_ids := ARRAY[NEW.isletme_id];
    v_islem_ids := ARRAY[NEW.islem_id];
    v_actions := ARRAY['create'];
  ELSIF TG_OP = 'DELETE' THEN
    v_isletme_ids := ARRAY[OLD.isletme_id];
    v_islem_ids := ARRAY[OLD.islem_id];
    v_actions := ARRAY['delete'];
  ELSE
    v_isletme_ids := ARRAY[OLD.isletme_id];
    v_islem_ids := ARRAY[OLD.islem_id];
    v_actions := ARRAY['update'];

    IF (NEW.isletme_id, NEW.islem_id)
       IS DISTINCT FROM (OLD.isletme_id, OLD.islem_id) THEN
      v_isletme_ids := pg_catalog.array_append(
        v_isletme_ids, NEW.isletme_id
      );
      v_islem_ids := pg_catalog.array_append(v_islem_ids, NEW.islem_id);
      v_actions := pg_catalog.array_append(v_actions, 'update');
    END IF;
  END IF;

  FOR v_context_index IN 1..pg_catalog.cardinality(v_islem_ids) LOOP
    -- Bagimsiz stok hareketi Urunler tablosunun mevcut RLS akisinda kalir.
    IF v_islem_ids[v_context_index] IS NULL THEN
      CONTINUE;
    END IF;

    SELECT transaction_row.*
    INTO v_transaction
    FROM public.islemler AS transaction_row
    WHERE transaction_row.id = v_islem_ids[v_context_index]
      AND transaction_row.isletme_id = v_isletme_ids[v_context_index];

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_MOVEMENT_LINK_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;

    IF TG_OP <> 'DELETE'
       AND NEW.islem_id = v_islem_ids[v_context_index] THEN
      v_expected_movement := CASE
        WHEN v_transaction.type::text IN (
          'gider', 'cari_alis', 'cari_satis_iade'
        ) THEN 'giris'
        WHEN v_transaction.type::text IN (
          'gelir', 'cari_satis', 'cari_alis_iade', 'personel_satis'
        ) THEN 'cikis'
        ELSE NULL
      END;

      IF v_expected_movement IS NULL
         OR NEW.hareket_tipi IS DISTINCT FROM v_expected_movement
         OR NEW.miktar <= 0
         OR NEW.birim_fiyat IS NULL
         OR NEW.kdv_orani IS NULL
         OR NEW.onceki_miktar IS NULL
         OR NEW.yeni_miktar IS NULL
         OR NEW.yeni_miktar IS DISTINCT FROM (
           NEW.onceki_miktar
           + CASE v_expected_movement
               WHEN 'giris' THEN pg_catalog.abs(NEW.miktar)
               ELSE -pg_catalog.abs(NEW.miktar)
             END
         ) THEN
        RAISE EXCEPTION 'PRODUCT_MOVEMENT_INVALID_LINKED_PAYLOAD'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    v_context_action := NULL;
    SELECT action_context.action
    INTO v_context_action
    FROM internal.permission_v2_movement_action_context AS action_context
    WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
      AND action_context.transaction_id = pg_catalog.txid_current()
      AND action_context.actor_user_id = auth.uid()
      AND action_context.isletme_id = v_isletme_ids[v_context_index]
      AND action_context.islem_id = v_islem_ids[v_context_index];

    v_is_owner := internal.isletme_sahibi_v1(
      v_isletme_ids[v_context_index]
    );
    IF (
      TG_OP = 'DELETE'
      AND (
        v_context_action IS NULL
        OR v_context_action NOT IN ('create', 'update', 'delete')
      )
    ) OR (
      TG_OP <> 'DELETE'
      AND NOT v_is_owner
      AND (
        v_context_action IS NULL
        OR (TG_OP = 'INSERT' AND v_context_action NOT IN ('create', 'update'))
        OR (TG_OP = 'UPDATE' AND v_context_action <> 'update')
      )
    ) THEN
      RAISE EXCEPTION 'PRODUCT_MOVEMENT_CANONICAL_RPC_REQUIRED'
        USING ERRCODE = '42501';
    END IF;

    v_action := COALESCE(
      v_context_action,
      v_actions[v_context_index]
    );
    v_modules := internal.islem_tipi_modulu(v_transaction.type::text);
    IF v_modules IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_MOVEMENT_LINK_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;

    FOREACH v_module IN ARRAY v_modules LOOP
      IF NOT (
        internal.kayit_mutasyon_izni_v1(
          v_isletme_ids[v_context_index],
          v_module,
          v_transaction.created_by,
          v_action
        )
        OR (
          v_action = 'create'
          AND internal.kayit_mutasyon_izni_v1(
            v_isletme_ids[v_context_index],
            v_module,
            v_transaction.created_by,
            'update'
          )
        )
      ) THEN
        RAISE EXCEPTION 'PRODUCT_MOVEMENT_LINK_NOT_AUTHORIZED'
          USING ERRCODE = '42501';
      END IF;
    END LOOP;

    IF NOT (
      internal.kayit_mutasyon_izni_v1(
        v_isletme_ids[v_context_index],
        'urunler',
        v_transaction.created_by,
        v_action
      )
      OR (
        v_action = 'create'
        AND internal.kayit_mutasyon_izni_v1(
          v_isletme_ids[v_context_index],
          'urunler',
          v_transaction.created_by,
          'update'
        )
      )
    ) THEN
      RAISE EXCEPTION 'PRODUCT_MOVEMENT_LINK_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION internal.enforce_linked_product_movement_permission_v1()
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.enforce_linked_product_movement_permission_v1()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_urun_hareket_link_permission_v1
BEFORE INSERT OR UPDATE OR DELETE
ON public.urun_hareketler
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_linked_product_movement_permission_v1();


CREATE OR REPLACE FUNCTION public.set_urun_miktar_hedef(
  p_isletme_id uuid,
  p_urun_id uuid,
  p_hedef numeric,
  p_created_at timestamp with time zone DEFAULT NULL,
  p_aciklama text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mevcut numeric;
  v_delta numeric;
  v_created_by uuid;
BEGIN
  IF auth.uid() IS NULL
     OR p_isletme_id IS NULL
     OR p_urun_id IS NULL
     OR p_hedef IS NULL
     OR p_hedef = 'NaN'::numeric
     OR p_hedef = 'Infinity'::numeric
     OR p_hedef = '-Infinity'::numeric
     OR NOT internal.kayit_mutasyon_izni_v1(
       p_isletme_id, 'urunler', auth.uid(), 'create'
     ) THEN
    RAISE EXCEPTION 'PRODUCT_STOCK_TARGET_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT product.miktar, product.created_by
  INTO v_mevcut, v_created_by
  FROM public.urunler AS product
  WHERE product.id = p_urun_id
    AND product.isletme_id = p_isletme_id
    AND product.is_active IS TRUE
    AND product.is_archived IS FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_STOCK_TARGET_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  v_delta := p_hedef - COALESCE(v_mevcut, 0);
  IF v_delta = 0 THEN
    RETURN p_hedef;
  END IF;

  UPDATE public.urunler AS product
  SET miktar = p_hedef,
      updated_at = pg_catalog.clock_timestamp()
  WHERE product.id = p_urun_id
    AND product.isletme_id = p_isletme_id;

  INSERT INTO public.urun_hareketler (
    isletme_id,
    urun_id,
    islem_id,
    hareket_tipi,
    miktar,
    birim_fiyat,
    kdv_orani,
    onceki_miktar,
    yeni_miktar,
    aciklama,
    created_at
  )
  VALUES (
    p_isletme_id,
    p_urun_id,
    NULL,
    'duzeltme',
    v_delta,
    NULL,
    NULL,
    v_mevcut,
    p_hedef,
    p_aciklama,
    COALESCE(p_created_at, pg_catalog.clock_timestamp())
  );

  RETURN p_hedef;
END;
$function$;

ALTER FUNCTION public.set_urun_miktar_hedef(
  uuid, uuid, numeric, timestamp with time zone, text
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.set_urun_miktar_hedef(
  uuid, uuid, numeric, timestamp with time zone, text
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.set_urun_miktar_hedef(
  uuid, uuid, numeric, timestamp with time zone, text
)
TO authenticated;


-- ---------------------------------------------------------------------------
-- 9.b) PRIVATE, SERVER-DERIVED FINANCIAL ENGINES
-- ---------------------------------------------------------------------------
-- These functions are deliberately not callable by API roles. Public V2 and
-- legacy compatibility wrappers may reach them only after deriving the
-- canonical row and balance operations on the server.
CREATE FUNCTION internal.apply_balance_ops_v2(
  p_isletme_id uuid,
  p_ops jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_op jsonb;
  v_table text;
  v_id uuid;
  v_delta numeric;
  v_rowcount integer;
BEGIN
  IF p_isletme_id IS NULL
     OR p_ops IS NULL
     OR pg_catalog.jsonb_typeof(p_ops) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_ops) > 16 THEN
    RAISE EXCEPTION 'BALANCE_ENGINE_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  FOR v_op IN
    SELECT operation.value
    FROM pg_catalog.jsonb_array_elements(p_ops) AS operation(value)
    ORDER BY operation.value->>'t', operation.value->>'id'
  LOOP
    BEGIN
      v_table := v_op->>'t';
      v_id := (v_op->>'id')::uuid;
      v_delta := (v_op->>'d')::numeric;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'BALANCE_ENGINE_INVALID_INPUT'
          USING ERRCODE = '22023';
    END;

    IF pg_catalog.jsonb_typeof(v_op) IS DISTINCT FROM 'object'
       OR v_table NOT IN ('hesaplar', 'cariler', 'personel')
       OR v_id IS NULL
       OR v_delta IS NULL
       OR v_delta = 'NaN'::numeric
       OR v_delta = 'Infinity'::numeric
       OR v_delta = '-Infinity'::numeric
       OR pg_catalog.abs(v_delta) > 9999999999999.99 THEN
      RAISE EXCEPTION 'BALANCE_ENGINE_INVALID_INPUT'
        USING ERRCODE = '22023';
    END IF;

    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

    IF v_table = 'hesaplar' THEN
      UPDATE public.hesaplar AS account
      SET balance = COALESCE(account.balance, 0) + v_delta,
          updated_at = pg_catalog.clock_timestamp()
      WHERE account.id = v_id
        AND account.isletme_id = p_isletme_id
        AND pg_catalog.abs(COALESCE(account.balance, 0) + v_delta)
          <= 9999999999999.99;
    ELSIF v_table = 'cariler' THEN
      UPDATE public.cariler AS customer
      SET balance = COALESCE(customer.balance, 0) + v_delta,
          updated_at = pg_catalog.clock_timestamp()
      WHERE customer.id = v_id
        AND customer.isletme_id = p_isletme_id
        AND pg_catalog.abs(COALESCE(customer.balance, 0) + v_delta)
          <= 9999999999999.99;
    ELSE
      UPDATE public.personel AS employee
      SET balance = COALESCE(employee.balance, 0) + v_delta,
          updated_at = pg_catalog.clock_timestamp()
      WHERE employee.id = v_id
        AND employee.isletme_id = p_isletme_id
        AND pg_catalog.abs(COALESCE(employee.balance, 0) + v_delta)
          <= 9999999999999.99;
    END IF;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount <> 1 THEN
      RAISE EXCEPTION 'BALANCE_ENGINE_ENTITY_NOT_FOUND'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
END;
$function$;

ALTER FUNCTION internal.apply_balance_ops_v2(uuid, jsonb)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.apply_balance_ops_v2(uuid, jsonb)
FROM PUBLIC, anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.create_islem_atomik_v2(
  p_isletme_id uuid,
  p_new_row jsonb
)
RETURNS TABLE (
  id uuid,
  type text,
  amount numeric,
  description text,
  "date" timestamp without time zone,
  hesap_id uuid,
  hedef_hesap_id uuid,
  kategori_id uuid,
  cari_id uuid,
  personel_id uuid,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  date_end text,
  vade_tarihi date,
  hedef_islem_id uuid,
  created_at timestamp with time zone,
  created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_id uuid;
  v_type text;
  v_amount_input numeric;
  v_amount public.islemler.amount%TYPE;
  v_description text;
  v_date_text text;
  v_date public.islemler.date%TYPE;
  v_hesap_id uuid;
  v_hedef_hesap_id uuid;
  v_kategori_id uuid;
  v_cari_id uuid;
  v_personel_id uuid;
  v_source_assertion text;
  v_target_assertion text;
  v_rate_input numeric;
  v_rate public.islemler.exchange_rate%TYPE;
  v_photo_path text;
  v_date_end text;
  v_source_ileri_id uuid;
  v_vade_tarihi date;
  v_hedef_islem_id uuid;
  v_modules text[];
  v_module text;
  v_can boolean;
  v_expected_category_type text;
  v_expected_invoice_type text;
  v_cari_currency text;
  v_personel_currency text;
  v_hesap_currency text;
  v_hedef_hesap_currency text;
  v_source_currency text;
  v_target_currency text;
  v_account_ids uuid[];
  v_account record;
  v_account_count integer := 0;
  v_expected_account_count integer := 0;
  v_requires_birikim boolean := false;
  v_existing public.islemler%ROWTYPE;
  v_inserted_rows integer := 0;
  v_updated_rows integer := 0;
  v_canonical jsonb;
  v_op record;
  v_op_count integer := 0;
  v_expected_op_count integer := 0;
  v_cari_delta numeric;
  v_personel_delta numeric;
  v_hesap_delta numeric;
  v_hedef_hesap_delta numeric;
  v_cari_balance numeric;
  v_personel_balance numeric;
  v_hesap_balance numeric;
  v_hedef_hesap_balance numeric;
BEGIN
  -- Tenant satiri her cagrida ilk kilittir. Uye ise aktif uyelik ikinci kilittir.
  IF v_uid IS NULL OR p_isletme_id IS NULL THEN
    RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT isl.user_id
  INTO v_owner_id
  FROM public.isletmeler AS isl
  WHERE isl.id = p_isletme_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF v_owner_id IS DISTINCT FROM v_uid THEN
    PERFORM 1
    FROM public.isletme_users AS iu
    WHERE iu.isletme_id = p_isletme_id
      AND iu.user_id = v_uid
      AND iu.status = 'active'
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- JSON allowlist: tenant/audit/bakiye/created_at gibi server-owned alanlar
  -- payload'a sizamaz. photo/source_ileri yalniz explicit null uyumlulugu icindir.
  IF p_new_row IS NULL
     OR pg_catalog.jsonb_typeof(p_new_row) IS DISTINCT FROM 'object'
     OR NOT (p_new_row ?& ARRAY['id', 'type', 'amount', 'date'])
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_object_keys(p_new_row) AS payload_key(key_name)
       WHERE payload_key.key_name NOT IN (
         'id', 'type', 'amount', 'description', 'date',
         'hesap_id', 'hedef_hesap_id', 'kategori_id', 'cari_id', 'personel_id',
         'source_currency', 'target_currency', 'exchange_rate',
         'photo_path', 'date_end', 'source_ileri_id',
         'vade_tarihi', 'hedef_islem_id'
       )
     )
     OR pg_catalog.jsonb_typeof(p_new_row->'id') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_new_row->'type') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_new_row->'amount') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(p_new_row->'date') IS DISTINCT FROM 'string'
     OR (
       p_new_row ? 'description'
       AND pg_catalog.jsonb_typeof(p_new_row->'description') NOT IN ('string', 'null')
     )
     OR (
       p_new_row ? 'exchange_rate'
       AND pg_catalog.jsonb_typeof(p_new_row->'exchange_rate') NOT IN ('number', 'null')
     )
     OR (
       p_new_row ? 'source_currency'
       AND pg_catalog.jsonb_typeof(p_new_row->'source_currency') NOT IN ('string', 'null')
     )
     OR (
       p_new_row ? 'target_currency'
       AND pg_catalog.jsonb_typeof(p_new_row->'target_currency') NOT IN ('string', 'null')
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.unnest(ARRAY[
         'hesap_id', 'hedef_hesap_id', 'kategori_id', 'cari_id', 'personel_id',
         'source_ileri_id', 'hedef_islem_id'
       ]) AS optional_uuid(key_name)
       WHERE p_new_row ? optional_uuid.key_name
         AND pg_catalog.jsonb_typeof(p_new_row->optional_uuid.key_name)
           NOT IN ('string', 'null')
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.unnest(ARRAY[
         'photo_path', 'date_end', 'vade_tarihi'
       ]) AS optional_text(key_name)
       WHERE p_new_row ? optional_text.key_name
         AND pg_catalog.jsonb_typeof(p_new_row->optional_text.key_name)
           NOT IN ('string', 'null')
     ) THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  v_date_text := p_new_row->>'date';
  IF v_date_text !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?([+-][0-9]{2}:[0-9]{2}|Z)?$'
     OR (
       p_new_row->>'date_end' IS NOT NULL
       AND p_new_row->>'date_end' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     )
     OR (
       p_new_row->>'vade_tarihi' IS NOT NULL
       AND p_new_row->>'vade_tarihi' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     ) THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_id := (p_new_row->>'id')::uuid;
    v_type := p_new_row->>'type';
    v_amount_input := (p_new_row->>'amount')::numeric;
    v_description := NULLIF(pg_catalog.btrim(p_new_row->>'description'), '');
    v_date := v_date_text::timestamp without time zone;
    v_hesap_id := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'hesap_id') = 'string'
        THEN (p_new_row->>'hesap_id')::uuid
      ELSE NULL
    END;
    v_hedef_hesap_id := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'hedef_hesap_id') = 'string'
        THEN (p_new_row->>'hedef_hesap_id')::uuid
      ELSE NULL
    END;
    v_kategori_id := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'kategori_id') = 'string'
        THEN (p_new_row->>'kategori_id')::uuid
      ELSE NULL
    END;
    v_cari_id := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'cari_id') = 'string'
        THEN (p_new_row->>'cari_id')::uuid
      ELSE NULL
    END;
    v_personel_id := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'personel_id') = 'string'
        THEN (p_new_row->>'personel_id')::uuid
      ELSE NULL
    END;
    v_rate_input := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'exchange_rate') = 'number'
        THEN (p_new_row->>'exchange_rate')::numeric
      ELSE NULL
    END;
    v_photo_path := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'photo_path') = 'string'
        THEN p_new_row->>'photo_path'
      ELSE NULL
    END;
    v_date_end := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'date_end') = 'string'
        THEN (p_new_row->>'date_end')::date::text
      ELSE NULL
    END;
    v_source_ileri_id := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'source_ileri_id') = 'string'
        THEN (p_new_row->>'source_ileri_id')::uuid
      ELSE NULL
    END;
    v_vade_tarihi := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'vade_tarihi') = 'string'
        THEN (p_new_row->>'vade_tarihi')::date
      ELSE NULL
    END;
    v_hedef_islem_id := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'hedef_islem_id') = 'string'
        THEN (p_new_row->>'hedef_islem_id')::uuid
      ELSE NULL
    END;
  EXCEPTION
    WHEN invalid_text_representation
      OR invalid_datetime_format
      OR datetime_field_overflow
      OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
        USING ERRCODE = '22023';
  END;

  IF v_id IS NULL
     OR v_type IS NULL
     OR v_amount_input IS NULL
     OR v_amount_input = 'NaN'::numeric
     OR v_amount_input = 'Infinity'::numeric
     OR v_amount_input = '-Infinity'::numeric
     OR v_amount_input <= 0
     OR v_amount_input > 9999999999999.99
     OR v_amount_input IS DISTINCT FROM pg_catalog.round(v_amount_input, 2)
     OR (
       v_rate_input IS NOT NULL
       AND (
         v_rate_input = 'NaN'::numeric
         OR v_rate_input = 'Infinity'::numeric
         OR v_rate_input = '-Infinity'::numeric
         OR v_rate_input <= 0
         OR v_rate_input > 9999999999.99999999
         OR v_rate_input IS DISTINCT FROM pg_catalog.round(v_rate_input, 8)
       )
     ) THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  v_amount := v_amount_input;
  v_rate := v_rate_input;
  v_source_assertion := NULLIF(
    pg_catalog.upper(pg_catalog.btrim(p_new_row->>'source_currency')),
    ''
  );
  v_target_assertion := NULLIF(
    pg_catalog.upper(pg_catalog.btrim(p_new_row->>'target_currency')),
    ''
  );

  IF (v_source_assertion IS NULL) IS DISTINCT FROM
       (v_target_assertion IS NULL)
     OR (
       v_source_assertion IS NOT NULL
       AND (
         v_source_assertion NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
         OR v_target_assertion NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
       )
     ) THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  -- Canonical source module supplies the exact create action. Supporting
  -- account references in Cari/Personel cash rows do not become extra
  -- mutation modules; savings accounts retain their explicit gate below.
  IF internal.islem_tipi_modulu(v_type) IS NULL THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  IF NOT internal.islem_mutasyon_izni_v2(
    p_isletme_id,
    v_type,
    v_uid,
    'create',
    v_id
  ) THEN
    RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  -- Tip/entity sekli exact. Fazladan entity UUID'si kabul edilmez.
  IF (CASE v_type
    WHEN 'gelir' THEN
      v_hesap_id IS NOT NULL AND v_hedef_hesap_id IS NULL
      AND v_cari_id IS NULL AND v_personel_id IS NULL
    WHEN 'gider' THEN
      v_hesap_id IS NOT NULL AND v_hedef_hesap_id IS NULL
      AND v_cari_id IS NULL AND v_personel_id IS NULL
    WHEN 'transfer' THEN
      v_hesap_id IS NOT NULL AND v_hedef_hesap_id IS NOT NULL
      AND v_hesap_id IS DISTINCT FROM v_hedef_hesap_id
      AND v_cari_id IS NULL AND v_personel_id IS NULL
    WHEN 'cari_alis' THEN
      v_cari_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_personel_id IS NULL
    WHEN 'cari_satis' THEN
      v_cari_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_personel_id IS NULL
    WHEN 'cari_alis_iade' THEN
      v_cari_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_personel_id IS NULL
    WHEN 'cari_satis_iade' THEN
      v_cari_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_personel_id IS NULL
    WHEN 'cari_odeme' THEN
      v_cari_id IS NOT NULL AND v_hesap_id IS NOT NULL
      AND v_hedef_hesap_id IS NULL AND v_personel_id IS NULL
    WHEN 'cari_tahsilat' THEN
      v_cari_id IS NOT NULL AND v_hesap_id IS NOT NULL
      AND v_hedef_hesap_id IS NULL AND v_personel_id IS NULL
    WHEN 'personel_gider' THEN
      v_personel_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_cari_id IS NULL
    WHEN 'personel_satis' THEN
      v_personel_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_cari_id IS NULL
    WHEN 'personel_izin_hakki' THEN
      v_personel_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_cari_id IS NULL
    WHEN 'personel_izin_kullanimi' THEN
      v_personel_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_cari_id IS NULL
    WHEN 'personel_odeme' THEN
      v_personel_id IS NOT NULL AND v_hesap_id IS NOT NULL
      AND v_hedef_hesap_id IS NULL AND v_cari_id IS NULL
    WHEN 'personel_tahsilat' THEN
      v_personel_id IS NOT NULL AND v_hesap_id IS NOT NULL
      AND v_hedef_hesap_id IS NULL AND v_cari_id IS NULL
    ELSE false
  END) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  IF v_photo_path IS NOT NULL OR v_source_ileri_id IS NOT NULL THEN
    RAISE EXCEPTION 'ISLEM_V2_FEATURE_UNSUPPORTED'
      USING ERRCODE = '0A000';
  END IF;

  IF (v_date_end IS NOT NULL AND v_type <> 'personel_izin_kullanimi')
     OR (
       v_date_end IS NOT NULL
       AND v_date_end::date < v_date::date
     )
     OR (
       v_vade_tarihi IS NOT NULL
       AND v_type NOT IN ('cari_alis', 'cari_satis')
     )
     OR (
       v_hedef_islem_id IS NOT NULL
       AND v_type NOT IN ('cari_odeme', 'cari_tahsilat')
     ) THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  -- Idempotency pre-probe entity sonradan arsivlense bile ayni retry'i no-op tutar.
  SELECT existing_row.*
  INTO v_existing
  FROM public.islemler AS existing_row
  WHERE existing_row.id = v_id
  FOR SHARE;

  IF FOUND THEN
    IF v_existing.isletme_id IS DISTINCT FROM p_isletme_id
       OR v_existing.created_by IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'ISLEM_V2_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;

    v_source_currency := pg_catalog.upper(
      pg_catalog.btrim(v_existing.source_currency)
    );
    v_target_currency := pg_catalog.upper(
      pg_catalog.btrim(v_existing.target_currency)
    );

    IF v_source_currency IS NULL
       OR v_target_currency IS NULL
       OR v_source_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
       OR v_target_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
       OR (
         v_source_assertion IS NOT NULL
         AND (
           v_source_assertion IS DISTINCT FROM v_source_currency
           OR v_target_assertion IS DISTINCT FROM v_target_currency
         )
       )
       OR (
         v_source_currency = v_target_currency
         AND v_rate IS NOT NULL
       )
       OR (
         v_source_currency <> v_target_currency
         AND v_rate IS NULL
       )
       OR v_existing.type::text IS DISTINCT FROM v_type
       OR v_existing.amount IS DISTINCT FROM v_amount
       OR v_existing.description IS DISTINCT FROM v_description
       OR v_existing.date IS DISTINCT FROM v_date
       OR v_existing.hesap_id IS DISTINCT FROM v_hesap_id
       OR v_existing.hedef_hesap_id IS DISTINCT FROM v_hedef_hesap_id
       OR v_existing.kategori_id IS DISTINCT FROM v_kategori_id
       OR v_existing.cari_id IS DISTINCT FROM v_cari_id
       OR v_existing.personel_id IS DISTINCT FROM v_personel_id
       OR v_existing.source_currency IS DISTINCT FROM v_source_currency
       OR v_existing.target_currency IS DISTINCT FROM v_target_currency
       OR v_existing.exchange_rate IS DISTINCT FROM v_rate
       OR v_existing.photo_path IS NOT NULL
       OR v_existing.date_end IS DISTINCT FROM v_date_end
       OR v_existing.source_ileri_id IS NOT NULL
       OR v_existing.vade_tarihi IS DISTINCT FROM v_vade_tarihi
       OR v_existing.hedef_islem_id IS DISTINCT FROM v_hedef_islem_id THEN
      RAISE EXCEPTION 'ISLEM_V2_IDEMPOTENCY_PAYLOAD_MISMATCH'
        USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
      result_row.id,
      result_row.type::text,
      result_row.amount,
      result_row.description,
      result_row.date::timestamp without time zone,
      result_row.hesap_id,
      result_row.hedef_hesap_id,
      result_row.kategori_id,
      result_row.cari_id,
      result_row.personel_id,
      result_row.source_currency,
      result_row.target_currency,
      result_row.exchange_rate,
      result_row.date_end,
      result_row.vade_tarihi,
      result_row.hedef_islem_id,
      result_row.created_at,
      result_row.created_by
    FROM public.islemler AS result_row
    WHERE result_row.id = v_id
      AND result_row.isletme_id = p_isletme_id;
    RETURN;
  END IF;

  -- Deterministik entity kilit sirasi: cari -> personel -> hesap UUID sirasi
  -- -> kategori -> hedef fatura. Her satir ayni tenant, aktif ve arsivsizdir.
  IF v_cari_id IS NOT NULL THEN
    SELECT
      COALESCE(
        NULLIF(pg_catalog.upper(pg_catalog.btrim(c.currency::text)), ''),
        'TRY'
      ),
      c.balance
    INTO v_cari_currency, v_cari_balance
    FROM public.cariler AS c
    WHERE c.id = v_cari_id
      AND c.isletme_id = p_isletme_id
      AND c.is_active IS TRUE
      AND c.is_archived IS FALSE
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      IF EXISTS (
        SELECT 1
        FROM public.cari_links AS link
        WHERE link.cari_id = v_cari_id
          AND link.viewer_isletme_id = p_isletme_id
      ) THEN
        RAISE EXCEPTION 'ISLEM_V2_LINKED_CARI_UNSUPPORTED'
          USING ERRCODE = '0A000';
      END IF;

      RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_personel_id IS NOT NULL THEN
    SELECT
      COALESCE(
        NULLIF(pg_catalog.upper(pg_catalog.btrim(p.currency::text)), ''),
        'TRY'
      ),
      p.balance
    INTO v_personel_currency, v_personel_balance
    FROM public.personel AS p
    WHERE p.id = v_personel_id
      AND p.isletme_id = p_isletme_id
      AND p.is_active IS TRUE
      AND p.is_archived IS FALSE
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_account_ids := pg_catalog.array_remove(
    ARRAY[v_hesap_id, v_hedef_hesap_id],
    NULL
  );
  v_expected_account_count := pg_catalog.cardinality(v_account_ids);

  FOR v_account IN
    SELECT
      h.id,
      h.type::text AS account_type,
      COALESCE(
        NULLIF(pg_catalog.upper(pg_catalog.btrim(h.currency::text)), ''),
        'TRY'
      ) AS account_currency,
      h.balance
    FROM public.hesaplar AS h
    WHERE h.id = ANY(v_account_ids)
      AND h.isletme_id = p_isletme_id
      AND h.is_active IS TRUE
      AND h.is_archived IS FALSE
    ORDER BY h.id
    FOR NO KEY UPDATE
  LOOP
    v_account_count := v_account_count + 1;
    v_requires_birikim :=
      v_requires_birikim OR v_account.account_type = 'birikim';

    IF v_account.id = v_hesap_id THEN
      v_hesap_currency := v_account.account_currency;
      v_hesap_balance := v_account.balance;
    ELSIF v_account.id = v_hedef_hesap_id THEN
      v_hedef_hesap_currency := v_account.account_currency;
      v_hedef_hesap_balance := v_account.balance;
    END IF;
  END LOOP;

  IF v_account_count <> v_expected_account_count THEN
    RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF v_requires_birikim THEN
    SELECT permission.can_view
    INTO v_can
    FROM internal.etkin_yetki_v2(p_isletme_id, 'birikim') AS permission;

    IF v_can IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_expected_category_type := CASE
    WHEN v_type IN (
      'gelir', 'cari_tahsilat', 'cari_satis', 'cari_satis_iade',
      'personel_tahsilat', 'personel_satis'
    ) THEN 'gelir'
    WHEN v_type IN (
      'gider', 'transfer', 'cari_odeme', 'cari_alis', 'cari_alis_iade',
      'personel_odeme', 'personel_gider'
    ) THEN 'gider'
    ELSE NULL
  END;

  IF v_kategori_id IS NOT NULL THEN
    IF v_expected_category_type IS NULL THEN
      RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
        USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.kategoriler AS k
    WHERE k.id = v_kategori_id
      AND k.isletme_id = p_isletme_id
      AND k.is_active IS TRUE
      AND k.type::text = v_expected_category_type
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_hedef_islem_id IS NOT NULL THEN
    v_expected_invoice_type := CASE
      WHEN v_type = 'cari_tahsilat' THEN 'cari_satis'
      ELSE 'cari_alis'
    END;

    PERFORM 1
    FROM public.islemler AS invoice
    WHERE invoice.id = v_hedef_islem_id
      AND invoice.isletme_id = p_isletme_id
      AND invoice.cari_id = v_cari_id
      AND invoice.type::text = v_expected_invoice_type
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Para birimleri yalniz kilitli DB entity satirlarindan turetilir.
  IF v_type IN (
    'transfer', 'cari_odeme', 'cari_tahsilat',
    'personel_odeme', 'personel_tahsilat'
  ) THEN
    v_source_currency := v_hesap_currency;
    v_target_currency := CASE
      WHEN v_type = 'transfer' THEN v_hedef_hesap_currency
      WHEN v_type LIKE 'cari_%' THEN v_cari_currency
      ELSE v_personel_currency
    END;
  ELSIF v_type LIKE 'cari_%' THEN
    v_source_currency := v_cari_currency;
    v_target_currency := v_cari_currency;
  ELSIF v_type LIKE 'personel_%' THEN
    v_source_currency := v_personel_currency;
    v_target_currency := v_personel_currency;
  ELSE
    v_source_currency := v_hesap_currency;
    v_target_currency := v_hesap_currency;
  END IF;

  IF v_source_currency IS NULL
     OR v_target_currency IS NULL
     OR v_source_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
     OR v_target_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
     OR (
       v_source_assertion IS NOT NULL
       AND (
         v_source_assertion IS DISTINCT FROM v_source_currency
         OR v_target_assertion IS DISTINCT FROM v_target_currency
       )
     )
     OR (
       v_source_currency = v_target_currency
       AND v_rate IS NOT NULL
     )
     OR (
       v_source_currency <> v_target_currency
       AND v_rate IS NULL
     ) THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  -- Hedef pointer kontrolu, DB'den turetilmis para birimlerinden sonra yapilir.
  IF v_hedef_islem_id IS NOT NULL
     AND v_source_currency <> v_target_currency
     AND v_source_currency <> 'TRY'
     AND v_target_currency <> 'TRY' THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  v_canonical := pg_catalog.jsonb_build_object(
    'type', v_type,
    'amount', v_amount,
    'exchange_rate', v_rate,
    'source_currency', v_source_currency,
    'target_currency', v_target_currency,
    'hesap_id', v_hesap_id,
    'hedef_hesap_id', v_hedef_hesap_id,
    'cari_id', v_cari_id,
    'personel_id', v_personel_id
  );

  -- Bakiye ops istemciden alinmaz: tek server helper'i kanonik payload'dan turetir.
  FOR v_op IN
    SELECT derived.t, derived.entity_id, derived.d
    FROM internal.bakiye_ops(v_canonical) AS derived
  LOOP
    v_op_count := v_op_count + 1;
    IF v_op.d IS NULL
       OR v_op.d = 'NaN'::numeric
       OR v_op.d = 'Infinity'::numeric
       OR v_op.d = '-Infinity'::numeric
       OR pg_catalog.abs(v_op.d) > 9999999999999.99 THEN
      RAISE EXCEPTION 'ISLEM_V2_BALANCE_OUT_OF_RANGE'
        USING ERRCODE = '22003';
    END IF;

    CASE v_op.t
      WHEN 'cariler' THEN
        IF v_op.entity_id IS DISTINCT FROM v_cari_id
           OR v_cari_delta IS NOT NULL THEN
          RAISE EXCEPTION 'ISLEM_V2_BALANCE_CONTRACT_DRIFT'
            USING ERRCODE = '55000';
        END IF;
        v_cari_delta := v_op.d;
      WHEN 'personel' THEN
        IF v_op.entity_id IS DISTINCT FROM v_personel_id
           OR v_personel_delta IS NOT NULL THEN
          RAISE EXCEPTION 'ISLEM_V2_BALANCE_CONTRACT_DRIFT'
            USING ERRCODE = '55000';
        END IF;
        v_personel_delta := v_op.d;
      WHEN 'hesaplar' THEN
        IF v_op.entity_id = v_hesap_id AND v_hesap_delta IS NULL THEN
          v_hesap_delta := v_op.d;
        ELSIF v_op.entity_id = v_hedef_hesap_id
              AND v_hedef_hesap_delta IS NULL THEN
          v_hedef_hesap_delta := v_op.d;
        ELSE
          RAISE EXCEPTION 'ISLEM_V2_BALANCE_CONTRACT_DRIFT'
            USING ERRCODE = '55000';
        END IF;
      ELSE
        RAISE EXCEPTION 'ISLEM_V2_BALANCE_CONTRACT_DRIFT'
          USING ERRCODE = '55000';
    END CASE;
  END LOOP;

  v_expected_op_count := CASE v_type
    WHEN 'transfer' THEN 2
    WHEN 'cari_odeme' THEN 2
    WHEN 'cari_tahsilat' THEN 2
    WHEN 'personel_odeme' THEN 2
    WHEN 'personel_tahsilat' THEN 2
    WHEN 'personel_izin_hakki' THEN 0
    WHEN 'personel_izin_kullanimi' THEN 0
    ELSE 1
  END;

  IF v_op_count <> v_expected_op_count
     OR (
       v_cari_delta IS NOT NULL
       AND v_cari_balance IS NOT NULL
       AND pg_catalog.abs(v_cari_balance + v_cari_delta)
         > 9999999999999.99
     )
     OR (
       v_personel_delta IS NOT NULL
       AND v_personel_balance IS NOT NULL
       AND pg_catalog.abs(v_personel_balance + v_personel_delta)
         > 9999999999999.99
     )
     OR (
       v_hesap_delta IS NOT NULL
       AND v_hesap_balance IS NOT NULL
       AND pg_catalog.abs(v_hesap_balance + v_hesap_delta)
         > 9999999999999.99
     )
     OR (
       v_hedef_hesap_delta IS NOT NULL
       AND v_hedef_hesap_balance IS NOT NULL
       AND pg_catalog.abs(v_hedef_hesap_balance + v_hedef_hesap_delta)
         > 9999999999999.99
     ) THEN
    RAISE EXCEPTION 'ISLEM_V2_BALANCE_OUT_OF_RANGE'
      USING ERRCODE = '22003';
  END IF;

  -- Shared kullanicinin finansal satiri yalniz bu server-derived bakiye
  -- motorundan yazilabilir. Private context, direct REST INSERT ile
  -- taklit edilemez ve satir trigger'i tarafindan tek transaction icinde
  -- tuketilmeden dogrulanir.
  INSERT INTO internal.permission_v2_movement_action_context (
    backend_pid,
    transaction_id,
    actor_user_id,
    isletme_id,
    islem_id,
    action
  )
  VALUES (
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current(),
    v_uid,
    p_isletme_id,
    v_id,
    'create'
  )
  ON CONFLICT (
    backend_pid, transaction_id, actor_user_id, isletme_id, islem_id
  )
  DO UPDATE SET action = EXCLUDED.action;

  INSERT INTO public.islemler (
    id,
    isletme_id,
    type,
    amount,
    description,
    date,
    hesap_id,
    hedef_hesap_id,
    kategori_id,
    cari_id,
    personel_id,
    source_currency,
    target_currency,
    exchange_rate,
    photo_path,
    date_end,
    source_ileri_id,
    vade_tarihi,
    hedef_islem_id,
    created_by
  )
  VALUES (
    v_id,
    p_isletme_id,
    v_type,
    v_amount,
    v_description,
    v_date,
    v_hesap_id,
    v_hedef_hesap_id,
    v_kategori_id,
    v_cari_id,
    v_personel_id,
    v_source_currency,
    v_target_currency,
    v_rate,
    NULL,
    v_date_end,
    NULL,
    v_vade_tarihi,
    v_hedef_islem_id,
    v_uid
  )
  ON CONFLICT ON CONSTRAINT islemler_pkey DO NOTHING;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  DELETE FROM internal.permission_v2_movement_action_context AS action_context
  WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
    AND action_context.transaction_id = pg_catalog.txid_current()
    AND action_context.actor_user_id = v_uid
    AND action_context.isletme_id = p_isletme_id
    AND action_context.islem_id = v_id
    AND action_context.action = 'create';

  -- Concurrent same-UUID yarisi: yalniz exact creator+kanonik payload no-op.
  IF v_inserted_rows = 0 THEN
    SELECT existing_row.*
    INTO v_existing
    FROM public.islemler AS existing_row
    WHERE existing_row.id = v_id
    FOR SHARE;

    IF NOT FOUND
       OR v_existing.isletme_id IS DISTINCT FROM p_isletme_id
       OR v_existing.created_by IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'ISLEM_V2_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;

    IF v_existing.type::text IS DISTINCT FROM v_type
       OR v_existing.amount IS DISTINCT FROM v_amount
       OR v_existing.description IS DISTINCT FROM v_description
       OR v_existing.date IS DISTINCT FROM v_date
       OR v_existing.hesap_id IS DISTINCT FROM v_hesap_id
       OR v_existing.hedef_hesap_id IS DISTINCT FROM v_hedef_hesap_id
       OR v_existing.kategori_id IS DISTINCT FROM v_kategori_id
       OR v_existing.cari_id IS DISTINCT FROM v_cari_id
       OR v_existing.personel_id IS DISTINCT FROM v_personel_id
       OR v_existing.source_currency IS DISTINCT FROM v_source_currency
       OR v_existing.target_currency IS DISTINCT FROM v_target_currency
       OR v_existing.exchange_rate IS DISTINCT FROM v_rate
       OR v_existing.photo_path IS NOT NULL
       OR v_existing.date_end IS DISTINCT FROM v_date_end
       OR v_existing.source_ileri_id IS NOT NULL
       OR v_existing.vade_tarihi IS DISTINCT FROM v_vade_tarihi
       OR v_existing.hedef_islem_id IS DISTINCT FROM v_hedef_islem_id THEN
      RAISE EXCEPTION 'ISLEM_V2_IDEMPOTENCY_PAYLOAD_MISMATCH'
        USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
      result_row.id,
      result_row.type::text,
      result_row.amount,
      result_row.description,
      result_row.date::timestamp without time zone,
      result_row.hesap_id,
      result_row.hedef_hesap_id,
      result_row.kategori_id,
      result_row.cari_id,
      result_row.personel_id,
      result_row.source_currency,
      result_row.target_currency,
      result_row.exchange_rate,
      result_row.date_end,
      result_row.vade_tarihi,
      result_row.hedef_islem_id,
      result_row.created_at,
      result_row.created_by
    FROM public.islemler AS result_row
    WHERE result_row.id = v_id
      AND result_row.isletme_id = p_isletme_id;
    RETURN;
  END IF;

  -- Apply only the server-derived operation set through the private engine.
  -- Entity rows were tenant/activity scoped and locked above; the private
  -- engine repeats tenant and finite/result-bound checks at the write point.
  PERFORM internal.apply_balance_ops_v2(
    p_isletme_id,
    COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            't', derived.t,
            'id', derived.entity_id,
            'd', derived.d
          )
          ORDER BY derived.t, derived.entity_id
        )
        FROM internal.bakiye_ops(v_canonical) AS derived
      ),
      '[]'::jsonb
    )
  );

  -- Mevcut TEK FIFO/tahsis motoru. Ikinci tahsis defteri kurulmaz.
  IF v_cari_id IS NOT NULL
     AND public.tahsis_borc_tipleri(v_type) IS NOT NULL THEN
    PERFORM public.tahsis_odeme_esitle(
      p_isletme_id,
      v_id,
      v_hedef_islem_id
    );
  END IF;

  IF v_cari_id IS NOT NULL
     AND v_type IN ('cari_satis', 'cari_alis') THEN
    PERFORM public.tahsis_avans_supur(p_isletme_id, v_cari_id);
  END IF;

  -- Bakiye, entity adi, izin JSON'u veya tenant metadata'si donmez.
  RETURN QUERY
  SELECT
    result_row.id,
    result_row.type::text,
    result_row.amount,
    result_row.description,
    result_row.date::timestamp without time zone,
    result_row.hesap_id,
    result_row.hedef_hesap_id,
    result_row.kategori_id,
    result_row.cari_id,
    result_row.personel_id,
    result_row.source_currency,
    result_row.target_currency,
    result_row.exchange_rate,
    result_row.date_end,
    result_row.vade_tarihi,
    result_row.hedef_islem_id,
    result_row.created_at,
    result_row.created_by
  FROM public.islemler AS result_row
  WHERE result_row.id = v_id
    AND result_row.isletme_id = p_isletme_id;
END;
$function$;

ALTER FUNCTION public.create_islem_atomik_v2(uuid, jsonb)
  OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.create_islem_atomik_v2(uuid, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.create_islem_atomik_v2(uuid, jsonb)
TO authenticated;

COMMENT ON FUNCTION public.create_islem_atomik_v2(uuid, jsonb) IS
  'P0-S2A: server-derived balances, exact permission gates and UUID idempotency; first slice excludes linked-viewer cari, Storage, scheduled and product subwrites.';

-- Cariler-only eski istemci imzasi korunur; finansal yazim artik ayni
-- server-derived V2 motorundan gecer. Boylece direct INSERT + ayri bakiye RPC
-- zinciri ortak kullanicida yarim commit uretemez.
CREATE OR REPLACE FUNCTION public.create_cari_nakit_islem_atomik(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_type text,
  p_amount numeric,
  p_date timestamp without time zone,
  p_hesap_id uuid,
  p_cari_id uuid,
  p_description text,
  p_kategori_id uuid,
  p_exchange_rate numeric,
  p_hedef_islem_id uuid
)
RETURNS TABLE (
  id uuid,
  type text,
  amount numeric,
  description text,
  "date" timestamp without time zone,
  hesap_id uuid,
  kategori_id uuid,
  cari_id uuid,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  hedef_islem_id uuid,
  created_at timestamp with time zone,
  created_by uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_islem_id IS NULL
     OR p_type IS NULL
     OR p_type NOT IN ('cari_odeme', 'cari_tahsilat')
     OR p_amount IS NULL
     OR p_date IS NULL
     OR p_hesap_id IS NULL
     OR p_cari_id IS NULL THEN
    RAISE EXCEPTION 'CARI_CASH_OPERATION_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    result_row.id,
    result_row.type,
    result_row.amount,
    result_row.description,
    result_row.date,
    result_row.hesap_id,
    result_row.kategori_id,
    result_row.cari_id,
    result_row.source_currency,
    result_row.target_currency,
    result_row.exchange_rate,
    result_row.hedef_islem_id,
    result_row.created_at,
    result_row.created_by
  FROM public.create_islem_atomik_v2(
    p_isletme_id,
    pg_catalog.jsonb_strip_nulls(
      pg_catalog.jsonb_build_object(
        'id', p_islem_id,
        'type', p_type,
        'amount', p_amount,
        'date', pg_catalog.to_char(
          p_date, 'YYYY-MM-DD"T"HH24:MI:SS.US'
        ),
        'hesap_id', p_hesap_id,
        'cari_id', p_cari_id,
        'description', p_description,
        'kategori_id', p_kategori_id,
        'exchange_rate', p_exchange_rate,
        'hedef_islem_id', p_hedef_islem_id
      )
    )
  ) AS result_row;
END;
$function$;

ALTER FUNCTION public.create_cari_nakit_islem_atomik(
  uuid, uuid, text, numeric, timestamp without time zone,
  uuid, uuid, text, uuid, numeric, uuid
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.create_cari_nakit_islem_atomik(
  uuid, uuid, text, numeric, timestamp without time zone,
  uuid, uuid, text, uuid, numeric, uuid
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.create_cari_nakit_islem_atomik(
  uuid, uuid, text, numeric, timestamp without time zone,
  uuid, uuid, text, uuid, numeric, uuid
)
TO authenticated;

COMMENT ON FUNCTION public.create_cari_nakit_islem_atomik(
  uuid, uuid, text, numeric, timestamp without time zone,
  uuid, uuid, text, uuid, numeric, uuid
) IS
  'Legacy Cariler-only signature routed through canonical V2 transaction and balance engine.';

CREATE FUNCTION internal.apply_islem_update_canonical_v2(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_balance_ops jsonb,
  p_new_row jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old public.islemler;
  v_new public.islemler;
  v_planli boolean;
  v_result jsonb;
BEGIN
  SELECT transaction_row.*
  INTO v_old
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = p_islem_id
    AND transaction_row.isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  BEGIN
    v_new := pg_catalog.jsonb_populate_record(v_old, p_new_row);
  EXCEPTION
    WHEN invalid_text_representation
      OR invalid_datetime_format
      OR datetime_field_overflow
      OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
        USING ERRCODE = '22023';
  END;

  SELECT EXISTS (
    SELECT 1
    FROM public.taksit_planlari AS plan
    WHERE plan.islem_id = p_islem_id
      AND plan.isletme_id = p_isletme_id
  )
  INTO v_planli;

  IF v_planli
     AND (
       v_new.amount IS DISTINCT FROM v_old.amount
       OR v_new.type IS DISTINCT FROM v_old.type
       OR v_new.cari_id IS DISTINCT FROM v_old.cari_id
     ) THEN
    RAISE EXCEPTION
      'Taksitli islemin tutari/tipi/carisi degistirilemez; plani silip yeniden olusturun'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM internal.apply_balance_ops_v2(p_isletme_id, p_balance_ops);

  INSERT INTO internal.permission_v2_movement_action_context (
    backend_pid,
    transaction_id,
    actor_user_id,
    isletme_id,
    islem_id,
    action
  )
  VALUES (
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current(),
    auth.uid(),
    p_isletme_id,
    p_islem_id,
    'update'
  )
  ON CONFLICT (
    backend_pid, transaction_id, actor_user_id, isletme_id, islem_id
  )
  DO UPDATE SET action = EXCLUDED.action;

  UPDATE public.islemler AS transaction_row
  SET type = v_new.type,
      amount = v_new.amount,
      description = v_new.description,
      date = v_new.date,
      hesap_id = v_new.hesap_id,
      hedef_hesap_id = v_new.hedef_hesap_id,
      kategori_id = v_new.kategori_id,
      cari_id = v_new.cari_id,
      personel_id = v_new.personel_id,
      source_currency = v_new.source_currency,
      target_currency = v_new.target_currency,
      exchange_rate = v_new.exchange_rate,
      date_end = v_new.date_end,
      vade_tarihi = CASE
        WHEN v_planli THEN transaction_row.vade_tarihi
        ELSE v_new.vade_tarihi
      END,
      updated_at = pg_catalog.clock_timestamp()
  WHERE transaction_row.id = p_islem_id
    AND transaction_row.isletme_id = p_isletme_id
  RETURNING transaction_row.* INTO v_new;

  DELETE FROM internal.permission_v2_movement_action_context AS action_context
  WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
    AND action_context.transaction_id = pg_catalog.txid_current()
    AND action_context.actor_user_id = auth.uid()
    AND action_context.isletme_id = p_isletme_id
    AND action_context.islem_id = p_islem_id
    AND action_context.action = 'update';

  IF public.tahsis_borc_tipleri(v_old.type) IS NOT NULL
     AND (
       v_new.type IS DISTINCT FROM v_old.type
       OR v_new.cari_id IS DISTINCT FROM v_old.cari_id
     ) THEN
    DELETE FROM public.islem_tahsis AS allocation
    WHERE allocation.odeme_islem_id = p_islem_id
      AND allocation.isletme_id = p_isletme_id;
  END IF;

  IF v_new.cari_id IS NOT NULL
     AND public.tahsis_borc_tipleri(v_new.type) IS NOT NULL THEN
    PERFORM public.tahsis_odeme_esitle(
      p_isletme_id, p_islem_id, v_new.hedef_islem_id
    );
  END IF;

  IF NOT v_planli
     AND EXISTS (
       SELECT 1
       FROM public.islem_tahsis AS allocation
       WHERE allocation.borc_islem_id = p_islem_id
         AND allocation.isletme_id = p_isletme_id
     ) THEN
    IF v_new.type IS DISTINCT FROM v_old.type
       OR v_new.cari_id IS DISTINCT FROM v_old.cari_id
       OR v_new.vade_tarihi IS DISTINCT FROM v_old.vade_tarihi
       OR (
         v_new.vade_tarihi IS NULL
         AND v_new.date IS DISTINCT FROM v_old.date
       ) THEN
      PERFORM public.tahsis_borc_bosalt_ve_dagit(
        p_isletme_id, p_islem_id, NULL
      );
    ELSE
      PERFORM public.tahsis_borc_kirp_ve_dagit(
        p_isletme_id, p_islem_id
      );
    END IF;
  END IF;

  IF v_new.cari_id IS NOT NULL
     AND v_new.type IN ('cari_satis', 'cari_alis')
     AND (
       v_old.type NOT IN ('cari_satis', 'cari_alis')
       OR v_new.cari_id IS DISTINCT FROM v_old.cari_id
       OR v_new.amount > v_old.amount
       OR v_new.vade_tarihi IS DISTINCT FROM v_old.vade_tarihi
     ) THEN
    PERFORM public.tahsis_avans_supur(p_isletme_id, v_new.cari_id);
  END IF;

  SELECT pg_catalog.to_jsonb(transaction_row)
  INTO v_result
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = p_islem_id
    AND transaction_row.isletme_id = p_isletme_id;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION internal.apply_islem_update_canonical_v2(
  uuid, uuid, jsonb, jsonb
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.apply_islem_update_canonical_v2(
  uuid, uuid, jsonb, jsonb
)
FROM PUBLIC, anon, authenticated, service_role;


CREATE FUNCTION internal.delete_islem_canonical_v2(
  p_isletme_id uuid,
  p_islem_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old public.islemler;
  v_old_canonical jsonb;
  v_reverse_ops jsonb;
  v_movement record;
BEGIN
  SELECT transaction_row.*
  INTO v_old
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = p_islem_id
    AND transaction_row.isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  v_old_canonical := pg_catalog.jsonb_build_object(
    'type', v_old.type::text,
    'amount', v_old.amount,
    'exchange_rate', v_old.exchange_rate,
    'source_currency', v_old.source_currency,
    'target_currency', v_old.target_currency,
    'hesap_id', v_old.hesap_id,
    'hedef_hesap_id', v_old.hedef_hesap_id,
    'cari_id', v_old.cari_id,
    'personel_id', v_old.personel_id
  );

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        't', aggregated.t,
        'id', aggregated.entity_id,
        'd', aggregated.d
      )
      ORDER BY aggregated.t, aggregated.entity_id
    ),
    '[]'::jsonb
  )
  INTO v_reverse_ops
  FROM (
    SELECT
      operation.t,
      operation.entity_id,
      pg_catalog.sum(-operation.d) AS d
    FROM internal.bakiye_ops(v_old_canonical) AS operation
    WHERE operation.entity_id IS NOT NULL
    GROUP BY operation.t, operation.entity_id
    HAVING pg_catalog.sum(-operation.d) <> 0
  ) AS aggregated;

  DELETE FROM public.islem_tahsis AS allocation
  WHERE allocation.odeme_islem_id = p_islem_id
    AND allocation.isletme_id = p_isletme_id;

  PERFORM public.tahsis_borc_bosalt_ve_dagit(
    p_isletme_id, p_islem_id, p_islem_id
  );

  PERFORM internal.apply_balance_ops_v2(
    p_isletme_id, v_reverse_ops
  );

  FOR v_movement IN
    SELECT movement.urun_id, movement.hareket_tipi, movement.miktar
    FROM public.urun_hareketler AS movement
    WHERE movement.islem_id = p_islem_id
      AND movement.isletme_id = p_isletme_id
    ORDER BY movement.urun_id, movement.id
  LOOP
    UPDATE public.urunler AS product
    SET miktar = COALESCE(product.miktar, 0) + CASE
          WHEN v_movement.hareket_tipi = 'giris'
            THEN -pg_catalog.abs(v_movement.miktar)
          WHEN v_movement.hareket_tipi = 'cikis'
            THEN pg_catalog.abs(v_movement.miktar)
          ELSE -v_movement.miktar
        END,
        updated_at = pg_catalog.clock_timestamp()
    WHERE product.id = v_movement.urun_id
      AND product.isletme_id = p_isletme_id;
  END LOOP;

  INSERT INTO internal.permission_v2_movement_action_context (
    backend_pid,
    transaction_id,
    actor_user_id,
    isletme_id,
    islem_id,
    action
  )
  VALUES (
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current(),
    auth.uid(),
    p_isletme_id,
    p_islem_id,
    'delete'
  )
  ON CONFLICT (
    backend_pid, transaction_id, actor_user_id, isletme_id, islem_id
  )
  DO UPDATE SET action = EXCLUDED.action;

  DELETE FROM public.urun_hareketler AS movement
  WHERE movement.islem_id = p_islem_id
    AND movement.isletme_id = p_isletme_id;

  DELETE FROM public.islemler AS transaction_row
  WHERE transaction_row.id = p_islem_id
    AND transaction_row.isletme_id = p_isletme_id;

  DELETE FROM internal.permission_v2_movement_action_context AS action_context
  WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
    AND action_context.transaction_id = pg_catalog.txid_current()
    AND action_context.actor_user_id = auth.uid()
    AND action_context.isletme_id = p_isletme_id
    AND action_context.islem_id = p_islem_id
    AND action_context.action = 'delete';

  RETURN p_islem_id;
END;
$function$;

ALTER FUNCTION internal.delete_islem_canonical_v2(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.delete_islem_canonical_v2(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 10) QTB UPDATE V2: unchanged full patch + safe type/entity transitions.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_islem_atomik_v2(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_patch jsonb
)
RETURNS TABLE (
  id uuid,
  type text,
  amount numeric,
  description text,
  date timestamp without time zone,
  hesap_id uuid,
  hedef_hesap_id uuid,
  kategori_id uuid,
  cari_id uuid,
  personel_id uuid,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  date_end text,
  vade_tarihi date,
  created_by uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old public.islemler;
  v_new public.islemler;
  v_updated public.islemler;
  v_amount numeric;
  v_rate numeric;
  v_source_assertion text;
  v_target_assertion text;
  v_source_currency text;
  v_target_currency text;
  v_hesap_currency text;
  v_hedef_hesap_currency text;
  v_cari_currency text;
  v_personel_currency text;
  v_account_ids uuid[];
  v_expected_accounts integer;
  v_found_accounts integer := 0;
  v_account record;
  v_requires_birikim boolean := false;
  v_expected_category_type text;
  v_date_end_value date;
  v_old_canonical jsonb;
  v_new_canonical jsonb;
  v_balance_ops jsonb;
BEGIN
  v_old := internal.get_islem_mutation_row_v1(
    p_isletme_id,
    p_islem_id,
    'update',
    true
  );

  IF p_patch IS NULL
     OR pg_catalog.jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
     OR p_patch = '{}'::jsonb
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_object_keys(p_patch) AS patch_key(key_name)
       WHERE patch_key.key_name NOT IN (
         'type',
         'amount',
         'description',
         'date',
         'hesap_id',
         'hedef_hesap_id',
         'kategori_id',
         'cari_id',
         'personel_id',
         'source_currency',
         'target_currency',
         'exchange_rate',
         'date_end',
         'vade_tarihi'
       )
     )
     OR (
       p_patch ? 'type'
       AND pg_catalog.jsonb_typeof(p_patch->'type') IS DISTINCT FROM 'string'
     )
     OR (
       p_patch ? 'amount'
       AND pg_catalog.jsonb_typeof(p_patch->'amount') IS DISTINCT FROM 'number'
     )
     OR (
       p_patch ? 'description'
       AND pg_catalog.jsonb_typeof(p_patch->'description') NOT IN ('string', 'null')
     )
     OR (
       p_patch ? 'date'
       AND pg_catalog.jsonb_typeof(p_patch->'date') IS DISTINCT FROM 'string'
     )
     OR (
       p_patch ? 'source_currency'
       AND pg_catalog.jsonb_typeof(p_patch->'source_currency') NOT IN ('string', 'null')
     )
     OR (
       p_patch ? 'target_currency'
       AND pg_catalog.jsonb_typeof(p_patch->'target_currency') NOT IN ('string', 'null')
     )
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           ('hesap_id'),
           ('hedef_hesap_id'),
           ('kategori_id'),
           ('cari_id'),
           ('personel_id')
       ) AS id_key(key_name)
       WHERE p_patch ? id_key.key_name
         AND pg_catalog.jsonb_typeof(p_patch->id_key.key_name)
             NOT IN ('string', 'null')
     )
     OR (
       p_patch ? 'exchange_rate'
       AND pg_catalog.jsonb_typeof(p_patch->'exchange_rate')
           NOT IN ('number', 'null')
     )
     OR (
       p_patch ? 'date_end'
       AND pg_catalog.jsonb_typeof(p_patch->'date_end') NOT IN ('string', 'null')
     )
     OR (
       p_patch ? 'vade_tarihi'
       AND pg_catalog.jsonb_typeof(p_patch->'vade_tarihi')
           NOT IN ('string', 'null')
     )
     OR (
       p_patch ? 'date'
       AND p_patch->>'date' !~
         '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?([+-][0-9]{2}:[0-9]{2}|Z)?$'
     )
     OR (
       p_patch->>'date_end' IS NOT NULL
       AND p_patch->>'date_end' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     )
     OR (
       p_patch->>'vade_tarihi' IS NOT NULL
       AND p_patch->>'vade_tarihi' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_new := pg_catalog.jsonb_populate_record(v_old, p_patch);
    v_amount := v_new.amount;
    v_rate := v_new.exchange_rate;
    v_date_end_value := CASE
      WHEN v_new.date_end IS NULL THEN NULL
      ELSE v_new.date_end::date
    END;
  EXCEPTION
    WHEN invalid_text_representation
      OR invalid_datetime_format
      OR datetime_field_overflow
      OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
        USING ERRCODE = '22023';
  END;

  v_new.description := NULLIF(pg_catalog.btrim(v_new.description), '');

  IF v_new.type::text NOT IN (
    'gelir',
    'gider',
    'transfer',
    'cari_alis',
    'cari_satis',
    'cari_alis_iade',
    'cari_satis_iade',
    'cari_odeme',
    'cari_tahsilat',
    'personel_gider',
    'personel_satis',
    'personel_izin_hakki',
    'personel_izin_kullanimi',
    'personel_odeme',
    'personel_tahsilat'
  )
     OR v_amount IS NULL
     OR v_amount = 'NaN'::numeric
     OR v_amount = 'Infinity'::numeric
     OR v_amount = '-Infinity'::numeric
     OR v_amount <= 0
     OR v_amount > 9999999999999.99
     OR v_amount IS DISTINCT FROM pg_catalog.round(v_amount, 2)
     OR (
       v_rate IS NOT NULL
       AND (
         v_rate = 'NaN'::numeric
         OR v_rate = 'Infinity'::numeric
         OR v_rate = '-Infinity'::numeric
         OR v_rate <= 0
         OR v_rate > 9999999999.99999999
         OR v_rate IS DISTINCT FROM pg_catalog.round(v_rate, 8)
       )
     ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  -- Yeni kaynak tipi de ayni own/all mutation seviyesini gecmelidir.
  IF NOT internal.islem_mutasyon_izni_v2(
    p_isletme_id,
    v_new.type::text,
    v_old.created_by,
    'update',
    p_islem_id
  ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF (CASE v_new.type::text
    WHEN 'gelir' THEN
      v_new.hesap_id IS NOT NULL AND v_new.hedef_hesap_id IS NULL
      AND v_new.cari_id IS NULL AND v_new.personel_id IS NULL
    WHEN 'gider' THEN
      v_new.hesap_id IS NOT NULL AND v_new.hedef_hesap_id IS NULL
      AND v_new.cari_id IS NULL AND v_new.personel_id IS NULL
    WHEN 'transfer' THEN
      v_new.hesap_id IS NOT NULL AND v_new.hedef_hesap_id IS NOT NULL
      AND v_new.hesap_id IS DISTINCT FROM v_new.hedef_hesap_id
      AND v_new.cari_id IS NULL AND v_new.personel_id IS NULL
    WHEN 'cari_alis' THEN
      v_new.cari_id IS NOT NULL AND v_new.hesap_id IS NULL
      AND v_new.hedef_hesap_id IS NULL AND v_new.personel_id IS NULL
    WHEN 'cari_satis' THEN
      v_new.cari_id IS NOT NULL AND v_new.hesap_id IS NULL
      AND v_new.hedef_hesap_id IS NULL AND v_new.personel_id IS NULL
    WHEN 'cari_alis_iade' THEN
      v_new.cari_id IS NOT NULL AND v_new.hesap_id IS NULL
      AND v_new.hedef_hesap_id IS NULL AND v_new.personel_id IS NULL
    WHEN 'cari_satis_iade' THEN
      v_new.cari_id IS NOT NULL AND v_new.hesap_id IS NULL
      AND v_new.hedef_hesap_id IS NULL AND v_new.personel_id IS NULL
    WHEN 'cari_odeme' THEN
      v_new.cari_id IS NOT NULL AND v_new.hesap_id IS NOT NULL
      AND v_new.hedef_hesap_id IS NULL AND v_new.personel_id IS NULL
    WHEN 'cari_tahsilat' THEN
      v_new.cari_id IS NOT NULL AND v_new.hesap_id IS NOT NULL
      AND v_new.hedef_hesap_id IS NULL AND v_new.personel_id IS NULL
    WHEN 'personel_gider' THEN
      v_new.personel_id IS NOT NULL AND v_new.hesap_id IS NULL
      AND v_new.hedef_hesap_id IS NULL AND v_new.cari_id IS NULL
    WHEN 'personel_satis' THEN
      v_new.personel_id IS NOT NULL AND v_new.hesap_id IS NULL
      AND v_new.hedef_hesap_id IS NULL AND v_new.cari_id IS NULL
    WHEN 'personel_izin_hakki' THEN
      v_new.personel_id IS NOT NULL AND v_new.hesap_id IS NULL
      AND v_new.hedef_hesap_id IS NULL AND v_new.cari_id IS NULL
    WHEN 'personel_izin_kullanimi' THEN
      v_new.personel_id IS NOT NULL AND v_new.hesap_id IS NULL
      AND v_new.hedef_hesap_id IS NULL AND v_new.cari_id IS NULL
    WHEN 'personel_odeme' THEN
      v_new.personel_id IS NOT NULL AND v_new.hesap_id IS NOT NULL
      AND v_new.hedef_hesap_id IS NULL AND v_new.cari_id IS NULL
    WHEN 'personel_tahsilat' THEN
      v_new.personel_id IS NOT NULL AND v_new.hesap_id IS NOT NULL
      AND v_new.hedef_hesap_id IS NULL AND v_new.cari_id IS NULL
    ELSE false
  END) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  IF (
       v_new.date_end IS NOT NULL
       AND v_new.type::text <> 'personel_izin_kullanimi'
     )
     OR (
       v_date_end_value IS NOT NULL
       AND v_date_end_value < v_new.date::date
     )
     OR (
       v_new.vade_tarihi IS NOT NULL
       AND v_new.type::text NOT IN ('cari_alis', 'cari_satis')
     ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  -- Yeni entity'ler ayni tenant, aktif ve arsivsiz olmali. Deterministik kilit:
  -- cari -> personel -> hesap UUID -> kategori.
  IF v_new.cari_id IS NOT NULL THEN
    SELECT COALESCE(
      NULLIF(pg_catalog.upper(pg_catalog.btrim(customer.currency::text)), ''),
      'TRY'
    )
    INTO v_cari_currency
    FROM public.cariler AS customer
    WHERE customer.id = v_new.cari_id
      AND customer.isletme_id = p_isletme_id
      AND customer.is_active IS TRUE
      AND customer.is_archived IS FALSE
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_new.personel_id IS NOT NULL THEN
    SELECT COALESCE(
      NULLIF(pg_catalog.upper(pg_catalog.btrim(employee.currency::text)), ''),
      'TRY'
    )
    INTO v_personel_currency
    FROM public.personel AS employee
    WHERE employee.id = v_new.personel_id
      AND employee.isletme_id = p_isletme_id
      AND employee.is_active IS TRUE
      AND employee.is_archived IS FALSE
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_account_ids := pg_catalog.array_remove(
    ARRAY[v_new.hesap_id, v_new.hedef_hesap_id],
    NULL
  );
  v_expected_accounts := pg_catalog.cardinality(v_account_ids);

  FOR v_account IN
    SELECT
      account.id,
      account.type::text AS account_type,
      COALESCE(
        NULLIF(pg_catalog.upper(pg_catalog.btrim(account.currency::text)), ''),
        'TRY'
      ) AS account_currency
    FROM public.hesaplar AS account
    WHERE account.id = ANY(v_account_ids)
      AND account.isletme_id = p_isletme_id
      AND account.is_active IS TRUE
      AND account.is_archived IS FALSE
    ORDER BY account.id
    FOR NO KEY UPDATE
  LOOP
    v_found_accounts := v_found_accounts + 1;
    v_requires_birikim :=
      v_requires_birikim OR v_account.account_type = 'birikim';

    IF v_account.id = v_new.hesap_id THEN
      v_hesap_currency := v_account.account_currency;
    END IF;
    IF v_account.id = v_new.hedef_hesap_id THEN
      v_hedef_hesap_currency := v_account.account_currency;
    END IF;
  END LOOP;

  IF v_found_accounts <> v_expected_accounts THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF v_requires_birikim
     AND NOT EXISTS (
       SELECT 1
       FROM internal.etkin_yetki_v2(p_isletme_id, 'birikim') AS permission
       WHERE permission.can_view IS TRUE
     ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  v_expected_category_type := CASE
    WHEN v_new.type::text IN (
      'gelir',
      'cari_tahsilat',
      'cari_satis',
      'cari_satis_iade',
      'personel_tahsilat',
      'personel_satis'
    ) THEN 'gelir'
    WHEN v_new.type::text IN (
      'gider',
      'transfer',
      'cari_odeme',
      'cari_alis',
      'cari_alis_iade',
      'personel_odeme',
      'personel_gider'
    ) THEN 'gider'
    ELSE NULL
  END;

  IF v_new.kategori_id IS NOT NULL THEN
    IF v_expected_category_type IS NULL THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
        USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.kategoriler AS category
    WHERE category.id = v_new.kategori_id
      AND category.isletme_id = p_isletme_id
      AND category.is_active IS TRUE
      AND category.type::text = v_expected_category_type
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_new.type::text IN (
    'transfer',
    'cari_odeme',
    'cari_tahsilat',
    'personel_odeme',
    'personel_tahsilat'
  ) THEN
    v_source_currency := v_hesap_currency;
    v_target_currency := CASE
      WHEN v_new.type::text = 'transfer' THEN v_hedef_hesap_currency
      WHEN v_new.type::text LIKE 'cari_%' THEN v_cari_currency
      ELSE v_personel_currency
    END;
  ELSIF v_new.type::text LIKE 'cari_%' THEN
    v_source_currency := v_cari_currency;
    v_target_currency := v_cari_currency;
  ELSIF v_new.type::text LIKE 'personel_%' THEN
    v_source_currency := v_personel_currency;
    v_target_currency := v_personel_currency;
  ELSE
    v_source_currency := v_hesap_currency;
    v_target_currency := v_hesap_currency;
  END IF;

  v_source_assertion := CASE
    WHEN p_patch ? 'source_currency' THEN
      NULLIF(
        pg_catalog.upper(pg_catalog.btrim(p_patch->>'source_currency')),
        ''
      )
    ELSE v_source_currency
  END;
  v_target_assertion := CASE
    WHEN p_patch ? 'target_currency' THEN
      NULLIF(
        pg_catalog.upper(pg_catalog.btrim(p_patch->>'target_currency')),
        ''
      )
    ELSE v_target_currency
  END;

  IF v_source_currency IS NULL
     OR v_target_currency IS NULL
     OR v_source_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
     OR v_target_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
     OR v_source_assertion IS DISTINCT FROM v_source_currency
     OR v_target_assertion IS DISTINCT FROM v_target_currency
     OR (
       v_source_currency = v_target_currency
       AND v_new.exchange_rate IS NOT NULL
     )
     OR (
       v_source_currency <> v_target_currency
       AND v_new.exchange_rate IS NULL
     ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  v_new.source_currency := v_source_currency;
  v_new.target_currency := v_target_currency;

  v_old_canonical := pg_catalog.jsonb_build_object(
    'type', v_old.type::text,
    'amount', v_old.amount,
    'exchange_rate', v_old.exchange_rate,
    'source_currency', v_old.source_currency,
    'target_currency', v_old.target_currency,
    'hesap_id', v_old.hesap_id,
    'hedef_hesap_id', v_old.hedef_hesap_id,
    'cari_id', v_old.cari_id,
    'personel_id', v_old.personel_id
  );
  v_new_canonical := pg_catalog.jsonb_build_object(
    'type', v_new.type::text,
    'amount', v_new.amount,
    'exchange_rate', v_new.exchange_rate,
    'source_currency', v_new.source_currency,
    'target_currency', v_new.target_currency,
    'hesap_id', v_new.hesap_id,
    'hedef_hesap_id', v_new.hedef_hesap_id,
    'cari_id', v_new.cari_id,
    'personel_id', v_new.personel_id
  );

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        't', aggregated.t,
        'id', aggregated.entity_id,
        'd', aggregated.d
      )
      ORDER BY aggregated.t, aggregated.entity_id
    ),
    '[]'::jsonb
  )
  INTO v_balance_ops
  FROM (
    SELECT
      operation.t,
      operation.entity_id,
      pg_catalog.sum(operation.d) AS d
    FROM (
      SELECT
        old_operation.t,
        old_operation.entity_id,
        -old_operation.d AS d
      FROM internal.bakiye_ops(v_old_canonical) AS old_operation
      UNION ALL
      SELECT
        new_operation.t,
        new_operation.entity_id,
        new_operation.d
      FROM internal.bakiye_ops(v_new_canonical) AS new_operation
    ) AS operation
    WHERE operation.entity_id IS NOT NULL
    GROUP BY operation.t, operation.entity_id
    HAVING pg_catalog.sum(operation.d) <> 0
  ) AS aggregated;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_balance_ops) AS op(value)
    WHERE (op.value->>'t') NOT IN ('hesaplar', 'cariler', 'personel')
       OR op.value->>'d' IS NULL
       OR (op.value->>'d')::numeric = 'NaN'::numeric
       OR (op.value->>'d')::numeric = 'Infinity'::numeric
       OR (op.value->>'d')::numeric = '-Infinity'::numeric
       OR pg_catalog.abs((op.value->>'d')::numeric) > 9999999999999.99
  ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_BALANCE_OUT_OF_RANGE'
      USING ERRCODE = '22003';
  END IF;

  -- Private motor yalniz server-derived row/ops ile icten kullanilir.
  PERFORM internal.apply_islem_update_canonical_v2(
    p_isletme_id,
    p_islem_id,
    v_balance_ops,
    pg_catalog.to_jsonb(v_new)
  );

  SELECT transaction_row.*
  INTO v_updated
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = p_islem_id
    AND transaction_row.isletme_id = p_isletme_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    v_updated.id,
    v_updated.type::text,
    v_updated.amount,
    v_updated.description,
    v_updated.date::timestamp without time zone,
    v_updated.hesap_id,
    v_updated.hedef_hesap_id,
    v_updated.kategori_id,
    v_updated.cari_id,
    v_updated.personel_id,
    v_updated.source_currency::text,
    v_updated.target_currency::text,
    v_updated.exchange_rate,
    v_updated.date_end,
    v_updated.vade_tarihi,
    v_updated.created_by;
END;
$function$;

ALTER FUNCTION public.update_islem_atomik_v2(uuid, uuid, jsonb)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.update_islem_atomik_v2(uuid, uuid, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.update_islem_atomik_v2(uuid, uuid, jsonb)
TO authenticated;

-- Productful satirda context okumasi V3'e ulasabilmelidir. Mutation motoru
-- hareketli satiri V2'de yine reddeder; bu endpoint yalniz bakiyesiz context
-- dondurur ve kaynak+Urunler own/all kapisini uygular.
CREATE OR REPLACE FUNCTION public.get_islem_mutation_context_v1(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_action text DEFAULT 'update'
)
RETURNS TABLE (
  id uuid,
  type text,
  amount numeric,
  description text,
  date timestamp without time zone,
  hesap_id uuid,
  hedef_hesap_id uuid,
  kategori_id uuid,
  cari_id uuid,
  personel_id uuid,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  date_end text,
  vade_tarihi date,
  created_by uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row public.islemler;
BEGIN
  IF auth.uid() IS NULL
     OR p_isletme_id IS NULL
     OR p_islem_id IS NULL
     OR p_action NOT IN ('update', 'delete') THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_CONTEXT_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  BEGIN
    v_row := internal.get_islem_mutation_row_v1(
      p_isletme_id,
      p_islem_id,
      p_action,
      false
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_CONTEXT_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
  END;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_CONTEXT_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    v_row.id,
    v_row.type::text,
    v_row.amount,
    v_row.description,
    v_row.date::timestamp without time zone,
    v_row.hesap_id,
    v_row.hedef_hesap_id,
    v_row.kategori_id,
    v_row.cari_id,
    v_row.personel_id,
    v_row.source_currency::text,
    v_row.target_currency::text,
    v_row.exchange_rate,
    v_row.date_end,
    v_row.vade_tarihi,
    v_row.created_by;
END;
$function$;

ALTER FUNCTION public.get_islem_mutation_context_v1(uuid, uuid, text)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_islem_mutation_context_v1(uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_islem_mutation_context_v1(uuid, uuid, text)
TO authenticated;


-- ---------------------------------------------------------------------------
-- 11) CARI + URUN ATOMIK EDIT/DELETE V3
-- ---------------------------------------------------------------------------
CREATE FUNCTION internal.reapply_cari_urun_items_v3(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_items jsonb,
  p_type text,
  p_authorization_action text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_item jsonb;
  v_urun_id uuid;
  v_miktar numeric;
  v_birim_fiyat numeric;
  v_kdv integer;
  v_aciklama text;
  v_expected_movement text;
  v_old record;
  v_before numeric;
  v_after numeric;
  v_new_ids uuid[];
  v_all_ids uuid[];
  v_expected_products integer;
  v_found_products integer;
  v_transaction_created_by uuid;
  v_transaction_type text;
  v_product_action text;
BEGIN
  IF auth.uid() IS NULL
     OR p_items IS NULL
     OR pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_items) > 200
     OR p_authorization_action NOT IN ('create', 'update', 'delete')
     OR p_type NOT IN (
       'gelir',
       'gider',
       'cari_alis',
       'cari_satis',
       'cari_alis_iade',
       'cari_satis_iade'
     ) THEN
    RAISE EXCEPTION 'CARI_PRODUCT_V3_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    transaction_row.created_by,
    transaction_row.type::text
  INTO
    v_transaction_created_by,
    v_transaction_type
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = p_islem_id
    AND transaction_row.isletme_id = p_isletme_id
  FOR SHARE;

  IF NOT FOUND
     OR v_transaction_type IS DISTINCT FROM p_type THEN
    RAISE EXCEPTION 'CARI_PRODUCT_V3_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  -- Existing-movement checks in islem_mutasyon_izni_v2 are insufficient when
  -- an itemless row receives its first product. Every non-empty V3 payload
  -- therefore proves Product create/update scope against the transaction
  -- creator before any stock row is touched.
  IF pg_catalog.jsonb_array_length(p_items) > 0 THEN
    v_product_action := CASE p_authorization_action
      WHEN 'create' THEN 'create'
      ELSE 'update'
    END;

    IF NOT internal.kayit_mutasyon_izni_v1(
      p_isletme_id,
      'urunler',
      v_transaction_created_by,
      v_product_action
    ) THEN
      RAISE EXCEPTION 'CARI_PRODUCT_V3_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_expected_movement := CASE
    WHEN p_type IN ('gider', 'cari_alis', 'cari_satis_iade') THEN 'giris'
    ELSE 'cikis'
  END;

  BEGIN
    SELECT
      COALESCE(
        pg_catalog.array_agg(
          (item.value->>'urun_id')::uuid
          ORDER BY (item.value->>'urun_id')::uuid
        ),
        ARRAY[]::uuid[]
      )
    INTO v_new_ids
    FROM pg_catalog.jsonb_array_elements(p_items) AS item(value);
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'CARI_PRODUCT_V3_INVALID_INPUT'
        USING ERRCODE = '22023';
  END;

  IF pg_catalog.cardinality(v_new_ids) <> (
    SELECT pg_catalog.count(DISTINCT product_id)
    FROM pg_catalog.unnest(v_new_ids) AS product_ids(product_id)
  ) THEN
    RAISE EXCEPTION 'CARI_PRODUCT_V3_DUPLICATE_PRODUCT'
      USING ERRCODE = '22023';
  END IF;

  -- Tum payload alanlari ve sayisal degerler herhangi bir stok yazimindan once
  -- dogrulanir.
  FOR v_item IN
    SELECT item.value
    FROM pg_catalog.jsonb_array_elements(p_items) AS item(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.jsonb_object_keys(v_item) AS item_key(key_name)
         WHERE item_key.key_name NOT IN (
           'urun_id',
           'hareket_tipi',
           'miktar',
           'birim_fiyat',
           'kdv_orani',
           'aciklama'
         )
       )
       OR pg_catalog.jsonb_typeof(v_item->'urun_id') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_item->'hareket_tipi')
          IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_item->'miktar') IS DISTINCT FROM 'number'
       OR pg_catalog.jsonb_typeof(v_item->'birim_fiyat')
          IS DISTINCT FROM 'number'
       OR pg_catalog.jsonb_typeof(v_item->'kdv_orani')
          IS DISTINCT FROM 'number'
       OR (
         v_item ? 'aciklama'
         AND pg_catalog.jsonb_typeof(v_item->'aciklama')
             NOT IN ('string', 'null')
       )
       OR v_item->>'hareket_tipi' IS DISTINCT FROM v_expected_movement THEN
      RAISE EXCEPTION 'CARI_PRODUCT_V3_INVALID_INPUT'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_miktar := (v_item->>'miktar')::numeric;
      v_birim_fiyat := (v_item->>'birim_fiyat')::numeric;
      v_kdv := (v_item->>'kdv_orani')::integer;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'CARI_PRODUCT_V3_INVALID_INPUT'
          USING ERRCODE = '22023';
    END;

    IF v_miktar IS NULL
       OR v_miktar = 'NaN'::numeric
       OR v_miktar = 'Infinity'::numeric
       OR v_miktar = '-Infinity'::numeric
       OR v_miktar <= 0
       OR v_miktar > 999999999999.999
       OR v_miktar IS DISTINCT FROM pg_catalog.round(v_miktar, 3)
       OR v_birim_fiyat IS NULL
       OR v_birim_fiyat = 'NaN'::numeric
       OR v_birim_fiyat = 'Infinity'::numeric
       OR v_birim_fiyat = '-Infinity'::numeric
       OR v_birim_fiyat < 0
       OR v_birim_fiyat > 9999999999999.99
       OR v_birim_fiyat IS DISTINCT FROM pg_catalog.round(v_birim_fiyat, 2)
       OR v_kdv < 0
       OR v_kdv > 100 THEN
      RAISE EXCEPTION 'CARI_PRODUCT_V3_INVALID_INPUT'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT source.product_id ORDER BY source.product_id),
    ARRAY[]::uuid[]
  )
  INTO v_all_ids
  FROM (
    SELECT movement.urun_id AS product_id
    FROM public.urun_hareketler AS movement
    WHERE movement.isletme_id = p_isletme_id
      AND movement.islem_id = p_islem_id
    UNION ALL
    SELECT product_id
    FROM pg_catalog.unnest(v_new_ids) AS product_ids(product_id)
  ) AS source;

  v_expected_products := pg_catalog.cardinality(v_all_ids);
  SELECT pg_catalog.count(*)
  INTO v_found_products
  FROM (
    SELECT product.id
    FROM public.urunler AS product
    WHERE product.id = ANY(v_all_ids)
      AND product.isletme_id = p_isletme_id
    ORDER BY product.id
    FOR UPDATE
  ) AS locked_products;

  IF v_found_products <> v_expected_products THEN
    RAISE EXCEPTION 'CARI_PRODUCT_V3_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  -- Eski hareketin etkisi tersine cevrilir. Eski urun pasif/arsivli olsa bile
  -- silinen etkinin geri alinmasi gerekir; yeni payload ise asagida aktif ister.
  FOR v_old IN
    SELECT
      movement.id,
      movement.urun_id,
      movement.hareket_tipi,
      movement.miktar
    FROM public.urun_hareketler AS movement
    WHERE movement.isletme_id = p_isletme_id
      AND movement.islem_id = p_islem_id
    ORDER BY movement.urun_id, movement.id
  LOOP
    UPDATE public.urunler AS product
    SET miktar = product.miktar + CASE v_old.hareket_tipi
      WHEN 'giris' THEN -pg_catalog.abs(v_old.miktar)
      WHEN 'cikis' THEN pg_catalog.abs(v_old.miktar)
      ELSE -v_old.miktar
    END,
    updated_at = pg_catalog.clock_timestamp()
    WHERE product.id = v_old.urun_id
      AND product.isletme_id = p_isletme_id;
  END LOOP;

  -- Trigger DELETE'i normalde delete olarak yorumlar. Bu dar context satirini
  -- yalniz dogrudan EXECUTE'si kapali SECURITY DEFINER V3 motoru yazabilir.
  -- Basarili yolda hemen silinir; hata halinde statement/transaction rollback'i
  -- satiri da geri alir.
  INSERT INTO internal.permission_v2_movement_action_context (
    backend_pid,
    transaction_id,
    actor_user_id,
    isletme_id,
    islem_id,
    action
  )
  VALUES (
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current(),
    auth.uid(),
    p_isletme_id,
    p_islem_id,
    p_authorization_action
  );

  DELETE FROM public.urun_hareketler AS movement
  WHERE movement.isletme_id = p_isletme_id
    AND movement.islem_id = p_islem_id;

  FOR v_item IN
    SELECT item.value
    FROM pg_catalog.jsonb_array_elements(p_items) AS item(value)
  LOOP
    v_urun_id := (v_item->>'urun_id')::uuid;
    v_miktar := (v_item->>'miktar')::numeric;
    v_birim_fiyat := (v_item->>'birim_fiyat')::numeric;
    v_kdv := (v_item->>'kdv_orani')::integer;
    v_aciklama := NULLIF(pg_catalog.btrim(v_item->>'aciklama'), '');

    SELECT product.miktar
    INTO v_before
    FROM public.urunler AS product
    WHERE product.id = v_urun_id
      AND product.isletme_id = p_isletme_id
      AND product.is_active IS TRUE
      AND product.is_archived IS FALSE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CARI_PRODUCT_V3_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;

    v_after := COALESCE(v_before, 0) + CASE v_expected_movement
      WHEN 'giris' THEN pg_catalog.abs(v_miktar)
      ELSE -pg_catalog.abs(v_miktar)
    END;

    UPDATE public.urunler AS product
    SET miktar = v_after,
        updated_at = pg_catalog.clock_timestamp()
    WHERE product.id = v_urun_id
      AND product.isletme_id = p_isletme_id;

    INSERT INTO public.urun_hareketler (
      isletme_id,
      urun_id,
      islem_id,
      hareket_tipi,
      miktar,
      birim_fiyat,
      kdv_orani,
      onceki_miktar,
      yeni_miktar,
      aciklama
    )
    VALUES (
      p_isletme_id,
      v_urun_id,
      p_islem_id,
      v_expected_movement,
      v_miktar,
      v_birim_fiyat,
      v_kdv,
      v_before,
      v_after,
      v_aciklama
    );
  END LOOP;

  -- INSERT trigger'lari da ayni exact private outer-action baglamini ister.
  -- Bu nedenle context, eski hareket DELETE'i ile tum yeni hareket INSERT'leri
  -- bitene kadar yasatilir ve basarili yolun sonunda temizlenir.
  DELETE FROM internal.permission_v2_movement_action_context AS action_context
  WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
    AND action_context.transaction_id = pg_catalog.txid_current()
    AND action_context.actor_user_id = auth.uid()
    AND action_context.isletme_id = p_isletme_id
    AND action_context.islem_id = p_islem_id
    AND action_context.action = p_authorization_action;
END;
$function$;

ALTER FUNCTION internal.reapply_cari_urun_items_v3(
  uuid, uuid, jsonb, text, text
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.reapply_cari_urun_items_v3(
  uuid, uuid, jsonb, text, text
)
FROM PUBLIC, anon, authenticated, service_role;


CREATE FUNCTION public.update_cari_urunlu_islem_atomik_v3(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_patch jsonb,
  p_items jsonb
)
RETURNS TABLE (
  id uuid,
  type text,
  amount numeric,
  description text,
  date timestamp without time zone,
  hesap_id uuid,
  hedef_hesap_id uuid,
  kategori_id uuid,
  cari_id uuid,
  personel_id uuid,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  date_end text,
  vade_tarihi date,
  created_by uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old public.islemler;
  v_new_type text;
  v_result record;
BEGIN
  IF auth.uid() IS NULL
     OR p_isletme_id IS NULL
     OR p_islem_id IS NULL
     OR p_patch IS NULL
     OR pg_catalog.jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
     OR p_items IS NULL
     OR pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'CARI_PRODUCT_V3_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT transaction_row.*
  INTO v_old
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = p_islem_id
    AND transaction_row.isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_old.type::text NOT IN (
       'gelir',
       'gider',
       'cari_alis',
       'cari_satis',
       'cari_alis_iade',
       'cari_satis_iade'
     )
     OR NOT internal.islem_mutasyon_izni_v2(
       p_isletme_id,
       v_old.type::text,
       v_old.created_by,
       'update',
       p_islem_id
     ) THEN
    RAISE EXCEPTION 'CARI_PRODUCT_V3_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  v_new_type := COALESCE(NULLIF(p_patch->>'type', ''), v_old.type::text);
  IF v_new_type NOT IN (
    'gelir',
    'gider',
    'cari_alis',
    'cari_satis',
    'cari_alis_iade',
    'cari_satis_iade'
  ) THEN
    RAISE EXCEPTION 'CARI_PRODUCT_V3_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  -- Once stok etkisi geri alinir ve hareketler kaldirilir; UPDATE V2'nin
  -- productful fail-closed korumasi bu outer transaction icinde kontrollu acilir.
  PERFORM internal.reapply_cari_urun_items_v3(
    p_isletme_id,
    p_islem_id,
    '[]'::jsonb,
    v_old.type::text,
    'update'
  );

  SELECT result_row.*
  INTO v_result
  FROM public.update_islem_atomik_v2(
    p_isletme_id,
    p_islem_id,
    p_patch
  ) AS result_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CARI_PRODUCT_V3_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  PERFORM internal.reapply_cari_urun_items_v3(
    p_isletme_id,
    p_islem_id,
    p_items,
    v_result.type,
    'update'
  );

  RETURN QUERY
  SELECT
    v_result.id::uuid,
    v_result.type::text,
    v_result.amount::numeric,
    v_result.description::text,
    v_result.date::timestamp without time zone,
    v_result.hesap_id::uuid,
    v_result.hedef_hesap_id::uuid,
    v_result.kategori_id::uuid,
    v_result.cari_id::uuid,
    v_result.personel_id::uuid,
    v_result.source_currency::text,
    v_result.target_currency::text,
    v_result.exchange_rate::numeric,
    v_result.date_end::text,
    v_result.vade_tarihi::date,
    v_result.created_by::uuid;
END;
$function$;

ALTER FUNCTION public.update_cari_urunlu_islem_atomik_v3(
  uuid, uuid, jsonb, jsonb
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.update_cari_urunlu_islem_atomik_v3(
  uuid, uuid, jsonb, jsonb
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.update_cari_urunlu_islem_atomik_v3(
  uuid, uuid, jsonb, jsonb
)
TO authenticated;


CREATE FUNCTION public.delete_cari_urunlu_islem_atomik_v3(
  p_isletme_id uuid,
  p_islem_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old public.islemler;
BEGIN
  IF auth.uid() IS NULL
     OR p_isletme_id IS NULL
     OR p_islem_id IS NULL THEN
    RAISE EXCEPTION 'CARI_PRODUCT_V3_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT transaction_row.*
  INTO v_old
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = p_islem_id
    AND transaction_row.isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_old.type::text NOT IN (
       'gelir',
       'gider',
       'cari_alis',
       'cari_satis',
       'cari_alis_iade',
       'cari_satis_iade'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.urun_hareketler AS movement
       WHERE movement.isletme_id = p_isletme_id
         AND movement.islem_id = p_islem_id
     )
     OR NOT internal.islem_mutasyon_izni_v2(
       p_isletme_id,
       v_old.type::text,
       v_old.created_by,
       'delete',
       p_islem_id
     ) THEN
    RAISE EXCEPTION 'CARI_PRODUCT_V3_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  PERFORM internal.reapply_cari_urun_items_v3(
    p_isletme_id,
    p_islem_id,
    '[]'::jsonb,
    v_old.type::text,
    'delete'
  );

  PERFORM public.delete_islem_atomik_v2(p_isletme_id, p_islem_id);
  RETURN p_islem_id;
END;
$function$;

ALTER FUNCTION public.delete_cari_urunlu_islem_atomik_v3(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.delete_cari_urunlu_islem_atomik_v3(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.delete_cari_urunlu_islem_atomik_v3(uuid, uuid)
TO authenticated;


-- ---------------------------------------------------------------------------
-- 12) RAPORLAR-ONLY ESKI RPC UYUMLULUGU
--     Temel entity tablolari direct SELECT ile kapali kalir. Bu iki dar
--     SECURITY DEFINER aggregate RPC ise Raporlar aciksa tum isletme
--     kaynaklarini creator filtresiz hesaplar; mevcut imza/output korunur.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_category_report_v2(
  p_isletme_id uuid,
  p_types text[],
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(
  kategori_id uuid,
  kategori_adi text,
  kategori_renk text,
  kategori_icon text,
  parent_id uuid,
  islem_count bigint,
  total_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_reports_can_view boolean := false;
  v_can_see_all_users_data boolean := false;
  v_has_hesaplar boolean := false;
  v_has_cariler boolean := false;
  v_has_urunler boolean := false;
  v_has_personel boolean := false;
  v_allowed_source_modules text[] := ARRAY[]::text[];
  v_allowed_types text[] := ARRAY[]::text[];
  v_is_expense boolean;
BEGIN
  -- Parametre sozlesmesi degismez. Tek bir bilinmeyen/NULL tip tum cagrinin
  -- fail-closed bos donmesine yol acar.
  IF p_isletme_id IS NULL
     OR p_types IS NULL
     OR pg_catalog.cardinality(p_types) < 1
     OR pg_catalog.cardinality(p_types) > 16
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
  THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(p_types) AS requested_type(type_name)
    WHERE requested_type.type_name IS NULL
       OR internal.islem_tipi_modulu(requested_type.type_name) IS NULL
  ) THEN
    RETURN;
  END IF;

  SELECT
    permission.can_view,
    permission.can_see_all_users_data
  INTO
    v_reports_can_view,
    v_can_see_all_users_data
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission
  LIMIT 1;

  IF v_user_id IS NULL OR v_reports_can_view IS NOT TRUE THEN
    RETURN;
  END IF;

  SELECT permission.can_view
  INTO v_has_hesaplar
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_has_cariler
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_has_urunler
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_has_personel
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission
  LIMIT 1;

  IF v_has_hesaplar IS TRUE THEN
    v_allowed_source_modules :=
      pg_catalog.array_append(v_allowed_source_modules, 'hesaplar'::text);
  END IF;
  IF v_has_cariler IS TRUE THEN
    v_allowed_source_modules :=
      pg_catalog.array_append(v_allowed_source_modules, 'cariler'::text);
  END IF;
  IF v_has_personel IS TRUE THEN
    v_allowed_source_modules :=
      pg_catalog.array_append(v_allowed_source_modules, 'personel'::text);
  END IF;

  -- PERF: canonical helper yalniz p_types (en fazla 16) uzerinde calisir.
  -- Dizi sirasi ve duplicate tipler semantigi degistirmez; ANY ayni sonucu verir.
  SELECT COALESCE(
    pg_catalog.array_agg(
      requested_type.type_name
      ORDER BY requested_type.ordinality
    ),
    ARRAY[]::text[]
  )
  INTO v_allowed_types
  FROM pg_catalog.unnest(p_types) WITH ORDINALITY
    AS requested_type(type_name, ordinality)
  WHERE internal.islem_tipi_modulu(requested_type.type_name)
        <@ v_allowed_source_modules;

  IF pg_catalog.cardinality(v_allowed_types) < 1 THEN
    RETURN;
  END IF;

  -- Urunler helper'in bakiyeye ait kaynak modulu listesine eklenmez. Urun
  -- hareketinden kategori tureten dal asagida ayrica gate edilir.
  v_is_expense := (
    p_types && ARRAY[
      'gider',
      'cari_alis',
      'personel_gider',
      'cari_alis_iade'
    ]::text[]
  );

  RETURN QUERY
  WITH rates AS (
    SELECT rate_row.rates
    FROM public.exchange_rates AS rate_row
    WHERE rate_row.base_currency = 'TRY'
    LIMIT 1
  ),
  eligible_islemler AS MATERIALIZED (
    SELECT
      transaction_row.id,
      transaction_row.kategori_id,
      transaction_row.amount,
      COALESCE(
        account.currency,
        cari.currency,
        employee.currency,
        'TRY'
      ) AS txn_currency
    FROM public.islemler AS transaction_row
    LEFT JOIN public.hesaplar AS account
      ON account.id = transaction_row.hesap_id
     AND account.isletme_id = p_isletme_id
    LEFT JOIN public.hesaplar AS target_account
      ON target_account.id = transaction_row.hedef_hesap_id
     AND target_account.isletme_id = p_isletme_id
    LEFT JOIN public.cariler AS cari
      ON cari.id = transaction_row.cari_id
     AND cari.isletme_id = p_isletme_id
    LEFT JOIN public.personel AS employee
      ON employee.id = transaction_row.personel_id
     AND employee.isletme_id = p_isletme_id
    WHERE transaction_row.isletme_id = p_isletme_id
      AND transaction_row.type = ANY(v_allowed_types)
      AND transaction_row.date >= p_start_date
      AND transaction_row.date <= p_end_date
      AND (
        v_can_see_all_users_data IS TRUE
        OR transaction_row.created_by = v_user_id
      )
      AND (account.id IS NULL OR account.is_active = true)
      AND (
        target_account.id IS NULL
        OR target_account.is_active = true
      )
      AND (cari.id IS NULL OR cari.is_active IS TRUE)
      AND (employee.id IS NULL OR employee.is_active IS TRUE)
  ),
  urun_islem_tutar AS (
    SELECT
      movement.islem_id,
      CASE
        WHEN v_is_expense THEN
          COALESCE(
            product_category.mapped_gider_kategori_id,
            product.kategori_id
          )
        ELSE
          COALESCE(
            product_category.mapped_gelir_kategori_id,
            product.kategori_id
          )
      END AS resolved_kategori_id,
      pg_catalog.abs(movement.miktar)
        * COALESCE(movement.birim_fiyat, 0)
        * (1 + COALESCE(movement.kdv_orani, 0) / 100.0) AS hareket_tutar,
      eligible_transaction.amount AS islem_amount,
      eligible_transaction.txn_currency
    FROM eligible_islemler AS eligible_transaction
    INNER JOIN public.urun_hareketler AS movement
      ON movement.islem_id = eligible_transaction.id
     AND movement.isletme_id = p_isletme_id
    INNER JOIN public.urunler AS product
      ON product.id = movement.urun_id
     AND product.isletme_id = p_isletme_id
    LEFT JOIN public.kategoriler AS product_category
      ON product_category.id = product.kategori_id
     AND product_category.isletme_id = p_isletme_id
    WHERE v_has_urunler IS TRUE
      AND product.is_active IS TRUE
  ),
  islem_toplam AS (
    SELECT
      movement_amount.islem_id,
      pg_catalog.sum(movement_amount.hareket_tutar)
        AS toplam_hareket_tutar
    FROM urun_islem_tutar AS movement_amount
    GROUP BY movement_amount.islem_id
  ),
  dagitim AS (
    SELECT
      movement_amount.islem_id,
      movement_amount.resolved_kategori_id,
      movement_amount.hareket_tutar,
      transaction_total.toplam_hareket_tutar,
      movement_amount.islem_amount,
      movement_amount.txn_currency,
      CASE
        WHEN transaction_total.toplam_hareket_tutar > 0 THEN
          (
            movement_amount.hareket_tutar
            / transaction_total.toplam_hareket_tutar
          ) * movement_amount.islem_amount
        ELSE movement_amount.islem_amount
      END AS dagitilan_tutar
    FROM urun_islem_tutar AS movement_amount
    INNER JOIN islem_toplam AS transaction_total
      ON transaction_total.islem_id = movement_amount.islem_id
  )
  SELECT
    distributed.resolved_kategori_id AS kategori_id,
    category.name::text AS kategori_adi,
    category.color::text AS kategori_renk,
    category.icon::text AS kategori_icon,
    category.parent_id,
    pg_catalog.count(DISTINCT distributed.islem_id) AS islem_count,
    pg_catalog.sum(
      CASE
        WHEN distributed.txn_currency = 'TRY' THEN
          distributed.dagitilan_tutar
        ELSE
          distributed.dagitilan_tutar * COALESCE(
            (
              SELECT
                (rate.rates->>distributed.txn_currency)::decimal
              FROM rates AS rate
            ),
            1
          )
      END
    ) AS total_amount
  FROM dagitim AS distributed
  LEFT JOIN public.kategoriler AS category
    ON category.id = distributed.resolved_kategori_id
   AND category.isletme_id = p_isletme_id
  GROUP BY
    distributed.resolved_kategori_id,
    category.name,
    category.color,
    category.icon,
    category.parent_id

  UNION ALL

  SELECT
    category.id AS kategori_id,
    category.name::text AS kategori_adi,
    category.color::text AS kategori_renk,
    category.icon::text AS kategori_icon,
    category.parent_id,
    pg_catalog.count(transaction_row.id) AS islem_count,
    pg_catalog.sum(
      CASE
        WHEN transaction_row.txn_currency = 'TRY' THEN
          transaction_row.amount
        ELSE
          transaction_row.amount * COALESCE(
            (
              SELECT
                (
                  rate.rates->>transaction_row.txn_currency
                )::decimal
              FROM rates AS rate
            ),
            1
          )
      END
    ) AS total_amount
  FROM eligible_islemler AS transaction_row
  LEFT JOIN public.kategoriler AS category
    ON category.id = transaction_row.kategori_id
   AND category.isletme_id = p_isletme_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.urun_hareketler AS movement_check
    WHERE movement_check.islem_id = transaction_row.id
      AND movement_check.isletme_id = p_isletme_id
  )
  GROUP BY
    category.id,
    category.name,
    category.color,
    category.icon,
    category.parent_id;
END;
$function$;

ALTER FUNCTION public.get_category_report_v2(
  uuid, text[], timestamp with time zone, timestamp with time zone
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_category_report_v2(
  uuid, text[], timestamp with time zone, timestamp with time zone
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_category_report_v2(
  uuid, text[], timestamp with time zone, timestamp with time zone
)
TO authenticated;


CREATE OR REPLACE FUNCTION public.get_product_report_v2(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone,
  p_islem_types text[]
)
RETURNS TABLE(
  urun_id uuid,
  urun_adi text,
  urun_birim text,
  kategori_id uuid,
  kategori_adi text,
  toplam_miktar numeric,
  toplam_tutar numeric,
  toplam_tutar_kdvsiz numeric,
  islem_sayisi bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_reports_can_view boolean := false;
  v_can_see_all_users_data boolean := false;
  v_has_urunler boolean := false;
  v_include_unlinked_giris boolean := false;
  v_include_unlinked_cikis boolean := false;
BEGIN
  IF p_isletme_id IS NULL
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
     OR p_islem_types IS NULL
     OR pg_catalog.cardinality(p_islem_types) < 1
     OR pg_catalog.cardinality(p_islem_types) > 16
  THEN
    RETURN;
  END IF;

  -- Bu RPC yalniz mevcut Alis/Satis ekraninin bes finansal tipini kabul eder.
  -- Tek bir NULL/bilinmeyen tip butun cagrinin fail-closed bos donmesini saglar.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(p_islem_types) AS requested_type(type_name)
    WHERE requested_type.type_name IS NULL
       OR requested_type.type_name NOT IN (
         'cari_alis',
         'cari_alis_iade',
         'cari_satis',
         'cari_satis_iade',
         'personel_satis'
       )
  ) THEN
    RETURN;
  END IF;

  SELECT
    permission.can_view,
    permission.can_see_all_users_data
  INTO
    v_reports_can_view,
    v_can_see_all_users_data
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_has_urunler
  FROM internal.etkin_yetki_v2(p_isletme_id, 'urunler') AS permission
  LIMIT 1;

  -- Raporlar veya Urunler modullerinden biri bu aggregate projection icin
  -- yeterlidir. Ikisi de read-all oldugundan creator filtresi uygulanmaz.
  IF v_user_id IS NULL
     OR (
       v_reports_can_view IS NOT TRUE
       AND v_has_urunler IS NOT TRUE
     )
  THEN
    RETURN;
  END IF;

  v_can_see_all_users_data := true;

  -- Bagli ve bagimsiz hareketler Urunler verisidir. Cari/personel join'leri
  -- yalniz mevcut tutar/aktiflik semantigini korur; kaynak isimlerini dondurmez.
  v_include_unlinked_giris := 'cari_alis' = ANY(p_islem_types);
  v_include_unlinked_cikis :=
    'cari_satis' = ANY(p_islem_types)
    OR 'personel_satis' = ANY(p_islem_types);

  RETURN QUERY
  WITH rates AS MATERIALIZED (
    SELECT rate_row.rates
    FROM public.exchange_rates AS rate_row
    WHERE rate_row.base_currency = 'TRY'
    LIMIT 1
  )
  SELECT
    product.id AS urun_id,
    product.ad::text AS urun_adi,
    product.birim::text AS urun_birim,
    category.id AS kategori_id,
    category.name::text AS kategori_adi,
    pg_catalog.sum(pg_catalog.abs(movement.miktar)) AS toplam_miktar,
    pg_catalog.sum(
      pg_catalog.abs(movement.miktar)
      * COALESCE(movement.birim_fiyat, 0)
      * (1 + COALESCE(movement.kdv_orani, 0) / 100.0)
      * CASE
          WHEN transaction_row.id IS NULL THEN 1
          WHEN COALESCE(
            account.currency,
            cari.currency,
            employee.currency,
            'TRY'
          ) = 'TRY' THEN 1
          ELSE COALESCE(
            (
              SELECT
                (
                  rate.rates->>COALESCE(
                    account.currency,
                    cari.currency,
                    employee.currency
                  )
                )::decimal
              FROM rates AS rate
            ),
            1
          )
        END
    ) AS toplam_tutar,
    pg_catalog.sum(
      pg_catalog.abs(movement.miktar)
      * COALESCE(movement.birim_fiyat, 0)
      * CASE
          WHEN transaction_row.id IS NULL THEN 1
          WHEN COALESCE(
            account.currency,
            cari.currency,
            employee.currency,
            'TRY'
          ) = 'TRY' THEN 1
          ELSE COALESCE(
            (
              SELECT
                (
                  rate.rates->>COALESCE(
                    account.currency,
                    cari.currency,
                    employee.currency
                  )
                )::decimal
              FROM rates AS rate
            ),
            1
          )
        END
    ) AS toplam_tutar_kdvsiz,
    pg_catalog.count(
      DISTINCT COALESCE(movement.islem_id, movement.id)
    ) AS islem_sayisi
  FROM public.urun_hareketler AS movement
  INNER JOIN public.urunler AS product
    ON product.id = movement.urun_id
   AND product.isletme_id = p_isletme_id
  LEFT JOIN public.kategoriler AS category
    ON category.id = product.kategori_id
   AND category.isletme_id = p_isletme_id
  LEFT JOIN public.islemler AS transaction_row
    ON transaction_row.id = movement.islem_id
   AND transaction_row.isletme_id = p_isletme_id
  LEFT JOIN public.hesaplar AS account
    ON account.id = transaction_row.hesap_id
   AND account.isletme_id = p_isletme_id
  LEFT JOIN public.hesaplar AS target_account
    ON target_account.id = transaction_row.hedef_hesap_id
   AND target_account.isletme_id = p_isletme_id
  LEFT JOIN public.cariler AS cari
    ON cari.id = transaction_row.cari_id
   AND cari.isletme_id = p_isletme_id
  LEFT JOIN public.personel AS employee
    ON employee.id = transaction_row.personel_id
   AND employee.isletme_id = p_isletme_id
  WHERE movement.isletme_id = p_isletme_id
    AND product.is_active IS TRUE
    AND (
      (
        movement.islem_id IS NOT NULL
        AND transaction_row.id IS NOT NULL
        AND transaction_row.type = ANY(p_islem_types)
        AND transaction_row.date >= p_start_date
        AND transaction_row.date <= p_end_date
        AND (
          transaction_row.hesap_id IS NULL
          OR account.id IS NOT NULL
        )
        AND (
          transaction_row.hedef_hesap_id IS NULL
          OR target_account.id IS NOT NULL
        )
        AND (
          transaction_row.cari_id IS NULL
          OR cari.id IS NOT NULL
        )
        AND (
          transaction_row.personel_id IS NULL
          OR employee.id IS NOT NULL
        )
        AND (account.id IS NULL OR account.is_active = true)
        AND (
          target_account.id IS NULL
          OR target_account.is_active = true
        )
        AND (cari.id IS NULL OR cari.is_active IS TRUE)
        AND (
          employee.id IS NULL
          OR employee.is_active IS TRUE
        )
        AND (
          v_can_see_all_users_data IS TRUE
          OR transaction_row.created_by = v_user_id
        )
      )
      OR
      (
        movement.islem_id IS NULL
        AND movement.created_at >= p_start_date
        AND movement.created_at <= p_end_date
        AND (
          (
            v_include_unlinked_giris IS TRUE
            AND movement.hareket_tipi = 'giris'
          )
          OR
          (
            v_include_unlinked_cikis IS TRUE
            AND movement.hareket_tipi = 'cikis'
          )
        )
        AND (
          v_can_see_all_users_data IS TRUE
          OR movement.created_by = v_user_id
        )
      )
    )
  GROUP BY
    product.id,
    product.ad,
    product.birim,
    category.id,
    category.name
  ORDER BY 7 DESC;
END;
$function$;

ALTER FUNCTION public.get_product_report_v2(
  uuid, timestamp with time zone, timestamp with time zone, text[]
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_product_report_v2(
  uuid, timestamp with time zone, timestamp with time zone, text[]
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_product_report_v2(
  uuid, timestamp with time zone, timestamp with time zone, text[]
)
TO authenticated;


-- ---------------------------------------------------------------------------
-- 13) RAPORLAR-ONLY DAR REFERANS / AGGREGATE PROJEKSIYONLARI
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_rapor_varlik_referanslari_v1(
  p_isletme_id uuid,
  p_kind text DEFAULT NULL
)
RETURNS TABLE (
  entity_kind text,
  entity_id uuid,
  primary_name text,
  secondary_name text,
  entity_type text,
  currency text,
  balance numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_isletme_id IS NULL
     OR (p_kind IS NOT NULL AND p_kind NOT IN ('hesap', 'cari', 'personel'))
     OR NOT EXISTS (
       SELECT 1
       FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission
       WHERE permission.can_view IS TRUE
     ) THEN
    RAISE EXCEPTION 'REPORT_ENTITY_REFS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    'hesap'::text,
    account.id,
    account.name::text,
    NULL::text,
    account.type::text,
    COALESCE(account.currency, 'TRY')::text,
    COALESCE(account.balance, 0)::numeric
  FROM public.hesaplar AS account
  WHERE account.isletme_id = p_isletme_id
    AND account.is_active IS TRUE
    AND (p_kind IS NULL OR p_kind = 'hesap')

  UNION ALL

  SELECT
    'cari'::text,
    customer.id,
    customer.name::text,
    NULL::text,
    customer.type::text,
    COALESCE(customer.currency, 'TRY')::text,
    COALESCE(customer.balance, 0)::numeric
  FROM public.cariler AS customer
  WHERE customer.isletme_id = p_isletme_id
    AND customer.is_active IS TRUE
    AND (p_kind IS NULL OR p_kind = 'cari')

  UNION ALL

  SELECT
    'personel'::text,
    employee.id,
    employee.first_name::text,
    NULLIF(employee.last_name, '')::text,
    'personel'::text,
    COALESCE(employee.currency, 'TRY')::text,
    COALESCE(employee.balance, 0)::numeric
  FROM public.personel AS employee
  WHERE employee.isletme_id = p_isletme_id
    AND employee.is_active IS TRUE
    AND (p_kind IS NULL OR p_kind = 'personel')

  ORDER BY 1, 3, 2;
END;
$function$;

ALTER FUNCTION public.get_rapor_varlik_referanslari_v1(uuid, text)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_rapor_varlik_referanslari_v1(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_rapor_varlik_referanslari_v1(uuid, text)
TO authenticated;


CREATE FUNCTION public.get_rapor_kategori_referanslari_v1(
  p_isletme_id uuid,
  p_type text
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  icon text,
  color text,
  parent_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_isletme_id IS NULL
     OR p_type NOT IN ('gelir', 'gider')
     OR NOT EXISTS (
       SELECT 1
       FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission
       WHERE permission.can_view IS TRUE
     ) THEN
    RAISE EXCEPTION 'REPORT_CATEGORY_REFS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    category.id,
    category.name::text,
    category.type::text,
    category.icon::text,
    category.color::text,
    category.parent_id
  FROM public.kategoriler AS category
  WHERE category.isletme_id = p_isletme_id
    AND category.type::text = p_type
    AND category.is_active IS TRUE
  ORDER BY category.name, category.id;
END;
$function$;

ALTER FUNCTION public.get_rapor_kategori_referanslari_v1(uuid, text)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_rapor_kategori_referanslari_v1(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_rapor_kategori_referanslari_v1(uuid, text)
TO authenticated;


CREATE FUNCTION public.get_nakit_akisi_raporu_v1(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE (
  flow_kind text,
  kategori_id uuid,
  kategori_adi text,
  kategori_renk text,
  currency text,
  islem_count bigint,
  total_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_isletme_id IS NULL
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
     OR NOT EXISTS (
       SELECT 1
       FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission
       WHERE permission.can_view IS TRUE
     ) THEN
    RAISE EXCEPTION 'CASH_FLOW_REPORT_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scoped AS MATERIALIZED (
    SELECT
      transaction_row.id,
      transaction_row.amount,
      transaction_row.kategori_id,
      COALESCE(account.currency, 'TRY')::text AS currency,
      CASE
        WHEN transaction_row.type::text = 'transfer'
          AND account.type::text IN ('nakit', 'banka', 'birikim', 'diger')
          AND target_account.type::text = 'kredi_karti'
          THEN 'outflow'::text
        WHEN transaction_row.type::text IN (
          'gelir', 'cari_tahsilat', 'personel_tahsilat'
        )
          AND account.type::text IN ('nakit', 'banka', 'birikim', 'diger')
          THEN 'inflow'::text
        WHEN transaction_row.type::text IN (
          'gider', 'cari_odeme', 'personel_gider', 'personel_odeme'
        )
          AND account.type::text = 'kredi_karti'
          THEN 'credit_card'::text
        WHEN transaction_row.type::text IN (
          'gider', 'cari_odeme', 'personel_gider', 'personel_odeme'
        )
          AND account.type::text IN ('nakit', 'banka', 'birikim', 'diger')
          THEN 'outflow'::text
        ELSE NULL::text
      END AS flow_kind
    FROM public.islemler AS transaction_row
    INNER JOIN public.hesaplar AS account
      ON account.id = transaction_row.hesap_id
     AND account.isletme_id = transaction_row.isletme_id
    LEFT JOIN public.hesaplar AS target_account
      ON target_account.id = transaction_row.hedef_hesap_id
     AND target_account.isletme_id = transaction_row.isletme_id
    LEFT JOIN public.cariler AS customer
      ON customer.id = transaction_row.cari_id
     AND customer.isletme_id = transaction_row.isletme_id
    LEFT JOIN public.personel AS employee
      ON employee.id = transaction_row.personel_id
     AND employee.isletme_id = transaction_row.isletme_id
    WHERE transaction_row.isletme_id = p_isletme_id
      AND transaction_row.date::timestamp with time zone >= p_start_date
      AND transaction_row.date::timestamp with time zone <= p_end_date
      AND account.is_active IS TRUE
      AND (
        target_account.id IS NULL
        OR target_account.is_active IS TRUE
      )
      AND (customer.id IS NULL OR customer.is_active IS TRUE)
      AND (employee.id IS NULL OR employee.is_active IS TRUE)
  )
  SELECT
    scoped.flow_kind,
    scoped.kategori_id,
    category.name::text,
    category.color::text,
    scoped.currency,
    pg_catalog.count(scoped.id)::bigint,
    pg_catalog.sum(scoped.amount)::numeric
  FROM scoped
  LEFT JOIN public.kategoriler AS category
    ON category.id = scoped.kategori_id
   AND category.isletme_id = p_isletme_id
  WHERE scoped.flow_kind IS NOT NULL
  GROUP BY
    scoped.flow_kind,
    scoped.kategori_id,
    category.name,
    category.color,
    scoped.currency
  ORDER BY scoped.flow_kind, pg_catalog.sum(scoped.amount) DESC;
END;
$function$;

ALTER FUNCTION public.get_nakit_akisi_raporu_v1(
  uuid, timestamp with time zone, timestamp with time zone
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_nakit_akisi_raporu_v1(
  uuid, timestamp with time zone, timestamp with time zone
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_nakit_akisi_raporu_v1(
  uuid, timestamp with time zone, timestamp with time zone
)
TO authenticated;


CREATE FUNCTION public.get_rapor_trend_ozeti_v1(
  p_isletme_id uuid,
  p_filter_kind text,
  p_filter_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE (
  report_date date,
  type text,
  currency text,
  total_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_isletme_id IS NULL
     OR p_filter_kind NOT IN ('hesap', 'cari', 'kategori', 'personel')
     OR p_filter_id IS NULL
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
     OR NOT EXISTS (
       SELECT 1
       FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission
       WHERE permission.can_view IS TRUE
     ) THEN
    RAISE EXCEPTION 'REPORT_TREND_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF (
    p_filter_kind = 'hesap'
    AND NOT EXISTS (
      SELECT 1 FROM public.hesaplar AS source
      WHERE source.id = p_filter_id
        AND source.isletme_id = p_isletme_id
        AND source.is_active IS TRUE
    )
  ) OR (
    p_filter_kind = 'cari'
    AND NOT EXISTS (
      SELECT 1 FROM public.cariler AS source
      WHERE source.id = p_filter_id
        AND source.isletme_id = p_isletme_id
        AND source.is_active IS TRUE
    )
  ) OR (
    p_filter_kind = 'personel'
    AND NOT EXISTS (
      SELECT 1 FROM public.personel AS source
      WHERE source.id = p_filter_id
        AND source.isletme_id = p_isletme_id
        AND source.is_active IS TRUE
    )
  ) OR (
    p_filter_kind = 'kategori'
    AND NOT EXISTS (
      SELECT 1 FROM public.kategoriler AS source
      WHERE source.id = p_filter_id
        AND source.isletme_id = p_isletme_id
        AND source.is_active IS TRUE
    )
  ) THEN
    RAISE EXCEPTION 'REPORT_TREND_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH source_rows AS (
    SELECT
      transaction_row.date::date AS report_date,
      transaction_row.type::text AS type,
      COALESCE(
        account.currency,
        customer.currency,
        employee.currency,
        'TRY'
      )::text AS currency,
      transaction_row.amount::numeric AS amount
    FROM public.islemler AS transaction_row
    LEFT JOIN public.hesaplar AS account
      ON account.id = transaction_row.hesap_id
     AND account.isletme_id = transaction_row.isletme_id
    LEFT JOIN public.hesaplar AS target_account
      ON target_account.id = transaction_row.hedef_hesap_id
     AND target_account.isletme_id = transaction_row.isletme_id
    LEFT JOIN public.cariler AS customer
      ON customer.id = transaction_row.cari_id
     AND customer.isletme_id = transaction_row.isletme_id
    LEFT JOIN public.personel AS employee
      ON employee.id = transaction_row.personel_id
     AND employee.isletme_id = transaction_row.isletme_id
    WHERE transaction_row.isletme_id = p_isletme_id
      AND transaction_row.date::timestamp with time zone >= p_start_date
      AND transaction_row.date::timestamp with time zone <= p_end_date
      AND (account.id IS NULL OR account.is_active IS TRUE)
      AND (target_account.id IS NULL OR target_account.is_active IS TRUE)
      AND (customer.id IS NULL OR customer.is_active IS TRUE)
      AND (employee.id IS NULL OR employee.is_active IS TRUE)
      AND CASE p_filter_kind
        WHEN 'hesap' THEN transaction_row.hesap_id = p_filter_id
        WHEN 'cari' THEN transaction_row.cari_id = p_filter_id
        WHEN 'kategori' THEN transaction_row.kategori_id = p_filter_id
        WHEN 'personel' THEN transaction_row.personel_id = p_filter_id
        ELSE false
      END
  )
  SELECT
    source_rows.report_date,
    source_rows.type,
    source_rows.currency,
    pg_catalog.sum(source_rows.amount)::numeric
  FROM source_rows
  GROUP BY source_rows.report_date, source_rows.type, source_rows.currency
  ORDER BY source_rows.report_date, source_rows.type, source_rows.currency;
END;
$function$;

ALTER FUNCTION public.get_rapor_trend_ozeti_v1(
  uuid, text, uuid, timestamp with time zone, timestamp with time zone
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_rapor_trend_ozeti_v1(
  uuid, text, uuid, timestamp with time zone, timestamp with time zone
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_rapor_trend_ozeti_v1(
  uuid, text, uuid, timestamp with time zone, timestamp with time zone
)
TO authenticated;


-- Eski account report imzasi korunur. Raporlar aciksa isletmenin tum aktif
-- hesaplari gorulur. Yalniz Hesaplar baglamindan gelen ortak kullaniciysa,
-- Birikim kapaliyken birikim hesaplari aggregate'e dahi girmez.
CREATE OR REPLACE FUNCTION public.get_account_report(
  p_isletme_id uuid,
  p_types text[],
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE (
  hesap_id uuid,
  hesap_adi text,
  hesap_type text,
  hesap_currency text,
  islem_count bigint,
  total_amount numeric,
  total_native numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_has_reports boolean := false;
  v_has_accounts boolean := false;
  v_has_savings boolean := false;
BEGIN
  IF p_isletme_id IS NULL
     OR p_types IS NULL
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
     OR NOT internal.aktif_uye_v1(p_isletme_id) THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(report_permission.can_view, false),
    COALESCE(account_permission.can_view, false),
    COALESCE(savings_permission.can_view, false)
  INTO
    v_has_reports,
    v_has_accounts,
    v_has_savings
  FROM internal.etkin_yetki_v2(
    p_isletme_id, 'raporlar'
  ) AS report_permission
  CROSS JOIN internal.etkin_yetki_v2(
    p_isletme_id, 'hesaplar'
  ) AS account_permission
  CROSS JOIN internal.etkin_yetki_v2(
    p_isletme_id, 'birikim'
  ) AS savings_permission;

  IF v_has_reports IS NOT TRUE
     AND v_has_accounts IS NOT TRUE THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH rates AS (
    SELECT rate_row.rates
    FROM public.exchange_rates AS rate_row
    WHERE rate_row.base_currency = 'TRY'
    LIMIT 1
  )
  SELECT
    account.id,
    account.name::text,
    account.type::text,
    COALESCE(account.currency, 'TRY')::text,
    pg_catalog.count(transaction_row.id)::bigint,
    pg_catalog.sum(
      CASE
        WHEN COALESCE(account.currency, 'TRY') = 'TRY'
          THEN transaction_row.amount
        ELSE transaction_row.amount * COALESCE(
          (
            SELECT (rate.rates->>account.currency)::numeric
            FROM rates AS rate
          ),
          1
        )
      END
    )::numeric,
    pg_catalog.sum(transaction_row.amount)::numeric
  FROM public.islemler AS transaction_row
  INNER JOIN public.hesaplar AS account
    ON account.id = transaction_row.hesap_id
   AND account.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.cariler AS customer
    ON customer.id = transaction_row.cari_id
   AND customer.isletme_id = transaction_row.isletme_id
  LEFT JOIN public.personel AS employee
    ON employee.id = transaction_row.personel_id
   AND employee.isletme_id = transaction_row.isletme_id
  WHERE transaction_row.isletme_id = p_isletme_id
    AND transaction_row.type::text = ANY(p_types)
    AND transaction_row.date::timestamp with time zone >= p_start_date
    AND transaction_row.date::timestamp with time zone <= p_end_date
    AND account.is_active IS TRUE
    AND (
      v_has_reports IS TRUE
      OR account.type::text <> 'birikim'
      OR v_has_savings IS TRUE
    )
    AND (customer.id IS NULL OR customer.is_active IS TRUE)
    AND (employee.id IS NULL OR employee.is_active IS TRUE)
  GROUP BY account.id, account.name, account.type, account.currency;
END;
$function$;

ALTER FUNCTION public.get_account_report(
  uuid, text[], timestamp with time zone, timestamp with time zone
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_account_report(
  uuid, text[], timestamp with time zone, timestamp with time zone
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_account_report(
  uuid, text[], timestamp with time zone, timestamp with time zone
)
TO authenticated;


CREATE FUNCTION public.get_kategori_rapor_islem_satirlari_v1(
  p_isletme_id uuid,
  p_kategori_ids uuid[],
  p_include_uncategorized boolean,
  p_direction text,
  p_source text,
  p_include_returns boolean,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone,
  p_limit integer DEFAULT 100,
  p_before_date timestamp without time zone DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  type text,
  amount numeric,
  description text,
  "date" timestamp without time zone,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  created_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  kategori_name text,
  amount_currency text,
  category_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_source text := COALESCE(NULLIF(p_source, ''), 'income-expense');
BEGIN
  IF p_isletme_id IS NULL
     OR p_kategori_ids IS NULL
     OR pg_catalog.cardinality(p_kategori_ids) > 100
     OR (
       pg_catalog.cardinality(p_kategori_ids) = 0
       AND p_include_uncategorized IS NOT TRUE
     )
     OR p_include_uncategorized IS NULL
     OR p_direction NOT IN ('gelir', 'gider')
     OR v_source NOT IN ('income-expense', 'cash-flow')
     OR p_include_returns IS NULL
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
     OR p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 100
     OR (
       (p_before_date IS NULL) IS DISTINCT FROM (p_before_id IS NULL)
     )
     OR NOT EXISTS (
       SELECT 1
       FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission
       WHERE permission.can_view IS TRUE
     ) THEN
    RAISE EXCEPTION 'CATEGORY_REPORT_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH eligible AS MATERIALIZED (
    SELECT
      transaction_row.id,
      transaction_row.type::text AS type,
      transaction_row.amount,
      transaction_row.description,
      transaction_row.date::timestamp without time zone AS date,
      transaction_row.source_currency::text,
      transaction_row.target_currency::text,
      transaction_row.exchange_rate,
      transaction_row.created_by,
      transaction_row.created_at,
      transaction_row.updated_at,
      transaction_row.kategori_id,
      COALESCE(
        account.currency,
        customer.currency,
        employee.currency,
        'TRY'
      )::text AS amount_currency
    FROM public.islemler AS transaction_row
    LEFT JOIN public.hesaplar AS account
      ON account.id = transaction_row.hesap_id
     AND account.isletme_id = transaction_row.isletme_id
    LEFT JOIN public.hesaplar AS target_account
      ON target_account.id = transaction_row.hedef_hesap_id
     AND target_account.isletme_id = transaction_row.isletme_id
    LEFT JOIN public.cariler AS customer
      ON customer.id = transaction_row.cari_id
     AND customer.isletme_id = transaction_row.isletme_id
    LEFT JOIN public.personel AS employee
      ON employee.id = transaction_row.personel_id
     AND employee.isletme_id = transaction_row.isletme_id
    WHERE transaction_row.isletme_id = p_isletme_id
      AND transaction_row.date::timestamp with time zone >= p_start_date
      AND transaction_row.date::timestamp with time zone <= p_end_date
      AND (account.id IS NULL OR account.is_active IS TRUE)
      AND (target_account.id IS NULL OR target_account.is_active IS TRUE)
      AND (customer.id IS NULL OR customer.is_active IS TRUE)
      AND (employee.id IS NULL OR employee.is_active IS TRUE)
      AND (
        (
          v_source = 'income-expense'
          AND (
            (
              p_direction = 'gelir'
              AND (
                transaction_row.type::text IN (
                  'gelir', 'cari_satis', 'personel_satis'
                )
                OR (
                  p_include_returns IS TRUE
                  AND transaction_row.type::text = 'cari_satis_iade'
                )
              )
            )
            OR (
              p_direction = 'gider'
              AND (
                transaction_row.type::text IN (
                  'gider', 'cari_alis', 'personel_gider'
                )
                OR (
                  p_include_returns IS TRUE
                  AND transaction_row.type::text = 'cari_alis_iade'
                )
              )
            )
          )
        )
        OR (
          v_source = 'cash-flow'
          AND (
            (
              p_direction = 'gelir'
              AND transaction_row.type::text IN (
                'gelir', 'cari_tahsilat', 'personel_tahsilat'
              )
            )
            OR (
              p_direction = 'gider'
              AND transaction_row.type::text IN (
                'gider', 'cari_odeme', 'personel_gider',
                'personel_odeme'
              )
            )
            OR (
              p_direction = 'gider'
              AND transaction_row.type::text = 'transfer'
              AND account.type::text IN (
                'nakit', 'banka', 'birikim', 'diger'
              )
              AND target_account.type::text = 'kredi_karti'
            )
          )
        )
      )
      AND (
        p_before_date IS NULL
        OR ROW(
          transaction_row.date::timestamp without time zone,
          transaction_row.id
        ) < ROW(p_before_date, p_before_id)
      )
  ),
  product_transaction_ids AS MATERIALIZED (
    SELECT DISTINCT movement.islem_id
    FROM public.urun_hareketler AS movement
    INNER JOIN eligible
      ON eligible.id = movement.islem_id
    WHERE movement.isletme_id = p_isletme_id
      AND movement.islem_id IS NOT NULL
      AND eligible.type <> 'transfer'
  ),
  matched_product AS (
    SELECT
      movement.islem_id,
      pg_catalog.min(resolved_category.name)::text AS kategori_name,
      pg_catalog.sum(
        pg_catalog.abs(movement.miktar)
        * COALESCE(movement.birim_fiyat, 0)
        * (1 + COALESCE(movement.kdv_orani, 0) / 100.0)
      )::numeric AS category_amount
    FROM public.urun_hareketler AS movement
    INNER JOIN eligible
      ON eligible.id = movement.islem_id
    INNER JOIN public.urunler AS product
      ON product.id = movement.urun_id
     AND product.isletme_id = movement.isletme_id
     AND product.is_active IS TRUE
    LEFT JOIN public.kategoriler AS product_category
      ON product_category.id = product.kategori_id
     AND product_category.isletme_id = product.isletme_id
    LEFT JOIN public.kategoriler AS resolved_category
      ON resolved_category.id = CASE p_direction
        WHEN 'gider' THEN COALESCE(
          product_category.mapped_gider_kategori_id,
          product.kategori_id
        )
        ELSE COALESCE(
          product_category.mapped_gelir_kategori_id,
          product.kategori_id
        )
      END
     AND resolved_category.isletme_id = product.isletme_id
    WHERE movement.isletme_id = p_isletme_id
      AND eligible.type <> 'transfer'
      AND (
        (
          CASE p_direction
            WHEN 'gider' THEN COALESCE(
              product_category.mapped_gider_kategori_id,
              product.kategori_id
            )
            ELSE COALESCE(
              product_category.mapped_gelir_kategori_id,
              product.kategori_id
            )
          END
        ) = ANY(p_kategori_ids)
        OR (
          p_include_uncategorized IS TRUE
          AND (
            CASE p_direction
              WHEN 'gider' THEN COALESCE(
                product_category.mapped_gider_kategori_id,
                product.kategori_id
              )
              ELSE COALESCE(
                product_category.mapped_gelir_kategori_id,
                product.kategori_id
              )
            END
          ) IS NULL
        )
      )
    GROUP BY movement.islem_id
  ),
  result_rows AS (
    SELECT
      eligible.id,
      eligible.type,
      eligible.amount,
      eligible.description,
      eligible.date,
      eligible.source_currency,
      eligible.target_currency,
      eligible.exchange_rate,
      eligible.created_by,
      eligible.created_at,
      eligible.updated_at,
      direct_category.name::text AS kategori_name,
      eligible.amount_currency,
      NULL::numeric AS category_amount
    FROM eligible
    LEFT JOIN product_transaction_ids
      ON product_transaction_ids.islem_id = eligible.id
    LEFT JOIN public.kategoriler AS direct_category
      ON direct_category.id = eligible.kategori_id
     AND direct_category.isletme_id = p_isletme_id
    WHERE product_transaction_ids.islem_id IS NULL
      AND (
        eligible.kategori_id = ANY(p_kategori_ids)
        OR (
          p_include_uncategorized IS TRUE
          AND eligible.kategori_id IS NULL
        )
      )

    UNION ALL

    SELECT
      eligible.id,
      eligible.type,
      eligible.amount,
      eligible.description,
      eligible.date,
      eligible.source_currency,
      eligible.target_currency,
      eligible.exchange_rate,
      eligible.created_by,
      eligible.created_at,
      eligible.updated_at,
      matched_product.kategori_name,
      eligible.amount_currency,
      matched_product.category_amount
    FROM eligible
    INNER JOIN matched_product
      ON matched_product.islem_id = eligible.id
  )
  SELECT
    result_rows.id,
    result_rows.type,
    result_rows.amount,
    result_rows.description,
    result_rows.date,
    result_rows.source_currency,
    result_rows.target_currency,
    result_rows.exchange_rate,
    result_rows.created_by,
    result_rows.created_at,
    result_rows.updated_at,
    result_rows.kategori_name,
    result_rows.amount_currency,
    result_rows.category_amount
  FROM result_rows
  ORDER BY result_rows.date DESC, result_rows.id DESC
  LIMIT p_limit;
END;
$function$;

ALTER FUNCTION public.get_kategori_rapor_islem_satirlari_v1(
  uuid, uuid[], boolean, text, text, boolean,
  timestamp with time zone, timestamp with time zone,
  integer, timestamp without time zone, uuid
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_kategori_rapor_islem_satirlari_v1(
  uuid, uuid[], boolean, text, text, boolean,
  timestamp with time zone, timestamp with time zone,
  integer, timestamp without time zone, uuid
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_kategori_rapor_islem_satirlari_v1(
  uuid, uuid[], boolean, text, text, boolean,
  timestamp with time zone, timestamp with time zone,
  integer, timestamp without time zone, uuid
)
TO authenticated;


-- Existing detail projections: read-all ve reports-context uyumlulugu.
CREATE OR REPLACE FUNCTION public.get_cari_islem_satirlari_v1(
  p_isletme_id uuid,
  p_cari_id uuid,
  p_limit integer DEFAULT 50,
  p_before_date timestamp without time zone DEFAULT NULL,
  p_before_created_at timestamp with time zone DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  isletme_id uuid,
  type text,
  amount numeric,
  description text,
  "date" timestamp without time zone,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  vade_tarihi date,
  photo_path text,
  created_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  kategori_name text,
  hesap_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view boolean := false;
  v_reports boolean := false;
  v_can_view_birikim boolean := false;
  v_can_see_all_users_data boolean := false;
  v_is_owner boolean := false;
  v_can_see_archived boolean := false;
  v_can_see_passive boolean := false;
BEGIN
  IF p_isletme_id IS NULL
     OR p_cari_id IS NULL
     OR p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 100 THEN
    RAISE EXCEPTION 'CARI_TRANSACTION_ROWS_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    (
      p_before_date IS NULL
      AND p_before_created_at IS NULL
      AND p_before_id IS NULL
    )
    OR
    (
      p_before_date IS NOT NULL
      AND p_before_created_at IS NOT NULL
      AND p_before_id IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION 'CARI_TRANSACTION_ROWS_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    permission.can_view,
    permission.can_see_all_users_data
  INTO
    v_can_view,
    v_can_see_all_users_data
  FROM internal.etkin_yetki_v2(
    p_isletme_id,
    'cariler'
  ) AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_reports
  FROM internal.etkin_yetki_v2(
    p_isletme_id,
    'raporlar'
  ) AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_can_view_birikim
  FROM internal.etkin_yetki_v2(
    p_isletme_id,
    'birikim'
  ) AS permission
  LIMIT 1;

  IF v_reports IS TRUE THEN
    v_can_view := true;
    v_can_see_all_users_data := true;
  END IF;

  IF v_uid IS NULL OR v_can_view IS NOT TRUE THEN
    RAISE EXCEPTION 'CARI_TRANSACTION_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  -- internal.etkin_yetki sahiplik filtresini dondurur; mevcut imzasi henuz
  -- arsiv/pasif gorunurluklerini dondurmez. Parent cari kontrolu, mevcut
  -- "Shared select cariler" RLS'iyle birebir kalmak icin bu iki exact-jsonb
  -- bayragi yalniz aktif uyelikten fail-closed tamamlar. Aksiyon/level burada
  -- tekrar yorumlanmaz.
  SELECT EXISTS (
    SELECT 1
    FROM public.isletmeler AS isletme
    WHERE isletme.id = p_isletme_id
      AND isletme.user_id = v_uid
  )
  INTO v_is_owner;

  IF v_is_owner THEN
    v_can_see_archived := true;
    v_can_see_passive := true;
  ELSE
    SELECT
      COALESCE(
        uye.permissions->'visibility'->'can_see_archived'
          = 'true'::pg_catalog.jsonb,
        false
      ),
      COALESCE(
        uye.permissions->'visibility'->'can_see_passive'
          = 'true'::pg_catalog.jsonb,
        false
      )
    INTO
      v_can_see_archived,
      v_can_see_passive
    FROM public.isletme_users AS uye
    WHERE uye.isletme_id = p_isletme_id
      AND uye.user_id = v_uid
      AND uye.status = 'active'
    LIMIT 1;
  END IF;

  IF NOT v_is_owner THEN
    -- Acik modul, arsivlenmis fakat aktif kayitlari da salt-okunur gosterir.
    -- Pasif kayitlar owner-only kalir.
    v_can_see_archived := true;
    v_can_see_passive := false;
  END IF;

  -- Ayni generic hata; yok, cross-tenant, baskasina ait, arsivli veya pasif
  -- cari durumlarini birbirinden ayirt ettirmez.
  IF NOT EXISTS (
    SELECT 1
    FROM public.cariler AS cari
    WHERE cari.id = p_cari_id
      AND cari.isletme_id = p_isletme_id
      AND (
        v_is_owner IS TRUE
        OR (
          (
            v_can_see_all_users_data IS TRUE
            OR cari.created_by = v_uid
          )
          AND (
            v_can_see_archived IS TRUE
            OR cari.is_archived IS FALSE
          )
          AND (
            v_can_see_passive IS TRUE
            OR cari.is_active IS TRUE
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'CARI_TRANSACTION_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    islem.id,
    islem.isletme_id,
    islem.type::text,
    islem.amount,
    islem.description,
    islem.date::timestamp without time zone,
    islem.source_currency,
    islem.target_currency,
    islem.exchange_rate,
    islem.vade_tarihi,
    islem.photo_path,
    islem.created_by,
    cursor_key.created_at,
    islem.updated_at,
    kategori.name::text AS kategori_name,
    CASE
      WHEN islem.type IN ('cari_odeme', 'cari_tahsilat')
           AND (hesap.is_active IS TRUE OR v_is_owner)
           AND (
             hesap.type::text <> 'birikim'
             OR v_can_view_birikim IS TRUE
             OR v_reports IS TRUE
             OR v_is_owner IS TRUE
           )
        THEN hesap.name::text
      ELSE NULL::text
    END AS hesap_name
  FROM public.islemler AS islem
  LEFT JOIN public.kategoriler AS kategori
    ON kategori.id = islem.kategori_id
   AND kategori.isletme_id = islem.isletme_id
  LEFT JOIN public.hesaplar AS hesap
    ON hesap.id = islem.hesap_id
   AND hesap.isletme_id = islem.isletme_id
   AND islem.type IN ('cari_odeme', 'cari_tahsilat')
  -- created_at kolonunun sema kontrati nullable. Canlida bugun NULL satir yok;
  -- yine de gelecekte tek bir NULL cursor'un sayfalamayi durdurmamasi icin hem
  -- cikti hem keyset ayni non-null, deterministik fallback'i kullanir.
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      islem.created_at,
      islem.date::timestamp without time zone AT TIME ZONE 'Europe/Istanbul'
    ) AS created_at
  ) AS cursor_key
  WHERE islem.isletme_id = p_isletme_id
    AND islem.cari_id = p_cari_id
    AND internal.islem_tipi_modulu(islem.type)
      = ARRAY['cariler']::text[]
    AND (
      v_can_see_all_users_data IS TRUE
      OR islem.created_by = v_uid
    )
    AND (
      p_before_date IS NULL
      OR ROW(
        islem.date::timestamp without time zone,
        cursor_key.created_at,
        islem.id
      ) < ROW(
        p_before_date,
        p_before_created_at,
        p_before_id
      )
    )
  ORDER BY
    islem.date::timestamp without time zone DESC,
    cursor_key.created_at DESC,
    islem.id DESC
  LIMIT p_limit;
END;
$function$;

ALTER FUNCTION public.get_cari_islem_satirlari_v1(
  uuid, uuid, integer, timestamp without time zone,
  timestamp with time zone, uuid
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_cari_islem_satirlari_v1(
  uuid, uuid, integer, timestamp without time zone,
  timestamp with time zone, uuid
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_cari_islem_satirlari_v1(
  uuid, uuid, integer, timestamp without time zone,
  timestamp with time zone, uuid
)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_personel_islem_satirlari_v1(
  p_isletme_id uuid,
  p_personel_id uuid,
  p_limit integer DEFAULT 50,
  p_before_date timestamp without time zone DEFAULT NULL,
  p_before_created_at timestamp with time zone DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  type text,
  amount numeric,
  description text,
  "date" timestamp without time zone,
  date_end text,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  created_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  kategori_name text,
  hesap_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view_personel boolean := false;
  v_reports boolean := false;
  v_can_view_hesaplar boolean := false;
  v_can_view_birikim boolean := false;
  v_can_see_all_users_data boolean := false;
  v_is_owner boolean := false;
  v_can_see_archived boolean := false;
  v_can_see_passive boolean := false;
BEGIN
  IF p_isletme_id IS NULL
     OR p_personel_id IS NULL
     OR p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 100 THEN
    RAISE EXCEPTION 'PERSONEL_TRANSACTION_ROWS_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    (
      p_before_date IS NULL
      AND p_before_created_at IS NULL
      AND p_before_id IS NULL
    )
    OR
    (
      p_before_date IS NOT NULL
      AND p_before_created_at IS NOT NULL
      AND p_before_id IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION 'PERSONEL_TRANSACTION_ROWS_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    permission.can_view,
    permission.can_see_all_users_data
  INTO
    v_can_view_personel,
    v_can_see_all_users_data
  FROM internal.etkin_yetki_v2(
    p_isletme_id,
    'personel'
  ) AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_reports
  FROM internal.etkin_yetki_v2(
    p_isletme_id,
    'raporlar'
  ) AS permission
  LIMIT 1;

  IF v_reports IS TRUE THEN
    v_can_view_personel := true;
    v_can_see_all_users_data := true;
  END IF;

  IF v_uid IS NULL OR v_can_view_personel IS NOT TRUE THEN
    RAISE EXCEPTION 'PERSONEL_TRANSACTION_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT permission.can_view
  INTO v_can_view_hesaplar
  FROM internal.etkin_yetki_v2(
    p_isletme_id,
    'hesaplar'
  ) AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_can_view_birikim
  FROM internal.etkin_yetki_v2(
    p_isletme_id,
    'birikim'
  ) AS permission
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM public.isletmeler AS isletme
    WHERE isletme.id = p_isletme_id
      AND isletme.user_id = v_uid
  )
  INTO v_is_owner;

  IF v_is_owner THEN
    v_can_see_archived := true;
    v_can_see_passive := true;
  ELSE
    -- internal.etkin_yetki mevcut imzasinda arsiv/pasif bayraklarini
    -- dondurmedigi icin Shared select personel/hesaplar semantigindeki exact
    -- JSONB bayraklari fail-closed tamamlanir. Aksiyon/level yorumlanmaz.
    SELECT
      COALESCE(
        uye.permissions->'visibility'->'can_see_archived'
          = 'true'::pg_catalog.jsonb,
        false
      ),
      COALESCE(
        uye.permissions->'visibility'->'can_see_passive'
          = 'true'::pg_catalog.jsonb,
        false
      )
    INTO
      v_can_see_archived,
      v_can_see_passive
    FROM public.isletme_users AS uye
    WHERE uye.isletme_id = p_isletme_id
      AND uye.user_id = v_uid
      AND uye.status = 'active'
    LIMIT 1;
  END IF;

  IF NOT v_is_owner THEN
    v_can_see_archived := true;
    v_can_see_passive := false;
  END IF;

  -- Yok/cross-tenant/baskasina ait/arsivli/pasif ayrimini sizdirmayan tek hata.
  IF NOT EXISTS (
    SELECT 1
    FROM public.personel AS personel
    WHERE personel.id = p_personel_id
      AND personel.isletme_id = p_isletme_id
      AND (
        v_is_owner IS TRUE
        OR (
          (
            v_can_see_all_users_data IS TRUE
            OR personel.created_by = v_uid
          )
          AND (
            v_can_see_archived IS TRUE
            OR personel.is_archived IS FALSE
          )
          AND (
            v_can_see_passive IS TRUE
            OR personel.is_active IS TRUE
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'PERSONEL_TRANSACTION_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT
      islem.id,
      islem.isletme_id,
      islem.type,
      islem.amount,
      islem.description,
      islem.date::timestamp without time zone AS date,
      islem.date_end,
      islem.source_currency,
      islem.target_currency,
      islem.exchange_rate,
      islem.created_by,
      cursor_key.created_at,
      islem.updated_at,
      islem.kategori_id,
      islem.hesap_id,
      mapping.source_modules
    FROM public.islemler AS islem
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        islem.created_at,
        islem.date::timestamp without time zone
          AT TIME ZONE 'Europe/Istanbul'
      ) AS created_at
    ) AS cursor_key
    CROSS JOIN LATERAL (
      SELECT internal.islem_tipi_modulu(islem.type) AS source_modules
    ) AS mapping
    WHERE islem.isletme_id = p_isletme_id
      AND islem.personel_id = p_personel_id
      AND (
        v_can_see_all_users_data IS TRUE
        OR islem.created_by = v_uid
      )
      AND CASE
        WHEN mapping.source_modules = ARRAY['personel']::text[]
          THEN true
        WHEN mapping.source_modules
          = ARRAY['personel', 'hesaplar']::text[]
          THEN v_can_view_hesaplar IS TRUE
        ELSE false
      END
      AND (
        p_before_date IS NULL
        OR ROW(
          islem.date::timestamp without time zone,
          cursor_key.created_at,
          islem.id
        ) < ROW(
          p_before_date,
          p_before_created_at,
          p_before_id
        )
      )
    ORDER BY
      islem.date::timestamp without time zone DESC,
      cursor_key.created_at DESC,
      islem.id DESC
    LIMIT p_limit
  )
  SELECT
    candidate.id,
    candidate.type::text,
    candidate.amount,
    candidate.description,
    candidate.date,
    candidate.date_end,
    candidate.source_currency,
    candidate.target_currency,
    candidate.exchange_rate,
    candidate.created_by,
    candidate.created_at,
    candidate.updated_at,
    kategori.name::text AS kategori_name,
    hesap.name::text AS hesap_name
  FROM candidate
  LEFT JOIN public.kategoriler AS kategori
    ON kategori.id = candidate.kategori_id
   AND kategori.isletme_id = candidate.isletme_id
  LEFT JOIN public.hesaplar AS hesap
    ON hesap.id = candidate.hesap_id
   AND hesap.isletme_id = candidate.isletme_id
   AND candidate.type::text IN ('personel_odeme', 'personel_tahsilat')
   AND (
     v_is_owner IS TRUE
     OR (
       hesap.is_active IS TRUE
       AND (
         hesap.type::text <> 'birikim'
         OR v_can_view_birikim IS TRUE
         OR v_reports IS TRUE
       )
     )
   )
  ORDER BY
    candidate.date DESC,
    candidate.created_at DESC,
    candidate.id DESC
  LIMIT p_limit;
END;
$function$;

ALTER FUNCTION public.get_personel_islem_satirlari_v1(
  uuid, uuid, integer, timestamp without time zone,
  timestamp with time zone, uuid
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_personel_islem_satirlari_v1(
  uuid, uuid, integer, timestamp without time zone,
  timestamp with time zone, uuid
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_personel_islem_satirlari_v1(
  uuid, uuid, integer, timestamp without time zone,
  timestamp with time zone, uuid
)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_hesap_islem_satirlari_v1(
  p_isletme_id uuid,
  p_hesap_id uuid,
  p_limit integer DEFAULT 50,
  p_before_date timestamp without time zone DEFAULT NULL,
  p_before_created_at timestamp with time zone DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  type text,
  amount numeric,
  description text,
  "date" timestamp without time zone,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  vade_tarihi date,
  photo_path text,
  created_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  kategori_name text,
  source_account_name text,
  target_account_name text,
  counterparty_kind text,
  counterparty_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view_hesaplar boolean := false;
  v_can_view_cariler boolean := false;
  v_can_view_personel boolean := false;
  v_can_view_birikim boolean := false;
  v_can_see_all_users_data boolean := false;
  v_is_owner boolean := false;
  v_can_see_archived boolean := false;
  v_can_see_passive boolean := false;
BEGIN
  IF p_isletme_id IS NULL
     OR p_hesap_id IS NULL
     OR p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 100 THEN
    RAISE EXCEPTION 'ACCOUNT_TRANSACTION_ROWS_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    (
      p_before_date IS NULL
      AND p_before_created_at IS NULL
      AND p_before_id IS NULL
    )
    OR
    (
      p_before_date IS NOT NULL
      AND p_before_created_at IS NOT NULL
      AND p_before_id IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_TRANSACTION_ROWS_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    permission.can_view,
    permission.can_see_all_users_data
  INTO
    v_can_view_hesaplar,
    v_can_see_all_users_data
  FROM internal.etkin_yetki_v2(
    p_isletme_id,
    'hesaplar'
  ) AS permission
  LIMIT 1;

  IF v_uid IS NULL OR v_can_view_hesaplar IS NOT TRUE THEN
    RAISE EXCEPTION 'ACCOUNT_TRANSACTION_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT permission.can_view
  INTO v_can_view_cariler
  FROM internal.etkin_yetki_v2(
    p_isletme_id,
    'cariler'
  ) AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_can_view_personel
  FROM internal.etkin_yetki_v2(
    p_isletme_id,
    'personel'
  ) AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_can_view_birikim
  FROM internal.etkin_yetki_v2(
    p_isletme_id,
    'birikim'
  ) AS permission
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM public.isletmeler AS isletme
    WHERE isletme.id = p_isletme_id
      AND isletme.user_id = v_uid
  )
  INTO v_is_owner;

  IF v_is_owner THEN
    v_can_see_archived := true;
    v_can_see_passive := true;
  ELSE
    -- Resolver arsiv/pasif bayraklarini henuz dondurmedigi icin mevcut hesap
    -- SELECT RLS semantigindeki exact-jsonb gorunurlukleri fail-closed tamamla.
    SELECT
      COALESCE(
        uye.permissions->'visibility'->'can_see_archived'
          = 'true'::pg_catalog.jsonb,
        false
      ),
      COALESCE(
        uye.permissions->'visibility'->'can_see_passive'
          = 'true'::pg_catalog.jsonb,
        false
      )
    INTO
      v_can_see_archived,
      v_can_see_passive
    FROM public.isletme_users AS uye
    WHERE uye.isletme_id = p_isletme_id
      AND uye.user_id = v_uid
      AND uye.status = 'active'
    LIMIT 1;
  END IF;

  IF NOT v_is_owner THEN
    v_can_see_archived := true;
    v_can_see_passive := false;
  END IF;

  -- Yok/cross-tenant/birikim/arsiv/pasif ayrimini disariya sizdirmayan tek hata.
  IF NOT EXISTS (
    SELECT 1
    FROM public.hesaplar AS hesap
    WHERE hesap.id = p_hesap_id
      AND hesap.isletme_id = p_isletme_id
      AND (
        v_is_owner IS TRUE
        OR (
          (
            hesap.type <> 'birikim'
            OR v_can_view_birikim IS TRUE
          )
          AND (
            v_can_see_archived IS TRUE
            OR hesap.is_archived IS FALSE
          )
          AND (
            v_can_see_passive IS TRUE
            OR hesap.is_active IS TRUE
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_TRANSACTION_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH source_rows AS (
    SELECT
      islem.id,
      islem.isletme_id,
      islem.type,
      islem.amount,
      islem.description,
      islem.date::timestamp without time zone AS date,
      islem.source_currency,
      islem.target_currency,
      islem.exchange_rate,
      islem.vade_tarihi,
      islem.photo_path,
      islem.created_by,
      cursor_key.created_at,
      islem.updated_at,
      islem.kategori_id,
      islem.hesap_id,
      islem.hedef_hesap_id,
      islem.cari_id,
      islem.personel_id,
      internal.islem_tipi_modulu(islem.type) AS source_modules,
      'source'::text AS selected_leg
    FROM public.islemler AS islem
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        islem.created_at,
        islem.date::timestamp without time zone
          AT TIME ZONE 'Europe/Istanbul'
      ) AS created_at
    ) AS cursor_key
    WHERE islem.isletme_id = p_isletme_id
      AND islem.hesap_id = p_hesap_id
      AND (
        p_before_date IS NULL
        OR ROW(
          islem.date::timestamp without time zone,
          cursor_key.created_at,
          islem.id
        ) < ROW(
          p_before_date,
          p_before_created_at,
          p_before_id
        )
      )
    ORDER BY
      islem.date::timestamp without time zone DESC,
      cursor_key.created_at DESC,
      islem.id DESC
    LIMIT p_limit
  ),
  target_rows AS (
    SELECT
      islem.id,
      islem.isletme_id,
      islem.type,
      islem.amount,
      islem.description,
      islem.date::timestamp without time zone AS date,
      islem.source_currency,
      islem.target_currency,
      islem.exchange_rate,
      islem.vade_tarihi,
      islem.photo_path,
      islem.created_by,
      cursor_key.created_at,
      islem.updated_at,
      islem.kategori_id,
      islem.hesap_id,
      islem.hedef_hesap_id,
      islem.cari_id,
      islem.personel_id,
      internal.islem_tipi_modulu(islem.type) AS source_modules,
      'target'::text AS selected_leg
    FROM public.islemler AS islem
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        islem.created_at,
        islem.date::timestamp without time zone
          AT TIME ZONE 'Europe/Istanbul'
      ) AS created_at
    ) AS cursor_key
    WHERE islem.isletme_id = p_isletme_id
      AND islem.hedef_hesap_id = p_hesap_id
      AND islem.type = 'transfer'
      -- Kaynak ve hedef ayni hesapsa kaynak dal tek satir dondurur.
      AND islem.hesap_id IS DISTINCT FROM p_hesap_id
      AND internal.islem_tipi_modulu(islem.type)
        = ARRAY['hesaplar']::text[]
      AND (
        p_before_date IS NULL
        OR ROW(
          islem.date::timestamp without time zone,
          cursor_key.created_at,
          islem.id
        ) < ROW(
          p_before_date,
          p_before_created_at,
          p_before_id
        )
      )
    ORDER BY
      islem.date::timestamp without time zone DESC,
      cursor_key.created_at DESC,
      islem.id DESC
    LIMIT p_limit
  ),
  candidate AS (
    SELECT
      source_rows.id,
      source_rows.isletme_id,
      source_rows.type,
      source_rows.amount,
      source_rows.description,
      source_rows.date,
      source_rows.source_currency,
      source_rows.target_currency,
      source_rows.exchange_rate,
      source_rows.vade_tarihi,
      source_rows.photo_path,
      source_rows.created_by,
      source_rows.created_at,
      source_rows.updated_at,
      source_rows.kategori_id,
      source_rows.hesap_id,
      source_rows.hedef_hesap_id,
      source_rows.cari_id,
      source_rows.personel_id,
      source_rows.source_modules,
      source_rows.selected_leg
    FROM source_rows
    UNION ALL
    SELECT
      target_rows.id,
      target_rows.isletme_id,
      target_rows.type,
      target_rows.amount,
      target_rows.description,
      target_rows.date,
      target_rows.source_currency,
      target_rows.target_currency,
      target_rows.exchange_rate,
      target_rows.vade_tarihi,
      target_rows.photo_path,
      target_rows.created_by,
      target_rows.created_at,
      target_rows.updated_at,
      target_rows.kategori_id,
      target_rows.hesap_id,
      target_rows.hedef_hesap_id,
      target_rows.cari_id,
      target_rows.personel_id,
      target_rows.source_modules,
      target_rows.selected_leg
    FROM target_rows
  )
  SELECT
    candidate.id,
    candidate.type::text,
    candidate.amount,
    candidate.description,
    candidate.date,
    candidate.source_currency,
    candidate.target_currency,
    candidate.exchange_rate,
    candidate.vade_tarihi,
    CASE
      -- Storage pointeri yalniz bu tenant + bu islem icin uygulamanin
      -- uretebildigi kanonik webp anahtariysa disari cikar. Tarihsel/bozuk veya
      -- baska entity'ye bagli bir pointer signed-url yan yoluna tasinmaz.
      WHEN internal.islem_kaynagi_okunabilir_v1(
             candidate.isletme_id,
             candidate.type::text
           )
       AND candidate.photo_path ~ (
        '^'
        || p_isletme_id::text
        || '/'
        || candidate.id::text
        || '_[0-9]{10,20}[.]webp$'
      )
      THEN candidate.photo_path
      ELSE NULL
    END AS photo_path,
    candidate.created_by,
    candidate.created_at,
    candidate.updated_at,
    kategori.name::text AS kategori_name,
    source_account.name::text AS source_account_name,
    target_account.name::text AS target_account_name,
    CASE
      WHEN candidate.type = 'transfer'
           AND candidate.selected_leg = 'target'
        THEN 'source_account'::text
      WHEN candidate.type = 'transfer'
        THEN 'target_account'::text
      WHEN candidate.source_modules = ARRAY['cariler']::text[]
        THEN 'cari'::text
      WHEN candidate.source_modules IN (
        ARRAY['personel']::text[],
        ARRAY['personel', 'hesaplar']::text[]
      )
        THEN 'personel'::text
      ELSE NULL::text
    END AS counterparty_kind,
    CASE
      WHEN candidate.type = 'transfer'
           AND candidate.selected_leg = 'target'
        THEN source_account.name::text
      WHEN candidate.type = 'transfer'
        THEN target_account.name::text
      WHEN candidate.source_modules = ARRAY['cariler']::text[]
        THEN cari.name::text
      WHEN candidate.source_modules IN (
        ARRAY['personel']::text[],
        ARRAY['personel', 'hesaplar']::text[]
      )
        THEN NULLIF(
          pg_catalog.concat_ws(
            ' ',
            personel.first_name,
            personel.last_name
          ),
          ''
        )::text
      ELSE NULL::text
    END AS counterparty_name
  FROM candidate
  LEFT JOIN public.kategoriler AS kategori
    ON kategori.id = candidate.kategori_id
   AND kategori.isletme_id = candidate.isletme_id
  LEFT JOIN public.hesaplar AS source_account
    ON source_account.id = candidate.hesap_id
   AND source_account.isletme_id = candidate.isletme_id
   AND (
     v_is_owner IS TRUE
     OR (
       (
         source_account.type <> 'birikim'
         OR v_can_view_birikim IS TRUE
       )
       AND (
         v_can_see_archived IS TRUE
         OR source_account.is_archived IS FALSE
       )
       AND (
         v_can_see_passive IS TRUE
         OR source_account.is_active IS TRUE
       )
     )
   )
  LEFT JOIN public.hesaplar AS target_account
    ON target_account.id = candidate.hedef_hesap_id
   AND target_account.isletme_id = candidate.isletme_id
   AND (
     v_is_owner IS TRUE
     OR (
       (
         target_account.type <> 'birikim'
         OR v_can_view_birikim IS TRUE
       )
       AND (
         v_can_see_archived IS TRUE
         OR target_account.is_archived IS FALSE
       )
       AND (
         v_can_see_passive IS TRUE
         OR target_account.is_active IS TRUE
       )
     )
   )
  LEFT JOIN public.cariler AS cari
    ON cari.id = candidate.cari_id
   AND cari.isletme_id = candidate.isletme_id
   AND (v_is_owner IS TRUE OR cari.is_active IS TRUE)
  LEFT JOIN public.personel AS personel
    ON personel.id = candidate.personel_id
   AND personel.isletme_id = candidate.isletme_id
   AND (v_is_owner IS TRUE OR personel.is_active IS TRUE)
  ORDER BY
    candidate.date DESC,
    candidate.created_at DESC,
    candidate.id DESC
  LIMIT p_limit;
END;
$function$;

ALTER FUNCTION public.get_hesap_islem_satirlari_v1(
  uuid, uuid, integer, timestamp without time zone,
  timestamp with time zone, uuid
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_hesap_islem_satirlari_v1(
  uuid, uuid, integer, timestamp without time zone,
  timestamp with time zone, uuid
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_hesap_islem_satirlari_v1(
  uuid, uuid, integer, timestamp without time zone,
  timestamp with time zone, uuid
)
TO authenticated;


-- ---------------------------------------------------------------------------
-- SECURITY CLOSURE A: exact source mutation + legacy compatibility wrappers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.get_islem_mutation_row_v1(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_action text,
  p_lock boolean
)
RETURNS public.islemler
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row public.islemler;
  v_source_modules text[];
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
BEGIN
  IF auth.uid() IS NULL
     OR p_isletme_id IS NULL
     OR p_islem_id IS NULL
     OR p_action NOT IN ('update', 'delete') THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF p_lock THEN
    SELECT transaction_row.*
    INTO v_row
    FROM public.islemler AS transaction_row
    WHERE transaction_row.id = p_islem_id
      AND transaction_row.isletme_id = p_isletme_id
    FOR UPDATE;
  ELSE
    SELECT transaction_row.*
    INTO v_row
    FROM public.islemler AS transaction_row
    WHERE transaction_row.id = p_islem_id
      AND transaction_row.isletme_id = p_isletme_id;
  END IF;

  v_source_modules := internal.islem_tipi_modulu(v_row.type::text);

  IF NOT FOUND
     OR v_source_modules IS NULL
     OR NOT internal.islem_mutasyon_izni_v2(
       p_isletme_id,
       v_row.type::text,
       v_row.created_by,
       p_action,
       p_islem_id
     ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  -- Passive source entities are owner-only. Archived-but-active entities stay
  -- readable, but an archived linked product cannot receive a shared stock
  -- mutation; archive/unarchive itself remains an entity edit-scope action.
  IF NOT v_is_owner AND (
    (
      v_row.hesap_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.hesaplar AS account
        WHERE account.id = v_row.hesap_id
          AND account.isletme_id = p_isletme_id
          AND account.is_active IS TRUE
      )
    )
    OR (
      v_row.hedef_hesap_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.hesaplar AS account
        WHERE account.id = v_row.hedef_hesap_id
          AND account.isletme_id = p_isletme_id
          AND account.is_active IS TRUE
      )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.hesaplar AS account
        WHERE account.isletme_id = p_isletme_id
          AND account.id IN (v_row.hesap_id, v_row.hedef_hesap_id)
          AND account.type::text = 'birikim'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM internal.etkin_yetki_v2(
          p_isletme_id, 'birikim'
        ) AS savings_permission
        WHERE savings_permission.can_view IS TRUE
      )
    )
    OR (
      v_row.cari_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.cariler AS customer
        WHERE customer.id = v_row.cari_id
          AND customer.isletme_id = p_isletme_id
          AND customer.is_active IS TRUE
      )
    )
    OR (
      v_row.cari_id IS NOT NULL
      AND v_row.type::text NOT IN (
        'cari_alis',
        'cari_satis',
        'cari_alis_iade',
        'cari_satis_iade',
        'cari_odeme',
        'cari_tahsilat'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM internal.etkin_yetki_v2(
          p_isletme_id, 'cariler'
        ) AS customer_permission
        WHERE customer_permission.can_view IS TRUE
      )
    )
    OR (
      v_row.personel_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.personel AS employee
        WHERE employee.id = v_row.personel_id
          AND employee.isletme_id = p_isletme_id
          AND employee.is_active IS TRUE
      )
    )
    OR (
      v_row.personel_id IS NOT NULL
      AND v_row.type::text NOT IN (
        'personel_gider',
        'personel_satis',
        'personel_izin_hakki',
        'personel_izin_kullanimi',
        'personel_odeme',
        'personel_tahsilat'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM internal.etkin_yetki_v2(
          p_isletme_id, 'personel'
        ) AS personnel_permission
        WHERE personnel_permission.can_view IS TRUE
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.urun_hareketler AS movement
      LEFT JOIN public.urunler AS product
        ON product.id = movement.urun_id
       AND product.isletme_id = movement.isletme_id
      WHERE movement.isletme_id = p_isletme_id
        AND movement.islem_id = p_islem_id
        AND (
          product.id IS NULL
          OR product.is_active IS NOT TRUE
          OR product.is_archived IS TRUE
        )
    )
  ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_row;
END;
$function$;

ALTER FUNCTION internal.get_islem_mutation_row_v1(
  uuid, uuid, text, boolean
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.get_islem_mutation_row_v1(
  uuid, uuid, text, boolean
)
FROM PUBLIC, anon, authenticated, service_role;


CREATE FUNCTION internal.enforce_islem_source_mutation_v2()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_opened_movement_delete_context boolean := false;
BEGIN
  -- Trusted background/service operations have no end-user JWT. Every API call
  -- made by anon/authenticated has auth.uid() and is checked below.
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Deleting the tenant root cascades to islemler after public.isletmeler is
  -- already absent. It is not a standalone financial mutation and must not
  -- require an action-context row that cannot exist for the root cascade.
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1
    FROM public.isletmeler AS business
    WHERE business.id = OLD.isletme_id
  ) THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.isletme_id IS NULL
       OR NEW.created_by IS DISTINCT FROM auth.uid()
       OR NOT internal.islem_mutasyon_izni_v2(
         NEW.isletme_id,
         NEW.type::text,
         NEW.created_by,
         'create',
         NEW.id
       ) THEN
      RAISE EXCEPTION 'ISLEM_SOURCE_MUTATION_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;

    IF NOT internal.isletme_sahibi_v1(NEW.isletme_id)
       AND NOT EXISTS (
         SELECT 1
         FROM internal.permission_v2_movement_action_context AS action_context
         WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
           AND action_context.transaction_id = pg_catalog.txid_current()
           AND action_context.actor_user_id = auth.uid()
           AND action_context.isletme_id = NEW.isletme_id
           AND action_context.islem_id = NEW.id
           AND action_context.action = 'create'
       ) THEN
      RAISE EXCEPTION 'ISLEM_CANONICAL_RPC_REQUIRED'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Legacy create motoru finansal satiri once V2 ile kurup yalniz foto ve
    -- ileri-tarihli kaynak pointer'ini ayni atomik cagrida baglar. Add-only
    -- kullanicinin bu create metadata adimi update yetkisine donusturulmez.
    -- Dogrudan istemci UPDATE'i yine tablo RLS'i tarafindan engellenir.
    IF (NEW.id, NEW.isletme_id, NEW.created_by)
         IS NOT DISTINCT FROM (OLD.id, OLD.isletme_id, OLD.created_by)
       AND OLD.created_by = auth.uid()
       AND (
         pg_catalog.to_jsonb(NEW)
           - ARRAY[
             'photo_path', 'source_ileri_id', 'updated_at', 'updated_by'
           ]::text[]
       ) = (
         pg_catalog.to_jsonb(OLD)
           - ARRAY[
             'photo_path', 'source_ileri_id', 'updated_at', 'updated_by'
           ]::text[]
       )
       AND (
         NEW.photo_path IS NULL
         OR NEW.photo_path ~ (
           '^'
           || NEW.isletme_id::text
           || '/'
           || NEW.id::text
           || '_[0-9]{10,20}[.]webp$'
         )
       )
       AND internal.islem_mutasyon_izni_v2(
         NEW.isletme_id,
         NEW.type::text,
         NEW.created_by,
         'create',
         NEW.id
       )
       AND EXISTS (
         SELECT 1
         FROM internal.permission_v2_movement_action_context AS action_context
         WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
           AND action_context.transaction_id = pg_catalog.txid_current()
           AND action_context.actor_user_id = auth.uid()
           AND action_context.isletme_id = NEW.isletme_id
           AND action_context.islem_id = NEW.id
           AND action_context.action = 'create'
       )
       AND (
         NEW.source_ileri_id IS NULL
         OR (
           NEW.source_ileri_id = NEW.id
           AND EXISTS (
             SELECT 1
             FROM public.ileri_tarihli_islemler AS scheduled
             WHERE scheduled.id = NEW.source_ileri_id
               AND scheduled.isletme_id = NEW.isletme_id
               AND scheduled.type::text = NEW.type::text
               AND internal.islem_mutasyon_izni_v2(
                 scheduled.isletme_id,
                 scheduled.type::text,
                 scheduled.created_by,
                 'update',
                 NULL
               )
           )
         )
       ) THEN
      RETURN NEW;
    END IF;

    -- Eski update wrapper'inin yalniz kanonik fotograf pointer'ini degistiren
    -- yolu finansal payloada/bakiyeye dokunmaz. Yine de direct REST ile taklit
    -- edilememesi icin private transaction context'i zorunludur.
    IF (NEW.id, NEW.isletme_id, NEW.created_by, NEW.source_ileri_id)
         IS NOT DISTINCT FROM (
           OLD.id, OLD.isletme_id, OLD.created_by, OLD.source_ileri_id
         )
       AND (
         pg_catalog.to_jsonb(NEW)
           - ARRAY['photo_path', 'updated_at', 'updated_by']::text[]
       ) = (
         pg_catalog.to_jsonb(OLD)
           - ARRAY['photo_path', 'updated_at', 'updated_by']::text[]
       )
       AND (
         NEW.photo_path IS NULL
         OR NEW.photo_path ~ (
           '^'
           || NEW.isletme_id::text
           || '/'
           || NEW.id::text
           || '_[0-9]{10,20}[.]webp$'
         )
       )
       AND internal.islem_mutasyon_izni_v2(
         OLD.isletme_id,
         OLD.type::text,
         OLD.created_by,
         'update',
         OLD.id
       )
       AND internal.islem_mutasyon_izni_v2(
         NEW.isletme_id,
         NEW.type::text,
         OLD.created_by,
         'update',
         OLD.id
       )
       AND EXISTS (
         SELECT 1
         FROM internal.permission_v2_movement_action_context AS action_context
         WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
           AND action_context.transaction_id = pg_catalog.txid_current()
           AND action_context.actor_user_id = auth.uid()
           AND action_context.isletme_id = NEW.isletme_id
           AND action_context.islem_id = NEW.id
           AND action_context.action = 'update'
       ) THEN
      RETURN NEW;
    END IF;

    IF (NEW.id, NEW.isletme_id, NEW.created_by)
       IS DISTINCT FROM (OLD.id, OLD.isletme_id, OLD.created_by)
       OR NOT internal.islem_mutasyon_izni_v2(
         OLD.isletme_id,
         OLD.type::text,
         OLD.created_by,
         'update',
         OLD.id
       )
       OR NOT internal.islem_mutasyon_izni_v2(
         NEW.isletme_id,
         NEW.type::text,
         OLD.created_by,
         'update',
         OLD.id
       ) THEN
      RAISE EXCEPTION 'ISLEM_SOURCE_MUTATION_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;

    IF NOT internal.isletme_sahibi_v1(OLD.isletme_id)
       AND NOT EXISTS (
         SELECT 1
         FROM internal.permission_v2_movement_action_context AS action_context
         WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
           AND action_context.transaction_id = pg_catalog.txid_current()
           AND action_context.actor_user_id = auth.uid()
           AND action_context.isletme_id = OLD.isletme_id
           AND action_context.islem_id = OLD.id
           AND action_context.action = 'update'
       ) THEN
      RAISE EXCEPTION 'ISLEM_CANONICAL_RPC_REQUIRED'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT internal.islem_mutasyon_izni_v2(
    OLD.isletme_id,
    OLD.type::text,
    OLD.created_by,
    'delete',
    OLD.id
  ) THEN
    RAISE EXCEPTION 'ISLEM_SOURCE_MUTATION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF NOT internal.isletme_sahibi_v1(OLD.isletme_id)
     AND NOT EXISTS (
       SELECT 1
       FROM internal.permission_v2_movement_action_context AS action_context
       WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
         AND action_context.transaction_id = pg_catalog.txid_current()
         AND action_context.actor_user_id = auth.uid()
         AND action_context.isletme_id = OLD.isletme_id
         AND action_context.islem_id = OLD.id
         AND action_context.action = 'delete'
     ) THEN
    RAISE EXCEPTION 'ISLEM_CANONICAL_RPC_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  -- 1.5.x owner transaction deletion reversed balances/stock first, then issued
  -- a raw linked-movement DELETE whose error was ignored, and finally deleted
  -- the transaction. Linked movement DELETE now requires canonical context for
  -- owners too, so clean up any surviving rows here, after every transaction
  -- permission/context gate passed. Never overwrite or remove caller context.
  IF EXISTS (
    SELECT 1
    FROM public.urun_hareketler AS movement_row
    WHERE movement_row.isletme_id = OLD.isletme_id
      AND movement_row.islem_id = OLD.id
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM internal.permission_v2_movement_action_context AS action_context
      WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
        AND action_context.transaction_id = pg_catalog.txid_current()
        AND action_context.actor_user_id = auth.uid()
        AND action_context.isletme_id = OLD.isletme_id
        AND action_context.islem_id = OLD.id
    ) THEN
      IF NOT EXISTS (
        SELECT 1
        FROM internal.permission_v2_movement_action_context AS action_context
        WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
          AND action_context.transaction_id = pg_catalog.txid_current()
          AND action_context.actor_user_id = auth.uid()
          AND action_context.isletme_id = OLD.isletme_id
          AND action_context.islem_id = OLD.id
          AND action_context.action = 'delete'
      ) THEN
        RAISE EXCEPTION 'ISLEM_CANONICAL_RPC_REQUIRED'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      INSERT INTO internal.permission_v2_movement_action_context (
        backend_pid,
        transaction_id,
        actor_user_id,
        isletme_id,
        islem_id,
        action
      )
      VALUES (
        pg_catalog.pg_backend_pid(),
        pg_catalog.txid_current(),
        auth.uid(),
        OLD.isletme_id,
        OLD.id,
        'delete'
      );
      v_opened_movement_delete_context := true;
    END IF;

    DELETE FROM public.urun_hareketler AS movement_row
    WHERE movement_row.isletme_id = OLD.isletme_id
      AND movement_row.islem_id = OLD.id;

    IF v_opened_movement_delete_context THEN
      DELETE FROM internal.permission_v2_movement_action_context AS action_context
      WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
        AND action_context.transaction_id = pg_catalog.txid_current()
        AND action_context.actor_user_id = auth.uid()
        AND action_context.isletme_id = OLD.isletme_id
        AND action_context.islem_id = OLD.id
        AND action_context.action = 'delete';
    END IF;
  END IF;

  RETURN OLD;
END;
$function$;

ALTER FUNCTION internal.enforce_islem_source_mutation_v2()
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.enforce_islem_source_mutation_v2()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER zz_permission_v2_islem_source_guard
BEFORE INSERT OR UPDATE OR DELETE
ON public.islemler
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_islem_source_mutation_v2();

-- ---------------------------------------------------------------------------
-- 11) IMPORT UNDO: keep the public v1 contract, but reverse linked stock too.
--
-- A transaction imported without products can later be edited into a
-- product-bearing transaction. The previous owner-only undo RPC reversed
-- account/customer/personnel balances and then deleted public.islemler, but it
-- did not reverse urun_hareketler. The source guard above now removes remaining
-- linked movements during that DELETE; without this explicit stock reversal
-- the ledger cleanup would otherwise leave product.miktar overstated.
--
-- All target transactions, their linked movement rows and referenced products
-- are locked before the first write. Product locks use UUID order and the
-- distinct expected/found count is checked. A failure rolls back every balance,
-- stock, movement and transaction mutation in the RPC transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_import_batch(
  p_transaction_ids uuid[]
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  deleted_count integer;
  v_isletme_id uuid;
  v_input_count integer;
  v_distinct_in integer;
  v_locked_count integer;
  v_expected_product_count integer;
  v_locked_product_count integer;
  v_updated_product_count integer;
  v_inserted_context_count integer;
  v_deleted_context_count integer;
  c_max_batch CONSTANT integer := 50000;
BEGIN
  -- Preserve the established input, owner, tenant and maximum-batch contract.
  IF p_transaction_ids IS NULL
     OR pg_catalog.cardinality(p_transaction_ids) = 0 THEN
    RAISE EXCEPTION 'undo_import_batch: islem listesi bos'
      USING ERRCODE = '22023';
  END IF;

  v_input_count := pg_catalog.cardinality(p_transaction_ids);
  IF v_input_count > c_max_batch THEN
    RAISE EXCEPTION 'undo_import_batch: cok fazla islem (% adet, tavan %)',
      v_input_count, c_max_batch
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(p_transaction_ids) AS input_id(id)
    WHERE input_id.id IS NULL
  ) THEN
    RAISE EXCEPTION 'undo_import_batch: listede NULL kimlik var'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.count(DISTINCT input_id.id)
  INTO v_distinct_in
  FROM pg_catalog.unnest(p_transaction_ids) AS input_id(id);

  IF v_distinct_in <> v_input_count THEN
    RAISE EXCEPTION 'undo_import_batch: listede yinelenen kimlik var'
      USING ERRCODE = '22023';
  END IF;

  SELECT transaction_row.isletme_id
  INTO v_isletme_id
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = p_transaction_ids[1];

  IF v_isletme_id IS NULL THEN
    RAISE EXCEPTION 'undo_import_batch: bu islem icin yetkiniz yok'
      USING ERRCODE = '42501';
  END IF;

  PERFORM business.id
  FROM public.isletmeler AS business
  WHERE business.id = v_isletme_id
    AND business.user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'undo_import_batch: bu islem icin yetkiniz yok'
      USING ERRCODE = '42501';
  END IF;

  PERFORM transaction_row.id
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = ANY(p_transaction_ids)
    AND transaction_row.isletme_id = v_isletme_id
  ORDER BY transaction_row.id
  FOR UPDATE;
  GET DIAGNOSTICS v_locked_count = ROW_COUNT;

  IF v_locked_count <> v_input_count THEN
    RAISE EXCEPTION
      'undo_import_batch: islem listesi gecersiz veya farkli isletmeye ait (istenen %, kilitlenen %)',
      v_input_count,
      v_locked_count
      USING ERRCODE = '22023';
  END IF;

  -- Stabilize the exact movement snapshot before deriving the stock reversal.
  PERFORM movement.id
  FROM public.urun_hareketler AS movement
  WHERE movement.isletme_id = v_isletme_id
    AND movement.islem_id = ANY(p_transaction_ids)
  ORDER BY movement.urun_id, movement.id
  FOR UPDATE;

  SELECT pg_catalog.count(DISTINCT movement.urun_id)
  INTO v_expected_product_count
  FROM public.urun_hareketler AS movement
  WHERE movement.isletme_id = v_isletme_id
    AND movement.islem_id = ANY(p_transaction_ids);

  SELECT pg_catalog.count(*)
  INTO v_locked_product_count
  FROM (
    SELECT product.id
    FROM public.urunler AS product
    WHERE product.isletme_id = v_isletme_id
      AND product.id IN (
        SELECT DISTINCT movement.urun_id
        FROM public.urun_hareketler AS movement
        WHERE movement.isletme_id = v_isletme_id
          AND movement.islem_id = ANY(p_transaction_ids)
      )
    ORDER BY product.id
    FOR UPDATE
  ) AS locked_products;

  IF v_locked_product_count <> v_expected_product_count THEN
    RAISE EXCEPTION
      'undo_import_batch: urun hareketi hedefi eksik (beklenen %, bulunan %)',
      v_expected_product_count,
      v_locked_product_count
      USING ERRCODE = '23503';
  END IF;

  -- Existing H/C/P reversal mathematics is intentionally unchanged.
  UPDATE public.hesaplar AS account
  SET balance = account.balance + aggregate_delta.delta,
      updated_at = pg_catalog.now()
  FROM (
    SELECT source.entity_id, pg_catalog.sum(source.delta) AS delta
    FROM (
      SELECT transaction_row.hesap_id AS entity_id,
        CASE
          WHEN transaction_row.type IN (
            'gelir', 'cari_tahsilat', 'personel_tahsilat'
          ) THEN -transaction_row.amount
          WHEN transaction_row.type IN (
            'gider', 'cari_odeme', 'personel_odeme'
          ) THEN transaction_row.amount
          WHEN transaction_row.type = 'transfer'
            THEN transaction_row.amount
          ELSE 0
        END AS delta
      FROM public.islemler AS transaction_row
      WHERE transaction_row.id = ANY(p_transaction_ids)
        AND transaction_row.isletme_id = v_isletme_id
        AND transaction_row.hesap_id IS NOT NULL

      UNION ALL

      SELECT transaction_row.hedef_hesap_id AS entity_id,
        -(CASE
          WHEN transaction_row.source_currency IS NOT NULL
               AND transaction_row.target_currency IS NOT NULL
               AND transaction_row.source_currency
                   <> transaction_row.target_currency
               AND transaction_row.exchange_rate IS NOT NULL
               AND transaction_row.exchange_rate > 0 THEN
            CASE
              WHEN transaction_row.source_currency = 'TRY'
                THEN transaction_row.amount / transaction_row.exchange_rate
              ELSE transaction_row.amount * transaction_row.exchange_rate
            END
          ELSE transaction_row.amount
        END) AS delta
      FROM public.islemler AS transaction_row
      WHERE transaction_row.id = ANY(p_transaction_ids)
        AND transaction_row.isletme_id = v_isletme_id
        AND transaction_row.type = 'transfer'
        AND transaction_row.hedef_hesap_id IS NOT NULL
    ) AS source
    GROUP BY source.entity_id
  ) AS aggregate_delta
  WHERE account.id = aggregate_delta.entity_id
    AND account.isletme_id = v_isletme_id;

  UPDATE public.cariler AS customer
  SET balance = customer.balance + aggregate_delta.delta,
      updated_at = pg_catalog.now()
  FROM (
    SELECT
      transaction_row.cari_id AS entity_id,
      pg_catalog.sum(
        CASE
          WHEN transaction_row.type IN (
            'cari_satis', 'cari_alis_iade'
          ) THEN -transaction_row.amount
          WHEN transaction_row.type IN (
            'cari_alis', 'cari_satis_iade'
          ) THEN transaction_row.amount
          WHEN transaction_row.type = 'cari_odeme' THEN
            -(CASE
              WHEN transaction_row.source_currency IS NOT NULL
                   AND transaction_row.target_currency IS NOT NULL
                   AND transaction_row.source_currency
                       <> transaction_row.target_currency
                   AND transaction_row.exchange_rate IS NOT NULL
                   AND transaction_row.exchange_rate > 0 THEN
                CASE
                  WHEN transaction_row.source_currency = 'TRY'
                    THEN transaction_row.amount
                         / transaction_row.exchange_rate
                  ELSE transaction_row.amount
                       * transaction_row.exchange_rate
                END
              ELSE transaction_row.amount
            END)
          WHEN transaction_row.type = 'cari_tahsilat' THEN
            CASE
              WHEN transaction_row.source_currency IS NOT NULL
                   AND transaction_row.target_currency IS NOT NULL
                   AND transaction_row.source_currency
                       <> transaction_row.target_currency
                   AND transaction_row.exchange_rate IS NOT NULL
                   AND transaction_row.exchange_rate > 0 THEN
                CASE
                  WHEN transaction_row.source_currency = 'TRY'
                    THEN transaction_row.amount
                         / transaction_row.exchange_rate
                  ELSE transaction_row.amount
                       * transaction_row.exchange_rate
                END
              ELSE transaction_row.amount
            END
          ELSE 0
        END
      ) AS delta
    FROM public.islemler AS transaction_row
    WHERE transaction_row.id = ANY(p_transaction_ids)
      AND transaction_row.isletme_id = v_isletme_id
      AND transaction_row.cari_id IS NOT NULL
    GROUP BY transaction_row.cari_id
  ) AS aggregate_delta
  WHERE customer.id = aggregate_delta.entity_id
    AND customer.isletme_id = v_isletme_id;

  UPDATE public.personel AS employee
  SET balance = employee.balance + aggregate_delta.delta,
      updated_at = pg_catalog.now()
  FROM (
    SELECT
      transaction_row.personel_id AS entity_id,
      pg_catalog.sum(
        CASE
          WHEN transaction_row.type = 'personel_gider'
            THEN transaction_row.amount
          WHEN transaction_row.type = 'personel_satis'
            THEN -transaction_row.amount
          WHEN transaction_row.type = 'personel_odeme' THEN
            -(CASE
              WHEN transaction_row.source_currency IS NOT NULL
                   AND transaction_row.target_currency IS NOT NULL
                   AND transaction_row.source_currency
                       <> transaction_row.target_currency
                   AND transaction_row.exchange_rate IS NOT NULL
                   AND transaction_row.exchange_rate > 0 THEN
                CASE
                  WHEN transaction_row.source_currency = 'TRY'
                    THEN transaction_row.amount
                         / transaction_row.exchange_rate
                  ELSE transaction_row.amount
                       * transaction_row.exchange_rate
                END
              ELSE transaction_row.amount
            END)
          WHEN transaction_row.type = 'personel_tahsilat' THEN
            CASE
              WHEN transaction_row.source_currency IS NOT NULL
                   AND transaction_row.target_currency IS NOT NULL
                   AND transaction_row.source_currency
                       <> transaction_row.target_currency
                   AND transaction_row.exchange_rate IS NOT NULL
                   AND transaction_row.exchange_rate > 0 THEN
                CASE
                  WHEN transaction_row.source_currency = 'TRY'
                    THEN transaction_row.amount
                         / transaction_row.exchange_rate
                  ELSE transaction_row.amount
                       * transaction_row.exchange_rate
                END
              ELSE transaction_row.amount
            END
          ELSE 0
        END
      ) AS delta
    FROM public.islemler AS transaction_row
    WHERE transaction_row.id = ANY(p_transaction_ids)
      AND transaction_row.isletme_id = v_isletme_id
      AND transaction_row.personel_id IS NOT NULL
    GROUP BY transaction_row.personel_id
  ) AS aggregate_delta
  WHERE employee.id = aggregate_delta.entity_id
    AND employee.isletme_id = v_isletme_id;

  -- Same reversal sign as internal.delete_islem_canonical_v2:
  -- giris -> -abs, cikis -> +abs, duzeltme -> -miktar.
  UPDATE public.urunler AS product
  SET miktar = COALESCE(product.miktar, 0) + stock_delta.delta,
      updated_at = pg_catalog.clock_timestamp()
  FROM (
    SELECT
      movement.urun_id,
      pg_catalog.sum(
        CASE movement.hareket_tipi
          WHEN 'giris'
            THEN -pg_catalog.abs(COALESCE(movement.miktar, 0))
          WHEN 'cikis'
            THEN pg_catalog.abs(COALESCE(movement.miktar, 0))
          ELSE -COALESCE(movement.miktar, 0)
        END
      ) AS delta
    FROM public.urun_hareketler AS movement
    WHERE movement.isletme_id = v_isletme_id
      AND movement.islem_id = ANY(p_transaction_ids)
    GROUP BY movement.urun_id
  ) AS stock_delta
  WHERE product.id = stock_delta.urun_id
    AND product.isletme_id = v_isletme_id;
  GET DIAGNOSTICS v_updated_product_count = ROW_COUNT;

  IF v_updated_product_count <> v_expected_product_count THEN
    RAISE EXCEPTION
      'undo_import_batch: urun stogu eksik guncellendi (beklenen %, guncellenen %)',
      v_expected_product_count,
      v_updated_product_count
      USING ERRCODE = '23503';
  END IF;

  -- Mark every target as already stock-reversed. The source guard must not
  -- open/own these caller contexts; it only removes linked movements and leaves
  -- the exact rows for this function to clean after the bulk DELETE. Existing
  -- contexts are never overwritten or deleted.
  IF EXISTS (
    SELECT 1
    FROM internal.permission_v2_movement_action_context AS action_context
    WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
      AND action_context.transaction_id = pg_catalog.txid_current()
      AND action_context.actor_user_id = auth.uid()
      AND action_context.isletme_id = v_isletme_id
      AND action_context.islem_id = ANY(p_transaction_ids)
  ) THEN
    RAISE EXCEPTION 'undo_import_batch: beklenmeyen hareket baglami'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO internal.permission_v2_movement_action_context (
    backend_pid,
    transaction_id,
    actor_user_id,
    isletme_id,
    islem_id,
    action
  )
  SELECT
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current(),
    auth.uid(),
    transaction_row.isletme_id,
    transaction_row.id,
    'delete'
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = ANY(p_transaction_ids)
    AND transaction_row.isletme_id = v_isletme_id
  ORDER BY transaction_row.id;
  GET DIAGNOSTICS v_inserted_context_count = ROW_COUNT;

  IF v_inserted_context_count <> v_input_count THEN
    RAISE EXCEPTION
      'undo_import_batch: hareket baglami eksik acildi (beklenen %, acilan %)',
      v_input_count,
      v_inserted_context_count
      USING ERRCODE = '55000';
  END IF;

  DELETE FROM public.islemler AS transaction_row
  WHERE transaction_row.id = ANY(p_transaction_ids)
    AND transaction_row.isletme_id = v_isletme_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count <> v_input_count THEN
    RAISE EXCEPTION
      'undo_import_batch: islem silme eksik kaldi (beklenen %, silinen %)',
      v_input_count,
      deleted_count
      USING ERRCODE = '55000';
  END IF;

  DELETE FROM internal.permission_v2_movement_action_context AS action_context
  WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
    AND action_context.transaction_id = pg_catalog.txid_current()
    AND action_context.actor_user_id = auth.uid()
    AND action_context.isletme_id = v_isletme_id
    AND action_context.islem_id = ANY(p_transaction_ids)
    AND action_context.action = 'delete';
  GET DIAGNOSTICS v_deleted_context_count = ROW_COUNT;

  IF v_deleted_context_count <> v_input_count THEN
    RAISE EXCEPTION
      'undo_import_batch: hareket baglami eksik temizlendi (beklenen %, silinen %)',
      v_input_count,
      v_deleted_context_count
      USING ERRCODE = '55000';
  END IF;

  RETURN pg_catalog.json_build_object(
    'deleted_transactions',
    deleted_count
  );
END;
$function$;

ALTER FUNCTION public.undo_import_batch(uuid[])
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.undo_import_batch(uuid[])
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.undo_import_batch(uuid[])
TO authenticated;

-- 1.5.x uyumluluk notu:
-- * Owner'in eski direct-table + increment_balance yolu calismaya devam eder.
-- * Eski ortak kullanici direct finansal DML yaparsa satir yazilmadan atomik
--   42501 alir; boylece owner-only increment_balance sonrasi yari-commit olmaz.
-- * Eski public create/update/delete ve Cariler-only RPC imzalari yukarida
--   korunup canonical V2 motora yonlendirildigi icin RPC kullanan eski client
--   veri kaybetmeden calismaya devam eder.
-- * Owner'in eski manuel stok delta + hareket yolu korunur. Shared 1.5.x
--   manuel stok yazimi update_urun_miktar icindeki owner guardinda, ilk
--   UPDATE'ten once 42501 alir; modern shared client atomik V2 hareket RPC'lerini
--   kullanir ve urun miktariyla hareket satirini tek transaction'da tutar.
-- * Owner 1.5.x kalici urun silmede linked hareketi raw silmeye calisirsa private
--   context olmadigi icin 42501 alir ve urun silmeye gecmez. Eski islem silme
--   ayni hareket hatasini yutsa da final islem DELETE source guard'i, istemcinin
--   daha once tersledigi stok/bakiye icin kalan hareketleri delete-context icinde
--   temizler. Modern canonical delete hareketleri once sildigi icin bu yol no-op'tur.
--   Owner-only update_urun_miktar canlida yayinlanmis legacy semantigi korur:
--   same-tenant urun pasif/arsivli olsa da delta uygulanir. Source guard stok
--   yazmaz; yalniz kalan hareketi temizler. Ag hatasi, clientin RPC sonucunu
--   yok saymasi ve istekler arasi yaris eski cok-istekli protokolun mevcut
--   siniridir; modern canonical RPC'ler tek transaction'dir.
-- * Eski import-undo imzasi ve JSON anahtari korunur. Sonradan urunlu hale gelen
--   hedeflerde hareket+urun satirlari kilitlenir, stok canonical isaretle toplu
--   terslenir ve final islem DELETE source guard cleanup'i ile ayni transaction'da
--   tamamlanir; herhangi bir hata tum bakiye/stok/silme yazilarini geri alir.
-- * Shared eski client guvenli urun metadata kolonlarini duzenleyebilir. Direct
--   miktar PATCH'i ve NULL/nonzero miktarli INSERT'i reddedilir; sifir/default
--   miktarli INSERT + atomik hareket RPC'si modern uyumluluk yoludur.


CREATE OR REPLACE FUNCTION public.delete_islem_atomik_v2(
  p_isletme_id uuid,
  p_islem_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old public.islemler;
BEGIN
  v_old := internal.get_islem_mutation_row_v1(
    p_isletme_id,
    p_islem_id,
    'delete',
    true
  );

  RETURN internal.delete_islem_canonical_v2(
    p_isletme_id, p_islem_id
  );
END;
$function$;

ALTER FUNCTION public.delete_islem_atomik_v2(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.delete_islem_atomik_v2(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.delete_islem_atomik_v2(uuid, uuid)
TO authenticated;


CREATE OR REPLACE FUNCTION public.create_islem_atomik(
  p_isletme_id uuid,
  p_new_row jsonb,
  p_balance_ops jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_payload jsonb;
  v_id uuid;
  v_photo_path text;
  v_source_ileri_id uuid;
  v_result jsonb;
BEGIN
  -- p_balance_ops is intentionally ignored. The V2 engine derives every
  -- balance leg from the locked entities and canonical transaction type.
  IF auth.uid() IS NULL
     OR p_isletme_id IS NULL
     OR p_new_row IS NULL
     OR pg_catalog.jsonb_typeof(p_new_row) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ISLEM_LEGACY_CREATE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  BEGIN
    v_id := COALESCE(
      NULLIF(p_new_row->>'id', '')::uuid,
      extensions.gen_random_uuid()
    );
    v_source_ileri_id := NULLIF(
      p_new_row->>'source_ileri_id', ''
    )::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'ISLEM_LEGACY_CREATE_INVALID_INPUT'
        USING ERRCODE = '22023';
  END;

  v_photo_path := NULLIF(p_new_row->>'photo_path', '');
  IF v_photo_path IS NOT NULL
     AND v_photo_path !~ (
       '^'
       || p_isletme_id::text
       || '/'
       || v_id::text
       || '_[0-9]{10,20}[.]webp$'
     ) THEN
    RAISE EXCEPTION 'ISLEM_LEGACY_CREATE_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  v_payload := p_new_row
    - ARRAY[
      'isletme_id',
      'created_by',
      'updated_by',
      'created_at',
      'updated_at'
    ]::text[];
  v_payload := pg_catalog.jsonb_set(
    v_payload,
    '{id}',
    pg_catalog.to_jsonb(v_id),
    true
  );
  v_payload := pg_catalog.jsonb_set(
    v_payload,
    '{photo_path}',
    'null'::jsonb,
    true
  );
  v_payload := pg_catalog.jsonb_set(
    v_payload,
    '{source_ileri_id}',
    'null'::jsonb,
    true
  );

  PERFORM public.create_islem_atomik_v2(
    p_isletme_id, v_payload
  );

  IF v_source_ileri_id IS NOT NULL THEN
    IF v_source_ileri_id IS DISTINCT FROM v_id
       OR NOT EXISTS (
         SELECT 1
         FROM public.ileri_tarihli_islemler AS scheduled
         WHERE scheduled.id = v_source_ileri_id
           AND scheduled.isletme_id = p_isletme_id
           AND internal.islem_mutasyon_izni_v2(
             p_isletme_id,
             scheduled.type::text,
             scheduled.created_by,
             'update',
             NULL
           )
       ) THEN
      RAISE EXCEPTION 'ISLEM_LEGACY_CREATE_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO internal.permission_v2_movement_action_context (
    backend_pid,
    transaction_id,
    actor_user_id,
    isletme_id,
    islem_id,
    action
  )
  VALUES (
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current(),
    auth.uid(),
    p_isletme_id,
    v_id,
    'create'
  )
  ON CONFLICT (
    backend_pid, transaction_id, actor_user_id, isletme_id, islem_id
  )
  DO UPDATE SET action = EXCLUDED.action;

  UPDATE public.islemler AS transaction_row
  SET photo_path = v_photo_path,
      source_ileri_id = v_source_ileri_id
  WHERE transaction_row.id = v_id
    AND transaction_row.isletme_id = p_isletme_id
    AND (
      transaction_row.photo_path IS DISTINCT FROM v_photo_path
      OR transaction_row.source_ileri_id
         IS DISTINCT FROM v_source_ileri_id
    );

  DELETE FROM internal.permission_v2_movement_action_context AS action_context
  WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
    AND action_context.transaction_id = pg_catalog.txid_current()
    AND action_context.actor_user_id = auth.uid()
    AND action_context.isletme_id = p_isletme_id
    AND action_context.islem_id = v_id
    AND action_context.action = 'create';

  SELECT pg_catalog.to_jsonb(transaction_row)
  INTO v_result
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = v_id
    AND transaction_row.isletme_id = p_isletme_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'ISLEM_LEGACY_CREATE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.create_islem_atomik(uuid, jsonb, jsonb)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.create_islem_atomik(uuid, jsonb, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.create_islem_atomik(uuid, jsonb, jsonb)
TO authenticated;


CREATE OR REPLACE FUNCTION public.create_islem_with_urun_atomik(
  p_isletme_id uuid,
  p_new_row jsonb,
  p_balance_ops jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
  v_islem_id uuid;
  v_type text;
BEGIN
  IF p_items IS NULL
     OR pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_items) < 1
     OR pg_catalog.jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'ISLEM_LEGACY_PRODUCT_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  v_result := public.create_islem_atomik(
    p_isletme_id,
    p_new_row,
    '[]'::jsonb
  );
  v_islem_id := (v_result->>'id')::uuid;
  v_type := v_result->>'type';

  -- The V3 private item engine validates product tenant, activity, duplicate
  -- products, expected movement direction and every finite numeric field.
  PERFORM internal.reapply_cari_urun_items_v3(
    p_isletme_id,
    v_islem_id,
    p_items,
    v_type,
    'create'
  );

  SELECT pg_catalog.to_jsonb(transaction_row)
  INTO v_result
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = v_islem_id
    AND transaction_row.isletme_id = p_isletme_id;
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.create_islem_with_urun_atomik(
  uuid, jsonb, jsonb, jsonb
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.create_islem_with_urun_atomik(
  uuid, jsonb, jsonb, jsonb
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.create_islem_with_urun_atomik(
  uuid, jsonb, jsonb, jsonb
)
TO authenticated;


CREATE OR REPLACE FUNCTION public.update_islem_atomik(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_balance_ops jsonb,
  p_new_row jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_patch jsonb;
  v_photo_path text;
  v_result jsonb;
BEGIN
  -- p_balance_ops is intentionally ignored.
  IF p_new_row IS NULL
     OR pg_catalog.jsonb_typeof(p_new_row) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ISLEM_LEGACY_UPDATE_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_object_agg(field.key, field.value),
    '{}'::jsonb
  )
  INTO v_patch
  FROM pg_catalog.jsonb_each(p_new_row) AS field(key, value)
  WHERE field.key IN (
    'type',
    'amount',
    'description',
    'date',
    'hesap_id',
    'hedef_hesap_id',
    'kategori_id',
    'cari_id',
    'personel_id',
    'source_currency',
    'target_currency',
    'exchange_rate',
    'date_end',
    'vade_tarihi'
  );

  IF v_patch <> '{}'::jsonb THEN
    PERFORM public.update_islem_atomik_v2(
      p_isletme_id,
      p_islem_id,
      v_patch
    );
  ELSE
    PERFORM internal.get_islem_mutation_row_v1(
      p_isletme_id,
      p_islem_id,
      'update',
      true
    );
  END IF;

  IF p_new_row ? 'photo_path' THEN
    v_photo_path := NULLIF(p_new_row->>'photo_path', '');
    IF v_photo_path IS NOT NULL
       AND v_photo_path !~ (
         '^'
         || p_isletme_id::text
         || '/'
         || p_islem_id::text
         || '_[0-9]{10,20}[.]webp$'
       ) THEN
      RAISE EXCEPTION 'ISLEM_LEGACY_UPDATE_INVALID_INPUT'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO internal.permission_v2_movement_action_context (
      backend_pid,
      transaction_id,
      actor_user_id,
      isletme_id,
      islem_id,
      action
    )
    VALUES (
      pg_catalog.pg_backend_pid(),
      pg_catalog.txid_current(),
      auth.uid(),
      p_isletme_id,
      p_islem_id,
      'update'
    )
    ON CONFLICT (
      backend_pid, transaction_id, actor_user_id, isletme_id, islem_id
    )
    DO UPDATE SET action = EXCLUDED.action;

    UPDATE public.islemler AS transaction_row
    SET photo_path = v_photo_path,
        updated_at = pg_catalog.clock_timestamp()
    WHERE transaction_row.id = p_islem_id
      AND transaction_row.isletme_id = p_isletme_id;

    DELETE FROM internal.permission_v2_movement_action_context
      AS action_context
    WHERE action_context.backend_pid = pg_catalog.pg_backend_pid()
      AND action_context.transaction_id = pg_catalog.txid_current()
      AND action_context.actor_user_id = auth.uid()
      AND action_context.isletme_id = p_isletme_id
      AND action_context.islem_id = p_islem_id
      AND action_context.action = 'update';
  END IF;

  SELECT pg_catalog.to_jsonb(transaction_row)
  INTO v_result
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = p_islem_id
    AND transaction_row.isletme_id = p_isletme_id;
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.update_islem_atomik(
  uuid, uuid, jsonb, jsonb
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.update_islem_atomik(
  uuid, uuid, jsonb, jsonb
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.update_islem_atomik(
  uuid, uuid, jsonb, jsonb
)
TO authenticated;


CREATE OR REPLACE FUNCTION public.delete_islem_atomik(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_balance_ops jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- p_balance_ops is intentionally ignored.
  PERFORM public.delete_islem_atomik_v2(
    p_isletme_id, p_islem_id
  );
END;
$function$;

ALTER FUNCTION public.delete_islem_atomik(
  uuid, uuid, jsonb
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.delete_islem_atomik(
  uuid, uuid, jsonb
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.delete_islem_atomik(
  uuid, uuid, jsonb
)
TO authenticated;


CREATE OR REPLACE FUNCTION public.increment_balance(
  table_name text,
  row_id uuid,
  amount numeric
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rowcount integer;
BEGIN
  IF auth.uid() IS NULL
     OR table_name NOT IN ('hesaplar', 'cariler', 'personel')
     OR row_id IS NULL
     OR amount IS NULL
     OR amount = 'NaN'::numeric
     OR amount = 'Infinity'::numeric
     OR amount = '-Infinity'::numeric
     OR pg_catalog.abs(amount) > 9999999999999.99 THEN
    RAISE EXCEPTION 'DIRECT_BALANCE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF table_name = 'hesaplar' THEN
    UPDATE public.hesaplar AS account
    SET balance = COALESCE(account.balance, 0) + amount,
        updated_at = pg_catalog.clock_timestamp()
    FROM public.isletmeler AS business
    WHERE account.id = row_id
      AND business.id = account.isletme_id
      AND business.user_id = auth.uid();
  ELSIF table_name = 'cariler' THEN
    UPDATE public.cariler AS customer
    SET balance = COALESCE(customer.balance, 0) + amount,
        updated_at = pg_catalog.clock_timestamp()
    FROM public.isletmeler AS business
    WHERE customer.id = row_id
      AND business.id = customer.isletme_id
      AND business.user_id = auth.uid();
  ELSE
    UPDATE public.personel AS employee
    SET balance = COALESCE(employee.balance, 0) + amount,
        updated_at = pg_catalog.clock_timestamp()
    FROM public.isletmeler AS business
    WHERE employee.id = row_id
      AND business.id = employee.isletme_id
      AND business.user_id = auth.uid();
  END IF;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount <> 1 THEN
    RAISE EXCEPTION 'DIRECT_BALANCE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

ALTER FUNCTION public.increment_balance(text, uuid, numeric)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.increment_balance(text, uuid, numeric)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.increment_balance(text, uuid, numeric)
TO authenticated;


CREATE OR REPLACE FUNCTION public.update_urun_miktar(
  p_urun_id uuid,
  p_miktar_degisim numeric,
  p_isletme_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_yeni_miktar numeric;
BEGIN
  IF auth.uid() IS NULL
     OR p_isletme_id IS NULL
     OR p_urun_id IS NULL
     OR p_miktar_degisim IS NULL
     OR p_miktar_degisim = 'NaN'::numeric
     OR p_miktar_degisim = 'Infinity'::numeric
     OR p_miktar_degisim = '-Infinity'::numeric
     OR pg_catalog.abs(p_miktar_degisim) > 999999999999.999
     -- Legacy two-request stock mutation is safe only for the owner. Shared
     -- clients must use create_urun_hareket_atomik_v2 so a failed movement
     -- insert can never leave this delta committed on its own.
     OR NOT internal.isletme_sahibi_v1(p_isletme_id)
     OR NOT internal.kayit_mutasyon_izni_v1(
       p_isletme_id,
       'urunler',
       auth.uid(),
       'create'
     ) THEN
    RAISE EXCEPTION 'PRODUCT_STOCK_DELTA_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.urunler AS product
  SET miktar = COALESCE(product.miktar, 0) + p_miktar_degisim,
      updated_at = pg_catalog.clock_timestamp()
  WHERE product.id = p_urun_id
    AND product.isletme_id = p_isletme_id
  RETURNING product.miktar INTO v_yeni_miktar;

  IF v_yeni_miktar IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_STOCK_DELTA_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_yeni_miktar;
END;
$function$;

ALTER FUNCTION public.update_urun_miktar(uuid, numeric, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.update_urun_miktar(uuid, numeric, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.update_urun_miktar(uuid, numeric, uuid)
TO authenticated;


-- The Nakit Avans feature is retired. Keeping the signatures prevents schema
-- drift for old metadata, while no API role may execute the unsafe engines.
REVOKE ALL
ON FUNCTION public.perform_nakit_avans(
  uuid, uuid, uuid, numeric, numeric, uuid, text,
  timestamp with time zone, boolean, integer
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL
ON FUNCTION public.perform_taksit_odeme(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL
ON FUNCTION public.delete_nakit_avans_with_reversal(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- SECURITY CLOSURE B: public links, quotas, short-code attempts and trigger ACL.
-- ---------------------------------------------------------------------------
CREATE FUNCTION internal.enforce_cari_statement_link_v2()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NEW.created_by IS DISTINCT FROM auth.uid()
     OR NOT EXISTS (
       SELECT 1
       FROM public.cariler AS customer
       WHERE customer.id = NEW.cari_id
         AND customer.isletme_id = NEW.isletme_id
         AND customer.is_active IS TRUE
     )
     OR NOT EXISTS (
       SELECT 1
       FROM internal.etkin_yetki_v2(
         NEW.isletme_id, 'cariler'
       ) AS permission
       WHERE permission.can_view IS TRUE
     ) THEN
    RAISE EXCEPTION 'EKSTRE_LINK_YETKISIZ'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION internal.enforce_cari_statement_link_v2()
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.enforce_cari_statement_link_v2()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER zz_permission_v2_cari_statement_link_guard
BEFORE INSERT
ON public.cari_ekstre_links
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_cari_statement_link_v2();

ALTER POLICY "cari_ekstre_links_select"
ON public.cari_ekstre_links
TO authenticated
USING (
  internal.isletme_sahibi_v1(cari_ekstre_links.isletme_id)
  OR (
    cari_ekstre_links.created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        cari_ekstre_links.isletme_id, 'cariler'
      ) AS permission
      WHERE permission.can_view IS TRUE
    )
    AND EXISTS (
      SELECT 1
      FROM public.cariler AS customer
      WHERE customer.id = cari_ekstre_links.cari_id
        AND customer.isletme_id = cari_ekstre_links.isletme_id
        AND customer.is_active IS TRUE
    )
  )
);

CREATE OR REPLACE FUNCTION public.ekstre_link_iptal(
  p_isletme_id uuid,
  p_cari_id uuid
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
  v_count integer;
BEGIN
  IF v_uid IS NULL
     OR p_isletme_id IS NULL
     OR p_cari_id IS NULL
     OR (
       NOT v_is_owner
       AND (
         NOT EXISTS (
           SELECT 1
           FROM internal.etkin_yetki_v2(
             p_isletme_id, 'cariler'
           ) AS permission
           WHERE permission.can_view IS TRUE
         )
         OR NOT EXISTS (
           SELECT 1
           FROM public.cariler AS customer
           WHERE customer.id = p_cari_id
             AND customer.isletme_id = p_isletme_id
             AND customer.is_active IS TRUE
         )
       )
     ) THEN
    RAISE EXCEPTION 'EKSTRE_LINK_YETKISIZ'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'public.cari_ekstre_links:business:' || p_isletme_id::text,
      0
    )
  );

  UPDATE public.cari_ekstre_links AS active_link
  SET revoked = true
  WHERE active_link.isletme_id = p_isletme_id
    AND active_link.cari_id = p_cari_id
    AND active_link.revoked IS FALSE
    AND (
      v_is_owner
      OR active_link.created_by = v_uid
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

ALTER FUNCTION public.ekstre_link_iptal(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.ekstre_link_iptal(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.ekstre_link_iptal(uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.cari_ekstre_token_dogrula_v1(
  p_token text
)
RETURNS TABLE (
  id uuid,
  isletme_id uuid,
  cari_id uuid,
  expires_at timestamp with time zone,
  revoked boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    link_row.id,
    link_row.isletme_id,
    link_row.cari_id,
    link_row.expires_at,
    link_row.revoked
  FROM public.cari_ekstre_links AS link_row
  WHERE p_token ~ '^[0-9a-f]{48}$'
    AND link_row.token = p_token
    AND link_row.created_by IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.cariler AS cari_row
      WHERE cari_row.id = link_row.cari_id
        AND cari_row.isletme_id = link_row.isletme_id
        AND (
          cari_row.is_active IS TRUE
          OR EXISTS (
            SELECT 1
            FROM public.isletmeler AS owner_business
            WHERE owner_business.id = link_row.isletme_id
              AND owner_business.user_id = link_row.created_by
          )
        )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.isletmeler AS owner_business
        WHERE owner_business.id = link_row.isletme_id
          AND owner_business.user_id = link_row.created_by
      )
      OR EXISTS (
        SELECT 1
        FROM public.isletme_users AS active_member
        WHERE active_member.isletme_id = link_row.isletme_id
          AND active_member.user_id = link_row.created_by
          AND internal.public_ekstre_cariler_uyeligi_izinli(
            active_member.status,
            active_member.permissions
          )
      )
    )
  LIMIT 1;
$function$;

ALTER FUNCTION public.cari_ekstre_token_dogrula_v1(text)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.cari_ekstre_token_dogrula_v1(text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.cari_ekstre_token_dogrula_v1(text)
TO service_role;


CREATE OR REPLACE FUNCTION public.record_api_usage(
  p_user_id uuid,
  p_function_name text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role'
     OR p_user_id IS NULL
     OR p_function_name IS NULL
     OR p_function_name !~ '^[A-Za-z0-9_.:-]{1,128}$' THEN
    RAISE EXCEPTION 'API_USAGE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.api_usage (user_id, function_name)
  VALUES (p_user_id, p_function_name);
END;
$function$;

ALTER FUNCTION public.record_api_usage(uuid, text)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.record_api_usage(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.record_api_usage(uuid, text)
TO service_role;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id uuid,
  p_function_name text,
  p_daily_limit integer DEFAULT 20
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role'
     OR p_user_id IS NULL
     OR p_function_name IS NULL
     OR p_function_name !~ '^[A-Za-z0-9_.:-]{1,128}$'
     OR p_daily_limit IS NULL
     OR p_daily_limit < 1
     OR p_daily_limit > 10000 THEN
    RAISE EXCEPTION 'API_USAGE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.api_usage AS usage_row
  WHERE usage_row.user_id = p_user_id
    AND usage_row.function_name = p_function_name
    AND usage_row.called_at >= public._today_start_tr();

  RETURN v_count < p_daily_limit;
END;
$function$;

ALTER FUNCTION public.check_rate_limit(uuid, text, integer)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.check_rate_limit(uuid, text, integer)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.check_rate_limit(uuid, text, integer)
TO service_role;

CREATE OR REPLACE FUNCTION public.get_remaining_usage(
  p_user_id uuid,
  p_function_name text,
  p_daily_limit integer DEFAULT 20
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_is_service boolean :=
    COALESCE(auth.jwt()->>'role', '') = 'service_role';
  v_count integer;
BEGIN
  IF p_user_id IS NULL
     OR p_function_name IS NULL
     OR p_function_name !~ '^[A-Za-z0-9_.:-]{1,128}$'
     OR p_daily_limit IS NULL
     OR p_daily_limit < 1
     OR p_daily_limit > 10000
     OR (
       NOT v_is_service
       AND (
         auth.uid() IS NULL
         OR p_user_id IS DISTINCT FROM auth.uid()
       )
     ) THEN
    RAISE EXCEPTION 'API_USAGE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.api_usage AS usage_row
  WHERE usage_row.user_id = p_user_id
    AND usage_row.function_name = p_function_name
    AND usage_row.called_at >= public._today_start_tr();

  RETURN GREATEST(0, p_daily_limit - v_count);
END;
$function$;

ALTER FUNCTION public.get_remaining_usage(uuid, text, integer)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_remaining_usage(uuid, text, integer)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_remaining_usage(uuid, text, integer)
TO authenticated, service_role;


CREATE TABLE internal.permission_v2_code_attempts (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  surface text NOT NULL,
  attempted_at timestamp with time zone NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT permission_v2_code_attempts_surface_check
    CHECK (surface IN ('isletme_invite', 'cari_share'))
);

CREATE INDEX permission_v2_code_attempts_window_idx
ON internal.permission_v2_code_attempts (
  user_id, surface, attempted_at DESC
);

ALTER TABLE internal.permission_v2_code_attempts OWNER TO postgres;
ALTER SEQUENCE internal.permission_v2_code_attempts_id_seq OWNER TO postgres;
REVOKE ALL
ON TABLE internal.permission_v2_code_attempts
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL
ON SEQUENCE internal.permission_v2_code_attempts_id_seq
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION internal.consume_code_attempt_v2(
  p_surface text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL
     OR p_surface NOT IN ('isletme_invite', 'cari_share') THEN
    RETURN false;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'permission-v2-code:'
      || v_uid::text
      || ':'
      || p_surface,
      0
    )
  );

  DELETE FROM internal.permission_v2_code_attempts AS attempt
  WHERE attempt.user_id = v_uid
    AND attempt.surface = p_surface
    AND attempt.attempted_at
      < pg_catalog.clock_timestamp() - INTERVAL '24 hours';

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM internal.permission_v2_code_attempts AS attempt
  WHERE attempt.user_id = v_uid
    AND attempt.surface = p_surface
    AND attempt.attempted_at
      >= pg_catalog.clock_timestamp() - INTERVAL '15 minutes';

  IF v_count >= 10 THEN
    RETURN false;
  END IF;

  INSERT INTO internal.permission_v2_code_attempts (
    user_id, surface
  )
  VALUES (v_uid, p_surface);

  RETURN true;
END;
$function$;

ALTER FUNCTION internal.consume_code_attempt_v2(text)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION internal.consume_code_attempt_v2(text)
FROM PUBLIC, anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.accept_isletme_invite(
  p_code text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_invite record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'INVITE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  -- Invalid/rate-limited codes return NULL so the attempt row commits. Raising
  -- here would roll the counter back with the surrounding transaction.
  IF NOT internal.consume_code_attempt_v2('isletme_invite')
     OR p_code IS NULL
     OR pg_catalog.upper(p_code) !~ '^[A-Z0-9]{6}$' THEN
    RETURN NULL;
  END IF;

  SELECT invite_row.*
  INTO v_invite
  FROM public.isletme_invites AS invite_row
  WHERE invite_row.invite_code = pg_catalog.upper(p_code)
    AND invite_row.status = 'pending'
    AND invite_row.expires_at > pg_catalog.now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.isletme_users AS member
    WHERE member.isletme_id = v_invite.isletme_id
      AND member.user_id = auth.uid()
      AND member.status IN ('active', 'suspended')
  ) THEN
    RAISE EXCEPTION 'Bu isletmeye zaten erisiminiz var';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.isletmeler AS business
    WHERE business.id = v_invite.isletme_id
      AND business.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Kendi isletmenize davet kabul edemezsiniz';
  END IF;

  UPDATE public.isletme_invites AS invite_row
  SET status = 'accepted',
      accepted_at = pg_catalog.now(),
      accepted_by = auth.uid()
  WHERE invite_row.id = v_invite.id;

  INSERT INTO public.isletme_users (
    isletme_id,
    user_id,
    invite_id,
    role,
    role_label,
    permissions,
    status,
    member_label
  )
  VALUES (
    v_invite.isletme_id,
    auth.uid(),
    v_invite.id,
    v_invite.role,
    v_invite.role_label,
    v_invite.permissions,
    'active',
    v_invite.member_label
  )
  ON CONFLICT (isletme_id, user_id) DO UPDATE
  SET invite_id = EXCLUDED.invite_id,
      role = EXCLUDED.role,
      role_label = EXCLUDED.role_label,
      permissions = EXCLUDED.permissions,
      status = 'active',
      member_label = EXCLUDED.member_label,
      updated_at = pg_catalog.now();

  RETURN v_invite.isletme_id;
END;
$function$;

ALTER FUNCTION public.accept_isletme_invite(text)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.accept_isletme_invite(text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.accept_isletme_invite(text)
TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_cari_share_code(
  p_code text,
  p_isletme_id uuid,
  p_viewer_type text DEFAULT 'musteri'
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_share_code record;
  v_link_id uuid;
  v_existing_link uuid;
BEGIN
  IF auth.uid() IS NULL
     OR p_viewer_type NOT IN ('musteri', 'tedarikci')
     OR NOT EXISTS (
       SELECT 1
       FROM public.isletmeler AS business
       WHERE business.id = p_isletme_id
         AND business.user_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'Isletme bulunamadi veya erisim yetkiniz yok'
      USING ERRCODE = '42501';
  END IF;

  IF NOT internal.consume_code_attempt_v2('cari_share')
     OR p_code IS NULL
     OR pg_catalog.upper(p_code) !~ '^[A-Z0-9]{6}$' THEN
    RETURN NULL;
  END IF;

  SELECT share_code.*
  INTO v_share_code
  FROM public.cari_share_codes AS share_code
  WHERE share_code.code = pg_catalog.upper(p_code)
    AND share_code.used_at IS NULL
    AND share_code.expires_at > pg_catalog.now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_share_code.isletme_id = p_isletme_id THEN
    RAISE EXCEPTION 'Kendi carinizle baglanti kuramazsiniz';
  END IF;

  SELECT link.id
  INTO v_existing_link
  FROM public.cari_links AS link
  WHERE link.cari_id = v_share_code.cari_id;

  IF v_existing_link IS NOT NULL THEN
    RAISE EXCEPTION 'Paylasim kodundaki cari zaten baglantili';
  END IF;

  UPDATE public.cari_share_codes AS share_code
  SET used_at = pg_catalog.now(),
      used_by_isletme_id = p_isletme_id
  WHERE share_code.id = v_share_code.id;

  INSERT INTO public.cari_links (
    cari_id,
    owner_isletme_id,
    viewer_isletme_id,
    viewer_type,
    permission
  )
  VALUES (
    v_share_code.cari_id,
    v_share_code.isletme_id,
    p_isletme_id,
    p_viewer_type,
    v_share_code.permission
  )
  RETURNING id INTO v_link_id;

  RETURN v_link_id;
END;
$function$;

ALTER FUNCTION public.accept_cari_share_code(text, uuid, text)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.accept_cari_share_code(text, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.accept_cari_share_code(text, uuid, text)
TO authenticated;

-- All invite/share entry points are authenticated-only. Existing bodies and
-- signatures remain unchanged except the two acceptance wrappers above.
ALTER FUNCTION public.create_isletme_invite(
  uuid, text, text, jsonb, text
) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.create_isletme_invite(
  uuid, text, text, jsonb, text
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.create_isletme_invite(
  uuid, text, text, jsonb, text
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.create_isletme_invite(
  uuid, text, text, jsonb, text
)
TO authenticated;

REVOKE ALL
ON FUNCTION public.create_isletme_invite_v2(
  uuid, text, text, jsonb, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.create_isletme_invite_v2(
  uuid, text, text, jsonb, text, text
)
TO authenticated;

ALTER FUNCTION public.generate_cari_share_code(
  uuid, uuid, text
) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.generate_cari_share_code(
  uuid, uuid, text
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.generate_cari_share_code(uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.generate_cari_share_code(uuid, uuid, text)
TO authenticated;

ALTER FUNCTION public.remove_cari_link(
  uuid, uuid
) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.remove_cari_link(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.remove_cari_link(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.remove_cari_link(uuid, uuid)
TO authenticated;

-- Trigger functions are never API entry points.
ALTER FUNCTION public.handle_new_user()
  OWNER TO postgres;
ALTER FUNCTION public.handle_new_user()
  SET search_path TO 'public', 'pg_temp';
REVOKE ALL
ON FUNCTION public.handle_new_user()
FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.log_islem_changes()
  OWNER TO postgres;
ALTER FUNCTION public.log_islem_changes()
  SET search_path TO 'public', 'pg_temp';
REVOKE ALL
ON FUNCTION public.log_islem_changes()
FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.set_audit_fields()
  OWNER TO postgres;
ALTER FUNCTION public.set_audit_fields()
  SET search_path TO 'public', 'pg_temp';
REVOKE ALL
ON FUNCTION public.set_audit_fields()
FROM PUBLIC, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- SECURITY CLOSURE C: summary/report/vade projections.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cari_ozet(
  p_isletme_id uuid,
  p_cari_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.etkin_yetki_v2(
      p_isletme_id, 'cariler'
    ) AS permission
    WHERE permission.can_view IS TRUE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.cariler AS customer
    WHERE customer.id = p_cari_id
      AND customer.isletme_id = p_isletme_id
      AND (
        customer.is_active IS TRUE
        OR v_is_owner
      )
  ) THEN
    RAISE EXCEPTION 'CARI_SUMMARY_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_object_agg(
      summary.type,
      pg_catalog.jsonb_build_object(
        'toplam', summary.toplam,
        'adet', summary.adet
      )
    ),
    '{}'::jsonb
  )
  INTO v_result
  FROM (
    SELECT
      transaction_row.type::text AS type,
      pg_catalog.round(
        pg_catalog.sum(
          public.tahsis_cari_etki(
            transaction_row.type,
            transaction_row.amount,
            transaction_row.exchange_rate,
            transaction_row.source_currency,
            transaction_row.target_currency
          )
        ),
        2
      ) AS toplam,
      pg_catalog.count(*) AS adet
    FROM public.islemler AS transaction_row
    WHERE transaction_row.isletme_id = p_isletme_id
      AND transaction_row.cari_id = p_cari_id
      AND transaction_row.type::text IN (
        'cari_satis',
        'cari_alis',
        'cari_tahsilat',
        'cari_odeme',
        'cari_satis_iade',
        'cari_alis_iade'
      )
    GROUP BY transaction_row.type
  ) AS summary;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.get_cari_ozet(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_cari_ozet(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_cari_ozet(uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_personel_ozet(
  p_isletme_id uuid,
  p_personel_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.etkin_yetki_v2(
      p_isletme_id, 'personel'
    ) AS permission
    WHERE permission.can_view IS TRUE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.personel AS employee
    WHERE employee.id = p_personel_id
      AND employee.isletme_id = p_isletme_id
      AND (
        employee.is_active IS TRUE
        OR v_is_owner
      )
  ) THEN
    RAISE EXCEPTION 'PERSONEL_SUMMARY_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_object_agg(
      summary.type,
      pg_catalog.jsonb_build_object(
        'toplam', summary.toplam,
        'adet', summary.adet
      )
    ),
    '{}'::jsonb
  )
  INTO v_result
  FROM (
    SELECT
      transaction_row.type::text AS type,
      pg_catalog.round(
        pg_catalog.sum(
          public.tahsis_cari_etki(
            transaction_row.type,
            transaction_row.amount,
            transaction_row.exchange_rate,
            transaction_row.source_currency,
            transaction_row.target_currency
          )
        ),
        2
      ) AS toplam,
      pg_catalog.count(*) AS adet
    FROM public.islemler AS transaction_row
    WHERE transaction_row.isletme_id = p_isletme_id
      AND transaction_row.personel_id = p_personel_id
      AND transaction_row.type::text IN (
        'personel_gider',
        'personel_odeme',
        'personel_satis',
        'personel_tahsilat'
      )
    GROUP BY transaction_row.type
  ) AS summary;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.get_personel_ozet(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_personel_ozet(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_personel_ozet(uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_urun_ozet(
  p_isletme_id uuid,
  p_urun_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.etkin_yetki_v2(
      p_isletme_id, 'urunler'
    ) AS permission
    WHERE permission.can_view IS TRUE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.urunler AS product
    WHERE product.id = p_urun_id
      AND product.isletme_id = p_isletme_id
      AND (
        product.is_active IS TRUE
        OR v_is_owner
      )
  ) THEN
    RAISE EXCEPTION 'PRODUCT_SUMMARY_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(summary),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT
      movement.hareket_tipi,
      transaction_row.type::text AS islem_type,
      pg_catalog.round(
        pg_catalog.sum(movement.miktar)::numeric,
        3
      ) AS miktar,
      pg_catalog.round(
        pg_catalog.sum(
          movement.miktar
          * COALESCE(movement.birim_fiyat, 0)
        ),
        2
      ) AS tutar
    FROM public.urun_hareketler AS movement
    LEFT JOIN public.islemler AS transaction_row
      ON transaction_row.id = movement.islem_id
     AND transaction_row.isletme_id = movement.isletme_id
    WHERE movement.isletme_id = p_isletme_id
      AND movement.urun_id = p_urun_id
    GROUP BY movement.hareket_tipi, transaction_row.type
  ) AS summary;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.get_urun_ozet(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_urun_ozet(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_urun_ozet(uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_balance_activity_report(
  p_isletme_id uuid
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result json;
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        p_isletme_id, 'cariler'
      ) AS permission
      WHERE permission.can_view IS TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki_v2(
        p_isletme_id, 'raporlar'
      ) AS permission
      WHERE permission.can_view IS TRUE
    )
  ) THEN
    RAISE EXCEPTION 'BALANCE_ACTIVITY_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.json_build_object(
    'items',
    COALESCE(
      (
        SELECT pg_catalog.json_agg(
          pg_catalog.row_to_json(item)
          ORDER BY pg_catalog.abs(item.balance) DESC
        )
        FROM (
          SELECT
            customer.id,
            customer.name,
            customer.type,
            customer.balance::float AS balance,
            customer.currency,
            customer.color,
            latest.last_date::text AS last_transaction_date,
            CASE
              WHEN latest.last_date IS NOT NULL THEN
                pg_catalog.date_part(
                  'day',
                  pg_catalog.now() - latest.last_date
                )::integer
              ELSE NULL
            END AS days_since_last_tx
          FROM public.cariler AS customer
          LEFT JOIN (
            SELECT
              transaction_row.cari_id,
              pg_catalog.max(transaction_row.date) AS last_date
            FROM public.islemler AS transaction_row
            WHERE transaction_row.isletme_id = p_isletme_id
            GROUP BY transaction_row.cari_id
          ) AS latest
            ON latest.cari_id = customer.id
          WHERE customer.isletme_id = p_isletme_id
            AND customer.is_archived IS FALSE
            AND customer.is_active IS TRUE
            AND customer.balance <> 0
        ) AS item
      ),
      '[]'::json
    ),
    'summary',
    COALESCE(
      (
        SELECT pg_catalog.json_build_object(
          'total_receivables',
          COALESCE(
            pg_catalog.sum(
              CASE
                WHEN customer.balance > 0 THEN customer.balance
                ELSE 0
              END
            ),
            0
          )::float,
          'total_payables',
          COALESCE(
            pg_catalog.sum(
              CASE
                WHEN customer.balance < 0
                  THEN pg_catalog.abs(customer.balance)
                ELSE 0
              END
            ),
            0
          )::float,
          'receivable_count',
          pg_catalog.count(
            CASE WHEN customer.balance > 0 THEN 1 END
          )::integer,
          'payable_count',
          pg_catalog.count(
            CASE WHEN customer.balance < 0 THEN 1 END
          )::integer
        )
        FROM public.cariler AS customer
        WHERE customer.isletme_id = p_isletme_id
          AND customer.is_archived IS FALSE
          AND customer.is_active IS TRUE
          AND customer.balance <> 0
      ),
      pg_catalog.json_build_object(
        'total_receivables', 0::float,
        'total_payables', 0::float,
        'receivable_count', 0::integer,
        'payable_count', 0::integer
      )
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.get_balance_activity_report(uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_balance_activity_report(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_balance_activity_report(uuid)
TO authenticated;


CREATE OR REPLACE FUNCTION public._vade_birim_mahsuplu(
  p_isletme_id uuid,
  p_cari_id uuid DEFAULT NULL
)
RETURNS TABLE (
  cari_id uuid,
  islem_id uuid,
  taksit_id uuid,
  type text,
  description text,
  cari_name text,
  currency text,
  taksit_sira integer,
  taksit_toplam integer,
  vade date,
  real_kalan numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH caller AS MATERIALIZED (
    SELECT EXISTS (
      SELECT 1
      FROM public.isletmeler AS business
      WHERE business.id = p_isletme_id
        AND business.user_id = auth.uid()
    ) AS v_is_owner
  ),
  birim AS (
    SELECT
      transaction_row.cari_id,
      transaction_row.id AS islem_id,
      installment.id AS taksit_id,
      transaction_row.type::text AS type,
      transaction_row.description,
      c.name AS cari_name,
      COALESCE(c.currency, 'TRY')::text AS currency,
      installment.sira AS taksit_sira,
      CASE
        WHEN installment.id IS NOT NULL THEN (
          SELECT pg_catalog.count(*)::integer
          FROM public.taksitler AS count_installment
          WHERE count_installment.islem_id = transaction_row.id
        )
        ELSE NULL
      END AS taksit_toplam,
      COALESCE(
        installment.vade_tarihi,
        transaction_row.vade_tarihi
      ) AS vade,
      transaction_row.date AS tx_date,
      transaction_row.created_at,
      COALESCE(installment.tutar, transaction_row.amount)
        AS birim_tutar,
      GREATEST(0::numeric, -c.balance) AS net_borc,
      GREATEST(0::numeric, c.balance) AS net_alacak
    FROM public.islemler AS transaction_row
    INNER JOIN public.cariler AS c
      ON c.id = transaction_row.cari_id
     AND c.isletme_id = transaction_row.isletme_id
    CROSS JOIN caller
    LEFT JOIN public.taksitler AS installment
      ON installment.islem_id = transaction_row.id
     AND installment.isletme_id = transaction_row.isletme_id
    WHERE transaction_row.isletme_id = p_isletme_id
      AND transaction_row.cari_id IS NOT NULL
      AND transaction_row.type::text IN ('cari_satis', 'cari_alis')
      AND (
        p_cari_id IS NULL
        OR transaction_row.cari_id = p_cari_id
      )
      AND (
        c.is_active IS TRUE
        OR caller.v_is_owner
      )
  ),
  recon AS (
    SELECT
      unit.*,
      CASE
        WHEN unit.type = 'cari_alis' THEN unit.net_borc
        ELSE unit.net_alacak
      END AS net_dir,
      pg_catalog.sum(unit.birim_tutar) OVER (
        PARTITION BY unit.cari_id, unit.type
        ORDER BY
          COALESCE(unit.vade, unit.tx_date) DESC NULLS LAST,
          unit.tx_date DESC,
          unit.created_at DESC,
          unit.islem_id DESC,
          unit.taksit_id DESC
      ) AS cum_incl
    FROM birim AS unit
  )
  SELECT
    recon.cari_id,
    recon.islem_id,
    recon.taksit_id,
    recon.type,
    recon.description,
    recon.cari_name,
    recon.currency,
    recon.taksit_sira,
    recon.taksit_toplam,
    recon.vade,
    GREATEST(
      0::numeric,
      LEAST(
        recon.birim_tutar,
        recon.net_dir
          - (recon.cum_incl - recon.birim_tutar)
      )
    )::numeric AS real_kalan
  FROM recon;
$function$;

ALTER FUNCTION public._vade_birim_mahsuplu(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public._vade_birim_mahsuplu(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_cari_vade_rozet(
  p_isletme_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_bugun date := (
    pg_catalog.now() AT TIME ZONE 'Europe/Istanbul'
  )::date;
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.etkin_yetki_v2(
      p_isletme_id, 'cariler'
    ) AS permission
    WHERE permission.can_view IS TRUE
  ) THEN
    RAISE EXCEPTION 'CARI_DUE_PROJECTION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  WITH acik AS (
    SELECT *
    FROM public._vade_birim_mahsuplu(
      p_isletme_id, NULL
    ) AS unit
    WHERE unit.real_kalan > 0
      AND unit.vade IS NOT NULL
  ),
  gecikmis AS (
    SELECT
      open_unit.cari_id,
      COALESCE(
        pg_catalog.sum(open_unit.real_kalan)
          FILTER (WHERE open_unit.type = 'cari_satis'),
        0
      ) AS gecikmis_alacak,
      COALESCE(
        pg_catalog.sum(open_unit.real_kalan)
          FILTER (WHERE open_unit.type = 'cari_alis'),
        0
      ) AS gecikmis_borc,
      pg_catalog.count(*) AS gecikmis_adet
    FROM acik AS open_unit
    WHERE open_unit.vade <= v_bugun
    GROUP BY open_unit.cari_id
  ),
  yakin AS (
    SELECT DISTINCT ON (open_unit.cari_id)
      open_unit.cari_id,
      open_unit.vade,
      open_unit.real_kalan AS kalan,
      open_unit.type
    FROM acik AS open_unit
    WHERE open_unit.vade > v_bugun
    ORDER BY
      open_unit.cari_id,
      open_unit.vade,
      open_unit.real_kalan DESC
  ),
  birlesik AS (
    SELECT
      COALESCE(overdue.cari_id, upcoming.cari_id) AS cari_id,
      COALESCE(overdue.gecikmis_alacak, 0) AS gecikmis_alacak,
      COALESCE(overdue.gecikmis_borc, 0) AS gecikmis_borc,
      COALESCE(overdue.gecikmis_adet, 0) AS gecikmis_adet,
      upcoming.vade AS yakin_vade,
      upcoming.kalan AS yakin_tutar,
      upcoming.type AS yakin_type
    FROM gecikmis AS overdue
    FULL OUTER JOIN yakin AS upcoming
      ON upcoming.cari_id = overdue.cari_id
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'cari_id', combined.cari_id,
        'currency', COALESCE(customer.currency, 'TRY'),
        'gecikmis_alacak', combined.gecikmis_alacak,
        'gecikmis_borc', combined.gecikmis_borc,
        'gecikmis_adet', combined.gecikmis_adet,
        'yakin_vade', combined.yakin_vade,
        'yakin_tutar', combined.yakin_tutar,
        'yakin_yon', CASE combined.yakin_type
          WHEN 'cari_satis' THEN 'alacak'
          WHEN 'cari_alis' THEN 'borc'
        END
      )
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM birlesik AS combined
  INNER JOIN public.cariler AS customer
    ON customer.id = combined.cari_id
   AND customer.isletme_id = p_isletme_id;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.get_cari_vade_rozet(uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_cari_vade_rozet(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_cari_vade_rozet(uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_vade_listesi(
  p_isletme_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.etkin_yetki_v2(
      p_isletme_id, 'cariler'
    ) AS permission
    WHERE permission.can_view IS TRUE
  ) THEN
    RAISE EXCEPTION 'CARI_DUE_PROJECTION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(result_row)
      ORDER BY
        result_row.vade,
        result_row.taksit_sira NULLS FIRST
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT
      unit.islem_id,
      unit.cari_id,
      unit.type,
      unit.description,
      unit.cari_name,
      unit.currency,
      unit.taksit_sira,
      unit.taksit_toplam,
      unit.vade,
      unit.real_kalan AS kalan
    FROM public._vade_birim_mahsuplu(
      p_isletme_id, NULL
    ) AS unit
    WHERE unit.real_kalan > 0
      AND unit.vade IS NOT NULL
  ) AS result_row;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.get_vade_listesi(uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_vade_listesi(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_vade_listesi(uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_vade_ozet(
  p_isletme_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_bugun date := (
    pg_catalog.now() AT TIME ZONE 'Europe/Istanbul'
  )::date;
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.etkin_yetki_v2(
      p_isletme_id, 'cariler'
    ) AS permission
    WHERE permission.can_view IS TRUE
  ) THEN
    RAISE EXCEPTION 'CARI_DUE_PROJECTION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      summary.payload
      ORDER BY summary.payload->>'currency'
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT pg_catalog.jsonb_build_object(
      'currency', unit.currency,
      'gecikmis_alacak',
      pg_catalog.sum(unit.real_kalan) FILTER (
        WHERE unit.type = 'cari_satis'
          AND unit.vade <= v_bugun
      ),
      'gecikmis_alacak_adet',
      pg_catalog.count(*) FILTER (
        WHERE unit.type = 'cari_satis'
          AND unit.vade <= v_bugun
      ),
      'gecikmis_borc',
      pg_catalog.sum(unit.real_kalan) FILTER (
        WHERE unit.type = 'cari_alis'
          AND unit.vade <= v_bugun
      ),
      'gecikmis_borc_adet',
      pg_catalog.count(*) FILTER (
        WHERE unit.type = 'cari_alis'
          AND unit.vade <= v_bugun
      ),
      'yaklasan_alacak',
      pg_catalog.sum(unit.real_kalan) FILTER (
        WHERE unit.type = 'cari_satis'
          AND unit.vade > v_bugun
          AND unit.vade <= v_bugun + 7
      ),
      'yaklasan_borc',
      pg_catalog.sum(unit.real_kalan) FILTER (
        WHERE unit.type = 'cari_alis'
          AND unit.vade > v_bugun
          AND unit.vade <= v_bugun + 7
      )
    ) AS payload
    FROM public._vade_birim_mahsuplu(
      p_isletme_id, NULL
    ) AS unit
    WHERE unit.real_kalan > 0
      AND unit.vade IS NOT NULL
    GROUP BY unit.currency
  ) AS summary;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.get_vade_ozet(uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_vade_ozet(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_vade_ozet(uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cari_vade_detay(
  p_isletme_id uuid,
  p_cari_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.etkin_yetki_v2(
      p_isletme_id, 'cariler'
    ) AS permission
    WHERE permission.can_view IS TRUE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.cariler AS customer
    WHERE customer.id = p_cari_id
      AND customer.isletme_id = p_isletme_id
      AND (
        customer.is_active IS TRUE
        OR v_is_owner
      )
  ) THEN
    RAISE EXCEPTION 'CARI_DUE_PROJECTION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(result_row)
      ORDER BY
        result_row.vade,
        result_row.taksit_sira NULLS FIRST
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT
      unit.islem_id,
      unit.taksit_id,
      unit.type,
      unit.description,
      unit.vade,
      unit.real_kalan AS kalan,
      unit.taksit_sira,
      unit.taksit_toplam
    FROM public._vade_birim_mahsuplu(
      p_isletme_id, p_cari_id
    ) AS unit
    WHERE unit.cari_id = p_cari_id
      AND unit.real_kalan > 0
      AND unit.vade IS NOT NULL
  ) AS result_row;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.get_cari_vade_detay(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_cari_vade_detay(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_cari_vade_detay(uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cari_islem_kalan(
  p_isletme_id uuid,
  p_cari_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.etkin_yetki_v2(
      p_isletme_id, 'cariler'
    ) AS permission
    WHERE permission.can_view IS TRUE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.cariler AS customer
    WHERE customer.id = p_cari_id
      AND customer.isletme_id = p_isletme_id
      AND (
        customer.is_active IS TRUE
        OR v_is_owner
      )
  ) THEN
    RAISE EXCEPTION 'CARI_DUE_PROJECTION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_object_agg(
      summary.islem_id::text,
      summary.kalan
    ) FILTER (WHERE summary.kalan > 0.009),
    '{}'::jsonb
  )
  INTO v_result
  FROM (
    SELECT
      unit.islem_id,
      pg_catalog.round(
        pg_catalog.sum(unit.real_kalan),
        2
      ) AS kalan
    FROM public._vade_birim_mahsuplu(
      p_isletme_id, p_cari_id
    ) AS unit
    GROUP BY unit.islem_id
  ) AS summary;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.get_cari_islem_kalan(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_cari_islem_kalan(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_cari_islem_kalan(uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_taksit_plan_listesi(
  p_isletme_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_bugun date := (
    pg_catalog.now() AT TIME ZONE 'Europe/Istanbul'
  )::date;
  v_result jsonb;
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.etkin_yetki_v2(
      p_isletme_id, 'cariler'
    ) AS permission
    WHERE permission.can_view IS TRUE
  ) THEN
    RAISE EXCEPTION 'CARI_INSTALLMENT_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      plan_row.payload
      ORDER BY plan_row.payload->>'sonraki_vade' NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    WITH unit_balance AS MATERIALIZED (
      SELECT unit.islem_id, unit.taksit_id, unit.real_kalan
      FROM public._vade_birim_mahsuplu(
        p_isletme_id, NULL
      ) AS unit
      WHERE unit.taksit_id IS NOT NULL
    )
    SELECT pg_catalog.jsonb_build_object(
      'plan_id', plan.id,
      'islem_id', plan.islem_id,
      'cari_id', plan.cari_id,
      'cari_name', customer.name,
      'currency', COALESCE(customer.currency, 'TRY'),
      'type', transaction_row.type,
      'islem_date', transaction_row.date,
      'toplam', pg_catalog.round(transaction_row.amount, 2),
      'taksit_adedi', plan.taksit_adedi,
      'odenen', pg_catalog.round(
        transaction_row.amount
          - COALESCE(
            (
              SELECT pg_catalog.sum(balance.real_kalan)
              FROM unit_balance AS balance
              WHERE balance.islem_id = plan.islem_id
            ),
            0
          ),
        2
      ),
      'odenen_taksit_adedi', (
        SELECT pg_catalog.count(*)
        FROM public.taksitler AS installment
        LEFT JOIN unit_balance AS balance
          ON balance.taksit_id = installment.id
        WHERE installment.plan_id = plan.id
          AND COALESCE(balance.real_kalan, 0) <= 0.009
      ),
      'sonraki_vade', (
        SELECT pg_catalog.min(installment.vade_tarihi)
        FROM public.taksitler AS installment
        INNER JOIN unit_balance AS balance
          ON balance.taksit_id = installment.id
        WHERE installment.plan_id = plan.id
          AND balance.real_kalan > 0.009
      ),
      'gecikmis_adet', (
        SELECT pg_catalog.count(*)
        FROM public.taksitler AS installment
        INNER JOIN unit_balance AS balance
          ON balance.taksit_id = installment.id
        WHERE installment.plan_id = plan.id
          AND installment.vade_tarihi <= v_bugun
          AND balance.real_kalan > 0.009
      )
    ) AS payload
    FROM public.taksit_planlari AS plan
    INNER JOIN public.islemler AS transaction_row
      ON transaction_row.id = plan.islem_id
     AND transaction_row.isletme_id = plan.isletme_id
    INNER JOIN public.cariler AS customer
      ON customer.id = plan.cari_id
     AND customer.isletme_id = plan.isletme_id
    WHERE plan.isletme_id = p_isletme_id
      AND (
        customer.is_active IS TRUE
        OR v_is_owner
      )
  ) AS plan_row;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.get_taksit_plan_listesi(uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_taksit_plan_listesi(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_taksit_plan_listesi(uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cari_taksit_kalan(
  p_isletme_id uuid,
  p_cari_id uuid DEFAULT NULL
)
RETURNS TABLE (
  islem_id uuid,
  taksit_id uuid,
  vade date,
  type text,
  real_kalan numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM internal.etkin_yetki_v2(
      p_isletme_id, 'cariler'
    ) AS permission
    WHERE permission.can_view IS TRUE
  ) OR (
    p_cari_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.cariler AS customer
      WHERE customer.id = p_cari_id
        AND customer.isletme_id = p_isletme_id
        AND (
          customer.is_active IS TRUE
          OR v_is_owner
        )
    )
  ) THEN
    RAISE EXCEPTION 'CARI_INSTALLMENT_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    unit.islem_id,
    unit.taksit_id,
    unit.vade,
    unit.type,
    pg_catalog.round(unit.real_kalan, 2)
  FROM public._vade_birim_mahsuplu(
    p_isletme_id, p_cari_id
  ) AS unit
  WHERE unit.taksit_id IS NOT NULL;
END;
$function$;

ALTER FUNCTION public.get_cari_taksit_kalan(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.get_cari_taksit_kalan(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_cari_taksit_kalan(uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.taksit_plani_olustur(
  p_isletme_id uuid,
  p_new_row jsonb,
  p_balance_ops jsonb,
  p_taksitler jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_item jsonb;
  v_payload jsonb;
  v_result jsonb;
  v_id uuid;
  v_cari_id uuid;
  v_type text;
  v_amount numeric;
  v_item_amount numeric;
  v_item_date date;
  v_plan_id uuid;
  v_count integer;
  v_index integer := 0;
  v_total numeric := 0;
  v_min_date date;
  v_inserted integer;
BEGIN
  -- p_balance_ops is intentionally ignored. The canonical create engine derives
  -- all balance legs from the transaction payload and locked source entities.
  IF auth.uid() IS NULL
     OR p_isletme_id IS NULL
     OR p_new_row IS NULL
     OR pg_catalog.jsonb_typeof(p_new_row) IS DISTINCT FROM 'object'
     OR p_taksitler IS NULL
     OR pg_catalog.jsonb_typeof(p_taksitler) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INSTALLMENT_PLAN_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  v_count := pg_catalog.jsonb_array_length(p_taksitler);
  IF v_count < 2 OR v_count > 48 THEN
    RAISE EXCEPTION 'INSTALLMENT_PLAN_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_id := COALESCE(
      NULLIF(p_new_row->>'id', '')::uuid,
      extensions.gen_random_uuid()
    );
    v_cari_id := NULLIF(p_new_row->>'cari_id', '')::uuid;
    v_type := p_new_row->>'type';
    v_amount := (p_new_row->>'amount')::numeric;
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'INSTALLMENT_PLAN_INVALID_INPUT'
        USING ERRCODE = '22023';
  END;

  IF v_type NOT IN ('cari_satis', 'cari_alis')
     OR v_cari_id IS NULL
     OR v_amount IS NULL
     OR v_amount = 'NaN'::numeric
     OR v_amount = 'Infinity'::numeric
     OR v_amount = '-Infinity'::numeric
     OR v_amount <= 0
     OR v_amount > 9999999999999.99
     OR v_amount IS DISTINCT FROM pg_catalog.round(v_amount, 2) THEN
    RAISE EXCEPTION 'INSTALLMENT_PLAN_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT item.value
    FROM pg_catalog.jsonb_array_elements(p_taksitler) AS item(value)
  LOOP
    v_index := v_index + 1;
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR NOT (v_item ?& ARRAY['sira', 'vade_tarihi', 'tutar'])
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.jsonb_object_keys(v_item) AS item_key(key_name)
         WHERE item_key.key_name NOT IN (
           'sira', 'vade_tarihi', 'tutar'
         )
       ) THEN
      RAISE EXCEPTION 'INSTALLMENT_PLAN_INVALID_INPUT'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      IF (v_item->>'sira')::integer <> v_index
         OR (v_item->>'vade_tarihi')
              !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'INSTALLMENT_PLAN_INVALID_INPUT'
          USING ERRCODE = '22023';
      END IF;
      v_item_amount := (v_item->>'tutar')::numeric;
      v_item_date := (v_item->>'vade_tarihi')::date;
    EXCEPTION
      WHEN invalid_text_representation
        OR invalid_datetime_format
        OR datetime_field_overflow
        OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'INSTALLMENT_PLAN_INVALID_INPUT'
          USING ERRCODE = '22023';
    END;

    IF v_item_amount IS NULL
       OR v_item_amount = 'NaN'::numeric
       OR v_item_amount = 'Infinity'::numeric
       OR v_item_amount = '-Infinity'::numeric
       OR v_item_amount <= 0
       OR v_item_amount > 9999999999999.99
       OR v_item_amount
          IS DISTINCT FROM pg_catalog.round(v_item_amount, 2) THEN
      RAISE EXCEPTION 'INSTALLMENT_PLAN_INVALID_INPUT'
        USING ERRCODE = '22023';
    END IF;

    v_total := pg_catalog.round(v_total + v_item_amount, 2);
    v_min_date := CASE
      WHEN v_min_date IS NULL THEN v_item_date
      ELSE LEAST(v_min_date, v_item_date)
    END;
  END LOOP;

  IF v_total IS DISTINCT FROM v_amount THEN
    RAISE EXCEPTION 'INSTALLMENT_TOTAL_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  v_payload := p_new_row
    - ARRAY[
      'isletme_id',
      'created_by',
      'updated_by',
      'created_at',
      'updated_at'
    ]::text[];
  v_payload := pg_catalog.jsonb_set(
    v_payload,
    '{id}',
    pg_catalog.to_jsonb(v_id),
    true
  );
  v_payload := pg_catalog.jsonb_set(
    v_payload,
    '{vade_tarihi}',
    pg_catalog.to_jsonb(v_min_date::text),
    true
  );

  v_result := public.create_islem_atomik(
    p_isletme_id,
    v_payload,
    '[]'::jsonb
  );

  INSERT INTO public.taksit_planlari (
    isletme_id,
    islem_id,
    cari_id,
    taksit_adedi
  )
  VALUES (
    p_isletme_id,
    v_id,
    v_cari_id,
    v_count
  )
  ON CONFLICT (islem_id) DO NOTHING
  RETURNING id INTO v_plan_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    FOR v_item IN
      SELECT item.value
      FROM pg_catalog.jsonb_array_elements(p_taksitler) AS item(value)
      ORDER BY (item.value->>'sira')::integer
    LOOP
      INSERT INTO public.taksitler (
        plan_id,
        isletme_id,
        islem_id,
        sira,
        vade_tarihi,
        tutar
      )
      VALUES (
        v_plan_id,
        p_isletme_id,
        v_id,
        (v_item->>'sira')::integer,
        (v_item->>'vade_tarihi')::date,
        (v_item->>'tutar')::numeric
      );
    END LOOP;

    -- V2 create may have swept old advances before the plan units existed.
    -- Rebuild that one debt allocation after all installment rows are present.
    PERFORM public.tahsis_borc_bosalt_ve_dagit(
      p_isletme_id, v_id, NULL
    );
    PERFORM public.tahsis_avans_supur(
      p_isletme_id, v_cari_id
    );
  ELSE
    SELECT plan.id
    INTO v_plan_id
    FROM public.taksit_planlari AS plan
    WHERE plan.islem_id = v_id
      AND plan.isletme_id = p_isletme_id
      AND plan.cari_id = v_cari_id
      AND plan.taksit_adedi = v_count
    FOR SHARE;

    IF NOT FOUND
       OR (
         SELECT pg_catalog.count(*)
         FROM public.taksitler AS installment
         WHERE installment.plan_id = v_plan_id
       ) <> v_count
       OR EXISTS (
         SELECT 1
         FROM public.taksitler AS installment
         WHERE installment.plan_id = v_plan_id
           AND NOT EXISTS (
             SELECT 1
             FROM pg_catalog.jsonb_array_elements(
               p_taksitler
             ) AS expected(value)
             WHERE (expected.value->>'sira')::integer
                     = installment.sira
               AND (expected.value->>'vade_tarihi')::date
                     = installment.vade_tarihi
               AND (expected.value->>'tutar')::numeric
                     = installment.tutar
           )
       ) THEN
      RAISE EXCEPTION 'INSTALLMENT_IDEMPOTENCY_MISMATCH'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT pg_catalog.to_jsonb(transaction_row)
  INTO v_result
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = v_id
    AND transaction_row.isletme_id = p_isletme_id;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.taksit_plani_olustur(
  uuid, jsonb, jsonb, jsonb
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.taksit_plani_olustur(
  uuid, jsonb, jsonb, jsonb
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.taksit_plani_olustur(
  uuid, jsonb, jsonb, jsonb
)
TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_ileri_tarihli_islem_atomik(
  p_isletme_id uuid,
  p_ileri_id uuid,
  p_exchange_rate numeric DEFAULT NULL,
  p_expected_token text DEFAULT NULL,
  p_completion_at timestamp without time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_scheduled public.ileri_tarihli_islemler;
  v_existing public.islemler;
  v_required_modules text[];
  v_amount numeric;
  v_rate numeric;
  v_hesap_currency text;
  v_hedef_currency text;
  v_cari_currency text;
  v_personel_currency text;
  v_source_currency text;
  v_target_currency text;
  v_is_cross boolean;
  v_completion_token text;
  v_completion_at timestamp without time zone;
  v_payload jsonb;
  v_result jsonb;
  v_rowcount integer;
BEGIN
  IF auth.uid() IS NULL
     OR p_isletme_id IS NULL
     OR p_ileri_id IS NULL
     OR NOT internal.aktif_uye_v1(p_isletme_id) THEN
    RAISE EXCEPTION 'SCHEDULED_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.isletmeler AS business
  WHERE business.id = p_isletme_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCHEDULED_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT scheduled.*
  INTO v_scheduled
  FROM public.ileri_tarihli_islemler AS scheduled
  WHERE scheduled.id = p_ileri_id
    AND scheduled.isletme_id = p_isletme_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCHEDULED_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  v_required_modules := internal.islem_tipi_modulu(
    v_scheduled.type::text
  );
  IF v_required_modules IS NULL
     OR NOT internal.islem_mutasyon_izni_v2(
       p_isletme_id,
       v_scheduled.type::text,
       v_scheduled.created_by,
       'update',
       NULL
     )
     OR NOT internal.islem_mutasyon_izni_v2(
       p_isletme_id,
       v_scheduled.type::text,
       auth.uid(),
       'create',
       p_ileri_id
     ) THEN
    RAISE EXCEPTION 'SCHEDULED_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT transaction_row.*
  INTO v_existing
  FROM public.islemler AS transaction_row
  WHERE transaction_row.source_ileri_id = p_ileri_id
  LIMIT 1
  FOR SHARE;

  IF FOUND THEN
    IF v_existing.id IS DISTINCT FROM p_ileri_id
       OR v_existing.isletme_id IS DISTINCT FROM p_isletme_id
       OR v_existing.type::text
            IS DISTINCT FROM v_scheduled.type::text
       OR v_existing.amount
            IS DISTINCT FROM pg_catalog.round(
              v_scheduled.amount, 2
            )
       OR v_existing.description
            IS DISTINCT FROM v_scheduled.description
       OR v_existing.hesap_id
            IS DISTINCT FROM v_scheduled.hesap_id
       OR v_existing.hedef_hesap_id
            IS DISTINCT FROM v_scheduled.hedef_hesap_id
       OR v_existing.kategori_id
            IS DISTINCT FROM v_scheduled.kategori_id
       OR v_existing.cari_id
            IS DISTINCT FROM v_scheduled.cari_id
       OR v_existing.personel_id
            IS DISTINCT FROM v_scheduled.personel_id
       OR v_scheduled.status IS DISTINCT FROM 'completed' THEN
      RAISE EXCEPTION 'SCHEDULED_SOURCE_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    RETURN pg_catalog.to_jsonb(v_existing);
  END IF;

  IF v_scheduled.status NOT IN ('pending', 'notified') THEN
    RAISE EXCEPTION 'SCHEDULED_NOT_COMPLETABLE'
      USING ERRCODE = '55000';
  END IF;

  IF v_scheduled.amount IS NULL
     OR v_scheduled.amount = 'NaN'::numeric
     OR v_scheduled.amount = 'Infinity'::numeric
     OR v_scheduled.amount = '-Infinity'::numeric
     OR v_scheduled.amount <= 0
     OR v_scheduled.amount > 9999999999999.99 THEN
    RAISE EXCEPTION 'SCHEDULED_INVALID_AMOUNT'
      USING ERRCODE = '22023';
  END IF;
  v_amount := pg_catalog.round(v_scheduled.amount, 2);

  IF p_exchange_rate IS NOT NULL
     AND (
       p_exchange_rate = 'NaN'::numeric
       OR p_exchange_rate = 'Infinity'::numeric
       OR p_exchange_rate = '-Infinity'::numeric
       OR p_exchange_rate <= 0
       OR p_exchange_rate > 9999999999.99999999
     ) THEN
    RAISE EXCEPTION 'SCHEDULED_INVALID_EXCHANGE_RATE'
      USING ERRCODE = '22023';
  END IF;
  v_rate := CASE
    WHEN p_exchange_rate IS NULL THEN NULL
    ELSE pg_catalog.round(p_exchange_rate, 8)
  END;

  IF v_scheduled.hesap_id IS NOT NULL THEN
    SELECT pg_catalog.upper(
      COALESCE(NULLIF(pg_catalog.btrim(account.currency::text), ''), 'TRY')
    )
    INTO v_hesap_currency
    FROM public.hesaplar AS account
    WHERE account.id = v_scheduled.hesap_id
      AND account.isletme_id = p_isletme_id
      AND account.is_active IS TRUE
      AND account.is_archived IS FALSE
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCHEDULED_ENTITY_SCOPE_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_scheduled.hedef_hesap_id IS NOT NULL THEN
    SELECT pg_catalog.upper(
      COALESCE(NULLIF(pg_catalog.btrim(account.currency::text), ''), 'TRY')
    )
    INTO v_hedef_currency
    FROM public.hesaplar AS account
    WHERE account.id = v_scheduled.hedef_hesap_id
      AND account.isletme_id = p_isletme_id
      AND account.is_active IS TRUE
      AND account.is_archived IS FALSE
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCHEDULED_ENTITY_SCOPE_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_scheduled.cari_id IS NOT NULL THEN
    SELECT pg_catalog.upper(
      COALESCE(NULLIF(pg_catalog.btrim(customer.currency::text), ''), 'TRY')
    )
    INTO v_cari_currency
    FROM public.cariler AS customer
    WHERE customer.id = v_scheduled.cari_id
      AND customer.isletme_id = p_isletme_id
      AND customer.is_active IS TRUE
      AND customer.is_archived IS FALSE
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCHEDULED_ENTITY_SCOPE_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_scheduled.personel_id IS NOT NULL THEN
    SELECT pg_catalog.upper(
      COALESCE(NULLIF(pg_catalog.btrim(employee.currency::text), ''), 'TRY')
    )
    INTO v_personel_currency
    FROM public.personel AS employee
    WHERE employee.id = v_scheduled.personel_id
      AND employee.isletme_id = p_isletme_id
      AND employee.is_active IS TRUE
      AND employee.is_archived IS FALSE
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCHEDULED_ENTITY_SCOPE_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_scheduled.kategori_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.kategoriler AS category
       WHERE category.id = v_scheduled.kategori_id
         AND category.isletme_id = p_isletme_id
         AND category.is_active IS TRUE
     ) THEN
    RAISE EXCEPTION 'SCHEDULED_ENTITY_SCOPE_MISMATCH'
      USING ERRCODE = '42501';
  END IF;

  CASE
    WHEN v_scheduled.type::text IN ('gelir', 'gider') THEN
      IF v_scheduled.hesap_id IS NULL
         OR v_scheduled.hedef_hesap_id IS NOT NULL
         OR v_scheduled.cari_id IS NOT NULL
         OR v_scheduled.personel_id IS NOT NULL THEN
        RAISE EXCEPTION 'SCHEDULED_ENTITY_SHAPE_INVALID'
          USING ERRCODE = '22023';
      END IF;
    WHEN v_scheduled.type::text = 'transfer' THEN
      IF v_scheduled.hesap_id IS NULL
         OR v_scheduled.hedef_hesap_id IS NULL
         OR v_scheduled.hesap_id = v_scheduled.hedef_hesap_id
         OR v_scheduled.cari_id IS NOT NULL
         OR v_scheduled.personel_id IS NOT NULL THEN
        RAISE EXCEPTION 'SCHEDULED_ENTITY_SHAPE_INVALID'
          USING ERRCODE = '22023';
      END IF;
    WHEN v_scheduled.type::text IN (
      'cari_alis',
      'cari_satis',
      'cari_alis_iade',
      'cari_satis_iade'
    ) THEN
      IF v_scheduled.cari_id IS NULL
         OR v_scheduled.hesap_id IS NOT NULL
         OR v_scheduled.hedef_hesap_id IS NOT NULL
         OR v_scheduled.personel_id IS NOT NULL THEN
        RAISE EXCEPTION 'SCHEDULED_ENTITY_SHAPE_INVALID'
          USING ERRCODE = '22023';
      END IF;
    WHEN v_scheduled.type::text IN ('cari_odeme', 'cari_tahsilat') THEN
      IF v_scheduled.cari_id IS NULL
         OR v_scheduled.hesap_id IS NULL
         OR v_scheduled.hedef_hesap_id IS NOT NULL
         OR v_scheduled.personel_id IS NOT NULL THEN
        RAISE EXCEPTION 'SCHEDULED_ENTITY_SHAPE_INVALID'
          USING ERRCODE = '22023';
      END IF;
    WHEN v_scheduled.type::text IN (
      'personel_gider',
      'personel_satis',
      'personel_izin_hakki',
      'personel_izin_kullanimi'
    ) THEN
      IF v_scheduled.personel_id IS NULL
         OR v_scheduled.hesap_id IS NOT NULL
         OR v_scheduled.hedef_hesap_id IS NOT NULL
         OR v_scheduled.cari_id IS NOT NULL THEN
        RAISE EXCEPTION 'SCHEDULED_ENTITY_SHAPE_INVALID'
          USING ERRCODE = '22023';
      END IF;
    WHEN v_scheduled.type::text IN (
      'personel_odeme', 'personel_tahsilat'
    ) THEN
      IF v_scheduled.personel_id IS NULL
         OR v_scheduled.hesap_id IS NULL
         OR v_scheduled.hedef_hesap_id IS NOT NULL
         OR v_scheduled.cari_id IS NOT NULL THEN
        RAISE EXCEPTION 'SCHEDULED_ENTITY_SHAPE_INVALID'
          USING ERRCODE = '22023';
      END IF;
    ELSE
      RAISE EXCEPTION 'SCHEDULED_UNSUPPORTED_TYPE'
        USING ERRCODE = '22023';
  END CASE;

  IF v_scheduled.type::text IN (
    'transfer',
    'cari_odeme',
    'cari_tahsilat',
    'personel_odeme',
    'personel_tahsilat'
  ) THEN
    v_source_currency := v_hesap_currency;
    v_target_currency := CASE
      WHEN v_scheduled.type::text = 'transfer'
        THEN v_hedef_currency
      WHEN v_scheduled.type::text LIKE 'cari_%'
        THEN v_cari_currency
      ELSE v_personel_currency
    END;
  ELSIF v_scheduled.type::text LIKE 'cari_%' THEN
    v_source_currency := v_cari_currency;
    v_target_currency := v_cari_currency;
  ELSIF v_scheduled.type::text LIKE 'personel_%' THEN
    v_source_currency := v_personel_currency;
    v_target_currency := v_personel_currency;
  ELSE
    v_source_currency := v_hesap_currency;
    v_target_currency := v_hesap_currency;
  END IF;

  IF v_source_currency NOT IN (
       'TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG'
     )
     OR v_target_currency NOT IN (
       'TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG'
     ) THEN
    RAISE EXCEPTION 'SCHEDULED_UNSUPPORTED_CURRENCY'
      USING ERRCODE = '22023';
  END IF;

  v_is_cross := v_source_currency IS DISTINCT FROM v_target_currency;
  v_completion_token := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'type', v_scheduled.type,
      'amount', v_amount,
      'description', v_scheduled.description,
      'scheduled_date', v_scheduled.scheduled_date,
      'hesap_id', v_scheduled.hesap_id,
      'hedef_hesap_id', v_scheduled.hedef_hesap_id,
      'kategori_id', v_scheduled.kategori_id,
      'cari_id', v_scheduled.cari_id,
      'personel_id', v_scheduled.personel_id,
      'source_currency', v_source_currency,
      'target_currency', v_target_currency
    )::text
  );

  IF v_rate IS NOT NULL
     AND p_expected_token IS DISTINCT FROM v_completion_token THEN
    RAISE EXCEPTION 'SCHEDULED_COMPLETION_CHANGED'
      USING ERRCODE = '55000';
  END IF;

  IF v_is_cross AND v_rate IS NULL THEN
    RAISE EXCEPTION 'CROSS_CURRENCY_RATE_REQUIRED:%->%:%:%',
      v_source_currency,
      v_target_currency,
      v_amount,
      v_completion_token
      USING ERRCODE = 'P0001';
  ELSIF NOT v_is_cross AND v_rate IS NOT NULL THEN
    RAISE EXCEPTION 'SCHEDULED_INVALID_EXCHANGE_RATE'
      USING ERRCODE = '22023';
  END IF;

  v_completion_at := COALESCE(
    p_completion_at,
    pg_catalog.clock_timestamp() AT TIME ZONE 'Europe/Istanbul'
  );

  v_payload := pg_catalog.jsonb_build_object(
    'id', p_ileri_id,
    'type', v_scheduled.type::text,
    'amount', v_amount,
    'description', v_scheduled.description,
    'date', pg_catalog.to_char(
      v_completion_at,
      'YYYY-MM-DD"T"HH24:MI:SS.US'
    ),
    'hesap_id', v_scheduled.hesap_id,
    'hedef_hesap_id', v_scheduled.hedef_hesap_id,
    'kategori_id', v_scheduled.kategori_id,
    'cari_id', v_scheduled.cari_id,
    'personel_id', v_scheduled.personel_id,
    'source_currency', v_source_currency,
    'target_currency', v_target_currency,
    'exchange_rate', CASE WHEN v_is_cross THEN v_rate ELSE NULL END,
    'source_ileri_id', p_ileri_id
  );

  v_result := public.create_islem_atomik(
    p_isletme_id,
    v_payload,
    '[]'::jsonb
  );

  UPDATE public.ileri_tarihli_islemler AS scheduled
  SET status = 'completed',
      updated_at = pg_catalog.now()
  WHERE scheduled.id = p_ileri_id
    AND scheduled.isletme_id = p_isletme_id
    AND scheduled.status IN ('pending', 'notified');

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount <> 1 THEN
    RAISE EXCEPTION 'SCHEDULED_STATUS_CONFLICT'
      USING ERRCODE = '55000';
  END IF;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.complete_ileri_tarihli_islem_atomik(
  uuid, uuid, numeric, text, timestamp without time zone
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.complete_ileri_tarihli_islem_atomik(
  uuid, uuid, numeric, text, timestamp without time zone
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.complete_ileri_tarihli_islem_atomik(
  uuid, uuid, numeric, text, timestamp without time zone
)
TO authenticated;

CREATE OR REPLACE FUNCTION public.retahsis_odeme(
  p_isletme_id uuid,
  p_odeme_islem_id uuid,
  p_hedef_borc uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_payment public.islemler;
  v_debt_types text[];
  v_advance numeric;
  v_count integer;
BEGIN
  v_payment := internal.get_islem_mutation_row_v1(
    p_isletme_id,
    p_odeme_islem_id,
    'update',
    true
  );
  v_debt_types := public.tahsis_borc_tipleri(
    v_payment.type::text
  );

  IF v_payment.cari_id IS NULL OR v_debt_types IS NULL THEN
    RAISE EXCEPTION 'REALLOCATION_INVALID_TRANSACTION'
      USING ERRCODE = '22023';
  END IF;

  IF p_hedef_borc IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.islemler AS debt
       WHERE debt.id = p_hedef_borc
         AND debt.isletme_id = p_isletme_id
         AND debt.cari_id = v_payment.cari_id
         AND debt.type::text = ANY(v_debt_types)
     ) THEN
    RAISE EXCEPTION 'REALLOCATION_TARGET_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.islem_tahsis AS allocation
  WHERE allocation.odeme_islem_id = p_odeme_islem_id
    AND allocation.isletme_id = p_isletme_id;

  v_advance := public.tahsis_odeme_esitle(
    p_isletme_id,
    p_odeme_islem_id,
    p_hedef_borc
  );

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.islem_tahsis AS allocation
  WHERE allocation.odeme_islem_id = p_odeme_islem_id
    AND allocation.isletme_id = p_isletme_id;

  RETURN pg_catalog.jsonb_build_object(
    'tahsis_adet', v_count,
    'avans', v_advance
  );
END;
$function$;

ALTER FUNCTION public.retahsis_odeme(uuid, uuid, uuid)
  OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.retahsis_odeme(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.retahsis_odeme(uuid, uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.reapply_urun_hareketler_for_islem(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_transaction public.islemler;
BEGIN
  v_transaction := internal.get_islem_mutation_row_v1(
    p_isletme_id,
    p_islem_id,
    'update',
    true
  );

  IF NOT internal.kayit_mutasyon_izni_v1(
    p_isletme_id,
    'urunler',
    v_transaction.created_by,
    'update'
  ) THEN
    RAISE EXCEPTION 'PRODUCT_REAPPLY_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  PERFORM internal.reapply_cari_urun_items_v3(
    p_isletme_id,
    p_islem_id,
    COALESCE(p_items, '[]'::jsonb),
    v_transaction.type::text,
    'update'
  );
END;
$function$;

ALTER FUNCTION public.reapply_urun_hareketler_for_islem(
  uuid, uuid, jsonb
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.reapply_urun_hareketler_for_islem(
  uuid, uuid, jsonb
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.reapply_urun_hareketler_for_islem(
  uuid, uuid, jsonb
)
TO authenticated;

CREATE OR REPLACE FUNCTION public.ekstre_link_olustur(
  p_isletme_id uuid,
  p_cari_id uuid,
  p_gecerlilik_gun integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view boolean := false;
  v_is_owner boolean := internal.isletme_sahibi_v1(p_isletme_id);
  v_rate integer;
  v_token text;
  v_expires timestamp with time zone;
BEGIN
  IF v_uid IS NULL
     OR p_isletme_id IS NULL
     OR p_cari_id IS NULL THEN
    RAISE EXCEPTION 'EKSTRE_LINK_YETKISIZ'
      USING ERRCODE = '42501';
  END IF;

  SELECT permission.can_view
  INTO v_can_view
  FROM internal.etkin_yetki_v2(
    p_isletme_id, 'cariler'
  ) AS permission;

  IF v_can_view IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'EKSTRE_LINK_YETKISIZ'
      USING ERRCODE = '42501';
  END IF;

  IF p_gecerlilik_gun IS NULL
     OR (
       v_is_owner
       AND p_gecerlilik_gun NOT IN (1, 7, 30, 365)
     )
     OR (
       NOT v_is_owner
       AND p_gecerlilik_gun NOT IN (1, 7, 30)
     ) THEN
    RAISE EXCEPTION 'EKSTRE_LINK_GECERLILIK_GECERSIZ'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cariler AS cari_row
    WHERE cari_row.id = p_cari_id
      AND cari_row.isletme_id = p_isletme_id
      AND cari_row.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'EKSTRE_LINK_CARI_BULUNAMADI'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'public.cari_ekstre_links:business:'
      || p_isletme_id::text,
      0
    )
  );

  SELECT pg_catalog.count(*)::integer
  INTO v_rate
  FROM public.cari_ekstre_links AS rate_row
  WHERE rate_row.isletme_id = p_isletme_id
    AND rate_row.created_at
      > pg_catalog.now() - INTERVAL '1 hour';

  IF v_rate >= 10 THEN
    RAISE EXCEPTION 'Cok fazla link olusturuldu'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.cari_ekstre_links AS old_link
  SET revoked = true
  WHERE old_link.isletme_id = p_isletme_id
    AND old_link.cari_id = p_cari_id
    AND old_link.created_by = v_uid
    AND old_link.revoked IS FALSE;

  v_token := pg_catalog.encode(
    extensions.gen_random_bytes(24),
    'hex'
  );
  v_expires := pg_catalog.now()
    + pg_catalog.make_interval(days => p_gecerlilik_gun);

  INSERT INTO public.cari_ekstre_links (
    token,
    isletme_id,
    cari_id,
    created_by,
    expires_at
  )
  VALUES (
    v_token,
    p_isletme_id,
    p_cari_id,
    v_uid,
    v_expires
  );

  RETURN pg_catalog.jsonb_build_object(
    'token', v_token,
    'expires_at', v_expires
  );
END;
$function$;

ALTER FUNCTION public.ekstre_link_olustur(
  uuid, uuid, integer
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.ekstre_link_olustur(
  uuid, uuid, integer
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.ekstre_link_olustur(
  uuid, uuid, integer
)
TO authenticated;


-- ---------------------------------------------------------------------------
-- ATOMIK POSTCONDITION: bir kritik obje/ACL/trigger eksikse tum migration geri
-- alinir. Kullanici tablosuna/satirina yazmaz.
-- ---------------------------------------------------------------------------
DO $postcondition$
DECLARE
  v_signature text;
  v_oid oid;
  v_authenticated_signatures text[] := ARRAY[
    'internal.etkin_yetki_v2(uuid,text)',
    'internal.kayit_mutasyon_izni_v1(uuid,text,uuid,text)',
    'internal.islem_mutasyon_izni_v2(uuid,text,uuid,text,uuid)',
    'internal.isletme_sahibi_v1(uuid)',
    'internal.aktif_uye_v1(uuid)',
    'internal.islem_kaynagi_okunabilir_v1(uuid,text)',
    'internal.islem_satiri_okunabilir_v2(uuid,text,uuid,uuid,uuid,uuid)',
    'internal.islem_ham_satiri_okunabilir_v1(uuid,text,uuid,uuid,uuid,uuid)',
    'internal.not_baglam_okuma_v2(uuid,text,uuid,uuid,uuid,uuid)',
    'internal.not_baglam_mutasyon_v2(uuid,text,uuid,uuid,uuid,uuid,uuid,text)',
    'internal.storage_photo_insert_allowed_v1(text,text)',
    'internal.storage_note_photo_select_allowed_v1(text)',
    'internal.storage_note_photo_delete_allowed_v1(text,text)',
    'internal.storage_transaction_photo_select_allowed_v2(text)',
    'internal.storage_transaction_photo_delete_allowed_v2(text,text)',
    'public.get_islem_hesap_referanslari_v2(uuid,text)',
    'public.get_yetkili_islem_satirlari_v1(uuid,integer,timestamp without time zone,uuid)',
    'public.search_yetkili_islem_satirlari_v1(uuid,text,numeric,numeric,date,date,integer)',
    'public.get_yetkili_islem_urun_kalemleri_v1(uuid,uuid[])',
    'public.get_urun_hareket_kaynak_etiketleri_v1(uuid,uuid,integer)',
    'public.get_urun_hareket_minimal_cari_labels(uuid,uuid)',
    'public.get_personel_izin_kotalari_v1(uuid)',
    'public.get_transaction_creator_labels(uuid)',
    'public.get_gelir_kaynagi_islem_satirlari_v1(uuid,text,uuid,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid)',
    'public.get_rapor_varlik_referanslari_v1(uuid,text)',
    'public.get_rapor_kategori_referanslari_v1(uuid,text)',
    'public.get_nakit_akisi_raporu_v1(uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_kategori_rapor_islem_satirlari_v1(uuid,uuid[],boolean,text,text,boolean,timestamp with time zone,timestamp with time zone,integer,timestamp without time zone,uuid)',
    'public.get_rapor_trend_ozeti_v1(uuid,text,uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_category_report_v2(uuid,text[],timestamp with time zone,timestamp with time zone)',
    'public.get_product_report_v2(uuid,timestamp with time zone,timestamp with time zone,text[])',
    'public.get_account_report(uuid,text[],timestamp with time zone,timestamp with time zone)',
    'public.get_cari_islem_satirlari_v1(uuid,uuid,integer,timestamp without time zone,timestamp with time zone,uuid)',
    'public.get_personel_islem_satirlari_v1(uuid,uuid,integer,timestamp without time zone,timestamp with time zone,uuid)',
    'public.get_hesap_islem_satirlari_v1(uuid,uuid,integer,timestamp without time zone,timestamp with time zone,uuid)',
    'public.update_cari_urunlu_islem_atomik_v3(uuid,uuid,jsonb,jsonb)',
    'public.delete_cari_urunlu_islem_atomik_v3(uuid,uuid)',
    'public.create_islem_atomik(uuid,jsonb,jsonb)',
    'public.create_islem_with_urun_atomik(uuid,jsonb,jsonb,jsonb)',
    'public.update_islem_atomik(uuid,uuid,jsonb,jsonb)',
    'public.delete_islem_atomik(uuid,uuid,jsonb)',
    'public.taksit_plani_olustur(uuid,jsonb,jsonb,jsonb)',
    'public.create_islem_atomik_v2(uuid,jsonb)',
    'public.create_cari_nakit_islem_atomik(uuid,uuid,text,numeric,timestamp without time zone,uuid,uuid,text,uuid,numeric,uuid)',
    'public.update_islem_atomik_v2(uuid,uuid,jsonb)',
    'public.delete_islem_atomik_v2(uuid,uuid)',
    'public.undo_import_batch(uuid[])',
    'public.increment_balance(text,uuid,numeric)',
    'public.update_urun_miktar(uuid,numeric,uuid)',
    'public.create_urun_hareket_atomik_v2(uuid,jsonb)',
    'public.update_urun_hareket_atomik_v2(uuid,uuid,jsonb)',
    'public.delete_urun_hareket_atomik_v2(uuid,uuid)',
    'public.complete_ileri_tarihli_islem_atomik(uuid,uuid,numeric,text,timestamp without time zone)',
    'public.archive_kategori_atomik(uuid,uuid)',
    'public.not_guncelle_v1(uuid,uuid,jsonb)',
    'public.set_urun_miktar_hedef(uuid,uuid,numeric,timestamp with time zone,text)',
    'public.get_islem_mutation_context_v1(uuid,uuid,text)',
    'public.get_cari_ozet(uuid,uuid)',
    'public.get_personel_ozet(uuid,uuid)',
    'public.get_urun_ozet(uuid,uuid)',
    'public.get_balance_activity_report(uuid)',
    'public.get_cari_vade_rozet(uuid)',
    'public.get_vade_listesi(uuid)',
    'public.get_vade_ozet(uuid)',
    'public.get_cari_vade_detay(uuid,uuid)',
    'public.get_cari_islem_kalan(uuid,uuid)',
    'public.get_taksit_plan_listesi(uuid)',
    'public.get_cari_taksit_kalan(uuid,uuid)',
    'public.ekstre_link_olustur(uuid,uuid,integer)',
    'public.ekstre_link_iptal(uuid,uuid)',
    'public.create_isletme_invite(uuid,text,text,jsonb,text)',
    'public.create_isletme_invite_v2(uuid,text,text,jsonb,text,text)',
    'public.accept_isletme_invite(text)',
    'public.generate_cari_share_code(uuid,uuid,text)',
    'public.accept_cari_share_code(text,uuid,text)',
    'public.remove_cari_link(uuid,uuid)',
    'public.get_income_expense_summary(uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_income_by_source_v2(uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_category_report(uuid,text[],timestamp with time zone,timestamp with time zone)',
    'public.get_product_report(uuid,timestamp with time zone,timestamp with time zone,text[])',
    'public.get_income_by_source(uuid,timestamp with time zone,timestamp with time zone)',
    'public.retahsis_odeme(uuid,uuid,uuid)',
    'public.reapply_urun_hareketler_for_islem(uuid,uuid,jsonb)'
  ]::text[];
  v_authenticated_no_service_signatures text[] := ARRAY[
    'public.create_urun_hareket_atomik_v2(uuid,jsonb)',
    'public.update_urun_hareket_atomik_v2(uuid,uuid,jsonb)',
    'public.delete_urun_hareket_atomik_v2(uuid,uuid)',
    'public.undo_import_batch(uuid[])'
  ]::text[];
  v_service_signatures text[] := ARRAY[
    'public.cari_ekstre_token_dogrula_v1(text)',
    'public.check_rate_limit(uuid,text,integer)',
    'public.record_api_usage(uuid,text)'
  ]::text[];
  v_authenticated_service_signatures text[] := ARRAY[
    'public.get_remaining_usage(uuid,text,integer)'
  ]::text[];
  v_private_definer_signatures text[] := ARRAY[
    'internal.not_baglam_hedef_gecerli_v1(uuid,text,uuid,uuid,uuid,uuid)',
    'internal.islem_birikim_bacaklari_okunabilir_v1(uuid,uuid,uuid)',
    'internal.enforce_linked_product_movement_permission_v1()',
    'internal.reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)',
    'internal.apply_balance_ops_v2(uuid,jsonb)',
    'internal.apply_islem_update_canonical_v2(uuid,uuid,jsonb,jsonb)',
    'internal.delete_islem_canonical_v2(uuid,uuid)',
    'internal.get_islem_mutation_row_v1(uuid,uuid,text,boolean)',
    'internal.enforce_islem_source_mutation_v2()',
    'internal.enforce_category_archive_guard_v2()',
    'internal.enforce_owner_only_active_toggle_v1()',
    'internal.enforce_tenant_row_identity_immutable_v1()',
    'internal.enforce_product_movement_identity_immutable_v1()',
    'internal.enforce_entity_delete_references_v1()',
    'public.enforce_notlar_identity_v1()',
    'internal.consume_code_attempt_v2(text)',
    'internal.enforce_cari_statement_link_v2()',
    'public._vade_birim_mahsuplu(uuid,uuid)',
    'public.handle_new_user()',
    'public.log_islem_changes()',
    'public.set_audit_fields()'
  ]::text[];
  v_execute_revoked_signatures text[] := ARRAY[
    'public.perform_nakit_avans(uuid,uuid,uuid,numeric,numeric,uuid,text,timestamp with time zone,boolean,integer)',
    'public.perform_taksit_odeme(uuid,uuid,uuid)',
    'public.delete_nakit_avans_with_reversal(uuid,uuid)'
  ]::text[];
  v_existence_only_signatures text[] := ARRAY[
    'public.get_category_report(uuid,text[],timestamp with time zone,timestamp with time zone)',
    'public.get_product_report(uuid,timestamp with time zone,timestamp with time zone,text[])',
    'public.get_income_by_source(uuid,timestamp with time zone,timestamp with time zone)'
  ]::text[];
BEGIN
  FOREACH v_signature IN ARRAY (
    v_authenticated_signatures
    || v_service_signatures
    || v_authenticated_service_signatures
    || v_private_definer_signatures
    || v_execute_revoked_signatures
    || v_existence_only_signatures
  ) LOOP
    IF pg_catalog.to_regprocedure(v_signature) IS NULL THEN
      RAISE EXCEPTION 'PERMISSION_V2_POSTCONDITION_MISSING: %', v_signature
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  FOREACH v_signature IN ARRAY v_authenticated_signatures LOOP
    v_oid := pg_catalog.to_regprocedure(v_signature);
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS function_row
      INNER JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = function_row.proowner
      WHERE function_row.oid = v_oid
        AND function_row.prosecdef IS TRUE
        AND owner_role.rolname = 'postgres'
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(function_row.proconfig) AS config(value)
          WHERE config.value LIKE 'search_path=%'
        )
    )
    OR NOT pg_catalog.has_function_privilege(
      'authenticated', v_oid, 'EXECUTE'
    )
    OR pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(
          (SELECT function_row.proacl
           FROM pg_catalog.pg_proc AS function_row
           WHERE function_row.oid = v_oid),
          pg_catalog.acldefault(
            'f',
            (SELECT function_row.proowner
             FROM pg_catalog.pg_proc AS function_row
             WHERE function_row.oid = v_oid)
          )
        )
      ) AS acl_row
      WHERE acl_row.grantee = 0
        AND acl_row.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'PERMISSION_V2_POSTCONDITION_ACL: %', v_signature
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  FOREACH v_signature IN ARRAY v_authenticated_no_service_signatures LOOP
    v_oid := pg_catalog.to_regprocedure(v_signature);
    IF pg_catalog.has_function_privilege(
      'service_role', v_oid, 'EXECUTE'
    ) THEN
      RAISE EXCEPTION
        'PERMISSION_V2_POSTCONDITION_ATOMIC_MOVEMENT_ACL: %',
        v_signature
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  FOREACH v_signature IN ARRAY v_service_signatures LOOP
    v_oid := pg_catalog.to_regprocedure(v_signature);
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS function_row
      INNER JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = function_row.proowner
      WHERE function_row.oid = v_oid
        AND function_row.prosecdef IS TRUE
        AND owner_role.rolname = 'postgres'
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(function_row.proconfig) AS config(value)
          WHERE config.value LIKE 'search_path=%'
        )
    )
    OR NOT pg_catalog.has_function_privilege(
      'service_role', v_oid, 'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated', v_oid, 'EXECUTE'
    )
    OR pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(
          (SELECT function_row.proacl
           FROM pg_catalog.pg_proc AS function_row
           WHERE function_row.oid = v_oid),
          pg_catalog.acldefault(
            'f',
            (SELECT function_row.proowner
             FROM pg_catalog.pg_proc AS function_row
             WHERE function_row.oid = v_oid)
          )
        )
      ) AS acl_row
      WHERE acl_row.grantee = 0
        AND acl_row.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'PERMISSION_V2_POSTCONDITION_ACL: %', v_signature
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  FOREACH v_signature IN ARRAY v_authenticated_service_signatures LOOP
    v_oid := pg_catalog.to_regprocedure(v_signature);
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS function_row
      INNER JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = function_row.proowner
      WHERE function_row.oid = v_oid
        AND function_row.prosecdef IS TRUE
        AND owner_role.rolname = 'postgres'
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(function_row.proconfig) AS config(value)
          WHERE config.value LIKE 'search_path=%'
        )
    )
    OR NOT pg_catalog.has_function_privilege(
      'authenticated', v_oid, 'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'service_role', v_oid, 'EXECUTE'
    )
    OR pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(
          (SELECT function_row.proacl
           FROM pg_catalog.pg_proc AS function_row
           WHERE function_row.oid = v_oid),
          pg_catalog.acldefault(
            'f',
            (SELECT function_row.proowner
             FROM pg_catalog.pg_proc AS function_row
             WHERE function_row.oid = v_oid)
          )
        )
      ) AS acl_row
      WHERE acl_row.grantee = 0
        AND acl_row.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'PERMISSION_V2_POSTCONDITION_ACL: %', v_signature
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  FOREACH v_signature IN ARRAY v_private_definer_signatures LOOP
    v_oid := pg_catalog.to_regprocedure(v_signature);
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS function_row
      INNER JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = function_row.proowner
      WHERE function_row.oid = v_oid
        AND function_row.prosecdef IS TRUE
        AND owner_role.rolname = 'postgres'
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(function_row.proconfig) AS config(value)
          WHERE config.value LIKE 'search_path=%'
        )
    )
    OR pg_catalog.has_function_privilege(
      'authenticated', v_oid, 'EXECUTE'
    )
    OR pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
    OR pg_catalog.has_function_privilege(
      'service_role', v_oid, 'EXECUTE'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(
          (SELECT function_row.proacl
           FROM pg_catalog.pg_proc AS function_row
           WHERE function_row.oid = v_oid),
          pg_catalog.acldefault(
            'f',
            (SELECT function_row.proowner
             FROM pg_catalog.pg_proc AS function_row
             WHERE function_row.oid = v_oid)
          )
        )
      ) AS acl_row
      WHERE acl_row.grantee = 0
        AND acl_row.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION
        'PERMISSION_V2_POSTCONDITION_INTERNAL_ACTION_ACL: %',
        v_signature
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  FOREACH v_signature IN ARRAY v_execute_revoked_signatures LOOP
    v_oid := pg_catalog.to_regprocedure(v_signature);
    IF pg_catalog.has_function_privilege(
      'authenticated', v_oid, 'EXECUTE'
    )
    OR pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
    OR pg_catalog.has_function_privilege(
      'service_role', v_oid, 'EXECUTE'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(
          (SELECT function_row.proacl
           FROM pg_catalog.pg_proc AS function_row
           WHERE function_row.oid = v_oid),
          pg_catalog.acldefault(
            'f',
            (SELECT function_row.proowner
             FROM pg_catalog.pg_proc AS function_row
             WHERE function_row.oid = v_oid)
          )
        )
      ) AS acl_row
      WHERE acl_row.grantee = 0
        AND acl_row.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION
        'PERMISSION_V2_POSTCONDITION_INTERNAL_ACTION_ACL: %',
        v_signature
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  IF pg_catalog.to_regclass(
       'internal.permission_v2_movement_action_context'
     ) IS NULL
  OR pg_catalog.to_regclass(
       'internal.permission_v2_code_attempts'
     ) IS NULL
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(
      ARRAY['authenticated', 'anon', 'service_role']::text[]
    ) AS api_role(role_name)
    CROSS JOIN pg_catalog.unnest(
      ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]::text[]
    ) AS table_privilege(privilege_name)
    WHERE pg_catalog.has_table_privilege(
      api_role.role_name,
      'internal.permission_v2_movement_action_context',
      table_privilege.privilege_name
    )
  )
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(
      ARRAY['authenticated', 'anon', 'service_role']::text[]
    ) AS api_role(role_name)
    CROSS JOIN pg_catalog.unnest(
      ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]::text[]
    ) AS table_privilege(privilege_name)
    WHERE pg_catalog.has_table_privilege(
      api_role.role_name,
      'internal.permission_v2_code_attempts',
      table_privilege.privilege_name
    )
  )
  OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_class AS table_row
    INNER JOIN pg_catalog.pg_namespace AS schema_row
      ON schema_row.oid = table_row.relnamespace
    INNER JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = table_row.relowner
    WHERE schema_row.nspname = 'internal'
      AND table_row.relname IN (
        'permission_v2_movement_action_context',
        'permission_v2_code_attempts'
      )
      AND table_row.relkind = 'r'
      AND owner_role.rolname = 'postgres'
  ) <> 2
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS table_row
    INNER JOIN pg_catalog.pg_namespace AS schema_row
      ON schema_row.oid = table_row.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        table_row.relacl,
        pg_catalog.acldefault('r', table_row.relowner)
      )
    ) AS acl_row
    WHERE schema_row.nspname = 'internal'
      AND table_row.relname IN (
        'permission_v2_movement_action_context',
        'permission_v2_code_attempts'
      )
      AND acl_row.grantee = 0
  ) THEN
    RAISE EXCEPTION 'PERMISSION_V2_POSTCONDITION_CODE_ATTEMPT'
      USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.to_regclass(
       'internal.permission_v2_code_attempts_id_seq'
     ) IS NULL
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(
      ARRAY['authenticated', 'anon', 'service_role']::text[]
    ) AS api_role(role_name)
    CROSS JOIN pg_catalog.unnest(
      ARRAY['USAGE', 'SELECT', 'UPDATE']::text[]
    ) AS sequence_privilege(privilege_name)
    WHERE pg_catalog.has_sequence_privilege(
      api_role.role_name,
      'internal.permission_v2_code_attempts_id_seq',
      sequence_privilege.privilege_name
    )
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS sequence_row
    INNER JOIN pg_catalog.pg_namespace AS schema_row
      ON schema_row.oid = sequence_row.relnamespace
    INNER JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = sequence_row.relowner
    WHERE schema_row.nspname = 'internal'
      AND sequence_row.relname = 'permission_v2_code_attempts_id_seq'
      AND sequence_row.relkind = 'S'
      AND owner_role.rolname = 'postgres'
  )
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS sequence_row
    INNER JOIN pg_catalog.pg_namespace AS schema_row
      ON schema_row.oid = sequence_row.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        sequence_row.relacl,
        pg_catalog.acldefault('s', sequence_row.relowner)
      )
    ) AS acl_row
    WHERE schema_row.nspname = 'internal'
      AND sequence_row.relname = 'permission_v2_code_attempts_id_seq'
      AND acl_row.grantee = 0
  ) THEN
    RAISE EXCEPTION 'PERMISSION_V2_POSTCONDITION_CODE_ATTEMPT_SEQUENCE'
      USING ERRCODE = '55000';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname IN (
      'trg_hesaplar_active_owner_v1',
      'trg_cariler_active_owner_v1',
      'trg_personel_active_owner_v1',
      'trg_urunler_active_owner_v1',
      'trg_urun_hareket_link_permission_v1',
      'trg_permission_v2_category_archive_guard',
      'zz_permission_v2_islem_source_guard',
      'zz_permission_v2_cari_statement_link_guard'
    )
      AND trigger_row.tgisinternal IS FALSE
  ) <> 8
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'trg_urun_hareket_link_permission_v1'
      AND pg_catalog.pg_get_triggerdef(trigger_row.oid) ILIKE '%INSERT%'
      AND pg_catalog.pg_get_triggerdef(trigger_row.oid) ILIKE '%UPDATE%'
      AND pg_catalog.pg_get_triggerdef(trigger_row.oid) ILIKE '%DELETE%'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'trg_permission_v2_category_archive_guard'
      AND pg_catalog.pg_get_triggerdef(trigger_row.oid) ILIKE '%UPDATE%'
      AND pg_catalog.pg_get_triggerdef(trigger_row.oid) ILIKE '%DELETE%'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'zz_permission_v2_islem_source_guard'
      AND pg_catalog.pg_get_triggerdef(trigger_row.oid) ILIKE '%INSERT%'
      AND pg_catalog.pg_get_triggerdef(trigger_row.oid) ILIKE '%UPDATE%'
      AND pg_catalog.pg_get_triggerdef(trigger_row.oid) ILIKE '%DELETE%'
  )
  OR pg_catalog.pg_get_function_result(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) IS DISTINCT FROM 'json'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%c_max_batch CONSTANT integer := 50000%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%business.user_id = auth.uid()%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%ORDER BY transaction_row.id%FOR UPDATE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%ORDER BY movement.urun_id, movement.id%FOR UPDATE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%ORDER BY product.id%FOR UPDATE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%v_locked_product_count <> v_expected_product_count%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%v_updated_product_count <> v_expected_product_count%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%UPDATE public.hesaplar AS account%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%UPDATE public.cariler AS customer%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%UPDATE public.personel AS employee%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%UPDATE public.urunler AS product%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%WHEN ''giris''%THEN -pg_catalog.abs(COALESCE(movement.miktar, 0))%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%WHEN ''cikis''%THEN pg_catalog.abs(COALESCE(movement.miktar, 0))%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%ELSE -COALESCE(movement.miktar, 0)%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%DELETE FROM public.islemler AS transaction_row%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%INSERT INTO internal.permission_v2_movement_action_context%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%v_inserted_context_count <> v_input_count%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%deleted_count <> v_input_count%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%DELETE FROM internal.permission_v2_movement_action_context%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%v_deleted_context_count <> v_input_count%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) ILIKE '%ON CONFLICT%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) NOT ILIKE '%''deleted_transactions''%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
  ) ILIKE '%DELETE FROM public.urun_hareketler%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_islem_source_mutation_v2()'
    )
  ) NOT ILIKE '%permission_v2_movement_action_context%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_islem_source_mutation_v2()'
    )
  ) NOT ILIKE '%ISLEM_CANONICAL_RPC_REQUIRED%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_islem_source_mutation_v2()'
    )
  ) NOT ILIKE '%Deleting the tenant root cascades to islemler%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_islem_source_mutation_v2()'
    )
  ) NOT ILIKE '%FROM public.isletmeler AS business%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_islem_source_mutation_v2()'
    )
  ) NOT ILIKE '%v_opened_movement_delete_context%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_islem_source_mutation_v2()'
    )
  ) NOT ILIKE '%INSERT INTO internal.permission_v2_movement_action_context%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_islem_source_mutation_v2()'
    )
  ) NOT ILIKE '%DELETE FROM public.urun_hareketler AS movement_row%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_islem_source_mutation_v2()'
    )
  ) NOT ILIKE '%DELETE FROM internal.permission_v2_movement_action_context%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_islem_source_mutation_v2()'
    )
  ) ILIKE '%UPDATE public.urunler%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_islem_source_mutation_v2()'
    )
  ) ILIKE '%update_urun_miktar%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.create_islem_atomik_v2(uuid,jsonb)'
    )
  ) NOT ILIKE '%permission_v2_movement_action_context%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.apply_islem_update_canonical_v2(uuid,uuid,jsonb,jsonb)'
    )
  ) NOT ILIKE '%permission_v2_movement_action_context%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.delete_islem_canonical_v2(uuid,uuid)'
    )
  ) NOT ILIKE '%permission_v2_movement_action_context%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.create_cari_nakit_islem_atomik(uuid,uuid,text,numeric,timestamp without time zone,uuid,uuid,text,uuid,numeric,uuid)'
    )
  ) NOT ILIKE '%create_islem_atomik_v2%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.create_islem_atomik(uuid,jsonb,jsonb)'
    )
  ) NOT ILIKE '%permission_v2_movement_action_context%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.update_islem_atomik(uuid,uuid,jsonb,jsonb)'
    )
  ) NOT ILIKE '%permission_v2_movement_action_context%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_islem_source_mutation_v2()'
    )
  ) NOT ILIKE '%action_context.action = ''create''%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_islem_source_mutation_v2()'
    )
  ) NOT ILIKE '%action_context.action = ''update''%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_cari_islem_satirlari_v1(uuid,uuid,integer,timestamp without time zone,timestamp with time zone,uuid)'
    )
  ) NOT ILIKE '%hesap.type::text <> ''birikim''%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_cari_islem_satirlari_v1(uuid,uuid,integer,timestamp without time zone,timestamp with time zone,uuid)'
    )
  ) NOT ILIKE '%v_can_view_birikim IS TRUE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_personel_islem_satirlari_v1(uuid,uuid,integer,timestamp without time zone,timestamp with time zone,uuid)'
    )
  ) NOT ILIKE
    '%hesap.type::text <> ''birikim''%OR v_can_view_birikim IS TRUE%OR v_reports IS TRUE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_urun_hareket_kaynak_etiketleri_v1(uuid,uuid,integer)'
    )
  ) NOT ILIKE '%v_can_view_accounts IS TRUE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_urun_hareket_kaynak_etiketleri_v1(uuid,uuid,integer)'
    )
  ) NOT ILIKE '%account.type::text <> ''birikim''%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_urun_hareket_kaynak_etiketleri_v1(uuid,uuid,integer)'
    )
  ) NOT ILIKE '%v_can_view_personnel IS NOT TRUE%'
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'zz_permission_v2_cari_statement_link_guard'
      AND pg_catalog.pg_get_triggerdef(trigger_row.oid) ILIKE '%INSERT%'
  )
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'public'
      AND policy_row.policyname IN (
        'Permission v2 read hesaplar',
        'Permission v2 read cariler',
        'Permission v2 read personel',
        'Permission v2 read urunler'
      )
      AND policy_row.qual ILIKE '%raporlar%'
  )
  OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'public'
      AND policy_row.tablename = 'hesaplar'
      AND policy_row.policyname IN (
        'Permission v2 read hesaplar',
        'Permission v2 passive hesaplar owner only',
        'Permission v2 update hesaplar',
        'Permission v2 delete hesaplar',
        'Permission v2 update gate hesaplar',
        'Permission v2 delete gate hesaplar'
      )
      AND policy_row.qual ILIKE '%birikim%'
  ) <> 6
  OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'public'
      AND policy_row.tablename = 'hesaplar'
      AND policy_row.policyname IN (
        'Permission v2 passive hesaplar owner only',
        'Permission v2 insert hesaplar',
        'Permission v2 update hesaplar',
        'Permission v2 insert gate hesaplar',
        'Permission v2 update gate hesaplar'
      )
      AND policy_row.with_check ILIKE '%birikim%'
  ) <> 5
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'public'
      AND policy_row.tablename = 'hesaplar'
      AND policy_row.policyname =
        'Permission v2 passive hesaplar owner only'
      AND policy_row.permissive = 'RESTRICTIVE'
      AND policy_row.qual ILIKE '%birikim%'
      AND policy_row.with_check ILIKE '%birikim%'
  )
  OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'public'
      AND policy_row.tablename = 'notlar'
      AND policy_row.policyname IN (
        'Shared select notlar',
        'Shared insert notlar',
        'Shared update notlar',
        'Shared delete notlar',
        'Shared attach own not photo'
      )
      AND (
        COALESCE(policy_row.qual, '')
        || COALESCE(policy_row.with_check, '')
      ) ILIKE '%not_baglam_%'
  ) <> 5
  OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'public'
      AND policy_row.tablename = 'notlar'
      AND policy_row.policyname IN (
        'Shared update notlar',
        'Shared delete notlar',
        'Shared attach own not photo'
      )
      AND policy_row.qual ILIKE '%assigned_to_user%'
      AND policy_row.qual ILIKE '%auth.uid%'
  ) <> 3
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'storage'
      AND policy_row.tablename = 'objects'
      AND policy_row.policyname = 'islem_photos_note_select_v1'
      AND policy_row.qual ILIKE
        '%storage_transaction_photo_select_allowed_v2%'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'storage'
      AND policy_row.tablename = 'objects'
      AND policy_row.policyname = 'islem_photos_note_delete_v1'
      AND policy_row.qual ILIKE
        '%storage_transaction_photo_delete_allowed_v2%'
  )
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.not_baglam_hedef_gecerli_v1(uuid,text,uuid,uuid,uuid,uuid)'
    )
  ) NOT ILIKE '%account.type::text <> ''birikim''%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.not_baglam_okuma_v2(uuid,text,uuid,uuid,uuid,uuid)'
    )
  ) NOT ILIKE '%array_append(v_modules, ''birikim'')%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.not_baglam_mutasyon_v2(uuid,text,uuid,uuid,uuid,uuid,uuid,text)'
    )
  ) NOT ILIKE '%array_append(v_modules, ''birikim'')%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.storage_photo_insert_allowed_v1(text,text)'
    )
  ) NOT ILIKE '%islem_birikim_bacaklari_okunabilir_v1%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.storage_transaction_photo_select_allowed_v2(text)'
    )
  ) NOT ILIKE '%islem_birikim_bacaklari_okunabilir_v1%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.storage_transaction_photo_delete_allowed_v2(text,text)'
    )
  ) NOT ILIKE '%islem_birikim_bacaklari_okunabilir_v1%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%PRODUCT_MOVEMENT_CANONICAL_RPC_REQUIRED%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%v_context_action NOT IN (''create'', ''update'', ''delete'')%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%TG_OP <> ''DELETE''%AND NOT v_is_owner%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%PRODUCT_MOVEMENT_INVALID_LINKED_PAYLOAD%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%product.is_archived IS FALSE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%product.is_active IS NOT TRUE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%product.is_archived IS NOT FALSE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%immediate FK cascade%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%Business hard-delete cascades%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%FROM public.isletmeler AS business%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%OLD.islem_id IS NOT NULL%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%NEW.islem_id IS NULL%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%IS NOT DISTINCT FROM (OLD.id, OLD.isletme_id, OLD.urun_id)%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%ARRAY[''islem_id'', ''updated_by'']%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%transaction_row.id = OLD.islem_id%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)'
    )
  ) NOT ILIKE '%action_context.action = p_authorization_action%'
  OR (
    SELECT procedure_row.provolatile
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(
      'public.get_islem_mutation_context_v1(uuid,uuid,text)'
    )
  ) <> 'v'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_islem_mutation_context_v1(uuid,uuid,text)'
    )
  ) NOT ILIKE '%get_islem_mutation_row_v1%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.get_islem_mutation_row_v1(uuid,uuid,text,boolean)'
    )
  ) NOT ILIKE '%product.is_archived IS TRUE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_urun_hareket_minimal_cari_labels(uuid,uuid)'
    )
  ) NOT ILIKE '%product.is_active IS TRUE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_urun_hareket_minimal_cari_labels(uuid,uuid)'
    )
  ) NOT ILIKE '%customer.is_active IS TRUE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_personel_izin_kotalari_v1(uuid)'
    )
  ) NOT ILIKE '%employee.is_active IS TRUE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_transaction_creator_labels(uuid)'
    )
  ) NOT ILIKE '%product_permission.can_view IS TRUE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_gelir_kaynagi_islem_satirlari_v1(uuid,text,uuid,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid)'
    )
  ) NOT ILIKE '%v_accounts%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_gelir_kaynagi_islem_satirlari_v1(uuid,text,uuid,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid)'
    )
  ) NOT ILIKE '%WHEN v_is_owner THEN transaction_row.updated_by%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_yetkili_islem_satirlari_v1(uuid,integer,timestamp without time zone,uuid)'
    )
  ) NOT ILIKE '%label_product.is_active IS TRUE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.search_yetkili_islem_satirlari_v1(uuid,text,numeric,numeric,date,date,integer)'
    )
  ) NOT ILIKE '%search_product.is_active IS TRUE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_yetkili_islem_urun_kalemleri_v1(uuid,uuid[])'
    )
  ) NOT ILIKE '%product.is_active IS TRUE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_category_report_v2(uuid,text[],timestamp with time zone,timestamp with time zone)'
    )
  ) ILIKE '%is_active IS NOT FALSE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.get_product_report_v2(uuid,timestamp with time zone,timestamp with time zone,text[])'
    )
  ) ILIKE '%is_active IS NOT FALSE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.update_urun_miktar(uuid,numeric,uuid)'
    )
  ) NOT ILIKE '%NOT internal.isletme_sahibi_v1(p_isletme_id)%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.update_urun_miktar(uuid,numeric,uuid)'
    )
  ) ILIKE '%product.is_active IS TRUE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.update_urun_miktar(uuid,numeric,uuid)'
    )
  ) ILIKE '%product.is_archived IS FALSE%'
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'public'
      AND policy_row.tablename = 'urunler'
      AND policy_row.policyname = 'Permission v2 insert gate urunler'
      AND policy_row.permissive = 'RESTRICTIVE'
      AND (
        policy_row.with_check ILIKE '%miktar IS NOT DISTINCT FROM 0%'
        OR policy_row.with_check
          ILIKE '%NOT (miktar IS DISTINCT FROM (0)::numeric)%'
      )
      AND policy_row.with_check ILIKE '%isletme_sahibi_v1%'
  )
  OR pg_catalog.has_table_privilege(
    'authenticated', 'public.urunler', 'UPDATE'
  )
  OR pg_catalog.has_column_privilege(
    'authenticated', 'public.urunler', 'miktar', 'UPDATE'
  )
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(
      ARRAY[
        'id',
        'isletme_id',
        'miktar',
        'created_at',
        'updated_at',
        'created_by',
        'updated_by'
      ]::text[]
    ) AS protected_column(column_name)
    WHERE pg_catalog.has_column_privilege(
      'authenticated',
      'public.urunler',
      protected_column.column_name,
      'UPDATE'
    )
  )
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(
      ARRAY[
        'ad',
        'kod',
        'birim',
        'alis_fiyati',
        'satis_fiyati',
        'currency',
        'aciklama',
        'is_active',
        'is_archived',
        'kategori_id',
        'kdv_orani'
      ]::text[]
    ) AS metadata_column(column_name)
    WHERE NOT pg_catalog.has_column_privilege(
      'authenticated',
      'public.urunler',
      metadata_column.column_name,
      'UPDATE'
    )
  )
  OR pg_catalog.has_table_privilege(
    'anon', 'public.urunler', 'UPDATE'
  )
  OR pg_catalog.has_any_column_privilege(
    'anon', 'public.urunler', 'UPDATE'
  )
  OR NOT pg_catalog.has_table_privilege(
    'service_role', 'public.urunler', 'UPDATE'
  )
  OR NOT pg_catalog.has_table_privilege(
    'postgres', 'public.urunler', 'UPDATE'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'public'
      AND policy_row.tablename = 'urun_hareketler'
      AND policy_row.policyname =
        'Permission v2 active urun hareketleri owner only'
      AND policy_row.permissive = 'RESTRICTIVE'
      AND policy_row.qual ILIKE '%product.is_active IS TRUE%'
  )
  OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'public'
      AND policy_row.tablename = 'urun_hareketler'
      AND policy_row.permissive = 'RESTRICTIVE'
      AND (
        COALESCE(policy_row.qual, '')
        || COALESCE(policy_row.with_check, '')
      ) ILIKE '%isletme_sahibi_v1%'
      AND (
        (
          policy_row.policyname =
            'Permission v2 direct insert urun hareketleri owner only'
          AND policy_row.cmd = 'INSERT'
          AND policy_row.with_check ILIKE '%isletme_sahibi_v1%'
        )
        OR (
          policy_row.policyname =
            'Permission v2 direct update urun hareketleri owner only'
          AND policy_row.cmd = 'UPDATE'
          AND policy_row.qual ILIKE '%isletme_sahibi_v1%'
          AND policy_row.with_check ILIKE '%isletme_sahibi_v1%'
        )
        OR (
          policy_row.policyname =
            'Permission v2 direct delete urun hareketleri owner only'
          AND policy_row.cmd = 'DELETE'
          AND policy_row.qual ILIKE '%isletme_sahibi_v1%'
        )
      )
  ) <> 3
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_linked_product_movement_permission_v1()'
    )
  ) NOT ILIKE '%v_islem_ids[v_context_index] IS NULL%'
  OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'public'
      AND policy_row.tablename IN ('islemler', 'ileri_tarihli_islemler')
      AND policy_row.policyname LIKE 'Permission v2%'
      AND (
        COALESCE(policy_row.qual, '')
        || COALESCE(policy_row.with_check, '')
      ) ILIKE '%islem_ham_satiri_okunabilir_v1%'
  ) <> 16
  OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'public'
      AND policy_row.policyname IN (
        'Permission v2 passive hesaplar owner only',
        'Permission v2 passive cariler owner only',
        'Permission v2 passive personel owner only',
        'Permission v2 passive urunler owner only'
      )
      AND policy_row.qual ILIKE '%is_active IS TRUE%'
      AND policy_row.with_check ILIKE '%is_active IS TRUE%'
  ) <> 4
  OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'public'
      AND (
        (policy_row.tablename = 'taksit_planlari'
         AND policy_row.policyname = 'taksit_planlari_select')
        OR (policy_row.tablename = 'taksitler'
            AND policy_row.policyname = 'taksitler_select')
        OR (policy_row.tablename = 'islem_tahsis'
            AND policy_row.policyname = 'islem_tahsis_select')
      )
      AND policy_row.qual ILIKE '%cariler%'
      AND policy_row.qual ILIKE '%is_active IS TRUE%'
  ) <> 3
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_category_archive_guard_v2()'
    )
  ) NOT ILIKE '%OLD.is_active IS TRUE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_category_archive_guard_v2()'
    )
  ) NOT ILIKE '%NEW.is_active IS NOT TRUE%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_category_archive_guard_v2()'
    )
  ) NOT ILIKE '%CATEGORY_ACTIVE_STATE_REQUIRED%'
  OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'public'
      AND policy_row.tablename = 'kategoriler'
      AND policy_row.policyname IN (
        'Permission v2 category insert state gate',
        'Permission v2 category update state gate'
      )
      AND policy_row.permissive = 'RESTRICTIVE'
      AND policy_row.with_check ILIKE '%is_active IS NOT NULL%'
      AND policy_row.with_check ILIKE '%is_active IS TRUE%'
      AND policy_row.with_check ILIKE '%isletme_sahibi_v1%'
  ) <> 2
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_tenant_row_identity_immutable_v1()'
    )
  ) NOT ILIKE '%NEW.id IS DISTINCT FROM OLD.id%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_tenant_row_identity_immutable_v1()'
    )
  ) NOT ILIKE '%NEW.isletme_id IS DISTINCT FROM OLD.isletme_id%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_product_movement_identity_immutable_v1()'
    )
  ) NOT ILIKE '%NEW.urun_id IS DISTINCT FROM OLD.urun_id%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_product_movement_identity_immutable_v1()'
    )
  ) NOT ILIKE '%NEW.islem_id IS DISTINCT FROM OLD.islem_id%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_product_movement_identity_immutable_v1()'
    )
  ) NOT ILIKE '%FROM public.isletmeler AS business%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_product_movement_identity_immutable_v1()'
    )
  ) NOT ILIKE '%OLD.islem_id IS NOT NULL%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_product_movement_identity_immutable_v1()'
    )
  ) NOT ILIKE '%NEW.islem_id IS NULL%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_product_movement_identity_immutable_v1()'
    )
  ) NOT ILIKE '%IS NOT DISTINCT FROM (OLD.id, OLD.isletme_id, OLD.urun_id)%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_product_movement_identity_immutable_v1()'
    )
  ) NOT ILIKE '%transaction_row.id = OLD.islem_id%'
  OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger AS trigger_row
    INNER JOIN pg_catalog.pg_class AS table_row
      ON table_row.oid = trigger_row.tgrelid
    INNER JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = table_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND trigger_row.tgisinternal IS FALSE
      AND trigger_row.tgenabled IN ('O', 'A')
      AND (
        trigger_row.tgname,
        table_row.relname
      ) IN (
        ('trg_permission_v2_identity_immutable_hesaplar', 'hesaplar'),
        ('trg_permission_v2_identity_immutable_cariler', 'cariler'),
        ('trg_permission_v2_identity_immutable_personel', 'personel'),
        ('trg_permission_v2_identity_immutable_urunler', 'urunler'),
        ('trg_permission_v2_identity_immutable_kategoriler', 'kategoriler'),
        (
          'trg_permission_v2_identity_immutable_ileri_tarihli_islemler',
          'ileri_tarihli_islemler'
        ),
        (
          'trg_permission_v2_identity_immutable_urun_hareketler',
          'urun_hareketler'
        )
      )
      AND pg_catalog.pg_get_triggerdef(trigger_row.oid)
        ILIKE '%BEFORE UPDATE%'
      AND pg_catalog.pg_get_triggerdef(trigger_row.oid)
        ILIKE '%identity_immutable_v1%'
  ) <> 7
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%ACCOUNT_HAS_LINKED_RECORDS%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%CUSTOMER_HAS_LINKED_RECORDS%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%PERSONNEL_HAS_LINKED_RECORDS%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%PRODUCT_HAS_LINKED_TRANSACTIONS%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%public.islemler%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%public.ileri_tarihli_islemler%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%public.cekler%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%public.nakit_avanslar%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%public.cari_links%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%public.irsaliye_records%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%public.taksit_planlari%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%public.islem_tahsis%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%movement_row.islem_id IS NOT NULL%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%UPDATE public.notlar%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%SET entity_type = ''genel''%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%entity_id = NULL%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%entity_type = ''hesap''%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%entity_type = ''cari''%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%entity_type IN (''personel'', ''personel_izin'')%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%entity_type = ''urun''%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'internal.enforce_entity_delete_references_v1()'
    )
  ) NOT ILIKE '%internal.permission_v2_note_detach_context%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.enforce_notlar_identity_v1()'
    )
  ) NOT ILIKE '%NOTLAR_DIRECT_ENTITY_DETACH_FORBIDDEN%'
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.enforce_notlar_identity_v1()'
    )
  ) NOT ILIKE '%internal.permission_v2_note_detach_context%'
  OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.regexp_matches(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.enforce_notlar_identity_v1()'
        )
      ),
      'FOR KEY SHARE',
      'g'
    )
  ) <> 4
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    INNER JOIN pg_catalog.pg_class AS table_row
      ON table_row.oid = trigger_row.tgrelid
    INNER JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = table_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND table_row.relname = 'notlar'
      AND trigger_row.tgname = 'trg_notlar_enforce_identity_v1'
      AND trigger_row.tgisinternal IS FALSE
      AND trigger_row.tgenabled IN ('O', 'A')
      AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
        'public.enforce_notlar_identity_v1()'
      )
      AND pg_catalog.pg_get_triggerdef(trigger_row.oid)
        ILIKE '%BEFORE INSERT OR UPDATE%'
  )
  OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger AS trigger_row
    INNER JOIN pg_catalog.pg_class AS table_row
      ON table_row.oid = trigger_row.tgrelid
    INNER JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = table_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND trigger_row.tgisinternal IS FALSE
      AND trigger_row.tgenabled IN ('O', 'A')
      AND (
        trigger_row.tgname,
        table_row.relname
      ) IN (
        ('trg_permission_v2_delete_reference_guard_hesaplar', 'hesaplar'),
        ('trg_permission_v2_delete_reference_guard_cariler', 'cariler'),
        ('trg_permission_v2_delete_reference_guard_personel', 'personel'),
        ('trg_permission_v2_delete_reference_guard_urunler', 'urunler')
      )
      AND pg_catalog.pg_get_triggerdef(trigger_row.oid)
        ILIKE '%BEFORE DELETE%'
      AND pg_catalog.pg_get_triggerdef(trigger_row.oid)
        ILIKE '%enforce_entity_delete_references_v1%'
  ) <> 4
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'public'
      AND policy_row.tablename = 'kategoriler'
      AND policy_row.policyname = 'Shared select kategoriler'
      AND policy_row.qual ILIKE '%is_active IS TRUE%'
      AND policy_row.qual ILIKE '%etkin_yetki_v2%'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'public'
      AND policy_row.tablename = 'cari_ekstre_links'
      AND policy_row.policyname = 'cari_ekstre_links_select'
      AND policy_row.qual ILIKE '%customer.is_active IS TRUE%'
  )
  OR pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.ekstre_link_iptal(uuid,uuid)')
  ) NOT ILIKE '%customer.is_active IS TRUE%'
  THEN
    RAISE EXCEPTION 'PERMISSION_V2_POSTCONDITION_POLICY_OR_TRIGGER'
      USING ERRCODE = '55000';
  END IF;
END;
$postcondition$;

COMMIT;
