-- =============================================================================
-- VADE YÜZEYLERİNİ de İŞLEM-TARİHİ FIFO'suna BİRLEŞTİR
-- =============================================================================
-- SORUN: _vade_birim_mahsuplu yalnız VADELİ kalemleri, VADE sırasıyla, ham-FIFO-defteri
-- kalanı tavanıyla dağıtıyordu. Sonuç: cari-satır (get_cari_islem_kalan, işlem-tarihi FIFO)
-- 35k faturayı 10.000 gösterirken Vade Takip/rozet/özet 26.500 gösteriyordu (tutarsız).
--
-- ÇÖZÜM: _vade_birim_mahsuplu artık TÜM cari_alis/satis kalemlerini reconciliation'a alır
-- (işlem tarihi DESC → en yeni fatura dolu kalanı taşır, en eski önce kapanır), tavan =
-- birim TUTARI (islem_tahsis'e bakmaz). get_cari_islem_kalan ile AYNI fatura sıralaması
-- (tx_date, created_at, id) → iki yüzey birebir tutarlı. Taksit birimleri fatura içinde
-- vadeye göre bölünür (en geç vade kalanı taşır). Vade yüzeyleri (rozet/liste/özet/detay)
-- yalnız vade IS NOT NULL olanları gösterir. Salt-okunur/STABLE, geri alınabilir.
-- =============================================================================

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
      i.date AS tx_date,
      i.created_at,
      -- Tavan = birim tutarı (taksit birimi ise tk.tutar, değilse fatura amount). Ham
      -- FIFO-defteri kalanı DEĞİL → temiz, öngörülebilir dağıtım (islem_tahsis'ten bağımsız).
      COALESCE(tk.tutar, i.amount) AS birim_tutar,
      GREATEST(0, -c.balance) AS net_borc,     -- balance<0 = biz borçluyuz
      GREATEST(0,  c.balance) AS net_alacak    -- balance>0 = onlar bize borçlu
    FROM islemler i
    JOIN cariler c ON c.id = i.cari_id
    LEFT JOIN taksitler tk ON tk.islem_id = i.id AND tk.isletme_id = i.isletme_id
    WHERE i.isletme_id = p_isletme_id
      AND i.cari_id IS NOT NULL
      AND i.type IN ('cari_satis', 'cari_alis')
      -- Vade filtresi YOK: net'in doğru dağılması için VADESİZ faturalar da katılır
      -- (onlar daha yeni ise net'i önce onlar taşır). Gösterimde vade IS NOT NULL süzülür.
  ),
  recon AS (
    SELECT b.*,
      (CASE WHEN b.type = 'cari_alis' THEN b.net_borc ELSE b.net_alacak END) AS net_dir,
      -- Fatura sıralaması get_cari_islem_kalan ile AYNI: tx_date, created_at, islem_id.
      -- Fatura İÇİNDE (taksit birimleri) vade DESC → en geç taksit kalanı taşır.
      SUM(b.birim_tutar) OVER (
        PARTITION BY b.cari_id, b.type
        ORDER BY b.tx_date DESC, b.created_at DESC, b.islem_id DESC,
                 b.vade DESC NULLS LAST, b.taksit_id DESC
      ) AS cum_incl
    FROM birim b
  )
  SELECT
    cari_id, islem_id, taksit_id, type, description, cari_name, currency,
    taksit_sira, taksit_toplam, vade,
    GREATEST(0, LEAST(birim_tutar, net_dir - (cum_incl - birim_tutar)))::numeric AS real_kalan
  FROM recon;
$function$;

REVOKE EXECUTE ON FUNCTION public._vade_birim_mahsuplu(uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tüketiciler: artık VADESİZ kalemler de _vade_birim_mahsuplu'dan geldiği için
-- vade yüzeyleri "vade IS NOT NULL" ile süzülür (yalnız gerçek vadeli kalemler).
-- -----------------------------------------------------------------------------

-- 1) get_cari_vade_rozet
CREATE OR REPLACE FUNCTION public.get_cari_vade_rozet(p_isletme_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE
AS $function$
DECLARE
  v_bugun date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  WITH acik AS (
    SELECT * FROM public._vade_birim_mahsuplu(p_isletme_id)
    WHERE real_kalan > 0 AND vade IS NOT NULL
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

-- 2) get_vade_listesi
CREATE OR REPLACE FUNCTION public.get_vade_listesi(p_isletme_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE
AS $function$
DECLARE v_result jsonb;
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
    WHERE m.real_kalan > 0 AND m.vade IS NOT NULL
  ) x;

  RETURN v_result;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_vade_listesi(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vade_listesi(uuid) TO authenticated;

-- 3) get_vade_ozet
CREATE OR REPLACE FUNCTION public.get_vade_ozet(p_isletme_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE
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
    WHERE real_kalan > 0 AND vade IS NOT NULL
    GROUP BY currency
  ) s;

  RETURN v_result;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_vade_ozet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vade_ozet(uuid) TO authenticated;

-- 4) get_cari_vade_detay (gecikenler akordiyonu)
CREATE OR REPLACE FUNCTION public.get_cari_vade_detay(p_isletme_id uuid, p_cari_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.vade ASC, x.taksit_sira ASC NULLS FIRST), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT m.islem_id, m.taksit_id, m.type, m.description, m.vade,
           m.real_kalan AS kalan, m.taksit_sira, m.taksit_toplam
    FROM public._vade_birim_mahsuplu(p_isletme_id) m
    WHERE m.cari_id = p_cari_id AND m.real_kalan > 0 AND m.vade IS NOT NULL
  ) x;

  RETURN v_result;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_cari_vade_detay(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cari_vade_detay(uuid, uuid) TO authenticated;
