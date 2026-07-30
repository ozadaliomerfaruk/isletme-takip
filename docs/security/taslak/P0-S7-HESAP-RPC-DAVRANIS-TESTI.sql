-- =============================================================================
-- P0-S7 HESAP ISLEM PROJECTION -- IZOLE POSTGRES DAVRANIS TESTI
-- =============================================================================
-- URETIMDE CALISTIRMA.
--
-- Bu dosya bos bir PostgreSQL 15/17 veritabaninda minimal sentetik sema kurar,
-- gercek migration dosyasini \ir ile yukler ve owner/shared yetki matrisini
-- ROLLBACK icinde sinar. Uygulama tablosu veya gercek kullanici verisi kullanmaz.
--
-- Repo kokunden:
--   psql -v ON_ERROR_STOP=1 \
--     -f docs/security/taslak/P0-S7-HESAP-RPC-DAVRANIS-TESTI.sql
--
-- Kabul: son satir `P0_S7_ACCOUNT_RPC_BEHAVIOR_OK|<server version>`.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE SCHEMA auth;
CREATE SCHEMA internal;

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
  SELECT NULLIF(
    current_setting('request.jwt.claim.sub', true),
    ''
  )::uuid
$function$;

CREATE TABLE public.isletmeler (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL
);

CREATE TABLE public.isletme_users (
  id uuid PRIMARY KEY,
  isletme_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE public.hesaplar (
  id uuid PRIMARY KEY,
  isletme_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  is_active boolean DEFAULT true,
  is_archived boolean DEFAULT false,
  created_by uuid
);

CREATE TABLE public.kategoriler (
  id uuid PRIMARY KEY,
  isletme_id uuid NOT NULL,
  name text NOT NULL
);

CREATE TABLE public.cariler (
  id uuid PRIMARY KEY,
  isletme_id uuid NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  is_archived boolean DEFAULT false,
  created_by uuid
);

CREATE TABLE public.personel (
  id uuid PRIMARY KEY,
  isletme_id uuid NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  is_active boolean DEFAULT true,
  is_archived boolean DEFAULT false,
  created_by uuid
);

CREATE TABLE public.islemler (
  id uuid PRIMARY KEY,
  isletme_id uuid NOT NULL,
  type text NOT NULL,
  amount numeric NOT NULL,
  description text,
  "date" timestamp without time zone NOT NULL,
  hesap_id uuid,
  hedef_hesap_id uuid,
  kategori_id uuid,
  cari_id uuid,
  personel_id uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  vade_tarihi date,
  photo_path text,
  created_by uuid
);

CREATE INDEX idx_islemler_hesap_date
ON public.islemler (hesap_id, "date" DESC);

CREATE INDEX idx_islemler_hesap
ON public.islemler (hesap_id);

CREATE INDEX idx_islemler_hedef_hesap_date
ON public.islemler (hedef_hesap_id, "date" DESC)
WHERE hedef_hesap_id IS NOT NULL;

-- Uretimdeki kanonik tip esleyicinin fixture kopyasi.
CREATE FUNCTION internal.islem_tipi_modulu(p_type text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
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
    WHEN 'personel_odeme'          THEN ARRAY['personel','hesaplar']
    WHEN 'personel_tahsilat'       THEN ARRAY['personel','hesaplar']
    ELSE NULL
  END
$function$;

-- Fixture yalniz can_view + global own/all alanlarini kullanir. Exact-jsonb
-- boolean kurali ve aktif uyelik/owner semantigi uretim resolveriyla aynidir.
CREATE FUNCTION internal.etkin_yetki(
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
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_permissions jsonb;
  v_view boolean := false;
  v_all boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, false, false, false, false, false, false;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.isletmeler
    WHERE id = p_isletme_id
      AND user_id = v_uid
  ) THEN
    RETURN QUERY SELECT true, true, true, true, true, true, true;
    RETURN;
  END IF;

  SELECT uye.permissions
  INTO v_permissions
  FROM public.isletme_users AS uye
  WHERE uye.isletme_id = p_isletme_id
    AND uye.user_id = v_uid
    AND uye.status = 'active'
  LIMIT 1;

  IF v_permissions IS NULL THEN
    RETURN QUERY SELECT false, false, false, false, false, false, false;
    RETURN;
  END IF;

  IF p_modul = 'birikim' THEN
    v_view :=
      v_permissions->'modules'->'hesaplar' = 'true'::jsonb
      AND v_permissions->'modules'->'birikim' = 'true'::jsonb;
  ELSE
    v_view :=
      v_permissions->'modules'->p_modul = 'true'::jsonb;
  END IF;
  v_all :=
    v_permissions->'visibility'->'can_see_all_users_data'
      = 'true'::jsonb;

  RETURN QUERY
  SELECT v_view, false, false, false, false, false, v_all;
END;
$function$;

\ir ../../../supabase/migrations/20260729182030_add_hesap_islem_satirlari_v1_rpc.sql

-- ---------------------------------------------------------------------------
-- SENTETIK KIMLIKLER
-- ---------------------------------------------------------------------------
-- isletme   100...001 | cross tenant 100...002
-- owner     200...001 | shared      200...002 | diger creator 200...003
-- ana hesap 300...001 | hedef       300...002 | birikim 300...003
-- arsiv     300...004 | pasif       300...005 | cross   300...006

INSERT INTO public.isletmeler (id, user_id)
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000003'
  );

INSERT INTO public.isletme_users (
  id,
  isletme_id,
  user_id,
  role,
  permissions,
  status
)
VALUES (
  '21000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  'custom',
  '{
    "level":"view",
    "modules":{
      "hesaplar":true,
      "birikim":false,
      "cariler":false,
      "personel":false
    },
    "visibility":{
      "can_see_all_users_data":false,
      "can_see_archived":false,
      "can_see_passive":false
    }
  }'::jsonb,
  'active'
);

