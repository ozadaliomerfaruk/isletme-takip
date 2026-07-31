-- =============================================================================
-- ACIL GERI ALMA — get_cari_islem_satirlari_v1
-- =============================================================================
-- Bu dosya NORMAL deployment adimi degildir.
--
-- Yalniz su iki kosul birlikte dogrulandiysa ileri yonlu bir migration olarak
-- uygulanabilir:
--   1) 20260729081914 sonrasinda yeni RPC'de owner/shared akisini bozan bir
--      production sorunu bulundu;
--   2) Bu RPC'yi zorunlu kullanan istemci henuz yayinlanmadi veya ayni release'te
--      eski okuma yoluna kontrollu fallback/hotfix hazir.
--
-- Kullanici verisine DML yapmaz; tablo, kolon, policy ve satir degistirmez.
-- Yalniz yeni fonksiyon yuzeyini kaldirir. Yeni client yayildiktan sonra tek
-- basina calistirilmasi bos/hata veren cari detaylari uretebilir.
--
-- Canli post-deploy definition MD5:
--   87624d7c96d6d3ed293759accf079a32
-- =============================================================================

BEGIN;

DO $fallback_guard$
DECLARE
  v_oid oid;
  v_hash text;
  v_dependents integer;
BEGIN
  v_oid := pg_catalog.to_regprocedure(
    'public.get_cari_islem_satirlari_v1(uuid,uuid,integer,timestamp without time zone,timestamp with time zone,uuid)'
  );

  IF v_oid IS NULL THEN
    RAISE EXCEPTION
      'get_cari_islem_satirlari_v1 fallback: exact fonksiyon bulunamadi'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.md5(pg_catalog.pg_get_functiondef(v_oid))
    INTO v_hash;

  IF v_hash IS DISTINCT FROM '87624d7c96d6d3ed293759accf079a32' THEN
    RAISE EXCEPTION
      'get_cari_islem_satirlari_v1 fallback: beklenmeyen body hash (beklenen %, bulunan %)',
      '87624d7c96d6d3ed293759accf079a32',
      COALESCE(v_hash, '<yok>')
      USING ERRCODE = '55000';
  END IF;

  IF NOT (
    SELECT
      p.prosecdef
      AND p.provolatile = 's'
      AND p.proconfig = ARRAY['search_path=pg_catalog']::text[]
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      AND p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}'
    FROM pg_catalog.pg_proc AS p
    WHERE p.oid = v_oid
  ) THEN
    RAISE EXCEPTION
      'get_cari_islem_satirlari_v1 fallback: owner/security/ACL drift'
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*)
    INTO v_dependents
  FROM pg_catalog.pg_depend AS dependency
  WHERE dependency.refclassid = 'pg_catalog.pg_proc'::pg_catalog.regclass
    AND dependency.refobjid = v_oid
    AND dependency.deptype IN ('n', 'a', 'i', 'e');

  IF v_dependents <> 0 THEN
    RAISE EXCEPTION
      'get_cari_islem_satirlari_v1 fallback: % katalog bagimliligi var',
      v_dependents
      USING ERRCODE = '55000';
  END IF;
END;
$fallback_guard$;

REVOKE ALL
ON FUNCTION public.get_cari_islem_satirlari_v1(
  uuid,
  uuid,
  integer,
  timestamp without time zone,
  timestamp with time zone,
  uuid
)
FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION public.get_cari_islem_satirlari_v1(
  uuid,
  uuid,
  integer,
  timestamp without time zone,
  timestamp with time zone,
  uuid
);

COMMIT;
