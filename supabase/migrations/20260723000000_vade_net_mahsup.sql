-- =============================================================================
-- VADE GÖRÜNÜMÜ ↔ NET BAKİYE MAHSUBU (tutarlılık düzeltmesi)
-- =============================================================================
-- SORUN: Vade rozetleri/listeleri/özeti, vadeli kalemlerin HAM FIFO kalanını
-- (amount − ödeme-tahsisi) gösteriyordu. Ama FIFO defteri açılış bakiyesini ve
-- ters-yönlü kalemleri GÖRMEZ (bunlar cariler.balance'a girer, islem_tahsis'e değil).
-- Sonuç: net bakiye 0 iken "vadeli borç 16.500" gibi hayalet vade çıkıyordu.
--
-- İLKE: cariler.balance = TEK gerçek kaynak. TBK mahsup: krediler en eski/gecikmiş
-- borcu ÖNCE kapatır. Bu yüzden net borç, vadeli kalemlere EN YENİ vadeden geriye
-- atanır; fazlalık kredi (açılış vb.) en eski/gecikmiş kalemleri siler.
--
-- ÇÖZÜM: paylaşılan _vade_birim_mahsuplu(p_isletme_id) her vadeli birimin NET'e göre
-- mahsuplu "real_kalan"ını döndürür; 3 RPC (rozet/liste/ozet) bundan beslenir.
-- Salt-okunur/STABLE; bakiyeye/tahsis defterine/backfill'e DOKUNMAZ, geri alınabilir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Paylaşılan: her vadeli birim (plansız işlem veya taksit satırı) için net-mahsuplu
-- real_kalan. net_dir = carinin o yöndeki net borcu/alacağı (balance'tan). cum_incl =
-- (cari,yön) içinde vade DESC (en yeni önce) kümülatif ham kalan → net_dir en yeni
-- kaleme atanır; taşarsa eski/gecikmiş kalemler 0'a düşer.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._vade_birim_mahsuplu(p_isletme_id uuid)
RETURNS TABLE (
  cari_id uuid, islem_id uuid, taksit_id uuid, type text, description text,
  cari_name text, currency text, taksit_sira integer, taksit_toplam integer,
  vade date, real_kalan numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH birim AS (
    SELECT
      i.cari_id,
      i.id AS islem_id,
      tk.id AS taksit_id,
      i.type::text AS type,
      i.description,
      c.name AS cari_name,
      COALESCE(c.currency, 'TRY') AS currency,
      tk.sira AS taksit_sira,
      CASE WHEN tk.id IS NOT NULL
        THEN (SELECT COUNT(*)::integer FROM taksitler t2 WHERE t2.islem_id = i.id)
        ELSE NULL END AS taksit_toplam,
      COALESCE(tk.vade_tarihi, i.vade_tarihi) AS vade,
      round(COALESCE(tk.tutar, i.amount) - COALESCE((
        SELECT SUM(t.tutar) FROM islem_tahsis t
        WHERE t.borc_islem_id = i.id AND t.taksit_id IS NOT DISTINCT FROM tk.id
      ), 0), 2) AS raw_kalan,
      GREATEST(0, -c.balance) AS net_borc,     -- balance<0 = biz borçluyuz
      GREATEST(0,  c.balance) AS net_alacak    -- balance>0 = onlar bize borçlu
    FROM islemler i
    JOIN cariler c ON c.id = i.cari_id
    LEFT JOIN taksitler tk ON tk.islem_id = i.id AND tk.isletme_id = i.isletme_id
    WHERE i.isletme_id = p_isletme_id
      AND i.cari_id IS NOT NULL
      AND i.type IN ('cari_satis', 'cari_alis')
      AND (tk.id IS NOT NULL OR i.vade_tarihi IS NOT NULL)
  ),
  recon AS (
    SELECT b.*,
      (CASE WHEN b.type = 'cari_alis' THEN b.net_borc ELSE b.net_alacak END) AS net_dir,
      SUM(b.raw_kalan) OVER (
        PARTITION BY b.cari_id, b.type
        ORDER BY b.vade DESC, b.islem_id DESC, b.taksit_id DESC
      ) AS cum_incl
    FROM birim b
  )
  SELECT
    cari_id, islem_id, taksit_id, type, description, cari_name, currency,
    taksit_sira, taksit_toplam, vade,
    GREATEST(0, LEAST(raw_kalan, net_dir - (cum_incl - raw_kalan)))::numeric AS real_kalan
  FROM recon;
$function$;

REVOKE EXECUTE ON FUNCTION public._vade_birim_mahsuplu(uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1) get_cari_vade_rozet — cariler listesi rozeti (gecikmiş + en yakın gelecek vade)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cari_vade_rozet(p_isletme_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $function$
DECLARE
  v_bugun date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  WITH acik AS (
    SELECT * FROM public._vade_birim_mahsuplu(p_isletme_id) WHERE real_kalan > 0
  ),
  gecikmis AS (
    SELECT cari_id,
      COALESCE(SUM(real_kalan) FILTER (WHERE type = 'cari_satis'), 0) AS gecikmis_alacak,
      COALESCE(SUM(real_kalan) FILTER (WHERE type = 'cari_alis'), 0)  AS gecikmis_borc,
      COUNT(*) AS gecikmis_adet
    FROM acik WHERE vade <= v_bugun GROUP BY cari_id
  ),
  yakin AS (
    SELECT DISTINCT ON (cari_id) cari_id, vade, real_kalan AS kalan, type
    FROM acik WHERE vade > v_bugun
    ORDER BY cari_id, vade ASC, real_kalan DESC
  ),
  birlesik AS (
    SELECT
      COALESCE(g.cari_id, y.cari_id) AS cari_id,
      COALESCE(g.gecikmis_alacak, 0) AS gecikmis_alacak,
      COALESCE(g.gecikmis_borc, 0)   AS gecikmis_borc,
      COALESCE(g.gecikmis_adet, 0)   AS gecikmis_adet,
      y.vade  AS yakin_vade,
      y.kalan AS yakin_tutar,
      y.type  AS yakin_type
    FROM gecikmis g
    FULL OUTER JOIN yakin y ON y.cari_id = g.cari_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'cari_id', b.cari_id,
    'currency', COALESCE(c.currency, 'TRY'),
    'gecikmis_alacak', b.gecikmis_alacak,
    'gecikmis_borc',   b.gecikmis_borc,
    'gecikmis_adet',   b.gecikmis_adet,
    'yakin_vade',  b.yakin_vade,
    'yakin_tutar', b.yakin_tutar,
    'yakin_yon',   CASE b.yakin_type WHEN 'cari_satis' THEN 'alacak'
                                     WHEN 'cari_alis'  THEN 'borc' END
  )), '[]'::jsonb) INTO v_result
  FROM birlesik b
  JOIN cariler c ON c.id = b.cari_id;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_cari_vade_rozet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cari_vade_rozet(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2) get_vade_listesi — Vade Takip sayfası (açık birimler, net-mahsuplu kalan)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_vade_listesi(p_isletme_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.vade ASC, x.taksit_sira ASC NULLS FIRST), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      m.islem_id, m.cari_id, m.type, m.description, m.cari_name, m.currency,
      m.taksit_sira, m.taksit_toplam, m.vade, m.real_kalan AS kalan
    FROM public._vade_birim_mahsuplu(p_isletme_id) m
    WHERE m.real_kalan > 0
  ) x;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_vade_listesi(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vade_listesi(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3) get_vade_ozet — işletme geneli özet (para birimi bazında, net-mahsuplu)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_vade_ozet(p_isletme_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $function$
DECLARE
  v_bugun date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'currency'), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'currency', currency,
      'gecikmis_alacak',      SUM(real_kalan) FILTER (WHERE type = 'cari_satis' AND vade <= v_bugun),
      'gecikmis_alacak_adet', COUNT(*)        FILTER (WHERE type = 'cari_satis' AND vade <= v_bugun),
      'gecikmis_borc',        SUM(real_kalan) FILTER (WHERE type = 'cari_alis'  AND vade <= v_bugun),
      'gecikmis_borc_adet',   COUNT(*)        FILTER (WHERE type = 'cari_alis'  AND vade <= v_bugun),
      'yaklasan_alacak',      SUM(real_kalan) FILTER (WHERE type = 'cari_satis' AND vade >  v_bugun AND vade <= v_bugun + 7),
      'yaklasan_borc',        SUM(real_kalan) FILTER (WHERE type = 'cari_alis'  AND vade >  v_bugun AND vade <= v_bugun + 7)
    ) AS x
    FROM public._vade_birim_mahsuplu(p_isletme_id)
    WHERE real_kalan > 0
    GROUP BY currency
  ) s;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_vade_ozet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vade_ozet(uuid) TO authenticated;