INSERT INTO public.hesaplar (
  id,
  isletme_id,
  name,
  type,
  is_active,
  is_archived,
  created_by
)
VALUES
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Ana Kasa',
    'nakit',
    true,
    false,
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Hedef Banka',
    'banka',
    true,
    false,
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'Gizli Birikim',
    'birikim',
    true,
    false,
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    'Arsiv Hesap',
    'nakit',
    true,
    true,
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    'Pasif Hesap',
    'nakit',
    false,
    false,
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000002',
    'Cross Tenant',
    'nakit',
    true,
    false,
    '20000000-0000-4000-8000-000000000003'
  );

INSERT INTO public.kategoriler (id, isletme_id, name)
VALUES (
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Fixture Kategori'
);

INSERT INTO public.cariler (
  id,
  isletme_id,
  name,
  created_by
)
VALUES (
  '50000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Fixture Cari',
  '20000000-0000-4000-8000-000000000002'
);

INSERT INTO public.personel (
  id,
  isletme_id,
  first_name,
  last_name,
  created_by
)
VALUES (
  '60000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Fixture',
  'Personel',
  '20000000-0000-4000-8000-000000000002'
);

-- Ana hesap: 10 izinli bilinen tip, bir non-transfer hedef-only bozuk satir ve
-- bir bilinmeyen tip. Son iki satir her rolde deny olmalidir.
INSERT INTO public.islemler (
  id,
  isletme_id,
  type,
  amount,
  description,
  "date",
  hesap_id,
  hedef_hesap_id,
  kategori_id,
  cari_id,
  personel_id,
  created_at,
  updated_at,
  source_currency,
  target_currency,
  exchange_rate,
  created_by
)
VALUES
  ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','gelir',101,'own gelir','2026-07-29 12:12','30000000-0000-4000-8000-000000000001',NULL,'40000000-0000-4000-8000-000000000001',NULL,NULL,'2026-07-29 09:12+00','2026-07-29 09:12+00','TRY',NULL,NULL,'20000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','gelir',102,'peer gelir','2026-07-29 12:11','30000000-0000-4000-8000-000000000001',NULL,NULL,NULL,NULL,'2026-07-29 09:11+00','2026-07-29 09:11+00','TRY',NULL,NULL,'20000000-0000-4000-8000-000000000003'),
  ('70000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','gider',103,'own gider','2026-07-29 12:10','30000000-0000-4000-8000-000000000001',NULL,NULL,NULL,NULL,'2026-07-29 09:10+00','2026-07-29 09:10+00','TRY',NULL,NULL,'20000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','cari_odeme',104,'own cari','2026-07-29 12:09','30000000-0000-4000-8000-000000000001',NULL,NULL,'50000000-0000-4000-8000-000000000001',NULL,'2026-07-29 09:09+00','2026-07-29 09:09+00','TRY',NULL,NULL,'20000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','cari_tahsilat',105,'peer cari','2026-07-29 12:08','30000000-0000-4000-8000-000000000001',NULL,NULL,'50000000-0000-4000-8000-000000000001',NULL,'2026-07-29 09:08+00','2026-07-29 09:08+00','TRY',NULL,NULL,'20000000-0000-4000-8000-000000000003'),
  ('70000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','personel_odeme',106,'own personel','2026-07-29 12:07','30000000-0000-4000-8000-000000000001',NULL,NULL,NULL,'60000000-0000-4000-8000-000000000001','2026-07-29 09:07+00','2026-07-29 09:07+00','TRY',NULL,NULL,'20000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','personel_tahsilat',107,'peer personel','2026-07-29 12:06','30000000-0000-4000-8000-000000000001',NULL,NULL,NULL,'60000000-0000-4000-8000-000000000001','2026-07-29 09:06+00','2026-07-29 09:06+00','TRY',NULL,NULL,'20000000-0000-4000-8000-000000000003'),
  ('70000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001','transfer',108,'source transfer','2026-07-29 12:05','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',NULL,NULL,NULL,'2026-07-29 09:05+00','2026-07-29 09:05+00','TRY','TRY',1,'20000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001','transfer',109,'target transfer','2026-07-29 12:04','30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',NULL,NULL,NULL,'2026-07-29 09:04+00','2026-07-29 09:04+00','TRY','TRY',1,'20000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','gelir',110,'non-transfer target','2026-07-29 12:03','30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',NULL,NULL,NULL,'2026-07-29 09:03+00','2026-07-29 09:03+00','TRY',NULL,NULL,'20000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','transfer',111,'self transfer','2026-07-29 12:02','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',NULL,NULL,NULL,'2026-07-29 09:02+00','2026-07-29 09:02+00','TRY','TRY',1,'20000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','future_unknown',112,'unknown deny','2026-07-29 12:01','30000000-0000-4000-8000-000000000001',NULL,NULL,NULL,NULL,'2026-07-29 09:01+00','2026-07-29 09:01+00','TRY',NULL,NULL,'20000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','gelir',113,'birikim row','2026-07-29 11:59','30000000-0000-4000-8000-000000000003',NULL,NULL,NULL,NULL,'2026-07-29 08:59+00','2026-07-29 08:59+00','TRY',NULL,NULL,'20000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000001','gelir',114,'archive row','2026-07-29 11:58','30000000-0000-4000-8000-000000000004',NULL,NULL,NULL,NULL,'2026-07-29 08:58+00','2026-07-29 08:58+00','TRY',NULL,NULL,'20000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000015','10000000-0000-4000-8000-000000000001','gelir',115,'passive row','2026-07-29 11:57','30000000-0000-4000-8000-000000000005',NULL,NULL,NULL,NULL,'2026-07-29 08:57+00','2026-07-29 08:57+00','TRY',NULL,NULL,'20000000-0000-4000-8000-000000000002'),
  -- Ayni date + created_at: keyset'in id tie-breaker'i skip/duplicate yapmamali.
  ('70000000-0000-4000-8000-000000000016','10000000-0000-4000-8000-000000000001','gelir',116,'cursor tie A','2026-07-29 13:00','30000000-0000-4000-8000-000000000001',NULL,NULL,NULL,NULL,'2026-07-29 10:00+00','2026-07-29 10:00+00','TRY',NULL,NULL,'20000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000017','10000000-0000-4000-8000-000000000001','gelir',117,'cursor tie B','2026-07-29 13:00','30000000-0000-4000-8000-000000000001',NULL,NULL,NULL,NULL,'2026-07-29 10:00+00','2026-07-29 10:00+00','TRY',NULL,NULL,'20000000-0000-4000-8000-000000000002');

