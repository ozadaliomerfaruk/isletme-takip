-- Cari detay: o carinin NET-mahsuplu AÇIK vadeli birimleri (plansız işlem + taksit
-- satırları), _vade_birim_mahsuplu'dan beslenir. Cari detay sayfasındaki "gecikenler
-- akordiyonu" bunu kullanır → ham FIFO kalanı yerine net-mahsuplu kalan gösterir; özet
-- kartıyla (Vadesi Geçen/Gelmemiş) TAM tutarlı olur. Salt-okunur/STABLE, additive.
CREATE OR REPLACE FUNCTION public.get_cari_vade_detay(p_isletme_id uuid, p_cari_id uuid)
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
    SELECT m.islem_id, m.taksit_id, m.type, m.description, m.vade,
           m.real_kalan AS kalan, m.taksit_sira, m.taksit_toplam
    FROM public._vade_birim_mahsuplu(p_isletme_id) m
    WHERE m.cari_id = p_cari_id AND m.real_kalan > 0
  ) x;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_cari_vade_detay(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cari_vade_detay(uuid, uuid) TO authenticated;
