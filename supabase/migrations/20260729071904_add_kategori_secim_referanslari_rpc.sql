-- =============================================================================
-- Canli migration surumu: 20260729071904
-- P-D / S-09 TAKIP: SHARED KULLANICI ICIN DAR KATEGORI SECIM REFERANSLARI
-- =============================================================================
-- AMAC
--   Kategori yonetimi owner-only kalirken, acik bir islem kaynak modulu bulunan
--   kullanici kategori secicilerinde yalniz etiket icin gereken alanlari okuyabilsin.
--
-- CIKTI SINIRI
--   Yalniz id + name + type + color doner. Tenant, sahiplik, esleme, parent,
--   audit ve zaman alanlari response'a alinmaz.
--
-- VERI / ESKI CLIENT GUVENLIGI
--   * Yalniz YENI bir fonksiyon eklenir.
--   * Tablo, kolon, policy, trigger, mevcut RPC veya satir degismez.
--   * Migration-time DML/backfill yoktur.
--   * 1.5.x bu yeni RPC'yi bilmez; mevcut kategoriler SELECT akisini aynen
--     kullanmaya devam eder. Temel tablo SELECT'i bu pakette DARALTILMAZ.
--
-- YETKI
--   Kategori, bagimsiz shared modul degildir. P-B kanonik resolver'daki
--   turetilmis `islemler` gorunurlugu en az bir kaynak modulun
--   (hesaplar/cariler/urunler/personel) acik olmasini veya owner olmayi gerektirir.
--   Kategorilerin mevcut shared SELECT sozlesmesi aktif kategorileri butun aktif
--   uyelere aciyordu; bu uc erisimi artirmaz, yalniz kolonlari daraltir.
-- =============================================================================

CREATE FUNCTION public.get_kategori_secim_referanslari(
  p_isletme_id uuid,
  p_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  color text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_can_view boolean := false;
BEGIN
  IF p_isletme_id IS NULL
     OR (
       p_type IS NOT NULL
       AND p_type NOT IN ('gelir', 'gider', 'urun')
     ) THEN
    RAISE EXCEPTION 'CATEGORY_REFERENCE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT permission.can_view
  INTO v_can_view
  FROM internal.etkin_yetki(p_isletme_id, 'islemler') AS permission;

  IF NOT COALESCE(v_can_view, false) THEN
    RAISE EXCEPTION 'CATEGORY_REFERENCE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    kategori.id,
    kategori.name::text,
    kategori.type::text,
    kategori.color::text
  FROM public.kategoriler AS kategori
  WHERE kategori.isletme_id = p_isletme_id
    AND kategori.is_active IS TRUE
    AND (p_type IS NULL OR kategori.type = p_type)
  ORDER BY
    pg_catalog.lower(kategori.name::text),
    kategori.name::text,
    kategori.id;
END;
$function$;

ALTER FUNCTION public.get_kategori_secim_referanslari(uuid, text)
  OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.get_kategori_secim_referanslari(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.get_kategori_secim_referanslari(uuid, text)
TO authenticated;

COMMENT ON FUNCTION public.get_kategori_secim_referanslari(uuid, text) IS
  'Returns active category picker labels (id, name, type, color only) through the canonical permission resolver.';