-- Server projection yalniz exact tenant/islem canonical pointerini dondurmeli.
UPDATE public.islemler
SET photo_path = CASE id
  WHEN '70000000-0000-4000-8000-000000000001'::uuid
    THEN '10000000-0000-4000-8000-000000000001/70000000-0000-4000-8000-000000000001_1722250000000.webp'
  WHEN '70000000-0000-4000-8000-000000000002'::uuid
    THEN 'receipts/example.jpg'
END
WHERE id IN (
  '70000000-0000-4000-8000-000000000001'::uuid,
  '70000000-0000-4000-8000-000000000002'::uuid
);

CREATE TEMP TABLE p0s7_fixture_before AS
SELECT
  count(*)::bigint AS row_count,
  md5(
    string_agg(
      concat_ws(
        '|',
        id::text,
        isletme_id::text,
        type,
        amount::text,
        "date"::text,
        COALESCE(hesap_id::text, ''),
        COALESCE(hedef_hesap_id::text, ''),
        COALESCE(created_by::text, ''),
        COALESCE(photo_path, '')
      ),
      E'\n'
      ORDER BY id
    )
  ) AS row_hash
FROM public.islemler;

CREATE FUNCTION pg_temp.assert_count(
  p_label text,
  p_expected bigint,
  p_sql text
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_actual bigint;
BEGIN
  EXECUTE p_sql INTO v_actual;
  IF v_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION
      '%: beklenen %, bulunan %',
      p_label,
      p_expected,
      v_actual;
  END IF;
END;
$function$;

CREATE FUNCTION pg_temp.assert_sqlstate(
  p_label text,
  p_expected text,
  p_sql text
)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = p_expected THEN
      RETURN;
    END IF;
    RAISE EXCEPTION
      '%: beklenen SQLSTATE %, bulunan % (%)',
      p_label,
      p_expected,
      SQLSTATE,
      SQLERRM;
  END;
  RAISE EXCEPTION '%: hata bekleniyordu fakat sorgu basarili', p_label;
END;
$function$;

CREATE FUNCTION pg_temp.assert_plan_uses(
  p_label text,
  p_index_name text,
  p_sql text
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_plan json;
BEGIN
  EXECUTE 'EXPLAIN (FORMAT JSON) ' || p_sql INTO v_plan;
  IF v_plan::text NOT LIKE '%' || p_index_name || '%' THEN
    RAISE EXCEPTION
      '%: plan % indeksini kullanmadi: %',
      p_label,
      p_index_name,
      v_plan;
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- OWNER
-- ---------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000001',
  true
);
SELECT pg_temp.assert_count(
  'owner tum izinli tipleri gorur; target-only/unknown deny',
  12,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      50, NULL, NULL, NULL
    )
  $sql$
);
SELECT pg_temp.assert_count(
  'canonical photo pointer korunur',
  1,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      50, NULL, NULL, NULL
    )
    WHERE id = '70000000-0000-4000-8000-000000000001'
      AND photo_path =
        '10000000-0000-4000-8000-000000000001/70000000-0000-4000-8000-000000000001_1722250000000.webp'
  $sql$
);
SELECT pg_temp.assert_count(
  'malformed photo pointer NULL olur',
  1,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      50, NULL, NULL, NULL
    )
    WHERE id = '70000000-0000-4000-8000-000000000002'
      AND photo_path IS NULL
  $sql$
);

