-- Cariler listesi yeniden tasarımı: rozet RPC'sine cari başına "en yakın gelecek
-- vade" bilgisi eklenir (yakin_vade / yakin_tutar / yakin_yon). Gecikmişi olmayan
-- ama açık vadeli birimi olan cariler de artık satır döner. jsonb'ye EK key'ler —
-- eski client'lar bilmedikleri alanları yok sayar (additive, backfill yok).
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

  WITH birim AS (
    SELECT i.cari_id, i.type,
      COALESCE(tk.vade_tarihi, i.vade_tarihi) AS vade,
      round(COALESCE(tk.tutar, i.amount) - COALESCE((
        SELECT SUM(t.tutar) FROM islem_tahsis t
        WHERE t.borc_islem_id = i.id AND t.taksit_id IS NOT DISTINCT FROM tk.id
      ), 0), 2) AS kalan
    FROM islemler i
    LEFT JOIN taksitler tk ON tk.islem_id = i.id AND tk.isletme_id = i.isletme_id
    WHERE i.isletme_id = p_isletme_id
      AND (tk.id IS NOT NULL OR i.vade_tarihi IS NOT NULL)
      AND i.type IN ('cari_satis', 'cari_alis')
      AND i.cari_id IS NOT NULL
  ),
  acik AS (
    SELECT * FROM birim WHERE kalan > 0
  ),
  gecikmis AS (
    SELECT cari_id,
      COALESCE(SUM(kalan) FILTER (WHERE type = 'cari_satis'), 0) AS gecikmis_alacak,
      COALESCE(SUM(kalan) FILTER (WHERE type = 'cari_alis'), 0)  AS gecikmis_borc,
      COUNT(*) AS gecikmis_adet
    FROM acik
    WHERE vade <= v_bugun
    GROUP BY cari_id
  ),
  -- Cari başına en yakın GELECEK vadeli açık birim (taksit veya işlem);
  -- aynı günde birden çok birim varsa büyük kalan öne alınır.
  yakin AS (
    SELECT DISTINCT ON (cari_id) cari_id, vade, kalan, type
    FROM acik
    WHERE vade > v_bugun
    ORDER BY cari_id, vade ASC, kalan DESC
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
