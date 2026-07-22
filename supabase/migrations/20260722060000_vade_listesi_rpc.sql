-- Vade Takip sayfası (kullanıcı isteği): işletme genelindeki TÜM açık vadeli
-- birimlerin listesi — plansız vadeli işlemler + taksit birimleri, tek istekte.
-- Rozet RPC'siyle (get_cari_vade_rozet) aynı birim/kalan iskeleti; ek olarak
-- cari adı, açıklama ve taksit sıra/toplam bilgisi döner. Kalanı 0 olan
-- (ödenmiş) birimler listelenmez. jsonb dönüş — additive, eski client'lar
-- bu RPC'yi hiç çağırmaz.
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

  WITH birim AS (
    SELECT
      i.id AS islem_id,
      i.cari_id,
      i.type,
      i.description,
      c.name AS cari_name,
      COALESCE(c.currency, 'TRY') AS currency,
      tk.sira AS taksit_sira,
      CASE WHEN tk.id IS NOT NULL
        THEN (SELECT COUNT(*) FROM taksitler t2 WHERE t2.islem_id = i.id)
        ELSE NULL END AS taksit_toplam,
      COALESCE(tk.vade_tarihi, i.vade_tarihi) AS vade,
      round(COALESCE(tk.tutar, i.amount) - COALESCE((
        SELECT SUM(t.tutar) FROM islem_tahsis t
        WHERE t.borc_islem_id = i.id AND t.taksit_id IS NOT DISTINCT FROM tk.id
      ), 0), 2) AS kalan
    FROM islemler i
    JOIN cariler c ON c.id = i.cari_id
    LEFT JOIN taksitler tk ON tk.islem_id = i.id AND tk.isletme_id = i.isletme_id
    WHERE i.isletme_id = p_isletme_id
      AND (tk.id IS NOT NULL OR i.vade_tarihi IS NOT NULL)
      AND i.type IN ('cari_satis', 'cari_alis')
      AND i.cari_id IS NOT NULL
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.vade ASC, b.taksit_sira ASC NULLS FIRST), '[]'::jsonb)
  INTO v_result
  FROM birim b
  WHERE b.kalan > 0;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_vade_listesi(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vade_listesi(uuid) TO authenticated;