-- ---------------------------------------------------------------------------
-- SHARED: OWN/ALL + H / H+C / H+P
-- ---------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000002',
  true
);
SELECT pg_temp.assert_count(
  'shared own H-only',
  7,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      50, NULL, NULL, NULL
    )
  $sql$
);
SELECT pg_temp.assert_count(
  'H-only cari/personel satirlarini tamamen deny eder',
  0,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      50, NULL, NULL, NULL
    )
    WHERE type LIKE 'cari_%' OR type LIKE 'personel_%'
  $sql$
);

UPDATE public.isletme_users
SET permissions =
  jsonb_set(
    permissions,
    '{visibility,can_see_all_users_data}',
    'true'::jsonb
  )
WHERE id = '21000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_count(
  'shared all H-only',
  8,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      50, NULL, NULL, NULL
    )
  $sql$
);

UPDATE public.isletme_users
SET permissions =
  jsonb_set(permissions, '{modules,cariler}', 'true'::jsonb)
WHERE id = '21000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_count(
  'shared all H+C',
  10,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      50, NULL, NULL, NULL
    )
  $sql$
);

UPDATE public.isletme_users
SET permissions =
  jsonb_set(
    jsonb_set(permissions, '{modules,cariler}', 'false'::jsonb),
    '{modules,personel}',
    'true'::jsonb
  )
