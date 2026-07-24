-- =============================================================================
-- TAKSİT + VADE TEK MOTORA — Aşama 1 (birleştirme + vade sırası)
-- =============================================================================
-- SORUN (muhasebe denetimi §1): aynı taksitin kalanı iki motordan hesaplanıyordu —
--   Taksit Takip/PDF: islem_tahsis defteri (Model A, vade-ASC)
--   cari/Vade yüzeyleri: _vade_birim_mahsuplu (Model B, net-bakiye, tx_date-DESC)
-- → aynı taksit bir ekranda "ödendi", öbüründe "vadesi geçti" çıkabiliyordu.
--
-- ÇÖZÜM: TEK motor = net-bakiye (_vade_birim_mahsuplu). Herkes ondan türer.
--   1) _vade_birim_mahsuplu sırası tx_date → COALESCE(vade,tx_date) DESC (en-erken-vade
--      önce kapanır; vadesiz faturalar tx_date'e çöker → çoğunlukta geriye-uyumlu).
--      + opsiyonel p_cari_id (cari-scope perf; PARTITION zaten cari-başına).
--   2) get_cari_islem_kalan = _vade_birim_mahsuplu'nun islem_id bazlı SUM'ı →
--      fatura-total = Σbirim İNŞA GEREĞİ → cari-satır ile Vade/Taksit asla çelişemez.
--   3) get_taksit_plan_listesi = net-bakiyeden (islem_tahsis okumaz).
--
-- Salt-okunur/STABLE, additive. PROD doğrulaması: yeni sıra Σ'yı her caride birebir
-- korur (bakiye-tutarlı); tüm PROD'da yalnız 2 test carisi davranış değiştirdi.
--
-- hedef_islem_id kolonu Aşama 2 (hedefli ödeme) için eklendi; bu aşamada ATIL.
-- =============================================================================

-- 0) Hedefleme pointer'ı (Aşama 2'de kullanılacak — niyet-sakla-tutar-sakla-ma).
ALTER TABLE public.islemler
  ADD COLUMN IF NOT EXISTS hedef_islem_id uuid REFERENCES public.islemler(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 1) _vade_birim_mahsuplu — vade sırası + opsiyonel p_cari_id
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._vade_birim_mahsuplu(uuid);

CREATE FUNCTION public._vade_birim_mahsuplu(p_isletme_id uuid, p_cari_id uuid DEFAULT NULL)
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
      COALESCE(tk.tutar, i.amount) AS birim_tutar,
      GREATEST(0, -c.balance) AS net_borc,     -- balance<0 = biz borçluyuz
      GREATEST(0,  c.balance) AS net_alacak    -- balance>0 = onlar bize borçlu
    FROM islemler i
    JOIN cariler c ON c.id = i.cari_id
    LEFT JOIN taksitler tk ON tk.islem_id = i.id AND tk.isletme_id = i.isletme_id
    WHERE i.isletme_id = p_isletme_id
      AND i.cari_id IS NOT NULL
      AND i.type IN ('cari_satis', 'cari_alis')
      AND (p_cari_id IS NULL OR i.cari_id = p_cari_id)
      -- Vade filtresi YOK: net'in doğru dağılması için vadesiz faturalar da katılır.
  ),
  recon AS (
    SELECT b.*,
      (CASE WHEN b.type = 'cari_alis' THEN b.net_borc ELSE b.net_alacak END) AS net_dir,
      -- EN ERKEN VADE ÖNCE KAPANIR: COALESCE(vade,tx_date) DESC → geç-vadeli önce (dolu
      -- kalır), erken-vadeli sonda (net tükenince 0). Vadesiz → tx_date (mevcut davranış).
      -- Fatura-total = Σbirim için get_cari_islem_kalan bu fonksiyonu SUM'lar (tek aritmetik).
      SUM(b.birim_tutar) OVER (
        PARTITION BY b.cari_id, b.type
        ORDER BY COALESCE(b.vade, b.tx_date) DESC NULLS LAST,
                 b.tx_date DESC, b.created_at DESC, b.islem_id DESC, b.taksit_id DESC
      ) AS cum_incl
    FROM birim b
  )
  SELECT
    cari_id, islem_id, taksit_id, type, description, cari_name, currency,
    taksit_sira, taksit_toplam, vade,
    GREATEST(0, LEAST(birim_tutar, net_dir - (cum_incl - birim_tutar)))::numeric AS real_kalan
  FROM recon;