WHERE id = '21000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_count(
  'shared all H+P',
  10,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      50, NULL, NULL, NULL
    )
  $sql$
);

UPDATE public.isletme_users
SET permissions =
  jsonb_set(permissions, '{modules,cariler}', 'true'::jsonb)
WHERE id = '21000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_count(
  'shared all H+C+P',
  12,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      50, NULL, NULL, NULL
    )
  $sql$
);

-- Transfer iki dalda tekrar etmez; inbound satir source_account olarak yonlenir.
SELECT pg_temp.assert_count(
  'self transfer dedup',
  1,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      50, NULL, NULL, NULL
    )
    WHERE id = '70000000-0000-4000-8000-000000000011'
  $sql$
);
SELECT pg_temp.assert_count(
  'inbound transfer yonu',
  1,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      50, NULL, NULL, NULL
    )
    WHERE id = '70000000-0000-4000-8000-000000000009'
      AND counterparty_kind = 'source_account'
      AND counterparty_name = 'Hedef Banka'
  $sql$
);
SELECT pg_temp.assert_count(
  'non-transfer hedef dali deny',
  0,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      50, NULL, NULL, NULL
    )
    WHERE id = '70000000-0000-4000-8000-000000000010'
  $sql$
);

-- Exact output: 18 kolon; yasak kimlikler yok.
SELECT pg_temp.assert_count(
  'exact output kolon sayisi',
  18,
  $sql$
    SELECT count(*)
    FROM jsonb_object_keys(
      (
        SELECT to_jsonb(row_value)
        FROM public.get_hesap_islem_satirlari_v1(
          '10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          1, NULL, NULL, NULL
        ) AS row_value
      )
    )
  $sql$
);
SELECT pg_temp.assert_count(
  'yasak output kolonu yok',
  0,
  $sql$
    SELECT count(*)
    FROM jsonb_object_keys(
      (
        SELECT to_jsonb(row_value)
        FROM public.get_hesap_islem_satirlari_v1(
          '10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          1, NULL, NULL, NULL
        ) AS row_value
      )
    ) AS output_key
    WHERE output_key IN (
      'isletme_id','hesap_id','hedef_hesap_id','cari_id','personel_id',
      'kategori_id','updated_by','source_ileri_id','hedef_islem_id'
    )
  $sql$
);

-- Limit ve cursor.
SELECT pg_temp.assert_count(
  'limit 3',
  3,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      3, NULL, NULL, NULL
    )
  $sql$
);
SELECT pg_temp.assert_count(
  'keyset tie iki sayfada tekrar yok',
  0,
  $sql$
    WITH first_page AS (
      SELECT *
      FROM public.get_hesap_islem_satirlari_v1(
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        1, NULL, NULL, NULL
      )
    ),
    cursor_row AS (
      SELECT *
      FROM first_page
      ORDER BY "date", created_at, id
      LIMIT 1
    ),
    second_page AS (
      SELECT *
      FROM public.get_hesap_islem_satirlari_v1(
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        100,
        (SELECT "date" FROM cursor_row),
        (SELECT created_at FROM cursor_row),
        (SELECT id FROM cursor_row)
      )
    )
    SELECT count(*)
    FROM first_page
    JOIN second_page USING (id)
  $sql$
);
SELECT pg_temp.assert_count(
  'keyset tie iki sayfada skip yok',
  12,
  $sql$
    WITH first_page AS (
      SELECT *
      FROM public.get_hesap_islem_satirlari_v1(
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        1, NULL, NULL, NULL
      )
    ),
    cursor_row AS (
      SELECT * FROM first_page
    ),
    second_page AS (
      SELECT *
      FROM public.get_hesap_islem_satirlari_v1(
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        100,
        (SELECT "date" FROM cursor_row),
        (SELECT created_at FROM cursor_row),
        (SELECT id FROM cursor_row)
      )
    )
    SELECT count(DISTINCT id)
    FROM (
      SELECT id FROM first_page
      UNION ALL
      SELECT id FROM second_page
    ) AS both_pages
  $sql$
);