$function$;

REVOKE EXECUTE ON FUNCTION public._vade_birim_mahsuplu(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) get_cari_islem_kalan — _vade_birim_mahsuplu üstünde islem_id bazlı SUM
--    (fatura-satır kalanı = o faturanın birimlerinin toplamı → Vade/Taksit ile
--    birebir tutarlı; ayrı bir aritmetik YOK).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cari_islem_kalan(p_isletme_id uuid, p_cari_id uuid)
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

  SELECT COALESCE(
    jsonb_object_agg(islem_id::text, kalan) FILTER (WHERE kalan > 0.009),
    '{}'::jsonb
  ) INTO v_result
  FROM (
    SELECT islem_id, round(SUM(real_kalan), 2) AS kalan
    FROM public._vade_birim_mahsuplu(p_isletme_id, p_cari_id)
    GROUP BY islem_id
  ) x;

  RETURN v_result;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 3) get_taksit_plan_listesi — net-bakiyeden (Model A/islem_tahsis okumaz).
--    Per-taksit kalan _vade_birim_mahsuplu'dan; ödenen = toplam − Σkalan.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_taksit_plan_listesi(p_isletme_id uuid)
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

  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'sonraki_vade') ASC NULLS LAST), '[]'::jsonb)
  INTO v_result
  FROM (
    WITH vb AS (
      SELECT islem_id, taksit_id, real_kalan
      FROM public._vade_birim_mahsuplu(p_isletme_id)
      WHERE taksit_id IS NOT NULL
    )
    SELECT jsonb_build_object(
      'plan_id', tp.id,
      'islem_id', tp.islem_id,
      'cari_id', tp.cari_id,
      'cari_name', c.name,
      'currency', COALESCE(c.currency, 'TRY'),
      'type', i.type,
      'islem_date', i.date,
      'toplam', round(i.amount, 2),
      'taksit_adedi', tp.taksit_adedi,
      'odenen', round(i.amount - COALESCE((SELECT SUM(vb.real_kalan) FROM vb WHERE vb.islem_id = tp.islem_id), 0), 2),
      'odenen_taksit_adedi', (
        SELECT COUNT(*) FROM taksitler tk
        LEFT JOIN vb ON vb.taksit_id = tk.id
        WHERE tk.plan_id = tp.id AND COALESCE(vb.real_kalan, 0) <= 0.009
      ),
      'sonraki_vade', (
        SELECT MIN(tk.vade_tarihi) FROM taksitler tk
        JOIN vb ON vb.taksit_id = tk.id
        WHERE tk.plan_id = tp.id AND vb.real_kalan > 0.009
      ),
      'gecikmis_adet', (
        SELECT COUNT(*) FROM taksitler tk
        JOIN vb ON vb.taksit_id = tk.id
        WHERE tk.plan_id = tp.id AND tk.vade_tarihi <= v_bugun AND vb.real_kalan > 0.009
      )
    ) AS x
    FROM taksit_planlari tp
    JOIN islemler i ON i.id = tp.islem_id
    JOIN cariler c ON c.id = tp.cari_id
    WHERE tp.isletme_id = p_isletme_id
  ) s;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_taksit_plan_listesi(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_taksit_plan_listesi(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4) get_cari_taksit_kalan — client per-taksit net-bakiye kalanı (islem_tahsis'in
--    client-side okunmasının yerine). _vade_birim_mahsuplu'nun taksit birimleri.
--    p_cari_id NULL → işletme geneli (useBuAyTaksitOzeti); dolu → cari (detay/özet).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cari_taksit_kalan(p_isletme_id uuid, p_cari_id uuid DEFAULT NULL)
RETURNS TABLE (islem_id uuid, taksit_id uuid, vade date, type text, real_kalan numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $function$
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT vb.islem_id, vb.taksit_id, vb.vade, vb.type, round(vb.real_kalan, 2)
    FROM public._vade_birim_mahsuplu(p_isletme_id, p_cari_id) vb
    WHERE vb.taksit_id IS NOT NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_cari_taksit_kalan(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cari_taksit_kalan(uuid, uuid) TO authenticated;