-- Canli preflight'ta uc indeks de vardir. Fonksiyon iki dali ayri tuttugu ve
-- tarih siraladigi icin temsilci branch sorgulari iki date indeksini
-- kullanabilmelidir; salt hesap_id indeksi de fixture'da canli semayi yansitir.
-- Kucuk fixture'da planner seqscan secmesin diye bu yalniz EXPLAIN kontrolu
-- boyunca enable_seqscan kapatilir.
SET LOCAL enable_seqscan = off;
SELECT pg_temp.assert_plan_uses(
  'source branch',
  'idx_islemler_hesap_date',
  $sql$
    SELECT id
    FROM public.islemler
    WHERE isletme_id = '10000000-0000-4000-8000-000000000001'
      AND hesap_id = '30000000-0000-4000-8000-000000000001'
    ORDER BY "date" DESC
    LIMIT 50
  $sql$
);
SELECT pg_temp.assert_plan_uses(
  'target branch',
  'idx_islemler_hedef_hesap_date',
  $sql$
    SELECT id
    FROM public.islemler
    WHERE isletme_id = '10000000-0000-4000-8000-000000000001'
      AND hedef_hesap_id = '30000000-0000-4000-8000-000000000001'
      AND type = 'transfer'
      AND hesap_id IS DISTINCT FROM
        '30000000-0000-4000-8000-000000000001'::uuid
    ORDER BY "date" DESC
    LIMIT 50
  $sql$
);
SET LOCAL enable_seqscan = on;
SELECT pg_temp.assert_sqlstate(
  'limit 0',
  '22023',
  $sql$
    SELECT *
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      0, NULL, NULL, NULL
    )
  $sql$
);
SELECT pg_temp.assert_sqlstate(
  'limit 101',
  '22023',
  $sql$
    SELECT *
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      101, NULL, NULL, NULL
    )
  $sql$
);
SELECT pg_temp.assert_sqlstate(
  'eksik cursor',
  '22023',
  $sql$
    SELECT *
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      10, '2026-07-29 12:00', NULL, NULL
    )
  $sql$
);

-- ---------------------------------------------------------------------------
-- BIRIKIM / ARSIV / PASIF
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_sqlstate(
  'birikim kapali',
  '42501',
  $sql$
    SELECT *
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000003',
      10, NULL, NULL, NULL
    )
  $sql$
);
UPDATE public.isletme_users
SET permissions =
  jsonb_set(permissions, '{modules,birikim}', 'true'::jsonb)
WHERE id = '21000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_count(
  'birikim acik',
  1,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000003',
      10, NULL, NULL, NULL
    )
  $sql$
);

SELECT pg_temp.assert_sqlstate(
  'arsiv kapali',
  '42501',
  $sql$
    SELECT *
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000004',
      10, NULL, NULL, NULL
    )
  $sql$
);
UPDATE public.isletme_users
SET permissions =
  jsonb_set(
    permissions,
    '{visibility,can_see_archived}',
    'true'::jsonb
  )
WHERE id = '21000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_count(
  'arsiv acik',
  1,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000004',
      10, NULL, NULL, NULL
    )
  $sql$
);

SELECT pg_temp.assert_sqlstate(
  'pasif kapali',
  '42501',
  $sql$
    SELECT *
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000005',
      10, NULL, NULL, NULL
    )
  $sql$
);
UPDATE public.isletme_users
SET permissions =
  jsonb_set(
    permissions,
    '{visibility,can_see_passive}',
    'true'::jsonb
  )
WHERE id = '21000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_count(
  'pasif acik',
  1,
  $sql$
    SELECT count(*)
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000005',
      10, NULL, NULL, NULL
    )
  $sql$
);

-- ---------------------------------------------------------------------------
-- SUSPENDED / CROSS / ANON / UNKNOWN / ACL
-- ---------------------------------------------------------------------------
UPDATE public.isletme_users
SET status = 'suspended'
WHERE id = '21000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_sqlstate(
  'suspended',
  '42501',
  $sql$
    SELECT *
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      10, NULL, NULL, NULL
    )
  $sql$
);
UPDATE public.isletme_users
SET status = 'active'
WHERE id = '21000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_sqlstate(
  'cross tenant account',
  '42501',
  $sql$
    SELECT *
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000006',
      10, NULL, NULL, NULL
    )
  $sql$
);

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.assert_sqlstate(
  'anon/null uid',
  '42501',
  $sql$
    SELECT *
    FROM public.get_hesap_islem_satirlari_v1(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      10, NULL, NULL, NULL
    )
  $sql$
);

SELECT pg_temp.assert_count(
  'unknown mapper deny',
  0,
  $sql$
    SELECT count(*)
    FROM internal.islem_tipi_modulu('future_unknown')
    WHERE internal.islem_tipi_modulu('future_unknown') IS NOT NULL
  $sql$
);

SELECT pg_temp.assert_count(
  'authenticated execute var',
  1,
  $sql$
    SELECT has_function_privilege(
      'authenticated',
      'public.get_hesap_islem_satirlari_v1(uuid,uuid,integer,timestamp without time zone,timestamp with time zone,uuid)',
      'EXECUTE'
    )::integer
  $sql$
);
SELECT pg_temp.assert_count(
  'anon execute yok',
  0,
  $sql$
    SELECT has_function_privilege(
      'anon',
      'public.get_hesap_islem_satirlari_v1(uuid,uuid,integer,timestamp without time zone,timestamp with time zone,uuid)',
      'EXECUTE'
    )::integer
  $sql$
);
SELECT pg_temp.assert_count(
  'service_role execute yok',
  0,
  $sql$
    SELECT has_function_privilege(
      'service_role',
      'public.get_hesap_islem_satirlari_v1(uuid,uuid,integer,timestamp without time zone,timestamp with time zone,uuid)',
      'EXECUTE'
    )::integer
  $sql$
);

DO $assert_fixture_unchanged$
DECLARE
  v_before record;
  v_after record;
BEGIN
  SELECT * INTO STRICT v_before
  FROM p0s7_fixture_before;

  SELECT
    count(*)::bigint AS row_count,
    md5(
      string_agg(
        concat_ws(
          '|',
          id::text,
          isletme_id::text,
          type,
          amount::text,
          "date"::text,
          COALESCE(hesap_id::text, ''),
          COALESCE(hedef_hesap_id::text, ''),
          COALESCE(created_by::text, ''),
          COALESCE(photo_path, '')
        ),
        E'\n'
        ORDER BY id
      )
    ) AS row_hash
  INTO STRICT v_after
  FROM public.islemler;

  IF v_after.row_count IS DISTINCT FROM v_before.row_count
     OR v_after.row_hash IS DISTINCT FROM v_before.row_hash THEN
    RAISE EXCEPTION
      'fixture islem verisi degisti: before=(%,%), after=(%,%)',
      v_before.row_count,
      v_before.row_hash,
      v_after.row_count,
      v_after.row_hash;
  END IF;
END;
$assert_fixture_unchanged$;

SELECT
  'P0_S7_FIXTURE_DATA_UNCHANGED|'
  || row_count::text
  || '|'
  || row_hash
  AS result
FROM p0s7_fixture_before;

SELECT
  'P0_S7_ACCOUNT_RPC_BEHAVIOR_OK|' || current_setting('server_version')
  AS result;

ROLLBACK;
